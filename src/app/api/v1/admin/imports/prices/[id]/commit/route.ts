import { apiRoute, clientIp, ok, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { commitPriceImport } from '@/modules/imports/prices-import';

export const dynamic = 'force-dynamic';

export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.PRICE_EDIT);
  const { id } = await ctx.params;
  return ok(requestId, await commitPriceImport({ importId: id, actorId: actor.id, ip: clientIp(req) }));
});
