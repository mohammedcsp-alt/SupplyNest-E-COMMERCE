import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/passwords';
import { createSession, currentUserForToken, loadCurrentUserByUserId, revokeSessionByToken } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { authenticate, completeRecovery, issueOtp, requestRecovery } from '@/modules/identity/auth-service';
import { suspendCustomer } from '@/modules/identity/customer-service';
import { createActiveCustomer, freshIp, STAFF, actorFor, uniquePhone } from '../helpers/fixtures';

/**
 * SEC-004 / section 6 of the remediation brief: authenticated behaviour checked against the real services and the TEST
 * database only. No seeded password is read here except through the existing fixture helpers.
 */
const userIds: string[] = [];
const roleIds: string[] = [];
const STAFF_PASSWORD = 'Admin-Tester-Pass-2026';

afterAll(async () => {
  for (const id of userIds) {
    await db.session.deleteMany({ where: { userId: id } });
    await db.userRole.deleteMany({ where: { userId: id } });
    await db.user.deleteMany({ where: { id } });
  }
  for (const id of roleIds) {
    await db.rolePermission.deleteMany({ where: { roleId: id } });
    await db.role.deleteMany({ where: { id } });
  }
});

/** Creates an ACTIVE staff account with its own password and a custom role carrying the given permission codes. */
async function makeStaff(codes: string[], label: string) {
  const name = `AUTHZ_${randomUUID().slice(0, 8).toUpperCase()}`;
  const role = await db.role.create({ data: { name, nameAr: name, isSystem: false } });
  roleIds.push(role.id);
  const perms = await db.permission.findMany({ where: { code: { in: codes } } });
  await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  const phone = uniquePhone();
  const user = await db.user.create({
    data: {
      phone,
      passwordHash: await hashPassword(STAFF_PASSWORD),
      userType: 'STAFF',
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
      fullNameEn: label,
    },
  });
  userIds.push(user.id);
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return { id: user.id, phone };
}

