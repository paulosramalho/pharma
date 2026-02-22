-- tenant + licensing foundation

CREATE TYPE "LicenseStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'EXPIRED', 'CANCELED');

CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

INSERT INTO "Tenant" ("id", "name", "slug", "active")
VALUES ('00000000-0000-0000-0000-000000000001', 'Tenant Default', 'default', true)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "TenantLicense" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "graceUntil" TIMESTAMP(3),
  "updatedById" TEXT,
  "updatedByName" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantLicense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantLicense_tenantId_key" ON "TenantLicense"("tenantId");
CREATE INDEX "TenantLicense_planCode_status_idx" ON "TenantLicense"("planCode", "status");

CREATE TABLE "TenantLicenseAudit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "previousPlan" TEXT,
  "newPlan" TEXT NOT NULL,
  "previousStatus" "LicenseStatus",
  "newStatus" "LicenseStatus" NOT NULL,
  "changedById" TEXT,
  "changedByName" TEXT,
  "reason" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantLicenseAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TenantLicenseAudit_tenantId_createdAt_idx" ON "TenantLicenseAudit"("tenantId", "createdAt");

ALTER TABLE "Store" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Category" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Product" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CashSession" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "StockTransfer" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "StockReservation" ADD COLUMN "tenantId" TEXT;

UPDATE "Store" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "User" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "Category" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "Product" p SET "tenantId" = COALESCE(c."tenantId", '00000000-0000-0000-0000-000000000001')
FROM "Category" c
WHERE p."categoryId" = c."id" AND p."tenantId" IS NULL;
UPDATE "Product" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "Customer" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

UPDATE "Sale" s
SET "tenantId" = st."tenantId"
FROM "Store" st
WHERE s."storeId" = st."id" AND s."tenantId" IS NULL;
UPDATE "Sale" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

UPDATE "CashSession" cs
SET "tenantId" = st."tenantId"
FROM "Store" st
WHERE cs."storeId" = st."id" AND cs."tenantId" IS NULL;
UPDATE "CashSession" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

UPDATE "StockTransfer" t
SET "tenantId" = st."tenantId"
FROM "Store" st
WHERE t."originStoreId" = st."id" AND t."tenantId" IS NULL;
UPDATE "StockTransfer" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

UPDATE "StockReservation" r
SET "tenantId" = st."tenantId"
FROM "Store" st
WHERE r."requestStoreId" = st."id" AND r."tenantId" IS NULL;
UPDATE "StockReservation" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

UPDATE "ChatMessage" cm
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE cm."senderId" = u."id" AND cm."tenantId" IS NULL;
UPDATE "ChatMessage" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

UPDATE "AuditLog" al
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE al."userId" = u."id" AND al."tenantId" IS NULL;

UPDATE "AuditLog" al
SET "tenantId" = st."tenantId"
FROM "Store" st
WHERE al."storeId" = st."id" AND al."tenantId" IS NULL;

UPDATE "AuditLog" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

ALTER TABLE "Store" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CashSession" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "StockTransfer" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "StockReservation" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "TenantLicense" ADD CONSTRAINT "TenantLicense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantLicenseAudit" ADD CONSTRAINT "TenantLicenseAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Store" ADD CONSTRAINT "Store_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Store_tenantId_type_idx" ON "Store"("tenantId", "type");
CREATE INDEX "Store_tenantId_active_idx" ON "Store"("tenantId", "active");
CREATE INDEX "User_tenantId_active_idx" ON "User"("tenantId", "active");
CREATE INDEX "User_tenantId_lastSeenAt_idx" ON "User"("tenantId", "lastSeenAt");
CREATE INDEX "User_tenantId_email_idx" ON "User"("tenantId", "email");
CREATE INDEX "ChatMessage_tenantId_senderId_createdAt_idx" ON "ChatMessage"("tenantId", "senderId", "createdAt");
CREATE INDEX "ChatMessage_tenantId_recipientId_createdAt_idx" ON "ChatMessage"("tenantId", "recipientId", "createdAt");
CREATE INDEX "ChatMessage_tenantId_recipientId_readAt_idx" ON "ChatMessage"("tenantId", "recipientId", "readAt");
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AuditLog_tenantId_storeId_idx" ON "AuditLog"("tenantId", "storeId");
CREATE INDEX "AuditLog_tenantId_userId_idx" ON "AuditLog"("tenantId", "userId");
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");
CREATE INDEX "Product_tenantId_active_idx" ON "Product"("tenantId", "active");
CREATE INDEX "Product_tenantId_controlled_idx" ON "Product"("tenantId", "controlled");
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");
CREATE INDEX "Product_tenantId_name_idx" ON "Product"("tenantId", "name");
CREATE INDEX "Category_tenantId_name_idx" ON "Category"("tenantId", "name");
CREATE INDEX "Sale_tenantId_storeId_createdAt_idx" ON "Sale"("tenantId", "storeId", "createdAt");
CREATE INDEX "Sale_tenantId_status_idx" ON "Sale"("tenantId", "status");
CREATE INDEX "Sale_tenantId_number_idx" ON "Sale"("tenantId", "number");
CREATE INDEX "CashSession_tenantId_storeId_openedAt_idx" ON "CashSession"("tenantId", "storeId", "openedAt");
CREATE INDEX "CashSession_tenantId_closedAt_idx" ON "CashSession"("tenantId", "closedAt");
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");
CREATE INDEX "Customer_tenantId_document_idx" ON "Customer"("tenantId", "document");
CREATE INDEX "StockTransfer_tenantId_originStoreId_createdAt_idx" ON "StockTransfer"("tenantId", "originStoreId", "createdAt");
CREATE INDEX "StockTransfer_tenantId_destinationStoreId_createdAt_idx" ON "StockTransfer"("tenantId", "destinationStoreId", "createdAt");
CREATE INDEX "StockTransfer_tenantId_status_idx" ON "StockTransfer"("tenantId", "status");
CREATE INDEX "StockTransfer_tenantId_createdById_createdAt_idx" ON "StockTransfer"("tenantId", "createdById", "createdAt");
CREATE INDEX "StockReservation_tenantId_requestStoreId_createdAt_idx" ON "StockReservation"("tenantId", "requestStoreId", "createdAt");
CREATE INDEX "StockReservation_tenantId_sourceStoreId_createdAt_idx" ON "StockReservation"("tenantId", "sourceStoreId", "createdAt");
CREATE INDEX "StockReservation_tenantId_status_idx" ON "StockReservation"("tenantId", "status");
CREATE INDEX "StockReservation_tenantId_requestedById_createdAt_idx" ON "StockReservation"("tenantId", "requestedById", "createdAt");

INSERT INTO "TenantLicense" (
  "id", "tenantId", "planCode", "status", "startsAt", "updatedAt", "createdAt"
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000001',
  COALESCE(NULLIF(upper(current_setting('app.license_plan', true)), ''), 'MINIMO'),
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("tenantId") DO NOTHING;

