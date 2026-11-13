# Future WMS integration — contracts only (DISABLED in V1)

**Status: documentation only. No connection, no credentials, no outbound calls, no writes to WMS.**

- `FEATURE_FLAG_WMS_INTEGRATION=false` (default; the application refuses to start in production with it set to `true`).
- No code path issues an HTTP request or database query to the operational WMS (`127.0.0.1:3100`, its database, or its object store).
- `integration_outbox` and `integration_inbox` tables exist but are not written by any V1 code path. The admin integrations page reports their row counts (expected: zero).
- Tests assert the flag is off and that no WMS port is touched (`ACX-10`, `T039`).

## Contracts (from specification section 10, unchanged)

| Contract | Direction | Guarantee the future adapter must provide |
|---|---|---|
| ProductUpsert | WMS → Store | Unique SKU; event version; field ownership policy agreed before enabling |
| StockAvailabilityChanged | WMS → Store | Event version and timestamp; old events never re-applied |
| StoreOrderSubmitted | Store → WMS | Idempotency and a unique `external_reference` (the local order number) |
| OrderAccepted / OrderRejected | WMS → Store | Linked to the order id; source of truth for accepted state |
| FulfillmentStatusChanged | WMS → Store | Ordered state transitions with dates |
| DeliveryOutcomeChanged | WMS → Store | Partial rejection and return details, only when the contract exists |
| CODSettlementStatus | WMS → Store | Displayed only after the integration is approved as a source of financial truth |

Before enabling any contract, the owner must decide: ownership of prices and stock (OPEN-19), SKU matching rules,
reservation synchronization, and the cutover procedure (section 20.10: fulfillment and accounting modes stay `LOCAL`
until open orders are migrated or closed and balances are reconciled; no system writes to both at once).

## What exists in code today

- Fulfillment and accounting services are isolated behind their own module boundaries so a WMS-backed implementation can
  replace them without deleting history.
- No WMS client, secrets, or endpoint configuration exist in the repository.
