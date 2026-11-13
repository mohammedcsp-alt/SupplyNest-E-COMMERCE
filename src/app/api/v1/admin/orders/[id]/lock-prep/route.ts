import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { lockForPreparation } from '@/modules/commerce/orders';
import { requireUuid } from '@/modules/admin/ids';

export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().trim().min(3, 'Reason is required').max(500) });

/** Locks the order for external preparation: customer edits close (OPEN-12). Idempotent. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.ORDER_LOCK_PREP);
  const id = requireUuid((await ctx.params).id);
  const body = await readJson(req, schema);
  return ok(requestId, await lockForPreparation({ actorId: actor.id, orderId: id, reason: body.reason }));
});
