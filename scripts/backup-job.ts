/**
 * Scheduled job (OPEN-15 / ADMIN-006): one pg_dump backup through the existing backup module, then pruning of dump
 * files older than the retention window (30 days). Pruning runs only after a successful backup, so a failed run
 * never removes older copies. Run daily; see docs/SCHEDULING.md. Requires Docker and the backup container.
 *   npm run backup:job
 */
import { pruneBackupFiles, runBackup } from '../src/modules/admin/backup';
import { db } from '../src/lib/db';

async function main() {
  const started = new Date();
  const backup = await runBackup(null, null);
  const retention = await pruneBackupFiles(null, null, started);
  console.log(
    JSON.stringify({
      job: 'backup',
      at: started.toISOString(),
      backupRunId: backup.id,
      status: backup.status,
      checksum: backup.checksum,
      pruned: retention.deleted,
    }),
  );
}

main()
  .catch((err: unknown) => {
    // Only the message is printed. The backup module never puts database content or credentials in its errors.
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ job: 'backup', status: 'FAILED', error: message.slice(0, 300) }));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
