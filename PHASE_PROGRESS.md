# B2B-STORE V1 — Phase progress

Legend: [x] complete and verified by a command run · [~] built, partially verified · [ ] pending · [!] blocked
Verification details: TEST_REPORT.md. Last verified: 2026-11-13. Local commit history: see `git log`.

## Phase 0 — Environment and safety
- [x] Workspace isolated in `B2B-STORE/`; the WMS project and its containers were never inspected or changed
- [x] Dedicated PostgreSQL container `b2b-store-postgres` on 127.0.0.1:5440 (volume `b2b-store-pgdata`)
- [x] Databases `b2b_store_dev` (development) and `b2b_store_test` (tests; identity-checked before any test run)
- [x] Port 3200 for the application; 3210 for E2E; 3220 used only for a production smoke test
- [x] Secrets in gitignored `.env` and `.env.test`; development credentials in gitignored `DEV-CREDENTIALS.local.md`

## Phase 1 — Core foundation
- [x] Prisma schema (65 models, snake_case tables), two hand-written migrations (CHECK constraints, partial unique indexes,
      SKU image limit trigger, append-only audit trigger, immutable financial rows, sequences)
- [x] Config validation (production refuses the mock OTP and the WMS flag), API envelope, error codes, RBAC, audit, rate
      limits, bilingual shell (Arabic RTL, English LTR)
- [x] Idempotent seed (synthetic data only)

## Phase 2 — Customers and authentication
- [x] Registration, development OTP (mock), approval with price level, suspension and reactivation, price-level changes,
      password recovery, custom roles and permissions, audit trail
- [x] Tests: 13 integration; 12 API security tests; browser sign-in

## Phase 3 — Generic catalog and inventory
- [x] Categories (unlimited depth), attributes, brands, qualities, SKUs, up to 10 images (magic-byte checked)
- [x] Product models are optional groupings (general-purpose catalog; no mobile-specific mandatory fields); creation API
      and admin form added; idempotent; tested
- [x] Tier prices with history; public projection without prices; search, filters, pagination
- [x] Reservations, exactly-once release, expiry review, alerts (one open per type), stale data alerts
- [x] Atomic product and price imports (CSV/XLSX), freshness gates, manager override
- [x] Browser tests: admin SKU creation, price change, image upload and server refusal of a non-image, valid and invalid
      imports, stale-file override, reservation extend and release, second release refused

## Phase 4 — Cart, checkout and orders
- [x] Cart, quick add, bulk paste and file preview (nothing created until reviewed)
- [x] Shipping rules by governorate and area (missing rule blocks checkout); quote with consent hash
- [x] Idempotent COD checkout; concurrent duplicates produce one order
- [x] Order edits before preparation lock (repricing consent); cancellation request and manager approval; reorder at
      current prices; merge suggestions (not executed)
- [x] Browser tests: checkout placement, cancellation request and approval, reorder

## Phase 5 — Temporary fulfillment
- [x] Jobs created with orders; preparation document number and print counter (not a sales invoice)
- [x] Assignment with different picker and checker; blind counting; discrepancy hold and manager resolution with reasons
- [x] Checker no longer sees the picker's shortage reason before counting (fixed in this pass; unit-tested)
- [x] Packing with parcel numbering; handover consumes accepted quantity only; courier shipment and invoice created
- [~] Picking, checking and packing forms: exercised through the API and HTML, not in a browser

## Phase 6 — Temporary accounting and courier settlements
- [x] Invoices with revisions; couriers and effective-dated agreements (NET_DEDUCTION / GROSS_REMITTANCE), snapshotted
- [x] Collections (set once), remittances, allocations with limits, fee payments, adjustments and reversals, statements,
      reconciliation
- [x] Settlement arithmetic and immutability tested; concurrent collection and allocation tests pass
- [~] Reports in JSON, CSV and XLSX with checksums (verified over HTTP by an agent; not in a browser); PDF via print view only
- [ ] Development-data residue: orders, shipments and their immutable financial rows remain (TEST_REPORT §7)

## Phase 7 — Administration and reports
- [x] Dashboard, customers, catalog, categories, imports, inventory, reservations, orders, shipping, roles, audit, CMS,
      reports, settings, backup, integrations
- [x] Banner update and deactivation; CMS page delete (unpublished pages only); both with permissions and audit
- [x] Backup run and restore test, re-run through the API; manual independent restore checked against row counts
- [~] Browser tests cover catalog, imports, orders and reservations; other admin pages verified over HTTP only

## Phase 8 — Testing and stabilization
- [x] Vitest: 126 tests in 15 files (unit, integration, concurrency), all passing
- [x] Playwright: 72 tests (36 API, 36 browser) plus 3 sign-in setup steps, all passing
- [x] Production build passes; type check passes; production server serves (smoke)
- [x] Internal security tests: 36 API tests; findings recorded (TRACE framework behaviour; dev error detail)
- [x] Controlled concurrency: 5 tests (up to 20 simultaneous callers)
- [~] RTL and LTR: direction, toggle and overflow checks; no visual regression
- [ ] Sustained load, soak and HTTP-level load testing: not run
- [ ] Independent security review: not performed (out of scope for this environment)

## Phase 9 — Local delivery
- [x] Application running at http://127.0.0.1:3200 (development server)
- [x] Demo data and development accounts; credentials written to the gitignored `DEV-CREDENTIALS.local.md` by the seed
- [x] Start and stop scripts (`scripts/start-local.ps1`, `scripts/stop-local.ps1`)
- [x] Documents: README, ARCHITECTURE, IMPLEMENTATION_DECISIONS, DECISIONS_IMPLEMENTED, OPENAPI.yaml (106 routes,
      generated), OPERATIONS, SECURITY_REPORT, WMS_CONTRACTS_ONLY, KNOWN_LIMITATIONS, TEST_REPORT, IMPLEMENTATION_STATUS,
      CHANGELOG, FINAL_DELIVERY_REPORT, this file
- [ ] Git: local commits only. Nothing pushed since the approved push of the earlier commit (see FINAL_DELIVERY_REPORT)

## Blocked / needs owner decision
- Shipping fee values and courier identities (owner business data)
- SMS OTP provider and credentials (external)
- Whether to rebuild the development database to remove test-generated financial rows
- Whether to rotate the synthetic development password (it is in pushed history)
- Whether to push the latest local commits to GitHub (the earlier approval covered only the earlier commit)
