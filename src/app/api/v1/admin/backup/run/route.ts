import { apiRoute, clientIp, ok } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { runBackup } from '@/modules/admin/backup';

export const dynamic = 'force-dynamic';

/** Runs pg_dump inside the local Postgres container. Requires docker; fails clearly otherwise. */
export const POST = apiRoute(async (req, _ctx, requestId) => {
  const actor = requirePermission(await getCurrentUser(), PERMISSIONS.BACKUP_MANAGE);
  const run = await runBackup(actor.id, clientIp(req));
  return ok(requestId, { id: run.id, status: run.status, checksum: run.checksum, rowCounts: run.rowCounts }, { status: 201 });
});
