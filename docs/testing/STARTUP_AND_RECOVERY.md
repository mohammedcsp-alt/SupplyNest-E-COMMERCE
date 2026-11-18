# Startup, Recovery and Logs

Describes the startup chain that already exists in `scripts\` (added in commit 4963b48) and how it behaves for remote UAT.
Nothing in this document requires a computer restart to verify; restart tests are listed as pending owner approval.

## 1. Components and start order

| Order | Component | Started by | Recovery behaviour |
|---|---|---|---|
| 1 | Docker Desktop engine | `b2b-supervisor.ps1` (starts Docker Desktop if not running; waits up to 180 s) | Supervisor checks every 30 s |
| 2 | PostgreSQL container `b2b-store-postgres` (volume `b2b-store-pgdata`) | Supervisor (`docker start`, only if stopped). Restart policy set to `unless-stopped` | `pg_isready` check every pass; the container restarts with Docker |
| 3 | Application `node server.mjs --dev` on `127.0.0.1:3200` | Supervisor, after the database is ready | Restarted after 3 consecutive failed `/api/health` probes |
| 4 | Tailscale (Windows service) and Tailscale Serve config | Tailscale service at Windows boot; serve config persists in the Tailscale daemon | Restart with the service |
| 5 | Watchdog | Scheduled task `B2B-STORE-Supervisor`: at each sign-in of the owner, and every 5 minutes | If the supervisor exits, the next run restarts it. A named mutex prevents duplicates |

Wrong or duplicate starts are prevented by:
- the single-instance mutex `Local\B2BStoreSupervisor`,
- `MultipleInstances = IgnoreNew` in the scheduled task,
- the application listener check (no second Node process is started while port 3200 is in use).

## 2. Windows login requirement

- **Yes, a Windows sign-in is required.** The scheduled task runs in the owner's interactive session with limited (non-admin)
  rights, because Docker Desktop needs the user session. It does not run before sign-in.
- Tailscale itself starts at boot as a service, but the tester can only reach the application after the owner signs in
  and the supervisor has started the app.
- Auto-logon is not configured and is not recommended by this project.

## 3. Commands

Run from the `B2B-STORE` folder.

| Action | Command |
|---|---|
| Status (read-only) | `powershell -ExecutionPolicy Bypass -File .\scripts\status-local.ps1` |
| Start / resume | `powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1` (applies pending migrations, non-destructive) |
| Stop and pause (keeps DB data) | `powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1` |
| Install / update sign-in task | `powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1` |
| Remove sign-in task only | `powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1 -Uninstall` |
| Start the task now | `Start-ScheduledTask -TaskName 'B2B-STORE-Supervisor'` |
| Remote access on | `tailscale serve --bg 3200` (after owner enables Serve; see `REMOTE_TESTING_SETUP.md`) |
| Remote access off | `tailscale serve reset` |

`stop-local.ps1` creates `storage\logs\supervisor.paused`. While this file exists the supervisor and watchdog do nothing.
`start-local.ps1` removes it.

## 4. Logs

| File | Content |
|---|---|
| `storage\logs\supervisor.log` | Supervisor events: Docker start, DB start, app start, health failures, restarts |
| `storage\logs\app.out.log` | Application stdout (JSON lines, including `listening` and access logs) |
| `storage\logs\app.err.log` | Application stderr (errors, stack traces) |
| `storage\logs\supervisor.paused` | Exists only when automatic restart is disabled |
| `docker logs b2b-store-postgres` | Database server log |

Logs are local and gitignored (`storage/`). They can contain phone numbers in masked form only (the OTP log masks the number).

## 5. Persistence and safety

- Database data lives in the Docker named volume `b2b-store-pgdata`. No supervisor action deletes or recreates it.
- The supervisor never runs migrations, never resets the database, never deletes volumes, and never touches the
  `wms-platform-*` containers (other projects).
- Migrations remain a manual step: `npx prisma migrate deploy` (done by `start-local.ps1`).
- Before any database-affecting change, take a backup:
  `docker exec b2b-store-postgres pg_dump -U b2b_app -d b2b_store_dev --no-owner --no-acl > storage\backups\<name>.sql`
  A pre-UAT backup was taken on 2026-11-18 at `storage\backups\pre-remote-uat-20261118-191507.sql` (about 255 KB).
- Application code is in the working tree; the app runs from `node server.mjs --dev`, which is hot-reloading. Code edits
  during UAT are picked up automatically, which can disturb a tester mid-session. Announce code changes before making them.

## 6. Known limitations of this start-up design

- The application runs in **development mode** (`--dev`), because production refuses to start with mock OTP. Dev mode is
  slower and less stable under two concurrent users than a production build. Switching to production requires a real SMS
  provider (out of scope; no external subscriptions were approved).
- Recovery from a Windows reboot requires the owner to sign in (section 2).
- The watchdog interval is 5 minutes, so a dead supervisor can be down for up to 5 minutes.
- `install-autostart.ps1` was not re-run during this audit; the task was already installed and running.

## 7. Recovery procedures

| Failure | What to do |
|---|---|
| Website not answering | `status-local.ps1`; the supervisor restarts the app automatically after 3 failed probes (about 90 s). If it still fails, check `app.err.log`. |
| Database container stopped | Supervisor restarts it. Manual: `docker start b2b-store-postgres`. |
| Docker Desktop not running | Supervisor starts it. Allow up to 3 minutes. |
| Supervisor not running | Next watchdog run (within 5 min) restarts it, or run `Start-ScheduledTask -TaskName 'B2B-STORE-Supervisor'`. |
| Tailscale disconnected | Open the Tailscale app and sign in / reconnect. Serve config is retained. |
| Paused by mistake | Run `start-local.ps1`. |
| Need full stop | Run `stop-local.ps1`, then `tailscale serve reset` if remote access must end too. |

## 8. Verification status

| Check | Result | Notes |
|---|---|---|
| Status script | PASS (2026-11-18) | Docker UP, DB accepting connections, website HTTP 200, supervisor running, task Running, paused flag clear |
| Supervisor single instance | Verified by design (mutex); not separately tested | |
| Automatic app restart after killing the Node process | **NOT RUN** | Requires a controlled test; to be run with the owner present |
| Database interruption (stop container) and recovery | **NOT RUN** | To be run with the owner present |
| Windows restart recovery | **NOT RUN** | Requires explicit owner approval to restart the computer |
| Tailscale reconnection | **NOT RUN** | Requires disconnecting Tailscale (owner action) |
