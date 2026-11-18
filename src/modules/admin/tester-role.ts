import 'server-only';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { createStaffUser } from './roles';

/**
 * ADMIN_TESTER: the approved remote administrator tester role (docs/testing/ADMIN_TESTER_PERMISSION_MATRIX.md).
 * 36 of 53 permission codes. Withheld by design: role.manage, settings.manage, backup.*, integration.view,
 * import.override_stale, all finance.* and invoice.issue, customer.edit_commercial, price.level.manage, notification.send.
 */
export const ADMIN_TESTER_ROLE = 'ADMIN_TESTER';

export const ADMIN_TESTER_PERMISSIONS: readonly string[] = [
  'admin.access',
  'catalog.view', 'catalog.manage', 'category.manage', 'image.manage',
  'price.view', 'price.edit',
  'inventory.view', 'inventory.adjust', 'inventory.reservation.manage', 'reservation.view',
  'import.preview', 'import.commit',
  'customer.view', 'customer.approve', 'customer.suspend',
  'order.view', 'order.edit', 'order.lock_prep', 'order.cancel.approve', 'order.merge.manage',
  'fulfillment.view', 'fulfillment.assign', 'fulfillment.pick', 'fulfillment.pack', 'fulfillment.check',
  'fulfillment.handover', 'fulfillment.discrepancy.resolve', 'fulfillment.print',
  'report.view', 'report.export',
  'audit.view',
  'content.edit', 'content.publish',
  'shipping.manage', 'courier.manage',
];

/** Codes that must never be granted to the tester, even by a future edit of the list above. */
export const ADMIN_TESTER_FORBIDDEN = [
  'role.manage', 'settings.manage', 'backup.manage', 'backup.restore', 'integration.view', 'import.override_stale',
  'finance.view', 'finance.adjustment.create', 'finance.adjustment.approve', 'finance.allocate',
  'finance.fee_payment.record', 'finance.reconcile', 'finance.remittance.record', 'invoice.issue',
  'customer.edit_commercial', 'price.level.manage', 'notification.send',
] as const;

/**
 * Creates the ADMIN_TESTER role once, with exactly the approved codes. It refuses to run when the role exists with a
 * different set, so an existing role is never silently changed. Audited under the owner.
 */
export async function ensureAdminTesterRole(actorId: string): Promise<{ created: boolean; permissionCount: number }> {
  const overlap = ADMIN_TESTER_PERMISSIONS.filter((c) => (ADMIN_TESTER_FORBIDDEN as readonly string[]).includes(c));
  if (overlap.length) throw errors.conflict(`Approved list contains withheld codes: ${overlap.join(', ')}`);

  const existing = await db.role.findUnique({
    where: { name: ADMIN_TESTER_ROLE },
    include: { permissions: { include: { permission: true } } },
  });
  if (existing) {
    const current = existing.permissions.map((rp) => rp.permission.code).sort();
    const wanted = [...ADMIN_TESTER_PERMISSIONS].sort();
    if (current.length !== wanted.length || current.some((c, i) => c !== wanted[i])) {
      throw errors.conflict('ADMIN_TESTER exists with a different permission set. It is not changed automatically.');
    }
    return { created: false, permissionCount: current.length };
  }

  const known = await db.permission.findMany({ where: { code: { in: [...ADMIN_TESTER_PERMISSIONS] } }, select: { id: true, code: true } });
  if (known.length !== ADMIN_TESTER_PERMISSIONS.length) {
    const missing = ADMIN_TESTER_PERMISSIONS.filter((c) => !known.some((k) => k.code === c));
    throw errors.validation(`Unknown permission code(s): ${missing.join(', ')}`);
  }

  await db.$transaction(async (tx) => {
    const role = await tx.role.create({ data: { name: ADMIN_TESTER_ROLE, nameAr: 'مختبر المدير', isSystem: false } });
    await tx.rolePermission.createMany({ data: known.map((k) => ({ roleId: role.id, permissionId: k.id })) });
    await writeAudit(tx, {
      actorId,
      action: 'role.create',
      entityType: 'role',
      entityId: role.id,
      after: { name: ADMIN_TESTER_ROLE, permissions: [...ADMIN_TESTER_PERMISSIONS].sort() },
      reason: 'Approved remote administrator tester role (ADMIN_TESTER_PERMISSION_MATRIX.md)',
    });
  });
  return { created: true, permissionCount: known.length };
}

/** Creates the tester's staff account with the ADMIN_TESTER role. The owner acts; the password is set by the caller. */
export async function createAdminTesterAccount(input: {
  ownerId: string;
  ownerPermissions: ReadonlySet<string>;
  phone: string;
  fullNameEn: string;
  password: string;
}) {
  await ensureAdminTesterRole(input.ownerId);
  return createStaffUser(
    input.ownerId,
    { phone: input.phone, fullNameEn: input.fullNameEn, password: input.password, roleNames: [ADMIN_TESTER_ROLE] },
    null,
    { permissions: input.ownerPermissions, isOwner: true },
  );
}
