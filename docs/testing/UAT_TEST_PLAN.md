# UAT Test Plan: SupplyNest B2B-STORE (private remote testing)

Scope: the functionality that exists in the current project. Missing functionality is marked NOT APPLICABLE in
`UAT_TEST_CASES.csv`, not implemented.

## 1. Roles and people

| Role | Who | Account | Permissions |
|---|---|---|---|
| System Owner / Administrator | Project owner (computer host) | Staff, MANAGER role | Full admin, approvals, settings, audit |
| Remote Tester / Customer | Invited friend | Own customer account, self-registered | Customer only |
| Optional staff tester | Created by owner, only if admin-side testing is needed | Staff account with one limited role, e.g. ORDER_OPERATOR | Only that role's permissions |

Rules:
- Owner credentials are never shared.
- Synthetic data only: fake names, fake phone numbers (not used by real people), no real addresses, no payments.
- The environment is a private test environment. The development banner states this.

## 2. Environment

- One application instance: `http://127.0.0.1:3200` locally; `https://<owner-host>.<tailnet>.ts.net` for the tester
  after activation (`REMOTE_TESTING_SETUP.md`).
- One database: `b2b_store_dev` in container `b2b-store-postgres`. Shared by both testers.
- Mock OTP. The code is shown on screen as DEV CODE. No SMS leaves the machine.
- Cash-on-delivery only. No payment gateway. No email or SMS sender.

## 3. Phases and entry criteria

| Phase | Content | Entry criteria |
|---|---|---|
| 0. Readiness | Status script, backup, security checks | Done 2026-11-18 (see section 6) |
| 1. Remote access | Serve enabled, ACL restricted, tester invited | Owner completes `REMOTE_TESTING_SETUP.md` section 4 |
| 2. Single-user smoke | Owner runs P1 tests end to end on the remote URL | Phase 1 done. Owner confirms the Origin check works through Serve (UAT-SEC-003) |
| 3. Collaborative functional | Tester and owner run `UAT_TEST_CASES.csv` in parallel: auth, customers, products, orders | Phase 2 passed |
| 4. Concurrency | UAT-CON cases, two browsers, timed | Phase 3 P1 cases passed or bugs logged |
| 5. Security | UAT-SEC cases, tester attempts only the allowed surface | Phase 4 done |
| 6. Reliability | UAT-REL cases; owner approves each disruptive step | Phase 5 done. Owner gives explicit approval per step |
| 7. Sign-off | Acceptance criteria in `UAT_ACCEPTANCE_CRITERIA.md` | All P1 closed or accepted |

## 4. Execution rules

1. Record each result in `UAT_TEST_CASES.csv`: Actual result, Tester, Status, Date. Use only the statuses NOT RUN, PASS,
   FAIL, BLOCKED, RETEST, NOT APPLICABLE.
2. Each failure gets a bug in `UAT_BUG_REGISTER.csv` with a new BUG-<area>-<nnn> ID. The Related bug ID column in the test case
   is then filled in.
3. Retest a fixed bug by setting the test to RETEST, then PASS or FAIL.
4. Never reset, drop, truncate or delete data in the shared database. Test records are kept as evidence. If data must
   be removed, the owner decides, after a backup.
5. Announce code changes before making them, because the server hot-reloads.
6. Testers do not change system settings, roles or pricing unless the test case says the owner performs it.
7. Do not run load or denial-of-service tests. Concurrency tests are small and manual.
8. Do not publish results or create GitHub issues without owner approval.

## 5. Coverage map

| Area | Test IDs | Count |
|---|---|---|
| Authentication (including existing TEST-001) | TEST-001, UAT-AUTH-001 to 016 | 17 |
| Customer management | UAT-CUS-001 to 006 | 6 |
| Product management | UAT-PRD-001 to 013 | 13 |
| Orders | UAT-ORD-001 to 016 | 16 |
| Concurrency | UAT-CON-001 to 005 | 5 |
| Security | UAT-SEC-001 to 012 | 12 |
| Reliability | UAT-REL-001 to 007 | 7 |

Total: 76 test cases (CSV rows).

## 6. Readiness results (2026-11-18)

| Check | Result |
|---|---|
| Git working tree before changes | Clean (no uncommitted work to preserve) |
| Application health | HTTP 200 on /api/health |
| Database | Accepting connections; 5 migrations applied |
| Pre-change backup | `storage\backups\pre-remote-uat-20261118-191507.sql` |
| Typecheck (`tsc --noEmit`) | See section 7 |
| Unit tests (`vitest run tests/unit`) | See section 7 |
| Local role enforcement (unauthenticated) | PASS: admin and customer APIs return 401 |
| Local CSRF origin check | PASS: cross-origin POST returns 403 |
| Local headers | PASS: X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, no-store |
| Remote access | NOT READY: Serve not enabled on the tailnet |
| Authenticated role tests | NOT RUN: tester-driven (see section 8) |

