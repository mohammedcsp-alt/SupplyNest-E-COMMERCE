import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { priceLevelChangeSchema } from '@/modules/identity/schemas';
import { changePriceLevel } from '@/modules/identity/customer-service';

export const dynamic = 'force-dynamic';

export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CUSTOMER_APPROVE);
  const { id } = await ctx.params;
  const body = await readJson(req, priceLevelChangeSchema);
  return ok(requestId, await changePriceLevel(actor, { customerId: id, priceLevelId: body.priceLevelId, reason: body.reason, ip: clientIp(req) }));
});
