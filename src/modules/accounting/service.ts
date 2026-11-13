import 'server-only';
import { Prisma, type AdjustmentType, type RemittanceMethod, type SettlementMode } from '@prisma/client';
import { db, type Tx } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { money, parseIqdAmount, toApiAmount, sumMoney } from '@/lib/money';
import { PERMISSIONS } from '@/lib/rbac';
import type { CurrentUser } from '@/lib/session';
import { issueInvoiceRevision } from './shipments';
import {
  computeShipmentFinancials,
  aggregateCourier,
  allocatableFor,
  feeOutstandingFor,
  toBig,
  EXPECTED_SIDE_ADJUSTMENTS,
  DUE_SIDE_ADJUSTMENTS,
  type ShipmentFinancials,
} from './math';

/**
 * TEMPORARY ACCOUNTING MODULE (spec Phase 6). Manual entry only: no courier API, no bank integration, no WMS.
 * Money rules: integer IQD (Decimal in DB), posted rows are immutable (DB trigger), corrections are new rows,
 * every write is audited, and collected COD is never inferred from expected COD.
 */

const NEGATIVE_TYPES: AdjustmentType[] = ['REJECTION_PARTIAL', 'REJECTION_FULL', 'RETURN', 'CUSTOMER_REFUND', 'DISCOUNT'];
const GOODS_TYPES: AdjustmentType[] = ['REJECTION_PARTIAL', 'REJECTION_FULL', 'RETURN'];

function need(actor: CurrentUser, perm: string) {
  if (!actor.permissions.has(perm)) throw errors.forbidden();
}

/* ------------------------------------------------------------ couriers & agreements */

export async function createCourier(actor: CurrentUser, input: { name: string; contact?: string | null }) {
  need(actor, PERMISSIONS.COURIER_MANAGE);
  return db.$transaction(async (tx) => {
    const c = await tx.courier.create({ data: { name: input.name.trim(), contact: input.contact ?? null } });
    await writeAudit(tx, { actorId: actor.id, action: 'courier.create', entityType: 'courier', entityId: c.id, after: { name: c.name } });
    return c;
  });
}

export async function createAgreement(
  actor: CurrentUser,
  input: { courierId: string; settlementMode: SettlementMode; effectiveFrom: Date; effectiveTo?: Date | null; governorateId?: string | null; serviceFee: string; returnFee?: string; reason: string },
) {
  need(actor, PERMISSIONS.COURIER_MANAGE);
  const fee = parseIqdAmount(input.serviceFee);
  if (!fee) throw errors.validation('Courier fee must be a whole non-negative IQD amount (0 is allowed)');
  const ret = parseIqdAmount(input.returnFee ?? '0');
  if (!ret) throw errors.validation('Return fee must be a whole non-negative IQD amount');
  if (input.effectiveTo && input.effectiveTo <= input.effectiveFrom) throw errors.validation('Effective end must be after the start');
  return db.$transaction(async (tx) => {
    const courier = await tx.courier.findUnique({ where: { id: input.courierId } });
    if (!courier) throw errors.notFound('Courier not found');
    const a = await tx.courierAgreement.create({
      data: {
        courierId: input.courierId,
        settlementMode: input.settlementMode,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        governorateId: input.governorateId ?? null,
        serviceFee: fee,
        returnFee: ret,
        active: true,
        createdById: actor.id,
      },
    });
    await writeAudit(tx, { actorId: actor.id, action: 'courier.agreement.create', entityType: 'courier_agreement', entityId: a.id, after: { mode: input.settlementMode, fee: fee.toFixed(0) }, reason: input.reason });
    return a;
  });
}

/* ------------------------------------------------------------ shipment helpers */

async function allocatedSum(tx: Tx, shipmentId: string): Promise<string> {
  const agg = await tx.remittanceAllocation.aggregate({ where: { shipmentId }, _sum: { allocatedAmount: true } });
  return (agg._sum.allocatedAmount ?? new Prisma.Decimal(0)).toFixed(0);
}

