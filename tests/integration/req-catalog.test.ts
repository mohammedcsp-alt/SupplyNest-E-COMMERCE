import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { viewerOf } from '@/lib/session';
import { createSku, setTierPrice } from '@/modules/catalog/admin';
import { getPublicSku, listCatalog, projectSkusForViewer, suggestCatalog } from '@/modules/catalog/public';
import { actorFor, createActiveCustomer, STAFF } from '../helpers/fixtures';
import { makeBrand, makeModel, makeQuality, makeSku, uniq } from './req-helpers';

/** Reads the optional price key of a projected item (absent for anonymous viewers). */
function priceOf(item: object): unknown {
  return (item as { price?: unknown }).price;
}

const STOCK_KEYS = ['"physicalOnHand"', '"reservedQty"', '"availableQty"'];

function expectNoStockKeys(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const k of STOCK_KEYS) expect(text).not.toContain(k);
}

describe('public projection: availability only, never numeric stock (STORE-004, PRODUCT-004, PRODUCT-005)', () => {
  it('anonymous list and detail expose AVAILABLE/UNAVAILABLE and no stock numbers or prices', async () => {
    const tag = uniq('STOCKTAG ');
    const inStock = await makeSku({ nameEn: `${tag} in stock`, physical: 3 });
    const outStock = await makeSku({ nameEn: `${tag} out of stock`, physical: 0 });

    const list = await listCatalog({ q: tag, sort: 'name' }, null);
    expect(list.items.map((i) => i.sku).sort()).toEqual([inStock.sku, outStock.sku].sort());
    const byCode = new Map(list.items.map((i) => [i.sku, i]));
    expect(byCode.get(inStock.sku)!.availability).toBe('AVAILABLE');
    expect(byCode.get(outStock.sku)!.availability).toBe('UNAVAILABLE');
    expectNoStockKeys(list);
    expect(JSON.stringify(list)).not.toContain('"price"');

    const detail = await getPublicSku(inStock.sku, null);
    expect(detail.item.availability).toBe('AVAILABLE');
    expectNoStockKeys(detail);
    expect(JSON.stringify(detail)).not.toContain('"price"');
  });

  it('a logged-in customer sees availability but still no numeric stock', async () => {
    const tag = uniq('CUSTSTOCK ');
    await makeSku({ nameEn: `${tag} item`, physical: 2 });
    const c = await createActiveCustomer('LEVEL_A');
    const list = await listCatalog({ q: tag }, viewerOf(c.actor));
    expect(list.items).toHaveLength(1);
    expect(list.items[0].availability).toBe('AVAILABLE');
    expectNoStockKeys(list);
  });
});

describe('admin-defined price levels are usable in the projection (STORE-007)', () => {
  it('a newly created price level with its own tier price is shown to a viewer on that level', async () => {
    const manager = await actorFor(STAFF.manager);
    const item = await makeSku({ nameEn: uniq('LVL TAG '), physical: 4 });
    const code = `REQ_LVL_${randomUUID().slice(0, 8).toUpperCase()}`;
    const level = await db.priceLevel.create({ data: { code, name: `Req level ${code}`, sortOrder: 900 } });
    await setTierPrice(manager.id, { skuId: item.skuId, priceLevelId: level.id, amount: '12345', reason: 'req price level test' });

    const viewer = { priceLevelId: level.id, canSeePrices: true };
    const detail = await getPublicSku(item.sku, viewer);
    expect(priceOf(detail.item)).toEqual({ amount: '12345', currency: 'IQD', levelCode: code });

    const projected = await projectSkusForViewer([item.sku], viewer);
    expect(priceOf(projected[0])).toEqual({ amount: '12345', currency: 'IQD', levelCode: code });
  });
});

