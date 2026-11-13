# Known limitations (V1 local build)

Read this before relying on the build. Items are grouped by impact. Resolved items from earlier drafts were removed only
where a command in TEST_REPORT.md verified the fix.

## A. Not implemented (by design or waiting for owner input)

1. **No SMS OTP provider.** Only a development mock exists; the mock returns the code to the caller in development. The
   production start guard refuses the mock. Needs a provider, credentials and approval.
2. **No email, WhatsApp or push notifications.** In-site notifications only.
3. **WMS integration is disabled.** Contracts are documented (`WMS_CONTRACTS_ONLY.md`). No connection to the operational
   WMS, its port or its database exists in this code.
4. **No payment gateway.** Cash on delivery only.
5. **No discounts, promotions, taxes or VAT.**
6. **No merge execution.** Merge suggestions are recorded and can be accepted or rejected; nothing merges.
7. **No general ledger, payroll, profit and loss, or cost of goods.** Out of scope.
8. **No courier API integration.** Collections, remittances and fee payments are entered manually with references.
9. **No automatic restock on returns.** A returned unit is entered by a manual inventory adjustment.
10. **No scheduler inside the application process.** The expiry review is a script (`npm run jobs:sweep`) for the OS scheduler,
    or the admin sweep button.
11. **Shipping fee values and courier identities are placeholders.** The development seed labels three governorates with
    synthetic rates. Every other governorate blocks checkout until an administrator sets a rule. The owner must supply
    real values.
12. **No product-model deletion.** Models are created and listed; removal is not offered.
13. **Banners can be updated and deactivated but not deleted.** CMS pages can be deleted only when unpublished.

## B. Partially implemented

1. **PDF output.** Printable HTML views (browser "Save as PDF") exist for reports and the internal preparation document.
   There is no server-side PDF generator, because Arabic shaping needs an engine that is not in this build.
   Excel and CSV exports are server-side with SHA-256 checksums.
2. **Search.** Substring matching with relevance ordering over at most 2,000 matches per query. Not a full-text engine.
3. **Attribute filters.** Attributes are stored and displayed; only attributes marked filterable are offered in filters.
4. **Reconciliation.** Lists unallocated transfers, collection variances and uncollected shipments. It is a review aid, not
   an automatic matcher.
5. **Allocation corrections.** A wrong allocation is removed with an audited void; the transfer record is never edited.
6. **Reservations list.** Shows at most 200 rows, oldest expiry first. Filter by status or order number to find a row.
7. **Shipping amounts** are hidden from users without `price.view` (a judgement call made when building the admin area).
   Order operators can manage shipping rules but cannot see amounts.
8. **Locale.** Arabic and English are complete for the shell and bilingual fields. Some admin-only labels are English-first.
9. **Responsive layout.** Verified with automated viewport checks on a 1280-pixel desktop and a Pixel 5 profile only.
10. **Checker visibility rule.** The picker's shortage reason is hidden from the checker until the checker has counted. The
    checker still sees the job's line list and item names.

## C. Limits of verification

1. **No independent security review.** The internal security tests (TEST_REPORT §6) do not replace one.
2. **Load testing is small-scale.** The largest controlled run used 20 simultaneous callers. The design target (20,000 SKUs,
    1,000 orders a day, 50 concurrent users) is not demonstrated. No soak test was run.
3. **Backup and restore** were run and independently re-checked against the local container only. No off-site copy and no
    measured recovery time exist.
4. **Browser coverage is partial.** Browser tests cover the admin catalog, imports, orders and reservations, the customer
    checkout and cancellation, and the layout. Fulfillment and accounting forms are verified through the API and by HTML
    inspection, not in a browser.
5. **No accessibility audit by a dedicated tool** beyond the automated checks listed in TEST_REPORT.md.
6. **Test data persists** in the test database between runs by design. Stock for the shared seeded SKU is topped up by the
    E2E setup, and rate-limit rows are cleared; nothing else is reset.

## D. Security and operational findings

1. **TRACE returns a 500 error page.** The runtime rejects the TRACE method before application code runs, so the
    application cannot refuse it. In the production build the body is a generic error page with no stack trace. In the
    development server the body contains diagnostic detail. A reverse proxy in front of the application must refuse
    TRACE with 405. The test asserts only that TRACE is not a success.
2. **Development error pages expose internals.** Any unexpected error in development shows framework detail. Production
    shows a generic page with a request id.
3. **Development credentials are in pushed history.** The shared synthetic development password was committed in the
    README before this change and is in the pushed history of the repository. It is synthetic, but rotation is recommended
    before any shared use. The current seed writes the account list to a gitignored file, `DEV-CREDENTIALS.local.md`.
4. **Local HTTP only.** No TLS and no HSTS. Not suitable for public exposure without a reverse proxy and TLS.
5. **Single application process.** Horizontal scaling was not tested.
6. **Upload storage is on local disk** (`storage/uploads`). Back it up with the database.
7. **Dependency vulnerabilities were not scanned** as part of verification.
8. **Time zone display** is fixed to Asia/Baghdad.

## E. Development database residue

Three orders, three fulfillment jobs, two courier shipments, their immutable financial rows, and one live reservation
from earlier workflow tests remain in `b2b_store_dev`. Removing them would require disabling immutability triggers, which
was not done. Options: keep them as labelled test data, or rebuild the development database from migrations and seed (needs
the owner's approval).

## F. Decisions awaiting the owner

See `IMPLEMENTATION_DECISIONS.md` section B. The most important commercial decisions are: shipping fee values, courier
identities and agreements, the cancellation and merge rules after preparation starts, backup retention, the SMS provider,
whether to rotate the development password, and whether to rebuild the development database.

## Open items after the final verification run (2026-11-13)

- **SMS provider:** the HTTP adapter is tested against a local fake server only. No provider is configured; production refuses to start with OTP_PROVIDER=sms until SMS_PROVIDER_URL and SMS_PROVIDER_API_KEY are set (owner input).
- **Per-IP order limit:** not implemented. Checkout is limited per customer (10 per hour), and login and OTP are limited per IP and per account.
- **Backup scheduling:** `npm run backup:job` works, but the daily Windows Task Scheduler task is not registered (owner action; see docs/SCHEDULING.md).
- **PDF export:** the renderer and route are written, but the route has not been exercised end to end in a browser.
- **Fee values and periodic import source (OPS-003, OPS-004):** owner input required; not invented.
- **Fulfillment queue cap:** 50 per page with pagination; very large backlogs need the next page to be reached, and the queue is not exported.
- **Test suite notes:** Arabic amounts render as `د.ع`, and browser tests accept either label. The E2E checkout limit is reset per UI order on the test database; the limit itself is covered by integration tests.
