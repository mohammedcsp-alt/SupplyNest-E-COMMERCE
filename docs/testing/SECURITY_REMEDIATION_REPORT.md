# Security Remediation Report (2026-11-18)

Status classes used below:
- **FIXED AND VERIFIED**: changed in code and the change has passing automated tests.
- **IMPLEMENTED BUT NOT VERIFIED**: changed in code, but the live path (browser, Tailscale Serve, second device) has not been tested.
- **BLOCKED — USER ACTION REQUIRED**: needs you or the tester.
- **NOT STARTED**: not begun.

Nothing here is claimed as passed on the shared remote environment. Automated results come from the test database.

## 0. Summary

| Issue | Status |
|---|---|
| SEC-001 Network isolation | **BLOCKED — USER ACTION REQUIRED** (tailnet ACL and firewall decisions; Serve not enabled) |
| SEC-002 Trusted proxy and IP rate limiting | **FIXED AND VERIFIED** (automated); live path IMPLEMENTED BUT NOT VERIFIED |
| SEC-003 Secure cookies and UAT configuration | **FIXED AND VERIFIED** (automated); HTTPS path IMPLEMENTED BUT NOT VERIFIED |
| SEC-004 Owner and admin tester accounts | Owner: **verified in database**. Privilege ceiling: **FIXED AND VERIFIED** (automated). Tester account: **BLOCKED — USER ACTION REQUIRED** (matrix approval) |
| SEC-005 Test side effects and data isolation | **FIXED AND VERIFIED** (automated) |
| Authenticated security tests (section 6) | Automated: **PASS** on the test database. Browser and two-account runs: **BLOCKED — USER ACTION REQUIRED** |
| Testing scope revision (section 8) | **FIXED AND VERIFIED** (documents). Phases 1 and 2 authorized; 3 to 5 not started |
| Admin module inventory (section 9) | **FIXED AND VERIFIED** (code and tests). UI browser pass **NOT STARTED** |
| Remote setup (section 10) | **BLOCKED — USER ACTION REQUIRED** (Serve, tester invite, friend's device verification) |

Automated results (2026-11-18, final run):
- Typecheck `npx tsc --noEmit`: PASS (exit 0)
- Unit `npx vitest run tests/unit`: **156 of 156 PASS** (17 files)
- Integration `npx vitest run tests/integration`: **158 of 158 PASS** (21 files, test database)

---

## 1. SEC-001: Network isolation

| Field | Content |
|---|---|
| Root cause | Windows Firewall allows inbound SMB, NetBIOS, RPC and printer-sharing on the **Private** profile. The Tailscale adapter is on the Private profile. AnyDesk (7070) listens on all interfaces. Tailnet ACL not verified. |
| Severity | High |
| Resolution | No change applied. Proposal written: `NETWORK_ISOLATION_PROPOSAL.md` (ACL policy, interface-scoped firewall block, rollback, verification plan). |
| Files changed | `docs/testing/NETWORK_ISOLATION_PROPOSAL.md` (new). Nothing else. |
| Security impact | Until the ACL is restricted to `tcp:443`, a tester could reach SMB and RPC on this PC over Tailscale. |
| Automated results | Not applicable |
| Manual results | Not run. Firewall read-only checks were done (non-admin): rules listed above. |
| Required owner participation | (1) Read the tailnet ACL and apply the policy in the proposal (N-1). (2) Decide on the firewall block (N-2). (3) Decide on AnyDesk (N-3). Administrator PowerShell needed for N-2. |
| Remaining blockers | ACL not readable by the assistant. Serve not enabled, so the allowed path cannot be verified. |
| Rollback | Firewall: `Get-NetFirewallRule -DisplayName "SupplyNest-Tailnet-Block*" | Remove-NetFirewallRule` (only if applied). ACL: restore the previous policy from the admin console history. |

## 2. SEC-002: Trusted proxy and IP-based rate limiting

| Field | Content |
|---|---|
| Root cause | `clientIp()` (`src/lib/api.ts`) took the first `X-Forwarded-For` value the client sent. The login and OTP limits are keyed on that value, so a client could rotate it and bypass them. |
| Severity | High |
| Resolution | The TCP peer decides trust. Only peers in `TRUSTED_PROXY_ADDRESSES` (default: loopback) may supply forwarding headers. For a trusted peer the client IP is the **rightmost** valid `X-Forwarded-For` entry. Malformed chains go to the shared bucket `unknown`. Direct requests use the socket address. `server.mjs` overwrites `x-b2b-client-ip` and `x-b2b-scheme` on every request and strips forwarding headers from untrusted peers. `clientIp()` reads only the overwritten header. Rate-limit rules are unchanged. |
| Files changed | `lib-server/client-trust.mjs` (new); `server.mjs`; `src/lib/api.ts` (`clientIp`, `requestScheme`, origin check); `src/app/api/v1/auth/login/route.ts` |
| Security impact | Login per-IP limit (10 per 15 min) and per-account limit (5 per 15 min) can no longer be bypassed by changing headers from a remote client. Residual: local code on this PC is inside the trust boundary (BUG-SEC-006). |
| Automated results | `tests/unit/client-trust.test.ts`: 21 PASS (forged `X-Forwarded-For`, multiple headers, malformed IPs, direct local, trusted proxy, untrusted proxy, rotation does not create buckets). `tests/integration/sec-remediation.test.ts`: repeated attempts hit the limit at attempt 11; a second IP is not blocked by the first. |
| Manual results | Not run. Requires Serve (see section 10). |
| Required owner participation | Enable Serve. Confirm what Serve sends (see section 10 verification list). |
| Remaining blockers | Serve header behaviour not yet observed. The assumption "Serve appends its client address to `X-Forwarded-For`, or overwrites it" must be checked live. If Serve sends a different header, `client-trust.mjs` must be adjusted and re-tested. |
| Rollback | Revert `server.mjs` and `src/lib/api.ts` `clientIp` to the previous commit version (`git diff` shows the change; the repository is uncommitted). |

## 3. SEC-003: Secure cookies and UAT configuration

| Field | Content |
|---|---|
| Root cause | `Secure` was set only when `NODE_ENV=production`. Production refuses mock OTP, so the UAT environment could not get `Secure` cookies. Origin check trusted `Host` and any `X-Forwarded-Host`. |
| Severity | Medium |
| Resolution | `sessionCookieOptions(expiresAt, scheme)`: `Secure` if production **or** the trusted proxy reported HTTPS. Plain local `http://127.0.0.1:3200` keeps working without `Secure`. `HttpOnly` and `SameSite=Lax` always. Origin check accepts the same host, or an origin on the explicit allow-list `APP_TRUSTED_ORIGINS` (validated at startup: bare http(s) origins only). `X-Forwarded-Host` only reaches the app from a trusted peer. Mock OTP guard unchanged. Session expiry and revocation unchanged. |
| Files changed | `src/lib/session.ts` (`sessionCookieOptions`, `currentUserForToken`); `src/lib/config.ts` (`APP_TRUSTED_ORIGINS`); `src/lib/api.ts` (origin check); `tests/setup/env.ts` (test-only trusted origin) |
| Security impact | Remote HTTPS sessions carry `Secure`. Origins outside the allow-list and host are refused with 403. |
| Automated results | `sec-remediation.test.ts`: cookie flags for http and https; same-host, trusted and evil origins. `authn-authz-remediation.test.ts`: session isolation, logout, expiry, malformed tokens. |
| Manual results | Not run. Requires Serve. |
| Required owner participation | Enable Serve. Set `APP_TRUSTED_ORIGINS=https://<owner-host>.<tailnet>.ts.net` in `.env` (owner action; not changed by the assistant because `.env` is secret-bearing and gitignored). |
| Remaining blockers | Serve not enabled. `APP_TRUSTED_ORIGINS` not yet set in `.env`. Login-redirect `Location` built by Next from the Host header (`/admin/login` → `/login?portal=admin`) not yet checked through Serve. |
| Rollback | Remove `APP_TRUSTED_ORIGINS` from `.env`. Revert the session and config edits. |

## 4. SEC-004: Owner and admin tester accounts

### 4.1 Owner account (Account A)

| Check | Result |
|---|---|
| Exists with the phone you gave (matched, not printed) | **Yes** (STAFF, ACTIVE) |
| Roles | **MANAGER only** (the system's owner role; all 53 permissions) |
| Registered as owner (`owner.account` setting) | **Yes**, points to this account |
| Duplicate created | **No** |
| Naming | The system has no role called `OWNER`. The owner role is `MANAGER` plus the `owner.account` setting. |

### 4.2 Privilege ceiling (root cause of escalation)

| Field | Content |
|---|---|
| Root cause | `createStaffUser` accepted any role name, including MANAGER. `setRolePermissions` did not check that the actor held the permissions it granted. Anyone with `role.manage` could mint a MANAGER account or grant itself any permission. Found by code review; not reproduced at runtime before the fix. |
| Severity | High |
| Resolution | Ceiling: an actor can grant only permissions it holds. MANAGER is assignable and editable by the owner only. The owner (`isOwnerAccount`) passes the ceiling. Each denial is written to the audit log as `security.escalation_denied`. Routes pass the actor's permissions and owner status. |
| Files changed | `src/modules/admin/grant-ceiling.ts` (new); `src/modules/admin/roles.ts`; `src/app/api/v1/admin/staff/route.ts`; `src/app/api/v1/admin/roles/[id]/route.ts`; `tests/integration/req-http.test.ts` and `req-ops.test.ts` (signature update for the new argument) |
| Security impact | A delegated admin cannot raise its own rights or create a MANAGER. |
| Automated results | `grant-ceiling.test.ts`: 15 PASS. `sec-remediation.test.ts`: 13 PASS (escalation refused, owner-only MANAGER, permitted assignment still works, audit rows, owner identification). |
| Manual results | Not run (live API as tester). |
| Required owner participation | Approve the tester role matrix (section 4.3). |
| Remaining blockers | See 4.3. |
| Rollback | Revert the four files above. |

### 4.3 Account B: ADMIN_TESTER (not created)

- **Not granted.** Matrix: `docs/testing/ADMIN_TESTER_PERMISSION_MATRIX.md` (36 of 53 codes granted; 17 withheld; 5 decisions D-1 to D-5).
- **BLOCKED — USER ACTION REQUIRED:** no endpoint creates a new role. Option A (insert-only operator script, recommended) or Option B (new endpoint) needs your choice. A database insert is a database-affecting change and needs your approval.
- Credentials: the tester chooses their own password after the owner sets a temporary one through a secure channel. No password is written to any file, chat or repository.
- The seeded `Dev Manager` account is not used.
- Interactive password steps are in section 4.4.

### 4.4 Password entry (for each of you, when approved)

1. **Owner:** open `http://127.0.0.1:3200/login?portal=admin`, sign in with your current owner password. Use `/account/password` to change it if you want a new one. Do not send the password anywhere.
2. **Owner, to create the tester:** `/admin/roles` → "Create staff user" → enter the tester's phone and name, pick the `ADMIN_TESTER` role (after creation), set a temporary password of at least 10 characters. Send it to the tester through a secure channel (not chat).
3. **Tester:** open the admin login page, sign in with the temporary password, then change it at `/account/password`.

## 5. SEC-005: Test side effects and data isolation

| Field | Content |
|---|---|
| Root cause | The unit-test `globalSetup` runs the seed against `TEST_DATABASE_URL` (`b2b_store_test`). The seed rewrote the gitignored `DEV-CREDENTIALS.local.md` on every run, whatever the target database. |
| Severity | Medium |
| Investigation result | The development database was **not** changed: counts before and after were the same (24 users, 3 orders, 59 sessions, 33 SKUs). The test database is separate. The credential sheet contains no password (it points to the secret file), so no secret was exposed. |
| Resolution | The credential sheet is written only when the seed's database name is `b2b_store_dev` (`shouldWriteCredentialSheet`). Test database names are refused. The test database guard (`tests/setup/testdb.ts`) is unchanged. |
| Files changed | `prisma/seed/credential-sheet.ts` (new); `prisma/seed/index.ts` |
| Dedicated UAT database | The shared UAT environment uses `b2b_store_dev`. The automated suite uses `b2b_store_test`. They are separate, so no new database was created and nothing was reset. |
| Automated results | `grant-ceiling.test.ts`: credential-sheet gate cases PASS. Run log confirms: `[seed] credential sheet not written (target is not the development database)`. |
| Remaining blockers | None for this item. Note: the dev database holds synthetic data and your owner account, not real customer data. |
| Rollback | Revert `prisma/seed/index.ts` and delete `prisma/seed/credential-sheet.ts`. |

## 6. Authenticated security tests

Automated against the test database (`tests/integration/authn-authz-remediation.test.ts`, 14 PASS; `sec-remediation.test.ts`, 13 PASS):

| Requirement | Automated result | Manual result |
|---|---|---|
| Owner login | Not automated separately; owner login service path is in `owner-account.test.ts` (PASS) | BLOCKED: owner enters the password in the browser |
| Authorized admin tester login | Staff login with the right password, admin portal (PASS) | BLOCKED: tester account not created |
| Invalid credentials | Wrong password and unknown phone: same generic message, no session (PASS) | Not run in browser |
| Session isolation | Two admins hold independent sessions; logout of one does not end the other (PASS) | Not run in browser |
| Role-based API access | Staff without permission cannot grant (PASS); customer and staff portal separation (PASS) | Not run (live API) |
| Unauthorized direct route access | Unauthenticated admin API → 401 (checked locally 2026-11-18) | Not run in browser |
| Privilege escalation prevention | PASS (section 4.2) | Not run (live) |
| Owner protection | Staff cannot be targeted by customer actions (NOT_FOUND); MANAGER owner-only; no staff status endpoint exists (verified by route inventory) | Not run |
| Logout isolation | PASS (service level) | Not run in browser |
| Session expiration | Expired session row resolves to nobody (PASS) | Not run in browser |
| Password recovery | Recovery with dev code resets password, revokes sessions, old password refused, unknown phone gives the same response (PASS) | Not run in browser |

Where credentials are needed for the browser runs, the tests are marked **BLOCKED** until you and the tester perform the steps in 4.4.

## 7. Revised testing scope

- Files preserved: all seven documents, the 76-case register, all recorded statuses and test IDs (`TEST-001` kept).
- Revised plan: `UAT_TEST_PLAN.md` section 9 (phases 1 to 5). Only Phases 1 and 2 are authorized.
- Admin-only register: `UAT_ADMIN_PHASE1_2_TEST_CASES.csv` (40 rows: 22 filtered from the original register, 18 new admin cases: 8 Phase 1 and 10 Phase 2).
- Bug register: `UAT_BUG_REGISTER.csv` (original 5 kept; statuses updated; 6 added).

## 8. Admin module inventory

See `ADMIN_MODULE_INVENTORY.md`. Summary: 20 modules in the inventory: 19 implemented (roles is implemented, with the gaps listed), 1 partial (integrations, by design); 3 missing features (create role, staff status change, staff password reset by admin). Browser UI not checked in this pass.

Defect found and fixed during the concurrency work: two admins creating the same SKU at once gave a raw database error at service level (BUG-ADM-001). Now a typed conflict. The HTTP layer already returned 409.

## 9. Concurrent administration (automated, test database)

`tests/integration/admin-concurrency.test.ts`, 4 of 4 PASS:
- Two administrators create the same SKU at once: one succeeds, the other gets CONFLICT. Only one row exists.
- The creating administrator is recorded as audit actor, with IP.
- Two administrators change the same tier price at once: both recorded in history; no silent overwrite.
- 20 concurrent +1 stock adjustments: each applied once (no lost update).

Not yet tested: simultaneous product creation of different SKUs; concurrent product edits by two admins; concurrent image uploads; duplicate double-click submissions; browser-level two-session runs. These are listed as NOT RUN in the admin register.

## 10. Remote setup

| Item | Status |
|---|---|
| Application startup | VERIFIED: status script (2026-11-18): Docker UP, DB accepting connections, website HTTP 200, supervisor running, scheduled task Running |
| Database availability | VERIFIED: `pg_isready` accepting connections |
| Persistent startup | VERIFIED configuration: scheduled task at sign-in and every 5 minutes. Requires your Windows sign-in (no change) |
| App independent of VS Code / Claude Code | VERIFIED by process chain: node's parent is the supervisor PowerShell (not VS Code or Claude Code). Not tested by closing the editors |
| Tailscale connectivity (this PC) | VERIFIED: online, IP <tailnet-ip> |
| Private HTTPS access | **BLOCKED — USER ACTION REQUIRED**: `tailscale serve` not enabled |
| Remote access verified from friend's computer | **NOT STARTED** (needs Serve, the invitation, the ACL) |
| Local Admin Login URL | `http://127.0.0.1:3200/login?portal=admin` (opened in your browser) |
| Admin login alias | `http://127.0.0.1:3200/admin/login` (redirects to the URL above) |
| Remote Admin Login URL (after Serve) | `https://<owner-host>.<tailnet>.ts.net/login?portal=admin` |

Verification list for when Serve is enabled (not yet done):
1. `tailscale serve --bg 3200`, then `tailscale serve status` shows the HTTPS proxy to `127.0.0.1:3200`.
2. Log in from this PC through the HTTPS URL. Check the `b2b_session` cookie: `Secure`, `HttpOnly`, `SameSite=Lax`.
3. Check the login page's `/admin/login` redirect `Location` uses the HTTPS host.
4. Check that a cross-origin POST is refused and the same-origin POST works (with `APP_TRUSTED_ORIGINS` set).
5. Check the forwarded headers Serve sends (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`). Adjust `client-trust.mjs` if Serve differs.
6. Confirm `tailscale funnel status` shows no funnel.

Friend's instructions: to be sent only after the URL works from this PC and from the friend's device. Not yet written for sending.

## 11. Files changed (uncommitted; nothing committed or pushed)

Code: `server.mjs`; `lib-server/client-trust.mjs` (new); `src/lib/api.ts`; `src/lib/config.ts`; `src/lib/session.ts`; `src/app/api/v1/auth/login/route.ts`; `src/modules/admin/grant-ceiling.ts` (new); `src/modules/admin/roles.ts`; `src/app/api/v1/admin/staff/route.ts`; `src/app/api/v1/admin/roles/[id]/route.ts`; `src/modules/catalog/admin.ts`; `prisma/seed/credential-sheet.ts` (new); `prisma/seed/index.ts`.

Tests: `tests/unit/client-trust.test.ts` (new); `tests/unit/grant-ceiling.test.ts` (new); `tests/integration/sec-remediation.test.ts` (new); `tests/integration/authn-authz-remediation.test.ts` (new); `tests/integration/admin-concurrency.test.ts` (new); `tests/integration/req-http.test.ts`, `req-ops.test.ts` (argument update); `tests/setup/env.ts` (test-only trusted origin).

Docs (`docs/testing/`): `ADMIN_TESTER_PERMISSION_MATRIX.md` (new); `ADMIN_MODULE_INVENTORY.md` (new); `NETWORK_ISOLATION_PROPOSAL.md` (new); `UAT_ADMIN_PHASE1_2_TEST_CASES.csv` (new); `SECURITY_REMEDIATION_REPORT.md` (new); updated `UAT_TEST_PLAN.md` (section 9 appended), `SECURITY_CHECKLIST.md` (section I appended), `UAT_BUG_REGISTER.csv` (statuses and 6 rows added).

Not changed: database schema and migrations; any existing data; Windows Firewall; Tailscale policy or Serve; `.env`; scheduled tasks; Docker containers; the computer (no restart).

## 12. Rollback (summary)

- Code: `git diff` lists every change (the repository was clean before this work; nothing committed). Revert the files in section 11.
- App: restart with `scripts\stop-local.ps1` then `scripts\start-local.ps1`.
- Remote access: `tailscale serve reset`.
- Firewall (only if applied): remove `SupplyNest-Tailnet-Block*` rules.
- ACL: restore the previous policy in the admin console.

## 13. Remaining blockers and owner actions

| # | Action | Who | Needed for |
|---|---|---|---|
| 1 | Enable Tailscale Serve (admin link: `https://login.tailscale.com/f/serve?node=<node-id>`) | Owner | Any remote access |
| 2 | Review the tailnet ACL and apply the policy in `NETWORK_ISOLATION_PROPOSAL.md` section 2 | Owner | Keeping the tester off SMB, RPC, AnyDesk |
| 3 | Decide on the firewall block (`NETWORK_ISOLATION_PROPOSAL.md` section 3), run it in an elevated PowerShell if approved | Owner | Defence in depth |
| 4 | Decide on AnyDesk exposure (N-3) | Owner | Public Wi-Fi exposure |
| 5 | Approve the tester permission matrix and decisions D-1 to D-5 | Owner | Tester account |
| 6 | Choose tester role creation: Option A (insert-only script) or Option B (new endpoint) | Owner | Tester account |
| 7 | Set `APP_TRUSTED_ORIGINS=https://<owner-host>.<tailnet>.ts.net` in `.env`, then restart the app | Owner | Cross-origin check and cookies through Serve |
| 8 | Sign in as owner in the browser (password entry) and run the owner browser tests | Owner | Phase 1 and 2 browser evidence |
| 9 | Invite the tester to the tailnet; the tester installs Tailscale and signs in | Tester | Remote access |
| 10 | Tester creates their password and runs the tester tests | Tester | Phase 1 and 2 evidence |
| 11 | Verify from the tester's device: allowed (HTTPS URL works) and denied (445, 139, 135, 80, 7070, 5440, 3200 direct) | Tester | Remote access sign-off |

Nothing else needs your participation for the automated work. The browser runs and the second-device checks are the remaining verification.
