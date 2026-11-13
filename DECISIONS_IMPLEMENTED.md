# Decisions implemented (spec section 19.1 deliverable)

This file is the spec's name for the decisions record. The full list, with approved requirements separated from
defaults and the change point for each default, is in `IMPLEMENTATION_DECISIONS.md`.

Summary of the defaults in effect (see that file for detail and change points):
- Reservation: 24 hours (admin setting 1–168); expired reservations go to review and keep holding stock.
- OTP: development mock only; 5-minute validity; 5 attempts; 3 codes per hour per phone; 60-second cooldown.
- Money: whole IQD; no VAT; no discounts.
- Shipping: no fee is assumed; a region without a rule cannot check out.
- Import freshness: `EXTRACTED_AT` is the trusted time; missing means UNKNOWN; older means STALE and needs a manager.
- Low stock: 5 units; stale data after 24 hours.
- Courier settlement: both methods supported; method is snapshotted per shipment at handover.
- Corrections are new records; posted financial rows are immutable.
