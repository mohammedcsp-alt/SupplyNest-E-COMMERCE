import 'server-only';
import { db } from '@/lib/db';
import { AppError, errors } from '@/lib/errors';
import { config } from '@/lib/config';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { keyedHash, newOtpCode, safeEqual } from '@/lib/crypto';
import { consumeRateLimit } from '@/lib/rate-limit';
import { writeAudit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { normalizeIraqPhone } from './phone';
import { deliverOtp, OTP_RULES, type OtpDelivery } from './otp';
import { recordStatusChange } from './status';
import type { OtpPurpose } from '@prisma/client';

export const RECOVERY_PURPOSE: OtpPurpose = 'ACCESS_RECOVERY';
export const REGISTRATION_PURPOSE: OtpPurpose = 'REGISTRATION';

export function assertPasswordPolicy(password: string): void {
  if (password.length < 10 || password.length > 128) throw errors.validation('Password must be 10–128 characters');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw errors.validation('Password must include at least one letter and one digit');
  }
}

function requirePhone(input: string): string {
  const phone = normalizeIraqPhone(input);
  if (!phone) throw errors.validation('Enter a valid Iraqi mobile number (07XXXXXXXXX)');
  return phone;
}

/** Creates a REGISTERED (unverified) customer account and sends the first OTP. */
export async function registerCustomer(input: {
  phone: string;
  password: string;
  name: string;
  businessName?: string;
  ip: string;
}): Promise<{ status: 'REGISTERED'; otp: OtpDelivery }> {
  const phone = requirePhone(input.phone);
  assertPasswordPolicy(input.password);
  await consumeRateLimit({ action: 'register_ip', subject: input.ip, limit: 10, windowSeconds: 3600 });

  const existing = await db.user.findUnique({ where: { phone }, select: { id: true, status: true, phoneVerifiedAt: true } });
  if (existing) {
    // The response has the same shape whatever the existing account's state, so registration cannot be used to
    // learn which numbers have accounts. The only case that sends anything is an unverified self-registration:
    // it is resumed with a fresh code to the same number. The password is NOT replaced (a stranger must not be able
    // to set the password on someone else's unverified account); the customer keeps the original password.
    if (existing.status === 'REGISTERED' && !existing.phoneVerifiedAt) {
      const otp = await resumeRegistrationOtp(existing.id, phone);
      return { status: 'REGISTERED', otp };
    }
    return { status: 'REGISTERED', otp: { delivered: false, provider: config.OTP_PROVIDER } };
  }

  const passwordHash = await hashPassword(input.password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { phone, passwordHash, userType: 'CUSTOMER', status: 'REGISTERED', fullNameEn: input.name.slice(0, 120) },
    });
    await tx.customerProfile.create({
      data: {
        userId: u.id,
        displayName: input.name.slice(0, 120),
        legalName: input.businessName?.slice(0, 200) ?? null,
      },
    });
    await tx.accountStatusHistory.create({
      data: { subjectId: u.id, fromStatus: null, toStatus: 'REGISTERED', reason: 'self-registration', actorId: null },
    });
    await writeAudit(tx, { action: 'customer.register', entityType: 'user', entityId: u.id, after: { status: 'REGISTERED' } });
    return u;
  });

  const otp = await issueOtp(user.id, phone, REGISTRATION_PURPOSE);
  return { status: 'REGISTERED', otp };
}

/**
 * Resumes an unverified self-registration with a fresh code. A cooldown or hourly quota stops the send, but the caller
 * still gets the same response shape, so a throttled resume does not reveal anything about the account.
 */
async function resumeRegistrationOtp(userId: string, phone: string): Promise<OtpDelivery> {
  try {
    return await issueOtp(userId, phone, REGISTRATION_PURPOSE);
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      logger.info('registration_resume_throttled', { userId });
      return { delivered: false, provider: config.OTP_PROVIDER };
    }
    throw err;
  }
}

