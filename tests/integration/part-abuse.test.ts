import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getNumberSetting } from '@/lib/settings';
import { setCartLine } from '@/modules/commerce/cart';
import { placeOrder } from '@/modules/commerce/checkout';
import { createActiveCustomer, createSkuFixture } from '../helpers/fixtures';

/**
 * Abuse controls (P12). Behaviour is asserted as it is implemented; no limit was changed for these tests.
 * Note: the checkout limit is per customer. A per-IP order limit is not implemented in V1 (see the report).
 */
describe('P12 per-SKU quantity limit (order.maxQtyPerSku)', () => {
  it('setCartLine refuses a quantity above the configured maximum', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    const max = await getNumberSetting(db, 'order.maxQtyPerSku', 100);
    await expect(setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: max + 1 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(await db.cartItem.count({ where: { cart: { customerId: c.userId } } })).toBe(0);
  });

  it('setCartLine accepts exactly the configured maximum', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    const max = await getNumberSetting(db, 'order.maxQtyPerSku', 100);
    const res = await setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: max });
    expect(res).toMatchObject({ removed: false, qty: max });
  });

  it('setCartLine refuses negative and non-integer quantities', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    await expect(setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: -1 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(setCartLine({ customerId: c.userId, priceLevelId: c.priceLevelId, sku: fx.sku, qty: 1.5 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('P12 checkout rate limit (10 per hour per customer)', () => {
  it('the 11th checkout attempt within the window is refused with RATE_LIMITED, and other customers are unaffected', async () => {
    const a = await createActiveCustomer('LEVEL_A');
    const b = await createActiveCustomer('LEVEL_A');
    // Each attempt consumes the limit before any cart or quote validation, so an empty cart with a wrong quote hash
    // is enough to exercise the limiter. Only the error code matters here.
    const attempt = (customerId: string, addressId: string) =>
      placeOrder({ customerId, idempotencyKey: `abuse-${randomUUID()}`, addressId, quoteHash: '0'.repeat(64) }).then(
        () => 'OK',
        (err: unknown) => (err as { code?: string }).code ?? 'ERROR',
      );

    const first = [];
    for (let i = 0; i < 10; i++) first.push(await attempt(a.userId, a.addressId));
    expect(first.filter((code) => code === 'RATE_LIMITED')).toHaveLength(0);

    await expect(
      placeOrder({ customerId: a.userId, idempotencyKey: `abuse-${randomUUID()}`, addressId: a.addressId, quoteHash: '0'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    expect(await attempt(b.userId, b.addressId)).not.toBe('RATE_LIMITED');
  });
});
