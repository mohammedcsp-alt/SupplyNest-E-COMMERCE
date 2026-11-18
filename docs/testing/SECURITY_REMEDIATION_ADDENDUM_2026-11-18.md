# Security Remediation Addendum: Serve verification and tester preparation (2026-11-18, second pass)

Continues `SECURITY_REMEDIATION_REPORT.md`. Nothing here marks remote connectivity or concurrent administration as passed.
Both need two administrators to connect and test independently.

## 1. The 13 requested items

| # | Item | Result | Status |
|---|---|---|---|
| 1 | Serve configuration and URL | `https://<owner-host>.<tailnet>.ts.net (tailnet only)` proxies `/` to `http://127.0.0.1:3200`. Funnel status shows the same tailnet-only configuration. No public exposure. | FIXED AND VERIFIED |
| 2 | Live forwarded headers | Observed through Serve: `X-Forwarded-For` is overwritten with the tailnet client address (a forged `1.2.3.4` never arrived). `X-Forwarded-Proto: https`. `X-Forwarded-Host` is the Host the client sent. `Tailscale-User-Login` is injected, and a forged value is overwritten. The rightmost-entry rule in the code matches this. | FIXED AND VERIFIED |
| 3 | Forged XFF cannot bypass rate limits | Live: 12 bad logins through HTTPS, each with a different forged `X-Forwarded-For` and a new phone number. Attempts 1 to 10: 401. Attempts 11 and 12: **429 RATE_LIMITED**. | FIXED AND VERIFIED (live) |
| 4 | Redirects use the HTTPS origin; untrusted Host cannot manipulate | `/admin/login` returns `Location: https://<owner-host>.<tailnet>.ts.net/login?portal=admin`. With a forged `Host: evil.example` the Location still used the ts.net host. A cross-origin POST returns 403. | VERIFIED (live). A forged Host still reaches the app as the Host header, but a browser cannot set it, so browser CSRF protection is unchanged. |
| 5 | Cookie flags through Serve | Login `Set-Cookie` for `b2b_session`: **Secure, HttpOnly, SameSite=Lax, Path=/**, expiry set. `/api/v1/auth/me` with the cookie: 200. Logout: 200. The old cookie afterwards: **401** (server-side revocation). Open minor item: the clearing cookie has no `Secure` flag (BUG-SEC-009). | FIXED AND VERIFIED (live) |
| 6 | Tester network restrictions | **Not verifiable from this PC.** The tailnet ACL cannot be read here. Application-level restriction added and verified: `TAILNET_ALLOWED_USERS` refuses any tailnet login not on the list (live: listed login 200, unlisted 403). TCP 139 (NetBIOS) is still listening on the Tailscale IP. | BLOCKED — USER ACTION REQUIRED (ACL and firewall, plus a second device) |
| 7 | Unrelated services and PostgreSQL inaccessible | Verified on this PC: PostgreSQL (5440) and the app (3200) listen on **127.0.0.1 only**. Serve (443) is the only SupplyNest path on the tailnet. Denial from another tailnet device **not tested** (no second device). | PARTLY VERIFIED. Second-device test BLOCKED |
| 8 | Test results | Typecheck: PASS. Unit `npx vitest run tests/unit`: **161 of 161 PASS (17 files)**. Integration `npx vitest run tests/integration`: **162 of 162 PASS (22 files)**, against the test database. | FIXED AND VERIFIED (automated) |
| 9 | Owner account status | Re-verified in the database: STAFF, **ACTIVE**, role **MANAGER only** (53 of 53 permissions), registered in `owner.account`. No duplicate. | VERIFIED |
| 10 | Admin Tester account | Role **ADMIN_TESTER created** on the dev database: 36 permissions, 0 withheld codes (backup taken first). **The account is not created.** The password is typed by the owner at a hidden prompt (the same rule as the owner account), so the assistant cannot create it. | Role: VERIFIED. Account: BLOCKED — USER ACTION REQUIRED |
| 11 | Private Admin Login URL | **`https://<owner-host>.<tailnet>.ts.net/login?portal=admin`**. The alias `/admin/login` redirects here. Local: `http://127.0.0.1:3200/login?portal=admin`. | HTTPS URL verified from this PC. Friend's device not yet tested |
| 12 | Local Admin Login page opened | Opened in the default browser on 2026-11-18 (HTTP 200). | DONE |
| 13 | Manual actions | Section 4 | BLOCKED — USER ACTION REQUIRED |

## 2. Findings in this pass

| ID | Severity | Finding | Status |
|---|---|---|---|
| BUG-SEC-007 | **Critical** | Password recovery returned the mock OTP code to any caller. Anyone who could reach the app could reset any verified account, including the owner's. Confirmed live before the fix. | FIXED AND VERIFIED. The code is no longer returned (live response: `sent` only). The owner challenge created by the test was voided. |
| BUG-SEC-008 | High | No application-level identity check on tailnet access; relied only on the ACL. | FIXED AND VERIFIED (live). `TAILNET_ALLOWED_USERS` lists the owner login only. |
| BUG-SEC-009 | Low | The logout clearing cookie has no `Secure` attribute. | OPEN (minor) |
| BUG-SEC-003 | High | TCP 139 is reachable on the Tailscale IP. | OPEN. Needs an ACL or firewall decision. |

Reviewed and acceptable: the OTP request endpoint returns a code only for `REGISTRATION`, and only for unverified
registrations. It cannot sign anyone in or reset a password.

## 3. Configuration changed in `.env` (gitignored; disclosed)

- `APP_TRUSTED_ORIGINS=https://<owner-host>.<tailnet>.ts.net`
- `TAILNET_ALLOWED_USERS=<owner-tailnet-login>` (owner's tailnet login; verified to match through Serve)

Note: the owner's own tailnet logins through Serve were throttled for 15 minutes after the failed-login test, because the
login limit is keyed on the tailnet address. Local `127.0.0.1` logins were not affected.

## 4. Manual actions still required

**Owner, in an interactive PowerShell in the B2B-STORE folder:**

1. Create the tester account. You type the temporary password twice at the hidden prompt. It is not stored or printed:
   `npm run tester:create -- --phone 07XXXXXXXXX --name "Tester name"`
   Use the friend's own mobile number (not a seeded `+9647700…` number). Pass the temporary password to the friend through a
   secure channel, not in chat.
2. Invite the friend in the Tailscale admin console, using their own email. Set the tailnet ACL so the friend gets only
   `tcp:443` on `<owner-host>` (`NETWORK_ISOLATION_PROPOSAL.md`, section 2). Remove any broad `*` grant.
3. Add the friend's tailnet login to `TAILNET_ALLOWED_USERS` in `.env` (comma-separated, for example
   `<owner-tailnet-login>,friend@example.com`). Restart the app with `scripts\stop-local.ps1` then `scripts\start-local.ps1`.
   The friend cannot get in until this is done.
4. Decide on the firewall block for TCP 139 and the others (`NETWORK_ISOLATION_PROPOSAL.md`, section 3).
5. Sign in at `https://<owner-host>.<tailnet>.ts.net/login?portal=admin` and run the owner's Phase 1 tests.

**Friend, after accepting the Tailscale invitation and signing in to Tailscale:**

1. Open `https://<owner-host>.<tailnet>.ts.net/login?portal=admin`.
2. Sign in with the phone number the owner entered and the temporary password from the owner.
3. Open `https://<owner-host>.<tailnet>.ts.net/account/password` and set your own password (10 characters or more,
   with letters and digits). You are signed out of all sessions and sign in again with the new password.
4. Run the Phase 1 admin tests in `UAT_ADMIN_PHASE1_2_TEST_CASES.csv` assigned to Tester. Do not try other ports or devices on the PC.

Phase 2 (concurrent administration) starts only when both of you are signed in at the same time. A result is recorded as
PASS only with evidence from your own session.

## 5. Not done in this pass

- No commit or push (waiting for your approval).
- No firewall, ACL or Windows changes. No reboot.
- The friend's account was not created, and no password was read, stored or displayed.
- Browser tests and the second-device denial tests have not been run.
