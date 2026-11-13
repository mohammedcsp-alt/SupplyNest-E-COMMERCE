import { apiRoute, ok } from '@/lib/api';
import { getCurrentUser, requirePermission } from '@/lib/session';
import { PERMISSIONS } from '@/lib/rbac';
import { listBackupRuns } from '@/modules/admin/backup';

export const dynamic = 'force-dynamic';

/** Backup and restore-test history (BackupRun rows). */
export const GET = apiRoute(async (_req, _ctx, requestId) => {
  requirePermission(await getCurrentUser(), PERMISSIONS.BACKUP_MANAGE);
  const runs = await listBackupRuns();
  return ok(requestId, runs.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    artifactPath: r.artifactPath,
    checksum: r.checksum,
    rowCounts: r.rowCounts,
    restoreTestAt: r.restoreTestAt,
    restoreResult: r.restoreResult,
  })));
});
