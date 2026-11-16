import 'server-only';
import type { Prisma, ReservationStatus } from '@prisma/client';
import { db, type Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { addHours } from '@/lib/time';
import { getNumberSetting } from '@/lib/settings';

/**
 * Inventory core (spec 7, OPEN-01/03/05 defaults, ACX-02/03/08).
 *
 * Model:
 *   physicalOnHand  — imported/adjusted physical units (never negative, DB CHECK).
 *   reservedQty     — units held by LIVE reservations (ACTIVE, REVIEW_REQUIRED, EXTENDED).
 *   available       — max(0, physicalOnHand − reservedQty). Shown to customers only as a binary flag.
 *
 * Concurrency: every change locks the affected inventory_balances rows with SELECT … FOR UPDATE, in ascending
 * SKU order (no deadlocks), inside the caller's transaction. Reservation release is exactly-once: the status
 * transition is a conditional UPDATE, and only the row that flips the status adjusts reservedQty.
 */

export const LIVE_RESERVATION_STATUSES: ReservationStatus[] = ['ACTIVE', 'REVIEW_REQUIRED', 'EXTENDED'];

export function availableOf(physicalOnHand: number, reservedQty: number): number {
  return Math.max(0, physicalOnHand - reservedQty);
}

type BalanceRow = { skuId: string; physicalOnHand: number; reservedQty: number; version: number };

/** Ensures a balance row exists for each SKU, then locks all of them in ascending order. */
export async function lockBalances(tx: Tx, skuIds: string[]): Promise<Map<string, BalanceRow>> {
  const ids = [...new Set(skuIds)].sort();
  if (ids.length === 0) return new Map();
  await tx.inventoryBalance.createMany({ data: ids.map((skuId) => ({ skuId })), skipDuplicates: true });
  const rows = await tx.$queryRaw<BalanceRow[]>`
    SELECT "skuId", "physicalOnHand", "reservedQty", "version"
    FROM "inventory_balances"
    WHERE "skuId" = ANY(${ids}::uuid[])
    ORDER BY "skuId"
    FOR UPDATE
  `;
  return new Map(rows.map((r) => [r.skuId, r]));
}

export type ReserveLine = { skuId: string; qty: number };

/**
 * Reserves stock for an order inside the caller's transaction. Throws STOCK_CHANGED (409) when any line
 * exceeds the currently available quantity; nothing is partially reserved.
 */
export async function reserveLines(
  tx: Tx,
  input: { orderId: string; lines: ReserveLine[]; expiresAt: Date; actorId?: string | null },
): Promise<void> {
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw errors.validation('Reserved quantities must be positive integers');
  }
  const balances = await lockBalances(tx, input.lines.map((l) => l.skuId));
  for (const l of input.lines) {
    const b = balances.get(l.skuId)!;
    const available = availableOf(b.physicalOnHand, b.reservedQty);
    if (l.qty > available) {
      throw errors.stockChanged('Some items no longer have enough available stock', {
        skuId: l.skuId,
        requested: l.qty,
        available,
      });
    }
  }
  for (const l of input.lines) {
    const b = balances.get(l.skuId)!;
    await tx.inventoryBalance.update({
      where: { skuId: l.skuId },
      data: { reservedQty: { increment: l.qty }, version: { increment: 1 } },
    });
    await tx.inventoryReservation.create({
      data: { orderId: input.orderId, skuId: l.skuId, qty: l.qty, status: 'ACTIVE', expiresAt: input.expiresAt },
    });
    await tx.inventoryMovement.create({
      data: {
        skuId: l.skuId,
        qtyDelta: 0,
        balanceAfter: b.physicalOnHand,
        movementType: 'RESERVATION_HOLD',
        sourceRef: input.orderId,
        actorId: input.actorId ?? null,
        note: `reserved +${l.qty}`,
      },
    });
  }
  await syncAlerts(tx, input.lines.map((l) => l.skuId));
}

