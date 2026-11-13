# Operations runbook (local V1)

All commands run from the `B2B-STORE` folder in PowerShell or Git Bash. Ports: application **3200**; PostgreSQL **5440**
(Docker container `b2b-store-postgres`). Never use ports 3100, 5432, 5433 or 8333 — those belong to other systems.

## 1. Start and stop

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1   # starts the DB container, applies migrations, runs the app
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1    # stops the app on 3200 and the DB container (data kept)
```

Manual equivalent:

```bash
docker start b2b-store-postgres
npx prisma migrate deploy
npm run dev            # http://127.0.0.1:3200
```

## 2. Scheduled jobs

| Job | Command | Suggested schedule | What it does |
|---|---|---|---|
| Reservation expiry review | `npm run jobs:sweep` | every 15 minutes (Windows Task Scheduler) | Moves expired reservations to REVIEW_REQUIRED (never releases stock); refreshes stale-data alerts. Idempotent. |

Scheduling is not started by the application in V1. Without the job, expired reservations are still moved when an
administrator opens the reservations page and runs the sweep button.

## 3. Imports

1. Download the template from the admin import page (columns are listed in `src/modules/imports/table.ts`).
2. Upload the file: the system validates every row and shows errors. Nothing is applied yet.
3. Check the freshness: `EXTRACTED_AT` must come from the extraction manifest. Missing → UNKNOWN (confirmation required).
   Older than already applied data → STALE (a manager must approve with a reason).
4. Commit. The commit is all-or-nothing. A second commit of the same preview is refused.

Files that contain errors are kept as REJECTED evidence in the import history.

## 4. Backups and restore test

The admin **Backup** page runs `pg_dump` inside the B2B container (custom format) and records the file, checksum and row
counts in `backup_runs`. The restore test restores the newest dump into a **scratch** database named
`b2b_store_restore_scratch`, compares row counts, and drops the scratch database. It never touches `b2b_store_dev`.

Manual backup (if the UI is unavailable):

```bash
docker exec b2b-store-postgres pg_dump -U b2b_app -d b2b_store_dev -Fc > storage/backups/manual-$(date +%Y%m%d%H%M).dump
sha256sum storage/backups/manual-*.dump
```

Restore into the scratch database only:

```bash
docker exec b2b-store-postgres psql -U b2b_app -d postgres -c "CREATE DATABASE b2b_store_restore_scratch;"
docker exec -i b2b-store-postgres pg_restore -U b2b_app -d b2b_store_restore_scratch < storage/backups/<file>.dump
docker exec b2b-store-postgres psql -U b2b_app -d postgres -c "DROP DATABASE b2b_store_restore_scratch;"
```

Targets from the spec (OPEN-15) are **design goals**: RPO ≤ 24 h and RTO ≤ 4 h, conditional on the infrastructure. They
are not measured guarantees in this workspace.

## 5. Migrations

- Apply: `npx prisma migrate deploy` (non-destructive).
- Create a new migration: `npx prisma migrate dev --name <name>` (development only).
- Take a backup before any migration that changes existing data.
- Never run `prisma migrate reset` against a database that holds data you need. The test suite does not reset databases.

## 6. Monitoring (minimum)

- Application logs: JSON lines on stdout. Each request logs method, path, status and duration with a request id.
- Health check: `GET /api/v1/catalog?pageSize=1` returns 200 when the app and database are up.
- Database: `docker exec b2b-store-postgres pg_isready -U b2b_app -d b2b_store_dev`.
- Open alerts: admin Inventory page (low stock, stale data, reservations to review, stock conflicts).

## 7. Customer and staff administration

- Approve a registration: Admin → Customers → open the customer → approve with a price level (required).
- Suspend: reason required. Prices disappear and new orders are blocked immediately; existing orders are not cancelled.
- Staff accounts and roles: Admin → Roles. Changes are audited. The MANAGER role always keeps every permission.

## 8. Known operational limits

See `KNOWN_LIMITATIONS.md`. Notably: no SMS provider, no email, no PDF generation for Arabic text on the server, no
automatic scheduler inside the application process.
