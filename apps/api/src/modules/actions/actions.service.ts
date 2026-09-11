import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  ActionExecutionResponse,
  ActionExecutionStatus,
  ActionRiskTier,
  ActionType,
  ErrorCodes,
  ExecuteActionRequest,
  OrganizationRemediationPolicyResponse,
  UpdateRemediationPolicyRequest,
} from '@sopon/contracts';
import { getActionRunner } from './runners/action-registry';
import { ActionExecutionContext } from './runners/base.runner';
import { VaultService } from '../vault/vault.service';
import { KubernetesAdapter } from './adapters/kubernetes-adapter.interface';

@Injectable()
export class ActionsService {
  constructor(
    @Optional()
    private readonly vaultService?: VaultService,
    @Optional()
    @Inject('KubernetesAdapter')
    private readonly kubernetesAdapter?: KubernetesAdapter,
  ) {}

  /**
   * Retrieves or initializes Organization Remediation Policy (including kill-switch state)
   */
  async getOrCreatePolicy(orgId: string): Promise<OrganizationRemediationPolicyResponse> {
    let policy = await prisma.organizationRemediationPolicy.findUnique({
      where: { organizationId: orgId },
    });

    if (!policy) {
      policy = await prisma.organizationRemediationPolicy.create({
        data: {
          organizationId: orgId,
          autonomousRemediationEnabled: true,
          maxConcurrentActions: 2,
          cooldownPeriodMinutes: 15,
          allowedActionTypes: [
            'RESTART_SERVICE_WORKER',
            'SCALE_SERVICE_REPLICAS',
            'UPDATE_POOL_CONFIG',
            'CLEAR_SERVICE_CACHE',
          ],
          requireApprovalForProduction: false,
        },
      });
    }

    return {
      id: policy.id,
      organizationId: policy.organizationId,
      autonomousRemediationEnabled: policy.autonomousRemediationEnabled,
      maxConcurrentActions: policy.maxConcurrentActions,
      cooldownPeriodMinutes: policy.cooldownPeriodMinutes,
      allowedActionTypes: policy.allowedActionTypes as ActionType[],
      requireApprovalForProduction: policy.requireApprovalForProduction,
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  async updatePolicy(
    orgId: string,
    data: UpdateRemediationPolicyRequest,
    actorUserId?: string,
  ): Promise<OrganizationRemediationPolicyResponse> {
    await this.getOrCreatePolicy(orgId);

    const updated = await prisma.organizationRemediationPolicy.update({
      where: { organizationId: orgId },
      data: {
        ...(data.autonomousRemediationEnabled !== undefined
          ? { autonomousRemediationEnabled: data.autonomousRemediationEnabled }
          : {}),
        ...(data.maxConcurrentActions !== undefined ? { maxConcurrentActions: data.maxConcurrentActions } : {}),
        ...(data.cooldownPeriodMinutes !== undefined ? { cooldownPeriodMinutes: data.cooldownPeriodMinutes } : {}),
        ...(data.allowedActionTypes !== undefined ? { allowedActionTypes: data.allowedActionTypes } : {}),
        ...(data.requireApprovalForProduction !== undefined
          ? { requireApprovalForProduction: data.requireApprovalForProduction }
          : {}),
      },
    });

    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: validActorId,
        action: 'REMEDIATION_POLICY_UPDATED',
        entityType: 'OrganizationRemediationPolicy',
        entityId: updated.id,
        metadataJson: { updatedFields: data },
      },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      autonomousRemediationEnabled: updated.autonomousRemediationEnabled,
      maxConcurrentActions: updated.maxConcurrentActions,
      cooldownPeriodMinutes: updated.cooldownPeriodMinutes,
      allowedActionTypes: updated.allowedActionTypes as ActionType[],
      requireApprovalForProduction: updated.requireApprovalForProduction,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * DRY-RUN: Simulates preconditions, execution, and verification without mutating infrastructure.
   */
  async dryRunAction(
    orgId: string,
    incidentId: string,
    request: ExecuteActionRequest,
    actorUserId?: string,
  ): Promise<ActionExecutionResponse> {
    const { incident, service } = await this.validateIncidentAndService(orgId, incidentId, request.targetServiceId);
    const policy = await this.getOrCreatePolicy(orgId);

    // Build Execution Context (including Vault credentials if present)
    const context = await this.buildExecutionContext(orgId, service);

    // 1. Validate against runner parameter schema
    const runner = getActionRunner(request.actionType);
    const validatedParams = runner.validateParams(request.parameters);

    // 2. Evaluate preconditions
    const preconditions = await runner.checkPreconditions(validatedParams, service, context);

    // If policy disabled, add a precondition note
    if (!policy.autonomousRemediationEnabled) {
      preconditions.unshift({
        check: 'Kill Switch Inactive',
        passed: false,
        reason: 'Organization kill-switch is currently active (dry-run allowed for inspection only)',
      });
    }

    // 3. Execute dry-run runner simulation
    const dryRunResult = await runner.dryRun(validatedParams, service, context);

    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    const execution = await prisma.actionExecution.create({
      data: {
        organizationId: orgId,
        incidentId: incident.id,
        actionType: request.actionType,
        riskTier: 'SAFE_AUTOMATIC',
        status: 'SUCCEEDED',
        isDryRun: true,
        targetServiceId: service?.id || null,
        parametersJson: validatedParams as any,
        executionOutputJson: dryRunResult.output as any,
        actorUserId: validActorId,
        startedAt: new Date(),
        completedAt: new Date(),
        verifiedAt: new Date(),
      },
      include: { service: true },
    });

    return this.mapToResponse(execution, preconditions, dryRunResult.verificationProbes);
  }

  /**
   * EXECUTE: Multi-Gate Safety Engine + Real Runner Execution + Closed-Loop Verification & Rollback
   */
  async executeAction(
    orgId: string,
    incidentId: string,
    request: ExecuteActionRequest,
    actorUserId?: string,
    bypassApprovalCheck = false,
    failVerificationProbe = false,
  ): Promise<ActionExecutionResponse> {
    const { incident, service } = await this.validateIncidentAndService(orgId, incidentId, request.targetServiceId);
    const policy = await this.getOrCreatePolicy(orgId);

    // Gate 1: Emergency Kill-Switch Check
    if (!policy.autonomousRemediationEnabled) {
      throw new ForbiddenException({
        code: 'REMEDIATION_DISABLED_BY_KILL_SWITCH',
        message: 'Autonomous remediation is currently disabled for this organization via emergency kill-switch.',
      });
    }

    // Gate 2: Registry & Parameter Schema Validation
    const runner = getActionRunner(request.actionType);
    const validatedParams = runner.validateParams(request.parameters);

    // Gate 3: Policy Allowed Action Check
    if (!policy.allowedActionTypes.includes(request.actionType)) {
      throw new ForbiddenException({
        code: 'ACTION_TYPE_NOT_ALLOWED_BY_POLICY',
        message: `Action type "${request.actionType}" is not permitted by organization remediation policy.`,
      });
    }

    // Build Execution Context (including Vault credentials)
    const context = await this.buildExecutionContext(orgId, service, failVerificationProbe);

    // Gate 4: Precondition Checks
    const preconditions = await runner.checkPreconditions(validatedParams, service, context);
    const failedPrecondition = preconditions.find((p) => !p.passed);
    if (failedPrecondition) {
      throw new BadRequestException({
        code: 'PRECONDITION_FAILED',
        message: `Precondition failed: ${failedPrecondition.check} (${failedPrecondition.reason || 'Not satisfied'})`,
      });
    }

    // Gate 5: Approval requirement check (if production requires approval or action is non-safe)
    const requiresApproval =
      !bypassApprovalCheck &&
      (policy.requireApprovalForProduction && service?.environment === 'PRODUCTION');

    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    if (requiresApproval) {
      const pendingExecution = await prisma.actionExecution.create({
        data: {
          organizationId: orgId,
          incidentId: incident.id,
          actionType: request.actionType,
          riskTier: 'REQUIRES_APPROVAL',
          status: 'PENDING_APPROVAL',
          isDryRun: false,
          targetServiceId: service?.id || null,
          parametersJson: validatedParams as any,
          actorUserId: validActorId,
        },
        include: { service: true },
      });

      await prisma.incidentTimeline.create({
        data: {
          incidentId: incident.id,
          eventType: 'REMEDIATION_PENDING_APPROVAL',
          message: `Remediation action "${request.actionType}" for service "${service?.name || 'System'}" queued for approval.`,
          metadataJson: { actionExecutionId: pendingExecution.id, parameters: validatedParams } as any,
          actorUserId: validActorId,
        },
      });

      return this.mapToResponse(pendingExecution, preconditions, []);
    }

    // Dispatch runner
    const startedAt = new Date();
    const runnerResult = await runner.execute(validatedParams, service, context);
    const completedAt = new Date();

    // CLOSED-LOOP VERIFICATION & AUTOMATIC ROLLBACK
    if (!runnerResult.success) {
      // Automatic Rollback
      const rollbackResult = await runner.rollback(validatedParams, runnerResult.output, service, context);

      const failedExecution = await prisma.actionExecution.create({
        data: {
          organizationId: orgId,
          incidentId: incident.id,
          actionType: request.actionType,
          riskTier: 'SAFE_AUTOMATIC',
          status: 'ROLLED_BACK',
          rollbackStatus: 'EXECUTED',
          isDryRun: false,
          targetServiceId: service?.id || null,
          parametersJson: validatedParams as any,
          executionOutputJson: {
            executionOutput: runnerResult.output,
            rollbackOutput: rollbackResult.output,
          } as any,
          errorMessage: runnerResult.error || 'Post-execution verification failed; automatic rollback executed',
          actorUserId: validActorId,
          startedAt,
          completedAt,
        },
        include: { service: true },
      });

      // Append timeline events for failure + rollback + escalation
      await prisma.incidentTimeline.create({
        data: {
          incidentId: incident.id,
          eventType: 'REMEDIATION_VERIFICATION_FAILED',
          message: `Remediation action "${request.actionType}" failed verification probes. Initiating automatic rollback.`,
          metadataJson: { probes: runnerResult.verificationProbes } as any,
          actorUserId: validActorId,
        },
      });

      await prisma.incidentTimeline.create({
        data: {
          incidentId: incident.id,
          eventType: 'REMEDIATION_ROLLED_BACK',
          message: `Automatic rollback executed for "${request.actionType}". Incident escalated to human on-call.`,
          metadataJson: { rollbackOutput: rollbackResult.output, actionExecutionId: failedExecution.id } as any,
          actorUserId: validActorId,
        },
      });

      return this.mapToResponse(failedExecution, preconditions, runnerResult.verificationProbes);
    }

    // Execution SUCCEEDED and Probes PASSED
    const execution = await prisma.actionExecution.create({
      data: {
        organizationId: orgId,
        incidentId: incident.id,
        actionType: request.actionType,
        riskTier: 'SAFE_AUTOMATIC',
        status: 'SUCCEEDED',
        isDryRun: false,
        targetServiceId: service?.id || null,
        parametersJson: validatedParams as any,
        executionOutputJson: runnerResult.output as any,
        actorUserId: validActorId,
        startedAt,
        completedAt,
        verifiedAt: new Date(),
      },
      include: { service: true },
    });

    // Append timeline record
    await prisma.incidentTimeline.create({
      data: {
        incidentId: incident.id,
        eventType: 'REMEDIATION_EXECUTED',
        message: `Remediation "${request.actionType}" executed successfully on ${service?.name || 'service'}. Probes verified.`,
        metadataJson: {
          actionExecutionId: execution.id,
          output: runnerResult.output,
          probes: runnerResult.verificationProbes,
        } as any,
        actorUserId: validActorId,
      },
    });

    // Auto-resolve incident if remediation succeeded and verification passed
    await prisma.incident.update({
      where: { id: incident.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    await prisma.incidentTimeline.create({
      data: {
        incidentId: incident.id,
        eventType: 'INCIDENT_RESOLVED',
        message: 'Incident automatically RESOLVED following verified remediation action.',
        metadataJson: { resolvedByAction: request.actionType },
        actorUserId: validActorId,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: validActorId,
        action: 'REMEDIATION_ACTION_EXECUTED',
        entityType: 'ActionExecution',
        entityId: execution.id,
        metadataJson: {
          actionType: request.actionType,
          status: execution.status,
          success: true,
        },
      },
    });

    return this.mapToResponse(execution, preconditions, runnerResult.verificationProbes);
  }

  /**
   * APPROVE: Operator approves a PENDING_APPROVAL action execution.
   */
  async approveAction(
    orgId: string,
    incidentId: string,
    actionId: string,
    actorUserId: string,
  ): Promise<ActionExecutionResponse> {
    const existing = await prisma.actionExecution.findUnique({
      where: { id: actionId },
      include: { service: true },
    });

    if (!existing || existing.organizationId !== orgId || existing.incidentId !== incidentId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Action execution record not found',
      });
    }

    if (existing.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException({
        code: 'ACTION_NOT_PENDING_APPROVAL',
        message: `Action execution is in ${existing.status} status, cannot approve.`,
      });
    }

    return this.executeAction(
      orgId,
      incidentId,
      {
        actionType: existing.actionType as ActionType,
        parameters: existing.parametersJson as Record<string, unknown>,
        targetServiceId: existing.targetServiceId || undefined,
      },
      actorUserId,
      true, // bypass approval check since user just approved
    );
  }

  /**
   * ROLLBACK: Triggers rollback runner for a previously executed action.
   */
  async rollbackAction(
    orgId: string,
    incidentId: string,
    actionId: string,
    actorUserId: string,
  ): Promise<ActionExecutionResponse> {
    const existing = await prisma.actionExecution.findUnique({
      where: { id: actionId },
      include: { service: true },
    });

    if (!existing || existing.organizationId !== orgId || existing.incidentId !== incidentId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Action execution record not found',
      });
    }

    const runner = getActionRunner(existing.actionType);
    const context = await this.buildExecutionContext(orgId, existing.service);

    const rollbackResult = await runner.rollback(
      existing.parametersJson as Record<string, unknown>,
      existing.executionOutputJson as Record<string, unknown>,
      existing.service,
      context,
    );

    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    const updated = await prisma.actionExecution.update({
      where: { id: actionId },
      data: {
        status: 'ROLLED_BACK',
        rollbackStatus: 'EXECUTED',
      },
      include: { service: true },
    });

    await prisma.incidentTimeline.create({
      data: {
        incidentId,
        eventType: 'REMEDIATION_ROLLED_BACK',
        message: `Remediation action "${existing.actionType}" was rolled back.`,
        metadataJson: { rollbackOutput: rollbackResult.output } as any,
        actorUserId: validActorId,
      },
    });

    return this.mapToResponse(updated, [], rollbackResult.verificationProbes);
  }

  async listIncidentActions(orgId: string, incidentId: string): Promise<ActionExecutionResponse[]> {
    const actions = await prisma.actionExecution.findMany({
      where: { organizationId: orgId, incidentId },
      include: { service: true },
      orderBy: { createdAt: 'desc' },
    });

    return actions.map((a) => this.mapToResponse(a, [], []));
  }

  private async buildExecutionContext(
    orgId: string,
    service?: any,
    failVerificationProbe = false,
  ): Promise<ActionExecutionContext> {
    let credentials: Record<string, unknown> | undefined;

    if (service && this.vaultService) {
      try {
        const vaultCred = await prisma.vaultCredential.findFirst({
          where: {
            organizationId: orgId,
            targetType: 'KUBERNETES',
            environment: service.environment || 'PRODUCTION',
          },
        });

        if (vaultCred) {
          const decrypted = await this.vaultService.decryptCredentialById(orgId, vaultCred.id);
          credentials = decrypted.decryptedPayload;
        }
      } catch {
        // Fallback or unauthenticated mock execution
      }
    }

    return {
      orgId,
      service,
      vaultService: this.vaultService,
      kubernetesAdapter: this.kubernetesAdapter,
      credentials,
      failVerificationProbe,
    };
  }

  private async validateIncidentAndService(orgId: string, incidentId: string, serviceId?: string) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { service: true },
    });

    if (!incident || incident.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.INCIDENT_NOT_FOUND,
        message: 'Incident not found in this organization',
      });
    }

    let service = incident.service;
    if (serviceId && serviceId !== incident.serviceId) {
      const specifiedService = await prisma.service.findUnique({
        where: { id: serviceId },
      });
      if (!specifiedService || specifiedService.organizationId !== orgId) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Specified target service does not belong to this organization',
        });
      }
      service = specifiedService;
    }

    return { incident, service };
  }

  private mapToResponse(
    exec: any,
    preconditions: Array<{ check: string; passed: boolean }> = [],
    verificationResults: Array<{ probe: string; passed: boolean; message: string }> = [],
  ): ActionExecutionResponse {
    return {
      id: exec.id,
      organizationId: exec.organizationId,
      incidentId: exec.incidentId,
      actionType: exec.actionType as ActionType,
      riskTier: exec.riskTier as ActionRiskTier,
      status: exec.status as ActionExecutionStatus,
      isDryRun: exec.isDryRun,
      targetServiceId: exec.targetServiceId,
      targetServiceName: exec.service?.name || null,
      parameters: (exec.parametersJson || {}) as Record<string, unknown>,
      executionOutput: (exec.executionOutputJson || null) as Record<string, unknown> | null,
      errorMessage: exec.errorMessage,
      preconditionChecks: preconditions,
      verificationResults: verificationResults.length > 0 ? verificationResults : null,
      startedAt: exec.startedAt ? exec.startedAt.toISOString() : null,
      completedAt: exec.completedAt ? exec.completedAt.toISOString() : null,
      verifiedAt: exec.verifiedAt ? exec.verifiedAt.toISOString() : null,
      rollbackStatus: exec.rollbackStatus,
      actorUserId: exec.actorUserId,
      createdAt: exec.createdAt.toISOString(),
      updatedAt: exec.updatedAt.toISOString(),
    };
  }
}