import { apiRoute, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const STATUSES = ['ACTIVE', 'REVIEW_REQUIRED', 'EXTENDED', 'RELEASED', 'CONSUMED'] as const;

/** ADM-03: reservations, default view = those needing attention (REVIEW_REQUIRED first). */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.RESERVATION_VIEW);
  const status = req.nextUrl.searchParams.get('status');
  const where = status && (STATUSES as readonly string[]).includes(status) ? { status: status as (typeof STATUSES)[number] } : {};
  const rows = await db.inventoryReservation.findMany({
    where,
    orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
    take: 200,
    include: { sku: { select: { sku: true, nameEn: true } }, order: { select: { orderNumber: true, customerId: true } } },
  });
  return ok(requestId, rows.map((r) => ({
    id: r.id,
    orderNumber: r.order.orderNumber,
    sku: r.sku.sku,
    skuName: r.sku.nameEn,
    qty: r.qty,
    status: r.status,
    expiresAt: r.expiresAt,
    reviewReason: r.reviewReason,
    createdAt: r.createdAt,
  })));
});
