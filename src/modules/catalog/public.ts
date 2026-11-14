import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { toApiAmount } from '@/lib/money';
import { availableOf } from '@/modules/inventory/inventory';

/**
 * Public and entitled catalog read models (spec ACX-01, T001, T006).
 *
 * Projection rule: responses are built from explicit fields. Price data is attached ONLY when the viewer is an
 * ACTIVE customer, and ONLY for the viewer's own price level. Public responses never contain any price key.
 * Customer availability is binary (PRODUCT-004 / STORE-004): no numeric stock is exposed outside admin.
 */

export type Viewer = { priceLevelId: string | null; canSeePrices: boolean } | null;

export const PUBLIC_ANON: Viewer = null;

export type SkuListParams = {
  q?: string;
  categoryId?: string;
  brandId?: string;
  modelId?: string;
  qualityId?: string;
  /** Multi-select (V3.3). Each list is OR-ed inside, and the lists are AND-ed together. */
  brandIds?: string[];
  qualityIds?: string[];
  /** Category-specific attribute filters: every entry must match one of its values. */
  attributes?: Array<{ key: string; values: string[] }>;
  availableOnly?: boolean;
  priceMin?: string;
  priceMax?: string;
  sort?: 'relevance' | 'newest' | 'name' | 'price_asc' | 'price_desc';
  page?: number;
  pageSize?: number;
};

const MAX_PAGE_SIZE = 50;
const MAX_SCORED_MATCHES = 2000;

const publicInclude = {
  category: { select: { id: true, nameAr: true, nameEn: true, slug: true } },
  brand: { select: { id: true, name: true } },
  model: { select: { id: true, name: true } },
  quality: { select: { code: true, nameAr: true, nameEn: true } },
  images: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, altText: true, sortOrder: true } },
  inventory: { select: { physicalOnHand: true, reservedQty: true } },
  attributeValues: {
    select: { value: true, definition: { select: { key: true, labelAr: true, labelEn: true, unit: true, dataType: true, sortOrder: true } } },
    orderBy: { definition: { sortOrder: 'asc' as const } },
  },
} satisfies Prisma.SkuInclude;

type SkuRow = Prisma.SkuGetPayload<{ include: typeof publicInclude }>;

/** Builds the public projection. `price` is only supplied for entitled viewers. */
export function projectSku(row: SkuRow, price?: { amount: string; currency: string; levelCode: string } | null) {
  const availableUnits = row.inventory ? availableOf(row.inventory.physicalOnHand, row.inventory.reservedQty) : 0;
  const base = {
    id: row.id,
    sku: row.sku,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    unit: row.unit,
    category: { id: row.category.id, nameAr: row.category.nameAr, nameEn: row.category.nameEn, slug: row.category.slug },
    brand: row.brand ? { id: row.brand.id, name: row.brand.name } : null,
    model: row.model ? { id: row.model.id, name: row.model.name } : null,
    quality: row.quality ? { code: row.quality.code, nameAr: row.quality.nameAr, nameEn: row.quality.nameEn } : null,
    images: row.images.map((i) => ({ id: i.id, url: `/api/v1/media/${i.id}`, altText: i.altText })),
    attributes: row.attributeValues.map((a) => ({
      key: a.definition.key,
      labelAr: a.definition.labelAr,
      labelEn: a.definition.labelEn,
      value: a.value,
      unit: a.definition.unit,
    })),
    availability: availableUnits > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
  };
  return price ? { ...base, price } : base;
}

const publicWhere = (): Prisma.SkuWhereInput => ({ published: true, active: true, deletedAt: null });

