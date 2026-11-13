import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { createSku } from '@/modules/catalog/admin';
import { availableOf } from '@/modules/inventory/inventory';

export const dynamic = 'force-dynamic';

const skuCreateSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().nullable().optional(),
  modelId: z.string().uuid().nullable().optional(),
  qualityId: z.string().uuid().nullable().optional(),
  nameAr: z.string().trim().min(1).max(255),
  nameEn: z.string().trim().min(1).max(255),
  descriptionAr: z.string().max(5000).nullable().optional(),
  descriptionEn: z.string().max(5000).nullable().optional(),
  unit: z.string().trim().max(20).optional(),
  published: z.boolean().optional(),
  active: z.boolean().optional(),
});

/** ADM-05 / ADM-07: SKU list for administrators (includes unpublished items and stock numbers). */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_VIEW);
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim().slice(0, 100);
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? 25) || 25));
  const where = {
    deletedAt: null,
    ...(sp.get('categoryId') ? { categoryId: sp.get('categoryId')! } : {}),
    ...(sp.get('published') ? { published: sp.get('published') === 'true' } : {}),
    ...(q ? { OR: [{ sku: { contains: q.toUpperCase() } }, { nameEn: { contains: q, mode: 'insensitive' as const } }, { nameAr: { contains: q } }] } : {}),
  };
  const showPrices = actor.permissions.has(PERMISSIONS.PRICE_VIEW_ADMIN);
  const [rows, total] = await Promise.all([
    db.sku.findMany({ where, orderBy: { sku: 'asc' }, skip: (page - 1) * pageSize, take: pageSize, include: { inventory: true, category: true, images: { select: { id: true } }, tierPrices: { include: { priceLevel: true } } } }),
    db.sku.count({ where }),
  ]);
  return ok(
    requestId,
    rows.map((s) => ({
      id: s.id,
      sku: s.sku,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      category: s.category.nameEn,
      published: s.published,
      active: s.active,
      physicalOnHand: s.inventory?.physicalOnHand ?? 0,
      reservedQty: s.inventory?.reservedQty ?? 0,
      availableQty: s.inventory ? availableOf(s.inventory.physicalOnHand, s.inventory.reservedQty) : 0,
      imageCount: s.images.length,
      // Monetary values only for users holding price.view (never leaked through catalog.view alone).
      prices: showPrices ? s.tierPrices.map((t) => ({ levelCode: t.priceLevel.code, amount: t.amount.toFixed(0) })) : undefined,
    })),
    { meta: { page, pageSize, total } },
  );
});

export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_MANAGE);
  const body = await readJson(req, skuCreateSchema);
  const created = await createSku(actor.id, body, clientIp(req));
  return ok(requestId, { id: created.id, sku: created.sku }, { status: 201 });
});
