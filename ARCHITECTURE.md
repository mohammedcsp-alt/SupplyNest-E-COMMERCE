# Architecture

## 1. Shape of the system

One Next.js application (App Router) serves both the HTML storefront/admin pages and the JSON API under `/api/v1`.
Business rules live in `src/modules/**` services. Route handlers and server components are thin: they authenticate,
authorize, validate with Zod, call a service, and serialize. The database is PostgreSQL 16 accessed through Prisma.

```
Browser ──► Next.js (127.0.0.1:3200)
              ├─ pages (server components; client islands for forms)
              ├─ /api/v1/* route handlers  ──► apiRoute() (request id, same-origin check, error envelope)
              │                               └─ requirePermission() ──► services (src/modules/*)
              │                                                           └─ Prisma ──► PostgreSQL (b2b_store_dev)
              └─ /api/v1/media/:id  (image bytes from storage/uploads, path taken from the database)
```

Nothing in this system talks to the operational WMS. There is no outbound network call anywhere in the code base.

## 2. Modules

| Module | Responsibility | Replaceable? |
|---|---|---|
| `src/modules/identity` | Phone normalization, OTP (mock adapter), registration, login, recovery, customer approval/suspension/price levels, status transitions | No (core) |
| `src/modules/catalog` | Public read models (projection rule: prices only for entitled viewers), admin SKU/category/attribute/brand/quality/image/price services | No (core) |
| `src/modules/inventory` | Locks, reservations, exactly-once release, consumption at handover, manual adjustments, alerts, expiry sweep | No (core) |
| `src/modules/imports` | Table parsing (CSV/XLSX), product and price import preview and atomic commit, freshness gate | No (core) |
| `src/modules/commerce` | Cart, bulk preview, shipping resolution and quote, idempotent checkout, order edits, cancellation, reorder, merge suggestions | No (core) |
| `src/modules/notifications` | In-site notifications only | No (core) |
| `src/modules/fulfillment` | **Temporary** local preparation: jobs, assignment, picking, checking, discrepancy hold, packing, handover | **Yes** — all state in `fulfillment_*` tables, never deleted |
| `src/modules/accounting` | **Temporary** courier settlement: invoices (revisions), courier shipments, collections, adjustments, remittances, allocations, fee payments, statements | **Yes** — `courier_*`, `financial_*`, `sales_invoices` tables, immutable rows |
| `src/lib` | Config, Prisma client, API envelope, errors, money, crypto, RBAC constants, sessions, audit, rate limiting, settings, i18n, time | — |

The fulfillment and accounting modules depend on core modules (inventory, commerce) but core never imports them,
except `checkout.ts` which creates the preparation job via `ensureFulfillmentJob` in the same transaction as the order.

## 3. Where each invariant is enforced

| Invariant | Enforcement point | Test |
|---|---|---|
| Stock never negative | DB CHECK on `inventory_balances`; `lockBalances` uses `FOR UPDATE` | `db-guards-and-rate-limits`, `checkout-and-inventory` |
| No oversell under concurrency | Lock ordering (ascending SKU) + available check inside the same transaction | "two concurrent checkouts for the LAST unit" |
| Exactly-once reservation release | Conditional `updateMany` on live statuses; only the flipping row adjusts `reservedQty` | "approved cancellation releases … exactly once" |
| Idempotent order placement | `IdempotencyRecord` unique `(customerId, key)` inserted first in the placing transaction; duplicates replay | "concurrent duplicate submissions …" |
| Consent to price/fee changes | `quoteHash` recomputed server-side inside the transaction; mismatch → `PRICE_CHANGED` | "a price change after review …" |
| Atomic import | Whole file validated inside the commit transaction; any issue → rollback and rejection record | "one invalid row rejects the whole file" |
| Freshness gate | `EXTRACTED_AT` comparison against stored `sourceTimestamp`; manager override permission + reason | "older file … MANAGER override" |
| Prices only for entitled viewers | Projection functions add `price` only when `canSeePrices(viewer)`; `/api/v1/me/prices` requires ACTIVE customer | `api-security`, `identity-and-prices` |
| Max 10 images per SKU | Service lock + DB trigger | "a SKU cannot hold more than 10 images" |
| Picker ≠ checker | Assignment validation and per-action check against the assigned user | "picker and checker must be different people" |
| Packing only after check | Status machine in `fulfillment/service.ts` | "packing cannot start before the independent check" |
| Consume accepted quantity only | `handOver` consumes accepted lines and releases the remainder | "handover consumes only the accepted quantity" |
| No double-counted rejections | Expected COD base = accepted goods at handover; adjustments applied once | `settlement-math`, "rejections reduce expected COD once" |
| Collected COD set once | `recordCollection` refuses a second value; corrections use adjustments | "Collection is already confirmed" |
| No over-allocation | Remittance gross and shipment due checked inside `FOR UPDATE` transactions | "over-allocation refused" |
| Immutable posted money | DB triggers on `financial_adjustments`, `courier_financial_events`, `courier_remittances`, `courier_fee_payments` | "posted financial rows cannot be updated or deleted" |
| Append-only audit | DB trigger on `audit_logs` | "audit_logs rejects UPDATE and DELETE" |
| Default-deny authorization | `requirePermission` on every route; pages use `userWithPermission`; UI visibility is never authorization | `api-security` |
| CSRF | SameSite cookie, JSON-only bodies, Origin check | `http-guards`, `api-security` |
| Brute-force limits | Atomic fixed-window buckets (`security_rate_limits`) | `db-guards-and-rate-limits`, `api-security` |

## 4. Transaction boundaries

- Every money or stock write runs in one `db.$transaction`. Interactive transactions use row locks (`SELECT … FOR UPDATE`) on the rows whose invariants they protect (balances, orders, shipments, remittances, couriers, fulfillment jobs, image counts).
- Audit rows are written inside the same transaction as the change they describe.
- Long checkout transactions set `isolationLevel: ReadCommitted` (Postgres default) and rely on the idempotency unique index plus row locks, not on serializable retries.

## 5. Data model summary

65 Prisma models, mapped to snake_case tables. Two hand-written migrations add what Prisma cannot express:
CHECK constraints, partial unique indexes (one OPEN alert per SKU/type; one live reservation per order/SKU), the image-limit
trigger, append-only and immutable-row triggers, and sequences for order, preparation and invoice numbers.

Money columns are `DECIMAL(18,0)` (whole IQD). Application arithmetic uses Prisma `Decimal` (decimal.js) or `BigInt`
on integer strings. JavaScript floating point is not used for money.

## 6. Configuration

`src/lib/config.ts` validates environment variables at startup. Production refuses to start with `OTP_PROVIDER=mock`,
with the WMS feature flag on, or with an SMS provider missing its key. Secrets come only from `.env` (gitignored).

## 7. Testing layers

- `tests/unit` — pure functions (money, phone, settlement math, password hashing, image sniffing, table parsing, HTTP guards).
- `tests/integration` — services against the isolated `b2b_store_test` database (concurrency, idempotency, reservations, imports, fulfillment, accounting, DB guards).
- `tests/e2e` — Playwright: HTTP-level security checks (`api-*.spec.ts`) and browser checks in Arabic RTL and mobile English LTR (`ui-*.spec.ts`), against a separate server on port 3210 with the test database.

The test database guard (`tests/setup/testdb.ts`) refuses any database other than `b2b_store_test` on `127.0.0.1:5440`.
