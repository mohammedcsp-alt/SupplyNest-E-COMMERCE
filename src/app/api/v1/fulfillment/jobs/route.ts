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
  const page = Number.parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10) || 1;
  const sp = req.nextUrl.searchParams;
  const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc';
  const assignee = sp.get('assignee');
  if (assignee && !/^[0-9a-f-]{36}$/i.test(assignee)) throw errors.validation('Invalid assignee');
  const result = await listJobs(actor, {
    status: (status as FulfillmentStatus) || undefined,
    mine: sp.get('mine') === 'true',
    page,
    dir,
    q: sp.get('q')?.slice(0, 80) || undefined,
    assigneeId: assignee || undefined,
  });
  return ok(
    requestId,
    result.rows.map((j) => ({ ...j, statusLabel: FULFILLMENT_LABELS[j.status] })),
    { meta: { total: result.total, page: result.page, pageSize: result.pageSize } },
  );
});
