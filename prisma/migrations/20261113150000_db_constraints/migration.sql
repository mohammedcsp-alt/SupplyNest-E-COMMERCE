-- DB-level integrity guards that Prisma cannot express in schema.prisma.
-- Naming: tables are snake_case (@@map); columns use Prisma's camelCase defaults.
-- Money: IQD whole dinars; amounts are non-negative unless the row type encodes direction.

-- Inventory never negative (INV-01, ACX-02).
ALTER TABLE "inventory_balances"
  ADD CONSTRAINT "inv_physical_nonneg" CHECK ("physicalOnHand" >= 0),
  ADD CONSTRAINT "inv_reserved_nonneg" CHECK ("reservedQty" >= 0);

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "resv_qty_positive" CHECK ("qty" > 0);

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_qty_positive" CHECK ("qty" > 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_item_qty_positive" CHECK ("qty" > 0),
  ADD CONSTRAINT "order_item_amounts_nonneg" CHECK ("unitPrice" >= 0 AND "lineTotal" >= 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "order_amounts_nonneg" CHECK ("subtotal" >= 0 AND "shippingFee" >= 0 AND "totalCod" >= 0);

ALTER TABLE "tier_prices"
  ADD CONSTRAINT "tier_price_nonneg" CHECK ("amount" >= 0);

ALTER TABLE "shipping_rate_rules"
  ADD CONSTRAINT "shipping_amount_nonneg" CHECK ("amount" >= 0);

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "movement_balance_nonneg" CHECK ("balanceAfter" >= 0);

-- Finance
ALTER TABLE "courier_remittances"
  ADD CONSTRAINT "remit_gross_positive" CHECK ("grossAmount" > 0);

ALTER TABLE "remittance_allocations"
  ADD CONSTRAINT "alloc_positive" CHECK ("allocatedAmount" > 0);

ALTER TABLE "courier_fee_payments"
  ADD CONSTRAINT "fee_payment_positive" CHECK ("amount" > 0);

ALTER TABLE "courier_financial_events"
  ADD CONSTRAINT "fin_event_nonneg" CHECK ("amount" >= 0);

ALTER TABLE "courier_shipments"
  ADD CONSTRAINT "shipment_amounts_nonneg" CHECK (
    "customerFeeSnapshot" >= 0 AND "courierFeeSnapshot" >= 0 AND "codExpectedBase" >= 0
    AND ("codCollected" IS NULL OR "codCollected" >= 0)
    AND ("courierFeeDeducted" IS NULL OR "courierFeeDeducted" >= 0)
  );

ALTER TABLE "pick_lines"
  ADD CONSTRAINT "pick_qty_nonneg" CHECK (
    "requestedQty" > 0
    AND ("pickedQty" IS NULL OR "pickedQty" >= 0)
    AND ("checkedQty" IS NULL OR "checkedQty" >= 0)
    AND ("resolvedQty" IS NULL OR "resolvedQty" >= 0)
  );

ALTER TABLE "sales_invoices"
  ADD CONSTRAINT "invoice_totals_nonneg" CHECK ("goodsTotal" >= 0 AND "customerDeliveryFee" >= 0 AND "grandTotal" >= 0);

-- At most ONE open alert per SKU and alert type (no unbounded duplicates).
CREATE UNIQUE INDEX "inventory_alerts_one_open_per_type"
  ON "inventory_alerts" ("skuId", "alertType") WHERE "state" = 'OPEN';

-- An order holds at most one live reservation per SKU.
CREATE UNIQUE INDEX "resv_one_live_per_order_sku"
  ON "inventory_reservations" ("orderId", "skuId") WHERE "status" IN ('ACTIVE', 'REVIEW_REQUIRED', 'EXTENDED');

-- Max 10 images per SKU enforced in the database (PRODUCT-006).
CREATE OR REPLACE FUNCTION "enforce_max_sku_images"() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM "sku_images" WHERE "skuId" = NEW."skuId") >= 10 THEN
    RAISE EXCEPTION 'SKU_IMAGE_LIMIT_EXCEEDED: a SKU may have at most 10 images' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sku_images_max_10"
  BEFORE INSERT ON "sku_images"
  FOR EACH ROW EXECUTE FUNCTION "enforce_max_sku_images"();

-- Audit log is append-only (ADMIN-005): UPDATE and DELETE are rejected.
CREATE OR REPLACE FUNCTION "audit_logs_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();

-- Posted financial rows are immutable: corrections are NEW rows (ACC-11).
CREATE OR REPLACE FUNCTION "financial_rows_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'posted financial rows are immutable; record a reversal or correction instead' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "financial_adjustments_immutable"
  BEFORE UPDATE OR DELETE ON "financial_adjustments"
  FOR EACH ROW EXECUTE FUNCTION "financial_rows_immutable"();
CREATE TRIGGER "courier_financial_events_immutable"
  BEFORE UPDATE OR DELETE ON "courier_financial_events"
  FOR EACH ROW EXECUTE FUNCTION "financial_rows_immutable"();
CREATE TRIGGER "courier_remittances_immutable"
  BEFORE UPDATE OR DELETE ON "courier_remittances"
  FOR EACH ROW EXECUTE FUNCTION "financial_rows_immutable"();
CREATE TRIGGER "courier_fee_payments_immutable"
  BEFORE UPDATE OR DELETE ON "courier_fee_payments"
  FOR EACH ROW EXECUTE FUNCTION "financial_rows_immutable"();

-- Sequential sales invoice numbers.
CREATE SEQUENCE IF NOT EXISTS "sales_invoice_seq" START 1;
