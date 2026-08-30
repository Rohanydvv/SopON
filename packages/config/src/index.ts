import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Attempt to load .env from root if not already set
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const EnvSchema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 chars'),
  AUTH_ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  AUTH_REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),

  AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('gemini-1.5-flash'),

  EMAIL_PROVIDER: z.enum(['mailpit', 'resend', 'smtp']).default('mailpit'),
  EMAIL_FROM: z.string().email().default('notifications@sopon.dev'),
  EMAIL_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  SENTRY_DSN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

let parsedConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (parsedConfig) return parsedConfig;

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.format();
    console.error('Invalid environment variables:', JSON.stringify(errorDetails, null, 2));
    throw new Error('Invalid environment configuration');
  }

  parsedConfig = result.data;
  return parsedConfig;
}
