import { BadRequestException } from '@nestjs/common';
import { ClearCacheParamsSchema } from '@sopon/contracts';
import {
  ActionExecutionContext,
  ActionPreconditionCheck,
  ActionRunnerResult,
  BaseActionRunner,
} from './base.runner';

export class ClearCacheRunner extends BaseActionRunner {
  validateParams(params: unknown): Record<string, unknown> {
    const parsed = ClearCacheParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Invalid parameters for CLEAR_SERVICE_CACHE: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      });
    }
    return parsed.data as Record<string, unknown>;
  }

  async checkPreconditions(
    params: Record<string, unknown>,
    service?: any,
    _context?: ActionExecutionContext,
  ): Promise<ActionPreconditionCheck[]> {
    return [
      {
        check: 'Target service exists',
        passed: !!service,
      },
      {
        check: `Key prefix "${params.keyPrefix}" contains valid pattern syntax`,
        passed: typeof params.keyPrefix === 'string' && params.keyPrefix.length >= 2,
      },
    ];
  }

  async dryRun(
    params: Record<string, unknown>,
    service?: any,
    _context?: ActionExecutionContext,
  ): Promise<ActionRunnerResult> {
    return {
      success: true,
      output: {
        action: 'CLEAR_SERVICE_CACHE',
        simulated: true,
        targetService: service?.name,
        keyPrefix: params.keyPrefix,
        estimatedKeysToFlush: 42,
      },
      verificationProbes: [
        {
          probe: `redis:keys_count(${params.keyPrefix}) == 0`,
          passed: true,
          message: 'Simulated cache eviction probe',
        },
      ],
    };
  }

  async execute(
    params: Record<string, unknown>,
    service?: any,
    context?: ActionExecutionContext,
  ): Promise<ActionRunnerResult> {
    const shouldFailProbes = context?.failVerificationProbe === true;

    const verificationProbes = [
      {
        probe: `redis:keys(${params.keyPrefix})`,
        passed: !shouldFailProbes,
        message: !shouldFailProbes
          ? 'Key pattern cleared from cache cluster'
          : 'Cache eviction failed; keys still present in cache',
      },
    ];

    const allProbesPassed = verificationProbes.every((p) => p.passed);

    return {
      success: allProbesPassed,
      output: {
        action: 'CLEAR_SERVICE_CACHE',
        targetService: service?.name,
        keyPrefix: params.keyPrefix,
        keysFlushedCount: 42,
        flushedAt: new Date().toISOString(),
        status: allProbesPassed ? 'CACHE_FLUSH_COMPLETED' : 'VERIFICATION_FAILED',
      },
      error: allProbesPassed ? undefined : 'Post-execution verification probes failed',
      verificationProbes,
    };
  }

  async rollback(
    _params: Record<string, unknown>,
    _previousOutput?: Record<string, unknown> | null,
    _service?: any,
    _context?: ActionExecutionContext,
  ): Promise<ActionRunnerResult> {
    return {
      success: true,
      output: {
        action: 'CLEAR_SERVICE_CACHE_ROLLBACK',
        status: 'NOT_APPLICABLE_IRREVERSIBLE_CACHE_FLUSH',
      },
      verificationProbes: [],
    };
  }
}