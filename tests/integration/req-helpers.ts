import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { createSku, setTierPrice } from '@/modules/catalog/admin';
import { adjustPhysical } from '@/modules/inventory/inventory';
import { actorFor, STAFF } from '../helpers/fixtures';

/** Shared builders for the req-* requirement tests. Every identifier is unique per run. */

export function uniq(prefix: string): string {
  return `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function makeBrand() {
  const name = uniq('REQ BRAND ');
  return db.brand.create({ data: { name, slug: name.toLowerCase().replace(/ /g, '-') } });
}

export async function makeModel(brandId: string | null, name = uniq('REQ MODEL ')) {
  return db.productModel.create({ data: { name, normalizedName: name.toLowerCase(), brandId } });
}

export async function makeQuality(code = uniq('REQQ_')) {
  return db.quality.create({ data: { code, nameAr: `جودة ${code}`, nameEn: `Quality ${code}` } });
}

/**
 * Creates a SKU through the real admin service, sets tier prices for LEVEL_A/LEVEL_B and sets exact stock.
 * `nameEn` is free text so tests can search for it.
 */
export async function makeSku(opts: {
  nameEn: string;
  physical: number;
  code?: string;
  published?: boolean;
  brandId?: string | null;
  modelId?: string | null;
  qualityId?: string | null;
  prices?: Partial<Record<'LEVEL_A' | 'LEVEL_B', number>>;
}) {
  const manager = await actorFor(STAFF.manager);
  const category = await db.category.findUniqueOrThrow({ where: { slug: 'dev-tshirts' } });
  const code = opts.code ?? uniq('REQ-');
  const sku = await createSku(manager.id, {
    sku: code,
    categoryId: category.id,
    nameAr: `صنف ${code}`,
    nameEn: opts.nameEn,
    published: opts.published ?? true,
    brandId: opts.brandId ?? null,
    modelId: opts.modelId ?? null,
    qualityId: opts.qualityId ?? null,
  });
  const prices = { LEVEL_A: 15000, LEVEL_B: 20000, ...(opts.prices ?? {}) };
  for (const [lvl, amount] of Object.entries(prices)) {
    const level = await db.priceLevel.findUniqueOrThrow({ where: { code: lvl } });
    await setTierPrice(manager.id, { skuId: sku.id, priceLevelId: level.id, amount: String(amount), reason: 'req fixture' });
  }
  await db.$transaction((tx) => adjustPhysical(tx, { skuId: sku.id, mode: 'SET', value: opts.physical, reason: 'req fixture stock', actorId: manager.id }));
  return { skuId: sku.id, sku: code };
}