/** Issues an OTP challenge with cooldown and hourly quota. Stores only a keyed hash of the code. */
export async function issueOtp(userId: string, phone: string, purpose: OtpPurpose): Promise<OtpDelivery> {
  await consumeRateLimit({ action: `otp_request_${purpose}`, subject: phone, limit: OTP_RULES.maxRequestsPerHour, windowSeconds: 3600 });

  const last = await db.otpChallenge.findFirst({ where: { userId, purpose }, orderBy: { createdAt: 'desc' } });
  if (last && Date.now() - last.createdAt.getTime() < OTP_RULES.resendCooldownSeconds * 1000) {
    const wait = Math.ceil((OTP_RULES.resendCooldownSeconds * 1000 - (Date.now() - last.createdAt.getTime())) / 1000);
    throw errors.rateLimited(`Please wait ${wait} seconds before requesting a new code`, wait);
  }

  const code = newOtpCode();
  await db.otpChallenge.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
  await db.otpChallenge.create({
    data: {
      userId,
      purpose,
      codeHash: keyedHash(`otp:${purpose}:${userId}`, code),
      expiresAt: new Date(Date.now() + OTP_RULES.validitySeconds * 1000),
    },
  });
  const delivery = await deliverOtp(phone, code);
  logger.info('otp_issued', { userId, purpose, provider: delivery.provider });
  return delivery;
}

/** Verifies an OTP. Five wrong attempts invalidate the challenge (T003). */
export async function verifyOtp(input: { phone: string; code: string; purpose: OtpPurpose }): Promise<{ userId: string }> {
  const phone = requirePhone(input.phone);
  await consumeRateLimit({ action: 'otp_verify', subject: phone, limit: 20, windowSeconds: 900 });

  const user = await db.user.findUnique({ where: { phone } });
  if (!user) throw errors.validation('Invalid or expired code');
  const challenge = await db.otpChallenge.findFirst({
    where: { userId: user.id, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge || challenge.expiresAt.getTime() < Date.now() || challenge.attempts >= OTP_RULES.maxVerifyAttempts) {
    throw errors.validation('Invalid or expired code. Request a new code.');
  }

  const expected = keyedHash(`otp:${input.purpose}:${user.id}`, input.code.trim());
  const matches = safeEqual(expected, challenge.codeHash);
  if (!matches) {
    await db.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw errors.validation('Invalid or expired code');
  }
  await db.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  return { userId: user.id };
}

/** Marks the phone verified and moves REGISTERED → APPROVAL_PENDING (CUSTOMER-003). */
export async function confirmRegistrationPhone(input: { phone: string; code: string }): Promise<{ status: AccountStatusLike }> {
  const { userId } = await verifyOtp({ ...input, purpose: REGISTRATION_PURPOSE });
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.status !== 'REGISTERED') return { status: u.status as AccountStatusLike };
    await tx.user.update({ where: { id: userId }, data: { phoneVerifiedAt: new Date(), status: 'APPROVAL_PENDING' } });
    await recordStatusChange(tx, { subjectId: userId, from: 'REGISTERED', to: 'APPROVAL_PENDING', reason: 'phone verified' });
    return { status: 'APPROVAL_PENDING' as AccountStatusLike };
  });
}

type AccountStatusLike = 'REGISTERED' | 'APPROVAL_PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

/** Password login. Generic error for unknown users and wrong passwords (no enumeration). */
export async function authenticate(input: { phone: string; password: string; ip: string }) {
  const phone = normalizeIraqPhone(input.phone) ?? input.phone;
  await consumeRateLimit({ action: 'login_ip', subject: input.ip, limit: 10, windowSeconds: 900 });
  await consumeRateLimit({ action: 'login_account', subject: phone, limit: 5, windowSeconds: 900 });

  const user = await db.user.findUnique({ where: { phone } });
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !valid) throw errors.unauthorized('Incorrect phone number or password');
  if (user.status === 'REJECTED') throw errors.forbidden('This account was not approved');
  if (user.userType === 'CUSTOMER' && user.status === 'REGISTERED') {
    throw errors.forbidden('Verify your phone number to continue');
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

/** Access recovery (AUTH-04): OTP to the verified phone, then password reset that revokes sessions. */
export async function requestRecovery(input: { phone: string; ip: string }): Promise<OtpDelivery | { delivered: false }> {
  const phone = requirePhone(input.phone);
  await consumeRateLimit({ action: 'recovery_ip', subject: input.ip, limit: 10, windowSeconds: 3600 });
  const user = await db.user.findUnique({ where: { phone } });
  if (!user || !user.phoneVerifiedAt) return { delivered: false }; // no enumeration: same response shape
  return issueOtp(user.id, phone, RECOVERY_PURPOSE);
}

export async function completeRecovery(input: { phone: string; code: string; newPassword: string }): Promise<void> {
  assertPasswordPolicy(input.newPassword);
  const { userId } = await verifyOtp({ phone: input.phone, code: input.code, purpose: RECOVERY_PURPOSE });
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(tx, { actorId: userId, action: 'auth.password_reset', entityType: 'user', entityId: userId });
  });
}
