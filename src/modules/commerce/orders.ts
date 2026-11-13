import 'server-only';
import { Prisma, type OrderStatus } from '@prisma/client';
import { db, type Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { toApiAmount, money, type Money } from '@/lib/money';
import { getNumberSetting } from '@/lib/settings';
import { releaseOrderReservations, releaseSkuReservations, reserveLines } from '@/modules/inventory/inventory';
import { notify } from '@/modules/notifications/notify';
import { setCartLine } from './cart';
import { addHours } from '@/lib/time';

/**
 * Order lifecycle after submission (CUS-10..CUS-15, ORD-02..04, OPEN-11/12/13/14/23).
 * Statuses here are LOCAL only. The fulfillment module owns preparation/shipping states.
 */

export const LOCAL_STATUS_LABELS: Record<OrderStatus, string> = {
  SUBMITTED: 'Submitted',
  ON_HOLD_LOCAL: 'On hold',
  CANCELLATION_REQUESTED: 'Cancellation requested',
  CANCELLED: 'Cancelled',
};

/** A fulfillment job that has left PENDING_ASSIGNMENT means preparation has started: edits close. */
async function preparationStarted(tx: Tx, orderId: string, locked: Date | null): Promise<boolean> {
  if (locked) return true;
  const job = await tx.fulfillmentJob.findUnique({ where: { orderId }, select: { status: true } });
  return !!job && job.status !== 'PENDING_ASSIGNMENT' && job.status !== 'CANCELLED';
}

export function presentOrder(o: {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  totalCod: Prisma.Decimal;
  currency: string;
  version: number;
  submittedAt: Date;
  addressSnapshot: Prisma.JsonValue;
  fulfillmentLockedAt?: Date | null;
  items?: Array<{ id: string; skuId: string; skuSnapshot: string; titleSnapshot: string; qualitySnapshot: string | null; qty: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }>;
}) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    subtotal: toApiAmount(o.subtotal),
    shippingFee: toApiAmount(o.shippingFee),
    totalCod: toApiAmount(o.totalCod),
    currency: o.currency,
    version: o.version,
    submittedAt: o.submittedAt,
    address: o.addressSnapshot,
    editable: o.status === 'SUBMITTED' && !o.fulfillmentLockedAt,
    items: (o.items ?? []).map((i) => ({
      id: i.id,
      skuId: i.skuId,
      sku: i.skuSnapshot,
      title: i.titleSnapshot,
      quality: i.qualitySnapshot,
      qty: i.qty,
      unitPrice: toApiAmount(i.unitPrice),
      lineTotal: toApiAmount(i.lineTotal),
    })),
  };
}

export async function listCustomerOrders(customerId: string, opts: { status?: OrderStatus; page: number; pageSize: number }) {
  const where: Prisma.OrderWhereInput = { customerId, ...(opts.status ? { status: opts.status } : {}) };
  const [rows, total] = await Promise.all([
    db.order.findMany({ where, orderBy: { submittedAt: 'desc' }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize }),
    db.order.count({ where }),
  ]);
  return { items: rows.map((o) => presentOrder({ ...o, addressSnapshot: o.addressSnapshot })), total };
}

/** Owner-only read. Other customers receive NOT_FOUND (no existence leak). */
export async function getCustomerOrder(customerId: string, orderId: string) {
  const o = await db.order.findFirst({ where: { id: orderId, customerId }, include: { items: { orderBy: { createdAt: 'asc' } }, events: { orderBy: { occurredAt: 'asc' } }, cancellation: true } });
  if (!o) throw errors.notFound('Order not found');
  return {
    ...presentOrder(o),
    events: o.events.map((e) => ({ type: e.eventType, from: e.fromStatus, to: e.toStatus, reason: e.reason, occurredAt: e.occurredAt })),
    cancellation: o.cancellation ? { status: o.cancellation.status, reason: o.cancellation.reason, decisionNote: o.cancellation.decisionNote } : null,
  };
}

/* ------------------------------------------------------------ customer edit (ORD-02) */

export type EditLine = { sku: string; qty: number };

