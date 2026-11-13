import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { allocateRemittance } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  allocations: z.array(z.object({ shipmentId: z.string().uuid(), amount: z.string().regex(/^\d{1,12}$/, 'Whole IQD amount') })).min(1).max(100),
});

/** Allocates a transfer across the courier's shipments. Refuses over-allocation at both ends (ACC-09). */
export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_ALLOCATE);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  return ok(requestId, await allocateRemittance(actor, { remittanceId: id, allocations: body.allocations }), { status: 201 });
});
