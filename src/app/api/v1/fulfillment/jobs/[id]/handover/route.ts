import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/session';
import { handOver } from '@/modules/fulfillment/service';

export const dynamic = 'force-dynamic';

const schema = z.object({ courierId: z.string().uuid(), trackingNote: z.string().trim().max(255).nullable().optional() });

/** Hands parcels to the selected courier. Creates the courier shipment (fee snapshots) and the sales invoice. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const result = await handOver(actor, id, { courierId: body.courierId, trackingNote: body.trackingNote ?? null });
  return ok(requestId, { jobStatus: result.job.status, shipmentId: result.shipmentId });
});
