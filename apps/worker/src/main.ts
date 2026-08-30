import { getEnvConfig } from '@sopon/config';
import Redis from 'ioredis';

async function bootstrap() {
  const config = getEnvConfig();
  console.log('[Worker] Initializing SopON background worker...');

  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 1000, 10000);
      return delay;
    },
  });

  redis.on('connect', () => {
    console.log('[Worker] Connected to Redis successfully.');
  });

  redis.on('error', (err) => {
    console.warn('[Worker] Redis connection error (will retry):', err.message);
  });

  console.log('[Worker] Background worker queues initialized and ready.');

  const shutdown = async (signal: string) => {
    console.log(`[Worker] Received ${signal}. Gracefully shutting down...`);
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Worker] Fatal error starting worker:', err);
  process.exit(1);
});
