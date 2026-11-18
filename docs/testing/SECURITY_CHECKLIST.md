# Security Checklist: Private Remote UAT

Status key: **PASS** (verified by a command or request run on 2026-11-18), **CODE-VERIFIED** (confirmed by reading the code,
not exercised at runtime), **PENDING** (needs the remote path or an authenticated session), **OPEN** (weakness, see
`UAT_BUG_REGISTER.csv`), **N/A**.

## A. Network exposure

| ID | Check | Status | Evidence / Notes |
|---|---|---|---|
| S-01 | App bound to loopback only | PASS | `server.mjs` uses `hostname = 127.0.0.1`. Listener check: `127.0.0.1:3200` only |
| S-02 | PostgreSQL not reachable from tailnet or LAN | PASS | Docker publishes `127.0.0.1:5440->5432`. No listener on other addresses |
| S-03 | Other local ports (5432 WMS DB, 8333 WMS object store) not exposed by this project | PASS (for this project) | `wms-platform-*` containers publish `127.0.0.1` only. Not touched by this project. Note: WMS containers are Exited |
| S-04 | Tailscale Funnel off (no public exposure) | PASS | `tailscale funnel status`: no serve config. Serve itself NOT yet enabled |
| S-05 | Tailscale Serve restricted to HTTPS 443 to 127.0.0.1:3200 only | PENDING | Requires owner to enable Serve (`REMOTE_TESTING_SETUP.md`, section 4) |
| S-06 | Tailnet ACL restricts tester to this PC port 443 only | PENDING | Owner must edit ACL in admin console; the assistant cannot read or verify the policy |
| S-07 | No router port forwarding, public tunnel or reverse proxy | PASS | None configured by this work. Verified no LAN listener |
| S-08 | Docker, Prisma Studio, SSH, RDP, SMB, AnyDesk not reachable from tailnet or LAN | **FAIL (pre-existing; mitigation required)** | Listener audit on 2026-11-18 (`Get-NetTCPConnection -State Listen`). Not created by this project, not changed. Reachable on the tailnet IP `<tailnet-ip>` or all interfaces: TCP 139 NetBIOS (System, tailnet IP), 445 SMB (all interfaces), 135 RPC (all), 80 HTTP (System, all), 7070 **AnyDesk (all interfaces, incl. LAN 192.168.68.116)**, 5040, 5130, 2869 (UPnP/SSDP-type). Only Windows Firewall stops them from the network, and firewall rules were not verified (needs admin). Mitigation: the tailnet ACL must grant the tester `tcp:443` only (see `REMOTE_TESTING_SETUP.md`). Owner should review AnyDesk exposure and firewall rules. Tracked as BUG-SEC-003 |
| S-09 | Windows Firewall: no new inbound allow rule created | PASS | No firewall changes made. Pre-existing rules were not modified. Full firewall audit needs admin rights (PENDING for the owner) |

## B. Transport, cookies, sessions

| ID | Check | Status | Evidence / Notes |
|---|---|---|---|
| S-10 | Remote access over HTTPS | PENDING | Serve provides the certificate. Not yet enabled |
| S-11 | Session cookie `HttpOnly` | CODE-VERIFIED | `src/lib/session.ts` `sessionCookieOptions` |
| S-12 | Session cookie `SameSite=Lax` | CODE-VERIFIED | Same function |
| S-13 | Session cookie `Secure` | **OPEN (accepted for UAT)** | Set only when `NODE_ENV=production`. Dev mode runs here, so `Secure` is not set. Transport is still encrypted by Serve. Tracked as BUG-SEC-002 |
| S-14 | Session lifetime | CODE-VERIFIED | `SESSION_HOURS` default 12 (`src/lib/config.ts`). Expiry is enforced server-side via `sessions.expiresAt` and `revokedAt` |
| S-15 | Logout revokes server-side session | CODE-VERIFIED | `revokeSessionByToken` in `src/lib/session.ts`, `/api/v1/auth/logout` |
| S-16 | Password change revokes other sessions | CODE-VERIFIED | `revokeAllSessions` exists; tester to confirm in T-AUTH-08 |

## C. CSRF and origin

