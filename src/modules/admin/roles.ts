import 'server-only';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { hashPassword } from '@/lib/passwords';
import { normalizeIraqPhone } from '@/modules/identity/phone';
import { assertPasswordPolicy } from '@/modules/identity/auth-service';

export async function listRoles() {
  const roles = await db.role.findMany({
    orderBy: { name: 'asc' },
    include: { permissions: { include: { permission: true } }, _count: { select: { userRoles: true } } },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    nameAr: r.nameAr,
    isSystem: r.isSystem,
    userCount: r._count.userRoles,
    permissions: r.permissions.map((rp) => rp.permission.code).sort(),
  }));
}

export async function listPermissions() {
  return db.permission.findMany({ orderBy: { code: 'asc' } });
}

/**
 * Replaces a role's permission set. Codes must exist. The system MANAGER role may gain but never lose permissions.
 * Every real change is audited in the same transaction.
 */
export async function setRolePermissions(actorId: string, roleId: string, codes: string[], ip: string | null) {
  const wanted = [...new Set(codes)];
  const known = await db.permission.findMany({ where: { code: { in: wanted } }, select: { id: true, code: true } });
  const unknown = wanted.filter((c) => !known.some((k) => k.code === c));
  if (unknown.length) throw errors.validation(`Unknown permission code(s): ${unknown.join(', ')}`, { fieldErrors: { permissions: [`Unknown: ${unknown.join(', ')}`] } });

  return db.$transaction(async (tx) => {
    const role = await tx.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw errors.notFound('Role not found');
    const current = new Set(role.permissions.map((rp) => rp.permission.code));
    const next = new Set(wanted);
    const removed = [...current].filter((c) => !next.has(c));
    const added = [...next].filter((c) => !current.has(c));
    if (role.name === 'MANAGER' && removed.length > 0) {
      throw errors.conflict('The MANAGER role cannot lose permissions', { removed });
    }
    if (removed.length === 0 && added.length === 0) return { changed: false, added, removed };

    if (removed.length) {
      await tx.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: known.filter((k) => removed.includes(k.code)).map((k) => k.id) } },
      });
    }
    if (added.length) {
      await tx.rolePermission.createMany({
        data: known.filter((k) => added.includes(k.code)).map((k) => ({ roleId: role.id, permissionId: k.id })),
        skipDuplicates: true,
      });
    }
    await writeAudit(tx, {
      actorId,
      action: 'role.permissions.update',
      entityType: 'role',
      entityId: role.id,
      before: { role: role.name, permissions: [...current].sort() },
      after: { role: role.name, permissions: [...next].sort(), added, removed },
      ip,
    });
    return { changed: true, added, removed };
  });
}

/** Creates a STAFF user with the given system or custom roles. The password hash is never returned. */
export async function createStaffUser(
  actorId: string,
  input: { phone: string; fullNameEn: string; password: string; roleNames: string[] },
  ip: string | null,
) {
  const phone = normalizeIraqPhone(input.phone);
  if (!phone) throw errors.validation('Enter a valid Iraqi mobile number (07XXXXXXXXX)', { fieldErrors: { phone: ['Invalid Iraqi mobile number'] } });
  assertPasswordPolicy(input.password);
  const roleNames = [...new Set(input.roleNames)];
  const roles = await db.role.findMany({ where: { name: { in: roleNames } } });
  if (roles.length !== roleNames.length) {
    const missing = roleNames.filter((n) => !roles.some((r) => r.name === n));
    throw errors.validation(`Unknown role(s): ${missing.join(', ')}`, { fieldErrors: { roleNames: [`Unknown: ${missing.join(', ')}`] } });
  }
  if (await db.user.findUnique({ where: { phone }, select: { id: true } })) throw errors.conflict('A user with this phone already exists');
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        phone,
        passwordHash,
        userType: 'STAFF',
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        fullNameEn: input.fullNameEn.trim().slice(0, 120),
      },
    });
    await tx.userRole.createMany({ data: roles.map((r) => ({ userId: user.id, roleId: r.id, assignedBy: actorId })) });
    await writeAudit(tx, {
      actorId,
      action: 'staff.create',
      entityType: 'user',
      entityId: user.id,
      after: { phone, userType: 'STAFF', roles: roleNames },
      ip,
    });
    return { id: user.id, phone, roles: roleNames };
  });
}
