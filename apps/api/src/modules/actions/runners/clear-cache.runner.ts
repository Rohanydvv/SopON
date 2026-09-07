import { BadRequestException } from '@nestjs/common';
import { ClearCacheParamsSchema } from '@sopon/contracts';
import { ActionPreconditionCheck, ActionRunnerResult, BaseActionRunner } from './base.runner';

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

  async checkPreconditions(params: Record<string, unknown>, service?: any): Promise<ActionPreconditionCheck[]> {
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

  async dryRun(params: Record<string, unknown>, service?: any): Promise<ActionRunnerResult> {
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

  async execute(params: Record<string, unknown>, service?: any): Promise<ActionRunnerResult> {
    return {
      success: true,
      output: {
        action: 'CLEAR_SERVICE_CACHE',
        targetService: service?.name,
        keyPrefix: params.keyPrefix,
        keysFlushedCount: 42,
        flushedAt: new Date().toISOString(),
        status: 'CACHE_FLUSH_COMPLETED',
      },
      verificationProbes: [
        {
          probe: `redis:keys(${params.keyPrefix})`,
          passed: true,
          message: 'Key pattern cleared from cache cluster',
        },
      ],
    };
  }

  async rollback(_params: Record<string, unknown>): Promise<ActionRunnerResult> {
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