async function financialsFor(tx: Tx, shipmentId: string): Promise<ShipmentFinancials & { shipment: Awaited<ReturnType<typeof loadShipment>> }> {
  const shipment = await loadShipment(tx, shipmentId);
  const goods = goodsValueOf(shipment);
  const f = computeShipmentFinancials({
    mode: shipment.settlementModeSnapshot,
    goodsTotal: goods,
    customerDeliveryFee: shipment.customerFeeSnapshot.toFixed(0),
    courierFeeSnapshot: shipment.courierFeeSnapshot.toFixed(0),
    codCollected: shipment.codCollected === null ? null : shipment.codCollected.toFixed(0),
    courierFeeDeducted: shipment.courierFeeDeducted === null ? null : shipment.courierFeeDeducted.toFixed(0),
    adjustments: shipment.adjustments.map((a) => ({ type: a.type, signedAmount: a.signedAmount.toFixed(0) })),
    allocatedToShipment: await allocatedSum(tx, shipmentId),
  });
  return { ...f, shipment };
}

async function loadShipment(tx: Tx, shipmentId: string) {
  const s = await tx.courierShipment.findUnique({
    where: { id: shipmentId },
    include: { adjustments: true, order: { select: { orderNumber: true, id: true } }, courier: true },
  });
  if (!s) throw errors.notFound('Shipment not found');
  return s;
}

/**
 * Accepted goods value AT HANDOVER (immutable base). Approved rejections/returns are applied once, as adjustments,
 * on top of this base. Using the revised invoice here would double-count them.
 */
function goodsValueOf(s: { codExpectedBase: Prisma.Decimal; customerFeeSnapshot: Prisma.Decimal }): string {
  return s.codExpectedBase.sub(s.customerFeeSnapshot).toFixed(0);
}

/* ------------------------------------------------------------ COD collection (confirmed by the courier, entered manually) */

export async function recordCollection(actor: CurrentUser, input: { shipmentId: string; collectedAmount: string; reference: string; idempotencyKey: string }) {
  need(actor, PERMISSIONS.FINANCE_REMITTANCE_RECORD);
  const amount = parseIqdAmount(input.collectedAmount);
  if (!amount) throw errors.validation('Collected amount must be a whole non-negative IQD amount');
  return db.$transaction(async (tx) => {
    const existingEvent = await tx.courierFinancialEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existingEvent) return { replayed: true, shipmentId: existingEvent.shipmentId };
    await tx.$queryRaw`SELECT "id" FROM "courier_shipments" WHERE "id" = ${input.shipmentId}::uuid FOR UPDATE`;
    const s = await loadShipment(tx, input.shipmentId);
    if (s.codCollected !== null) throw errors.conflict('Collection is already confirmed. Use a COURIER_CORRECTION adjustment to change it.');
    if (s.deliveryStatus === 'RETURNED') throw errors.conflict('Returned shipments have no collection');
    const fee = s.settlementModeSnapshot === 'NET_DEDUCTION' ? s.courierFeeSnapshot : null;
    if (fee !== null && amount.lessThan(fee)) throw errors.validation('Collected amount is lower than the courier fee that is deducted from COD');
    await tx.courierShipment.update({
      where: { id: s.id },
      data: { codCollected: amount, codCollectedAt: new Date(), courierFeeDeducted: fee },
    });
    await tx.courierFinancialEvent.create({
      data: { shipmentId: s.id, eventType: 'COD_COLLECTED', amount, reference: input.reference.slice(0, 120), idempotencyKey: input.idempotencyKey, actorId: actor.id },
    });
    await writeAudit(tx, { actorId: actor.id, action: 'shipment.cod_collected', entityType: 'courier_shipment', entityId: s.id, after: { collected: amount.toFixed(0), feeDeducted: fee?.toFixed(0) ?? null }, reason: input.reference });
    return { replayed: false, shipmentId: s.id, collected: amount.toFixed(0), feeDeducted: fee?.toFixed(0) ?? null };
  });
}

/* ------------------------------------------------------------ adjustments (approved financial movements) */

