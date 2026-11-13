/**
 * Restore verification (ADMIN-006 / OPEN-15). Restores the most recent successful backup into the fixed scratch
 * database (b2b_store_restore_scratch) and compares key table row counts. Never restores into the dev or test
 * database; the guard lives in src/modules/admin/backup.ts.
 *   npm run restore:test
 */
import { runRestoreTest } from '../src/modules/admin/backup';
import { db } from '../src/lib/db';

async function main() {
  const result = await runRestoreTest(null, null);
  console.log(JSON.stringify({ job: 'restore-test', ...result }));
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ job: 'restore-test', status: 'FAILED', error: message.slice(0, 300) }));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