/** Lists catalog items. Prices appear only when the viewer is entitled. */
export async function listCatalog(params: SkuListParams, viewer: Viewer) {
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? 20));
  const page = Math.max(1, params.page ?? 1);
  const q = (params.q ?? '').trim().slice(0, 100);

  const where: Prisma.SkuWhereInput = { ...publicWhere() };
  if (params.categoryId) {
    const ids = await descendantCategoryIds(params.categoryId);
    where.categoryId = { in: ids };
  }
  if (params.brandId) where.brandId = params.brandId;
  if (params.modelId) where.modelId = params.modelId;
  if (params.qualityId) where.qualityId = params.qualityId;
  if (params.brandIds?.length) where.brandId = { in: params.brandIds.slice(0, 50) };
  if (params.qualityIds?.length) where.qualityId = { in: params.qualityIds.slice(0, 50) };
  for (const attr of (params.attributes ?? []).slice(0, 10)) {
    if (!attr.values.length) continue;
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { attributeValues: { some: { definition: { key: attr.key }, value: { in: attr.values.slice(0, 50) } } } },
    ];
  }
  if (q) {
    where.OR = [
      { sku: { contains: q, mode: 'insensitive' } },
      { nameAr: { contains: q, mode: 'insensitive' } },
      { nameEn: { contains: q, mode: 'insensitive' } },
      { model: { name: { contains: q, mode: 'insensitive' } } },
      { brand: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  // Price-based filters/sorts need the viewer's price; anonymous viewers have them ignored (and reported).
  const ignored: string[] = [];
  const priceSort = params.sort === 'price_asc' || params.sort === 'price_desc';
  const priceFilter = params.priceMin !== undefined || params.priceMax !== undefined;
  if ((priceSort || priceFilter) && !viewer?.canSeePrices) {
    if (priceSort) ignored.push('sort');
    if (priceFilter) ignored.push('price');
  }

  const rows = await db.sku.findMany({
    where,
    include: publicInclude,
    orderBy: params.sort === 'newest' ? { createdAt: 'desc' } : params.sort === 'name' ? { nameEn: 'asc' } : { sku: 'asc' },
    take: MAX_SCORED_MATCHES,
  });

  let filtered = rows;
  if (params.availableOnly) {
    filtered = filtered.filter((r) => r.inventory && availableOf(r.inventory.physicalOnHand, r.inventory.reservedQty) > 0);
  }

  const priceMap = viewer?.canSeePrices && viewer.priceLevelId ? await priceMapFor(filtered.map((r) => r.id), viewer.priceLevelId) : null;
  const levelCode = priceMap?.levelCode ?? null;
  if (priceMap && (priceFilter || priceSort)) {
    const min = params.priceMin !== undefined ? Number(params.priceMin) : null;
    const max = params.priceMax !== undefined ? Number(params.priceMax) : null;
    filtered = filtered.filter((r) => {
      const p = priceMap.amounts.get(r.id);
      if (p === undefined) return false;
      const n = Number(p);
      return (min === null || n >= min) && (max === null || n <= max);
    });
    if (priceSort) {
      const dir = params.sort === 'price_asc' ? 1 : -1;
      filtered.sort((a, b) => dir * (Number(priceMap.amounts.get(a.id) ?? 0) - Number(priceMap.amounts.get(b.id) ?? 0)));
    }
  }

  if (q && (!params.sort || params.sort === 'relevance')) {
    filtered = sortByRelevance(filtered, q);
  }

  const total = filtered.length;
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
  return {
    items: slice.map((r) =>
      projectSku(
        r,
        priceMap && levelCode
          ? priceMap.amounts.has(r.id)
            ? { amount: toApiAmount(priceMap.amounts.get(r.id))!, currency: 'IQD', levelCode }
            : null
          : undefined,
      ),
    ),
    meta: { page, pageSize, total, ignored, truncated: rows.length >= MAX_SCORED_MATCHES },
  };
}

function sortByRelevance(rows: SkuRow[], q: string): SkuRow[] {
  const needle = q.toLowerCase();
  const score = (r: SkuRow) => {
    const sku = r.sku.toLowerCase();
    if (sku === needle) return 0;
    if (sku.startsWith(needle)) return 1;
    if (r.nameEn.toLowerCase().startsWith(needle) || r.nameAr.startsWith(q)) return 2;
    if (r.model?.name.toLowerCase().includes(needle)) return 3;
    return 4;
  };
  return [...rows].sort((a, b) => score(a) - score(b) || a.sku.localeCompare(b.sku));
}

/** Search suggestions: at most 8 items, never priced for anonymous viewers. */
export async function suggestCatalog(q: string, viewer: Viewer) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const rows = await db.sku.findMany({
    where: {
      ...publicWhere(),
      OR: [
        { sku: { startsWith: term, mode: 'insensitive' } },
        { nameEn: { contains: term, mode: 'insensitive' } },
        { nameAr: { contains: term, mode: 'insensitive' } },
        { model: { name: { contains: term, mode: 'insensitive' } } },
      ],
    },
    include: publicInclude,
    take: 8,
    orderBy: { sku: 'asc' },
  });
  const priceMap = viewer?.canSeePrices && viewer.priceLevelId ? await priceMapFor(rows.map((r) => r.id), viewer.priceLevelId) : null;
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    nameAr: r.nameAr,
    nameEn: r.nameEn,
    model: r.model?.name ?? null,
    availability: r.inventory && availableOf(r.inventory.physicalOnHand, r.inventory.reservedQty) > 0 ? 'AVAILABLE' : 'UNAVAILABLE',
    ...(priceMap && priceMap.amounts.has(r.id) ? { price: { amount: toApiAmount(priceMap.amounts.get(r.id))!, currency: 'IQD', levelCode: priceMap.levelCode } } : {}),
  }));
}

