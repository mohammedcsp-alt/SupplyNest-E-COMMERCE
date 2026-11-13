import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { reasonOnlySchema } from '@/modules/identity/schemas';
import { rejectCustomer } from '@/modules/identity/customer-service';

export const dynamic = 'force-dynamic';

export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.CUSTOMER_APPROVE);
  const { id } = await ctx.params;
  const body = await readJson(req, reasonOnlySchema);
  return ok(requestId, await rejectCustomer(actor, { customerId: id, reason: body.reason, ip: clientIp(req) }));
});