export async function createAdjustment(
  actor: CurrentUser,
  input: { shipmentId: string; type: AdjustmentType; signedAmount: string; reason: string; idempotencyKey: string },
) {
  need(actor, PERMISSIONS.FINANCE_ADJUSTMENT_APPROVE);
  const magnitude = parseIqdAmount(input.signedAmount.replace(/^-/, ''));
  if (!magnitude) throw errors.validation('Amount must be a whole IQD value');
  const negative = input.signedAmount.trim().startsWith('-');
  if (magnitude.isZero()) throw errors.validation('Amount must not be zero');
  if (NEGATIVE_TYPES.includes(input.type) && !negative) throw errors.validation(`${input.type} must be entered as a negative amount`);
  const signed = negative ? magnitude.neg() : magnitude;

  return db.$transaction(async (tx) => {
    const dup = await tx.financialAdjustment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { replayed: true, adjustmentId: dup.id };
    await tx.$queryRaw`SELECT "id" FROM "courier_shipments" WHERE "id" = ${input.shipmentId}::uuid FOR UPDATE`;
    const f = await financialsFor(tx, input.shipmentId);
    if (input.type === 'REJECTION_FULL') {
      const prior = await tx.financialAdjustment.findFirst({ where: { shipmentId: input.shipmentId, type: 'REJECTION_FULL' } });
      if (prior) throw errors.conflict('A full rejection is already recorded for this shipment');
    }
    if (NEGATIVE_TYPES.includes(input.type) && toBig(f.codExpected) + toBig(signed.toFixed(0)) < BigInt(0)) {
      throw errors.validation('This adjustment would make expected COD negative');
    }
    if (DUE_SIDE_ADJUSTMENTS.includes(input.type as (typeof DUE_SIDE_ADJUSTMENTS)[number]) && f.codCollected === null) {
      throw errors.conflict('Courier corrections need a confirmed collection first');
    }
    const adj = await tx.financialAdjustment.create({
      data: { shipmentId: input.shipmentId, type: input.type, signedAmount: signed, reason: input.reason.trim(), requestedById: actor.id, approvedById: actor.id, idempotencyKey: input.idempotencyKey },
    });
    if (GOODS_TYPES.includes(input.type)) {
      const order = await tx.order.findUniqueOrThrow({ where: { id: f.shipment.orderId } });
      const latest = await tx.salesInvoice.findFirst({ where: { orderId: order.id, status: 'ISSUED' }, orderBy: { revision: 'desc' } });
      const newGoods = (latest?.goodsTotal ?? money(0)).add(signed);
      if (newGoods.lessThan(0)) throw errors.validation('Goods value cannot become negative');
      await issueInvoiceRevision(tx, {
        orderId: order.id,
        lines: (latest?.lines as Array<{ sku: string; title: string; unitPrice: string; qty: number; lineTotal: string }>) ?? [],
        goodsTotal: newGoods,
        customerDeliveryFee: latest?.customerDeliveryFee ?? money(0),
        actorId: actor.id,
        reason: `${input.type}: ${input.reason.trim()}`,
      });
    }
    await writeAudit(tx, { actorId: actor.id, action: 'finance.adjustment', entityType: 'financial_adjustment', entityId: adj.id, after: { type: input.type, signed: signed.toFixed(0), shipmentId: input.shipmentId }, reason: input.reason });
    return { replayed: false, adjustmentId: adj.id };
  });
}

