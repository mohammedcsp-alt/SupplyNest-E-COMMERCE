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

## 8. Startup, recovery and status (Windows, per user)

**Why the site went down (verified 2026-11-17):** Docker Desktop was not running, so PostgreSQL on 127.0.0.1:5440 was
unreachable and every data page failed with a Prisma `Can't reach database server` error. Three things combined:
- Docker Desktop's "start when you sign in" setting was off (`AutoStart: false` in `%APPDATA%\Docker\settings-store.json`).
- Its engine was stopped abruptly several times (Docker backend log: `exit status 0x40010004`), so the B2B container
  exited without a clean shutdown (exit 255).
- The container had restart policy `no`, so nothing brought it back when the engine returned.
PostgreSQL recovered on start by replaying its write-ahead log. Row counts were checked before and after: users 23,
orders 3, audit_logs 124, schema migrations 5 (unchanged). No data, volume or credential was changed.

**What runs automatically:** the scheduled task `B2B-STORE-Supervisor` runs `scripts\b2b-supervisor.ps1`. It starts at
each sign-in and every 5 minutes as a watchdog. The supervisor starts Docker Desktop if needed, then starts the
`b2b-store-postgres` container (only that one; WMS containers are never touched), checks `pg_isready`, and starts the
website on 127.0.0.1:3200. It restarts the website if it stops, or if `/api/health` fails three times in a row. It
does not run migrations and does not recreate containers or volumes.

| Action | Command (from the `B2B-STORE` folder) |
|---|---|
| Install / update the autostart task | `powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1` |
| Remove the autostart task (keeps DB and app as they are) | `powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1 -Uninstall` |
| Status report (read-only) | `powershell -ExecutionPolicy Bypass -File .\scripts\status-local.ps1` |
| Start everything now | `powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1` |
| Stop everything (stays stopped until start-local) | `powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1` |
| Health endpoint | `curl http://127.0.0.1:3200/api/health` → `200` ok, `503` database down |
| Logs | `storage\logs\supervisor.log`, `storage\logs\app.out.log`, `storage\logs\app.err.log` |

Notes:
- **Sign-in required.** The task starts when you sign in to Windows, not at boot. If the PC restarts, the site is
  unavailable until you sign in. Windows Home has no service-style start without sign-in, so this is the limit of the
  per-user design.
- **Stopped means stopped.** `stop-local.ps1` writes `storage\logs\supervisor.paused`. While that file exists, the
  supervisor and the watchdog do nothing, even after a restart. `start-local.ps1` removes the file.
- **Dev mode is the default.** The site runs `server.mjs --dev`. Production mode (`-Mode prod`) refuses to start while
  `OTP_PROVIDER=mock`, which is the local development setting. Enable production only after a real SMS OTP provider is
  configured.
- **Error page.** When the database is down, visitors get the "temporarily unavailable" page (`src\app\global-error.tsx`
  and `src\app\error.tsx`). Prisma text is logged on the server only. In dev mode, Next.js still forwards server log
  lines into the page source and shows its own developer overlay, so the stack-trace suppression is complete only in
  production mode.
- **Migrations** are not applied by the supervisor. Run `npx prisma migrate deploy` manually after pulling new
  migrations (see section 5).

**Tested here (2026-11-17), without a Windows reboot:** database outage → friendly page and health 503 → recovery by the
supervisor with data intact; cold start from Docker Desktop closed through the scheduled task (website back in 16 s);
app killed → restarted in 42 s; supervisor killed → restarted by the 5-minute watchdog in 137 s.
**Not tested:** a real Windows restart and sign-in. Verify it once by restarting the PC, then running `status-local.ps1`.

## 9. Sign-in portals (customers and administration)

- Customer sign-in: `http://127.0.0.1:3200/login` (customer panel). Staff accounts are refused here.
- Administration sign-in: `http://127.0.0.1:3200/admin/login`, which redirects to `/login?portal=admin`. Customer accounts
  are refused here. The footer "Admin Portal" link goes to the same panel.
- Both panels use `POST /api/v1/auth/login` with a `portal` field. The server enforces the portal after the password is
  checked, so a refused attempt creates no session and writes an `auth.portal_denied` audit row.
- Every administration API still enforces its own permission. Anonymous requests get 401, and signed-in users without the
  permission get 403.
- Administrator accounts are never self-registered. They are created by the system owner (see the owner note in section 8).
