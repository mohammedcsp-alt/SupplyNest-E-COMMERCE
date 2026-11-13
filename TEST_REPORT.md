# Test report (verified results)

Last full verification: 2026-11-13 (local machine, Windows 11, Node 24.21, PostgreSQL 16 in Docker container
`b2b-store-postgres` on 127.0.0.1:5440). Databases: `b2b_store_dev` (development) and `b2b_store_test` (tests only).
No WMS system, port, database or credential was accessed. Results below come from commands run in this pass; anything
marked "agent-reported" was produced by a subagent and was not re-run by me.

## 1. Summary

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS (exit 0) |
| Unit, integration and concurrency (vitest) | `npx vitest run` | PASS: **30 files, 231 tests**, 0 failed (final run, 2026-11-13) |
| Browser and API end-to-end (Playwright) | `npx playwright test` | PASS: **112 results, 0 failed** (105 tests: api 37, desktop Arabic RTL 34, mobile English LTR 34; plus 7 sign-in setup steps; final run, 2026-11-13) |
| Production build | `NEXT_DIST_DIR=.next-build npx next build` | PASS |
| Production server smoke | `node server.mjs` (earlier session) | Earlier run: GET returns 200; TRACE returns 405 from server.mjs. **Not repeated in the final run.** |
| Development server | `npm run dev` on 127.0.0.1:3200 | Serves pages and APIs (checked with curl) |
| Backup and restore (independent) | API run + restore test; manual restore | PASS (§4) |
| Concurrency and load (controlled) | vitest `tests/load` | PASS, 5 tests (§5) |

Browser tests were executed in two projects: `desktop-arabic-rtl` (1280×800, Arabic, RTL) and `mobile-english-ltr`
(Pixel 5 profile, English, LTR). Each browser test below runs in both projects unless stated.

## 2. Unit and integration tests (vitest, 231 tests in 30 files)

| File | Area | Tests |
|---|---|---|
| `tests/unit/money.test.ts` | IQD integer money | 4 |
| `tests/unit/phone.test.ts` | Iraqi mobile normalization | 11 |
| `tests/unit/settlement-math.test.ts` | NET_DEDUCTION / GROSS_REMITTANCE arithmetic | 9 |
| `tests/unit/passwords-and-images.test.ts` | scrypt hashing, password policy, image magic-byte sniffing | 4 |
| `tests/unit/table-parse.test.ts` | CSV/XLSX reader, Arabic header aliases | 4 |
| `tests/unit/http-guards.test.ts` | Same-origin (CSRF) check, Idempotency-Key, JSON size limit | 5 |
| `tests/unit/export-safe.test.ts` | Spreadsheet formula neutralization, CSV BOM | 3 |
| `tests/unit/fulfillment-visibility.test.ts` | Picker's shortage reason hidden from checker until counted | 10 |
| `tests/integration/identity-and-prices.test.ts` | Registration, OTP, approval, suspension, price isolation | 13 |
| `tests/integration/checkout-and-inventory.test.ts` | Last-unit checkout race, idempotency, price consent, shipping rule, reservations, edits, reorder | 20 |
| `tests/integration/imports.test.ts` | Atomic import, freshness gates, manager override, double-commit claim, stock conflict, price import | 9 |
| `tests/integration/fulfillment-and-accounting.test.ts` | Picker ≠ checker, discrepancy hold, handover, invoices, NET/GROSS, allocations, reversals, immutability | 12 |
| `tests/integration/db-guards-and-rate-limits.test.ts` | Append-only audit, 10-image trigger, non-negative stock CHECK, one open alert per type, rate limits | 9 |
| `tests/integration/models-and-cms.test.ts` | Optional product models (general-purpose catalog), banner update and deactivate, CMS page delete rules | 8 |
| `tests/load/concurrency.test.ts` | Concurrency (§5) | 5 |

## 3. Browser and API end-to-end tests (Playwright, 105 tests + 7 setup steps)

The E2E server runs on port 3210 against the test database. The global setup clears transient rate-limit rows and
tops up the shared test SKU's stock (test database only). Each signed-in role has its session saved once per run by a
setup step, which avoids exhausting the per-account sign-in limit (5 per 15 minutes).

