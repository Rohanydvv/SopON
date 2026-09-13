import { BadRequestException } from '@nestjs/common';
import { UpdatePoolConfigParamsSchema } from '@sopon/contracts';
import {
  ActionExecutionContext,
  ActionPreconditionCheck,
  ActionRunnerResult,
  BaseActionRunner,
} from './base.runner';

export class UpdatePoolConfigRunner extends BaseActionRunner {
  validateParams(params: unknown): Record<string, unknown> {
    const parsed = UpdatePoolConfigParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Invalid parameters for UPDATE_POOL_CONFIG: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      });
    }
    return parsed.data as Record<string, unknown>;
  }

  async checkPreconditions(
    params: Record<string, unknown>,
    service?: any,
    _context?: ActionExecutionContext,
  ): Promise<ActionPreconditionCheck[]> {
    const maxConn = Number(params.maxConnections ?? params.poolSize ?? 50);
    const timeout = Number(params.timeoutMs ?? params.connectionTimeoutMs ?? 5000);
    return [
      {
        check: 'Target service exists',
        passed: !!service,
      },
      {
        check: `Max connections (${maxConn}) within safe limits (10 - 1000)`,
        passed: maxConn >= 10 && maxConn <= 1000,
      },
      {
        check: `Connection timeout (${timeout}ms) within safe limits (100ms - 60000ms)`,
        passed: timeout >= 100 && timeout <= 60000,
      },
    ];
  }

  async dryRun(
    params: Record<string, unknown>,
    service?: any,
    _context?: ActionExecutionContext,
  ): Promise<ActionRunnerResult> {
    const maxConn = Number(params.maxConnections ?? params.poolSize ?? 50);
    const timeout = Number(params.timeoutMs ?? params.connectionTimeoutMs ?? 5000);
    return {
      success: true,
      output: {
        action: 'UPDATE_POOL_CONFIG',
        simulated: true,
        targetService: service?.name,
        previousMaxConnections: 20,
        appliedMaxConnections: maxConn,
        appliedTimeoutMs: timeout,
      },
      verificationProbes: [
        {
          probe: 'configmap_hash_sync',
          passed: true,
          message: 'Config parameter validated and simulated',
        },
      ],
    };
  }

  async execute(
    params: Record<string, unknown>,
    service?: any,
    context?: ActionExecutionContext,
  ): Promise<ActionRunnerResult> {
    const maxConn = Number(params.maxConnections ?? params.poolSize ?? 50);
    const timeout = Number(params.timeoutMs ?? params.connectionTimeoutMs ?? 5000);
    const shouldFailProbes = context?.failVerificationProbe === true;

    const verificationProbes = [
      {
        probe: 'redis:pool_utilization_percent',
        passed: !shouldFailProbes,
        message: !shouldFailProbes
          ? 'Pool utilization decreased to 22%'
          : 'Pool utilization remained critical at 98%',
      },
    ];

    const allProbesPassed = verificationProbes.every((p) => p.passed);

    return {
      success: allProbesPassed,
      output: {
        action: 'UPDATE_POOL_CONFIG',
        targetService: service?.name,
        previousMaxConnections: 20,
        appliedMaxConnections: maxConn,
        appliedTimeoutMs: timeout,
        updatedAt: new Date().toISOString(),
        status: allProbesPassed ? 'CONFIG_APPLIED' : 'VERIFICATION_FAILED',
      },
      error: allProbesPassed ? undefined : 'Post-execution verification probes failed',
      verificationProbes,
    };
  }

  async rollback(
    _params: Record<string, unknown>,
    previousOutput?: Record<string, unknown> | null,
    service?: any,
    _context?: ActionExecutionContext,
  ): Promise<ActionRunnerResult> {
    const prevMax = previousOutput?.previousMaxConnections ? Number(previousOutput.previousMaxConnections) : 50;
    return {
      success: true,
      output: {
        action: 'UPDATE_POOL_CONFIG_ROLLBACK',
        targetService: service?.name,
        restoredMaxConnections: prevMax,
        restoredAt: new Date().toISOString(),
      },
      verificationProbes: [],
    };
  }
}