/**
 * Releases every LIVE reservation of an order exactly once (cancellation, approved release).
 * Returns the number of reservation rows released by THIS call.
 */
export async function releaseOrderReservations(
  tx: Tx,
  input: { orderId: string; actorId: string | null; reason: string; toStatus?: 'RELEASED' },
): Promise<number> {
  const live = await tx.inventoryReservation.findMany({
    where: { orderId: input.orderId, status: { in: LIVE_RESERVATION_STATUSES } },
    select: { id: true, skuId: true, qty: true },
  });
  if (live.length === 0) return 0;
  const balances = await lockBalances(tx, live.map((r) => r.skuId));
  let released = 0;
  for (const r of live) {
    const flipped = await tx.inventoryReservation.updateMany({
      where: { id: r.id, status: { in: LIVE_RESERVATION_STATUSES } },
      data: { status: 'RELEASED', releasedAt: new Date(), reviewReason: input.reason, reviewedById: input.actorId },
    });
    if (flipped.count !== 1) continue; // already released by another path: no double credit
    const b = balances.get(r.skuId)!;
    await tx.inventoryBalance.update({
      where: { skuId: r.skuId },
      data: { reservedQty: { decrement: r.qty }, version: { increment: 1 } },
    });
    await tx.inventoryMovement.create({
      data: {
        skuId: r.skuId,
        qtyDelta: 0,
        balanceAfter: b.physicalOnHand,
        movementType: 'RESERVATION_RELEASE',
        sourceRef: r.id,
        actorId: input.actorId,
        note: `released −${r.qty}: ${input.reason}`,
      },
    });
    released += 1;
  }
  await syncAlerts(tx, live.map((r) => r.skuId));
  return released;
}

/** Releases the live reservations of ONE order line (SKU). Used when an order edit changes that line. */
export async function releaseSkuReservations(
  tx: Tx,
  input: { orderId: string; skuId: string; actorId: string | null; reason: string },
): Promise<number> {
  const live = await tx.inventoryReservation.findMany({
    where: { orderId: input.orderId, skuId: input.skuId, status: { in: LIVE_RESERVATION_STATUSES } },
    select: { id: true, qty: true },
  });
  if (live.length === 0) return 0;
  const balances = await lockBalances(tx, [input.skuId]);
  const b = balances.get(input.skuId)!;
  let released = 0;
  for (const r of live) {
    const flipped = await tx.inventoryReservation.updateMany({
      where: { id: r.id, status: { in: LIVE_RESERVATION_STATUSES } },
      data: { status: 'RELEASED', releasedAt: new Date(), reviewReason: input.reason, reviewedById: input.actorId },
    });
    if (flipped.count !== 1) continue;
    await tx.inventoryBalance.update({ where: { skuId: input.skuId }, data: { reservedQty: { decrement: r.qty }, version: { increment: 1 } } });
    await tx.inventoryMovement.create({
      data: { skuId: input.skuId, qtyDelta: 0, balanceAfter: b.physicalOnHand, movementType: 'RESERVATION_RELEASE', sourceRef: r.id, actorId: input.actorId, note: `line change −${r.qty}: ${input.reason}` },
    });
    released += r.qty;
  }
  await syncAlerts(tx, [input.skuId]);
  return released;
}