| ID | Check | Status | Evidence / Notes |
|---|---|---|---|
| S-20 | Cross-origin state-changing API request rejected | PASS | `POST /api/v1/auth/login` with `Origin: https://evil.example` returned **403** (local, 2026-11-18) |
| S-21 | Same-origin request accepted by origin check | PASS (local) | `Origin: http://127.0.0.1:3200` passed the origin check and reached validation (400, not 403) |
| S-22 | Origin check works behind Tailscale Serve (`Origin` host = `x-forwarded-host` or `Host`) | **PENDING** | Must test after Serve is enabled: a browser at the tailnet URL must be able to log in and POST. Expected risk: Serve may rewrite `Host`. Code reads `x-forwarded-host` first |
| S-23 | Content-Type required for JSON writes | PASS | Non-JSON POST rejected with 400 |
| S-24 | Cross-origin POST with a valid session rejected | PENDING | Not tested. The earlier attempt against `/api/v1/cart/items` was not a valid test (no session; 405 came from routing). Re-test with an authenticated session in T-SEC-03 |

## D. Authorization

| ID | Check | Status | Evidence / Notes |
|---|---|---|---|
| S-30 | Unauthenticated access to admin APIs denied | PASS | 401 on `/api/v1/admin/orders`, `customers`, `audit`, `settings`, `inventory`, and others (local, 2026-11-18) |
| S-31 | Unauthenticated access to customer APIs denied | PASS | 401 on `/api/v1/cart`, `/api/v1/orders`, `/api/v1/me/profile`, `/api/v1/auth/me` |
| S-32 | Role enforcement for an authenticated customer on admin APIs | **PENDING** | Not run. The seeded dev password is kept in `storage/dev-seed-secret.txt` (gitignored) and was deliberately not read. Tester performs T-SEC-01 with their own customer account; owner performs the staff checks with a limited staff account |
| S-33 | Role enforcement is server-side (not only UI) | CODE-VERIFIED | `src/lib/rbac.ts` and route handlers. Admin pages return HTML shells; data comes from APIs that return 401 without a session |
| S-34 | Customer cannot see another customer's orders | PENDING | Test T-SEC-04 with two customer accounts |
| S-35 | Price visibility limited to the customer's price level | PENDING | Test T-PRD-07 |

## E. Application and information exposure

