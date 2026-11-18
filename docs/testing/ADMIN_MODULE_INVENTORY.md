# Admin Module Inventory (2026-11-18)

Scope: the administration area for Phase 1 (Admin Dashboard functional testing) and Phase 2 (concurrent administration).
Evidence: files under `src/app/admin`, `src/app/accounting`, `src/app/fulfillment`, `src/app/api/v1/admin`, and the
integration suite. "Passed in full run" means the file ran in `npx vitest run tests/integration` on 2026-11-18 (140 tests,
all passing). UI behaviour was **not** checked in a browser in this pass. Classifications are from code and tests only.

## 1. Modules

| Module | Pages | Admin API routes | Gate | Automated tests | Classification |
|---|---|---|---|---|---|
| Login (staff panel) | `/admin/login` → `/login?portal=admin` | `/api/v1/auth/login` (portal=admin) | Portal check before session | authn-authz-remediation.test.ts | Implemented |
| Dashboard | `/admin` (79 lines) | dashboard service | `admin.access` | dashboard count test in req-ops (passed in full run) | Implemented |
| Customers (approve, reject, suspend, reactivate, price level) | `/admin/customers`, `/admin/customers/[id]` | 7 routes under `admin/customers` | `customer.*` | identity-and-prices.test.ts (passed) | Implemented |
| Catalog / SKUs (create, update, prices, attributes, merchandising) | `/admin/catalog`, `/admin/catalog/[id]`, `/admin/merchandising` | `admin/skus/*`, `admin/models` | `catalog.manage`, `price.edit` | admin-concurrency.test.ts (4 PASS), models-and-cms.test.ts (passed) | Implemented |
| Categories / brands | `/admin/categories` | `admin/categories/*`, `admin/taxonomy` | `category.manage` | models-and-cms.test.ts (passed) | Implemented |
| Images (SKU, brand, category, banner) | Inside catalog and categories pages | `admin/images/*`, `admin/*/image` | `image.manage` (checked before file read) | media-merchandising.test.ts (passed) | Implemented |
| Inventory | `/admin/inventory` | `admin/inventory`, `admin/skus/[id]/inventory/adjust` | `inventory.adjust` | admin-concurrency.test.ts (+1 ×20 PASS), checkout-and-inventory (passed) | Implemented |
| Reservations | `/admin/reservations` | `admin/reservations/*` (extend, release, sweep) | `inventory.reservation.manage` | checkout-and-inventory (passed) | Implemented |
| Orders | `/admin/orders`, `/admin/orders/[id]` | `admin/orders/*` (hold, lock-prep, cancellation) | `order.*` | checkout-and-inventory, req-orders (passed) | Implemented |
| Imports (products, prices) | `/admin/imports`, `/admin/imports/[id]` | `admin/imports/*` (preview, commit, templates) | `import.preview`, `import.commit` | imports.test.ts (passed) | Implemented |
| Shipping (governorates, areas, rules) | `/admin/shipping` | `admin/shipping/*` | `shipping.manage` | req-accounting / checkout (passed) | Implemented. **UI: one placeholder-text match only (an input placeholder, not a defect)** |
| Roles and staff | `/admin/roles` (RoleEditor, StaffForm) | `admin/roles`, `admin/roles/[id]`, `admin/staff` | `role.manage` | sec-remediation.test.ts (13 PASS, incl. escalation ceiling) | Implemented, with the gaps in section 3 |
| Settings | `/admin/settings` | `admin/settings` | `settings.manage` | req-ops (passed) | Implemented |
| Audit log | `/admin/audit` | `admin/audit` | `audit.view` | admin-concurrency (actor attribution PASS) | Implemented |
| Reports and export | `/admin/reports`, print view | `admin/reports/[type]`, `…/export` | `report.view`, `report.export` | req-http.test.ts (passed) | Implemented |
| CMS | `/admin/cms` | `admin/cms/*` | `content.edit`, `content.publish` | models-and-cms (passed) | Implemented |
| Backup | `/admin/backup` | `admin/backup/*` (run, restore-test) | `backup.manage`, `backup.restore` | part-backup-retention (unit) | Implemented. Restore is isolated-DB only by design; **withheld from tester** |
| Integrations (WMS contracts) | `/admin/integrations` | none | `integration.view` | part-wms-contracts (unit, 34 PASS) | **Partial**: documentation only, WMS flag false, no network calls by design |
| Fulfillment (queue, pick, pack, check, handover, print) | `/fulfillment`, `/fulfillment/jobs/[id]` | `api/v1/fulfillment/*` | Service-level checks (assignment and permission) | req-queue, fulfillment-and-accounting (passed) | Implemented |
| Accounting (shipments, remittances, couriers, reconciliation, reports) | `/accounting/*` | `api/v1/accounting/*` | `finance.*` via `userWithPermission` | req-accounting, fulfillment-and-accounting (passed) | Implemented. **Withheld from tester (D-2)** |