/** Consumes reserved units at handover: physical and reserved both decrease by the picked/checked quantity. */
export async function consumeForHandover(
  tx: Tx,
  input: { orderId: string; skuId: string; qty: number; actorId: string | null },
): Promise<void> {
  if (input.qty <= 0) return;
  const balances = await lockBalances(tx, [input.skuId]);
  const b = balances.get(input.skuId)!;
  if (b.reservedQty < input.qty || b.physicalOnHand < input.qty) {
    throw errors.conflict('Stock records do not match the handover quantity; resolve the discrepancy first', {
      skuId: input.skuId,
      qty: input.qty,
    });
  }
  // Consume from the oldest live reservation(s) of this order+SKU.
  let remaining = input.qty;
  const live = await tx.inventoryReservation.findMany({
    where: { orderId: input.orderId, skuId: input.skuId, status: { in: LIVE_RESERVATION_STATUSES } },
    orderBy: { createdAt: 'asc' },
  });
  for (const r of live) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, r.qty);
    if (take === r.qty) {
      const flipped = await tx.inventoryReservation.updateMany({
        where: { id: r.id, status: { in: LIVE_RESERVATION_STATUSES } },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      });
      if (flipped.count !== 1) continue;
    } else {
      // Partial consumption: shrink the live reservation and record the consumed part as a separate CONSUMED row.
      await tx.inventoryReservation.update({ where: { id: r.id }, data: { qty: r.qty - take } });
      await tx.inventoryReservation.create({
        data: { orderId: r.orderId, skuId: r.skuId, qty: take, status: 'CONSUMED', expiresAt: r.expiresAt, consumedAt: new Date() },
      });
    }
    remaining -= take;
  }
  if (remaining > 0) throw errors.conflict('Reservation records are out of step with the handover quantity');

  const newPhysical = b.physicalOnHand - input.qty;
  await tx.inventoryBalance.update({
    where: { skuId: input.skuId },
    data: { physicalOnHand: newPhysical, reservedQty: { decrement: input.qty }, version: { increment: 1 } },
  });
  await tx.inventoryMovement.create({
    data: {
      skuId: input.skuId,
      qtyDelta: -input.qty,
      balanceAfter: newPhysical,
      movementType: 'HANDOVER_DEDUCT',
      sourceRef: input.orderId,
      actorId: input.actorId,
      note: `handed over ${input.qty}`,
    },
  });
  await syncAlerts(tx, [input.skuId]);
}

/**
 * Manual inventory adjustment (ADM-08). Writes a movement with actor and source; never makes the physical count
 * negative and never drops it below live reservations (that would silently create a conflict).
 */
export async function adjustPhysical(
  tx: Tx,
  input: { skuId: string; mode: 'SET' | 'DELTA'; value: number; reason: string; actorId: string },
): Promise<{ before: number; after: number }> {
  const balances = await lockBalances(tx, [input.skuId]);
  const b = balances.get(input.skuId)!;
  const after = input.mode === 'SET' ? input.value : b.physicalOnHand + input.value;
  if (!Number.isInteger(after)) throw errors.validation('Quantity must be an integer');
  if (after < 0) throw errors.validation('Physical stock cannot be negative');
  if (after < b.reservedQty) {
    throw errors.conflict(
      `Physical stock cannot drop below ${b.reservedQty} live reserved units. Release or resolve reservations first.`,
      { reservedQty: b.reservedQty },
    );
  }
  await tx.inventoryBalance.update({
    where: { skuId: input.skuId },
    data: { physicalOnHand: after, version: { increment: 1 } }, // manual edits are NOT a trusted source: sourceTimestamp unchanged
  });
  await tx.inventoryMovement.create({
    data: {
      skuId: input.skuId,
      qtyDelta: after - b.physicalOnHand,
      balanceAfter: after,
      movementType: 'MANUAL_ADJUST',
      actorId: input.actorId,
      note: input.reason,
    },
  });
  await writeAudit(tx, {
    actorId: input.actorId,
    action: 'inventory.adjust',
    entityType: 'sku',
    entityId: input.skuId,
    before: { physicalOnHand: b.physicalOnHand },
    after: { physicalOnHand: after },
    reason: input.reason,
  });
  await syncAlerts(tx, [input.skuId]);
  return { before: b.physicalOnHand, after };
}

/**
 * Expired reservations go to REVIEW_REQUIRED and keep holding their quantity. Nothing is released automatically
 * (OPEN-01 / INV-01 / ACX-03). Returns the number of reservations moved to review.
 */
