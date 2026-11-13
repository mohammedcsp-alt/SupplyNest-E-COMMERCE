# B2B-STORE — B2B e-commerce platform V1 (local)

General-purpose wholesale catalog and ordering for physical merchandise, with a temporary local fulfillment module and a
temporary local courier-accounting module. Arabic (RTL) and English (LTR). Runs locally on **http://127.0.0.1:3200**.

**Status:** local development build. Not deployed. Not connected to any WMS. See `PHASE_PROGRESS.md`,
`IMPLEMENTATION_STATUS.md`, `TEST_REPORT.md` and `KNOWN_LIMITATIONS.md` before relying on any part of it.

## Requirements (Windows 11)

- Node.js 20.9+ (tested with 24.x) and npm
- Docker Desktop (running) — used only for the B2B PostgreSQL container
- Git Bash or PowerShell

## Database (B2B only)

The application uses its **own** PostgreSQL container. It must not share a server, port, database or credential with any
other system.

```bash
docker run -d --name b2b-store-postgres \
  -e POSTGRES_USER=b2b_app -e POSTGRES_PASSWORD='<generate a random value>' -e POSTGRES_DB=b2b_store_dev \
  -p 127.0.0.1:5440:5432 -v b2b-store-pgdata:/var/lib/postgresql/data postgres:16-alpine
docker exec b2b-store-postgres psql -U b2b_app -d b2b_store_dev -c "CREATE DATABASE b2b_store_test;"
```

Ports **3100, 5432, 5433 and 8333 are reserved for other systems and must not be used** by this project.

## Configuration

```bash
cp .env.example .env          # fill DATABASE_URL and APP_SECRET with LOCAL values; never commit .env
cp .env.example .env.test     # then point it at b2b_store_test; set NODE_ENV=test
```

`APP_SECRET` must be at least 32 characters (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
`FEATURE_FLAG_WMS_INTEGRATION` must stay `false`. `OTP_PROVIDER=mock` is development-only.

## Install, migrate, seed

```bash
npm install
npx prisma migrate deploy
npm run db:seed               # synthetic data only (idempotent)
```

## Run

```bash
npm run dev                   # http://127.0.0.1:3200
```

Or use `scripts/start-local.ps1` and `scripts/stop-local.ps1` (see `OPERATIONS.md`).

## Development accounts (synthetic, development seed only)

All seeded accounts share the password **`Dev-Only-Pass-2026!`**. They exist only in the development database and must
never be created in production.

| Role | Phone | Notes |
|---|---|---|
| Manager (all permissions) | +9647700000001 | Admin area, approvals, overrides |
| Customer approver | +9647700000002 | Customer approval and price levels |
| Catalog operator | +9647700000003 | Catalog, prices, imports |
| Inventory operator | +9647700000004 | Stock adjustments, alerts |
| Order operator | +9647700000005 | Orders, cancellations, holds |
| Picker | +9647700000006 / +9647700000007 | Picking only |
| Checker | +9647700000008 | Independent checking |
| Packer | +9647700000009 | Packing and handover |
| Accountant | +9647700000010 | Settlements, remittances, adjustments |
| Content editor | +9647700000011 | CMS |
| Report viewer | +9647700000012 | Reports, audit, no prices |
| Customer, price level A (active) | +9647700001001 | Prices, ordering |
| Customer, price level B (active) | +9647700001002 | Prices, ordering |
| Customer, registered (unverified) | +9647700001003 | No prices |
| Customer, approval pending | +9647700001004 | No prices |
| Customer, suspended | +9647700001005 | No prices, no ordering |
| Customer, rejected | +9647700001006 | Cannot sign in |

The development OTP is shown on screen (labelled DEV CODE) because the mock provider is active.

## Test

```bash
npm run typecheck             # TypeScript, no emit
npm run test:unit             # pure logic
npm test                      # unit + integration (uses b2b_store_test only; refuses other databases)
npm run test:e2e              # Playwright (separate server on port 3210 with the TEST database; see TEST_REPORT.md)
npm run jobs:sweep            # reservation expiry review (idempotent)
```

The test runner never resets a database. It applies pending migrations and the idempotent seed, and every test creates
uniquely named fixtures.

## Layout

```
prisma/            schema, two hand-written migrations, idempotent seed
src/app/           pages (server components) and /api/v1 route handlers
src/modules/       business services: identity, catalog, inventory, imports, commerce, fulfillment, accounting
src/lib/           config, db, API envelope, money, crypto, RBAC, sessions, audit, rate limits, i18n
src/components/    shared UI and form components
tests/             unit, integration, e2e (Playwright), helpers and setup
scripts/           start/stop (PowerShell) and the expiry-sweep job
storage/           uploads and backups (gitignored)
```

## Documentation

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Modules, invariants, transaction boundaries |
| `IMPLEMENTATION_DECISIONS.md` | Approved rules vs defaults chosen for open questions |
| `OPENAPI.yaml` | Route inventory generated from the source (paths, methods, permissions) |
| `OPERATIONS.md` | Start/stop, jobs, imports, backups, restore test |
| `SECURITY_REPORT.md` | Threats, mitigations, residual risks |
| `WMS_CONTRACTS_ONLY.md` | Future integration contracts (disabled) |
| `TEST_REPORT.md` | What was run, what passed, what failed, what could not run |
| `KNOWN_LIMITATIONS.md` | Gaps and constraints |
| `IMPLEMENTATION_STATUS.md` | Per-phase status: complete, partial, blocked |
| `FINAL_DELIVERY_REPORT.md` | Delivery summary (Arabic and English) |
| `CHANGELOG.md` | Version history |
| `PHASE_PROGRESS.md`, `EXECUTION_STATE.json` | Execution checkpoints |

## Security notes

- Secrets are read from `.env` only. Do not commit `.env`, `.env.test` or `storage/`.
- Prices are never sent to visitors or to customers who are not approved and active.
- Every administrative write is audited in the same transaction; the audit log rejects updates and deletes.
