import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { loadCurrentUserByUserId } from '@/lib/session';
import { ADMIN_TESTER_FORBIDDEN, ADMIN_TESTER_PERMISSIONS, ADMIN_TESTER_ROLE, createAdminTesterAccount, ensureAdminTesterRole } from '@/modules/admin/tester-role';
import { actorFor, STAFF, uniquePhone } from '../helpers/fixtures';

/** Approved ADMIN_TESTER role (matrix: 36 of 53 codes). Test database only. */
const createdUserIds: string[] = [];
afterAll(async () => {
  for (const id of createdUserIds) {
    await db.session.deleteMany({ where: { userId: id } });
    await db.userRole.deleteMany({ where: { userId: id } });
    await db.user.deleteMany({ where: { id } });
  }
});

describe('ADMIN_TESTER approved model', () => {
  it('the approved list has exactly 36 codes, all real, and none of the withheld codes', async () => {
    expect(ADMIN_TESTER_PERMISSIONS).toHaveLength(36);
    expect(new Set(ADMIN_TESTER_PERMISSIONS).size).toBe(36);
    for (const withheld of ADMIN_TESTER_FORBIDDEN) expect(ADMIN_TESTER_PERMISSIONS).not.toContain(withheld);
    const known = await db.permission.findMany({ where: { code: { in: [...ADMIN_TESTER_PERMISSIONS] } } });
    expect(known).toHaveLength(36);
  });

  it('the role is created once with exactly the approved set, and never silently changed', async () => {
    const owner = await actorFor(STAFF.manager);
    await ensureAdminTesterRole(owner.id);
    const again = await ensureAdminTesterRole(owner.id);
    expect(again.created).toBe(false);
    const role = await db.role.findUniqueOrThrow({ where: { name: ADMIN_TESTER_ROLE }, include: { permissions: { include: { permission: true } } } });
    expect(role.permissions.map((rp) => rp.permission.code).sort()).toEqual([...ADMIN_TESTER_PERMISSIONS].sort());
    const audit = await db.auditLog.findFirst({ where: { entityId: role.id, action: 'role.create' } });
    expect(audit?.actorId).toBe(owner.id);
  });

  it('a tester account holds only ADMIN_TESTER and cannot reach withheld codes', async () => {
    const owner = await actorFor(STAFF.manager);
    const phone = uniquePhone();
    const created = await createAdminTesterAccount({
      ownerId: owner.id,
      ownerPermissions: owner.permissions,
      phone,
      fullNameEn: 'Remote Admin Tester',
      password: 'Temp-Tester-Pass-2026',
    });
    createdUserIds.push(created.id);
    expect(created.roles).toEqual([ADMIN_TESTER_ROLE]);
    const user = await loadCurrentUserByUserId(created.id);
    expect(user?.userType).toBe('STAFF');
    expect(user?.status).toBe('ACTIVE');
    expect(user?.permissions.has('admin.access')).toBe(true);
    for (const withheld of ADMIN_TESTER_FORBIDDEN) expect(user?.permissions.has(withheld)).toBe(false);
  });
});

/** Phase 1 functions named by the owner, each mapped to the route permission it needs (checked against src/app/api). */
const PHASE1_FUNCTION_PERMISSIONS: Record<string, string[]> = {
  'product creation and editing': ['admin.access', 'catalog.view', 'catalog.manage'],
  'product image uploads': ['image.manage'],
  'individual product pricing': ['price.view', 'price.edit'],
  'product categories': ['category.manage'],
  'inventory management': ['inventory.view', 'inventory.adjust'],
  'order management': ['order.view', 'order.edit', 'order.lock_prep'],
  'shipping and courier configuration': ['shipping.manage', 'courier.manage'],
};

describe('ADMIN_TESTER covers the Phase 1 functions', () => {
  it('every named function has all its route permissions in the approved set', () => {
    for (const [fn, codes] of Object.entries(PHASE1_FUNCTION_PERMISSIONS)) {
      for (const code of codes) expect(ADMIN_TESTER_PERMISSIONS, `${fn} needs ${code}`).toContain(code);
    }
  });
});
