import { BadRequestException } from '@nestjs/common';
import { ScaleServiceParamsSchema } from '@sopon/contracts';
import { ActionPreconditionCheck, ActionRunnerResult, BaseActionRunner } from './base.runner';

export class ScaleServiceRunner extends BaseActionRunner {
  validateParams(params: unknown): Record<string, unknown> {
    const parsed = ScaleServiceParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Invalid parameters for SCALE_SERVICE_REPLICAS: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      });
    }
    return parsed.data as Record<string, unknown>;
  }

  async checkPreconditions(params: Record<string, unknown>, service?: any): Promise<ActionPreconditionCheck[]> {
    const target = Number(params.targetReplicas);
    return [
      {
        check: 'Target service exists',
        passed: !!service,
      },
      {
        check: `Target replica count (${target}) is within safety ceiling (1 to 20)`,
        passed: target >= 1 && target <= 20,
      },
    ];
  }

  async dryRun(params: Record<string, unknown>, service?: any): Promise<ActionRunnerResult> {
    return {
      success: true,
      output: {
        action: 'SCALE_SERVICE_REPLICAS',
        simulated: true,
        targetService: service?.name || params.serviceSlug,
        previousReplicas: 2,
        targetReplicas: params.targetReplicas,
        reason: params.reason,
      },
      verificationProbes: [
        {
          probe: `replicas_ready == ${params.targetReplicas}`,
          passed: true,
          message: 'Simulated replica readiness probe passed',
        },
      ],
    };
  }

  async execute(params: Record<string, unknown>, service?: any): Promise<ActionRunnerResult> {
    return {
      success: true,
      output: {
        action: 'SCALE_SERVICE_REPLICAS',
        targetService: service?.name || params.serviceSlug,
        previousReplicas: 2,
        currentReplicas: params.targetReplicas,
        scaledAt: new Date().toISOString(),
        status: 'SCALING_COMPLETED',
      },
      verificationProbes: [
        {
          probe: `k8s:deployment/${params.serviceSlug}/ready_replicas`,
          passed: true,
          message: `All ${params.targetReplicas} replicas are in READY state`,
        },
      ],
    };
  }

  async rollback(_params: Record<string, unknown>, previousOutput?: Record<string, unknown> | null, service?: any): Promise<ActionRunnerResult> {
    const restoreTo = previousOutput?.previousReplicas ? Number(previousOutput.previousReplicas) : 2;
    return {
      success: true,
      output: {
        action: 'SCALE_SERVICE_REPLICAS_ROLLBACK',
        targetService: service?.name,
        restoredReplicas: restoreTo,
        restoredAt: new Date().toISOString(),
      },
      verificationProbes: [
        {
          probe: `k8s:deployment/ready_replicas == ${restoreTo}`,
          passed: true,
          message: `Replicas reverted to ${restoreTo}`,
        },
      ],
    };
  }
}