import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual, randomInt } from 'node:crypto';
import { config } from './config';

export { hashPassword, verifyPassword } from './passwords';

/** Opaque random token (session cookies). Only its SHA-256 is stored. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Keyed hash for OTP codes and rate-limit subjects so raw values are never persisted. */
export function keyedHash(purpose: string, value: string): string {
  return createHmac('sha256', config.APP_SECRET).update(`${purpose}\u0000${value}`).digest('hex');
}

/** Cryptographically random 6-digit OTP. */
export function newOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
