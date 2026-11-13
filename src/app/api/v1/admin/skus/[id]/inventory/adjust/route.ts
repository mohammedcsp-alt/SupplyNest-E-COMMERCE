import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { adjustPhysical } from '@/modules/inventory/inventory';

export const dynamic = 'force-dynamic';

const schema = z.object({
  mode: z.enum(['SET', 'DELTA']),
  value: z.number().int().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(3).max(500),
});

/** ADM-08: manual physical stock change. Writes a movement with actor, source and reason; never negative. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.INVENTORY_ADJUST);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const result = await db.$transaction((tx) => adjustPhysical(tx, { skuId: id, ...body, actorId: actor.id }));
  return ok(requestId, result);
});