export async function editOrder(input: { customerId: string; priceLevelId: string; priceLevelCode: string; orderId: string; expectedVersion: number; lines: EditLine[]; acceptPriceChanges: boolean; ip?: string | null }) {
  const maxQty = await getNumberSetting(db, 'order.maxQtyPerSku', 100);
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty < 0 || l.qty > maxQty) throw errors.validation(`Quantity must be 0–${maxQty}`);
  }
  return db.$transaction(
    async (tx) => {
      // Lock the order row so concurrent edits/cancellations serialize.
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${input.orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
      if (!order || order.customerId !== input.customerId) throw errors.notFound('Order not found');
      if (order.version !== input.expectedVersion) throw errors.conflict('This order changed. Reload it and review again.', { currentVersion: order.version });
      if (order.status !== 'SUBMITTED') throw errors.conflict(`Orders in status ${order.status} cannot be edited`);
      if (await preparationStarted(tx, order.id, order.fulfillmentLockedAt)) {
        throw errors.conflict('Preparation has started. Edits are closed; request cancellation instead.');
      }

      const skuCodes = [...new Set(input.lines.map((l) => l.sku.trim().toUpperCase()))];
      const skus = await tx.sku.findMany({ where: { sku: { in: skuCodes }, published: true, active: true, deletedAt: null }, include: { quality: true, tierPrices: { where: { priceLevelId: input.priceLevelId } } } });
      const bySku = new Map(skus.map((s) => [s.sku, s]));
      const desired = new Map<string, { skuId: string; qty: number; price: Money | null }>();
      for (const l of input.lines) {
        const code = l.sku.trim().toUpperCase();
        if (l.qty === 0) continue;
        const s = bySku.get(code);
        if (!s) throw errors.validation(`SKU ${code} is not available`);
        if (!s.tierPrices[0]) throw errors.conflict(`SKU ${code} has no price for your account`);
        desired.set(s.id, { skuId: s.id, qty: l.qty, price: money(s.tierPrices[0].amount) });
      }
      // Replacement semantics: the submitted lines are the complete desired state of the order.
      const currentBySku = new Map(order.items.map((i) => [i.skuId, i]));

      const priceChanges: Array<{ sku: string; from: string; to: string }> = [];
      const allSkuIds = new Set([...currentBySku.keys(), ...desired.keys()]);
      const plannedLines: Array<{ skuId: string; qty: number; unitPrice: Money }> = [];

      for (const skuId of allSkuIds) {
        const oldItem = currentBySku.get(skuId);
        const want = desired.get(skuId);
        if (!want) {
          // removed line
          await releaseSkuReservations(tx, { orderId: order.id, skuId, actorId: input.customerId, reason: 'line removed by customer' });
          // pick lines of a still-pending job reference the item; they hold no counts yet, so they go with it
          await tx.pickLine.deleteMany({ where: { orderItemId: oldItem!.id } });
          await tx.orderItem.delete({ where: { id: oldItem!.id } });
          continue;
        }
        if (oldItem && oldItem.qty === want.qty) {
          // unchanged line keeps its snapshot price (OPEN-11)
          plannedLines.push({ skuId, qty: oldItem.qty, unitPrice: oldItem.unitPrice });
          continue;
        }
        // added or quantity changed: reprice at current level price; require consent to any price difference
        const newPrice = want.price!;
        if (oldItem && !oldItem.unitPrice.equals(newPrice)) priceChanges.push({ sku: oldItem.skuSnapshot, from: oldItem.unitPrice.toFixed(0), to: newPrice.toFixed(0) });
        if (oldItem) await releaseSkuReservations(tx, { orderId: order.id, skuId, actorId: input.customerId, reason: 'quantity changed by customer' });
        await reserveLines(tx, { orderId: order.id, lines: [{ skuId, qty: want.qty }], expiresAt: addHours(new Date(), await getNumberSetting(tx, 'reservation.hours', 24)), actorId: input.customerId });
        plannedLines.push({ skuId, qty: want.qty, unitPrice: newPrice });
      }

      if (priceChanges.length > 0 && !input.acceptPriceChanges) {
        throw errors.priceChanged('Some edited items have a different price. Review the new prices and confirm.', { priceChanges });
      }
      if (plannedLines.length === 0) throw errors.conflict('An order needs at least one item. Request cancellation to remove the whole order.');

      // Apply item rows (updates for changed lines, creates for new lines) and keep the pending job's pick lines in step.
      const job = await tx.fulfillmentJob.findUnique({ where: { orderId: order.id }, select: { id: true } });
      for (const pl of plannedLines) {
        const oldItem = currentBySku.get(pl.skuId);
        const s = skus.find((x) => x.id === pl.skuId) ?? (await tx.sku.findUniqueOrThrow({ where: { id: pl.skuId }, include: { quality: true } }));
        if (oldItem) {
          if (oldItem.qty !== pl.qty || !oldItem.unitPrice.equals(pl.unitPrice)) {
            await tx.orderItem.update({ where: { id: oldItem.id }, data: { qty: pl.qty, unitPrice: pl.unitPrice, lineTotal: pl.unitPrice.mul(pl.qty), priceLevelCode: input.priceLevelCode } });
            if (job) await tx.pickLine.updateMany({ where: { jobId: job.id, orderItemId: oldItem.id }, data: { requestedQty: pl.qty } });
          }
        } else {
          const created = await tx.orderItem.create({
            data: {
              orderId: order.id,
              skuId: s.id,
              skuSnapshot: s.sku,
              titleSnapshot: s.nameEn || s.nameAr,
              qualitySnapshot: s.quality?.code ?? null,
              qty: pl.qty,
              unitPrice: pl.unitPrice,
              lineTotal: pl.unitPrice.mul(pl.qty),
              priceLevelCode: input.priceLevelCode,
            },
          });
          if (job) await tx.pickLine.create({ data: { jobId: job.id, orderItemId: created.id, requestedQty: pl.qty } });
        }
      }

      const fresh = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const subtotal = fresh.reduce((acc, i) => acc.add(i.lineTotal), new Prisma.Decimal(0));
      const totalCod = subtotal.add(order.shippingFee);
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { subtotal, totalCod, version: { increment: 1 } },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          eventType: 'ITEMS_EDITED',
          fromStatus: 'SUBMITTED',
          toStatus: 'SUBMITTED',
          actorId: input.customerId,
          metadata: { priceChanges, newVersion: updated.version, newTotal: totalCod.toFixed(0) },
        },
      });
      await writeAudit(tx, { actorId: input.customerId, action: 'order.edit', entityType: 'order', entityId: order.id, before: { version: order.version, total: order.totalCod.toFixed(0) }, after: { version: updated.version, total: totalCod.toFixed(0) }, ip: input.ip ?? null });
      return presentOrder({ ...updated, addressSnapshot: updated.addressSnapshot });
    },
    { timeout: 20000 },
  );
}

