import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { buildQuote } from '@/modules/commerce/quote';
import { placeOrder } from '@/modules/commerce/checkout';
import { setCartLine } from '@/modules/commerce/cart';
import { recordCollection, allocateRemittance, recordRemittance } from '@/modules/accounting/service';
import { actorFor, createActiveCustomer, createSkuFixture, skuRow, placeTestOrder, STAFF } from '../helpers/fixtures';

/**
 * Controlled concurrency tests. They run only against the isolated TEST database (tests/setup/env.ts guards it).
 * Each test fires many simultaneous operations through the real services and then checks the invariants.
 * Timings are recorded and printed; they are measurements on this machine, not performance guarantees.
 */

async function quoteHash(c: Awaited<ReturnType<typeof createActiveCustomer>>) {
  return (await db.$transaction((tx) => buildQuote(tx, { customerId: c.userId, addressId: c.addressId }))).quoteHash;
}

function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  return fn().finally(() => console.log(`[timing] ${label}: ${Date.now() - t0} ms`));
}

describe('concurrent checkout for limited stock', () => {
  it('15 simultaneous checkouts for 10 units: exactly 10 succeed, reserved never exceeds physical', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const customers = await Promise.all(Array.from({ length: 15 }, () => createActiveCustomer('LEVEL_A')));
    for (const c of customers) await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 1 });
    const hashes = await Promise.all(customers.map(quoteHash));

    const results = await timed('15 concurrent checkouts', () =>
      Promise.allSettled(customers.map((c, i) => placeOrder({ customerId: c.userId, idempotencyKey: `load-${randomUUID()}`, addressId: c.addressId, quoteHash: hashes[i] }))),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toBe(10);
    expect(failed.every((r) => (r.reason as { code?: string }).code === 'STOCK_CHANGED' || (r.reason as { code?: string }).code === 'CONFLICT')).toBe(true);

    const row = await skuRow(fx.sku);
    expect(row.inventory!.reservedQty).toBe(10);
    expect(row.inventory!.reservedQty).toBeLessThanOrEqual(row.inventory!.physicalOnHand);
    expect(await db.inventoryReservation.aggregate({ where: { skuId: row.id, status: { in: ['ACTIVE', 'EXTENDED', 'REVIEW_REQUIRED'] } }, _sum: { qty: true } }).then((a) => a._sum.qty ?? 0)).toBe(10);
  });

  it('20 simultaneous submissions with ONE Idempotency-Key create exactly one order and one reservation', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_B');
    await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 2 });
    const h = await quoteHash(c);
    const key = `same-key-${randomUUID()}`;
    const results = await timed('20 duplicate submissions', () =>
      Promise.allSettled(Array.from({ length: 20 }, () => placeOrder({ customerId: c.userId, idempotencyKey: key, addressId: c.addressId, quoteHash: h }))),
    );
    const ids = new Set(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.order.id] : [])));
    expect(ids.size).toBe(1);
    expect(await db.order.count({ where: { idempotencyKey: key } })).toBe(1);
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(2);
  });
});

describe('concurrent reservations across SKUs', () => {
  it('12 customers buying 3 SKUs at once never oversell any SKU', async () => {
    const skus = await Promise.all([createSkuFixture({ physical: 4 }), createSkuFixture({ physical: 4 }), createSkuFixture({ physical: 4 })]);
    const customers = await Promise.all(Array.from({ length: 12 }, () => createActiveCustomer('LEVEL_A')));
    const plans = customers.map((c, i) => ({ c, sku: skus[i % 3].sku, qty: (i % 2) + 1 }));
    for (const p of plans) await setCartLine({ customerId: p.c.userId, priceLevelId: p.c.priceLevelId, sku: p.sku, qty: p.qty });
    const hashes = await Promise.all(plans.map((p) => quoteHash(p.c)));

    const results = await timed('12 concurrent multi-SKU checkouts', () =>
      Promise.allSettled(plans.map((p, i) => placeOrder({ customerId: p.c.userId, idempotencyKey: `multi-${randomUUID()}`, addressId: p.c.addressId, quoteHash: hashes[i] }))),
    );
    void results;
    for (const fx of skus) {
      const row = await skuRow(fx.sku);
      expect(row.inventory!.reservedQty).toBeLessThanOrEqual(row.inventory!.physicalOnHand);
      const live = await db.inventoryReservation.aggregate({ where: { skuId: row.id, status: { in: ['ACTIVE', 'EXTENDED', 'REVIEW_REQUIRED'] } }, _sum: { qty: true } });
      expect(live._sum.qty ?? 0).toBe(row.inventory!.reservedQty);
    }
  });
});

