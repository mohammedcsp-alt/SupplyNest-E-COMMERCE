import 'server-only';
import { db } from '@/lib/db';
import type { Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { revokeAllSessions } from '@/lib/session';
import type { CurrentUser } from '@/lib/session';
import { recordStatusChange } from './status';
import { notify } from '@/modules/notifications/notify';

export type ActorRef = Pick<CurrentUser, 'id'>;

async function loadCustomer(tx: Tx, customerId: string) {
  const u = await tx.user.findUnique({
    where: { id: customerId },
    include: { customerProfile: true },
  });
  if (!u || u.userType !== 'CUSTOMER' || !u.customerProfile) throw errors.notFound('Customer not found');
  return u;
}

async function requireActiveLevel(tx: Tx, priceLevelId: string) {
  const level = await tx.priceLevel.findUnique({ where: { id: priceLevelId } });
  if (!level || !level.active) throw errors.validation('Select an active price level');
  return level;
}

/** Approves a verified registration, assigns the price level and activates the account (CUSTOMER-004). */
export async function approveCustomer(actor: ActorRef, input: { customerId: string; priceLevelId: string; reason?: string; ip?: string }) {
  return db.$transaction(async (tx) => {
    const u = await loadCustomer(tx, input.customerId);
    if (u.status !== 'APPROVAL_PENDING') throw errors.conflict(`Account is ${u.status}; only pending approvals can be activated`);
    const level = await requireActiveLevel(tx, input.priceLevelId);

    await recordStatusChange(tx, { subjectId: u.id, from: 'APPROVAL_PENDING', to: 'ACTIVE', reason: input.reason ?? 'approved', actorId: actor.id });
    await tx.user.update({ where: { id: u.id }, data: { status: 'ACTIVE' } });
    await tx.customerProfile.update({
      where: { userId: u.id },
      data: { currentPriceLevelId: level.id, businessIdentityLocked: true },
    });
    await tx.customerPriceAssignment.create({
      data: { customerId: u.id, priceLevelId: level.id, assignedById: actor.id, reason: input.reason ?? 'approval' },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'customer.approve',
      entityType: 'user',
      entityId: u.id,
      before: { status: u.status },
      after: { status: 'ACTIVE', priceLevel: level.code },
      reason: input.reason ?? null,
      ip: input.ip ?? null,
    });
    await notify(tx, u.id, 'account.approved', { priceLevel: level.code });
    return { customerId: u.id, status: 'ACTIVE' as const, priceLevelCode: level.code };
  });
}

export async function rejectCustomer(actor: ActorRef, input: { customerId: string; reason: string; ip?: string }) {
  return db.$transaction(async (tx) => {
    const u = await loadCustomer(tx, input.customerId);
    if (u.status !== 'APPROVAL_PENDING' && u.status !== 'REGISTERED') throw errors.conflict(`Account is ${u.status}`);
    await recordStatusChange(tx, { subjectId: u.id, from: u.status, to: 'REJECTED', reason: input.reason, actorId: actor.id });
    await tx.user.update({ where: { id: u.id }, data: { status: 'REJECTED' } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'customer.reject',
      entityType: 'user',
      entityId: u.id,
      before: { status: u.status },
      after: { status: 'REJECTED' },
      reason: input.reason,
      ip: input.ip ?? null,
    });
    await notify(tx, u.id, 'account.rejected', {});
    return { customerId: u.id, status: 'REJECTED' as const };
  });
}

/**
 * Suspension hides prices and blocks new orders immediately (status is read per request), keeps history,
 * and does NOT automatically cancel orders or release reservations (OPEN-20).
 */
export async function suspendCustomer(actor: ActorRef, input: { customerId: string; reason: string; ip?: string }) {
  const result = await db.$transaction(async (tx) => {
    const u = await loadCustomer(tx, input.customerId);
    if (u.status !== 'ACTIVE') throw errors.conflict(`Only ACTIVE accounts can be suspended (current: ${u.status})`);
    const activeReservations = await tx.inventoryReservation.count({
      where: { order: { customerId: u.id }, status: { in: ['ACTIVE', 'REVIEW_REQUIRED', 'EXTENDED'] } },
    });
    await recordStatusChange(tx, { subjectId: u.id, from: 'ACTIVE', to: 'SUSPENDED', reason: input.reason, actorId: actor.id });
    await tx.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'customer.suspend',
      entityType: 'user',
      entityId: u.id,
      before: { status: 'ACTIVE' },
      after: { status: 'SUSPENDED', activeReservationLines: activeReservations },
      reason: input.reason,
      ip: input.ip ?? null,
    });
    await notify(tx, u.id, 'account.suspended', {});
    return { customerId: u.id, status: 'SUSPENDED' as const, activeReservationLines: activeReservations };
  });
  return result;
}

