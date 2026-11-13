# Security report (V1, local development build)

Scope: the B2B-STORE application as built in this workspace. Testing was local against the dedicated development and test
databases. No production deployment, no external penetration test, and no third-party security review was performed.

## 1. Assets

- Customer identity: phone numbers, names, business names, addresses.
- Credentials: password hashes, session tokens, OTP codes (transient).
- Commercial data: customer price levels, tier prices, stock, orders, invoices, courier settlements.
- Integrity of stock and money: reservations, collections, allocations, adjustments.

## 2. Threats and mitigations (implemented)

| Threat | Mitigation | Evidence |
|---|---|---|
| Price disclosure to visitors or unapproved customers (STORE-003, T001) | Projections add price only for ACTIVE customers with their own level; `/api/v1/me/prices` requires ACTIVE; no shared cache of personal data (`Cache-Control: private, no-store`) | `api-security.spec.ts`, `identity-and-prices.test.ts` |
| Price disclosure through another level (T006) | Lookup filtered by the viewer's `priceLevelId` only | "an ACTIVE customer sees only their own level price" |
| Password guessing | scrypt hashing; login limits 10/15 min per IP and 5/15 min per account (atomic counters); generic error for unknown phone or wrong password | `api-security.spec.ts` (429 after 10 attempts from one IP) |
| OTP guessing | 6-digit random code, keyed hash at rest, 5 attempts then invalid, 5-minute validity, 3 codes per hour per phone, 60 s resend cooldown | `identity-and-prices.test.ts` |
| Account enumeration | Registration of an existing phone returns a generic conflict message and is rate-limited per IP; OTP request and recovery return identical shapes for unknown phones | Code review of `auth-service.ts`, `otp/request/route.ts` |
| Session theft / fixation | Random 256-bit token; only SHA-256 stored; httpOnly, SameSite=Lax cookie; Secure in production; expiry 12 h; revocation on logout and password reset | `session.ts` |
| CSRF | SameSite=Lax; JSON-only request bodies (cross-site forms cannot send JSON); Origin must match Host on state-changing requests | `http-guards.test.ts`, `api-security.spec.ts` (403 for cross-origin PUT) |
| Broken access control | Default-deny `requirePermission` on every admin/staff route; permissions resolved on the server from roles; UI hiding is not relied on | `api-security.spec.ts` (401 anonymous, 403 customer) |
| Oversell under concurrency | Row locks, ordered acquisition, CHECK constraints | ACX-02 test |
| Duplicate orders / money writes | Idempotency-Key records with unique constraints; `ON CONFLICT`-safe rate-limit upserts; unique references for remittances and fee payments | checkout and finance tests |
| Tampering with audit history | Append-only audit table enforced by trigger | `db-guards-and-rate-limits.test.ts` |
| Tampering with posted money | Immutable financial tables enforced by triggers; corrections as new rows | `fulfillment-and-accounting.test.ts` |
| Malicious uploads | Magic-byte image sniffing (JPEG/PNG/WebP only; SVG and HTML rejected); size limit 5 MB; stored under server-generated names inside the upload directory; served only for published SKUs; path taken from the database | `passwords-and-images.test.ts`, media route |
| Spreadsheet/CSV formula injection in exports | Export writer prefixes cells that begin with `= + - @` (see `report` export code) — verify before release | Open item, see TEST_REPORT.md |
| XSS via CMS or product text | React escaping only; no `dangerouslySetInnerHTML`; length limits on inputs | Code review |
| Mass assignment | Zod `.strict()` objects on profile updates; explicit field lists in services | `customer-service.ts`, schemas |
| Oversized bodies | 512 KB JSON limit, 5 MB file limit, 500-row import cap, 500 lines per paste | `api.ts`, `table.ts`, `cart.ts` |
| Secrets in source or logs | Secrets from `.env` only (gitignored); logger redacts keys matching password/otp/token/secret/cookie/session; OTP codes never logged | `logger.ts` |
| Test or dev data leaking into WMS | No WMS connection code; feature flag off; config refuses production start with flag on | `config.ts`, `WMS_CONTRACTS_ONLY.md` |
| Accidental use of the wrong database in tests | Test runner refuses any database other than `b2b_store_test` on `127.0.0.1:5440` | `tests/setup/testdb.ts` |
| Security headers | X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, restrictive Permissions-Policy | `next.config.mjs` |

## 3. Known gaps and residual risks (must be addressed before any production use)

1. **No HTTPS, no HSTS.** Local HTTP only. Production requires TLS termination and `Strict-Transport-Security`.
2. **In-memory-free but single-node rate limiting** is backed by PostgreSQL; it is correct across processes but not tuned for load.
3. **No real OTP provider.** Development mock only. The production start guard prevents the mock, but the SMS adapter itself is not implemented.
4. **No CAPTCHA** on registration or login; the rate limits are the only automated-abuse control.
5. **No MFA** for staff accounts. Staff use phone plus password only.
6. **Session lifetime is fixed** (12 h) without sliding renewal or device list management.
7. **Admin actions have reason fields but no four-eyes approval** for high-risk operations other than financial adjustments (which need the approve permission, held by managers and the accountant role).
8. **Backups** are not encrypted at rest by the application. Dump files live in `storage/backups` on the local disk.
9. **Dependency vulnerabilities** were not scanned in this workspace (`npm audit` not reviewed for a release decision).
10. **Upload storage** is on local disk; no malware scanning on uploaded images beyond magic-byte checks.
11. **Logs** are JSON to stdout; no central retention policy.
12. **Denial-of-service** resistance is not measured; no load test was run (see TEST_REPORT.md).
13. **Customer data export and deletion** requests (privacy) are not implemented.

## 4. Verification status

The mitigations above are covered by automated tests listed in TEST_REPORT.md. Tests that could not run in this environment
are listed there as well. No claim of certification or external audit is made.
