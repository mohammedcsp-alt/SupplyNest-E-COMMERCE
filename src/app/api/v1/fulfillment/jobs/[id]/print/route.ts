import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/session';
import { markPrepPrinted } from '@/modules/fulfillment/service';

export const dynamic = 'force-dynamic';

/** Counts a print of the internal preparation document. It is NOT a sales invoice and creates no liability. */
export const POST = apiRoute<{ id: string }>(async (_req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  const job = await markPrepPrinted(actor, id);
  return ok(requestId, { id: job.id, prepPrintCount: job.prepPrintCount });
});
