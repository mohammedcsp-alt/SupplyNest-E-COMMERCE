import { z } from 'zod';
import { apiRoute, idempotencyKeyOf, ok, readJson } from '@/lib/api';
import { db } from '@/lib/db';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { recordRemittance } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_VIEW);
  const rows = await db.courierRemittance.findMany({ orderBy: { receivedAt: 'desc' }, take: 300, include: { courier: { select: { name: true } }, allocations: true } });
  return ok(requestId, rows.map((r) => ({
    id: r.id,
    courier: r.courier.name,
    reference: r.reference,
    gross: r.grossAmount.toFixed(0),
    allocated: r.allocations.reduce((acc, a) => acc + Number(a.allocatedAmount.toFixed(0)), 0),
    method: r.method,
    receivedAt: r.receivedAt,
  })));
});

const schema = z.object({
  courierId: z.string().uuid(),
  reference: z.string().trim().min(2).max(120),
  grossAmount: z.string().regex(/^\d{1,12}$/, 'Whole IQD amount'),
  receivedAt: z.string().datetime(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'OTHER']).default('CASH'),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Records a transfer received from a courier (proof of receipt). Allocation to shipments is a separate step. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_REMITTANCE_RECORD);
  const key = idempotencyKeyOf(req);
  const body = await readJson(req, schema);
  const result = await recordRemittance(actor, { ...body, receivedAt: new Date(body.receivedAt), idempotencyKey: key, note: body.note ?? null });
  return ok(requestId, result, { status: result.replayed ? 200 : 201 });
});