/* ------------------------------------------------------------ cancellation (ORD-03, OPEN-14) */

export async function requestCancellation(input: { customerId: string; orderId: string; reason: string; ip?: string | null }) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${input.orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { cancellation: true } });
    if (!order || order.customerId !== input.customerId) throw errors.notFound('Order not found');
    if (order.status !== 'SUBMITTED' && order.status !== 'ON_HOLD_LOCAL') throw errors.conflict(`Orders in status ${order.status} cannot be cancelled`);
    if (order.cancellation && order.cancellation.status === 'PENDING') throw errors.conflict('A cancellation request is already pending');
    const afterPrepLock = await preparationStarted(tx, order.id, order.fulfillmentLockedAt);
    await tx.cancellationRequest.upsert({
      where: { orderId: order.id },
      update: { status: 'PENDING', reason: input.reason, requestedById: input.customerId, decidedById: null, decidedAt: null, decisionNote: null },
      create: { orderId: order.id, requestedById: input.customerId, reason: input.reason, status: 'PENDING' },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLATION_REQUESTED', version: { increment: 1 } } });
    await tx.orderEvent.create({
      data: { orderId: order.id, eventType: 'CANCELLATION_REQUESTED', fromStatus: order.status, toStatus: 'CANCELLATION_REQUESTED', actorId: input.customerId, reason: input.reason, metadata: { afterPrepLock } },
    });
    await writeAudit(tx, { actorId: input.customerId, action: 'order.cancel.request', entityType: 'order', entityId: order.id, reason: input.reason, ip: input.ip ?? null });
    return { orderId: order.id, status: 'CANCELLATION_REQUESTED' as const, afterPrepLock };
  });
}

