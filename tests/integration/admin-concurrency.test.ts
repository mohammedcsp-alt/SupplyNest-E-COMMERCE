import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createSku, setTierPrice } from '@/modules/catalog/admin';
import { adjustPhysical } from '@/modules/inventory/inventory';
import { actorFor, STAFF } from '../helpers/fixtures';

/**
 * Concurrent administration scenarios (Phase 2 of the UAT plan), exercised at the service layer on the TEST database.
 * Synthetic records only, uniquely named per run.
 */
async function category() {
  return db.category.findUniqueOrThrow({ where: { slug: 'dev-tshirts' } });
}

function skuInput(code: string, categoryId: string) {
  return {
    sku: code,
    categoryId,
    nameAr: `صنف ${code}`,
    nameEn: `Concurrent ${code}`,
    published: false,
    brandId: null,
    modelId: null,
    qualityId: null,
  };
}

describe('concurrent product creation and duplicate SKU prevention', () => {
  it('two administrators creating the same SKU at once: exactly one succeeds, the other gets a clean CONFLICT', async () => {
    const cat = await category();
    const a = await actorFor(STAFF.manager);
    const b = await actorFor(STAFF.catalog);
    const code = `CONC-${randomUUID().slice(0, 8).toUpperCase()}`;
    const results = await Promise.allSettled([
      createSku(a.id, skuInput(code, cat.id), '10.7.7.1'),
      createSku(b.id, skuInput(code, cat.id), '10.7.7.2'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as { code?: string }).code).toBe('CONFLICT');
    expect(await db.sku.count({ where: { sku: code } })).toBe(1);
  });

  it('the creating administrator is recorded as the audit actor', async () => {
    const cat = await category();
    const a = await actorFor(STAFF.catalog);
    const code = `AUD-${randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await createSku(a.id, skuInput(code, cat.id), '10.7.7.3');
    const audit = await db.auditLog.findFirst({ where: { entityType: 'sku', entityId: created.id, action: { contains: 'create' } } });
    expect(audit?.actorId).toBe(a.id);
    expect(audit?.ip).toBe('10.7.7.3');
  });
});

describe('concurrent price updates (no lost update)', () => {
  it('two administrators change the same tier price at once: both are recorded and the final price is one of them', async () => {
    const cat = await category();
    const a = await actorFor(STAFF.manager);
    const b = await actorFor(STAFF.catalog);
    const code = `PRC-${randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await createSku(a.id, skuInput(code, cat.id), '10.7.7.4');
    const level = await db.priceLevel.findUniqueOrThrow({ where: { code: 'LEVEL_A' } });
    await setTierPrice(a.id, { skuId: created.id, priceLevelId: level.id, amount: '10000', reason: 'seed price' });

    const results = await Promise.allSettled([
      setTierPrice(a.id, { skuId: created.id, priceLevelId: level.id, amount: '11000', reason: 'admin A change' }),
      setTierPrice(b.id, { skuId: created.id, priceLevelId: level.id, amount: '12000', reason: 'admin B change' }),
    ]);
    const failed = results.filter((r) => r.status === 'rejected');
    // Either both succeed in sequence (preferred) or one is refused cleanly. Never a silent overwrite without history.
    for (const f of failed) expect((f as PromiseRejectedResult).reason).toMatchObject({ code: expect.any(String) });

    const row = await db.tierPrice.findUniqueOrThrow({ where: { skuId_priceLevelId: { skuId: created.id, priceLevelId: level.id } } });
    expect(['11000', '12000']).toContain(row.amount.toString());
    const history = await db.priceChangeHistory.count({ where: { skuId: created.id } });
    expect(history).toBe(1 + results.filter((r) => r.status === 'fulfilled').length);
  });
});

describe('concurrent stock adjustments (no lost update)', () => {
  it('twenty concurrent +1 adjustments all apply exactly once', async () => {
    const cat = await category();
    const a = await actorFor(STAFF.inventory);
    const code = `STK-${randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await createSku(a.id, skuInput(code, cat.id), '10.7.7.5');
    await db.$transaction((tx) => adjustPhysical(tx, { skuId: created.id, mode: 'SET', value: 5, reason: 'concurrency baseline', actorId: a.id }));

    const jobs = Array.from({ length: 20 }, () =>
      db.$transaction((tx) => adjustPhysical(tx, { skuId: created.id, mode: 'DELTA', value: 1, reason: 'concurrency +1', actorId: a.id })),
    );
    const settled = await Promise.allSettled(jobs);
    const ok = settled.filter((r) => r.status === 'fulfilled').length;
    const bal = await db.inventoryBalance.findUniqueOrThrow({ where: { skuId: created.id } });
    expect(bal.physicalOnHand).toBe(5 + ok);
    expect(ok).toBe(20);
  });
});
