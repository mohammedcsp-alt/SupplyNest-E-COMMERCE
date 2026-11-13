import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { getAdminSku, updateSku } from '@/modules/catalog/admin';

export const dynamic = 'force-dynamic';

const skuPatchSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    brandId: z.string().uuid().nullable().optional(),
    modelId: z.string().uuid().nullable().optional(),
    qualityId: z.string().uuid().nullable().optional(),
    nameAr: z.string().trim().min(1).max(255).optional(),
    nameEn: z.string().trim().min(1).max(255).optional(),
    descriptionAr: z.string().max(5000).nullable().optional(),
    descriptionEn: z.string().max(5000).nullable().optional(),
    unit: z.string().trim().max(20).optional(),
    published: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const GET = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_VIEW);
  const { id } = await ctx.params;
  const detail = await getAdminSku(id);
  const canSeePrices = (await getCurrentUser())?.permissions.has(PERMISSIONS.PRICE_VIEW_ADMIN) ?? false;
  return ok(requestId, {
    id: detail.sku.id,
    sku: detail.sku.sku,
    categoryId: detail.sku.categoryId,
    brandId: detail.sku.brandId,
    modelId: detail.sku.modelId,
    qualityId: detail.sku.qualityId,
    nameAr: detail.sku.nameAr,
    nameEn: detail.sku.nameEn,
    descriptionAr: detail.sku.descriptionAr,
    descriptionEn: detail.sku.descriptionEn,
    unit: detail.sku.unit,
    published: detail.sku.published,
    active: detail.sku.active,
    images: detail.sku.images.map((i) => ({ id: i.id, url: `/api/v1/media/${i.id}`, altText: i.altText, sortOrder: i.sortOrder })),
    attributes: detail.sku.attributeValues.map((a) => ({ key: a.definition.key, value: a.value, labelEn: a.definition.labelEn, labelAr: a.definition.labelAr })),
    stock: detail.stock,
    prices: canSeePrices ? detail.prices : undefined,
    priceHistory: canSeePrices ? detail.priceHistory : undefined,
    openAlerts: detail.sku.alerts.map((a) => ({ id: a.id, type: a.alertType, detectedAt: a.detectedAt })),
    movements: detail.movements.map((m) => ({ qtyDelta: m.qtyDelta, balanceAfter: m.balanceAfter, type: m.movementType, note: m.note, occurredAt: m.occurredAt })),
  });
});

export const PATCH = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CATALOG_MANAGE);
  const { id } = await ctx.params;
  const body = await readJson(req, skuPatchSchema);
  const updated = await updateSku(actor.id, id, body, clientIp(req));
  return ok(requestId, { id: updated.id, sku: updated.sku, published: updated.published, active: updated.active });
});
