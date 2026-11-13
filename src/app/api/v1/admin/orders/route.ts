import { apiRoute, ok } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { canSeePrices } from '@/modules/admin/access';
import { listAdminOrders } from '@/modules/admin/orders';

export const dynamic = 'force-dynamic';

/** Admin order list. Filters: status, q (order number or customer phone), page. Money only with price.view. */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.ORDER_VIEW);
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? 25) || 25));
  const result = await listAdminOrders({ status: sp.get('status') ?? undefined, q: sp.get('q') ?? undefined, page, pageSize }, canSeePrices(actor));
  return ok(requestId, result.items, { meta: { page, pageSize, total: result.total } });
});