/** Manager decision. Approval releases reservations exactly once; after preparation starts approval is refused. */
export async function resolveCancellation(input: { actorId: string; orderId: string; approve: boolean; reason: string; ip?: string | null }) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${input.orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { cancellation: true } });
    if (!order) throw errors.notFound('Order not found');
    if (order.status !== 'CANCELLATION_REQUESTED' || !order.cancellation || order.cancellation.status !== 'PENDING') {
      throw errors.conflict('No pending cancellation request for this order');
    }
    if (input.approve) {
      if (await preparationStarted(tx, order.id, order.fulfillmentLockedAt)) {
        throw errors.conflict('Preparation has already started. Reject the request or handle it through review.');
      }
      await releaseOrderReservations(tx, { orderId: order.id, actorId: input.actorId, reason: `cancellation approved: ${input.reason}` });
      await tx.fulfillmentJob.updateMany({ where: { orderId: order.id, status: 'PENDING_ASSIGNMENT' }, data: { status: 'CANCELLED' } });
      await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', version: { increment: 1 } } });
      await tx.cancellationRequest.update({ where: { orderId: order.id }, data: { status: 'APPROVED', decidedById: input.actorId, decidedAt: new Date(), decisionNote: input.reason } });
      await tx.orderEvent.create({ data: { orderId: order.id, eventType: 'CANCELLED', fromStatus: 'CANCELLATION_REQUESTED', toStatus: 'CANCELLED', actorId: input.actorId, reason: input.reason } });
      await notify(tx, order.customerId, 'order.cancelled', { orderNumber: order.orderNumber });
    } else {
      const prev = await tx.orderEvent.findFirst({
        where: { orderId: order.id, toStatus: 'CANCELLATION_REQUESTED' },
        orderBy: { occurredAt: 'desc' },
        select: { fromStatus: true },
      });
      const back: OrderStatus = prev?.fromStatus === 'ON_HOLD_LOCAL' ? 'ON_HOLD_LOCAL' : 'SUBMITTED';
      await tx.order.update({ where: { id: order.id }, data: { status: back, version: { increment: 1 } } });
      await tx.cancellationRequest.update({ where: { orderId: order.id }, data: { status: 'REJECTED', decidedById: input.actorId, decidedAt: new Date(), decisionNote: input.reason } });
      await tx.orderEvent.create({ data: { orderId: order.id, eventType: 'CANCELLATION_REJECTED', fromStatus: 'CANCELLATION_REQUESTED', toStatus: back, actorId: input.actorId, reason: input.reason } });
      await notify(tx, order.customerId, 'order.cancellation_rejected', { orderNumber: order.orderNumber });
    }
    await writeAudit(tx, { actorId: input.actorId, action: input.approve ? 'order.cancel.approve' : 'order.cancel.reject', entityType: 'order', entityId: order.id, reason: input.reason, ip: input.ip ?? null });
    return { orderId: order.id, status: input.approve ? ('CANCELLED' as const) : ('SUBMITTED' as const) };
  });
}

/* ------------------------------------------------------------ reorder (P07, ACX-07) */

export async function reorderIntoCart(input: { customerId: string; priceLevelId: string | null; orderId: string }) {
  const order = await db.order.findFirst({ where: { id: input.orderId, customerId: input.customerId }, include: { items: true } });
  if (!order) throw errors.notFound('Order not found');
  const maxQty = await getNumberSetting(db, 'order.maxQtyPerSku', 100);
  const report: Array<{ sku: string; status: 'ADDED' | 'SKIPPED'; qty?: number; reason?: string }> = [];
  for (const item of order.items) {
    const qty = Math.min(item.qty, maxQty);
    try {
      await setCartLine({ customerId: input.customerId, priceLevelId: input.priceLevelId, sku: item.skuSnapshot, qty });
      report.push({ sku: item.skuSnapshot, status: 'ADDED', qty });
    } catch (err) {
      report.push({ sku: item.skuSnapshot, status: 'SKIPPED', reason: err instanceof Error ? err.message : 'unavailable' });
    }
  }
  // The original order is intentionally untouched (ACX-07).
  return report;
}

/* ------------------------------------------------------------ merge suggestions (ORD-04, OPEN-13) */

