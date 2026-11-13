import { z } from 'zod';
import { apiRoute, idempotencyKeyOf, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { recordFeePayment } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  amount: z.string().regex(/^\d{1,12}$/, 'Whole IQD amount'),
  paidAt: z.string().datetime(),
  reference: z.string().trim().min(2).max(120),
});

/** Courier service fees paid separately (GROSS_REMITTANCE). Never recorded as COD. */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_FEE_PAYMENT_RECORD);
  const { id } = await ctx.params;
  const key = idempotencyKeyOf(req);
  const body = await readJson(req, schema);
  const result = await recordFeePayment(actor, { courierId: id, amount: body.amount, paidAt: new Date(body.paidAt), reference: body.reference, idempotencyKey: key });
  return ok(requestId, result, { status: result.replayed ? 200 : 201 });
});
