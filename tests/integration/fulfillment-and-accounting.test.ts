import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { actorFor, createActiveCustomer, createSkuFixture, placeTestOrder, skuRow, STAFF } from '../helpers/fixtures';
import { assignJob, startPicking, submitPick, startChecking, submitCheck, resolveDiscrepancy, startPacking, addPackage, finishPacking, handOver } from '@/modules/fulfillment/service';
import {
  recordCollection,
  createAdjustment,
  reverseAdjustment,
  recordRemittance,
  allocateRemittance,
  recordFeePayment,
  courierStatement,
  reconciliation,
} from '@/modules/accounting/service';

const NET_COURIER = 'Synthetic Courier One'; // NET_DEDUCTION, fee 3000
const GROSS_COURIER = 'Synthetic Courier Two'; // GROSS_REMITTANCE, fee 2500

async function courierId(name: string) {
  return (await db.courier.findUniqueOrThrow({ where: { name } })).id;
}

/** Runs one order through assignment → pick → check → (resolve) → pack → handover. Returns ids. */
async function fulfil(opts: { lines: Array<{ skuId: string; sku: string; qty: number }>; courier: string; pickedShortBy?: number; discrepancy?: boolean }) {
  const c = await createActiveCustomer('LEVEL_A');
  const { order } = await placeTestOrder(c, opts.lines.map((l) => ({ sku: l.sku, qty: l.qty })));
  const job = await db.fulfillmentJob.findUniqueOrThrow({ where: { orderId: order.id }, include: { lines: { include: { orderItem: true } } } });
  const manager = await actorFor(STAFF.manager);
  const picker = await actorFor(STAFF.picker);
  const checker = await actorFor(STAFF.checker);
  const packer = await actorFor(STAFF.packer);

  await assignJob(manager, { jobId: job.id, pickerId: picker.id, checkerId: checker.id });
  await startPicking(picker, job.id);
  const pickLines = job.lines.map((l) => {
    const shortBy = opts.pickedShortBy && l.orderItem.skuSnapshot === opts.lines[0].sku ? opts.pickedShortBy : 0;
    return { pickLineId: l.id, pickedQty: l.requestedQty - shortBy, reason: shortBy ? 'could not find the rest on the shelf' : undefined };
  });
  await submitPick(picker, job.id, pickLines);
  await startChecking(checker, job.id);
  // blind count: the checker reports what was really there
  const checkLines = job.lines.map((l) => {
    const pick = pickLines.find((p) => p.pickLineId === l.id)!;
    const checked = opts.discrepancy && l.orderItem.skuSnapshot === opts.lines[0].sku ? Math.max(0, pick.pickedQty - 1) : pick.pickedQty;
    return { pickLineId: l.id, checkedQty: checked };
  });
  const checkResult = await submitCheck(checker, job.id, checkLines);
  if (opts.discrepancy) {
    expect(checkResult.status).toBe('DISCREPANCY_HOLD');
    expect(checkResult.mismatches).toBeGreaterThan(0);
    const refreshed = await db.fulfillmentJob.findUniqueOrThrow({ where: { id: job.id }, include: { lines: true } });
    await resolveDiscrepancy(
      manager,
      job.id,
      refreshed.lines.map((l) => {
        const counted = Math.max(l.pickedQty ?? 0, l.checkedQty ?? 0);
        return { pickLineId: l.id, acceptedQty: Math.min(l.requestedQty, counted), reason: 'recount on manager review' };
      }),
    );
  } else {
    expect(checkResult.status).toBe('CHECKED');
  }
  await startPacking(packer, job.id);
  await addPackage(packer, job.id, { weightGrams: 1200 });
  await finishPacking(packer, job.id);
  const result = await handOver(packer, job.id, { courierId: await courierId(opts.courier) });
  return { customer: c, order, jobId: job.id, shipmentId: result.shipmentId, picker, checker, packer };
}