describe('SKU codes and quality variants (PRODUCT-001, PRODUCT-010, UX-003)', () => {
  it('same model, different qualities coexist with separate codes; a duplicate code is refused with CONFLICT', async () => {
    const manager = await actorFor(STAFF.manager);
    const brand = await makeBrand();
    const model = await makeModel(brand.id);
    const qGood = await makeQuality();
    const qBest = await makeQuality();
    const a = await makeSku({ nameEn: uniq('MODEL A '), physical: 5, brandId: brand.id, modelId: model.id, qualityId: qGood.id });
    const b = await makeSku({ nameEn: uniq('MODEL B '), physical: 5, brandId: brand.id, modelId: model.id, qualityId: qBest.id });
    expect(a.sku).not.toBe(b.sku);
    const rows = await db.sku.findMany({ where: { sku: { in: [a.sku, b.sku] } }, include: { quality: true, model: true } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.modelId))).toEqual(new Set([model.id]));
    expect(new Set(rows.map((r) => r.quality?.code))).toEqual(new Set([qGood.code, qBest.code]));

    await expect(
      createSku(manager.id, {
        sku: a.sku,
        categoryId: (await db.category.findUniqueOrThrow({ where: { slug: 'dev-tshirts' } })).id,
        nameAr: 'dup',
        nameEn: 'dup',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('the public detail lists the sibling qualities of the same model under qualityVariants', async () => {
    const brand = await makeBrand();
    const model = await makeModel(brand.id);
    const q1 = await makeQuality();
    const q2 = await makeQuality();
    const a = await makeSku({ nameEn: uniq('VAR A '), physical: 1, brandId: brand.id, modelId: model.id, qualityId: q1.id });
    const b = await makeSku({ nameEn: uniq('VAR B '), physical: 1, brandId: brand.id, modelId: model.id, qualityId: q2.id });
    const detail = await getPublicSku(a.sku, null);
    const variantCodes = detail.qualityVariants.map((v) => v.sku);
    expect(variantCodes).toContain(a.sku);
    expect(variantCodes).toContain(b.sku);
    expect(new Set(detail.qualityVariants.map((v) => v.quality?.code))).toEqual(new Set([q1.code, q2.code]));
  });
});

describe('search, suggestions and filters (UX-001, UX-002, UX-005)', () => {
  it('suggestions return at most 8 items, match by name, SKU or model, and are price-free for anonymous viewers', async () => {
    const tag = uniq('SUGG ');
    for (let i = 0; i < 10; i += 1) await makeSku({ nameEn: `${tag} variant ${i}`, physical: 1 });
    const anon = await suggestCatalog(tag, null);
    expect(anon.length).toBe(8);
    for (const s of anon) {
      expect(s.nameEn).toContain(tag);
      expect(s).not.toHaveProperty('price');
    }

    const modelName = uniq('SUGGMODEL ');
    const model = await makeModel(null, modelName);
    const viaModel = await makeSku({ nameEn: uniq('no tag '), physical: 1, modelId: model.id });
    expect((await suggestCatalog(modelName, null)).map((s) => s.sku)).toContain(viaModel.sku);

    const viaSku = await makeSku({ nameEn: uniq('sku match '), physical: 1 });
    expect((await suggestCatalog(viaSku.sku, null)).map((s) => s.sku)).toContain(viaSku.sku);

    const c = await createActiveCustomer('LEVEL_A');
    const priced = await suggestCatalog(tag, viewerOf(c.actor));
    expect(priced[0]).toHaveProperty('price');
    expect(priced[0].price).toMatchObject({ amount: '15000', levelCode: 'LEVEL_A' });
  });

  it('brand, model and quality filters and available=true work together', async () => {
    const brand = await makeBrand();
    const model1 = await makeModel(brand.id);
    const model2 = await makeModel(brand.id);
    const q1 = await makeQuality();
    const q2 = await makeQuality();
    const inStock = await makeSku({ nameEn: uniq('F1 '), physical: 5, brandId: brand.id, modelId: model1.id, qualityId: q1.id });
    const noStock = await makeSku({ nameEn: uniq('F2 '), physical: 0, brandId: brand.id, modelId: model2.id, qualityId: q2.id });
    await makeSku({ nameEn: uniq('F3 '), physical: 5 }); // no brand

    const byBrand = await listCatalog({ brandId: brand.id }, null);
    expect(byBrand.meta.total).toBe(2);
    expect(byBrand.items.every((i) => i.brand?.id === brand.id)).toBe(true);

    const byModel = await listCatalog({ brandId: brand.id, modelId: model1.id }, null);
    expect(byModel.items.map((i) => i.sku)).toEqual([inStock.sku]);

    const byQuality = await listCatalog({ brandId: brand.id, qualityId: q2.id }, null);
    expect(byQuality.items.map((i) => i.sku)).toEqual([noStock.sku]);

    const available = await listCatalog({ brandId: brand.id, availableOnly: true }, null);
    expect(available.items.map((i) => i.sku)).toEqual([inStock.sku]);
    expect(available.meta.total).toBe(1);
  });

  it('relevance sort puts an exact SKU match first', async () => {
    const tag = uniq('REL ');
    const exact = await makeSku({ nameEn: `${tag} alpha`, physical: 1 });
    await makeSku({ nameEn: `${tag} beta`, physical: 1 });
    await makeSku({ nameEn: `${tag} gamma`, physical: 1 });
    const res = await listCatalog({ q: exact.sku, sort: 'relevance' }, null);
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items[0].sku).toBe(exact.sku);
  });
});

describe('favorites: add, list with own price only, remove (UX-008, CUS-04)', () => {
  it('a favorite shows the viewer own level price, and disappears after removal', async () => {
    const item = await makeSku({ nameEn: uniq('FAV '), physical: 2, prices: { LEVEL_A: 15000, LEVEL_B: 20000 } });
    const a = await createActiveCustomer('LEVEL_A');
    const b = await createActiveCustomer('LEVEL_B');
    const skuRow = await db.sku.findUniqueOrThrow({ where: { sku: item.sku } });
    await db.favorite.create({ data: { customerId: a.userId, skuId: skuRow.id } });

    const forA = await projectSkusForViewer([item.sku], viewerOf(a.actor));
    expect(forA).toHaveLength(1);
    expect(priceOf(forA[0])).toEqual({ amount: '15000', currency: 'IQD', levelCode: 'LEVEL_A' });

    // B never favourited it; the projection is for B's own level and never leaks A's level price
    const forB = await projectSkusForViewer([item.sku], viewerOf(b.actor));
    expect(priceOf(forB[0])).toEqual({ amount: '20000', currency: 'IQD', levelCode: 'LEVEL_B' });

    const anon = await projectSkusForViewer([item.sku], null);
    expect(anon[0]).not.toHaveProperty('price');

    await db.favorite.delete({ where: { customerId_skuId: { customerId: a.userId, skuId: skuRow.id } } });
    expect(await db.favorite.count({ where: { customerId: a.userId } })).toBe(0);
  });
});
