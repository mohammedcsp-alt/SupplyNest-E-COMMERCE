# Known limitations (V1 local build)

Read this before relying on the build. Items are grouped by impact.

## A. Not implemented (by design or by lack of approved inputs)

1. **No SMS OTP provider.** Only a development mock exists (returns the code to the caller in development). Production refuses to start with the mock. Needs a provider, credentials and approval.
2. **No email, WhatsApp or push notifications.** In-site notifications only (spec CUSTOMER-008).
3. **WMS integration is disabled.** Contracts are documented (`WMS_CONTRACTS_ONLY.md`). No connection to port 3100 or any WMS database exists.
4. **No payment gateway.** COD only (STORE-005).
5. **No discounts, promotions, taxes or VAT** (OPEN-21).
6. **No merge execution.** Merge suggestions are recorded and can be accepted or rejected by the customer; nothing merges (OPEN-13 defers execution).
7. **No general ledger, payroll, profit and loss, or cost of goods.** Out of scope (spec 20.2).
8. **No courier API integration.** Courier collections, remittances and fee payments are entered manually with references (spec 20.11).
9. **No automatic restock on returns.** A returned unit must be entered by a manual inventory adjustment (movements are recorded).
10. **No automatic scheduler inside the application.** The reservation expiry job is a script (`npm run jobs:sweep`) to run from the OS scheduler, or the admin sweep button.
11. **Governorate shipping fees are not business values.** Three governorates carry clearly labelled synthetic placeholder rates in the development seed. Other governorates block checkout until an admin sets a rule (OPEN-10).

## B. Partially implemented

1. **PDF output.** Printable HTML views (browser "Save as PDF") are provided for reports and the internal preparation document. There is no server-side PDF generator, because Arabic shaping requires an engine that is not part of this build. Excel and CSV exports are server-side.
2. **Search.** Substring matching with relevance ordering over the first 2,000 matches. Adequate for the design target, not a full-text engine.
3. **Attribute filters.** Category attributes are stored and shown; only the listed filterable attributes are exposed in filters where the UI supports them.
4. **Reconciliation.** Shows unallocated transfers, collection variances, uncollected shipments and the number of recorded adjustments. It is a review aid, not an automatic matcher.
5. **Allocation corrections.** A wrong allocation is removed with an audited void; the transfer record itself is never edited.
6. **Locale.** Arabic and English are complete for the shell and for bilingual fields. Some admin-only labels are English-first where translation was not reviewed.
7. **Responsive layout.** Verified with automated viewport checks on desktop (1280 px) and a mobile device profile (Pixel 5). Not verified on physical devices or older browsers.

## C. Limits of verification

1. **No load test.** The design target (20,000 SKUs, 1,000 orders/day, 50 concurrent users) is not demonstrated. Concurrency correctness was tested at the level of two to four simultaneous requests.
2. **No external security review.** See `SECURITY_REPORT.md` section 3.
3. **Backup restore** was exercised only against the local container; no off-site copy and no measured RTO.
4. **No accessibility audit by an external tool beyond automated checks** that were run (see TEST_REPORT.md).
5. **Test data persists** between runs in the test database by design (tests create unique fixtures). A clean slate requires dropping the test database manually (the agent-run tooling refuses `prisma migrate reset`).

## D. Operational constraints

1. Runs only on `127.0.0.1`. No TLS, no HSTS. Not suitable for public exposure without a reverse proxy and TLS.
2. Single application process; no horizontal scaling tested.
3. Upload storage is on the local disk (`storage/uploads`). Back it up alongside the database.
4. Dependency vulnerability scan was not part of the verification.
5. Time zone display is fixed to Asia/Baghdad.

## E. Decisions awaiting the owner

See `IMPLEMENTATION_DECISIONS.md` section B. The most important commercial decisions are: shipping fee values, courier identities and agreements, the cancellation and merge rules after preparation, backup retention, and the SMS provider.
