import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { createAdjustment, createAgreement, createCourier, customerDeliveryFees, courierStatement, reverseAdjustment } from '@/modules/accounting/service';
import { createShipmentForHandover, nextInvoiceNumber } from '@/modules/accounting/shipments';
import { markPrepPrinted } from '@/modules/fulfillment/service';
import { actorFor, createActiveCustomer, placeTestOrder, STAFF } from '../helpers/fixtures';
import { makeSku, uniq } from './req-helpers';

const YESTERDAY = () => new Date(Date.now() - 24 * 3600 * 1000);

/** A fresh courier with a general (all governorates) agreement, so tests never share fee state. */
async function freshCourier(serviceFee: string, mode: 'NET_DEDUCTION' | 'GROSS_REMITTANCE' = 'NET_DEDUCTION') {
  const manager = await actorFor(STAFF.manager);
  const courier = await createCourier(manager, { name: uniq('REQ COURIER ') });
  const agreement = await createAgreement(manager, { courierId: courier.id, settlementMode: mode, effectiveFrom: YESTERDAY(), serviceFee, reason: 'req fixture' });
  return { courier, agreement, manager };
}

/** Creates the courier shipment (with invoice rev 1) for an already placed order, in the real handover transaction. */
async function shipOrder(order: Awaited<ReturnType<typeof placeTestOrder>>['order'], courierId: string, actorId: string) {
  return db.$transaction((tx) =>
    createShipmentForHandover(tx, {
      order: { id: order.id, shippingFee: order.shippingFee, governorateId: order.governorateId, orderNumber: order.orderNumber },
      acceptedLines: order.items.map((i) => ({ skuId: i.skuId, sku: i.skuSnapshot, title: i.titleSnapshot, unitPrice: i.unitPrice, qty: i.qty })),
      courierId,
      trackingNote: null,
      actorId,
    }),
  );
}

async function placeOne(qty = 1, lvl: 'LEVEL_A' | 'LEVEL_B' = 'LEVEL_A') {
  const item = await makeSku({ nameEn: uniq('ACC ITEM '), physical: 50 });
  const customer = await createActiveCustomer(lvl);
  const placed = await placeTestOrder(customer, [{ sku: item.sku, qty }]);
  return { customer, order: placed.order };
}

describe('courier agreement snapshot on the shipment (ACC-04, T029)', () => {
  it('changing the agreement fee afterwards does not change an existing shipment courierFeeSnapshot', async () => {
    const { courier, agreement, manager } = await freshCourier('3000');
    const first = await placeOne();
    const shipment = await shipOrder(first.order, courier.id, manager.id);
    expect(shipment.courierFeeSnapshot.toFixed(0)).toBe('3000');

    await db.courierAgreement.update({ where: { id: agreement.id }, data: { serviceFee: new Prisma.Decimal(9999) } });

    const reloaded = await db.courierShipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(reloaded.courierFeeSnapshot.toFixed(0)).toBe('3000');
    expect(reloaded.agreementId).toBe(agreement.id);

    // the change is real: a shipment handed over after it snapshots the new fee
    const second = await placeOne();
    const later = await shipOrder(second.order, courier.id, manager.id);
    expect(later.courierFeeSnapshot.toFixed(0)).toBe('9999');
  });
});

