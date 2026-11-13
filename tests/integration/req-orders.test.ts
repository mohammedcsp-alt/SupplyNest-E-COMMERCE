import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { buildQuote } from '@/modules/commerce/quote';
import { placeOrder } from '@/modules/commerce/checkout';
import { setCartLine } from '@/modules/commerce/cart';
import { proposeMerge, respondMerge } from '@/modules/commerce/orders';
import { BAGHDAD_ID, MANSOUR_AREA_ID, createActiveCustomer, placeTestOrder } from '../helpers/fixtures';
import { makeSku } from './req-helpers';

describe('cash on delivery only and order totals (STORE-005)', () => {
  it('the Order model carries no payment-method field and the total equals subtotal plus shipping (COD amount)', async () => {
    const orderModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Order');
    expect(orderModel).toBeDefined();
    const fieldNames = orderModel!.fields.map((f) => f.name);
    expect(fieldNames.filter((n) => /payment/i.test(n))).toEqual([]);
    expect(fieldNames).toContain('totalCod');

    const item = await makeSku({ nameEn: `COD item ${randomUUID().slice(0, 6)}`, physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: item.sku, qty: 2 });
    // the quote the customer reviews, built before placement (placement clears the cart)
    const quote = await db.$transaction((tx) => buildQuote(tx, { customerId: c.userId, addressId: c.addressId }));
    const { order } = await placeOrder({ customerId: c.userId, idempotencyKey: `cod-${randomUUID()}`, addressId: c.addressId, quoteHash: quote.quoteHash });

    expect(Object.keys(order).filter((k) => /payment/i.test(k))).toEqual([]);
    const subtotal = new Prisma.Decimal(order.subtotal);
    const shipping = new Prisma.Decimal(order.shippingFee);
    expect(subtotal.toFixed(0)).toBe('30000');
    expect(shipping.gt(0)).toBe(true);
    expect(order.totalCod.toFixed(0)).toBe(subtotal.add(shipping).toFixed(0));
    expect(order.currency).toBe('IQD');
    // the quote the customer consented to has the same total that was stored as the COD amount
    expect(quote.total.toFixed(0)).toBe(order.totalCod.toFixed(0));
    expect(quote.subtotal.add(quote.shippingFee).toFixed(0)).toBe(quote.total.toFixed(0));
  });
});

describe('no minimum order (ORD-004)', () => {
  it('a single-unit order at a low total is accepted', async () => {
    const item = await makeSku({ nameEn: `Single unit ${randomUUID().slice(0, 6)}`, physical: 5, prices: { LEVEL_A: 1000 } });
    const c = await createActiveCustomer('LEVEL_A');
    const { order, replayed } = await placeTestOrder(c, [{ sku: item.sku, qty: 1 }]);
    expect(replayed).toBe(false);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].qty).toBe(1);
    expect(order.subtotal.toFixed(0)).toBe('1000');
  });
});

describe('merge suggestions never change orders (ORD-005, OPEN-13)', () => {
  it('proposing and accepting a merge leaves both orders, their items and their reservations unchanged', async () => {
    const s1 = await makeSku({ nameEn: `Merge A ${randomUUID().slice(0, 6)}`, physical: 10 });
    const s2 = await makeSku({ nameEn: `Merge B ${randomUUID().slice(0, 6)}`, physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const first = await placeTestOrder(c, [{ sku: s1.sku, qty: 1 }]);
    const second = await placeTestOrder(c, [{ sku: s2.sku, qty: 2 }]);

    const snapshot = async () =>
      Promise.all(
        [first.order.id, second.order.id].map(async (id) => {
          const o = await db.order.findUniqueOrThrow({ where: { id }, include: { items: true, reservations: true, fulfillmentJob: true } });
          return {
            status: o.status,
            version: o.version,
            totalCod: o.totalCod.toFixed(0),
            items: o.items.map((i) => `${i.skuSnapshot}:${i.qty}`).sort(),
            reservations: o.reservations.map((r) => `${r.skuId}:${r.qty}:${r.status}`).sort(),
            job: o.fulfillmentJob?.status ?? null,
          };
        }),
      );
    const before = await snapshot();
    expect(before.every((o) => o.status === 'SUBMITTED')).toBe(true);

    const proposal = await proposeMerge({ customerId: c.userId, orderIds: [first.order.id, second.order.id], rationale: 'same delivery day' });
    expect(proposal.status).toBe('PROPOSED');
    expect(await db.mergeProposalOrder.count({ where: { proposalId: proposal.id } })).toBe(2);
    expect(await snapshot()).toEqual(before);

    const accepted = await respondMerge({ customerId: c.userId, proposalId: proposal.id, accept: true });
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.respondedAt).not.toBeNull();
    expect(await snapshot()).toEqual(before);

    await expect(respondMerge({ customerId: c.userId, proposalId: proposal.id, accept: false })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('addresses are snapshotted at submission (ORD-007, CUS-03, T026)', () => {
  it('an added address is copied into the order snapshot and later edits do not change the existing order', async () => {
    const item = await makeSku({ nameEn: `Addr item ${randomUUID().slice(0, 6)}`, physical: 10 });
    const c = await createActiveCustomer('LEVEL_A');
    const first = await placeTestOrder(c, [{ sku: item.sku, qty: 1 }]);
    expect((first.order.addressSnapshot as { details: string }).details).toBe('Fixture street 1');

    const added = await db.address.create({
      data: { customerId: c.userId, governorateId: BAGHDAD_ID, areaId: MANSOUR_AREA_ID, details: 'Snapshot street 7', recipientName: 'Snap', recipientPhone: c.phone },
    });
    await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: item.sku, qty: 1 });
    const quote = await db.$transaction((tx) => buildQuote(tx, { customerId: c.userId, addressId: added.id }));
    const second = await placeOrder({ customerId: c.userId, idempotencyKey: `addr-${randomUUID()}`, addressId: added.id, quoteHash: quote.quoteHash });
    expect((second.order.addressSnapshot as { details: string; id: string }).details).toBe('Snapshot street 7');
    expect((second.order.addressSnapshot as { id: string }).id).toBe(added.id);

    await db.address.update({ where: { id: added.id }, data: { details: 'Edited street 9', recipientName: 'Edited' } });
    const reloaded = await db.order.findUniqueOrThrow({ where: { id: second.order.id } });
    expect((reloaded.addressSnapshot as { details: string }).details).toBe('Snapshot street 7');
    expect((reloaded.addressSnapshot as { recipientName: string }).recipientName).toBe('Snap');
    expect(((await db.address.findUniqueOrThrow({ where: { id: added.id } })).details)).toBe('Edited street 9');
  });
});
