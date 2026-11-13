# Implementation decisions

This file separates **approved requirements** (from the V3.2 specification) from **defaults chosen by the implementation**.
Defaults are configurable or isolated, and none of them is a business approval. Where a default changes a commercial
rule, it must be confirmed by the owner before production use.

Source of truth: `../B2B_Store_Claude_Execution_Plan_V3_2.docx` (sections 1–20). The spec's own list of open
decisions (section 16, OPEN-01 … OPEN-24) is resolved below as **V1 defaults** per section 19.2, which the spec itself
allows to be changed.

## A. Approved requirements implemented as written

| Area | Requirement | Where it is enforced |
|---|---|---|
| Access | Admin approval before activation (STORE-001, CUSTOMER-003) | `src/modules/identity/customer-service.ts` `approveCustomer` |
| Prices | Per-customer price level (STORE-002); hidden from visitors (STORE-003) | `src/modules/catalog/public.ts` projections, `src/lib/session.ts` `canSeePrices` |
| Availability | Binary availability for customers (STORE-004, PRODUCT-005) | `projectSku` (`availability: AVAILABLE/UNAVAILABLE`) |
| Payment | COD only (STORE-005) | Order model has no payment method; `totalCod` only |
| Orders | Edit before preparation (ORD-001); cancellation needs approval (ORD-002); customer-only quantity reduction (ORD-003); no minimum (ORD-004); merge is a suggestion only (ORD-005) | `src/modules/commerce/orders.ts` |
| Orders | Local statuses only: SUBMITTED, ON_HOLD_LOCAL, CANCELLATION_REQUESTED, CANCELLED. No PREPARED/SHIPPED/DELIVERED claims (section 7) | `OrderStatus` enum; fulfillment status is separate |
| Orders | Prices snapshotted on the order (ORD-008) | `OrderItem.unitPrice`, `Order.addressSnapshot` |
| Customers | Phone OTP (CUSTOMER-002); pending accounts see no prices (CUSTOMER-006); suspension hides prices and keeps history | `src/modules/identity/*` |
| Catalog | Unique SKU per quality (PRODUCT-001); absent rows never change on import (PRODUCT-002); existing SKUs update (PRODUCT-003) | `src/modules/imports/products-import.ts` |
| Catalog | Up to 10 images per SKU (PRODUCT-006) | Service check plus DB trigger `sku_images_max_10` |
| Catalog | Atomic import: one invalid row rejects the file (PRODUCT-009, IMP-01) | `validateProductRows` re-run inside the commit transaction |
| Inventory | Reservation on order (P01); no oversell under concurrency (ACX-02) | `reserveLines` with `SELECT … FOR UPDATE` and CHECK constraints |
| Inventory | Expired reservation → REVIEW_REQUIRED, never auto-released (INV-01, ACX-03) | `sweepExpiredReservations` |
| Idempotency | Order placement idempotent (P03, ACX-02) | `placeOrder` idempotency record claimed inside the transaction |
| Finance | Expected COD is never treated as received cash (section 20.4) | `src/modules/accounting/math.ts` |
| Finance | NET_DEDUCTION and GROSS_REMITTANCE both supported, chosen per agreement and snapshotted per shipment (section 20.3) | `CourierAgreement.settlementMode`, `CourierShipment.settlementModeSnapshot` |
| Finance | Posted financial rows are immutable; corrections are new rows (ACC-11) | DB triggers `financial_*_immutable` |
| Audit | Append-only audit log (ADMIN-005) | DB trigger `audit_logs_no_update_delete` |
| Isolation | No WMS connection; feature flag off; no port 3100 (section 3, ACX-10) | `FEATURE_FLAG_WMS_INTEGRATION=false`; config refuses to start with it on |
| Currency | Amounts are whole IQD, stored as DECIMAL(18,0) (OPEN-08 default) | `src/lib/money.ts`, Prisma `Decimal @db.Decimal(18, 0)` |

## B. Defaults chosen for open decisions (spec section 19.2)

