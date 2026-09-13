import { Inject, Injectable, Logger } from '@nestjs/common';
import { prisma } from '@sopon/database';
import { KubernetesAdapter } from '../actions/adapters/kubernetes-adapter.interface';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

export interface ReconciliationReport {
  scannedCount: number;
  reconciledCount: number;
  escalatedCount: number;
  rolledBackCount: number;
  staleLocksCleared: number;
}

@Injectable()
export class AutonomousReconciliationService {
  private readonly logger = new Logger(AutonomousReconciliationService.name);

  constructor(
    @Inject('KubernetesAdapter')
    private readonly kubernetesAdapter: KubernetesAdapter,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  /**
   * Scans and safely reconciles in-flight or orphaned action executions following worker/process failures.
   * CONSERVATIVE PRINCIPLE: Never blindly replay infrastructure mutations.
   */
  async reconcileOrphanedExecutions(targetOrgId?: string): Promise<ReconciliationReport> {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes cutoff

    const orphanedExecutions = await prisma.actionExecution.findMany({
      where: {
        status: { in: ['RUNNING', 'VERIFYING'] },
        updatedAt: { lte: cutoff },
        ...(targetOrgId ? { organizationId: targetOrgId } : {}),
      },
      include: {
        service: true,
        incident: true,
      },
    });

    let reconciledCount = 0;
    let escalatedCount = 0;
    let rolledBackCount = 0;

    for (const exec of orphanedExecutions) {
      this.logger.warn(`Reconciling orphaned action execution "${exec.id}" for service "${exec.service?.name}"...`);

      const service = exec.service;
      const incident = exec.incident;
      const orgId = exec.organizationId;
      const params = (exec.parametersJson || {}) as any;

      if (!service) {
        await prisma.actionExecution.update({
          where: { id: exec.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Orphaned execution target service no longer exists; escalated',
            completedAt: new Date(),
          },
        });
        escalatedCount += 1;
        continue;
      }

      const namespace = params.namespace || service.environment?.toLowerCase() || 'production';
      const deploymentName = params.serviceSlug || service.slug;

      try {
        // Inspect observed live infrastructure state
        const liveState = await this.kubernetesAdapter.getDeployment(namespace, deploymentName);

        // Check if deployment is healthy and matches desired state
        if (exec.actionType === 'SCALE_SERVICE_REPLICAS') {
          const targetReplicas = params.targetReplicas;
          const isScaled = liveState.replicas === targetReplicas;
          const isHealthy = liveState.readyReplicas === targetReplicas;

          if (isScaled && isHealthy) {
            // Execution actually completed before crash
            await prisma.actionExecution.update({
              where: { id: exec.id },
              data: {
                status: 'SUCCEEDED',
                errorMessage: null,
                completedAt: new Date(),
                verifiedAt: new Date(),
              },
            });

            await prisma.incidentTimeline.create({
              data: {
                incidentId: incident.id,
                eventType: 'RECONCILIATION_COMPLETED',
                message: `Orphaned execution reconciled: Live cluster verified healthy with ${liveState.replicas} replicas.`,
                metadataJson: { liveState } as any,
              },
            });

            reconciledCount += 1;
          } else {
            // State is inconsistent or unhealthy -> Escalate to human on-call without blind replay
            await prisma.actionExecution.update({
              where: { id: exec.id },
              data: {
                status: 'FAILED',
                errorMessage: `Ambiguous execution state detected after worker crash (Expected ${targetReplicas}, Observed ${liveState.replicas}, Ready ${liveState.readyReplicas}). Escalated to on-call without replay.`,
                completedAt: new Date(),
              },
            });

            await prisma.incidentTimeline.create({
              data: {
                incidentId: incident.id,
                eventType: 'RECONCILIATION_ESCALATED',
                message: `Worker crash reconciliation: Infrastructure state ambiguous. Escalated to on-call engineers. Zero blind re-execution.`,
                metadataJson: { liveState, targetReplicas } as any,
              },
            });

            await this.circuitBreakerService.recordStrike(
              orgId,
              service.id,
              'Worker process crashed with incomplete verification',
              exec.id,
            );

            escalatedCount += 1;
          }
        } else {
          // Non-scaling action: Mark failed and escalate
          await prisma.actionExecution.update({
            where: { id: exec.id },
            data: {
              status: 'FAILED',
              errorMessage: 'Ambiguous execution status for restarted worker; escalated to on-call',
              completedAt: new Date(),
            },
          });

          await prisma.incidentTimeline.create({
            data: {
              incidentId: incident.id,
              eventType: 'RECONCILIATION_ESCALATED',
              message: `Orphaned action "${exec.actionType}" reconciled to FAILED following worker restart.`,
              metadataJson: { actionType: exec.actionType } as any,
            },
          });

          escalatedCount += 1;
        }
      } catch (err: any) {
        // Query failed -> Escalate
        await prisma.actionExecution.update({
          where: { id: exec.id },
          data: {
            status: 'FAILED',
            errorMessage: `Failed to inspect cluster during crash recovery: ${err.message}`,
            completedAt: new Date(),
          },
        });

        escalatedCount += 1;
      }
    }

    // Clear stale locks where lease expired
    const expiredLockCbs = await prisma.serviceCircuitBreaker.findMany({
      where: {
        lockExpiresAt: { lte: new Date() },
        lockOwnerToken: { not: null },
      },
    });

    for (const cb of expiredLockCbs) {
      await prisma.serviceCircuitBreaker.update({
        where: { id: cb.id },
        data: {
          lockOwnerToken: null,
          lockExpiresAt: null,
        },
      });
    }

    return {
      scannedCount: orphanedExecutions.length,
      reconciledCount,
      escalatedCount,
      rolledBackCount,
      staleLocksCleared: expiredLockCbs.length,
    };
  }
}
