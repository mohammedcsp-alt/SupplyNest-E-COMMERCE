import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { loadCurrentUserByUserId, createSession } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { changeOwnPassword, authenticate } from '@/modules/identity/auth-service';
import { createOwnerAccount, getOwnerUserId, isOwnerAccount, OWNER_SETTING_KEY } from '@/modules/admin/owner';
import { freshIp, uniquePhone } from '../helpers/fixtures';

/**
 * Owner account: one permanent MANAGER account created by the operator command, protected from cleanup, with a
 * signed-in password change. The owner setting is cleared before and after this file (test database only).
 */
const OWNER_PASSWORD = 'Owner-Pass-2026a';
let createdIds: string[] = [];

beforeAll(async () => {
  await db.systemSetting.deleteMany({ where: { key: OWNER_SETTING_KEY } });
});

afterAll(async () => {
  for (const id of createdIds) {
    await db.userRole.deleteMany({ where: { userId: id } });
    await db.session.deleteMany({ where: { userId: id } });
    await db.user.deleteMany({ where: { id } });
  }
  await db.systemSetting.deleteMany({ where: { key: OWNER_SETTING_KEY } });
});

describe('owner account (MANAGER, protected, not created by registration)', () => {
  it('creates a STAFF owner with the MANAGER role and every permission, and records it as the owner', async () => {
    const phone = uniquePhone();
    const owner = await createOwnerAccount({ phone, fullName: 'System Owner', password: OWNER_PASSWORD });
    createdIds.push(owner.userId);
    const u = await db.user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(u.userType).toBe('STAFF');
    expect(u.status).toBe('ACTIVE');
    const current = await loadCurrentUserByUserId(owner.userId);
    expect(current?.permissions.has(PERMISSIONS.ADMIN_ACCESS)).toBe(true);
    expect(current?.permissions.has(PERMISSIONS.ROLE_MANAGE)).toBe(true);
    expect(current?.permissions.has(PERMISSIONS.PRICE_EDIT)).toBe(true);
    expect(await getOwnerUserId()).toBe(owner.userId);
    expect(await isOwnerAccount(owner.userId)).toBe(true);
  });

  it('refuses a second owner and refuses a phone that already has an account', async () => {
    await expect(createOwnerAccount({ phone: uniquePhone(), fullName: 'Second Owner', password: OWNER_PASSWORD })).rejects.toMatchObject({ code: 'CONFLICT' });
    const existing = await db.user.findFirstOrThrow({ where: { userType: 'CUSTOMER' }, select: { phone: true } });
    await expect(createOwnerAccount({ phone: existing.phone, fullName: 'Dup', password: OWNER_PASSWORD })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects an invalid phone, a weak password and an empty name before writing anything', async () => {
    await expect(createOwnerAccount({ phone: '12345', fullName: 'X Y', password: OWNER_PASSWORD })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(createOwnerAccount({ phone: uniquePhone(), fullName: 'X Y', password: 'short' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(createOwnerAccount({ phone: uniquePhone(), fullName: ' ', password: OWNER_PASSWORD })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('signed-in password change', () => {
  it('requires the current password, applies the policy, signs out sessions and the new password works', async () => {
    const owner = await db.user.findFirstOrThrow({ where: { id: { in: createdIds } } });
    const ip = freshIp();
    await expect(changeOwnPassword({ userId: owner.id, currentPassword: 'Wrong-Pass-9999', newPassword: 'Next-Pass-2026b', ip })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(changeOwnPassword({ userId: owner.id, currentPassword: OWNER_PASSWORD, newPassword: OWNER_PASSWORD, ip })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(changeOwnPassword({ userId: owner.id, currentPassword: OWNER_PASSWORD, newPassword: 'nodigitsatall', ip })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const session = await createSession(owner.id, 'owner-test');
    void session;
    await changeOwnPassword({ userId: owner.id, currentPassword: OWNER_PASSWORD, newPassword: 'Next-Pass-2026b', ip });

    await expect(authenticate({ phone: owner.phone, password: OWNER_PASSWORD, ip: freshIp() })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const again = await authenticate({ phone: owner.phone, password: 'Next-Pass-2026b', ip: freshIp() });
    expect(again.id).toBe(owner.id);
    const live = await db.session.count({ where: { userId: owner.id, revokedAt: null } });
    expect(live).toBe(0);
    const audit = await db.auditLog.count({ where: { action: 'auth.password_change', entityId: owner.id } });
    expect(audit).toBeGreaterThanOrEqual(1);
  });
});
