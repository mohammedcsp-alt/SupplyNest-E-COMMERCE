import { apiRoute, ok } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { reconciliation } from '@/modules/accounting/service';

export const dynamic = 'force-dynamic';

/** Unallocated transfers, collection variances, uncollected shipments. Requires reconcile permission. */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.FINANCE_RECONCILE);
  return ok(requestId, await reconciliation());
});