export async function proposeMerge(input: { customerId: string; orderIds: string[]; rationale: string }) {
  const ids = [...new Set(input.orderIds)];
  if (ids.length < 2) throw errors.validation('Select at least two orders');
  return db.$transaction(async (tx) => {
    const orders = await tx.order.findMany({ where: { id: { in: ids } }, include: { fulfillmentJob: true } });
    if (orders.length !== ids.length) throw errors.notFound('One or more orders were not found');
    const first = orders[0];
    for (const o of orders) {
      if (o.customerId !== input.customerId) throw errors.notFound('One or more orders were not found');
      if (o.status !== 'SUBMITTED') throw errors.conflict(`Order ${o.orderNumber} is ${o.status}`);
      if (o.fulfillmentJob && o.fulfillmentJob.status !== 'PENDING_ASSIGNMENT') throw errors.conflict(`Order ${o.orderNumber} is already in preparation`);
      const a = o.addressSnapshot as Record<string, unknown>;
      const b = first.addressSnapshot as Record<string, unknown>;
      if (a.governorate !== b.governorate || a.area !== b.area || a.details !== b.details) throw errors.conflict('Merge suggestions need the same delivery address');
    }
    const proposal = await tx.mergeProposal.create({
      data: { customerId: input.customerId, rationale: input.rationale.slice(0, 500), proposedById: input.customerId, orders: { create: ids.map((orderId) => ({ orderId })) } },
    });
    await writeAudit(tx, { actorId: input.customerId, action: 'order.merge.propose', entityType: 'merge_proposal', entityId: proposal.id, after: { orderIds: ids } });
    return proposal;
  });
}

/** Records acceptance or rejection only. Merge execution is deferred (OPEN-13) and never automatic. */
export async function respondMerge(input: { customerId: string; proposalId: string; accept: boolean }) {
  const p = await db.mergeProposal.findFirst({ where: { id: input.proposalId, customerId: input.customerId } });
  if (!p) throw errors.notFound('Proposal not found');
  if (p.status !== 'PROPOSED') throw errors.conflict('This proposal was already answered');
  return db.mergeProposal.update({ where: { id: p.id }, data: { status: input.accept ? 'ACCEPTED' : 'REJECTED', respondedAt: new Date() } });
}

/* ------------------------------------------------------------ admin local controls (ADM-02) */

export async function setLocalHold(input: { actorId: string; orderId: string; on: boolean; reason: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw errors.notFound('Order not found');
    const from = order.status;
    const to: OrderStatus = input.on ? 'ON_HOLD_LOCAL' : 'SUBMITTED';
    if (!((from === 'SUBMITTED' && input.on) || (from === 'ON_HOLD_LOCAL' && !input.on))) throw errors.conflict(`Cannot change hold from ${from}`);
    await tx.order.update({ where: { id: order.id }, data: { status: to, version: { increment: 1 } } });
    await tx.orderEvent.create({ data: { orderId: order.id, eventType: input.on ? 'HOLD_ON' : 'HOLD_OFF', fromStatus: from, toStatus: to, actorId: input.actorId, reason: input.reason } });
    await writeAudit(tx, { actorId: input.actorId, action: input.on ? 'order.hold' : 'order.unhold', entityType: 'order', entityId: order.id, reason: input.reason });
    return { status: to };
  });
}

/** Locks the order for external preparation: customer edits close (OPEN-12). Idempotent. */
export async function lockForPreparation(input: { actorId: string; orderId: string; reason: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw errors.notFound('Order not found');
    if (order.fulfillmentLockedAt) return { lockedAt: order.fulfillmentLockedAt };
    if (order.status !== 'SUBMITTED') throw errors.conflict(`Cannot lock an order in status ${order.status}`);
    const lockedAt = new Date();
    await tx.order.update({ where: { id: order.id }, data: { fulfillmentLockedAt: lockedAt, version: { increment: 1 } } });
    await tx.orderEvent.create({ data: { orderId: order.id, eventType: 'PREP_LOCKED', fromStatus: 'SUBMITTED', toStatus: 'SUBMITTED', actorId: input.actorId, reason: input.reason } });
    await writeAudit(tx, { actorId: input.actorId, action: 'order.lock_prep', entityType: 'order', entityId: order.id, reason: input.reason });
    return { lockedAt };
  });
}