## 7. Automated test results

| Run | Command | Result (2026-11-18) |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS (exit 0, no errors) |
| Unit tests | `npx vitest run tests/unit` | PASS: 15 files, 120 tests, exit 0 |
| Integration / E2E | Not run | Not run in this session. E2E uses `b2b_store_test` (separate DB on the same container) and is not required for UAT |

Side effect to know about: the vitest `globalSetup` runs `prisma migrate deploy` and the synthetic seed against
`TEST_DATABASE_URL` (`b2b_store_test`, a separate database). This did not change the shared dev database
(`b2b_store_dev`: still 24 users, 3 orders, 59 sessions, 33 SKUs before and after). The seed also rewrote the gitignored
file `DEV-CREDENTIALS.local.md`. Its contents were not reviewed here.

## 8. Items that need the owner or the tester

| Item | Who | Why |
|---|---|---|
| Enable Tailscale Serve (admin link) | Owner | Tailnet admin only |
| Invite the tester; restrict the ACL | Owner | Tailnet admin only; the assistant cannot verify ACL policy |
| Create the tester's customer account | Tester (self-registration) | Realistic flow; requires owner approval after |
| Approve, price-level and suspend tests | Owner | Staff action |
| Authenticated role-enforcement checks | Tester (customer) and owner (staff) | The assistant did not use seeded passwords |
| Session expiry test | Owner | Requires time or DB change |
| Process kill, DB stop, Tailscale restart, Windows restart | Owner | Disruptive; owner approves each |

## 9. Revised phase structure (2026-11-18)

Section 3 above is kept for history. It is superseded by this section.

| Phase | Name | Scope | Status (2026-11-18) |
|---|---|---|---|
| 1 | Admin Dashboard functional testing | Admin modules only: Customers, Catalog and SKUs, Inventory, Orders (admin side), Imports, Reports, CMS, Roles (read), Audit log. Admin authorization checks. Rows with Phase = "Phase 1" in `UAT_ADMIN_PHASE1_2_TEST_CASES.csv` | **AUTHORIZED. Not started in a browser.** Blocked for the tester until the owner approves `ADMIN_TESTER_PERMISSION_MATRIX.md` and Tailscale Serve is enabled |
| 2 | Concurrent administration testing | Two independent administrator sessions: duplicate SKU, concurrent price and stock changes, image uploads, session isolation, audit attribution. Rows with Phase = "Phase 2" | **AUTHORIZED. Automated evidence exists for 4 scenarios (test database). Manual two-session runs NOT STARTED** |
| 3 | Customer-facing testing | Customer registration, login, catalog, cart, checkout, order tracking, customer-side security | **NOT AUTHORIZED. Not started** |
| 4 | Admin–Customer integration testing | Approvals and price levels seen by customers, orders moving from customer to admin, stock effects end to end | **NOT AUTHORIZED. Not started** |
| 5 | Final regression and acceptance | Full register, acceptance criteria, reliability, remote access from the friend's device | **NOT AUTHORIZED. Not started** |

### 9.1 What the original register contains

- `UAT_TEST_CASES.csv` (76 cases) is the full register. Nothing was deleted and no recorded status was changed.
- Admin-only views are in `UAT_ADMIN_PHASE1_2_TEST_CASES.csv`. Customer-facing cases stay in the full register and are
  marked deferred to Phase 3 or 4 by this plan.
- `UAT_BUG_REGISTER.csv` keeps every original row. Statuses were updated, and new rows were added (BUG-SEC-004 to 006,
  BUG-ADM-001 to 003). Fixed items are marked FIXED AND VERIFIED (automated) only where a test ran.

### 9.2 Rules for Phases 1 and 2

1. Use only synthetic records. Do not use real customer or business data.
2. The tester uses only the ADMIN_TESTER account, after approval. The owner account is used by the owner only.
3. Automated results come from the test database. They are recorded as such and do not count as UAT-environment results
   until the same scenario is run by hand on the shared environment.
4. Manual tests are marked PASS only with evidence (screenshot, response, audit row). Nothing is marked PASS from
   expectation.
5. Before any elevated permission is granted, the owner approves the permission matrix.
