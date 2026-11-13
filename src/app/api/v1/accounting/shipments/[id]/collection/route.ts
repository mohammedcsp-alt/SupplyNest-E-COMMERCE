import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { recordCollection } from '@/modules/accounting/service';
import { idempotencyKeyOf } from '@/lib/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  collectedAmount: z.string().regex(/^\d{1,12}$/, 'Whole IQD amount'),
  reference: z.string().trim().min(2).max(120),
});

/** Confirms the COD the courier actually collected. Once set, changes go through adjustments only. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_REMITTANCE_RECORD);
  const { id } = await ctx.params;
  const key = idempotencyKeyOf(req);
  const body = await readJson(req, schema);
  const result = await recordCollection(actor, { shipmentId: id, ...body, idempotencyKey: key });
  return ok(requestId, result, { status: result.replayed ? 200 : 201 });
});
