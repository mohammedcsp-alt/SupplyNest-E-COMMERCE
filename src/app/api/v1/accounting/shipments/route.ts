import { apiRoute, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/** Shipment list for accounting screens (handover records and collection state). */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_VIEW);
  const courierId = req.nextUrl.searchParams.get('courierId') ?? undefined;
  const rows = await db.courierShipment.findMany({
    where: courierId ? { courierId } : {},
    orderBy: { handedOverAt: 'desc' },
    take: 300,
    include: { order: { select: { orderNumber: true } }, courier: { select: { name: true } } },
  });
  return ok(requestId, rows.map((s) => ({
    id: s.id,
    orderNumber: s.order.orderNumber,
    courier: s.courier.name,
    courierId: s.courierId,
    settlementMode: s.settlementModeSnapshot,
    handedOverAt: s.handedOverAt,
    deliveryStatus: s.deliveryStatus,
    codCollected: s.codCollected?.toFixed(0) ?? null,
    collected: s.codCollected !== null,
  })));
});
