import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/session';
import { assignJob } from '@/modules/fulfillment/service';

export const dynamic = 'force-dynamic';

const schema = z.object({ pickerId: z.string().uuid(), checkerId: z.string().uuid() });

export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const job = await assignJob(actor, { jobId: id, ...body });
  return ok(requestId, { id: job.id, status: job.status });
});