describe('invoice numbering and reprint (ACC-01)', () => {
  it('invoice numbers are unique, and printing does not create an invoice, a shipment or a liability', async () => {
    const { courier, manager } = await freshCourier('2500');
    const { order } = await placeOne();
    const shipment = await shipOrder(order, courier.id, manager.id);
    const invoice = await db.salesInvoice.findFirstOrThrow({ where: { orderId: order.id } });
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(invoice.revision).toBe(1);

    // two sequence draws never collide
    const [n1, n2] = await db.$transaction(async (tx) => [await nextInvoiceNumber(tx), await nextInvoiceNumber(tx)]);
    expect(n1).not.toBe(n2);

    // the database refuses a second invoice with the same number
    await expect(
      db.salesInvoice.create({
        data: { invoiceNumber: invoice.invoiceNumber, orderId: order.id, revision: 99, goodsTotal: 0, customerDeliveryFee: 0, grandTotal: 0, lines: [] },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const before = {
      invoices: await db.salesInvoice.count(),
      shipments: await db.courierShipment.count(),
      financialEvents: await db.courierFinancialEvent.count(),
      adjustments: await db.financialAdjustment.count(),
    };
    const job = await db.fulfillmentJob.findUniqueOrThrow({ where: { orderId: order.id } });
    await markPrepPrinted(manager, job.id);
    await markPrepPrinted(manager, job.id);
    // reading the invoice (what a reprint does) is a read only
    const reread = await db.salesInvoice.findFirstOrThrow({ where: { orderId: order.id } });
    expect(reread.invoiceNumber).toBe(invoice.invoiceNumber);

    expect(await db.salesInvoice.count()).toBe(before.invoices);
    expect(await db.courierShipment.count()).toBe(before.shipments);
    expect(await db.courierFinancialEvent.count()).toBe(before.financialEvents);
    expect(await db.financialAdjustment.count()).toBe(before.adjustments);
    expect((await db.fulfillmentJob.findUniqueOrThrow({ where: { id: job.id } })).prepPrintCount).toBe(2);
    expect(shipment.courierFeeSnapshot.toFixed(0)).toBe('2500');
  });
});

describe('customer delivery fees (ACC-07)', () => {
  it('lists each order shipping fee and the total for a customer and period; courier fees are not included', async () => {
    const { courier, manager } = await freshCourier('3000');
    const item = await makeSku({ nameEn: uniq('FEES '), physical: 50 });
    const customer = await createActiveCustomer('LEVEL_A');
    const from = new Date(Date.now() - 3600 * 1000);
    const o1 = (await placeTestOrder(customer, [{ sku: item.sku, qty: 1 }])).order;
    const o2 = (await placeTestOrder(customer, [{ sku: item.sku, qty: 2 }])).order;
    await shipOrder(o1, courier.id, manager.id); // courier fee 3000 exists on this order only
    const to = new Date(Date.now() + 3600 * 1000);

    const report = await customerDeliveryFees({ customerId: customer.userId, from, to });
    expect(report.rows).toHaveLength(2);
    const byNumber = new Map(report.rows.map((r) => [r.orderNumber, r]));
    expect(byNumber.get(o1.orderNumber)).toMatchObject({ deliveryFee: o1.shippingFee.toFixed(0), handedOver: true });
    expect(byNumber.get(o2.orderNumber)).toMatchObject({ deliveryFee: o2.shippingFee.toFixed(0), handedOver: false });
    const expectedTotal = o1.shippingFee.add(o2.shippingFee).toFixed(0);
    expect(report.total).toBe(expectedTotal);
    expect(report.total).not.toBe(new Prisma.Decimal(expectedTotal).add(3000).toFixed(0));

    const outside = await customerDeliveryFees({ customerId: customer.userId, from: new Date(Date.now() + 2 * 3600 * 1000) });
    expect(outside.rows).toHaveLength(0);
    expect(outside.total).toBe('0');
  });
});

describe('RETURN adjustment reduces and reversal restores expected COD (ACC-10)', () => {
  it('a negative RETURN lowers expected COD with reason and approver recorded; reversing restores it', async () => {
    const { courier, manager } = await freshCourier('3000');
    const { order } = await placeOne(2);
    await shipOrder(order, courier.id, manager.id);
    const accountant = await actorFor(STAFF.accountant);

    const baseline = (await courierStatement(courier.id, {})).shipments[0].codExpected;
    expect(baseline).toBe(order.totalCod.toFixed(0));
    const shipment = await db.courierShipment.findFirstOrThrow({ where: { orderId: order.id } });

    // a RETURN must be entered as a negative amount
    await expect(
      createAdjustment(accountant, { shipmentId: shipment.id, type: 'RETURN', signedAmount: '5000', reason: 'sign check', idempotencyKey: `ret-pos-${randomUUID()}` }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const key = `ret-${randomUUID()}`;
    const created = await createAdjustment(accountant, { shipmentId: shipment.id, type: 'RETURN', signedAmount: '-5000', reason: 'customer returned one unit', idempotencyKey: key });
    const adj = await db.financialAdjustment.findUniqueOrThrow({ where: { id: created.adjustmentId } });
    expect(adj.type).toBe('RETURN');
    expect(adj.signedAmount.toFixed(0)).toBe('-5000');
    expect(adj.reason).toBe('customer returned one unit');
    expect(adj.approvedById).toBe(accountant.id);

    const reduced = (await courierStatement(courier.id, {})).shipments[0].codExpected;
    expect(reduced).toBe((Number(baseline) - 5000).toString());

    await reverseAdjustment(accountant, { adjustmentId: adj.id, reason: 'return cancelled', idempotencyKey: `rev-${randomUUID()}` });
    const restored = (await courierStatement(courier.id, {})).shipments[0].codExpected;
    expect(restored).toBe(baseline);
    await expect(reverseAdjustment(accountant, { adjustmentId: adj.id, reason: 'again', idempotencyKey: `rev2-${randomUUID()}` })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
