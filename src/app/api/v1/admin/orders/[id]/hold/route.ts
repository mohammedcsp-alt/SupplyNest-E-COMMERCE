import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { setLocalHold } from '@/modules/commerce/orders';
import { requireUuid } from '@/modules/admin/ids';

export const dynamic = 'force-dynamic';

const schema = z.object({
  on: z.boolean(),
  reason: z.string().trim().min(3, 'Reason is required').max(500),
});

/** Local hold toggle (ADM-02). Only SUBMITTED orders can be put on hold and only ON_HOLD_LOCAL ones released. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.ORDER_EDIT_ADMIN);
  const id = requireUuid((await ctx.params).id);
  const body = await readJson(req, schema);
  return ok(requestId, await setLocalHold({ actorId: actor.id, orderId: id, on: body.on, reason: body.reason }));
});
