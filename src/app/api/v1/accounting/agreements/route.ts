import { z } from 'zod';
import { apiRoute, ok, readJson } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { createAgreement } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  courierId: z.string().uuid(),
  settlementMode: z.enum(['NET_DEDUCTION', 'GROSS_REMITTANCE']),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable().optional(),
  governorateId: z.string().uuid().nullable().optional(),
  serviceFee: z.string().regex(/^\d{1,12}$/, 'Whole IQD amount'),
  returnFee: z.string().regex(/^\d{1,12}$/).optional(),
  reason: z.string().trim().min(3).max(500),
});

/** Courier agreements (effective-dated). Each shipment snapshots the agreement it used at handover (ACC-04). */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.COURIER_MANAGE);
  const body = await readJson(req, schema);
  const a = await createAgreement(actor, {
    ...body,
    effectiveFrom: new Date(body.effectiveFrom),
    effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
  });
  return ok(requestId, { id: a.id, settlementMode: a.settlementMode }, { status: 201 });
});
