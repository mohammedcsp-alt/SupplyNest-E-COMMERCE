import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requireUser } from '@/lib/session';
import { addPackage, finishPacking, startPacking } from '@/modules/fulfillment/service';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('add_package'), weightGrams: z.number().int().min(1).max(200000).nullable().optional(), trackingCode: z.string().trim().max(80).nullable().optional() }),
  z.object({ action: z.literal('finish') }),
]);

/** Packing (CUS-side parcels, numbered per job). Packing requires a CHECKED job. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requireUser(await getCurrentUser());
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  if (body.action === 'start') return ok(requestId, { id: (await startPacking(actor, id)).id, status: 'PACKING' });
  if (body.action === 'add_package') {
    const pkg = await addPackage(actor, id, { weightGrams: body.weightGrams ?? null, trackingCode: body.trackingCode ?? null });
    return ok(requestId, { id: pkg.id, packageNo: pkg.packageNo, label: pkg.label }, { status: 201 });
  }
  const job = await finishPacking(actor, id);
  return ok(requestId, { id: job.id, status: job.status });
});
