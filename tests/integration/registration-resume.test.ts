import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { confirmRegistrationPhone, registerCustomer } from '@/modules/identity/auth-service';
import { freshIp, uniquePhone } from '../helpers/fixtures';

/**
 * TEST-001: an unverified self-registration is resumed, not refused. Every response has the same shape whatever the
 * existing account's state, so registration cannot be used to learn which numbers have accounts.
 */
describe('registration resume (TEST-001)', () => {
  it('a new number is registered and receives a code', async () => {
    const phone = uniquePhone();
    const r = await registerCustomer({ phone, password: 'Test-Pass-1234', name: 'Resume New', ip: freshIp() });
    expect(r.status).toBe('REGISTERED');
    expect(r.otp.devCode).toMatch(/^\d{6}$/);
  });

  it('an unverified number resumes the same account; the cooldown throttles silently; a later resume issues a fresh code', async () => {
    const phone = uniquePhone();
    await registerCustomer({ phone, password: 'Original-Pass-1', name: 'Resume Owner', ip: freshIp() });
    const before = await db.user.findUniqueOrThrow({ where: { phone } });

    // Inside the 60 s cooldown: same response shape, no new challenge, no error that reveals the account.
    const throttled = await registerCustomer({ phone, password: 'Other-Pass-2', name: 'Someone Else', ip: freshIp() });
    expect(throttled.status).toBe('REGISTERED');
    expect(throttled.otp.devCode).toBeUndefined();
    expect(await db.otpChallenge.count({ where: { userId: before.id, purpose: 'REGISTRATION' } })).toBe(1);

    // After the cooldown the resume issues a fresh code to the same number.
    await db.otpChallenge.updateMany({ where: { userId: before.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    const resumed = await registerCustomer({ phone, password: 'Other-Pass-2', name: 'Someone Else', ip: freshIp() });
    expect(resumed.otp.devCode).toMatch(/^\d{6}$/);

    const after = await db.user.findUniqueOrThrow({ where: { phone } });
    expect(after.id).toBe(before.id);
    expect(after.passwordHash).toBe(before.passwordHash); // the password is never replaced by a resume
    expect(await db.user.count({ where: { phone } })).toBe(1);

    // The fresh code verifies the phone; the earlier challenge was consumed.
    const verified = await confirmRegistrationPhone({ phone, code: resumed.otp.devCode! });
    expect(verified.status).toBe('APPROVAL_PENDING');
  });

  it('a local-format and a +964-format registration of the same number resume one account', async () => {
    const phone = uniquePhone(); // +9647XXXXXXXXX
    const local = '0' + phone.slice(4);
    await registerCustomer({ phone, password: 'Original-Pass-1', name: 'Format Owner', ip: freshIp() });
    await db.otpChallenge.updateMany({ where: { user: { phone } }, data: { createdAt: new Date(Date.now() - 120_000) } });
    const r = await registerCustomer({ phone: local, password: 'Other-Pass-2', name: 'Format Owner', ip: freshIp() });
    expect(r.otp.devCode).toMatch(/^\d{6}$/);
    expect(await db.user.count({ where: { phone } })).toBe(1);
  });

  it('a verified account gets the same response shape and nothing is sent', async () => {
    const phone = uniquePhone();
    await registerCustomer({ phone, password: 'Original-Pass-1', name: 'Verified Owner', ip: freshIp() });
    const user = await db.user.findUniqueOrThrow({ where: { phone } });
    await db.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date(), status: 'APPROVAL_PENDING' } });
    const challengesBefore = await db.otpChallenge.count({ where: { userId: user.id } });

    const r = await registerCustomer({ phone, password: 'Attacker-Pass-3', name: 'Attacker', ip: freshIp() });
    expect(r.status).toBe('REGISTERED');
    expect(r.otp.devCode).toBeUndefined();
    expect(r.otp.delivered).toBe(false);
    expect(await db.otpChallenge.count({ where: { userId: user.id } })).toBe(challengesBefore);
    expect((await db.user.findUniqueOrThrow({ where: { phone } })).passwordHash).toBe(user.passwordHash);
  });
});
