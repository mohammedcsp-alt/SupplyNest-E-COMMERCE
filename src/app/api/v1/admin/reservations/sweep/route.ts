import { apiRoute, ok } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { sweepExpiredReservations, syncStaleAlerts } from '@/modules/inventory/inventory';

export const dynamic = 'force-dynamic';

/**
 * Moves expired reservations to REVIEW_REQUIRED (never releases them) and refreshes stale-data alerts.
 * Also runnable from the CLI (npm run jobs:sweep). Idempotent.
 */
export const POST = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.RESERVATION_MANAGE);
  const movedToReview = await sweepExpiredReservations();
  const staleSkus = await syncStaleAlerts();
  return ok(requestId, { movedToReview, staleSkus });
});