| File | Scope | Tests |
|---|---|---|
| `api-security.spec.ts` | Anonymous visitors see no prices; price endpoint 401 anonymous; admin/staff APIs 401/403; manager reaches admin API; per-IP login limit 429; cross-origin write 403; form-encoded write rejected; checkout needs Idempotency-Key; security headers | 12 (api) |
| `api-hardening.spec.ts` | Session cookie flags; no hash/token in login response; logout revokes session; generic login errors; OTP limit per phone (known or unknown); cross-customer order 404; price endpoint cannot be steered to another level; customers refused admin APIs; mass-assignment refused; SQL-like input treated as data; reflected HTML escaped; malformed JSON clean 400; oversized body refused; traversal and unknown media ids 404; secrets and storage not served; upload refuses SVG, HTML, oversized, accepts real PNG; security headers; no X-Powered-By | 24 (api) |
| `ui-customer-flow.spec.ts` | Visitor sees no price; approved customer sees price, adds to cart, places COD order | 2 (browser) |
| `ui-layout.spec.ts` | Document direction and language; language toggle flips direction; no horizontal overflow; navigation reachable | 4 (browser) |
| `ui-orders.spec.ts` | Cancellation request, manager approval cancels, second approval refused, reason required; reorder copies lines to cart | 3 (browser) |
| `ui-admin-catalog.spec.ts` | Create SKU through the form; change LEVEL_A price; upload PNG; refuse non-image upload (server-checked) | 3 per project |
| `ui-admin-imports.spec.ts` | Valid import previewed, committed, SKU exists; invalid row shown and blocked; stale file needs manager reason | 3 per project |
| `ui-admin-orders.spec.ts` | Customer cancellation request shows status and approve/reject controls | 2 per project |
| `ui-admin-reservations.spec.ts` | Manager extends then releases a reservation; second release refused | 1 per project |

Per-project browser totals: customer flow 2, layout 4, orders 3, admin 9 (18 across both projects). Setup steps are counted separately.

### Defects found by the E2E runs and fixed

1. **Language toggle did not switch direction.** Redirect used an absolute URL that could name `localhost`, dropping the
   locale cookie. Fixed: relative `Location` header (`src/app/api/v1/locale/route.ts`).
2. **Order edit crashed when a line was removed with a pending fulfillment job.** Fixed (`src/modules/commerce/orders.ts`).
3. **Unique-constraint violations returned 500.** Now 409 (`src/lib/api.ts`).
4. **Accountant lacked adjustment approval in the development database.** Seed re-applied.
5. **Success messages disappeared after a form submitted.** The form reloaded or navigated and lost the message. Fixed:
   the message is kept in session storage and shown after the reload or navigation (`src/components/forms.tsx`).
6. **Malformed identifiers returned 500.** A non-UUID path segment reached the database and failed. Now 404 (`src/lib/api.ts`).
7. **OTP per-phone limit only counted known phones.** Unknown numbers could be probed without limit. Now every number
   counts, with the same response either way (`src/app/api/v1/auth/otp/request/route.ts`).
8. **Checker could see the picker's shortage reason before counting** (violates independent checking). Fixed in the job
   page and job API; rule in `src/modules/fulfillment/visibility.ts`; unit-tested.
9. **Banner activation was allowed with content-edit rights only,** while creation required publish rights. Activation
   and re-dating now require publish rights (`src/app/api/v1/admin/cms/banners/[id]/route.ts`).
10. **Concurrency test helper had a type error.** Fixed (`tests/load/concurrency.test.ts`).

## 4. Backup and restore (independent rerun)

- Backup through the manager API (`POST /api/v1/admin/backup/run`): status SUCCEEDED, SHA-256 recorded.
- Restore test through the API (`POST /api/v1/admin/backup/restore-test`): PASSED, no row-count mismatches; the scratch
  database `b2b_store_restore_scratch` was dropped afterwards.
- Independent check: recomputed the dump's SHA-256 (matches the recorded value) and restored it by hand into a separate
  scratch database `b2b_manual_restore_check`. Row counts matched the development database for `users` (18), `orders` (3),
  `order_items` (3), `product_skus` (33), `tier_prices` (66), `inventory_balances` (33). `audit_logs` differed by two
  rows (64 in the dump vs 66 live), which are the login and backup audit rows written after the dump was taken. The
  scratch database was dropped.