export async function sweepExpiredReservations(now: Date = new Date()): Promise<number> {
  return db.$transaction(
    async (tx) => {
      const expired = await tx.inventoryReservation.findMany({
        where: { status: { in: ['ACTIVE', 'EXTENDED'] }, expiresAt: { lte: now } },
        select: { id: true, skuId: true },
      });
      if (expired.length === 0) return 0;
      const res = await tx.inventoryReservation.updateMany({
        where: { id: { in: expired.map((e) => e.id) }, status: { in: ['ACTIVE', 'EXTENDED'] } },
        data: { status: 'REVIEW_REQUIRED' },
      });
      await syncAlerts(tx, [...new Set(expired.map((e) => e.skuId))]);
      return res.count;
    },
    // One sweep covers every expired reservation in one atomic step; the default 5 s interactive timeout is too
    // short once many SKUs have expired holds (D-27). Atomicity is kept; only the time budget grows.
    { timeout: 60_000, maxWait: 10_000 },
  );
}

/** Admin extends a reservation (new expiry, reason mandatory, audited). Only reservation.manage holders reach this. */
export async function extendReservation(
  tx: Tx,
  input: { reservationId: string; hours: number; reason: string; actorId: string },
) {
  if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > 168) throw errors.validation('Extension must be 1–168 hours');
  const r = await tx.inventoryReservation.findUnique({ where: { id: input.reservationId } });
  if (!r) throw errors.notFound('Reservation not found');
  if (!['ACTIVE', 'EXTENDED', 'REVIEW_REQUIRED'].includes(r.status)) throw errors.conflict(`Reservation is ${r.status}`);
  const newExpiry = addHours(new Date(Math.max(Date.now(), r.expiresAt.getTime())), input.hours);
  const updated = await tx.inventoryReservation.update({
    where: { id: r.id },
    data: { status: 'EXTENDED', expiresAt: newExpiry, reviewedById: input.actorId, reviewReason: input.reason },
  });
  await writeAudit(tx, {
    actorId: input.actorId,
    action: 'reservation.extend',
    entityType: 'reservation',
    entityId: r.id,
    before: { status: r.status, expiresAt: r.expiresAt },
    after: { status: 'EXTENDED', expiresAt: newExpiry },
    reason: input.reason,
  });
  await syncAlerts(tx, [r.skuId]);
  return updated;
}

/** Admin releases a reservation that is under review (exactly once, reason mandatory). */
export async function releaseReservationByAdmin(tx: Tx, input: { reservationId: string; reason: string; actorId: string }) {
  const r = await tx.inventoryReservation.findUnique({ where: { id: input.reservationId } });
  if (!r) throw errors.notFound('Reservation not found');
  if (!LIVE_RESERVATION_STATUSES.includes(r.status)) throw errors.conflict(`Reservation is already ${r.status}`);
  // Release only this reservation row (the order may hold other lines).
  const balances = await lockBalances(tx, [r.skuId]);
  const b = balances.get(r.skuId)!;
  const flipped = await tx.inventoryReservation.updateMany({
    where: { id: r.id, status: { in: LIVE_RESERVATION_STATUSES } },
    data: { status: 'RELEASED', releasedAt: new Date(), reviewedById: input.actorId, reviewReason: input.reason },
  });
  if (flipped.count !== 1) throw errors.conflict('Reservation was already released');
  await tx.inventoryBalance.update({ where: { skuId: r.skuId }, data: { reservedQty: { decrement: r.qty }, version: { increment: 1 } } });
  await tx.inventoryMovement.create({
    data: { skuId: r.skuId, qtyDelta: 0, balanceAfter: b.physicalOnHand, movementType: 'RESERVATION_RELEASE', sourceRef: r.id, actorId: input.actorId, note: `admin release −${r.qty}: ${input.reason}` },
  });
  await writeAudit(tx, {
    actorId: input.actorId,
    action: 'reservation.release',
    entityType: 'reservation',
    entityId: r.id,
    before: { status: r.status, qty: r.qty },
    after: { status: 'RELEASED' },
    reason: input.reason,
  });
  await syncAlerts(tx, [r.skuId]);
}

