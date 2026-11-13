import { apiRoute, clientIp, ok } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { runRestoreTest } from '@/modules/admin/backup';

export const dynamic = 'force-dynamic';

/** Restores the latest backup into the scratch database b2b_store_restore_scratch only, compares counts, drops it. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.BACKUP_RESTORE);
  const run = await runRestoreTest(actor.id, clientIp(req));
  return ok(requestId, { id: run.id, status: run.status, restoreResult: run.restoreResult, evidence: run.evidence }, { status: 201 });
});
