import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/session';
import { startChecking, submitCheck } from '@/modules/fulfillment/service';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({
    action: z.literal('submit'),
    lines: z.array(z.object({ pickLineId: z.string().uuid(), checkedQty: z.number().int().min(0).max(100000) })).min(1),
  }),
]);

/** Independent check (ACC-02): a different person than the picker. A count mismatch holds the job. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const job = body.action === 'start' ? await startChecking(actor, id) : await submitCheck(actor, id, body.lines);
  return ok(requestId, { id: job.id, status: job.status, mismatches: 'mismatches' in job ? job.mismatches : undefined });
});
