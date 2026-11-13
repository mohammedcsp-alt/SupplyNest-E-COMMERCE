# B2B-STORE V1 — Phase progress

Legend: [x] complete and verified by a command run · [~] built, partially verified · [ ] pending · [!] blocked
Verification details: see TEST_REPORT.md. Last verified: 2026-11-13.

## Phase 0 — Environment and safety
- [x] Workspace isolated in `B2B-STORE/`; the WMS project and its containers were never inspected or changed
- [x] Dedicated PostgreSQL container `b2b-store-postgres` on 127.0.0.1:5440, volume `b2b-store-pgdata`
- [x] Databases `b2b_store_dev` (development) and `b2b_store_test` (tests; identity-checked before any run)
- [x] Port 3200 used by the app; port 3210 used only by the E2E server
- [x] `.env` generated secrets, gitignored

## Phase 1 — Core foundation
- [x] Prisma schema (65 models, snake_case tables) and two hand-written migrations (CHECK constraints, partial unique
      indexes, SKU image limit trigger, append-only audit trigger, immutable financial rows, sequences)
- [x] Config validation (production refuses mock OTP and WMS flag), API envelope, error codes, RBAC, audit, rate limits, i18n (Arabic RTL, English LTR), layout
- [x] Seed (idempotent, synthetic only): roles, permissions, price levels, governorates, dev accounts, 33 SKUs

## Phase 2 — Customers and authentication
- [x] Registration, mock OTP (dev only), approval with price level, suspension and reactivation, price-level changes, password recovery
- [x] Custom roles and permissions; role editing and staff creation in the admin area (agent-reported)
- [x] Audit trail; status history
- [x] Tests: 13 integration; 12 API E2E; browser sign-in

## Phase 3 — Generic catalog and inventory
- [x] Categories (unlimited depth), attributes, brands, models, qualities, SKUs, up to 10 images (magic-byte checked)
- [x] Tier prices with history; public projection without prices; search, filters, pagination
- [x] Reservations, exactly-once release, expiry review (REVIEW_REQUIRED), alerts (one open per type)
- [x] Atomic product and price imports (CSV/XLSX), freshness gates, manager override
- [~] Admin UI for imports, images and inventory: pages exist; browser interaction not verified (see TEST_REPORT §6)
- [ ] Product-model creation API (admin SKU form lists existing models only)

## Phase 4 — Cart, checkout and orders
- [x] Cart, quick add, bulk paste and file preview (nothing created until reviewed)
- [x] Shipping rules by governorate and area (missing rule blocks checkout); quotes with consent hash
- [x] Idempotent COD checkout; concurrent duplicate submissions produce one order
- [x] Order edits before preparation lock with repricing consent; cancellation request and manager approval; reorder at current prices; merge suggestions (not executed)
- [x] Browser: checkout placement, cancellation request + approval, reorder (desktop Arabic and mobile English)

## Phase 5 — Temporary fulfillment
- [x] Jobs created with orders; preparation document number and print counter (not a sales invoice)
- [x] Assignment with different picker and checker; blind counting; discrepancy hold and manager resolution with reasons
- [x] Packing with parcel numbering; handover consumes accepted quantity only and creates the courier shipment and invoice
- [~] UI for picking, checking and packing forms: built; exercised through the API, not in a browser

## Phase 6 — Temporary accounting and courier settlements
- [x] Invoices with revisions; couriers and effective-dated agreements (NET_DEDUCTION / GROSS_REMITTANCE), snapshotted per shipment
- [x] COD expected vs collected kept separate; collection set once; remittances; allocations with limits; fee payments; adjustments and reversals; statements; reconciliation
- [x] Settlement arithmetic tested (unit and integration)
- [~] Reports in JSON, CSV and XLSX with checksums (agent-reported verification); PDF via print view only
- [ ] Development-data residue: orders, shipments and their immutable financial rows remain (see TEST_REPORT §4)

## Phase 7 — Administration and reports
- [x] Dashboard, customers, catalog, categories, imports, inventory, reservations, orders, shipping, roles, audit, CMS, reports, settings, backup, integrations pages (built; manager access verified by agent via HTTP)
- [x] Backup run and restore test against a scratch database (agent-reported PASSED; re-run not performed)
- [~] Browser verification of admin forms: not done

## Phase 8 — Testing and stabilization
- [x] Unit tests (40), integration tests (63), concurrency tests (two-checkout race, duplicate submissions, double import commit)
- [x] Authorization and price-isolation tests (API and browser)
- [x] Production build passes; type check passes
- [x] Browser E2E: 31 of 31 passing after fixes (see TEST_REPORT §3)
- [~] RTL and LTR tests: direction, toggle, overflow checks only; no visual regression
- [ ] Load and performance tests: not run (OPEN-16 targets unmeasured)
- [~] Backup/restore: agent-reported; not re-run in this pass

## Phase 9 — Local delivery
- [x] Dev server on 127.0.0.1:3200 serving the storefront, admin, fulfillment and accounting modules
- [x] Synthetic demo data and development accounts (README)
- [x] Startup and shutdown scripts (`scripts/start-local.ps1`, `scripts/stop-local.ps1`)
- [x] README, ARCHITECTURE, IMPLEMENTATION_DECISIONS, OPENAPI.yaml (route inventory), OPERATIONS, SECURITY_REPORT, WMS_CONTRACTS_ONLY, KNOWN_LIMITATIONS, TEST_REPORT, IMPLEMENTATION_STATUS, CHANGELOG, FINAL_DELIVERY_REPORT
- [ ] Git: committed locally; the latest changes since the earlier push are not pushed

## Blocked / needs owner decision
- Shipping fee values and courier identities (owner business data)
- SMS OTP provider and credentials (external)
- Whether to rebuild the development database to remove test-generated financial rows (needs approval)
- Whether to push the latest commit to GitHub (earlier push was approved for that commit only)
