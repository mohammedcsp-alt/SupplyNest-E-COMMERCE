/**
 * Scheduled job: moves expired reservations to REVIEW_REQUIRED (never releases them) and refreshes stale-data alerts.
 * Idempotent. Safe to run repeatedly, e.g. from Windows Task Scheduler every 15 minutes:
 *   npm run jobs:sweep
 */
import { sweepExpiredReservations, syncStaleAlerts } from '../src/modules/inventory/inventory';
import { db } from '../src/lib/db';

async function main() {
  const started = new Date();
  const movedToReview = await sweepExpiredReservations(started);
  const staleSkus = await syncStaleAlerts(started);
  console.log(JSON.stringify({ job: 'expiry-sweep', at: started.toISOString(), movedToReview, staleSkus }));
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ job: 'expiry-sweep', error: String(err) }));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
