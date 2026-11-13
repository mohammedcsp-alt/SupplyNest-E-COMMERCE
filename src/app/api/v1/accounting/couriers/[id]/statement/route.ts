import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { courierStatement } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

function parseDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw errors.validation('Invalid date');
  return d;
}

/**
 * Courier account statement: every value shown separately (order value, expected COD, collected COD, customer fees,
 * courier fees, net owed, transfers received, outstanding balance, fees payable separately).
 */
export const GET = apiRoute<{ id: string }>(async (req, ctx: RouteContext<{ id: string }>, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_VIEW);
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  return ok(requestId, await courierStatement(id, { from: parseDate(sp.get('from')), to: parseDate(sp.get('to')) }));
});