/** Product/SKU detail. Unpublished or inactive SKUs are invisible to the public (404, not 403: no existence leak). */
export async function getPublicSku(sku: string, viewer: Viewer) {
  const row = await db.sku.findFirst({ where: { sku: sku.toUpperCase(), ...publicWhere() }, include: publicInclude });
  if (!row) throw errors.notFound('Product not found');
  let price: { amount: string; currency: string; levelCode: string } | null | undefined = undefined;
  if (viewer?.canSeePrices && viewer.priceLevelId) {
    const map = await priceMapFor([row.id], viewer.priceLevelId);
    const amt = map.amounts.get(row.id);
    price = amt !== undefined ? { amount: toApiAmount(amt)!, currency: 'IQD', levelCode: map.levelCode } : null;
  }
  const related = await db.sku.findMany({
    where: { ...publicWhere(), id: { not: row.id }, OR: [{ categoryId: row.categoryId }, ...(row.modelId ? [{ modelId: row.modelId }] : [])] },
    include: publicInclude,
    take: 8,
    orderBy: { sku: 'asc' },
  });
  return {
    item: projectSku(row, price),
    qualityVariants: row.modelId
      ? (await db.sku.findMany({ where: { ...publicWhere(), modelId: row.modelId }, include: publicInclude, orderBy: { sku: 'asc' } })).map((r) =>
          projectSku(r, undefined),
        )
      : [],
    related: related.map((r) => projectSku(r, undefined)),
  };
}

/** Category tree (public). */
export async function categoryTree() {
  const rows = await db.category.findMany({ where: { active: true, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }] });
  type Node = { id: string; slug: string; nameAr: string; nameEn: string; children: Node[] };
  const byId = new Map<string, Node>();
  for (const r of rows) byId.set(r.id, { id: r.id, slug: r.slug, nameAr: r.nameAr, nameEn: r.nameEn, children: [] });
  const roots: Node[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parentId && byId.has(r.parentId)) byId.get(r.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Recursive descendant set for category filtering (unlimited depth, ADMIN-catalog requirement). */
export async function descendantCategoryIds(rootId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT "id" FROM "categories" WHERE "id" = ${rootId}::uuid
      UNION ALL
      SELECT c."id" FROM "categories" c JOIN tree t ON c."parentId" = t."id"
    )
    SELECT "id" FROM tree
  `;
  return rows.map((r) => r.id);
}

/** Entitled price lookup: the viewer's own level only. */
export async function priceMapFor(skuIds: string[], priceLevelId: string) {
  const [level, rows] = await Promise.all([
    db.priceLevel.findUnique({ where: { id: priceLevelId }, select: { code: true } }),
    db.tierPrice.findMany({ where: { skuId: { in: skuIds }, priceLevelId }, select: { skuId: true, amount: true } }),
  ]);
  return {
    levelCode: level?.code ?? '',
    amounts: new Map(rows.map((r) => [r.skuId, r.amount] as const)),
  };
}

/** Projects a specific set of SKU codes for a viewer (favorites, recently viewed). Only offered items are returned. */
export async function projectSkusForViewer(skuCodes: string[], viewer: Viewer) {
  if (skuCodes.length === 0) return [];
  const rows = await db.sku.findMany({ where: { sku: { in: skuCodes }, ...publicWhere() }, include: publicInclude, orderBy: { sku: 'asc' } });
  const priceMap = viewer?.canSeePrices && viewer.priceLevelId ? await priceMapFor(rows.map((r) => r.id), viewer.priceLevelId) : null;
  return rows.map((r) =>
    projectSku(
      r,
      priceMap
        ? priceMap.amounts.has(r.id)
          ? { amount: toApiAmount(priceMap.amounts.get(r.id))!, currency: 'IQD', levelCode: priceMap.levelCode }
          : null
        : undefined,
    ),
  );
}