export async function reactivateCustomer(actor: ActorRef, input: { customerId: string; reason: string; ip?: string }) {
  return db.$transaction(async (tx) => {
    const u = await loadCustomer(tx, input.customerId);
    if (u.status !== 'SUSPENDED') throw errors.conflict(`Account is ${u.status}, not SUSPENDED`);
    await recordStatusChange(tx, { subjectId: u.id, from: 'SUSPENDED', to: 'ACTIVE', reason: input.reason, actorId: actor.id });
    await tx.user.update({ where: { id: u.id }, data: { status: 'ACTIVE' } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'customer.reactivate',
      entityType: 'user',
      entityId: u.id,
      before: { status: 'SUSPENDED' },
      after: { status: 'ACTIVE' },
      reason: input.reason,
      ip: input.ip ?? null,
    });
    await notify(tx, u.id, 'account.reactivated', {});
    return { customerId: u.id, status: 'ACTIVE' as const };
  });
}

/** Changes the customer's price level with history. Pending accounts must be approved first (CUSTOMER-004). */
export async function changePriceLevel(actor: ActorRef, input: { customerId: string; priceLevelId: string; reason: string; ip?: string }) {
  return db.$transaction(async (tx) => {
    const u = await loadCustomer(tx, input.customerId);
    if (u.status === 'REGISTERED' || u.status === 'APPROVAL_PENDING' || u.status === 'REJECTED') {
      throw errors.conflict('Assign a price level through approval, not directly');
    }
    const level = await requireActiveLevel(tx, input.priceLevelId);
    const before = await tx.customerProfile.findUnique({ where: { userId: u.id }, include: { priceLevel: true } });
    await tx.customerProfile.update({ where: { userId: u.id }, data: { currentPriceLevelId: level.id } });
    await tx.customerPriceAssignment.create({ data: { customerId: u.id, priceLevelId: level.id, assignedById: actor.id, reason: input.reason } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: 'customer.price_level.change',
      entityType: 'user',
      entityId: u.id,
      before: { priceLevel: before?.priceLevel?.code ?? null },
      after: { priceLevel: level.code },
      reason: input.reason,
      ip: input.ip ?? null,
    });
    return { customerId: u.id, priceLevelCode: level.code };
  });
}

/** Revokes every session of a customer (used on rejection/suspension when a manager requests it). */
export async function forceLogout(actor: ActorRef, customerId: string, reason: string) {
  const count = await revokeAllSessions(customerId);
  await db.auditLog.create({
    data: { actorId: actor.id, action: 'customer.force_logout', entityType: 'user', entityId: customerId, reason, after: { revoked: count } },
  });
  return count;
}

/** Customer self-service profile update. Protected commercial fields are locked once the identity is approved (CUSTOMER-005). */
export async function updateOwnProfile(
  user: { id: string; status: string },
  input: { displayName?: string; legalName?: string | null },
) {
  return db.$transaction(async (tx) => {
    const profile = await tx.customerProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw errors.notFound();
    if (input.legalName !== undefined && profile.businessIdentityLocked && input.legalName !== profile.legalName) {
      throw errors.forbidden('Business identity is locked after approval. Contact support to change it.');
    }
    const updated = await tx.customerProfile.update({
      where: { userId: user.id },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.legalName !== undefined && !profile.businessIdentityLocked ? { legalName: input.legalName } : {}),
      },
    });
    await writeAudit(tx, { actorId: user.id, action: 'customer.profile.update', entityType: 'customer_profile', entityId: profile.id, before: { displayName: profile.displayName }, after: { displayName: updated.displayName } });
    return updated;
  });
}
