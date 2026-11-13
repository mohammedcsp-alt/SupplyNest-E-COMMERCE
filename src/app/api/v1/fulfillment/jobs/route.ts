import { apiRoute, ok } from '@/lib/api';
import { errors } from '@/lib/errors';
import { getCurrentUser, requireUser } from '@/lib/session';
import { FULFILLMENT_LABELS, listJobs } from '@/modules/fulfillment/service';
import type { FulfillmentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** Task queue. Pickers and checkers see only their own assignments; managers see the full queue. */
export const GET = apiRoute(async (req, _ctx, requestId) => {
  const actor = requireUser(await getCurrentUser());
  const status = req.nextUrl.searchParams.get('status');
  if (status && !(status in FULFILLMENT_LABELS)) throw errors.validation('Unknown status');
  const rows = await listJobs(actor, { status: (status as FulfillmentStatus) || undefined, mine: req.nextUrl.searchParams.get('mine') === 'true' });
  return ok(requestId, rows.map((j) => ({ ...j, statusLabel: FULFILLMENT_LABELS[j.status] })));
});