/** Reversal is a NEW opposite row linked by reversesId. The original row is never edited. */
export async function reverseAdjustment(actor: CurrentUser, input: { adjustmentId: string; reason: string; idempotencyKey: string }) {
  need(actor, PERMISSIONS.FINANCE_ADJUSTMENT_APPROVE);
  return db.$transaction(async (tx) => {
    const original = await tx.financialAdjustment.findUnique({ where: { id: input.adjustmentId } });
    if (!original) throw errors.notFound('Adjustment not found');
    const already = await tx.financialAdjustment.findFirst({ where: { reversesId: original.id } });
    if (already) throw errors.conflict('This adjustment was already reversed');
    if (original.reversesId) throw errors.conflict('A reversal cannot be reversed; create a new adjustment instead');
    await tx.$queryRaw`SELECT "id" FROM "courier_shipments" WHERE "id" = ${original.shipmentId}::uuid FOR UPDATE`;
    const reversal = await tx.financialAdjustment.create({
      data: {
        shipmentId: original.shipmentId,
        type: original.type,
        signedAmount: original.signedAmount.neg(),
        reason: `REVERSAL of ${original.id}: ${input.reason.trim()}`,
        requestedById: actor.id,
        approvedById: actor.id,
        reversesId: original.id,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (GOODS_TYPES.includes(original.type)) {
      const shipment = await tx.courierShipment.findUniqueOrThrow({ where: { id: original.shipmentId } });
      const latest = await tx.salesInvoice.findFirst({ where: { orderId: shipment.orderId }, orderBy: { revision: 'desc' } });
      if (latest) {
        await issueInvoiceRevision(tx, {
          orderId: shipment.orderId,
          lines: (latest.lines as Array<{ sku: string; title: string; unitPrice: string; qty: number; lineTotal: string }>) ?? [],
          goodsTotal: latest.goodsTotal.add(original.signedAmount.neg()),
          customerDeliveryFee: latest.customerDeliveryFee,
          actorId: actor.id,
          reason: `reversal of ${original.type}`,
        });
      }
    }
    await writeAudit(tx, { actorId: actor.id, action: 'finance.adjustment.reverse', entityType: 'financial_adjustment', entityId: reversal.id, after: { reverses: original.id }, reason: input.reason });
    return { reversalId: reversal.id };
  });
}

/* ------------------------------------------------------------ remittances (transfers received) */

export async function recordRemittance(
  actor: CurrentUser,
  input: { courierId: string; reference: string; grossAmount: string; receivedAt: Date; method: RemittanceMethod; note?: string | null; idempotencyKey: string },
) {
  need(actor, PERMISSIONS.FINANCE_REMITTANCE_RECORD);
  const gross = parseIqdAmount(input.grossAmount);
  if (!gross || gross.isZero()) throw errors.validation('Transfer amount must be a positive whole IQD value');
  return db.$transaction(async (tx) => {
    const dup = await tx.courierRemittance.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { replayed: true, remittanceId: dup.id };
    const courier = await tx.courier.findUnique({ where: { id: input.courierId } });
    if (!courier) throw errors.notFound('Courier not found');
    const same = await tx.courierRemittance.findUnique({ where: { courierId_reference: { courierId: input.courierId, reference: input.reference.trim() } } });
    if (same) throw errors.conflict('A transfer with this reference already exists for this courier (duplicate blocked)');
    const r = await tx.courierRemittance.create({
      data: { courierId: input.courierId, reference: input.reference.trim(), grossAmount: gross, receivedAt: input.receivedAt, method: input.method, note: input.note ?? null, createdById: actor.id, idempotencyKey: input.idempotencyKey },
    });
    await writeAudit(tx, { actorId: actor.id, action: 'finance.remittance.record', entityType: 'courier_remittance', entityId: r.id, after: { courierId: input.courierId, gross: gross.toFixed(0) }, reason: input.reference });
    return { replayed: false, remittanceId: r.id };
  });
}

/**
 * Allocates part or all of a transfer to shipments of the SAME courier. Refuses to exceed the transfer amount,
 * the amount still due on a shipment, or the amount collected (never allocates against expected COD).
 */
export async function allocateRemittance(actor: CurrentUser, input: { remittanceId: string; allocations: Array<{ shipmentId: string; amount: string }> }) {
  need(actor, PERMISSIONS.FINANCE_ALLOCATE);
  if (input.allocations.length === 0) throw errors.validation('Add at least one allocation');
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "courier_remittances" WHERE "id" = ${input.remittanceId}::uuid FOR UPDATE`;
    const remit = await tx.courierRemittance.findUnique({ where: { id: input.remittanceId }, include: { allocations: true } });
    if (!remit) throw errors.notFound('Transfer not found');
    const already = sumMoney(remit.allocations.map((a) => a.allocatedAmount));
    let newTotal = already;
    const applied: Array<{ shipmentId: string; amount: string }> = [];
    for (const req of input.allocations) {
      const amount = parseIqdAmount(req.amount);
      if (!amount || amount.isZero()) throw errors.validation('Allocation amounts must be positive whole IQD values');
      await tx.$queryRaw`SELECT "id" FROM "courier_shipments" WHERE "id" = ${req.shipmentId}::uuid FOR UPDATE`;
      const f = await financialsFor(tx, req.shipmentId);
      if (f.shipment.courierId !== remit.courierId) throw errors.validation('A transfer can only be allocated to its own courier');
      if (f.courierDue === null) throw errors.conflict('Shipment has no confirmed collection yet; nothing is due to allocate');
      const left = allocatableFor(f);
      if (amount.greaterThan(left.toString())) throw errors.validation(`Allocation exceeds the amount still due on shipment (${left.toString()} IQD left)`);
      newTotal = newTotal.add(amount);
      applied.push({ shipmentId: req.shipmentId, amount: amount.toFixed(0) });
    }
    if (newTotal.greaterThan(remit.grossAmount)) {
      throw errors.validation(`Allocations would exceed the transfer amount (${remit.grossAmount.toFixed(0)} IQD)`);
    }
    for (const a of applied) {
      const existing = await tx.remittanceAllocation.findUnique({ where: { remittanceId_shipmentId: { remittanceId: remit.id, shipmentId: a.shipmentId } } });
      if (existing) {
        await tx.remittanceAllocation.update({ where: { id: existing.id }, data: { allocatedAmount: existing.allocatedAmount.add(a.amount) } });
      } else {
        await tx.remittanceAllocation.create({ data: { remittanceId: remit.id, shipmentId: a.shipmentId, allocatedAmount: a.amount, createdById: actor.id } });
      }
    }
    await writeAudit(tx, { actorId: actor.id, action: 'finance.allocate', entityType: 'courier_remittance', entityId: remit.id, after: { applied, remainingUnallocated: remit.grossAmount.sub(newTotal).toFixed(0) } });
    return { applied, unallocated: remit.grossAmount.sub(newTotal).toFixed(0) };
  });
}

/** Removes a wrong allocation. The removal is audited with before-state; the transfer record itself is untouched. */
export async function voidAllocation(actor: CurrentUser, input: { allocationId: string; reason: string }) {
  need(actor, PERMISSIONS.FINANCE_ALLOCATE);
  return db.$transaction(async (tx) => {
    const a = await tx.remittanceAllocation.findUnique({ where: { id: input.allocationId } });
    if (!a) throw errors.notFound('Allocation not found');
    await tx.remittanceAllocation.delete({ where: { id: a.id } });
    await writeAudit(tx, { actorId: actor.id, action: 'finance.allocation.void', entityType: 'remittance_allocation', entityId: a.id, before: { remittanceId: a.remittanceId, shipmentId: a.shipmentId, amount: a.allocatedAmount.toFixed(0) }, reason: input.reason });
    return { voided: true };
  });
}

/* ------------------------------------------------------------ fee payments (GROSS_REMITTANCE courier fees) */

export async function recordFeePayment(actor: CurrentUser, input: { courierId: string; amount: string; paidAt: Date; reference: string; idempotencyKey: string }) {
  need(actor, PERMISSIONS.FINANCE_FEE_PAYMENT_RECORD);
  const amount = parseIqdAmount(input.amount);
  if (!amount || amount.isZero()) throw errors.validation('Payment must be a positive whole IQD amount');
  return db.$transaction(async (tx) => {
    const dup = await tx.courierFeePayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { replayed: true, paymentId: dup.id };
    await tx.$queryRaw`SELECT "id" FROM "couriers" WHERE "id" = ${input.courierId}::uuid FOR UPDATE`;
    const payable = await courierFeePayableTotal(tx, input.courierId);
    const paid = (await tx.courierFeePayment.aggregate({ where: { courierId: input.courierId }, _sum: { amount: true } }))._sum.amount ?? new Prisma.Decimal(0);
    const left = feeOutstandingFor(payable, paid.toFixed(0));
    if (amount.greaterThan(left.toString())) throw errors.validation(`Payment exceeds the courier fee still payable (${left.toString()} IQD)`);
    const p = await tx.courierFeePayment.create({ data: { courierId: input.courierId, amount, paidAt: input.paidAt, reference: input.reference.trim(), recordedById: actor.id, idempotencyKey: input.idempotencyKey } });
    await writeAudit(tx, { actorId: actor.id, action: 'finance.fee_payment.record', entityType: 'courier_fee_payment', entityId: p.id, after: { courierId: input.courierId, amount: amount.toFixed(0) }, reason: input.reference });
    return { replayed: false, paymentId: p.id };
  });
}

async function courierFeePayableTotal(tx: Tx, courierId: string): Promise<string> {
  const rows = await tx.courierShipment.findMany({ where: { courierId, settlementModeSnapshot: 'GROSS_REMITTANCE' }, select: { courierFeeSnapshot: true } });
  return sumMoney(rows.map((r) => r.courierFeeSnapshot)).toFixed(0);
}

/* ------------------------------------------------------------ statements & reports */

export async function courierStatement(courierId: string, opts: { from?: Date; to?: Date }) {
  const courier = await db.courier.findUnique({ where: { id: courierId } });
  if (!courier) throw errors.notFound('Courier not found');
  const where: Prisma.CourierShipmentWhereInput = {
    courierId,
    ...(opts.from || opts.to ? { handedOverAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {}),
  };
  const shipments = await db.courierShipment.findMany({ where, orderBy: { handedOverAt: 'asc' }, select: { id: true } });
  const rows: Array<ShipmentFinancials & { shipmentId: string; orderNumber: string; handedOverAt: Date; settlementMode: string }> = [];
  await db.$transaction(async (tx) => {
    for (const s of shipments) {
      const f = await financialsFor(tx, s.id);
      rows.push({ ...f, shipmentId: s.id, orderNumber: f.shipment.order.orderNumber, handedOverAt: f.shipment.handedOverAt, settlementMode: f.shipment.settlementModeSnapshot });
    }
  });
  const feePayments = await db.courierFeePayment.aggregate({ where: { courierId }, _sum: { amount: true } });
  const totals = aggregateCourier(rows, (feePayments._sum.amount ?? new Prisma.Decimal(0)).toFixed(0));
  return { courier: { id: courier.id, name: courier.name }, totals, shipments: rows };
}

export async function customerDeliveryFees(opts: { customerId?: string; from?: Date; to?: Date }) {
  const where: Prisma.OrderWhereInput = {
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.from || opts.to ? { submittedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {}),
  };
  const orders = await db.order.findMany({ where, orderBy: { submittedAt: 'asc' }, select: { id: true, orderNumber: true, customerId: true, shippingFee: true, status: true, submittedAt: true, shipment: { select: { id: true, handedOverAt: true } } } });
  const total = sumMoney(orders.map((o) => o.shippingFee));
  return {
    rows: orders.map((o) => ({ orderNumber: o.orderNumber, customerId: o.customerId, deliveryFee: toApiAmount(o.shippingFee), status: o.status, submittedAt: o.submittedAt, handedOver: !!o.shipment })),
    total: toApiAmount(total),
  };
}

/** Reconciliation view: unallocated transfers, collection variances, uncollected shipments, open adjustments. */
export async function reconciliation() {
  const remittances = await db.courierRemittance.findMany({ include: { allocations: true, courier: true }, orderBy: { receivedAt: 'desc' }, take: 500 });
  const unallocated = remittances
    .map((r) => ({ id: r.id, courier: r.courier.name, reference: r.reference, gross: r.grossAmount.toFixed(0), allocated: sumMoney(r.allocations.map((a) => a.allocatedAmount)).toFixed(0) }))
    .map((r) => ({ ...r, unallocated: (toBig(r.gross) - toBig(r.allocated)).toString() }))
    .filter((r) => r.unallocated !== '0');
  const shipments = await db.courierShipment.findMany({ select: { id: true, codCollected: true, order: { select: { orderNumber: true } }, courier: { select: { name: true } } }, take: 2000 });
  const variances: Array<{ shipmentId: string; orderNumber: string; courier: string; expected: string; collected: string; variance: string }> = [];
  const uncollected: Array<{ shipmentId: string; orderNumber: string; courier: string }> = [];
  await db.$transaction(async (tx) => {
    for (const s of shipments) {
      const f = await financialsFor(tx, s.id);
      if (f.codCollected === null) uncollected.push({ shipmentId: s.id, orderNumber: s.order.orderNumber, courier: s.courier.name });
      else if (f.codVariance !== '0') variances.push({ shipmentId: s.id, orderNumber: s.order.orderNumber, courier: s.courier.name, expected: f.codExpected, collected: f.codCollected, variance: f.codVariance! });
    }
  });
  const openAdjustments = await db.financialAdjustment.count({ where: { reversesId: null } });
  return { unallocatedTransfers: unallocated, collectionVariances: variances, uncollectedShipments: uncollected, adjustmentsRecorded: openAdjustments };
}

export { EXPECTED_SIDE_ADJUSTMENTS, DUE_SIDE_ADJUSTMENTS };
export type { SettlementMode };
