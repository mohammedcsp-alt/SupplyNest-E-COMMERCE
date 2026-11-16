import 'server-only';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { normalizeIraqPhone } from '@/modules/identity/phone';
import { assertPasswordPolicy } from '@/modules/identity/auth-service';
import { hashPassword } from '@/lib/passwords';

/**
 * The system owner: one permanent STAFF account holding the existing MANAGER role (all permissions). It is created only
 * by the local operator command (scripts/create-owner.ts), never by public registration. Its user id is stored in
 * system_settings under OWNER_SETTING_KEY, so cleanup scripts can refuse to delete it. No schema change is involved.
 */
export const OWNER_SETTING_KEY = 'owner.account';

export async function getOwnerUserId(): Promise<string | null> {
  const row = await db.systemSetting.findUnique({ where: { key: OWNER_SETTING_KEY }, select: { valueJson: true } });
  const value = row?.valueJson as { userId?: unknown } | null;
  return typeof value?.userId === 'string' ? value.userId : null;
}

export async function isOwnerAccount(userId: string): Promise<boolean> {
  return (await getOwnerUserId()) === userId;
}

export async function createOwnerAccount(input: { phone: string; fullName: string; password: string }): Promise<{ userId: string; phone: string }> {
  const phone = normalizeIraqPhone(input.phone);
  if (!phone) throw errors.validation('Enter a valid Iraqi mobile number (07XXXXXXXXX)');
  const name = input.fullName.trim();
  if (name.length < 2) throw errors.validation('Enter the owner name (at least 2 characters)');
  assertPasswordPolicy(input.password);

  if (await getOwnerUserId()) {
    throw errors.conflict('An owner account already exists. Sign in as the owner and use the account page to change the password.');
  }
  if (await db.user.findUnique({ where: { phone }, select: { id: true } })) {
    throw errors.conflict('This phone number already has an account. Use a different number for the owner.');
  }
  const manager = await db.role.findUniqueOrThrow({ where: { name: 'MANAGER' }, select: { id: true } });
  const passwordHash = await hashPassword(input.password);

  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { phone, passwordHash, userType: 'STAFF', status: 'ACTIVE', phoneVerifiedAt: new Date(), fullNameEn: name.slice(0, 120) },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: manager.id, assignedBy: null } });
    await tx.systemSetting.create({ data: { key: OWNER_SETTING_KEY, valueJson: { userId: user.id }, updatedById: null } });
    await writeAudit(tx, { actorId: null, action: 'owner.create', entityType: 'user', entityId: user.id, after: { roles: ['MANAGER'] } });
    return { userId: user.id, phone };
  });
}
