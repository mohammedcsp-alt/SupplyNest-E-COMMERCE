import 'server-only';
import { z } from 'zod';

/**
 * Central configuration. Validated once at import time.
 * Secrets are read from the environment only (never committed).
 */
/** Empty environment values (e.g. `SMS_PROVIDER_URL=` in an env file) are treated as unset. */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

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
  /** HTTPS endpoint of the SMS provider (required when OTP_PROVIDER=sms). No default: no provider is assumed. */
  SMS_PROVIDER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SMS_SENDER_ID: z.preprocess(emptyToUndefined, z.string().min(1).max(11).optional()),
  SMS_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  /** Base URL the PDF exporter uses to load the print view. Defaults to this process on loopback. */
  PDF_RENDER_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
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
  if (config.OTP_PROVIDER === 'sms') {
    if (!config.SMS_PROVIDER_URL) {
      throw new Error('Refusing to start: OTP_PROVIDER=sms requires SMS_PROVIDER_URL.');
    }
    if (!config.SMS_PROVIDER_URL.startsWith('https://')) {
      throw new Error('Refusing to start: SMS_PROVIDER_URL must use https:// in production.');
    }
    if (!config.SMS_PROVIDER_API_KEY) {
      throw new Error('Refusing to start: OTP_PROVIDER=sms requires SMS_PROVIDER_API_KEY.');
    }
  }
  if (config.FEATURE_FLAG_WMS_INTEGRATION) {
    throw new Error('Refusing to start: WMS integration is not enabled in V1.');
  }
}
