# Changelog

## 1.0.0 — local V1 build (2026-11-13)

### Added
- Application: Next.js 15 / React 19 / TypeScript / Prisma 6 / PostgreSQL 16, serving on 127.0.0.1:3200.
- Identity: phone registration, development OTP, approval with price levels, suspension and reactivation, password recovery, RBAC with custom roles.
- Catalog: unlimited categories, category attributes, brands, models, qualities, SKUs with up to 10 images, tier prices with history, public projection without prices, search and filters.
- Inventory: reservations with row locks, exactly-once release, expiry review, stock alerts, manual adjustments with movement ledger.
- Imports: atomic CSV/XLSX product and price imports with freshness gates and manager override.
- Commerce: cart, bulk paste and file preview, shipping rules, quote with consent hash, idempotent COD checkout, order edits before preparation lock, cancellation with approval, reorder, merge suggestions.
- Fulfillment (temporary module): assignment, independent checking, discrepancy hold, packing, handover, preparation document counter.
- Accounting (temporary module): invoices with revisions, couriers and agreements (NET_DEDUCTION and GROSS_REMITTANCE), collections, remittances, allocations, fee payments, adjustments and reversals, statements, reconciliation, reports (JSON, CSV, XLSX).
- Administration: dashboard, customer, catalog, inventory, reservation, order, shipping, role, audit, CMS, report, settings, backup pages and APIs.
- Operations: start and stop scripts, expiry-sweep job, backup and restore-test tooling.
- Documentation: README, ARCHITECTURE, IMPLEMENTATION_DECISIONS, OPENAPI.yaml (route inventory), OPERATIONS, SECURITY_REPORT, WMS_CONTRACTS_ONLY, KNOWN_LIMITATIONS, TEST_REPORT, IMPLEMENTATION_STATUS, FINAL_DELIVERY_REPORT.
- Tests: 103 vitest (unit and integration) and 31 Playwright tests.

### Fixed during verification
- Language toggle did not switch direction (absolute redirect URL dropped the cookie).
- Order edit crashed when removing a line with a pending fulfillment job.
- Unique-constraint violations returned 500 instead of 409.
- Accountant role lacked adjustment approval in the development database (reseeded).
- E2E: browser sessions and login rate limits handled through a setup project and a test-database reset of transient limit rows.

### Known issues
- See KNOWN_LIMITATIONS.md.