describe('invalid credentials', () => {
  it('a wrong password is refused with a generic message and creates no session', async () => {
    const staff = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Invalid Cred Check');
    const before = await db.session.count({ where: { userId: staff.id } });
    await expect(authenticate({ phone: staff.phone, password: 'definitely-wrong-1', ip: freshIp(), portal: 'admin' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Incorrect phone number or password' });
    expect(await db.session.count({ where: { userId: staff.id } })).toBe(before);
  });

  it('an unknown phone gets the same generic message (no account enumeration)', async () => {
    await expect(authenticate({ phone: uniquePhone(), password: 'whatever-1234', ip: freshIp(), portal: 'admin' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Incorrect phone number or password' });
  });
});

describe('portal separation (staff and customers cannot cross panels)', () => {
  it('a customer cannot sign in through the administration portal', async () => {
    const customer = await createActiveCustomer();
    await expect(authenticate({ phone: customer.phone, password: 'Test-Pass-1234', ip: freshIp(), portal: 'admin' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    const denial = await db.auditLog.findFirst({ where: { actorId: customer.userId, action: 'auth.portal_denied' } });
    expect(denial).not.toBeNull();
  });

  it('a staff account cannot sign in through the customer portal', async () => {
    const staff = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Portal Check');
    await expect(authenticate({ phone: staff.phone, password: STAFF_PASSWORD, ip: freshIp(), portal: 'customer' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a staff account signs in through the administration portal with the right password', async () => {
    const staff = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Admin Login Check');
    const user = await authenticate({ phone: staff.phone, password: STAFF_PASSWORD, ip: freshIp(), portal: 'admin' });
    expect(user.id).toBe(staff.id);
  });
});

describe('session isolation, logout and expiry', () => {
  it('two administrators hold independent sessions at the same time', async () => {
    const a = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Concurrent A');
    const b = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Concurrent B');
    const sa = await createSession(a.id, 'uat-test-a');
    const sb = await createSession(b.id, 'uat-test-b');
    expect((await currentUserForToken(sa.token))?.id).toBe(a.id);
    expect((await currentUserForToken(sb.token))?.id).toBe(b.id);
  });

  it('logging out one administrator does not end another administrator\'s session', async () => {
    const a = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Logout A');
    const b = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Logout B');
    const sa = await createSession(a.id, null);
    const sb = await createSession(b.id, null);
    await revokeSessionByToken(sa.token);
    expect(await currentUserForToken(sa.token)).toBeNull();
    expect((await currentUserForToken(sb.token))?.id).toBe(b.id);
  });

  it('the same administrator can hold two browsers, and logout in one leaves the other working', async () => {
    const a = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Two Browsers');
    const first = await createSession(a.id, 'browser-1');
    const second = await createSession(a.id, 'browser-2');
    await revokeSessionByToken(first.token);
    expect(await currentUserForToken(first.token)).toBeNull();
    expect((await currentUserForToken(second.token))?.id).toBe(a.id);
  });

  it('an expired session is rejected even though its row exists', async () => {
    const a = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Expiry');
    const s = await createSession(a.id, null);
    await db.session.updateMany({ where: { userId: a.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect(await currentUserForToken(s.token)).toBeNull();
  });

  it('malformed, unknown and absent tokens resolve to nobody', async () => {
    expect(await currentUserForToken(undefined)).toBeNull();
    expect(await currentUserForToken('short')).toBeNull();
    expect(await currentUserForToken('x'.repeat(40))).toBeNull();
  });
});

describe('role-based access at the service layer', () => {
  it('an account with only admin.access carries no business permission it was not granted', async () => {
    const staff = await makeStaff([PERMISSIONS.ADMIN_ACCESS], 'Viewer Only');
    const user = await loadCurrentUserByUserId(staff.id);
    expect(user?.permissions.has(PERMISSIONS.ADMIN_ACCESS)).toBe(true);
    expect(user?.permissions.has(PERMISSIONS.ROLE_MANAGE)).toBe(false);
    expect(user?.permissions.has(PERMISSIONS.PRICE_EDIT)).toBe(false);
  });

  it('staff accounts are outside the customer-management actions (owner and staff cannot be suspended that way)', async () => {
    const manager = await actorFor(STAFF.manager);
    await expect(suspendCustomer(manager, { customerId: manager.id, reason: 'attempt against staff account' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    const row = await db.user.findUniqueOrThrow({ where: { id: manager.id } });
    expect(row.status).toBe('ACTIVE');
  });
});

describe('password recovery', () => {
  it('password recovery never returns the code to the caller (regression: takeover of any verified account)', async () => {
    const customer = await createActiveCustomer();
    const delivery = await requestRecovery({ phone: customer.phone, ip: freshIp() });
    expect(delivery).not.toHaveProperty('devCode');
    expect(delivery).not.toHaveProperty('code');
  });

  it('a recovery code resets the password, revokes existing sessions, and the old password stops working', async () => {
    const customer = await createActiveCustomer();
    const oldSession = await createSession(customer.userId, null);
    // The code is issued by the same service; the test reads it directly (the HTTP response never carries it).
    const issued = await issueOtp(customer.userId, customer.phone, 'ACCESS_RECOVERY');
    const code = issued.devCode;
    expect(code, 'mock provider issues a code in the test environment').toBeTruthy();
    await completeRecovery({ phone: customer.phone, code: code!, newPassword: 'Recovered-Pass-2026' });
    expect(await currentUserForToken(oldSession.token)).toBeNull();
    await expect(authenticate({ phone: customer.phone, password: 'Test-Pass-1234', ip: freshIp(), portal: 'customer' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const ok = await authenticate({ phone: customer.phone, password: 'Recovered-Pass-2026', ip: freshIp(), portal: 'customer' });
    expect(ok.id).toBe(customer.userId);
  });

  it('recovery for an unknown phone returns the same shape and reveals nothing', async () => {
    const result = await requestRecovery({ phone: uniquePhone(), ip: freshIp() });
    expect(result).toEqual({ delivered: false });
  });
});