- Only the development and scratch databases in the isolated container were touched.

## 5. Concurrency and load (controlled, small scale)

Run against the test database, through the real services, with simultaneous callers.

| Scenario | Callers | Result | Timing (this machine) |
|---|---|---|---|
| Checkout for 10 units | 15 simultaneous | Exactly 10 succeed; reserved = 10 = physical limit | 773 ms |
| Same Idempotency-Key | 20 simultaneous | Exactly 1 order and 1 reservation | 163 ms |
| Multi-SKU checkout | 12 simultaneous, 3 SKUs | No SKU oversold; reservations match reserved counts | 328 ms |
| Collection of one shipment | 5 simultaneous | Exactly 1 collection recorded | 72 ms |
| Allocation from one transfer | 12 simultaneous (transfer 30,000) | 4 accepted; total 28,000; never above 30,000 or per-shipment due | 319 ms |

Limits: the largest run used 20 simultaneous callers, well below the 50-user design target. No sustained-load, soak or
HTTP-level load test was run. Timings are measurements on this machine, not performance guarantees.

## 6. Internal security testing (NOT an independent review)

The security checks listed in §3 (`api-security`, `api-hardening`) cover authentication, session cookies, logout,
generic errors, rate limits, object ownership, mass assignment, input validation, file upload restrictions, secrets
exposure and security headers. They are internal tests and do not replace an independent security review.

**Open finding (framework-level):** the HTTP method `TRACE` returns a 500 error page. The runtime rejects `TRACE` before
application code runs ("'TRACE' HTTP method is unsupported"), so no application-level fix is possible. In the production
build the body is the generic `500: Internal Server Error` page with no stack trace. In the development server the body
includes diagnostic detail, which is expected there. A reverse proxy in front of the app should refuse `TRACE` with 405.
The test asserts only that `TRACE` is not a success.

## 7. Development database

- Removed agent-generated QA rows earlier (category, SKU, CMS page, banners, governorate, staff account, backup records)
  and, in this pass, the QA-AGENT banner and model (`scripts/cleanup-agent-residue.ts`, guarded by database name).
- Not removed: three orders, three fulfillment jobs, two courier shipments, their immutable financial rows, and one live
  reservation from earlier workflow runs. Removing them would require disabling immutability triggers, which was not done.

## 8. Not verified

- Visual regression and accessibility beyond the checks above.
- Printing and PDF output in a real browser (print views exist; not exercised in a browser).
- Behaviour on physical devices and older browsers.
- Load beyond 20 simultaneous callers, soak tests, and HTTP-level load tests.
- The production server behaviour for flows other than the smoke checks listed above.
- Independent security review (not performed).

## 7. Final verification run (2026-11-13)

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS |
| Vitest (full) | `npx vitest run` | PASS: 30 files, 231 tests |
| Playwright (full) | `npx playwright test` | PASS: 112 results (105 tests + 7 setup), 0 failed |
| Production build | `NEXT_DIST_DIR=.next-build npx next build` | PASS |
| Backup job (dev database) | `npm run backup:job` | SUCCEEDED, checksum recorded, no pruning needed |
| Restore verification (scratch database only) | `npm run restore:test` | PASSED; row counts match; no mismatches |

Fixes made during this run (verified by the rerun above):
- Fulfillment queue: packers now see CHECKED, PACKING and PACKED jobs; the list is paginated (50 per page, newest first), with search by order number or job ID, a sort-direction control and an assignee filter. Display only; job workflow priority is unchanged.
- Handover success message is shown on the job page after the form redirects (the form unmounts once the job is handed over).
- Test harness: browser steps wait for hydration after page loads (an unhydrated form submits natively and drops input). The shared customer's checkout limit is cleared before each UI order on the test database only. Manager API calls reuse the saved session instead of logging in per test.
- Startup safety: `src/instrumentation.ts` calls `assertProductionSafe()`, so production refuses mock OTP, SMS without credentials, and the WMS flag.

Requirement tests added in this run: `tests/integration/req-*.test.ts`, `tests/unit/req-*.test.ts`, `tests/unit/part-*.test.ts`, `tests/integration/part-abuse.test.ts`, `tests/integration/req-queue.test.ts`.
