import { z } from 'zod';
import { apiRoute, ok, readJson, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { voidAllocation } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export const POST = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_ALLOCATE);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  return ok(requestId, await voidAllocation(actor, { allocationId: id, reason: body.reason }));
});
