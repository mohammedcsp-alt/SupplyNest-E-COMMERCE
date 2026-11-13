import { z } from 'zod';

/**
 * WMS integration contracts (spec section 10). OFFLINE DEFINITIONS ONLY: these schemas validate payloads and do not
 * open any connection. Field names follow the spec text where it names them; fields the spec leaves open are
 * marked in the comments and must be confirmed by the owner before the integration is enabled.
 *
 * Every event carries event_id (idempotency key on both sides) and a monotonic version or timestamp so that old
 * events are never re-applied.
 */

const uuid = z.string().uuid();
const sku = z.string().trim().min(1).max(60).regex(/^[A-Z0-9][A-Z0-9-]*$/, 'SKU must be upper-case letters, digits and dashes');
const externalReference = z.string().trim().min(1).max(40); // the local order number
const isoDateTime = z.string().datetime({ offset: true });
const qty = z.number().int().positive().max(100000);
const iqdAmount = z.number().int().min(0).max(1_000_000_000);

const envelope = {
  event_id: uuid,
  occurred_at: isoDateTime,
};

/** WMS -> Store. Unique SKU; event version; field-ownership policy is an owner decision (OPEN-19). */
export const ProductUpsertSchema = z
  .object({
    ...envelope,
    version: z.number().int().min(1),
    sku,
    name_en: z.string().trim().min(1).max(200),
    name_ar: z.string().trim().max(200).optional(),
    active: z.boolean(),
  })
  .strict();

/** WMS -> Store. Event version and timestamp; older events must never be re-applied. */
export const StockAvailabilityChangedSchema = z
  .object({
    ...envelope,
    version: z.number().int().min(1),
    sku,
    physical_on_hand: z.number().int().min(0).max(10_000_000),
    source_timestamp: isoDateTime,
  })
  .strict();

/** Store -> WMS. Idempotent; external_reference is the local order number. */
export const StoreOrderSubmittedSchema = z
  .object({
    ...envelope,
    external_reference: externalReference,
    lines: z.array(z.object({ sku, qty })).min(1).max(200),
  })
  .strict();

/** WMS -> Store. Linked to the order; the source of truth for the accepted state. */
export const OrderAcceptedSchema = z
  .object({
    ...envelope,
    external_reference: externalReference,
    wms_order_id: z.string().trim().min(1).max(64),
    accepted_at: isoDateTime,
  })
  .strict();

/** WMS -> Store. Linked to the order; a reason code is required, free text is optional. */
export const OrderRejectedSchema = z
  .object({
    ...envelope,
    external_reference: externalReference,
    reason_code: z.enum(['OUT_OF_STOCK', 'INVALID_ADDRESS', 'ZONE_NOT_SERVED', 'OTHER']),
    reason_text: z.string().trim().max(500).optional(),
    rejected_at: isoDateTime,
  })
  .strict();

/** WMS -> Store. Ordered state transitions with dates. */
export const FulfillmentStatusChangedSchema = z
  .object({
    ...envelope,
    external_reference: externalReference,
    version: z.number().int().min(1),
    status: z.enum(['RECEIVED', 'PICKING', 'PACKED', 'DISPATCHED', 'CANCELLED']),
    status_at: isoDateTime,
  })
  .strict();

/** WMS -> Store. Partial rejection and return details. Only used once the owner has approved this contract. */
export const DeliveryOutcomeChangedSchema = z
  .object({
    ...envelope,
    external_reference: externalReference,
    outcome: z.enum(['DELIVERED', 'PARTIALLY_REJECTED', 'RETURNED', 'FAILED']),
    returned_lines: z.array(z.object({ sku, qty })).max(200),
    outcome_at: isoDateTime,
  })
  .strict();

/** WMS -> Store. Displayed only after the owner approves the WMS as the source of financial truth. */
export const CODSettlementStatusSchema = z
  .object({
    ...envelope,
    external_reference: externalReference,
    status: z.enum(['PENDING', 'COLLECTED', 'SETTLED', 'DISPUTED']),
    amount_iqd: iqdAmount,
    settled_at: isoDateTime.optional(),
  })
  .strict();

export const CONTRACTS = {
  ProductUpsert: ProductUpsertSchema,
  StockAvailabilityChanged: StockAvailabilityChangedSchema,
  StoreOrderSubmitted: StoreOrderSubmittedSchema,
  OrderAccepted: OrderAcceptedSchema,
  OrderRejected: OrderRejectedSchema,
  FulfillmentStatusChanged: FulfillmentStatusChangedSchema,
  DeliveryOutcomeChanged: DeliveryOutcomeChangedSchema,
  CODSettlementStatus: CODSettlementStatusSchema,
} as const;

export type ContractName = keyof typeof CONTRACTS;
export type ContractPayload<K extends ContractName> = z.infer<(typeof CONTRACTS)[K]>;
