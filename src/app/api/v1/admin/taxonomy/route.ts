import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { upsertBrand, upsertQuality } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

/** Dropdown source for admin forms: categories (with attributes), brands, models, qualities, price levels. */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_VIEW);
  const [categories, brands, models, qualities, levels] = await Promise.all([
    db.category.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], include: { attributes: { orderBy: { sortOrder: 'asc' } } } }),
    db.brand.findMany({ orderBy: { name: 'asc' } }),
    db.productModel.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, brandId: true } }),
    db.quality.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.priceLevel.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  return ok(requestId, {
    categories: categories.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      slug: c.slug,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      active: c.active,
      attributes: c.attributes.map((a) => ({ id: a.id, key: a.key, labelAr: a.labelAr, labelEn: a.labelEn, dataType: a.dataType, unit: a.unit, options: a.options, filterable: a.filterable })),
    })),
    brands: brands.map((b) => ({ id: b.id, name: b.name, active: b.active })),
    models,
    qualities: qualities.map((q) => ({ id: q.id, code: q.code, nameAr: q.nameAr, nameEn: q.nameEn, active: q.active })),
    priceLevels: levels.map((l) => ({ id: l.id, code: l.code, name: l.name, active: l.active })),
  });
});

const brandSchema = z.object({ name: z.string().trim().min(1).max(160), active: z.boolean().optional() });
const qualitySchema = z.object({
  code: z.string().trim().min(2).max(40),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

/** Brand (manufacturer) and quality master data. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_MANAGE);
  const url = new URL(req.url);
  if (url.searchParams.get('kind') === 'quality') {
    const body = await readJson(req, qualitySchema);
    const q = await upsertQuality(actor.id, body);
    return ok(requestId, { id: q.id, code: q.code }, { status: 201 });
  }
  const body = await readJson(req, brandSchema);
  const b = await upsertBrand(actor.id, body);
  return ok(requestId, { id: b.id, name: b.name }, { status: 201 });
});
