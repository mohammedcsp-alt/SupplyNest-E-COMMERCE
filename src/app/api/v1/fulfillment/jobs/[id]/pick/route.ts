import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/session';
import { startPicking, submitPick } from '@/modules/fulfillment/service';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({
    action: z.literal('submit'),
    lines: z.array(z.object({ pickLineId: z.string().uuid(), pickedQty: z.number().int().min(0).max(100000), reason: z.string().trim().max(500).optional() })).min(1),
  }),
]);

export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const job = body.action === 'start' ? await startPicking(actor, id) : await submitPick(actor, id, body.lines);
  return ok(requestId, { id: job.id, status: job.status });
});
