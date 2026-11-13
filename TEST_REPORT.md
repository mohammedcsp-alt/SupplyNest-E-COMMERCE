# Test report (verified results)

Date of final verification: 2026-11-13 (Baghdad time, local machine). Environment: Windows 11, Node 24.21, PostgreSQL 16
in Docker container `b2b-store-postgres` on 127.0.0.1:5440. Databases: `b2b_store_dev` (development) and `b2b_store_test`
(tests only). No WMS system was contacted.

Only results listed here were produced by a command run during the final verification pass unless marked
"agent-reported".

## 1. Summary

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS (exit 0) |
| Unit + integration (vitest) | `npx vitest run` | PASS: 12 files, **103 tests**, 0 failed |
| Production build | `NEXT_DIST_DIR=.next-build npx next build` | PASS (compiled; all app routes generated) |
| Browser + API E2E (Playwright) | `npx playwright test` | PASS: **31 tests**, 0 failed (setup 1, API 12, browser 9 × 2 projects) |
| Route inventory | `node scripts/gen-openapi.mjs` | 106 routes written to `OPENAPI.yaml` |

## 2. Unit and integration tests (vitest, 103 tests)

| File | Area | Count |
|---|---|---|
| `tests/unit/money.test.ts` | IQD integer money, exact arithmetic, formatting | 4 |
| `tests/unit/phone.test.ts` | Iraqi mobile normalization | 11 |
| `tests/unit/settlement-math.test.ts` | NET_DEDUCTION / GROSS_REMITTANCE math, adjustments, aggregates | 9 |
| `tests/unit/passwords-and-images.test.ts` | scrypt hashing, password policy, image magic-byte sniffing | 4 |
| `tests/unit/table-parse.test.ts` | CSV/XLSX reader, Arabic header aliases | 4 |
| `tests/unit/http-guards.test.ts` | Same-origin (CSRF) check, Idempotency-Key, JSON size limits | 5 |
| `tests/unit/export-safe.test.ts` | Spreadsheet formula neutralization, CSV BOM | 3 |
| `tests/integration/identity-and-prices.test.ts` | Registration, OTP limits, approval, suspension, price isolation (ACX-01, T001–T006) | 13 |
| `tests/integration/checkout-and-inventory.test.ts` | Concurrent last-unit checkout (ACX-02), idempotency and duplicate submission (T024), price-change consent (ACX-06), shipping rule missing (T027), reservations expiry and exactly-once release (ACX-03, ACX-08), order edits, reorder, holds | 20 |
| `tests/integration/imports.test.ts` | Atomic import (T014), duplicates, absent SKUs unchanged (PRODUCT-002), freshness gates (ACX-04), manager-only override, double-commit claim, stock-conflict alert, price import | 9 |
| `tests/integration/fulfillment-and-accounting.test.ts` | Picker ≠ checker, discrepancy hold and resolution, handover consumes accepted quantity only, invoice revisions, NET and GROSS settlement, over-allocation refused, fee payment limits, rejection and reversal, immutable posted rows | 12 |
| `tests/integration/db-guards-and-rate-limits.test.ts` | Append-only audit log, 10-image trigger (T008), non-negative stock CHECK, one open alert per type, invoice uniqueness, rate-limit atomicity | 9 |

Total: 40 unit + 63 integration = 103. All passed.

## 3. Browser and API E2E tests (Playwright, 31 tests)

Run against a separate dev server on port 3210 using `.env.test` (test database) and build directory `.next-test`.
The global setup deletes only the transient `security_rate_limits` table in the test database.

