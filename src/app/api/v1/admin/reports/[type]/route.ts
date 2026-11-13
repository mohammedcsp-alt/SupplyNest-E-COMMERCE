import { apiRoute, ok, type RouteContext } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { canSeePrices } from '@/modules/admin/access';
import { buildReport, parseReportFilters, parseReportType } from '@/modules/admin/reports';

export const dynamic = 'force-dynamic';

/** JSON rows for one report type. Filters: from, to, status, customerId, skuId, priceLevelId. */
export const GET = apiRoute<{ type: string }>(async (req, ctx: RouteContext<{ type: string }>, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.REPORT_VIEW);
  const type = parseReportType((await ctx.params).type);
  const filters = parseReportFilters(req.nextUrl.searchParams);
  const result = await buildReport(type, filters, canSeePrices(actor));
  return ok(requestId, result, { meta: { rowCount: result.rowCount, truncated: result.truncated, filters } });
});