/**
 * Keeps alerts in step with the data (PRODUCT-011 / ADM-11). At most one OPEN alert per SKU and type
 * (partial unique index), so repeated syncs never duplicate notifications.
 */
export async function syncAlerts(tx: Tx, skuIds: string[]): Promise<void> {
  const ids = [...new Set(skuIds)];
  if (ids.length === 0) return;
  const threshold = await getNumberSetting(tx, 'inventory.lowStockThreshold', 5);
  const balances = await tx.inventoryBalance.findMany({ where: { skuId: { in: ids } } });
  const reviewCounts = await tx.inventoryReservation.groupBy({
    by: ['skuId'],
    where: { skuId: { in: ids }, status: 'REVIEW_REQUIRED' },
    _count: { _all: true },
  });
  const reviewBy = new Map(reviewCounts.map((r) => [r.skuId, r._count._all]));

  for (const skuId of ids) {
    const b = balances.find((x) => x.skuId === skuId);
    const physical = b?.physicalOnHand ?? 0;
    const reserved = b?.reservedQty ?? 0;
    const available = availableOf(physical, reserved);
    const desired: Array<{ type: 'LOW_STOCK' | 'STOCK_CONFLICT' | 'RESERVATION_REVIEW'; on: boolean; detail?: Prisma.InputJsonValue }> = [
      { type: 'LOW_STOCK', on: available <= threshold, detail: { available, threshold } },
      { type: 'STOCK_CONFLICT', on: reserved > physical, detail: { physical, reserved } },
      { type: 'RESERVATION_REVIEW', on: (reviewBy.get(skuId) ?? 0) > 0, detail: { reviewCount: reviewBy.get(skuId) ?? 0 } },
    ];
    for (const d of desired) {
      if (d.on) {
        const existing = await tx.inventoryAlert.findFirst({ where: { skuId, alertType: d.type, state: 'OPEN' }, select: { id: true } });
        if (existing) {
          await tx.inventoryAlert.update({ where: { id: existing.id }, data: { detail: d.detail ?? undefined } });
        } else {
          await tx.inventoryAlert.create({ data: { skuId, alertType: d.type, state: 'OPEN', detail: d.detail ?? undefined } });
        }
      } else {
        await tx.inventoryAlert.updateMany({
          where: { skuId, alertType: d.type, state: 'OPEN' },
          data: { state: 'RESOLVED', resolvedAt: new Date() },
        });
      }
    }
  }
}

/** Stale-data alerts (OPEN-04): source timestamp older than the configured window. Run by the sweep job. */
export async function syncStaleAlerts(now: Date = new Date()): Promise<number> {
  return db.$transaction(async (tx) => {
    const hours = await getNumberSetting(tx, 'inventory.staleAfterHours', 24);
    const cutoff = new Date(now.getTime() - hours * 3600 * 1000);
    const stale = await tx.inventoryBalance.findMany({
      where: { sourceTimestamp: { lt: cutoff } },
      select: { skuId: true, sourceTimestamp: true },
    });
    const staleIds = new Set(stale.map((s) => s.skuId));
    for (const s of stale) {
      const existing = await tx.inventoryAlert.findFirst({ where: { skuId: s.skuId, alertType: 'STALE_DATA', state: 'OPEN' }, select: { id: true } });
      if (!existing) {
        await tx.inventoryAlert.create({ data: { skuId: s.skuId, alertType: 'STALE_DATA', detail: { sourceTimestamp: s.sourceTimestamp, staleAfterHours: hours } } });
      }
    }
    // resolve stale alerts for SKUs that became fresh (never changes quantities)
    const open = await tx.inventoryAlert.findMany({ where: { alertType: 'STALE_DATA', state: 'OPEN' }, select: { id: true, skuId: true } });
    const toResolve = open.filter((o) => !staleIds.has(o.skuId)).map((o) => o.id);
    if (toResolve.length) await tx.inventoryAlert.updateMany({ where: { id: { in: toResolve } }, data: { state: 'RESOLVED', resolvedAt: new Date() } });
    return stale.length;
  });
}
