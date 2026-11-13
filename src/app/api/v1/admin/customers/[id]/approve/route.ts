import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { approveSchema } from '@/modules/identity/schemas';
import { approveCustomer } from '@/modules/identity/customer-service';

export const dynamic = 'force-dynamic';

/** CUSTOMER-003/004: approval requires a price level; no activation without one (T004). */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CUSTOMER_APPROVE);
  const { id } = await ctx.params;
  const body = await readJson(req, approveSchema);
  const result = await approveCustomer(actor, { customerId: id, priceLevelId: body.priceLevelId, reason: body.reason, ip: clientIp(req) });
  return ok(requestId, result);
});
