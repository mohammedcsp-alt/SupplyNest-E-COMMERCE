import { z } from 'zod';
import { apiRoute, idempotencyKeyOf, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { createAdjustment } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  type: z.enum(['REJECTION_PARTIAL', 'REJECTION_FULL', 'RETURN', 'CUSTOMER_REFUND', 'DISCOUNT', 'COURIER_CORRECTION']),
  signedAmount: z.string().regex(/^-?\d{1,12}$/, 'Whole IQD amount, negative for reductions'),
  reason: z.string().trim().min(3).max(500),
});

/** Approved financial adjustment (rejections, returns, refunds, corrections). Negative values reduce the amount. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_ADJUSTMENT_APPROVE);
  const { id } = await ctx.params;
  const key = idempotencyKeyOf(req);
  const body = await readJson(req, schema);
  const result = await createAdjustment(actor, { shipmentId: id, ...body, idempotencyKey: key });
  return ok(requestId, result, { status: result.replayed ? 200 : 201 });
});
