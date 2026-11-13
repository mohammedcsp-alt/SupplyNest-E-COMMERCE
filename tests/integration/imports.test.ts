import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { previewProductImport, commitProductImport } from '@/modules/imports/products-import';
import { previewPriceImport, commitPriceImport } from '@/modules/imports/prices-import';
import { reserveLines } from '@/modules/inventory/inventory';
import { actorFor, createActiveCustomer, createSkuFixture, skuRow, STAFF } from '../helpers/fixtures';
import { PERMISSIONS } from '@/lib/rbac';

const HEADER = 'SKU,NAME_EN,NAME_AR,MODEL,BRAND,QUALITY,CATEGORY,PHYSICAL_STOCK,EXTRACTED_AT';
function csv(rows: string[], header = HEADER): Buffer {
  return Buffer.from([header, ...rows].join('\n'), 'utf8');
}
const TSHIRTS = 'dev-tshirts';

async function manager() {
  return actorFor(STAFF.manager);
}
async function inventoryClerk() {
  return actorFor(STAFF.inventory);
}

describe('product import: atomic validation (IMP-01, PRODUCT-009, ACX-04, T014–T018)', () => {
  it('one invalid row rejects the whole file and changes nothing (T014)', async () => {
    const good = `IMP-${randomUUID().slice(0, 6).toUpperCase()}`;
    const m = await manager();
    const preview = await previewProductImport({
      buffer: csv([`${good},Good item,,,,,${TSHIRTS},5,`, `BAD-${good},Bad item,,,,,no-such-category,5,`], HEADER.replace(',EXTRACTED_AT', '')),
      filename: 'mixed.csv',
      actorId: m.id,
    });
    expect(preview.batch.status).toBe('PREVIEW_INVALID');
    expect(preview.outcome.issues.some((i) => i.code === 'CATEGORY_UNKNOWN')).toBe(true);
    await expect(commitProductImport({ importId: preview.batch.id, actorId: m.id, actorPermissions: m.permissions })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await db.sku.findUnique({ where: { sku: good } })).toBeNull();
  });

  it('duplicate SKUs inside a file are invalid (PRODUCT-003 safety)', async () => {
    const code = `DUP-${randomUUID().slice(0, 6).toUpperCase()}`;
    const m = await manager();
    const preview = await previewProductImport({
      buffer: csv([`${code},A,,,,,${TSHIRTS},1,`, `${code},B,,,,,${TSHIRTS},2,`], HEADER.replace(',EXTRACTED_AT', '')),
      filename: 'dup.csv',
      actorId: m.id,
    });
    expect(preview.outcome.issues.map((i) => i.code)).toContain('SKU_DUPLICATE_IN_FILE');
  });

  it('absent SKUs are not changed (PRODUCT-002); present SKUs are updated (PRODUCT-003)', async () => {
    const absent = await createSkuFixture({ physical: 7 });
    const present = await createSkuFixture({ physical: 3 });
    const m = await manager();
    const extracted = '2030-01-01T08:00:00Z';
    const preview = await previewProductImport({
      buffer: csv([`${present.sku},Updated name,,,,,${TSHIRTS},42,${extracted}`]),
      filename: 'update.csv',
      actorId: m.id,
    });
    expect(preview.batch.status).toBe('PREVIEW_VALID');
    expect(preview.outcome.freshness).toBe('FRESH');
    await commitProductImport({ importId: preview.batch.id, actorId: m.id, actorPermissions: m.permissions });
    expect((await skuRow(present.sku)).inventory!.physicalOnHand).toBe(42);
    expect((await skuRow(present.sku)).nameEn).toBe('Updated name');
    expect((await skuRow(absent.sku)).inventory!.physicalOnHand).toBe(7);
  });

  it('a file without EXTRACTED_AT needs explicit confirmation (OPEN-06, UNKNOWN freshness)', async () => {
    const fx = await createSkuFixture({ physical: 1 });
    const m = await manager();
    const preview = await previewProductImport({
      buffer: csv([`${fx.sku},Unknown freshness,,,,,${TSHIRTS},9,`], HEADER.replace(',EXTRACTED_AT', '')),
      filename: 'nodate.csv',
      actorId: m.id,
    });
    expect(preview.outcome.freshness).toBe('UNKNOWN');
    await expect(commitProductImport({ importId: preview.batch.id, actorId: m.id, actorPermissions: m.permissions })).rejects.toMatchObject({ code: 'IMPORT_STALE_APPROVAL_REQUIRED' });
    await commitProductImport({ importId: preview.batch.id, actorId: m.id, actorPermissions: m.permissions, acknowledgeUnknownFreshness: true });
    expect((await skuRow(fx.sku)).inventory!.physicalOnHand).toBe(9);
    // unknown freshness never becomes a trusted source time
    expect((await skuRow(fx.sku)).inventory!.sourceTimestamp).toBeNull();
  });

  it('an older file than already-applied data requires a MANAGER override with a reason (ACX-04, T016–T017)', async () => {
    const fx = await createSkuFixture({ physical: 1 });
    const m = await manager();
    const inv = await inventoryClerk();
    // establish a newer trusted source time first
    const newer = await previewProductImport({ buffer: csv([`${fx.sku},Fresh,,,,,${TSHIRTS},20,2030-06-01T10:00:00Z`]), filename: 'new.csv', actorId: m.id });
    await commitProductImport({ importId: newer.batch.id, actorId: m.id, actorPermissions: m.permissions });

    const older = await previewProductImport({ buffer: csv([`${fx.sku},Stale,,,,,${TSHIRTS},99,2030-06-01T09:00:00Z`]), filename: 'old.csv', actorId: m.id });
    expect(older.outcome.freshness).toBe('STALE');
    await expect(commitProductImport({ importId: older.batch.id, actorId: m.id, actorPermissions: m.permissions })).rejects.toMatchObject({ code: 'IMPORT_STALE_APPROVAL_REQUIRED' });
    // a clerk cannot override, even with a reason
    await expect(commitProductImport({ importId: older.batch.id, actorId: inv.id, actorPermissions: inv.permissions, override: { reason: 'please' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await skuRow(fx.sku)).inventory!.physicalOnHand).toBe(20);
    // the manager overrides with a reason, which is stored and audited
    await commitProductImport({ importId: older.batch.id, actorId: m.id, actorPermissions: m.permissions, override: { reason: 'warehouse recount confirmed' } });
    expect((await skuRow(fx.sku)).inventory!.physicalOnHand).toBe(99);
    const stored = await db.importBatch.findUniqueOrThrow({ where: { id: older.batch.id } });
    expect(stored.overrideReason).toBe('warehouse recount confirmed');
    expect(await db.auditLog.count({ where: { action: 'import.commit', entityId: older.batch.id } })).toBe(1);
  });

  it('a double commit of the same preview applies once (concurrency claim)', async () => {
    const fx = await createSkuFixture({ physical: 1 });
    const m = await manager();
    const preview = await previewProductImport({ buffer: csv([`${fx.sku},Once,,,,,${TSHIRTS},5,2030-07-01T00:00:00Z`]), filename: 'once.csv', actorId: m.id });
    const results = await Promise.allSettled([
      commitProductImport({ importId: preview.batch.id, actorId: m.id, actorPermissions: m.permissions }),
      commitProductImport({ importId: preview.batch.id, actorId: m.id, actorPermissions: m.permissions }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.inventoryMovement.count({ where: { sourceRef: preview.batch.id, movementType: 'IMPORT_SET' } })).toBe(1);
  });

  it('stock below live reservations creates a visible conflict alert and deletes no reservation (INV conflict rule)', async () => {
    const fx = await createSkuFixture({ physical: 5 });
    const c = await createActiveCustomer('LEVEL_A');
    const { placeTestOrder } = await import('../helpers/fixtures');
    await placeTestOrder(c, [{ sku: fx.sku, qty: 4 }]);
    const m = await manager();
    const preview = await previewProductImport({ buffer: csv([`${fx.sku},Conflict,,,,,${TSHIRTS},2,2030-08-01T00:00:00Z`]), filename: 'conflict.csv', actorId: m.id });
    await commitProductImport({ importId: preview.batch.id, actorId: m.id, actorPermissions: m.permissions });
    const row = await skuRow(fx.sku);
    expect(row.inventory!.reservedQty).toBe(4);
    expect(await db.inventoryReservation.count({ where: { skuId: row.id, status: 'ACTIVE' } })).toBe(1);
    expect(await db.inventoryAlert.count({ where: { skuId: row.id, alertType: 'STOCK_CONFLICT', state: 'OPEN' } })).toBe(1);
  });

  it('the stored preview cannot be committed by a user without import.commit (permission is checked by the route, verified here by permission set)', async () => {
    const clerk = await inventoryClerk();
    expect(clerk.permissions.has(PERMISSIONS.IMPORT_COMMIT)).toBe(false);
  });
});

describe('price import (PRODUCT-007)', () => {
  it('rejects unknown SKUs, inactive levels and duplicate pairs; accepts valid rows with history', async () => {
    const fx = await createSkuFixture({ physical: 1, prices: { LEVEL_A: 1000 } });
    const m = await manager();
    const bad = await previewPriceImport({
      buffer: Buffer.from(`SKU,PRICE_LEVEL,PRICE\n${fx.sku},LEVEL_C,5000\nNOPE-SKU-X,LEVEL_A,5000\n${fx.sku},LEVEL_A,1500.5\n${fx.sku},LEVEL_A,2000\n${fx.sku},LEVEL_A,2100\n`),
      filename: 'prices-bad.csv',
      actorId: m.id,
    });
    expect(bad.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['LEVEL_INACTIVE', 'SKU_UNKNOWN', 'PRICE_INVALID', 'DUPLICATE_PRICE_ROW']));
    await expect(commitPriceImport({ importId: bad.batch.id, actorId: m.id })).rejects.toMatchObject({ code: 'CONFLICT' });

    const good = await previewPriceImport({ buffer: Buffer.from(`SKU,PRICE_LEVEL,PRICE\n${fx.sku},LEVEL_A,1750\n`), filename: 'prices.csv', actorId: m.id });
    expect(good.issues).toHaveLength(0);
    const result = await commitPriceImport({ importId: good.batch.id, actorId: m.id });
    expect(result.changed).toBe(1);
    const hist = await db.priceChangeHistory.findFirst({ where: { skuId: (await skuRow(fx.sku)).id, source: 'IMPORT' }, orderBy: { occurredAt: 'desc' } });
    expect(hist?.newAmount.toFixed(0)).toBe('1750');
    expect(hist?.oldAmount?.toFixed(0)).toBe('1000');
  });
});
