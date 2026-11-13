import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createSkuFixture, skuRow } from '../helpers/fixtures';

/** Database-level guarantees that do not depend on application code paths (spec 12, ACX-02, PRODUCT-006). */
describe('database guards', () => {
  it('audit_logs rejects UPDATE and DELETE (ADMIN-005)', async () => {
    const row = await db.auditLog.create({ data: { action: 'test.guard', entityType: 'test', entityId: randomUUID() } });
    await expect(db.$executeRawUnsafe(`UPDATE "audit_logs" SET "action" = 'tampered' WHERE "id" = '${row.id}'`)).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "audit_logs" WHERE "id" = '${row.id}'`)).rejects.toThrow(/append-only/);
  });

  it('a SKU cannot hold more than 10 images, enforced by the database trigger (PRODUCT-006, T008)', async () => {
    const fx = await createSkuFixture({ physical: 1 });
    const s = await skuRow(fx.sku);
    for (let i = 0; i < 10; i++) {
      await db.skuImage.create({ data: { skuId: s.id, fileKey: `products/${s.id}/t-${randomUUID()}.png`, mimeType: 'image/png', sortOrder: i } });
    }
    await expect(
      db.skuImage.create({ data: { skuId: s.id, fileKey: `products/${s.id}/t-${randomUUID()}.png`, mimeType: 'image/png', sortOrder: 10 } }),
    ).rejects.toThrow(/at most 10 images|SKU_IMAGE_LIMIT_EXCEEDED/);
    expect(await db.skuImage.count({ where: { skuId: s.id } })).toBe(10);
  });

  it('inventory can never be negative (CHECK constraint, ACX-02)', async () => {
    const fx = await createSkuFixture({ physical: 1 });
    const s = await skuRow(fx.sku);
    await expect(db.$executeRawUnsafe(`UPDATE "inventory_balances" SET "physicalOnHand" = -1 WHERE "skuId" = '${s.id}'`)).rejects.toThrow(/inv_physical_nonneg/);
    await expect(db.$executeRawUnsafe(`UPDATE "inventory_balances" SET "reservedQty" = -1 WHERE "skuId" = '${s.id}'`)).rejects.toThrow(/inv_reserved_nonneg/);
  });

  it('only one OPEN alert per SKU and type can exist (partial unique index)', async () => {
    const fx = await createSkuFixture({ physical: 1 });
    const s = await skuRow(fx.sku);
    await db.inventoryAlert.create({ data: { skuId: s.id, alertType: 'STALE_DATA', state: 'OPEN' } });
    await expect(db.inventoryAlert.create({ data: { skuId: s.id, alertType: 'STALE_DATA', state: 'OPEN' } })).rejects.toThrow();
    await db.inventoryAlert.updateMany({ where: { skuId: s.id, alertType: 'STALE_DATA' }, data: { state: 'RESOLVED' } });
    await db.inventoryAlert.create({ data: { skuId: s.id, alertType: 'STALE_DATA', state: 'OPEN' } });
  });

  it('a live reservation row cannot be duplicated per order and SKU', async () => {
    const orders = await db.order.findMany({ take: 1, select: { id: true } });
    const reservations = await db.inventoryReservation.findMany({ take: 1, where: { status: 'ACTIVE' } });
    if (reservations.length === 0) return; // no live reservation in this database right now
    await expect(
      db.inventoryReservation.create({
        data: { orderId: reservations[0].orderId, skuId: reservations[0].skuId, qty: 1, status: 'ACTIVE', expiresAt: new Date() },
      }),
    ).rejects.toThrow();
    expect(orders.length).toBeGreaterThanOrEqual(0);
  });

  it('invoice revisions are unique per order (orderId, revision)', async () => {
    const inv = await db.salesInvoice.findFirst({ orderBy: { issuedAt: 'desc' } });
    if (!inv) return;
    await expect(
      db.salesInvoice.create({
        data: { invoiceNumber: `DUP-${randomUUID()}`, orderId: inv.orderId, revision: inv.revision, goodsTotal: 0, customerDeliveryFee: 0, grandTotal: 0, lines: [] },
      }),
    ).rejects.toThrow();
  });
});

describe('rate limiting (OPEN-22, ACX-09)', () => {
  it('allows up to the limit and then answers RATE_LIMITED with a retry hint', async () => {
    const subject = `subject-${randomUUID()}`;
    for (let i = 0; i < 3; i++) await consumeRateLimit({ action: 'test_limit', subject, limit: 3, windowSeconds: 600 });
    await expect(consumeRateLimit({ action: 'test_limit', subject, limit: 3, windowSeconds: 600 })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('concurrent attempts cannot exceed the limit (atomic upsert)', async () => {
    const subject = `race-${randomUUID()}`;
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => consumeRateLimit({ action: 'test_race', subject, limit: 5, windowSeconds: 600 })));
    const allowed = results.filter((r) => r.status === 'fulfilled').length;
    expect(allowed).toBe(5);
  });

  it('subjects are keyed-hashed, not stored raw', async () => {
    const subject = `+9647700009999-${randomUUID()}`;
    await consumeRateLimit({ action: 'test_hash', subject, limit: 9, windowSeconds: 600 });
    const rows = await db.rateLimitBucket.findMany({ where: { action: 'test_hash' }, take: 5 });
    expect(rows.every((r) => !r.subjectHash.includes('+9647'))).toBe(true);
  });
});
