import 'server-only';
import { z } from 'zod';

/**
 * Central configuration. Validated once at import time.
 * Secrets are read from the environment only (never committed).
 */
const schema = z.object({
  DATABASE_URL: z.string().min(10),
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3200),
  FEATURE_FLAG_WMS_INTEGRATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OTP_PROVIDER: z.enum(['mock', 'sms']).default('mock'),
  UPLOAD_DIR: z.string().default('./storage/uploads'),
  BACKUP_DIR: z.string().default('./storage/backups'),
  SESSION_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  SMS_PROVIDER_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid configuration: ${issues}`);
}

export const config = Object.freeze({
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  /** Mock OTP is only ever allowed outside production. */
  otpMockEnabled: parsed.data.OTP_PROVIDER === 'mock',
});

/**
 * Production must not start with development adapters (spec 19.1 / OTP rule).
 * Called from instrumentation hook and from the CLI bootstrap.
 */
export function assertProductionSafe(): void {
  if (!config.isProduction) return;
  if (config.otpMockEnabled) {
    throw new Error('Refusing to start in production with OTP_PROVIDER=mock. Configure a real SMS provider.');
  }
  if (config.OTP_PROVIDER === 'sms' && !config.SMS_PROVIDER_API_KEY) {
    throw new Error('Refusing to start: SMS provider selected but SMS_PROVIDER_API_KEY is missing.');
  }
  if (config.FEATURE_FLAG_WMS_INTEGRATION) {
    throw new Error('Refusing to start: WMS integration is not enabled in V1.');
  }
}
