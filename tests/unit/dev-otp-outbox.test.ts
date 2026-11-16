import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { devOtpOutboxAllowed, readDevOtp, writeDevOtp } from '@/modules/identity/dev-otp-outbox';
import { normalizeIraqPhone } from '@/modules/identity/phone';

describe('development OTP outbox gate', () => {
  it('is allowed only for the mock adapter outside production when enabled', () => {
    expect(devOtpOutboxAllowed({ isProduction: false, enabled: true, provider: 'mock' })).toBe(true);
    expect(devOtpOutboxAllowed({ isProduction: true, enabled: true, provider: 'mock' })).toBe(false);
    expect(devOtpOutboxAllowed({ isProduction: false, enabled: false, provider: 'mock' })).toBe(false);
    expect(devOtpOutboxAllowed({ isProduction: false, enabled: true, provider: 'sms' })).toBe(false);
  });
});

describe('development OTP outbox storage', () => {
  it('keeps only the latest code per phone and expires it by time', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'otp-outbox-'));
    try {
      const t0 = new Date('2026-11-16T10:00:00Z');
      await writeDevOtp(dir, '+9647700000111', '111111', 300, t0);
      await writeDevOtp(dir, '+9647700000111', '222222', 300, new Date(t0.getTime() + 61_000));
      const latest = await readDevOtp(dir, '+9647700000111');
      expect(latest?.code).toBe('222222');
      expect(new Date(latest!.expiresAt).getTime() - new Date(latest!.createdAt).getTime()).toBe(300_000);
      expect(await readDevOtp(dir, '+9647700000999')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Iraqi mobile normalisation', () => {
  it('accepts the common forms and stores +964 7XXXXXXXXX', () => {
    expect(normalizeIraqPhone('07701234567')).toBe('+9647701234567');
    expect(normalizeIraqPhone('+964 770 123 4567')).toBe('+9647701234567');
    expect(normalizeIraqPhone('9647701234567')).toBe('+9647701234567');
    expect(normalizeIraqPhone('7701234567')).toBe('+9647701234567');
    expect(normalizeIraqPhone('0112345678')).toBeNull();
  });
});