Counts: 57 admin API route files; 13 admin/accounting/fulfillment page files without `gatePage` (they use
`userWithPermission` or service checks, verified by reading).

## 2. Authorization coverage

- Every admin API route file was checked. The 3 `*/image/route.ts` admin files use `adminImageHandlers`, which calls
  `requirePermission` before reading the file. The 9 `api/v1/fulfillment/*` routes have no direct `requirePermission`
  call. They rely on `listJobs` and the job services. **Not verified line by line in this pass: BLOCKED for
  an authenticated check by a non-assigned picker (see Phase 5 test, to add).**
- No admin route returned data without a session in the local check (401 on orders, customers, audit, settings, inventory, roles).

## 3. Missing or partial functions (not implemented; do not test as if present)

| Item | Status | Impact on owner protection / tests |
|---|---|---|
| Create a new role | **Missing** (no POST endpoint; only edit existing roles) | Blocks a dedicated ADMIN_TESTER role without a decision (see `ADMIN_TESTER_PERMISSION_MATRIX.md`) |
| Change staff status (suspend, deactivate, reactivate a staff account) | **Missing** | Good for owner protection (nothing can deactivate the owner), but the tester cannot be removed from the UI either; use the database only with approval |
| Admin reset of a staff password | **Missing** | Staff rely on self-change at `/account/password` and recovery |
| Active session list and remote logout | **Missing** | Session isolation is tested at service level only |
| Staff creation UI assigns existing roles only | Present | Works with existing roles |
| Integrations (live WMS) | **Partial by design** | Not part of this scope |

## 4. Defects found in this pass

| ID | Area | Status | Notes |
|---|---|---|---|
| BUG-SEC-004 | Role and staff creation could grant permissions the actor lacks; MANAGER assignable by any role.manage holder | FIXED, automated PASS | See SECURITY_REMEDIATION_REPORT.md |
| BUG-ADM-001 | Concurrent duplicate SKU returned a raw database error at service level | FIXED, automated PASS | HTTP layer already gave 409; now typed |
| BUG-SEC-003 | Non-SupplyNest services listen on LAN and Tailscale addresses | OPEN, owner action | Firewall and ACL proposal in SECURITY_REMEDIATION_REPORT.md |
| UI defects | Not assessed in a browser | NOT STARTED | Needs Phase 1 browser pass |

## 5. Phase 1 and Phase 2 test coverage

- Phase 1 cases: `UAT_ADMIN_PHASE1_2_TEST_CASES.csv`, rows with Phase = Phase 1 (filtered from the original register and new admin cases).
- Phase 2 concurrency cases: same file, rows with Phase = Phase 2 (ADM-CON-001 to 010). Automated evidence exists for
  ADM-CON-001, 002, 003, 007. The others are NOT RUN.
- Synthetic records only. No real customer or business data. Dev database contains only seeded and synthetic records plus the owner's staff account.