| ID | Check | Status | Evidence / Notes |
|---|---|---|---|
| S-40 | Security headers present (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: private, no-store`) | PASS | Verified on `/login` (local) |
| S-41 | `X-Powered-By` header removed | PASS (config) | `poweredByHeader: false` in `next.config.mjs`. Not re-checked on the response |
| S-42 | TRACE / TRACK / CONNECT refused | PASS | TRACE returned 405 |
| S-43 | Secret files not served over HTTP (`.env`, `.git/config`, `DEV-CREDENTIALS.local.md`, `storage/logs`) | PASS | All returned 404 |
| S-44 | `.env`, `storage/`, `DEV-CREDENTIALS.local.md` gitignored | PASS | `.gitignore` lines 4-5, 7, 16 |
| S-45 | No secrets printed in project docs | PASS | This checklist and the other testing docs contain no passwords, keys or phone numbers |
| S-46 | Client-side hardcoded localhost URLs | PASS | `grep` of `src/` found no client-side `localhost` or `127.0.0.1`. Only server-side `PDF_RENDER_BASE_URL` default (loopback, server-to-self) |
| S-47 | Client IP for rate limiting not spoofable | **OPEN** | `src/lib/api.ts` `clientIp()` trusts the first `X-Forwarded-For` value supplied by the client. A tester can rotate it to bypass IP-keyed limits. Tracked as BUG-SEC-001 (not changed without approval) |
| S-48 | Mock OTP cannot run in production | CODE-VERIFIED | `src/lib/config.ts` `assertProductionSafe()` refuses `OTP_PROVIDER=mock` when `NODE_ENV=production`. `DEV_OTP_OUTBOX` also refused. `src/instrumentation.ts` runs the guard at start |
| S-49 | Mock OTP code shown to clients only outside production | CODE-VERIFIED | `src/modules/identity/otp.ts` returns `devCode` only for mock provider; UI label says DEV CODE |
| S-50 | Dev banner marks the environment as local development | PASS (code) | `src/components/DevBanner.tsx`. Tester to confirm it is visible (T-AUTH-01) |
| S-51 | No real payment processing | CODE-VERIFIED | No payment gateway dependency in `package.json` or `src/`. Checkout is cash-on-delivery |
| S-52 | No real customer notifications | CODE-VERIFIED | No email, SMS or push sender dependency. SMS provider is mock. In-app notifications only |

## F. Database

| ID | Check | Status | Evidence / Notes |
|---|---|---|---|
| S-60 | Database contents are synthetic or test data only | PASS (inspected) | 24 users: seeded `Dev …` accounts and test probes, plus the owner's staff account. No real customer data found. Phone numbers masked in this review |
| S-61 | Pre-change backup exists | PASS | `storage\backups\pre-remote-uat-20261118-191507.sql` (~255 KB, plain SQL) |
| S-62 | No database reset, drop or volume deletion | PASS | Only read queries and `pg_dump` were run |
| S-63 | Migrations up to date | PASS | 5 migrations applied, latest `20261114100120_v33_storefront_media` |
| S-64 | Database credentials not exposed | PASS | `.env` values not printed; `DATABASE_URL` only referenced by name |
| S-65 | Database role least privilege | NOT RUN | Connected as `b2b_app`. Privilege review not performed |
| S-66 | Backups of the database created regularly | PENDING | `backup:job` script exists; scheduling not configured (see `OPERATIONS.md`) |

## G. Owner and accounts

| ID | Check | Status | Evidence / Notes |
|---|---|---|---|
| S-70 | Owner account exists with MANAGER role and is active | PASS | `<owner-name>` STAFF, ACTIVE, role MANAGER (2026-11-18). Credentials not reviewed |
| S-71 | Owner credentials not shared with tester | PASS (process) | Do not share. Tester uses own customer account |
| S-72 | Owner account protected from deactivation | CODE-VERIFIED | Commit a6e71d3 "protected permanent MANAGER account" |
| S-73 | Remote tester has no staff role | PENDING | Tester registers as CUSTOMER; verify in T-AUTH-02 |

## H. Summary

- Blocking for remote testing: S-05, S-06, S-10, S-22 (all require owner action or testing after Serve is enabled). S-06 is also the only control keeping S-08 services (SMB, NetBIOS, AnyDesk, etc.) away from the tester.
- Open weaknesses accepted for UAT only: S-13 (Secure flag), S-47 (IP spoofing for rate limiting).
- No security control was disabled or weakened to make remote access work.

## I. Remediation update (2026-11-18)

The rows above are the audit record and are not edited. This section records what changed afterwards.

| ID | Previous | Now | Evidence |
|---|---|---|---|
| S-13 Secure cookie | OPEN | FIXED AND VERIFIED (automated); Serve HTTPS check pending | `sessionCookieOptions(expiresAt, scheme)`; scheme from trusted proxy only; sec-remediation.test.ts |
| S-22 Origin check behind Serve | PENDING | PENDING (unchanged) | Added `APP_TRUSTED_ORIGINS` allow-list. Live test still needed |
| S-32 Role enforcement with a session | PENDING | PARTLY VERIFIED (automated, test DB): customer and staff portal separation, staff without permission cannot grant themselves permissions, owner-only MANAGER | authn-authz-remediation.test.ts (14), sec-remediation.test.ts (13). Live browser and two-account runs still BLOCKED on owner and tester credentials |
| S-34 Customer isolation | PENDING | PENDING (customer-facing, deferred to Phase 3) | |
| S-47 Spoofable client IP | OPEN | FIXED AND VERIFIED (automated); live check pending | client-trust.test.ts (21), sec-remediation.test.ts client-IP cases |
| S-48 / S-49 Mock OTP | CODE-VERIFIED | unchanged; production guard still in place | `assertProductionSafe` not modified |
| S-08 Other services reachable on tailnet/LAN | FAIL | FAIL (unchanged; owner decision) | Firewall and ACL proposal in SECURITY_REMEDIATION_REPORT.md |
| S-63 Migrations | PASS | PASS (no migration added in this pass; no schema change) | |
| New: privilege ceiling | — | FIXED AND VERIFIED (automated): BUG-SEC-004 | grant-ceiling.test.ts, sec-remediation.test.ts |
| New: test side effects | — | FIXED AND VERIFIED (automated): BUG-SEC-005 | grant-ceiling.test.ts (credential sheet cases) |
| New: rate-limit bucket spoofing by local code | — | ACCEPTED (documented boundary): BUG-SEC-006 | client-trust.test.ts |
