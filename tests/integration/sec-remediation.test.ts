import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clientIp, requestScheme, assertSameOrigin } from '@/lib/api';
import { sessionCookieOptions, loadCurrentUserByUserId } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { createStaffUser, setRolePermissions } from '@/modules/admin/roles';
import { authenticate } from '@/modules/identity/auth-service';
import { createOwnerAccount, OWNER_SETTING_KEY } from '@/modules/admin/owner';
import { freshIp, uniquePhone } from '../helpers/fixtures';

/**
 * SEC-002 / SEC-004 regression tests against the TEST database (b2b_store_test, enforced by tests/setup).
 * Every fixture is uniquely named and removed afterwards.
 */
const createdUserIds: string[] = [];
const createdRoleIds: string[] = [];
const PASSWORD = 'Sec-Remediation-2026';

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.session.deleteMany({ where: { userId: id } });
    await db.userRole.deleteMany({ where: { userId: id } });
    await db.user.deleteMany({ where: { id } });
  }
  for (const id of createdRoleIds) {
    await db.rolePermission.deleteMany({ where: { roleId: id } });
    await db.userRole.deleteMany({ where: { roleId: id } });
    await db.role.deleteMany({ where: { id } });
  }
});

/** A custom, non-system role with exactly the given permission codes. */
async function makeRole(codes: string[]) {
  const name = `SEC_TEST_${randomUUID().slice(0, 8).toUpperCase()}`;
  const role = await db.role.create({ data: { name, nameAr: name, isSystem: false } });
  createdRoleIds.push(role.id);
  const perms = await db.permission.findMany({ where: { code: { in: codes } } });
  await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  return role;
}

/** Creates an active staff user holding the given custom role, and returns its live CurrentUser. */
async function makeStaffWithRole(roleId: string, label: string) {
  const phone = uniquePhone();
  const user = await db.user.create({
    data: { phone, passwordHash: 'x', userType: 'STAFF', status: 'ACTIVE', phoneVerifiedAt: new Date(), fullNameEn: label },
  });
  createdUserIds.push(user.id);
  await db.userRole.create({ data: { userId: user.id, roleId } });
  const current = await loadCurrentUserByUserId(user.id);
  if (!current) throw new Error('fixture actor not loaded');
  return current;
}

