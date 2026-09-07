import { BadRequestException } from '@nestjs/common';
import { BaseActionRunner } from './base.runner';
import { RestartServiceRunner } from './restart-service.runner';
import { ScaleServiceRunner } from './scale-service.runner';
import { UpdatePoolConfigRunner } from './config-pool.runner';
import { ClearCacheRunner } from './clear-cache.runner';

const RUNNERS: Record<string, BaseActionRunner> = {
  RESTART_SERVICE_WORKER: new RestartServiceRunner(),
  SCALE_SERVICE_REPLICAS: new ScaleServiceRunner(),
  UPDATE_POOL_CONFIG: new UpdatePoolConfigRunner(),
  CLEAR_SERVICE_CACHE: new ClearCacheRunner(),
};

export function getActionRunner(actionType: string): BaseActionRunner {
  const runner = RUNNERS[actionType];
  if (!runner) {
    throw new BadRequestException({
      code: 'UNSUPPORTED_ACTION_TYPE',
      message: `Action type "${actionType}" is not registered in the allowlisted remediation registry. Supported types: ${Object.keys(RUNNERS).join(', ')}`,
    });
  }
  return runner;
}