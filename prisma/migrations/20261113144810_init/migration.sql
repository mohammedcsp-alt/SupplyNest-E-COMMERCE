-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('REGISTERED', 'APPROVAL_PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTRATION', 'ACCESS_RECOVERY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'ON_HOLD_LOCAL', 'CANCELLATION_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'REVIEW_REQUIRED', 'EXTENDED', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('IMPORT_SET', 'MANUAL_ADJUST', 'RESERVATION_HOLD', 'RESERVATION_RELEASE', 'RESERVATION_CONSUME', 'HANDOVER_DEDUCT', 'RETURN_RESTOCK');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'STALE_DATA', 'RESERVATION_REVIEW', 'STOCK_CONFLICT', 'SHORTAGE');

-- CreateEnum
CREATE TYPE "AlertState" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('PRODUCTS', 'PRICES');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW_VALID', 'PREVIEW_INVALID', 'COMMITTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Freshness" AS ENUM ('FRESH', 'STALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'ENUM');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING_ASSIGNMENT', 'ASSIGNED', 'PICKING', 'PICKED', 'CHECKING', 'DISCREPANCY_HOLD', 'CHECKED', 'PACKING', 'PACKED', 'HANDED_OVER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementMode" AS ENUM ('NET_DEDUCTION', 'GROSS_REMITTANCE');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('HANDED_OVER', 'DELIVERED_REPORTED', 'PARTIALLY_REJECTED', 'REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('REJECTION_PARTIAL', 'REJECTION_FULL', 'RETURN', 'CUSTOMER_REFUND', 'DISCOUNT', 'COURIER_CORRECTION');

-- CreateEnum
CREATE TYPE "RemittanceMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CancellationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('DISABLED', 'PENDING', 'SENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "userType" "UserType" NOT NULL DEFAULT 'CUSTOMER',
    "status" "AccountStatus" NOT NULL DEFAULT 'REGISTERED',
    "phoneVerifiedAt" TIMESTAMPTZ(3),
    "fullNameAr" VARCHAR(120),
    "fullNameEn" VARCHAR(120),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "legalName" VARCHAR(200),
    "businessIdentityLocked" BOOLEAN NOT NULL DEFAULT false,
    "currentPriceLevelId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_status_history" (
    "id" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "fromStatus" "AccountStatus",
    "toStatus" "AccountStatus" NOT NULL,
    "reason" VARCHAR(500),
    "actorId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameAr" VARCHAR(120),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedBy" UUID,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" VARCHAR(255),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_levels" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_price_assignments" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "priceLevelId" UUID NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" UUID,
    "reason" VARCHAR(500),

    CONSTRAINT "customer_price_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governorates" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "nameAr" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "governorates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_areas" (
    "id" UUID NOT NULL,
    "governorateId" UUID NOT NULL,
    "nameAr" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "delivery_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "governorateId" UUID NOT NULL,
    "areaId" UUID,
    "label" VARCHAR(80),
    "details" VARCHAR(500) NOT NULL,
    "recipientName" VARCHAR(120) NOT NULL,
    "recipientPhone" VARCHAR(20) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_rate_rules" (
    "id" UUID NOT NULL,
    "governorateId" UUID NOT NULL,
    "areaId" UUID,
    "amount" DECIMAL(18,0) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_rate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "parentId" UUID,
    "slug" VARCHAR(120) NOT NULL,
    "nameAr" VARCHAR(160) NOT NULL,
    "nameEn" VARCHAR(160) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_definitions" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "labelAr" VARCHAR(120) NOT NULL,
    "labelEn" VARCHAR(120) NOT NULL,
    "dataType" "AttributeType" NOT NULL DEFAULT 'TEXT',
    "unit" VARCHAR(20),
    "options" JSONB,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attribute_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sku_attribute_values" (
    "skuId" UUID NOT NULL,
    "attributeDefinitionId" UUID NOT NULL,
    "value" VARCHAR(500) NOT NULL,

    CONSTRAINT "sku_attribute_values_pkey" PRIMARY KEY ("skuId","attributeDefinitionId")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_models" (
    "id" UUID NOT NULL,
    "brandId" UUID,
    "name" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualities" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "nameAr" VARCHAR(120) NOT NULL,
    "nameEn" VARCHAR(120) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "qualities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_skus" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "categoryId" UUID NOT NULL,
    "brandId" UUID,
    "modelId" UUID,
    "qualityId" UUID,
    "nameAr" VARCHAR(255) NOT NULL,
    "nameEn" VARCHAR(255) NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'PCS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sku_images" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "fileKey" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "altText" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sku_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier_prices" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "priceLevelId" UUID NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "tier_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_change_history" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "priceLevelId" UUID NOT NULL,
    "oldAmount" DECIMAL(18,0),
    "newAmount" DECIMAL(18,0) NOT NULL,
    "actorId" UUID,
    "source" VARCHAR(40) NOT NULL,
    "importId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "skuId" UUID NOT NULL,
    "physicalOnHand" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "sourceTimestamp" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("skuId")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "reviewedById" UUID,
    "reviewReason" VARCHAR(500),
    "releasedAt" TIMESTAMPTZ(3),
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "qtyDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "sourceRef" VARCHAR(120),
    "actorId" UUID,
    "note" VARCHAR(500),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_alerts" (
    "id" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "state" "AlertState" NOT NULL DEFAULT 'OPEN',
    "detail" JSONB,
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "inventory_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "sourceGeneratedAt" TIMESTAMPTZ(3),
    "freshness" "Freshness" NOT NULL DEFAULT 'UNKNOWN',
    "status" "ImportStatus" NOT NULL,
    "uploadedById" UUID,
    "payload" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "overrideById" UUID,
    "overrideReason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMPTZ(3),

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_errors" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "field" VARCHAR(60),
    "code" VARCHAR(60) NOT NULL,
    "message" VARCHAR(500) NOT NULL,

    CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "cartId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("cartId","skuId")
);

-- CreateTable
CREATE TABLE "favorites" (
    "customerId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("customerId","skuId")
);

-- CreateTable
CREATE TABLE "recent_views" (
    "customerId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "viewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recent_views_pkey" PRIMARY KEY ("customerId","skuId")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "orderNumber" VARCHAR(32) NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "subtotal" DECIMAL(18,0) NOT NULL,
    "shippingFee" DECIMAL(18,0) NOT NULL,
    "totalCod" DECIMAL(18,0) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "governorateId" UUID NOT NULL,
    "areaId" UUID,
    "addressSnapshot" JSONB NOT NULL,
    "priceLevelCode" VARCHAR(40) NOT NULL,
    "customerNote" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "fulfillmentLockedAt" TIMESTAMPTZ(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "skuSnapshot" VARCHAR(64) NOT NULL,
    "titleSnapshot" VARCHAR(255) NOT NULL,
    "qualitySnapshot" VARCHAR(120),
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,0) NOT NULL,
    "lineTotal" DECIMAL(18,0) NOT NULL,
    "priceLevelCode" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "eventType" VARCHAR(60) NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "actorId" UUID,
    "reason" VARCHAR(500),
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_requests" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "CancellationStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_proposals" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "rationale" VARCHAR(500) NOT NULL,
    "proposedById" UUID,
    "respondedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_proposal_orders" (
    "proposalId" UUID NOT NULL,
    "orderId" UUID NOT NULL,

    CONSTRAINT "merge_proposal_orders_pkey" PRIMARY KEY ("proposalId","orderId")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(128) NOT NULL,
    "orderId" UUID,
    "status" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_order_uploads" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "validationSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_order_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_pages" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "titleAr" VARCHAR(200) NOT NULL,
    "titleEn" VARCHAR(200) NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cms_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_banners" (
    "id" UUID NOT NULL,
    "titleAr" VARCHAR(200) NOT NULL,
    "titleEn" VARCHAR(200) NOT NULL,
    "imageKey" VARCHAR(255),
    "targetPath" VARCHAR(255) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "activeFrom" TIMESTAMPTZ(3),
    "activeTo" TIMESTAMPTZ(3),

    CONSTRAINT "cms_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "reason" VARCHAR(500),
    "ip" VARCHAR(64),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "reportType" VARCHAR(60) NOT NULL,
    "format" VARCHAR(10) NOT NULL,
    "filters" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "checksum" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_rate_limits" (
    "id" UUID NOT NULL,
    "subjectHash" VARCHAR(128) NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMPTZ(3),

    CONSTRAINT "security_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "kind" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "artifactPath" VARCHAR(500),
    "checksum" VARCHAR(128),
    "rowCounts" JSONB,
    "restoreTestAt" TIMESTAMPTZ(3),
    "restoreResult" VARCHAR(20),
    "evidence" JSONB,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_outbox" (
    "id" UUID NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "aggregateId" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'DISABLED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "valueJson" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "fulfillment_jobs" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING_ASSIGNMENT',
    "prepDocumentNo" VARCHAR(40) NOT NULL,
    "prepPrintCount" INTEGER NOT NULL DEFAULT 0,
    "assignedPickerId" UUID,
    "assignedCheckerId" UUID,
    "assignedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fulfillment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_events" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "eventType" VARCHAR(60) NOT NULL,
    "actorId" UUID,
    "metadata" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pick_lines" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "pickedQty" INTEGER,
    "checkedQty" INTEGER,
    "discrepancyReason" VARCHAR(500),
    "resolvedQty" INTEGER,
    "resolvedById" UUID,

    CONSTRAINT "pick_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "packageNo" INTEGER NOT NULL,
    "trackingCode" VARCHAR(80),
    "weightGrams" INTEGER,
    "label" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couriers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "contact" VARCHAR(200),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_agreements" (
    "id" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "settlementMode" "SettlementMode" NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "governorateId" UUID,
    "serviceFee" DECIMAL(18,0) NOT NULL,
    "returnFee" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "feeRuleJson" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_shipments" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "agreementId" UUID NOT NULL,
    "settlementModeSnapshot" "SettlementMode" NOT NULL,
    "customerFeeSnapshot" DECIMAL(18,0) NOT NULL,
    "courierFeeSnapshot" DECIMAL(18,0) NOT NULL,
    "codExpectedBase" DECIMAL(18,0) NOT NULL,
    "codCollected" DECIMAL(18,0),
    "codCollectedAt" TIMESTAMPTZ(3),
    "courierFeeDeducted" DECIMAL(18,0),
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'HANDED_OVER',
    "handedOverAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handedOverById" UUID,
    "trackingNote" VARCHAR(255),

    CONSTRAINT "courier_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_financial_events" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "eventType" VARCHAR(60) NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "reference" VARCHAR(120),
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,

    CONSTRAINT "courier_financial_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_remittances" (
    "id" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "grossAmount" DECIMAL(18,0) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "method" "RemittanceMethod" NOT NULL DEFAULT 'CASH',
    "note" VARCHAR(500),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" VARCHAR(128) NOT NULL,

    CONSTRAINT "courier_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remittance_allocations" (
    "id" UUID NOT NULL,
    "remittanceId" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "allocatedAmount" DECIMAL(18,0) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remittance_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_fee_payments" (
    "id" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "agreementId" UUID,
    "amount" DECIMAL(18,0) NOT NULL,
    "paidAt" TIMESTAMPTZ(3) NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "recordedById" UUID,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courier_fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_adjustments" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "signedAmount" DECIMAL(18,0) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "requestedById" UUID,
    "approvedById" UUID NOT NULL,
    "reversesId" UUID,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" UUID NOT NULL,
    "invoiceNumber" VARCHAR(40) NOT NULL,
    "orderId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IQD',
    "goodsTotal" DECIMAL(18,0) NOT NULL,
    "customerDeliveryFee" DECIMAL(18,0) NOT NULL,
    "grandTotal" DECIMAL(18,0) NOT NULL,
    "lines" JSONB NOT NULL,
    "reason" VARCHAR(500),
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" UUID,
    "printCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_userType_status_idx" ON "users"("userType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_userId_key" ON "customer_profiles"("userId");

-- CreateIndex
CREATE INDEX "account_status_history_subjectId_occurredAt_idx" ON "account_status_history"("subjectId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "otp_challenges_userId_createdAt_idx" ON "otp_challenges"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "price_levels_code_key" ON "price_levels"("code");

-- CreateIndex
CREATE INDEX "customer_price_assignments_customerId_effectiveAt_idx" ON "customer_price_assignments"("customerId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "governorates_code_key" ON "governorates"("code");

-- CreateIndex
CREATE INDEX "delivery_areas_governorateId_idx" ON "delivery_areas"("governorateId");

-- CreateIndex
CREATE INDEX "addresses_customerId_idx" ON "addresses"("customerId");

-- CreateIndex
CREATE INDEX "shipping_rate_rules_governorateId_areaId_effectiveFrom_idx" ON "shipping_rate_rules"("governorateId", "areaId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_definitions_categoryId_key_key" ON "attribute_definitions"("categoryId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_models_brandId_normalizedName_key" ON "product_models"("brandId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "qualities_code_key" ON "qualities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_skus_sku_key" ON "product_skus"("sku");

-- CreateIndex
CREATE INDEX "product_skus_categoryId_idx" ON "product_skus"("categoryId");

-- CreateIndex
CREATE INDEX "product_skus_modelId_idx" ON "product_skus"("modelId");

-- CreateIndex
CREATE INDEX "product_skus_published_active_idx" ON "product_skus"("published", "active");

-- CreateIndex
CREATE UNIQUE INDEX "sku_images_fileKey_key" ON "sku_images"("fileKey");

-- CreateIndex
CREATE UNIQUE INDEX "sku_images_skuId_sortOrder_key" ON "sku_images"("skuId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "tier_prices_skuId_priceLevelId_key" ON "tier_prices"("skuId", "priceLevelId");

-- CreateIndex
CREATE INDEX "price_change_history_skuId_occurredAt_idx" ON "price_change_history"("skuId", "occurredAt");

-- CreateIndex
CREATE INDEX "inventory_reservations_orderId_idx" ON "inventory_reservations"("orderId");

-- CreateIndex
CREATE INDEX "inventory_reservations_skuId_status_idx" ON "inventory_reservations"("skuId", "status");

-- CreateIndex
CREATE INDEX "inventory_reservations_status_expiresAt_idx" ON "inventory_reservations"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "inventory_movements_skuId_occurredAt_idx" ON "inventory_movements"("skuId", "occurredAt");

-- CreateIndex
CREATE INDEX "inventory_alerts_state_alertType_idx" ON "inventory_alerts"("state", "alertType");

-- CreateIndex
CREATE INDEX "imports_type_status_idx" ON "imports"("type", "status");

-- CreateIndex
CREATE INDEX "import_errors_importId_idx" ON "import_errors"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "carts_customerId_key" ON "carts"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_customerId_submittedAt_idx" ON "orders"("customerId", "submittedAt");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_events_orderId_occurredAt_idx" ON "order_events"("orderId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_requests_orderId_key" ON "cancellation_requests"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_orderId_key" ON "idempotency_records"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_customerId_key_key" ON "idempotency_records"("customerId", "key");

-- CreateIndex
CREATE INDEX "bulk_order_uploads_customerId_idx" ON "bulk_order_uploads"("customerId");

-- CreateIndex
CREATE INDEX "notifications_recipientId_readAt_idx" ON "notifications"("recipientId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "cms_pages_slug_key" ON "cms_pages"("slug");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_occurredAt_idx" ON "audit_logs"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_occurredAt_idx" ON "audit_logs"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "security_rate_limits_subjectHash_action_windowStart_key" ON "security_rate_limits"("subjectHash", "action", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_jobs_orderId_key" ON "fulfillment_jobs"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_jobs_prepDocumentNo_key" ON "fulfillment_jobs"("prepDocumentNo");

-- CreateIndex
CREATE INDEX "fulfillment_jobs_status_idx" ON "fulfillment_jobs"("status");

-- CreateIndex
CREATE INDEX "fulfillment_events_jobId_occurredAt_idx" ON "fulfillment_events"("jobId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "pick_lines_jobId_orderItemId_key" ON "pick_lines"("jobId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "packages_jobId_packageNo_key" ON "packages"("jobId", "packageNo");

-- CreateIndex
CREATE UNIQUE INDEX "couriers_name_key" ON "couriers"("name");

-- CreateIndex
CREATE INDEX "courier_agreements_courierId_effectiveFrom_idx" ON "courier_agreements"("courierId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "courier_shipments_orderId_key" ON "courier_shipments"("orderId");

-- CreateIndex
CREATE INDEX "courier_shipments_courierId_idx" ON "courier_shipments"("courierId");

-- CreateIndex
CREATE UNIQUE INDEX "courier_financial_events_idempotencyKey_key" ON "courier_financial_events"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "courier_remittances_idempotencyKey_key" ON "courier_remittances"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "courier_remittances_courierId_reference_key" ON "courier_remittances"("courierId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "remittance_allocations_remittanceId_shipmentId_key" ON "remittance_allocations"("remittanceId", "shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "courier_fee_payments_idempotencyKey_key" ON "courier_fee_payments"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "courier_fee_payments_courierId_reference_key" ON "courier_fee_payments"("courierId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "financial_adjustments_reversesId_key" ON "financial_adjustments"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_adjustments_idempotencyKey_key" ON "financial_adjustments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "financial_adjustments_shipmentId_idx" ON "financial_adjustments"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_invoiceNumber_key" ON "sales_invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_orderId_revision_key" ON "sales_invoices"("orderId", "revision");

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_currentPriceLevelId_fkey" FOREIGN KEY ("currentPriceLevelId") REFERENCES "price_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_status_history" ADD CONSTRAINT "account_status_history_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_assignments" ADD CONSTRAINT "customer_price_assignments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_assignments" ADD CONSTRAINT "customer_price_assignments_priceLevelId_fkey" FOREIGN KEY ("priceLevelId") REFERENCES "price_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_areas" ADD CONSTRAINT "delivery_areas_governorateId_fkey" FOREIGN KEY ("governorateId") REFERENCES "governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_governorateId_fkey" FOREIGN KEY ("governorateId") REFERENCES "governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "delivery_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rate_rules" ADD CONSTRAINT "shipping_rate_rules_governorateId_fkey" FOREIGN KEY ("governorateId") REFERENCES "governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rate_rules" ADD CONSTRAINT "shipping_rate_rules_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "delivery_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_definitions" ADD CONSTRAINT "attribute_definitions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_attribute_values" ADD CONSTRAINT "sku_attribute_values_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_attribute_values" ADD CONSTRAINT "sku_attribute_values_attributeDefinitionId_fkey" FOREIGN KEY ("attributeDefinitionId") REFERENCES "attribute_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_skus" ADD CONSTRAINT "product_skus_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_skus" ADD CONSTRAINT "product_skus_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_skus" ADD CONSTRAINT "product_skus_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "product_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_skus" ADD CONSTRAINT "product_skus_qualityId_fkey" FOREIGN KEY ("qualityId") REFERENCES "qualities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_images" ADD CONSTRAINT "sku_images_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_prices" ADD CONSTRAINT "tier_prices_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_prices" ADD CONSTRAINT "tier_prices_priceLevelId_fkey" FOREIGN KEY ("priceLevelId") REFERENCES "price_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_change_history" ADD CONSTRAINT "price_change_history_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_change_history" ADD CONSTRAINT "price_change_history_priceLevelId_fkey" FOREIGN KEY ("priceLevelId") REFERENCES "price_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recent_views" ADD CONSTRAINT "recent_views_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recent_views" ADD CONSTRAINT "recent_views_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_proposal_orders" ADD CONSTRAINT "merge_proposal_orders_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "merge_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_proposal_orders" ADD CONSTRAINT "merge_proposal_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_jobs" ADD CONSTRAINT "fulfillment_jobs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_events" ADD CONSTRAINT "fulfillment_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "fulfillment_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_lines" ADD CONSTRAINT "pick_lines_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "fulfillment_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_lines" ADD CONSTRAINT "pick_lines_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "fulfillment_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_agreements" ADD CONSTRAINT "courier_agreements_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_agreements" ADD CONSTRAINT "courier_agreements_governorateId_fkey" FOREIGN KEY ("governorateId") REFERENCES "governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_shipments" ADD CONSTRAINT "courier_shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_shipments" ADD CONSTRAINT "courier_shipments_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_shipments" ADD CONSTRAINT "courier_shipments_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "courier_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_financial_events" ADD CONSTRAINT "courier_financial_events_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "courier_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_remittances" ADD CONSTRAINT "courier_remittances_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remittance_allocations" ADD CONSTRAINT "remittance_allocations_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "courier_remittances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remittance_allocations" ADD CONSTRAINT "remittance_allocations_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "courier_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_fee_payments" ADD CONSTRAINT "courier_fee_payments_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "courier_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
