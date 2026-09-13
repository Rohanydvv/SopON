import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  CircuitBreakerResponse,
  CircuitBreakerState,
  ErrorCodes,
} from '@sopon/contracts';

export interface LockAcquisitionResult {
  acquired: boolean;
  fencingToken?: number;
  reason?: string;
  expiresAt?: Date;
}

export interface ActionAllowanceResult {
  allowed: boolean;
  state: CircuitBreakerState;
  reason?: string;
  isInCooldown: boolean;
  cooldownEndsAt: Date | null;
  failureStrikes: number;
}

@Injectable()
export class CircuitBreakerService {
  /**
   * Retrieves or initializes the persistent database-backed circuit breaker for a service.
   */
  async getOrCreate(orgId: string, serviceId: string) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, organizationId: orgId },
    });

    if (!service) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: `Service "${serviceId}" not found in organization`,
      });
    }

    let cb = await prisma.serviceCircuitBreaker.findUnique({
      where: { serviceId },
    });

    if (!cb) {
      cb = await prisma.serviceCircuitBreaker.create({
        data: {
          organizationId: orgId,
          serviceId,
          state: 'CLOSED',
          failureStrikes: 0,
          strikeWindowStart: new Date(),
        },
      });
    }

    return cb;
  }

  /**
   * Evaluates whether autonomous action execution is currently allowed for the service.
   */
  async isActionAllowed(orgId: string, serviceId: string): Promise<ActionAllowanceResult> {
    const cb = await this.getOrCreate(orgId, serviceId);
    const now = new Date();

    const isInCooldown = Boolean(cb.cooldownEndsAt && cb.cooldownEndsAt > now);

    if (cb.state === 'OPEN') {
      return {
        allowed: false,
        state: 'OPEN',
        reason: `Service circuit breaker is TRIPPED / OPEN (${cb.trippedReason || '3 consecutive remediation failures'}). Autonomous execution blocked.`,
        isInCooldown,
        cooldownEndsAt: cb.cooldownEndsAt,
        failureStrikes: cb.failureStrikes,
      };
    }

    if (isInCooldown) {
      return {
        allowed: false,
        state: cb.state as CircuitBreakerState,
        reason: `Service is in an active cooldown window until ${cb.cooldownEndsAt?.toISOString()} to prevent flapping.`,
        isInCooldown: true,
        cooldownEndsAt: cb.cooldownEndsAt,
        failureStrikes: cb.failureStrikes,
      };
    }

    return {
      allowed: true,
      state: cb.state as CircuitBreakerState,
      isInCooldown: false,
      cooldownEndsAt: cb.cooldownEndsAt,
      failureStrikes: cb.failureStrikes,
    };
  }

  /**
   * Records a failure strike against the service. Trips to OPEN on threshold breach.
   */
  async recordStrike(
    orgId: string,
    serviceId: string,
    reason: string,
    actionId?: string,
  ): Promise<{ state: CircuitBreakerState; failureStrikes: number; tripped: boolean }> {
    const cb = await this.getOrCreate(orgId, serviceId);
    const policy = await prisma.organizationRemediationPolicy.findUnique({
      where: { organizationId: orgId },
    });

    const strikeThreshold = policy?.circuitBreakerStrikeThreshold ?? 3;
    const windowMinutes = policy?.circuitBreakerWindowMinutes ?? 60;
    const now = new Date();

    // Check if current sliding window has expired
    const windowStartMs = new Date(cb.strikeWindowStart).getTime();
    const windowExpired = now.getTime() - windowStartMs > windowMinutes * 60 * 1000;

    let newStrikes = windowExpired ? 1 : cb.failureStrikes + 1;
    let newWindowStart = windowExpired ? now : cb.strikeWindowStart;
    let newState: CircuitBreakerState = cb.state as CircuitBreakerState;
    let tripped = false;

    if (newStrikes >= strikeThreshold && cb.state !== 'OPEN') {
      newState = 'OPEN';
      tripped = true;
    }

    await prisma.serviceCircuitBreaker.update({
      where: { serviceId },
      data: {
        failureStrikes: newStrikes,
        strikeWindowStart: newWindowStart,
        lastFailureAt: now,
        state: newState,
        trippedAt: tripped ? now : cb.trippedAt,
        trippedReason: tripped ? reason : cb.trippedReason,
        trippedByActionId: tripped ? (actionId || null) : cb.trippedByActionId,
      },
    });

    if (tripped) {
      await prisma.auditLog.create({
        data: {
          organizationId: orgId,
          action: 'CIRCUIT_BREAKER_TRIPPED',
          entityType: 'ServiceCircuitBreaker',
          entityId: cb.id,
          metadataJson: {
            serviceId,
            strikes: newStrikes,
            reason,
            actionId,
          },
        },
      });
    }

    return { state: newState, failureStrikes: newStrikes, tripped };
  }

  /**
   * Sets a persistent per-service cooldown window after an action execution.
   */
  async setCooldown(orgId: string, serviceId: string, cooldownMinutes?: number) {
    await this.getOrCreate(orgId, serviceId);

    if (cooldownMinutes === undefined) {
      const policy = await prisma.organizationRemediationPolicy.findUnique({
        where: { organizationId: orgId },
      });
      cooldownMinutes = policy?.cooldownPeriodMinutes ?? 15;
    }

    const now = new Date();
    const cooldownEndsAt = new Date(now.getTime() + cooldownMinutes * 60 * 1000);

    return prisma.serviceCircuitBreaker.update({
      where: { serviceId },
      data: {
        lastExecutionAt: now,
        cooldownEndsAt,
      },
    });
  }

  /**
   * Manually resets a tripped circuit breaker to CLOSED.
   */
  async manualReset(
    orgId: string,
    serviceId: string,
    actorUserId: string,
    reason: string,
  ): Promise<CircuitBreakerResponse> {
    const member = await prisma.membership.findFirst({
      where: {
        organizationId: orgId,
        userId: actorUserId,
        role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
      },
    });

    if (!member) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Only Organization Owners, Admins, and Managers can reset circuit breakers',
      });
    }

    const cb = await this.getOrCreate(orgId, serviceId);
    const now = new Date();

    const updated = await prisma.serviceCircuitBreaker.update({
      where: { serviceId },
      data: {
        state: 'CLOSED',
        failureStrikes: 0,
        strikeWindowStart: now,
        trippedAt: null,
        trippedReason: null,
        trippedByActionId: null,
        cooldownEndsAt: null,
        manuallyResetAt: now,
        manuallyResetByUserId: actorUserId,
      },
      include: { service: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'CIRCUIT_BREAKER_RESET',
        entityType: 'ServiceCircuitBreaker',
        entityId: cb.id,
        metadataJson: {
          serviceId,
          reason,
          previousState: cb.state,
          previousStrikes: cb.failureStrikes,
        },
      },
    });

    return this.mapToResponse(updated);
  }

  // ---------------------------------------------------------------------------
  // Distributed Mutex & Fencing Token Management
  // ---------------------------------------------------------------------------

  /**
   * Acquires a unique, lease-bounded distributed lock for service mutation.
   */
  async acquireServiceLock(
    orgId: string,
    serviceId: string,
    ownerToken: string,
    ttlMs = 120000,
  ): Promise<LockAcquisitionResult> {
    const cb = await this.getOrCreate(orgId, serviceId);
    const now = new Date();

    // Check if lock is actively held by someone else
    if (cb.lockExpiresAt && cb.lockExpiresAt > now && cb.lockOwnerToken && cb.lockOwnerToken !== ownerToken) {
      return {
        acquired: false,
        reason: `Concurrent action in progress on service "${serviceId}" (held by lock token: ${cb.lockOwnerToken.substring(0, 8)}...)`,
        expiresAt: cb.lockExpiresAt,
      };
    }

    const newExpiresAt = new Date(now.getTime() + ttlMs);
    const nextFencingToken = cb.lockFencingToken + 1;

    await prisma.serviceCircuitBreaker.update({
      where: { serviceId },
      data: {
        lockOwnerToken: ownerToken,
        lockExpiresAt: newExpiresAt,
        lockFencingToken: nextFencingToken,
      },
    });

    return {
      acquired: true,
      fencingToken: nextFencingToken,
      expiresAt: newExpiresAt,
    };
  }

  /**
   * Safely releases a distributed service lock only if owned by the caller token.
   */
  async releaseServiceLock(orgId: string, serviceId: string, ownerToken: string): Promise<boolean> {
    const cb = await prisma.serviceCircuitBreaker.findFirst({
      where: { serviceId, organizationId: orgId },
    });

    if (!cb) return false;

    // Only the actual lock owner can release it
    if (cb.lockOwnerToken === ownerToken) {
      await prisma.serviceCircuitBreaker.update({
        where: { serviceId },
        data: {
          lockOwnerToken: null,
          lockExpiresAt: null,
        },
      });
      return true;
    }

    return false;
  }

  /**
   * Verifies that the worker still holds a valid unexpired lock before performing a mutation.
   */
  async verifyLockOwnership(serviceId: string, ownerToken: string, expectedFencingToken?: number): Promise<boolean> {
    const cb = await prisma.serviceCircuitBreaker.findUnique({
      where: { serviceId },
    });

    if (!cb) return false;
    const now = new Date();

    const isOwner = cb.lockOwnerToken === ownerToken;
    const isNotExpired = Boolean(cb.lockExpiresAt && cb.lockExpiresAt > now);
    const isFencingMatch = expectedFencingToken === undefined || cb.lockFencingToken === expectedFencingToken;

    return isOwner && isNotExpired && isFencingMatch;
  }

  /**
   * Maps database model to API response contract.
   */
  mapToResponse(cb: any): CircuitBreakerResponse {
    const now = new Date();
    const isInCooldown = Boolean(cb.cooldownEndsAt && new Date(cb.cooldownEndsAt) > now);
    const lockActive = Boolean(cb.lockExpiresAt && new Date(cb.lockExpiresAt) > now);
    const isActionAllowed = cb.state !== 'OPEN' && !isInCooldown;

    return {
      id: cb.id,
      organizationId: cb.organizationId,
      serviceId: cb.serviceId,
      serviceSlug: cb.service?.slug,
      serviceName: cb.service?.name,
      state: cb.state as CircuitBreakerState,
      failureStrikes: cb.failureStrikes,
      strikeWindowStart: new Date(cb.strikeWindowStart).toISOString(),
      lastFailureAt: cb.lastFailureAt ? new Date(cb.lastFailureAt).toISOString() : null,
      lastExecutionAt: cb.lastExecutionAt ? new Date(cb.lastExecutionAt).toISOString() : null,
      trippedAt: cb.trippedAt ? new Date(cb.trippedAt).toISOString() : null,
      trippedReason: cb.trippedReason,
      cooldownEndsAt: cb.cooldownEndsAt ? new Date(cb.cooldownEndsAt).toISOString() : null,
      isInCooldown,
      isActionAllowed,
      lockActive,
      lockExpiresAt: cb.lockExpiresAt ? new Date(cb.lockExpiresAt).toISOString() : null,
    };
  }
}
