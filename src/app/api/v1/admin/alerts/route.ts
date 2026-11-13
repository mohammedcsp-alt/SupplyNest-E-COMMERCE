import { apiRoute, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/** ADM-11: open inventory alerts (low stock, stale data, reservations to review, stock conflicts). */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.INVENTORY_VIEW);
  const rows = await db.inventoryAlert.findMany({
    where: { state: 'OPEN' },
    orderBy: [{ alertType: 'asc' }, { detectedAt: 'desc' }],
    take: 500,
    include: { sku: { select: { sku: true, nameEn: true } } },
  });
  return ok(requestId, rows.map((a) => ({ id: a.id, type: a.alertType, sku: a.sku.sku, skuName: a.sku.nameEn, detail: a.detail, detectedAt: a.detectedAt })));
});
