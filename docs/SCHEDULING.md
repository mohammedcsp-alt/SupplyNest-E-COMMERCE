# Scheduled jobs on Windows

Two jobs run on the local host. Neither is registered automatically: the owner registers them once.

## 1. Daily backup with retention (OPEN-15, ADMIN-006)

`scripts/backup-job.ts` runs one `pg_dump` through the backup module, then deletes dump files in `storage/backups`
older than 30 days. The newest dump is never deleted. Pruned backup rows are marked with `evidence.prunedAt`.
The job exits with code 1 when the backup fails, and in that case nothing is pruned.

Prerequisites: Docker Desktop is running and the container `b2b-store-postgres` is up.

### npm script (owner action)

Add this line to the `"scripts"` object in `package.json`:

```json
"backup:job": "dotenv -e .env -- tsx --conditions=react-server scripts/backup-job.ts"
```

### Task Scheduler command

Run from an elevated or normal PowerShell prompt. The time (02:00) is an example; choose a time outside working hours.

```powershell
schtasks /Create /TN "B2B-STORE Daily Backup" /SC DAILY /ST 02:00 /F /TR 'cmd /c "cd /d "C:\Users\HP\Documents\Clude project files\SupplyNest E-COMMERCE\B2B-STORE" && npm run backup:job >> storage\backup-job.log 2>&1"'
```

The single quotes keep the inner double quotes intact in PowerShell. After creating the task, run it once with
`schtasks /Run /TN "B2B-STORE Daily Backup"` and check `storage\backup-job.log`.

- `/F` replaces an existing task with the same name.
- The log file `storage\backup-job.log` is git-ignored (`storage/` is ignored).
- To check the last result: `schtasks /Query /TN "B2B-STORE Daily Backup" /V /FO LIST`.
- To remove the task: `schtasks /Delete /TN "B2B-STORE Daily Backup" /F`.

Run it once by hand first with `npm run backup:job` and confirm a JSON line with `"status":"SUCCEEDED"` appears.

## 2. Jobs sweep (existing)

`npm run jobs:sweep` moves expired reservations to review and refreshes stale-data alerts. It is idempotent.
Suggested schedule: every 15 minutes, using the same pattern as above with `npm run jobs:sweep`.

## Notes

- Scheduled tasks run under the signed-in user. Use a user account that can reach Docker.
- The restore test (admin backup page) is still a manual action. It is not scheduled.
- Retention is 30 days for dump files. Restore points older than that are not kept.
