import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Production start-up refusals (CUSTOMER-002, ADMIN-010). Each case re-imports the config module with a fresh environment.
 * A value of undefined removes the variable.
 */
const SAVED = { ...process.env };

async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, SAVED, { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5440/b2b_store_test', APP_SECRET: 'x'.repeat(40) });
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import('@/lib/config');
}

const PROD_BASE = { NODE_ENV: 'production', OTP_PROVIDER: 'sms', FEATURE_FLAG_WMS_INTEGRATION: 'false' };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

describe('production refuses to start with missing SMS settings (CUSTOMER-002)', () => {
  it('OTP_PROVIDER=mock in production is refused', async () => {
    const mod = await loadWith({ ...PROD_BASE, OTP_PROVIDER: 'mock' });
    expect(() => mod.assertProductionSafe()).toThrow(/OTP_PROVIDER=mock/);
  });

  it('OTP_PROVIDER=sms without SMS_PROVIDER_URL is refused', async () => {
    const mod = await loadWith({ ...PROD_BASE, SMS_PROVIDER_URL: undefined, SMS_PROVIDER_API_KEY: 'key-1234567890' });
    expect(() => mod.assertProductionSafe()).toThrow(/SMS_PROVIDER_URL/);
  });

  it('an empty SMS_PROVIDER_URL counts as missing', async () => {
    const mod = await loadWith({ ...PROD_BASE, SMS_PROVIDER_URL: '', SMS_PROVIDER_API_KEY: 'key-1234567890' });
    expect(() => mod.assertProductionSafe()).toThrow(/SMS_PROVIDER_URL/);
  });

  it('OTP_PROVIDER=sms without SMS_PROVIDER_API_KEY is refused', async () => {
    const mod = await loadWith({ ...PROD_BASE, SMS_PROVIDER_URL: 'https://sms.example.test/v1/send', SMS_PROVIDER_API_KEY: undefined });
    expect(() => mod.assertProductionSafe()).toThrow(/SMS_PROVIDER_API_KEY/);
  });

  it('a non-https SMS URL is refused in production', async () => {
    const mod = await loadWith({ ...PROD_BASE, SMS_PROVIDER_URL: 'http://sms.example.test/v1/send', SMS_PROVIDER_API_KEY: 'key-1234567890' });
    expect(() => mod.assertProductionSafe()).toThrow(/https/);
  });

  it('a complete SMS configuration in production starts', async () => {
    const mod = await loadWith({ ...PROD_BASE, SMS_PROVIDER_URL: 'https://sms.example.test/v1/send', SMS_PROVIDER_API_KEY: 'key-1234567890' });
    expect(() => mod.assertProductionSafe()).not.toThrow();
  });

  it('outside production the same missing settings do not stop the process', async () => {
    const mod = await loadWith({ NODE_ENV: 'development', OTP_PROVIDER: 'sms', SMS_PROVIDER_URL: undefined, SMS_PROVIDER_API_KEY: undefined });
    expect(() => mod.assertProductionSafe()).not.toThrow();
  });
});