| Project | Tests | Result |
|---|---|---|
| setup (`auth.setup.ts`) | 1 — UI sign-in of the approved customer, session saved | PASS |
| `api` (`api-security.spec.ts`) | 12 — anonymous catalog has no price fields; price endpoint 401; admin and staff APIs 401 anonymous and 403 customer; manager reaches admin API; per-IP login limit returns 429; cross-origin write 403; form-encoded write rejected; checkout without Idempotency-Key refused; security headers | PASS (12) |
| `desktop-arabic-rtl` (`ui-*.spec.ts`) | 9 — layout direction (RTL), language toggle flips direction, no horizontal overflow, navigation reachable; visitor sees no price; approved customer sees price, adds to cart, places COD order; cancellation request then manager approval cancels the order, required reason; reorder copies lines back to cart | PASS (9) |
| `mobile-english-ltr` (`ui-*.spec.ts`) | 9 — the same nine tests in English LTR on a Pixel 5 viewport | PASS (9) |

### Defects found by the E2E run and fixed in this pass

1. **Language toggle did not switch direction (real bug).** The locale route redirected to an absolute URL built from the
   request, which could name `localhost` rather than `127.0.0.1`; the browser then dropped the language cookie.
   Fixed: `src/app/api/v1/locale/route.ts` now returns a relative `Location` header.
2. **Browser sessions were not saved for later tests.** Fixed by a single UI sign-in in a setup project that writes
   the storage state, with later tests reusing it (`tests/e2e/auth.setup.ts`, `playwright.config.ts`).
3. **Repeated sign-ins hit the login rate limit** (5 per account per 15 minutes), which is the intended control.
   The E2E global setup now clears the transient rate-limit table in the test database before each run.
4. **Cancellation assertion raced a page reload.** The order form reloads the page on success, so the test now asserts
   the resulting state rather than the transient message.
5. **Accountant role missing `finance.adjustment.approve`** in the development database. Fixed by re-running the
   idempotent seed (the code already granted it).
6. **Unique-constraint violations returned 500.** They now map to 409 CONFLICT (`src/lib/api.ts`).
7. **Order edit that removed a line crashed** (pick lines referenced the removed item). Fixed in
   `src/modules/commerce/orders.ts`; covered by an integration test.

## 4. Development database cleanup

Only test-generated rows with explicit QA markers were removed (script `scripts/cleanup-test-data.ts`, which checks
dependencies and aborts if any are found). Removed: QA category, QA SKU (unpublished, no orders or reservations), QA
CMS page, two QA banners, QA governorate `QA_GOV_4141` and its rules, the QA staff account created by the admin test
run, and the two backup run records with their dump file.

**Not removed (by design):** 3 orders, 3 fulfillment jobs, 2 courier shipments and 1 live reservation created by the
earlier workflow tests. The shipments are linked to immutable financial rows (collections, adjustments, remittances,
fee payments) that database triggers protect. Removing them would require disabling those triggers, which I did not do.
Options: keep them as labelled test data, or rebuild the development database from migrations and seed (needs your
approval).

## 5. Verification reported by subagents (not independently re-run in this pass)

These were run by the admin and fulfillment/accounting agents with curl against the development server. I did not re-run
them, so treat them as agent-reported:

- Manager can open all admin pages; customer and report viewer are refused; prices are hidden from users without
  `price.view`; settings range validation; MANAGER permission removal refused (409); staff creation and login.
- CSV and XLSX report exports include a SHA-256 checksum and write an audit row.
- Image upload, serving and deletion; order hold on and off.
- **Backup run and restore test against the real Docker container: reported PASSED**, scratch database dropped.
  (Its dump file was later removed by the cleanup above.)
- Fulfillment workflow via API: same-person assignment refused; short pick without reason refused; checker payload
  omits picked quantities; discrepancy hold; picker cannot resolve; handover (NET) produced expected COD 19,000 = 15,000
  goods + 4,000 delivery; over-allocation refused.

## 6. Not verified

- Browser interaction with the admin forms, import panel, image upload, reservation actions, lock-for-preparation,
  cancellation approve or reject from the browser, and the stale-file override path.
- Printing and PDF output in a real browser.
- Load and concurrency beyond two to four simultaneous requests (no load test was run).
- Accessibility beyond the automated checks listed here.
- Any physical device, older browsers, and any external integration (none exists).
