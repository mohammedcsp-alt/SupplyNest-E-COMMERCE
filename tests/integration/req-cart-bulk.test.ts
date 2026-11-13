import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getNumberSetting } from '@/lib/settings';
import { buildQuote } from '@/modules/commerce/quote';
import { placeOrder } from '@/modules/commerce/checkout';
import { previewBulk, setCartLine } from '@/modules/commerce/cart';
import { actorFor, createActiveCustomer, STAFF } from '../helpers/fixtures';
import { makeSku } from './req-helpers';

const tag = () => randomUUID().slice(0, 8).toUpperCase();

async function cartCount(customerId: string) {
  return db.cartItem.count({ where: { cart: { customerId } } });
}

async function reservedOf(skuCode: string) {
  return (await db.sku.findUniqueOrThrow({ where: { sku: skuCode }, include: { inventory: true } })).inventory!.reservedQty;
}

describe('bulk paste preview (P05, ACX-05, CUS-07)', () => {
  it('pasted lines are parsed, duplicates are merged and reported, unknown SKUs and bad quantities are per-row issues, nothing is added or reserved', async () => {
    const a = await makeSku({ nameEn: `Bulk A ${tag()}`, physical: 20 });
    const b = await makeSku({ nameEn: `Bulk B ${tag()}`, physical: 20 });
    const c = await makeSku({ nameEn: `Bulk C ${tag()}`, physical: 20 });
    const unknown = `NOPE-${tag()}`;
    const customer = await createActiveCustomer('LEVEL_A');

    const text = [`${a.sku} 2`, `${b.sku}\t1`, `${a.sku} 3`, `${unknown} 1`, `${b.sku} 0`, `${c.sku},4`].join('\n');
    const preview = await previewBulk({ customerId: customer.userId, text });

    const lineA = preview.lines.find((l) => l.sku === a.sku)!;
    expect(lineA.qty).toBe(5);
    expect(lineA.sourceRows).toEqual([1, 3]);
    expect(preview.lines.find((l) => l.sku === b.sku)!.qty).toBe(1);
    expect(preview.lines.find((l) => l.sku === c.sku)!.qty).toBe(4);
    expect(preview.mergedDuplicates).toBe(1);
    expect(preview.rowsRead).toBe(6);

    const unknownIssue = preview.issues.find((i) => i.code === 'SKU_UNKNOWN');
    expect(unknownIssue).toMatchObject({ rowNumber: 4, input: unknown });
    const qtyIssue = preview.issues.find((i) => i.code === 'QTY_INVALID');
    expect(qtyIssue).toMatchObject({ rowNumber: 5 });
    expect(preview.issues).toHaveLength(2);

    // preview is read-only
    expect(await cartCount(customer.userId)).toBe(0);
    expect(await reservedOf(a.sku)).toBe(0);
    expect(await db.order.count({ where: { customerId: customer.userId } })).toBe(0);
  });
});

describe('customer Excel/CSV upload preview (P06, CUS-08, IMP-02)', () => {
  it('a CSV upload previews the same way and creates no order or reservation', async () => {
    const a = await makeSku({ nameEn: `CSV A ${tag()}`, physical: 20 });
    const b = await makeSku({ nameEn: `CSV B ${tag()}`, physical: 20 });
    const customer = await createActiveCustomer('LEVEL_B');
    const unknown = `NOPE-${tag()}`;
    const csv = Buffer.from(`SKU,QTY\n${a.sku},2\n${a.sku},1\n${unknown},3\n${b.sku},0\n`, 'utf8');

    const preview = await previewBulk({ customerId: customer.userId, file: { buffer: csv, filename: 'order.csv' } });
    const lineA = preview.lines.find((l) => l.sku === a.sku)!;
    expect(lineA.qty).toBe(3);
    expect(lineA.sourceRows).toHaveLength(2);
    expect(preview.mergedDuplicates).toBe(1);
    expect(preview.issues.find((i) => i.code === 'SKU_UNKNOWN')).toBeDefined();
    expect(preview.issues.find((i) => i.code === 'QTY_INVALID')).toBeDefined();
    expect(preview.lines.find((l) => l.sku === b.sku)).toBeUndefined();

    expect(await db.order.count({ where: { customerId: customer.userId } })).toBe(0);
    expect(await reservedOf(a.sku)).toBe(0);
    expect(await cartCount(customer.userId)).toBe(0);
  });
});

describe('per-SKU quantity limit (P12, OPEN-22)', () => {
  it('setCartLine refuses a quantity above the limit with VALIDATION_ERROR', async () => {
    const item = await makeSku({ nameEn: `Limit ${tag()}`, physical: 500 });
    const customer = await createActiveCustomer('LEVEL_A');
    const max = await getNumberSetting(db, 'order.maxQtyPerSku', 100);
    await expect(setCartLine({ customerId: customer.userId, priceLevelId: customer.priceLevelId, sku: item.sku, qty: max + 1 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await cartCount(customer.userId)).toBe(0);
  });

  it('a cart line above a lowered limit is reported as QTY_LIMIT by the quote and blocks submission', async () => {
    const item = await makeSku({ nameEn: `Limit quote ${tag()}`, physical: 50 });
    const customer = await createActiveCustomer('LEVEL_A');
    await setCartLine({ customerId: customer.userId, priceLevelId: customer.priceLevelId, sku: item.sku, qty: 5 });

    const manager = await actorFor(STAFF.manager);
    const previous = await db.systemSetting.findUnique({ where: { key: 'order.maxQtyPerSku' } });
    try {
      await db.systemSetting.upsert({
        where: { key: 'order.maxQtyPerSku' },
        update: { valueJson: 3, updatedById: manager.id },
        create: { key: 'order.maxQtyPerSku', valueJson: 3, updatedById: manager.id },
      });
      const quote = await db.$transaction((tx) => buildQuote(tx, { customerId: customer.userId, addressId: customer.addressId }));
      const warn = quote.warnings.find((w) => w.code === 'QTY_LIMIT');
      expect(warn).toMatchObject({ sku: item.sku });
      expect(quote.blocking).toBe(true);
      await expect(
        placeOrder({ customerId: customer.userId, idempotencyKey: `limit-${randomUUID()}`, addressId: customer.addressId, quoteHash: quote.quoteHash }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(await db.order.count({ where: { customerId: customer.userId } })).toBe(0);
    } finally {
      if (previous) await db.systemSetting.update({ where: { key: 'order.maxQtyPerSku' }, data: { valueJson: previous.valueJson as never } });
      else await db.systemSetting.deleteMany({ where: { key: 'order.maxQtyPerSku' } });
    }
    expect(await getNumberSetting(db, 'order.maxQtyPerSku', 100)).toBe(previous ? (previous.valueJson as number) : 100);
  });
});
