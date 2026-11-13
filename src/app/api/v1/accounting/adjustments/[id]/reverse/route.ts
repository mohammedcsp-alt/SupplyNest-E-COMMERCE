import { z } from 'zod';
import { apiRoute, idempotencyKeyOf, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { reverseAdjustment } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

/** Posts a reversing row. Posted financial rows are never edited (ACC-11). */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_ADJUSTMENT_APPROVE);
  const { id } = await ctx.params;
  const key = idempotencyKeyOf(req);
  const body = await readJson(req, schema);
  return ok(requestId, await reverseAdjustment(actor, { adjustmentId: id, reason: body.reason, idempotencyKey: key }), { status: 201 });
});
