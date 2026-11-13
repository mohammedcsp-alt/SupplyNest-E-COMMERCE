# Implementation status (per phase, truthful)

Status key: COMPLETE = implemented and covered by a command that passed · PARTIAL = implemented, some part unverified ·
PENDING = not implemented · BLOCKED = needs an owner decision or external input.

| Phase | Scope | Status | Evidence / gap |
|---|---|---|---|
| 0 Environment & safety | Isolated DB, ports, secrets | COMPLETE | Dedicated container; test DB identity guard |
| 1 Core foundation | Schema, migrations, config, RBAC, i18n, API envelope | COMPLETE | Type check; build; seed |
| 2 Customers & auth | Registration, OTP (mock), approval, price levels, suspension, roles, audit | COMPLETE (mock OTP) | 13 integration tests; API and browser sign-in. SMS provider BLOCKED (external) |
| 3 Catalog & inventory | Categories, attributes, SKUs, images, prices, search, reservations, alerts, imports | PARTIAL | Services and 40+ tests pass. Admin import and image UI not exercised in a browser. No product-model create API |
| 4 Commerce | Cart, bulk, shipping, quote consent, idempotent checkout, edits, cancellation, reorder, merge suggestions | COMPLETE (browser for checkout, cancellation, reorder) | Integration tests; 6 browser tests. Edit and merge UI not exercised in a browser |
| 5 Fulfillment (temporary) | Jobs, assignment, picking, checking, discrepancy, packing, handover, prep document | PARTIAL | Workflow tests pass; UI forms exercised only through the API. Checker can see the picker's shortage reason text (see KNOWN_LIMITATIONS) |
| 6 Accounting (temporary) | Invoices, couriers, NET/GROSS settlement, remittances, allocations, fee payments, adjustments, reversals, statements, reports | COMPLETE for services; PARTIAL for reports | Settlement and immutability tests pass; reports verified by agent over HTTP only |
| 7 Administration & reports | Admin pages and APIs, CMS, settings, audit, backup/restore | PARTIAL | Manager access and mutations verified over HTTP by agent; backup restore agent-reported PASSED, not re-run |
| 8 Testing & stabilization | Unit, integration, concurrency, E2E, RTL/LTR, responsive | PARTIAL | 103 vitest + 31 Playwright passing. Load testing NOT run; visual regression NOT run |
| 9 Local delivery | Running app, docs, scripts, demo data | COMPLETE for local inspection | Dev server serves all main pages; docs written. Not deployed (by design) |

## Items not implemented (see KNOWN_LIMITATIONS.md)
- SMS and email notifications; WMS integration (disabled by design); payment gateway; taxes and promotions
- Server-side PDF for Arabic text (print views provided)
- Product-model creation and banner update APIs
- Visual-regression and load tests
