import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireActiveCustomer } from '@/lib/session';
import { reorderIntoCart } from '@/modules/commerce/orders';

export const dynamic = 'force-dynamic';

/** CUS-15 / P07: copies lines into the cart at CURRENT prices and availability. The old order is not changed. */
export const POST = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>, requestId) => {
  const user = requireActiveCustomer(await getCurrentUser());
  const { id } = await ctx.params;
  const report = await reorderIntoCart({ customerId: user.id, priceLevelId: user.priceLevelId, orderId: id });
  return ok(requestId, { report, added: report.filter((r) => r.status === 'ADDED').length });
});
