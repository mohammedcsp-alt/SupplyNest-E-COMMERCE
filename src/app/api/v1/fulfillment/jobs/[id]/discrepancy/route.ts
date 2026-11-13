import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/session';
import { resolveDiscrepancy } from '@/modules/fulfillment/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  lines: z.array(z.object({ pickLineId: z.string().uuid(), acceptedQty: z.number().int().min(0).max(100000), reason: z.string().trim().min(3).max(500) })).min(1),
});

/** Manager resolution of a shortage/discrepancy: accepted quantities with reasons. Never silent. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const job = await resolveDiscrepancy(actor, id, body.lines);
  return ok(requestId, { id: job.id, status: job.status });
});
