import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { canSeePrices } from '@/modules/admin/access';
import { getAdminOrder } from '@/modules/admin/orders';
import { requireUuid } from '@/modules/admin/ids';

export const dynamic = 'force-dynamic';

/** Admin order detail: items, events, cancellation, fulfillment job status, invoices. Money only with price.view. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.ORDER_VIEW);
  const id = requireUuid((await ctx.params).id);
  return ok(requestId, await getAdminOrder(id, canSeePrices(actor)));
});
