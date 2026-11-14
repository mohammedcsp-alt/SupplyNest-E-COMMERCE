import 'server-only';
import { db } from '@/lib/db';
import { errors } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { projectSkusForViewer, type Viewer } from './public';

/**
 * Featured products (V3.3). Merchandising flags only: they never change price, stock, eligibility or ordering rules.
 * Changes are audited. Featured listings use the same public projection as the catalogue (no protected data for anonymous viewers).
 */
export async function setSkuMerchandising(actorId: string, skuId: string, input: { featured?: boolean; featuredOrder?: number }, ip: string | null) {
  return db.$transaction(async (tx) => {
    const before = await tx.sku.findUnique({ where: { id: skuId }, select: { id: true, sku: true, featured: true, featuredOrder: true, deletedAt: true } });
    if (!before || before.deletedAt) throw errors.notFound('SKU not found');
    const after = await tx.sku.update({
      where: { id: skuId },
      data: {
        ...(input.featured !== undefined ? { featured: input.featured } : {}),
        ...(input.featuredOrder !== undefined ? { featuredOrder: input.featuredOrder } : {}),
      },
      select: { id: true, sku: true, featured: true, featuredOrder: true },
    });
    await writeAudit(tx, {
      actorId,
      action: 'sku.merchandising.update',
      entityType: 'sku',
      entityId: skuId,
      before: { featured: before.featured, featuredOrder: before.featuredOrder },
      after: { featured: after.featured, featuredOrder: after.featuredOrder },
      ip,
    });
    return after;
  });
}

/** Published, active featured SKUs in configured display order. */
export async function listFeaturedSkus(viewer: Viewer, limit = 8) {
  const rows = await db.sku.findMany({
    where: { published: true, active: true, deletedAt: null, featured: true },
    orderBy: [{ featuredOrder: 'asc' }, { sku: 'asc' }],
    take: Math.min(limit, 24),
    select: { sku: true },
  });
  const codes = rows.map((r) => r.sku);
  const projected = await projectSkusForViewer(codes, viewer);
  const order = new Map(codes.map((c, i) => [c, i]));
  return projected.sort((a, b) => (order.get(a.sku) ?? 0) - (order.get(b.sku) ?? 0));
}

/** Admin listing of SKUs with merchandising state (searchable, paginated). */
export async function listMerchandising(params: { q?: string; featuredOnly?: boolean; page: number; pageSize: number }) {
  const q = (params.q ?? '').trim().slice(0, 80);
  const where = {
    deletedAt: null,
    ...(params.featuredOnly ? { featured: true } : {}),
    ...(q ? { OR: [{ sku: { contains: q, mode: 'insensitive' as const } }, { nameEn: { contains: q, mode: 'insensitive' as const } }, { nameAr: { contains: q, mode: 'insensitive' as const } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.sku.count({ where }),
    db.sku.findMany({
      where,
      orderBy: [{ featured: 'desc' }, { featuredOrder: 'asc' }, { sku: 'asc' }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: { id: true, sku: true, nameEn: true, nameAr: true, published: true, active: true, featured: true, featuredOrder: true },
    }),
  ]);
  return { total, rows };
}