describe('concurrent courier settlement', () => {
  it('a shipment collected twice at once is recorded once (collection is set once)', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    const courier = await db.courier.findUniqueOrThrow({ where: { name: 'Synthetic Courier Two' } });
    const agreement = await db.courierAgreement.findFirstOrThrow({ where: { courierId: courier.id } });
    const shipment = await db.courierShipment.create({
      data: { orderId: order.id, courierId: courier.id, agreementId: agreement.id, settlementModeSnapshot: 'GROSS_REMITTANCE', customerFeeSnapshot: 4000, courierFeeSnapshot: 2500, codExpectedBase: 19000, deliveryStatus: 'HANDED_OVER' },
    });
    const accountant = await actorFor(STAFF.accountant);
    const results = await timed('5 concurrent collections', () =>
      Promise.allSettled(Array.from({ length: 5 }, (_, i) =>
        recordCollection(accountant, { shipmentId: shipment.id, collectedAmount: '19000', reference: `race-${i}`, idempotencyKey: `coll-${shipment.id}-${i}` }))),
    );
    const successes = results.filter((r) => r.status === 'fulfilled').length;
    expect(successes).toBe(1);
    expect((await db.courierShipment.findUniqueOrThrow({ where: { id: shipment.id } })).codCollected?.toFixed(0)).toBe('19000');
    expect(await db.courierFinancialEvent.count({ where: { shipmentId: shipment.id, eventType: 'COD_COLLECTED' } })).toBe(1);
  });

  it('concurrent allocations never exceed the transfer amount or the amount due per shipment', async () => {
    const courier = await db.courier.findUniqueOrThrow({ where: { name: 'Synthetic Courier Two' } });
    const agreement = await db.courierAgreement.findFirstOrThrow({ where: { courierId: courier.id } });
    const accountant = await actorFor(STAFF.accountant);
    const shipments: string[] = [];
    for (let i = 0; i < 4; i++) {
      const fx = await createSkuFixture({ physical: 3 });
      const c = await createActiveCustomer('LEVEL_A');
      const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
      const s = await db.courierShipment.create({
        data: { orderId: order.id, courierId: courier.id, agreementId: agreement.id, settlementModeSnapshot: 'GROSS_REMITTANCE', customerFeeSnapshot: 4000, courierFeeSnapshot: 2500, codExpectedBase: 19000, deliveryStatus: 'HANDED_OVER' },
      });
      await recordCollection(accountant, { shipmentId: s.id, collectedAmount: '19000', reference: `alloc-${i}`, idempotencyKey: `alloc-coll-${s.id}` });
      shipments.push(s.id);
    }
    // gross 30000; each shipment due 19000; 12 workers each try to allocate 7000 across shipments
    const rem = await recordRemittance(accountant, { courierId: courier.id, reference: `RACE-${randomUUID().slice(0, 8)}`, grossAmount: '30000', receivedAt: new Date(), method: 'BANK_TRANSFER', idempotencyKey: `race-rem-${randomUUID()}` });
    const attempts = Array.from({ length: 12 }, (_, i) => ({ shipmentId: shipments[i % shipments.length], amount: '7000' }));
    const results = await timed('12 concurrent allocations', () =>
      Promise.allSettled(attempts.map((a) => allocateRemittance(accountant, { remittanceId: rem.remittanceId, allocations: [a] }))),
    );
    const accepted = results.filter((r) => r.status === 'fulfilled').length;
    const allocs = await db.remittanceAllocation.findMany({ where: { remittanceId: rem.remittanceId } });
    const total = allocs.reduce((acc, a) => acc + Number(a.allocatedAmount.toFixed(0)), 0);
    expect(total).toBeLessThanOrEqual(30000);
    // at most 4 allocations fit the 30000 transfer; each shipment (due 19000) takes at most 2 of 7000
    expect(accepted).toBeLessThanOrEqual(4);
    expect(total).toBe(accepted * 7000);
    for (const sid of shipments) {
      const sum = await db.remittanceAllocation.aggregate({ where: { shipmentId: sid }, _sum: { allocatedAmount: true } });
      expect(Number(sum._sum.allocatedAmount?.toFixed(0) ?? 0)).toBeLessThanOrEqual(19000);
    }
    console.log(`[settlement] accepted ${accepted}/12, total allocated ${total} of 30000`);
  });
});