describe('SEC-004 privilege ceiling (createStaffUser)', () => {
  it('an admin holding role.manage but not price.edit cannot create an account with price.edit', async () => {
    const delegator = await makeRole([PERMISSIONS.ADMIN_ACCESS, PERMISSIONS.ROLE_MANAGE, PERMISSIONS.ORDER_VIEW]);
    const actor = await makeStaffWithRole(delegator.id, 'Delegator');
    const priceRole = await makeRole([PERMISSIONS.PRICE_EDIT]);
    await expect(createStaffUser(actor.id, { phone: uniquePhone(), fullNameEn: 'Escalation Try', password: PASSWORD, roleNames: [priceRole.name] }, '10.9.9.9', {
      permissions: actor.permissions,
      isOwner: false,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const audit = await db.auditLog.findFirst({ where: { actorId: actor.id, action: 'security.escalation_denied' } });
    expect(audit).not.toBeNull();
    expect(audit?.ip).toBe('10.9.9.9');
  });

  it('a non-owner cannot assign MANAGER even when it holds every permission of that role', async () => {
    const actor = await makeStaffWithRole((await makeRole([...Object.values(PERMISSIONS)])).id, 'Near-Owner');
    await expect(createStaffUser(actor.id, { phone: uniquePhone(), fullNameEn: 'Second Manager', password: PASSWORD, roleNames: ['MANAGER'] }, null, {
      permissions: actor.permissions,
      isOwner: false,
    })).rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringMatching(/system owner/) });
  });

  it('a holder of permissions may assign a role whose permissions it already holds', async () => {
    const orderRole = await makeRole(['order.view']);
    const actor = await makeStaffWithRole((await makeRole([PERMISSIONS.ADMIN_ACCESS, PERMISSIONS.ROLE_MANAGE, 'order.view'])).id, 'Ok Admin');
    const created = await createStaffUser(actor.id, { phone: uniquePhone(), fullNameEn: 'Within Ceiling', password: PASSWORD, roleNames: [orderRole.name] }, null, {
      permissions: actor.permissions,
      isOwner: false,
    });
    createdUserIds.push(created.id);
    expect(created.roles).toEqual([orderRole.name]);
  });
});

describe('SEC-004 privilege ceiling (setRolePermissions)', () => {
  it('a non-owner cannot add a permission it does not hold to a role', async () => {
    const editor = await makeRole([PERMISSIONS.ADMIN_ACCESS, PERMISSIONS.ROLE_MANAGE]);
    const actor = await makeStaffWithRole(editor.id, 'Role Editor');
    const target = await makeRole(['order.view']);
    await expect(setRolePermissions(actor.id, target.id, ['order.view', PERMISSIONS.PRICE_EDIT], '10.8.8.8', {
      permissions: actor.permissions,
      isOwner: false,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const unchanged = await db.rolePermission.findMany({ where: { roleId: target.id }, include: { permission: true } });
    expect(unchanged.map((rp) => rp.permission.code)).toEqual(['order.view']);
  });

  it('a non-owner cannot edit the MANAGER role', async () => {
    const manager = await db.role.findUniqueOrThrow({ where: { name: 'MANAGER' } });
    const actor = await makeStaffWithRole((await makeRole([PERMISSIONS.ADMIN_ACCESS, PERMISSIONS.ROLE_MANAGE])).id, 'Editor2');
    await expect(setRolePermissions(actor.id, manager.id, [], null, { permissions: actor.permissions, isOwner: false }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringMatching(/system owner/) });
  });
});

describe('SEC-004 owner protection', () => {
  it('only the owner account is recognised as owner; a second MANAGER-level staff is not', async () => {
    await db.systemSetting.deleteMany({ where: { key: OWNER_SETTING_KEY } });
    const owner = await createOwnerAccount({ phone: uniquePhone(), fullName: 'Test Owner', password: 'Owner-Pass-2026b' });
    createdUserIds.push(owner.userId);
    const { isOwnerAccount } = await import('@/modules/admin/owner');
    expect(await isOwnerAccount(owner.userId)).toBe(true);
    const other = await makeStaffWithRole((await makeRole([PERMISSIONS.ROLE_MANAGE])).id, 'Not Owner');
    expect(await isOwnerAccount(other.id)).toBe(false);
    await db.systemSetting.deleteMany({ where: { key: OWNER_SETTING_KEY } });
  });
});

describe('SEC-002 client IP as seen by the application', () => {
  it('ignores client-supplied X-Forwarded-For and X-Real-IP when the server did not set x-b2b-client-ip', () => {
    const req = new NextRequest('http://127.0.0.1:3200/api/v1/auth/login', {
      headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' },
    });
    expect(clientIp(req)).toBe('unknown');
  });

  it('reads only the server-set internal header and rejects absurd values', () => {
    const ok = new NextRequest('http://127.0.0.1:3200/x', { headers: { 'x-b2b-client-ip': '100.64.0.9' } });
    expect(clientIp(ok)).toBe('100.64.0.9');
    const huge = new NextRequest('http://127.0.0.1:3200/x', { headers: { 'x-b2b-client-ip': 'a'.repeat(200) } });
    expect(clientIp(huge)).toBe('unknown');
  });

  it('scheme is https only when the server marked it so', () => {
    expect(requestScheme(new NextRequest('http://127.0.0.1/x', { headers: { 'x-b2b-scheme': 'https' } }))).toBe('https');
    expect(requestScheme(new NextRequest('http://127.0.0.1/x', { headers: { 'x-forwarded-proto': 'https' } }))).toBe('http');
  });
});

describe('SEC-002 repeated authentication attempts are rate limited', () => {
  it('login per IP stops after the limit, even when the attacker changes the account phone', async () => {
    const ip = freshIp();
    let limitedAt = 0;
    for (let i = 1; i <= 12; i++) {
      try {
        // A new phone per attempt: only the per-IP limit (10 per 15 min) can trigger here, not the per-account limit.
        await authenticate({ phone: uniquePhone(), password: 'wrong-password-x', ip, portal: 'customer' });
      } catch (err) {
        if ((err as { code?: string }).code === 'RATE_LIMITED') {
          limitedAt = i;
          break;
        }
      }
    }
    expect(limitedAt).toBe(11);
  });

  it('a different IP is not blocked by another IP exhausting its limit (per-IP isolation)', async () => {
    const attackerIp = freshIp();
    for (let i = 0; i < 11; i++) {
      await authenticate({ phone: uniquePhone(), password: 'wrong-password-x', ip: attackerIp, portal: 'customer' }).catch(() => undefined);
    }
    const otherIp = freshIp();
    await expect(authenticate({ phone: uniquePhone(), password: 'wrong-password-x', ip: otherIp, portal: 'customer' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('SEC-003 cookies and origins', () => {
  it('session cookie is Secure only for HTTPS requests (and always HttpOnly + SameSite=Lax)', () => {
    const exp = new Date(Date.now() + 60_000);
    const plain = sessionCookieOptions(exp, 'http');
    const tls = sessionCookieOptions(exp, 'https');
    expect(plain).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false });
    expect(tls).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true });
  });

  it('accepts the same host and an explicitly trusted origin; rejects any other origin', () => {
    const same = new NextRequest('http://127.0.0.1:3200/api/v1/x', { method: 'POST', headers: { origin: 'http://127.0.0.1:3200', host: '127.0.0.1:3200', 'content-type': 'application/json' } });
    expect(() => assertSameOrigin(same)).not.toThrow();
    const trusted = new NextRequest('http://127.0.0.1:3200/api/v1/x', {
      method: 'POST',
      headers: { origin: 'https://uat-trusted.example.ts.net', host: '127.0.0.1:3200', 'content-type': 'application/json' },
    });
    expect(() => assertSameOrigin(trusted)).not.toThrow();
    const evil = new NextRequest('http://127.0.0.1:3200/api/v1/x', { method: 'POST', headers: { origin: 'https://evil.example', host: '127.0.0.1:3200', 'content-type': 'application/json' } });
    let code: string | undefined;
    try { assertSameOrigin(evil); } catch (err) { code = (err as { code?: string }).code; }
    expect(code).toBe('FORBIDDEN');
  });
});