| ID | Question | V1 default used | Change point |
|---|---|---|---|
| OPEN-01 | Reservation duration | 24 h; admin setting 1–168 h; expired → REVIEW_REQUIRED, quantity still held | `SystemSetting` key `reservation.hours` (Admin → Settings) |
| OPEN-02 | Who extends/releases reservations | Permission `inventory.reservation.manage`; reason mandatory; exactly-once release | `src/lib/rbac.ts`, `src/modules/inventory/inventory.ts` |
| OPEN-03 | Meaning of imported stock | Imported quantity = total physical on hand; available = max(0, physical − reserved) | `products-import.ts`, `inventory.ts` |
| OPEN-04 | Stale data threshold | 24 h after the last trusted source time | `inventory.staleAfterHours` |
| OPEN-05 | Low-stock threshold | 5 units per SKU, not shown to customers | `inventory.lowStockThreshold` |
| OPEN-06 | Trusted source time | `EXTRACTED_AT` (ISO-8601) in the file; missing → UNKNOWN (admin confirmation) | `products-import.ts` |
| OPEN-07 | OTP provider | Development mock only (5 min validity, 5 attempts, 3 codes/hour/phone, 60 s cooldown). Production refuses to start with the mock. No SMS provider is implemented. | `src/modules/identity/otp.ts`, `src/lib/config.ts` |
| OPEN-08 | Currency and rounding | IQD whole dinars; no VAT; no discounts | `src/lib/money.ts` |
| OPEN-09 | Governorates, areas, fees | Iraqi governorates seeded as reference data. Fee amounts are **not** invented: the seed uses clearly labelled synthetic amounts for three governorates only. Other governorates are blocked from checkout until an admin sets a rule. | `prisma/seed/index.ts` (`SYNTHETIC_RATES`) |
| OPEN-10 | Region without a fee rule | Checkout refused with `SHIPPING_RULE_MISSING` (no free shipping assumed) | `src/modules/commerce/quote.ts` |
| OPEN-11 | Edits and repricing | Unchanged lines keep their snapshot; changed or new lines are repriced; any price difference needs `acceptPriceChanges` | `src/modules/commerce/orders.ts` `editOrder` |
| OPEN-12 | "Preparation started" before WMS | Fulfillment job leaving PENDING_ASSIGNMENT, or an explicit manager lock (`order.lock_prep`), closes customer edits | `preparationStarted` |
| OPEN-13 | Merge suggestions | Same customer, same delivery address, both SUBMITTED and not in preparation. Suggestion only; no merge is executed | `proposeMerge` |
| OPEN-14 | Cancellation | Customer requests; manager approves. Approval refused after preparation starts. Reservations released once | `resolveCancellation` |
| OPEN-15 | Backups | Daily dump, 30-day retention, monthly restore test to a scratch database. RPO/RTO targets are design goals, not measured guarantees | `OPERATIONS.md`, backup admin page |
| OPEN-16 | Volumes | Design target only (20,000 SKUs, 1,000 orders/day, 50 concurrent users). No load test was executed | `TEST_REPORT.md` |
| OPEN-17 | Host and port | Local only: `127.0.0.1:3200`. Domain and hosting deferred | `package.json` scripts |
| OPEN-18 | Import template | Canonical columns `SKU, NAME_EN, NAME_AR, MODEL, BRAND, QUALITY, CATEGORY, PHYSICAL_STOCK, EXTRACTED_AT`; prices `SKU, PRICE_LEVEL, PRICE`; Arabic header aliases; CSV and XLSX | `src/modules/imports/table.ts` |
| OPEN-19 | Owner of prices and stock | The store owns both before any integration (WMS flag off) | Architecture |
| OPEN-20 | Suspension with active reservations | Blocks new sessions and prices; keeps orders and reservations for admin review; nothing auto-cancelled | `suspendCustomer` |
| OPEN-21 | Discounts, promotions, taxes | None in V1 | Not implemented |
| OPEN-22 | Limits | 100 units per SKU per order; login 10/15 min per IP and 5/15 min per account; checkout 10/hour per customer | `src/lib/settings.ts`, route rate limits |
| OPEN-23 | Edits after approval | Edits before lock need no admin approval; a customer who changes price must consent | `editOrder` |
| OPEN-24 | Stale reservations with no one acting | Stay REVIEW_REQUIRED and raise an alert; no automatic release; daily review via the admin area | `RESERVATION_REVIEW` alert |

## C. Technical defaults (not business rules; safe to change)

- **Stack:** Next.js 15 (App Router), React 19, TypeScript 5, Prisma 6 with PostgreSQL 16 (Docker, port 5440), Zod 3 validation, exceljs and csv-parse for files, Vitest 3 and Playwright for tests. Plain CSS with logical properties for RTL/LTR.
- **Tables:** snake_case table names (`@@map`); columns keep Prisma's camelCase defaults.
- **Passwords:** scrypt (N=16384, r=8, p=1), random salt.
- **Sessions:** opaque random token in an httpOnly, SameSite=Lax cookie; only the SHA-256 is stored; 12 h; revoked on password reset and logout.
- **CSRF:** SameSite cookies, JSON-only bodies (multipart only on upload paths), and an Origin check on every state-changing request.
- **Keyed hashes:** OTP codes and rate-limit subjects are HMAC-SHA256 with `APP_SECRET`.
- **Rate limits:** fixed windows in `security_rate_limits`, incremented with one atomic upsert.
- **Locale:** cookie `b2b_locale`, default Arabic (RTL); English is LTR.
- **Timezone:** timestamps stored in UTC and displayed in Asia/Baghdad.
- **Fulfillment and accounting:** separate modules (`src/modules/fulfillment`, `src/modules/accounting`) with their own tables. Replaceable by a future WMS adapter. History is never deleted.
- **Independent checking:** the checker must be a different user from the picker; the checker sees no picker counts until submitting.
- **Invoice numbers:** database sequence `sales_invoice_seq`. Preparation document numbers: `prep_doc_seq`. Order numbers: `order_number_seq`.
- **Correction model:** invoice revisions (new rows), adjustment reversals (opposite-sign rows linked by `reversesId`), and allocation voids (audited deletion of a mistaken allocation).
- **Customer delivery fee vs courier fee:** separate columns everywhere. Courier fees are snapshotted from the agreement at handover.
- **Due-side adjustments are signed:** a negative `COURIER_CORRECTION` reduces what the courier owes. Expected-side types (`REJECTION_*`, `RETURN`, `CUSTOMER_REFUND`, `DISCOUNT`) are entered as negatives and reduce expected COD.
- **Goods base for expected COD:** the accepted goods value at handover, with approved rejections applied once as adjustments. Invoice revisions do not feed back into the base (avoids double counting).
- **Rejections after handover:** goods-related adjustments issue a new invoice revision. Returned stock is not restocked automatically; returned units must be entered as a manual inventory adjustment (documented limitation).
- **Manual inventory changes** never refresh the trusted source timestamp, so manual edits cannot hide stale imports.

## D. Items explicitly not implemented (see KNOWN_LIMITATIONS.md)

- Real SMS/OTP provider, email, WhatsApp. (Only in-site notifications exist.)
- WMS integration of any kind. Contracts exist as documentation and mock fixtures; the feature flag is off.
- Server-side PDF generation for Arabic text (print views are provided; see KNOWN_LIMITATIONS.md).
- Merge execution, multi-warehouse, payment gateways, taxes, promotions, general ledger, payroll, profit and loss.
