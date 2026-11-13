import { apiRoute, ok } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { canSeePrices } from '@/modules/admin/access';
import { listAuditLogs } from '@/modules/admin/audit';

export const dynamic = 'force-dynamic';

/** Read-only audit log. Filters: entityType, action (prefix), actorId, from, to (YYYY-MM-DD or ISO), page. */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.AUDIT_VIEW);
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? 50) || 50));
  const result = await listAuditLogs(
    {
      entityType: sp.get('entityType') ?? undefined,
      action: sp.get('action') ?? undefined,
      actorId: sp.get('actorId') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      page,
      pageSize,
    },
    canSeePrices(actor),
  );
  return ok(requestId, result.items, { meta: { page, pageSize, total: result.total } });
});
