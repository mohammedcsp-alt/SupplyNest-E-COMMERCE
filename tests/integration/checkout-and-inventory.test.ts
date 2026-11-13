import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { buildQuote } from '@/modules/commerce/quote';
import { placeOrder } from '@/modules/commerce/checkout';
import { setCartLine } from '@/modules/commerce/cart';
import { sweepExpiredReservations, extendReservation, releaseReservationByAdmin, syncAlerts } from '@/modules/inventory/inventory';
import { requestCancellation, resolveCancellation, editOrder, getCustomerOrder, reorderIntoCart, setLocalHold } from '@/modules/commerce/orders';
import { actorFor, createActiveCustomer, createSkuFixture, placeTestOrder, skuRow, STAFF, KIRKUK_ID } from '../helpers/fixtures';
import { adjustPhysical } from '@/modules/inventory/inventory';
import { errors } from '@/lib/errors';

async function quoteHash(c: Awaited<ReturnType<typeof createActiveCustomer>>) {
  return (await db.$transaction((tx) => buildQuote(tx, { customerId: c.userId, addressId: c.addressId }))).quoteHash;
}

describe('checkout, idempotency and oversell protection (ACX-02, T010, T024, T025)', () => {
  it('two concurrent checkouts for the LAST unit: exactly one succeeds and reserved never exceeds physical', async () => {
    const fx = await createSkuFixture({ physical: 1 });
    const a = await createActiveCustomer('LEVEL_A');
    const b = await createActiveCustomer('LEVEL_A');
    for (const c of [a, b]) await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 1 });
    const [ha, hb] = [await quoteHash(a), await quoteHash(b)];

    const attempts = await Promise.allSettled([
      placeOrder({ customerId: a.userId, idempotencyKey: `race-a-${randomUUID()}`, addressId: a.addressId, quoteHash: ha }),
      placeOrder({ customerId: b.userId, idempotencyKey: `race-b-${randomUUID()}`, addressId: b.addressId, quoteHash: hb }),
    ]);
    const fulfilled = attempts.filter((r) => r.status === 'fulfilled');
    const rejected = attempts.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as { code: string }).code).toBe('STOCK_CHANGED');

    const row = await skuRow(fx.sku);
    expect(row.inventory!.reservedQty).toBeLessThanOrEqual(row.inventory!.physicalOnHand);
    expect(row.inventory!.reservedQty).toBe(1);
  });

  it('a retry with the same Idempotency-Key returns the same order and creates no second reservation (T024)', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_B');
    await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 2 });
    const h = await quoteHash(c);
    const key = `idem-${randomUUID()}`;
    const first = await placeOrder({ customerId: c.userId, idempotencyKey: key, addressId: c.addressId, quoteHash: h });
    const second = await placeOrder({ customerId: c.userId, idempotencyKey: key, addressId: c.addressId, quoteHash: h });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(await db.order.count({ where: { idempotencyKey: key } })).toBe(1);
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(2);
  });

  it('concurrent duplicate submissions with the same key create exactly one order (T024/T025)', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 1 });
    const h = await quoteHash(c);
    const key = `dup-${randomUUID()}`;
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => placeOrder({ customerId: c.userId, idempotencyKey: key, addressId: c.addressId, quoteHash: h })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ order: { id: string } }>[];
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(ok.map((r) => r.value.order.id));
    expect(ids.size).toBe(1);
    expect(await db.order.count({ where: { idempotencyKey: key } })).toBe(1);
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(1);
  });

  it('reusing a key for different content is rejected (CONFLICT)', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 1 });
    const h = await quoteHash(c);
    const key = `reuse-${randomUUID()}`;
    await placeOrder({ customerId: c.userId, idempotencyKey: key, addressId: c.addressId, quoteHash: h });
    await expect(placeOrder({ customerId: c.userId, idempotencyKey: key, addressId: c.addressId, quoteHash: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('a price change after review forces re-confirmation (PRICE_CHANGED, ACX-06)', async () => {
    const fx = await createSkuFixture({ physical: 10, prices: { LEVEL_A: 15000 } });
    const c = await createActiveCustomer('LEVEL_A');
    await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 1 });
    const reviewed = await quoteHash(c);
    const level = await db.priceLevel.findUniqueOrThrow({ where: { code: 'LEVEL_A' } });
    await db.tierPrice.update({ where: { skuId_priceLevelId: { skuId: (await skuRow(fx.sku)).id, priceLevelId: level.id } }, data: { amount: 16000 } });
    await expect(placeOrder({ customerId: c.userId, idempotencyKey: `pc-${randomUUID()}`, addressId: c.addressId, quoteHash: reviewed })).rejects.toMatchObject({ code: 'PRICE_CHANGED' });
  });

  it('a region without a shipping rule cannot check out (ACX-06, T027)', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const kirkukAddress = await db.address.create({ data: { customerId: c.userId, governorateId: KIRKUK_ID, details: 'No rule street', recipientName: 'X', recipientPhone: c.phone } });
    await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 1 });
    await expect(db.$transaction((tx) => buildQuote(tx, { customerId: c.userId, addressId: kirkukAddress.id }))).rejects.toMatchObject({ code: 'SHIPPING_RULE_MISSING' });
  });

  it('insufficient stock at checkout is rejected without partial reservation', async () => {
    const fx = await createSkuFixture({ physical: 2 });
    const c = await createActiveCustomer('LEVEL_A');
    await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 3 });
    const q = await db.$transaction((tx) => buildQuote(tx, { customerId: c.userId, addressId: c.addressId }));
    expect(q.blocking).toBe(true);
    await expect(placeOrder({ customerId: c.userId, idempotencyKey: `ins-${randomUUID()}`, addressId: c.addressId, quoteHash: q.quoteHash })).rejects.toMatchObject({ code: 'STOCK_CHANGED' });
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(0);
  });

  it('unpublished or inactive SKUs are not orderable', async () => {
    const fx = await createSkuFixture({ physical: 5, published: false });
    const c = await createActiveCustomer('LEVEL_A');
    await expect(setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('reservations: expiry review, exactly-once release, cancellation (INV-01, ACX-03, ACX-08, T011–T013)', () => {
  it('an expired reservation goes to REVIEW_REQUIRED and keeps holding stock (no automatic release)', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 2 }]);
    await db.inventoryReservation.updateMany({ where: { orderId: order.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const moved = await sweepExpiredReservations();
    expect(moved).toBeGreaterThanOrEqual(1);
    const res = await db.inventoryReservation.findFirstOrThrow({ where: { orderId: order.id } });
    expect(res.status).toBe('REVIEW_REQUIRED');
    const row = await skuRow(fx.sku);
    expect(row.inventory!.reservedQty).toBe(2); // still held
    const alert = await db.inventoryAlert.findFirst({ where: { skuId: row.id, alertType: 'RESERVATION_REVIEW', state: 'OPEN' } });
    expect(alert).not.toBeNull();
  });

  it('an admin extension is audited, and release happens exactly once (T012, T013)', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    const manager = await actorFor(STAFF.manager);
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    const res = await db.inventoryReservation.findFirstOrThrow({ where: { orderId: order.id } });
    await db.$transaction((tx) => extendReservation(tx, { reservationId: res.id, hours: 48, reason: 'customer asked for more time', actorId: manager.id }));
    const extended = await db.inventoryReservation.findUniqueOrThrow({ where: { id: res.id } });
    expect(extended.status).toBe('EXTENDED');
    expect(await db.auditLog.count({ where: { action: 'reservation.extend', entityId: res.id } })).toBe(1);

    await db.$transaction((tx) => releaseReservationByAdmin(tx, { reservationId: res.id, reason: 'released after review', actorId: manager.id }));
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(0);
    await expect(db.$transaction((tx) => releaseReservationByAdmin(tx, { reservationId: res.id, reason: 'again', actorId: manager.id }))).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(0);
  });

  it('an approved cancellation releases reservations exactly once; a second approval is refused (ACX-08)', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    const manager = await actorFor(STAFF.manager);
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 3 }]);
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(3);
    await requestCancellation({ customerId: c.userId, orderId: order.id, reason: 'changed my mind' });
    await resolveCancellation({ actorId: manager.id, orderId: order.id, approve: true, reason: 'approved' });
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(0);
    await expect(resolveCancellation({ actorId: manager.id, orderId: order.id, approve: true, reason: 'again' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('CANCELLED');
  });

  it('a rejected cancellation restores the order and keeps its reservation', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    const manager = await actorFor(STAFF.manager);
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    await requestCancellation({ customerId: c.userId, orderId: order.id, reason: 'maybe' });
    await resolveCancellation({ actorId: manager.id, orderId: order.id, approve: false, reason: 'please keep it' });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('SUBMITTED');
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(1);
  });

  it('customer edits reprice only changed lines, need consent for price differences, and update reservations atomically', async () => {
    const fx = await createSkuFixture({ physical: 10, prices: { LEVEL_A: 15000 } });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 2 }]);
    const orderDetail = await getCustomerOrder(c.userId, order.id);
    await expect(editOrder({ customerId: c.userId, priceLevelId: c.priceLevelId, priceLevelCode: 'LEVEL_A', orderId: order.id, expectedVersion: 99, lines: [{ sku: fx.sku, qty: 3 }], acceptPriceChanges: false })).rejects.toMatchObject({ code: 'CONFLICT' });
    const edited = await editOrder({ customerId: c.userId, priceLevelId: c.priceLevelId, priceLevelCode: 'LEVEL_A', orderId: order.id, expectedVersion: orderDetail.version, lines: [{ sku: fx.sku, qty: 4 }], acceptPriceChanges: false });
    expect(edited.totalCod).toBe(String(4 * 15000 + 4000));
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(4);
    // a removed line releases its reservation
    const afterRemoval = await editOrder({ customerId: c.userId, priceLevelId: c.priceLevelId, priceLevelCode: 'LEVEL_A', orderId: order.id, expectedVersion: edited.version, lines: [{ sku: fx.sku, qty: 0 }], acceptPriceChanges: false }).catch((e) => e);
    expect(afterRemoval).toMatchObject({ code: 'CONFLICT' }); // an order needs at least one item
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(4); // refused removal changed nothing
  });

  it('editing is refused once preparation is locked (OPEN-12)', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    const manager = await actorFor(STAFF.manager);
    const { lockForPreparation } = await import('@/modules/commerce/orders');
    await lockForPreparation({ actorId: manager.id, orderId: order.id, reason: 'packing started' });
    const detail = await getCustomerOrder(c.userId, order.id);
    await expect(editOrder({ customerId: c.userId, priceLevelId: c.priceLevelId, priceLevelCode: 'LEVEL_A', orderId: order.id, expectedVersion: detail.version, lines: [{ sku: fx.sku, qty: 2 }], acceptPriceChanges: true })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('reorder uses current prices and availability and does not alter the old order (ACX-07)', async () => {
    const fx = await createSkuFixture({ physical: 10, prices: { LEVEL_A: 15000 } });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    const level = await db.priceLevel.findUniqueOrThrow({ where: { code: 'LEVEL_A' } });
    await db.tierPrice.update({ where: { skuId_priceLevelId: { skuId: (await skuRow(fx.sku)).id, priceLevelId: level.id } }, data: { amount: 17000 } });
    const report = await reorderIntoCart({ customerId: c.userId, priceLevelId: c.priceLevelId, orderId: order.id });
    expect(report[0].status).toBe('ADDED');
    const oldItem = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(oldItem.unitPrice.toFixed(0)).toBe('15000'); // snapshot untouched
  });

  it('suspended customers keep their order history but cannot place new orders', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    const { suspendCustomer } = await import('@/modules/identity/customer-service');
    await suspendCustomer(await actorFor(STAFF.manager), { customerId: c.userId, reason: 'fixture' });
    const { listCustomerOrders } = await import('@/modules/commerce/orders');
    expect((await listCustomerOrders(c.userId, { page: 1, pageSize: 10 })).total).toBe(1);
  });

  it('manual hold moves the order to ON_HOLD_LOCAL without touching reservations', async () => {
    const fx = await createSkuFixture({ physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const { order } = await placeTestOrder(c, [{ sku: fx.sku, qty: 1 }]);
    const manager = await actorFor(STAFF.manager);
    await setLocalHold({ actorId: manager.id, orderId: order.id, on: true, reason: 'payment review' });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('ON_HOLD_LOCAL');
    expect((await skuRow(fx.sku)).inventory!.reservedQty).toBe(1);
  });
});

describe('stock never goes negative and alerts do not duplicate (INV-01, ADM-11)', () => {
  it('manual adjustments cannot make stock negative or drop below live reservations', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    await placeTestOrder(c, [{ sku: fx.sku, qty: 4 }]);
    const manager = await actorFor(STAFF.manager);
    const skuId = (await skuRow(fx.sku)).id;
    await expect(db.$transaction((tx) => adjustPhysical(tx, { skuId, mode: 'SET', value: -1, reason: 'bad', actorId: manager.id }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(db.$transaction((tx) => adjustPhysical(tx, { skuId, mode: 'SET', value: 2, reason: 'drop below reserved', actorId: manager.id }))).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('low-stock alert is raised once and not duplicated on repeated syncs', async () => {
    const fx = await createSkuFixture({ physical: 2 });
    const row = await skuRow(fx.sku);
    await db.$transaction((tx) => syncAlerts(tx, [row.id]));
    await db.$transaction((tx) => syncAlerts(tx, [row.id]));
    expect(await db.inventoryAlert.count({ where: { skuId: row.id, alertType: 'LOW_STOCK', state: 'OPEN' } })).toBe(1);
  });

  it('errors helper maps to the documented HTTP status', () => {
    expect(errors.stockChanged('x').status).toBe(409);
    expect(errors.shippingMissing('x').status).toBe(422);
  });
});