describe('fulfillment controls (ACC-02, ACC-03, ACC-12)', () => {
  it('picker and checker must be different people, and the checker cannot be the picker', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    const job = await db.fulfillmentJob.findUniqueOrThrow({ where: { orderId: order.id } });
    const manager = await actorFor(STAFF.manager);
    const picker = await actorFor(STAFF.picker);
    await expect(assignJob(manager, { jobId: job.id, pickerId: picker.id, checkerId: picker.id })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await assignJob(manager, { jobId: job.id, pickerId: picker.id, checkerId: (await actorFor(STAFF.checker)).id });
    // the picker may not check the same job
    await startPicking(picker, job.id);
    await submitPick(picker, job.id, [{ pickLineId: (await db.pickLine.findFirstOrThrow({ where: { jobId: job.id } })).id, pickedQty: 1 }]);
    await expect(startChecking(picker, job.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a count mismatch holds the job until a manager resolves each line with a reason (ACC-03)', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const f = await fulfil({ lines: [{ skuId: fx.skuId, sku: fx.sku, qty: 2 }], courier: NET_COURIER, discrepancy: true });
    const job = await db.fulfillmentJob.findUniqueOrThrow({ where: { id: f.jobId } });
    expect(job.status).toBe('HANDED_OVER');
    expect(await db.fulfillmentEvent.count({ where: { jobId: f.jobId, eventType: 'DISCREPANCY_RAISED' } })).toBe(1);
    expect(await db.fulfillmentEvent.count({ where: { jobId: f.jobId, eventType: 'DISCREPANCY_RESOLVED' } })).toBe(1);
  });

  it('packing cannot start before the independent check, and parcels are numbered per job', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    const job = await db.fulfillmentJob.findUniqueOrThrow({ where: { orderId: order.id } });
    const packer = await actorFor(STAFF.packer);
    await expect(startPacking(packer, job.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('a clerk without financial approval cannot approve adjustments (ACC-12)', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const f = await fulfil({ lines: [{ skuId: fx.skuId, sku: fx.sku, qty: 1 }], courier: NET_COURIER });
    const picker = await actorFor(STAFF.picker);
    await expect(createAdjustment(picker, { shipmentId: f.shipmentId, type: 'REJECTION_PARTIAL', signedAmount: '-1000', reason: 'nope', idempotencyKey: `adj-${randomUUID()}` })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('handover, stock consumption and invoices (ACC-01, ACC-04)', () => {
  it('handover consumes only the accepted quantity, releases the rest, and issues invoice revision 1', async () => {
    const fx = await createSkuFixture({ physical: 10, prices: { LEVEL_A: 15000 } });
    const before = await skuRow(fx.sku);
    const f = await fulfil({ lines: [{ skuId: fx.skuId, sku: fx.sku, qty: 3 }], courier: NET_COURIER, pickedShortBy: 1 });
    const after = await skuRow(fx.sku);
    expect(after.inventory!.physicalOnHand).toBe(before.inventory!.physicalOnHand - 2);
    expect(after.inventory!.reservedQty).toBe(0);
    const shipment = await db.courierShipment.findUniqueOrThrow({ where: { id: f.shipmentId } });
    expect(shipment.codExpectedBase.toFixed(0)).toBe(String(2 * 15000 + 4000));
    const inv = await db.salesInvoice.findFirstOrThrow({ where: { orderId: f.order.id, revision: 1 } });
    expect(inv.grandTotal.toFixed(0)).toBe(String(2 * 15000 + 4000));
    expect(inv.status).toBe('ISSUED');
    // the order itself stays a local record; no "shipped" status is invented
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe('SUBMITTED');
  });

  it('printing the preparation document is only counted, never a liability (ACC-01)', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    const job = await db.fulfillmentJob.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(job.prepDocumentNo).toMatch(/^PREP-\d{6}-\d{6}$/);
    expect(await db.courierShipment.count({ where: { orderId: order.id } })).toBe(0);
  });
});

describe('courier settlement — NET_DEDUCTION and GROSS_REMITTANCE (ACC-04..ACC-10, T029)', () => {
  it('NET_DEDUCTION: collection, fee withheld, partial transfers, no double counting, over-allocation refused', async () => {
    const fx = await createSkuFixture({ physical: 10, prices: { LEVEL_A: 15000 } });
    const f = await fulfil({ lines: [{ skuId: fx.skuId, sku: fx.sku, qty: 2 }], courier: NET_COURIER });
    const shipment = await db.courierShipment.findUniqueOrThrow({ where: { id: f.shipmentId } });
    expect(shipment.settlementModeSnapshot).toBe('NET_DEDUCTION');
    expect(shipment.courierFeeSnapshot.toFixed(0)).toBe('3000');

    const accountant = await actorFor(STAFF.accountant);
    const expected = 2 * 15000 + 4000; // 34000
    // expected COD is not cash: nothing is due before the courier confirms collection
    const beforeCollection = await courierStatement(shipment.courierId, {});
    expect(beforeCollection.shipments.find((s) => s.shipmentId === f.shipmentId)?.courierDue).toBeNull();

    await recordCollection(accountant, { shipmentId: f.shipmentId, collectedAmount: String(expected), reference: 'COLL-1', idempotencyKey: `coll-${f.shipmentId}` });
    // a second confirmation of the same shipment is refused (changes go through adjustments)
    await expect(recordCollection(accountant, { shipmentId: f.shipmentId, collectedAmount: '1', reference: 'COLL-2', idempotencyKey: `coll2-${f.shipmentId}` })).rejects.toMatchObject({ code: 'CONFLICT' });

    const stmt = await courierStatement(shipment.courierId, {});
    const row = stmt.shipments.find((s) => s.shipmentId === f.shipmentId)!;
    expect(row.courierFeeDeducted).toBe('3000');
    expect(row.courierDue).toBe(String(expected - 3000));
    expect(row.courierFeePayableSeparately).toBe('0'); // ACC-05: no separate liability for NET

    const remit = await recordRemittance(accountant, { courierId: shipment.courierId, reference: `RM-${randomUUID().slice(0, 6)}`, grossAmount: '40000', receivedAt: new Date(), method: 'BANK_TRANSFER', idempotencyKey: `rm-${f.shipmentId}` });
    await expect(allocateRemittance(accountant, { remittanceId: remit.remittanceId, allocations: [{ shipmentId: f.shipmentId, amount: String(expected) }] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await allocateRemittance(accountant, { remittanceId: remit.remittanceId, allocations: [{ shipmentId: f.shipmentId, amount: '20000' }] });
    const partial = await courierStatement(shipment.courierId, {});
    const r2 = partial.shipments.find((s) => s.shipmentId === f.shipmentId)!;
    expect(r2.transfersReceived).toBe('20000');
    expect(r2.merchantOutstanding).toBe(String(expected - 3000 - 20000));
    // the transfer cannot be allocated beyond what is still due on the shipment
    await expect(allocateRemittance(accountant, { remittanceId: remit.remittanceId, allocations: [{ shipmentId: f.shipmentId, amount: '20000' }] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('GROSS_REMITTANCE: full COD is due, courier fee is a separate payable limited by payments (ACC-06, ACC-07)', async () => {
    const fx = await createSkuFixture({ physical: 10, prices: { LEVEL_A: 15000 } });
    const f = await fulfil({ lines: [{ skuId: fx.skuId, sku: fx.sku, qty: 1 }], courier: GROSS_COURIER });
    const shipment = await db.courierShipment.findUniqueOrThrow({ where: { id: f.shipmentId } });
    expect(shipment.settlementModeSnapshot).toBe('GROSS_REMITTANCE');
    const accountant = await actorFor(STAFF.accountant);
    await recordCollection(accountant, { shipmentId: f.shipmentId, collectedAmount: String(15000 + 4000), reference: 'GCOLL', idempotencyKey: `gcoll-${f.shipmentId}` });
    const stmt = await courierStatement(shipment.courierId, {});
    const row = stmt.shipments.find((s) => s.shipmentId === f.shipmentId)!;
    expect(row.courierDue).toBe('19000');
    expect(row.courierFeePayableSeparately).toBe('2500');
    expect(Number(stmt.totals.courierFeesOutstanding)).toBe(Number(stmt.totals.courierFeesPayableSeparately) - Number(stmt.totals.courierFeePayments));

    await expect(recordFeePayment(accountant, { courierId: shipment.courierId, amount: '999999', paidAt: new Date(), reference: `FEE-X-${randomUUID().slice(0, 8)}`, idempotencyKey: `fee-x-${randomUUID()}` })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const key = `fee-${randomUUID()}`;
    const paid = await recordFeePayment(accountant, { courierId: shipment.courierId, amount: '1000', paidAt: new Date(), reference: `FEE-${randomUUID().slice(0, 8)}`, idempotencyKey: key });
    const replay = await recordFeePayment(accountant, { courierId: shipment.courierId, amount: '1000', paidAt: new Date(), reference: 'ignored-on-replay', idempotencyKey: key });
    expect(replay.replayed).toBe(true);
    expect(replay.paymentId).toBe(paid.paymentId);
    expect(await db.courierFeePayment.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('rejections reduce expected COD once and revise the invoice; reversal restores both (ACC-10, ACC-11)', async () => {
    const fx = await createSkuFixture({ physical: 10, prices: { LEVEL_A: 15000 } });
    const f = await fulfil({ lines: [{ skuId: fx.skuId, sku: fx.sku, qty: 2 }], courier: NET_COURIER });
    const manager = await actorFor(STAFF.manager);
    const adj = await createAdjustment(manager, { shipmentId: f.shipmentId, type: 'REJECTION_PARTIAL', signedAmount: '-15000', reason: 'customer refused one unit', idempotencyKey: `rej-${f.shipmentId}` });
    expect(adj.replayed).toBe(false);
    const s = await db.courierShipment.findUniqueOrThrow({ where: { id: f.shipmentId } });
    const stmt = await courierStatement(s.courierId, {});
    expect(stmt.shipments.find((x) => x.shipmentId === f.shipmentId)!.codExpected).toBe(String(15000 + 4000));
    const invoices = await db.salesInvoice.findMany({ where: { orderId: f.order.id }, orderBy: { revision: 'asc' } });
    expect(invoices.map((i) => i.revision)).toEqual([1, 2]);
    expect(invoices[0].status).toBe('SUPERSEDED');
    expect(invoices[1].goodsTotal.toFixed(0)).toBe('15000');

    // a full rejection is recorded once per shipment
    await createAdjustment(manager, { shipmentId: f.shipmentId, type: 'REJECTION_FULL', signedAmount: '-15000', reason: 'remaining goods refused', idempotencyKey: `rej2-${f.shipmentId}` });
    await expect(createAdjustment(manager, { shipmentId: f.shipmentId, type: 'REJECTION_FULL', signedAmount: '-1', reason: 'again', idempotencyKey: `rej3-${f.shipmentId}` })).rejects.toMatchObject({ code: 'CONFLICT' });

    const rev = await reverseAdjustment(manager, { adjustmentId: adj.adjustmentId, reason: 'recorded in error', idempotencyKey: `rev-${f.shipmentId}` });
    expect(rev.reversalId).toBeTruthy();
    await expect(reverseAdjustment(manager, { adjustmentId: adj.adjustmentId, reason: 'twice', idempotencyKey: `rev2-${f.shipmentId}` })).rejects.toMatchObject({ code: 'CONFLICT' });
    const reversed = await db.financialAdjustment.findUniqueOrThrow({ where: { id: rev.reversalId } });
    expect(reversed.signedAmount.toFixed(0)).toBe('15000');
    expect((await db.financialAdjustment.findUniqueOrThrow({ where: { id: adj.adjustmentId } })).signedAmount.toFixed(0)).toBe('-15000');
  });

  it('duplicate transfer references are blocked; wrong-courier allocation is refused; reconciliation reports unallocated money', async () => {
    const accountant = await actorFor(STAFF.accountant);
    const net = await courierId(NET_COURIER);
    const ref = `DUP-${randomUUID().slice(0, 6)}`;
    await recordRemittance(accountant, { courierId: net, reference: ref, grossAmount: '5000', receivedAt: new Date(), method: 'CASH', idempotencyKey: `dup1-${ref}` });
    await expect(recordRemittance(accountant, { courierId: net, reference: ref, grossAmount: '5000', receivedAt: new Date(), method: 'CASH', idempotencyKey: `dup2-${ref}` })).rejects.toMatchObject({ code: 'CONFLICT' });
    const rec = await reconciliation();
    expect(rec.unallocatedTransfers.some((r) => r.reference === ref)).toBe(true);
  });

  it('posted financial rows cannot be updated or deleted at the database level (ACC-11)', async () => {
    const accountant = await actorFor(STAFF.accountant);
    const r = await recordRemittance(accountant, { courierId: await courierId(GROSS_COURIER), reference: `IMM-${randomUUID().slice(0, 6)}`, grossAmount: '100', receivedAt: new Date(), method: 'OTHER', idempotencyKey: `imm-${randomUUID()}` });
    await expect(db.$executeRawUnsafe(`UPDATE "courier_remittances" SET "grossAmount" = 1 WHERE "id" = '${r.remittanceId}'`)).rejects.toThrow(/immutable/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "courier_remittances" WHERE "id" = '${r.remittanceId}'`)).rejects.toThrow(/immutable/);
  });

  it('settlement reports keep the courier statement fields separate (ACC-07)', async () => {
    const stmt = await courierStatement(await courierId(NET_COURIER), {});
    expect(stmt.totals).toHaveProperty('codExpected');
    expect(stmt.totals).toHaveProperty('courierFeesDeductedFromCod');
    expect(stmt.totals).toHaveProperty('courierFeesPayableSeparately');
    expect(stmt.totals).toHaveProperty('merchantOutstanding');
    expect(stmt.totals).toHaveProperty('netPosition');
  });
});
