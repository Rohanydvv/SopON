import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@sopon/database';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'sopon-api',
      uptime: process.uptime(),
    };
  }

  async getReadiness() {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};
    let isReady = true;

    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: 'up',
        latencyMs: Date.now() - dbStart,
      };
    } catch (err: unknown) {
      isReady = false;
      const errorMsg = err instanceof Error ? err.message : 'Database check failed';
      this.logger.warn(`Readiness check failed for database: ${errorMsg}`);
      checks.database = {
        status: 'down',
        error: errorMsg,
      };
    }

    return {
      status: isReady ? 'ok' : 'degraded',
      ready: isReady,
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
