import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Development-only OTP outbox. The mock SMS adapter records the most recent code per phone number in a local file so
 * the developer can complete phone verification without a real SMS. Nothing is served over HTTP and nothing is logged.
 * The file lives under DEV_OTP_DIR (storage/, gitignored). Only the latest code per number is kept.
 */
export type DevOtpEntry = { code: string; createdAt: string; expiresAt: string };
export type DevOtpOutbox = Record<string, DevOtpEntry>;

/** Pure gate. The outbox exists only for the mock adapter outside production. */
export function devOtpOutboxAllowed(input: { isProduction: boolean; enabled: boolean; provider: 'mock' | 'sms' }): boolean {
  return !input.isProduction && input.enabled && input.provider === 'mock';
}

export function outboxFile(dir: string): string {
  return path.join(dir, 'outbox.json');
}

export async function writeDevOtp(dir: string, phone: string, code: string, validitySeconds: number, now: Date = new Date()): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const file = outboxFile(dir);
  let box: DevOtpOutbox = {};
  try {
    box = JSON.parse(await fs.readFile(file, 'utf8')) as DevOtpOutbox;
  } catch {
    box = {};
  }
  box[phone] = { code, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + validitySeconds * 1000).toISOString() };
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(box, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
}

export async function readDevOtp(dir: string, phone: string): Promise<DevOtpEntry | null> {
  try {
    const box = JSON.parse(await fs.readFile(outboxFile(dir), 'utf8')) as DevOtpOutbox;
    return box[phone] ?? null;
  } catch {
    return null;
  }
}
