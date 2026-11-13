import { z } from 'zod';
import { apiRoute, clientIp, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { resolveCancellation } from '@/modules/commerce/orders';
import { requireUuid } from '@/modules/admin/ids';

export const dynamic = 'force-dynamic';

const schema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().min(3, 'Reason is required').max(500),
});

/** Approve or reject a pending customer cancellation request (releases reservations once on approval). */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.ORDER_CANCEL_APPROVE);
  const id = requireUuid((await ctx.params).id);
  const body = await readJson(req, schema);
  return ok(requestId, await resolveCancellation({ actorId: actor.id, orderId: id, approve: body.approve, reason: body.reason, ip: clientIp(req) }));
});
