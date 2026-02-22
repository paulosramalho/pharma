-- phase 3: tenant enforcement on child/operational tables

ALTER TABLE "InventoryLot" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PosTransaction" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Discount" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Address" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Delivery" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "StockTransferItem" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "StockReservationItem" ADD COLUMN "tenantId" TEXT;

UPDATE "InventoryLot" l
SET "tenantId" = s."tenantId"
FROM "Store" s
WHERE l."storeId" = s."id" AND l."tenantId" IS NULL;

UPDATE "InventoryMovement" m
SET "tenantId" = s."tenantId"
FROM "Store" s
WHERE m."storeId" = s."id" AND m."tenantId" IS NULL;

UPDATE "SaleItem" si
SET "tenantId" = sa."tenantId"
FROM "Sale" sa
WHERE si."saleId" = sa."id" AND si."tenantId" IS NULL;

UPDATE "Payment" p
SET "tenantId" = sa."tenantId"
FROM "Sale" sa
WHERE p."saleId" = sa."id" AND p."tenantId" IS NULL;

UPDATE "PosTransaction" pt
SET "tenantId" = sa."tenantId"
FROM "Sale" sa
WHERE pt."saleId" = sa."id" AND pt."tenantId" IS NULL;

UPDATE "Discount" d
SET "tenantId" = pr."tenantId"
FROM "Product" pr
WHERE d."productId" = pr."id" AND d."tenantId" IS NULL;

UPDATE "Address" a
SET "tenantId" = c."tenantId"
FROM "Customer" c
WHERE a."customerId" = c."id" AND a."tenantId" IS NULL;

UPDATE "Delivery" d
SET "tenantId" = sa."tenantId"
FROM "Sale" sa
WHERE d."saleId" = sa."id" AND d."tenantId" IS NULL;

UPDATE "StockTransferItem" ti
SET "tenantId" = t."tenantId"
FROM "StockTransfer" t
WHERE ti."transferId" = t."id" AND ti."tenantId" IS NULL;

UPDATE "StockReservationItem" ri
SET "tenantId" = r."tenantId"
FROM "StockReservation" r
WHERE ri."reservationId" = r."id" AND ri."tenantId" IS NULL;

ALTER TABLE "InventoryLot" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "InventoryMovement" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SaleItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PosTransaction" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Discount" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Address" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Delivery" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "StockTransferItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "StockReservationItem" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosTransaction" ADD CONSTRAINT "PosTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReservationItem" ADD CONSTRAINT "StockReservationItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "InventoryLot_tenantId_storeId_productId_idx" ON "InventoryLot"("tenantId", "storeId", "productId");
CREATE INDEX "InventoryMovement_tenantId_storeId_createdAt_idx" ON "InventoryMovement"("tenantId", "storeId", "createdAt");
CREATE INDEX "SaleItem_tenantId_saleId_idx" ON "SaleItem"("tenantId", "saleId");
CREATE INDEX "Payment_tenantId_saleId_createdAt_idx" ON "Payment"("tenantId", "saleId", "createdAt");
CREATE INDEX "PosTransaction_tenantId_saleId_createdAt_idx" ON "PosTransaction"("tenantId", "saleId", "createdAt");
CREATE INDEX "Discount_tenantId_productId_active_idx" ON "Discount"("tenantId", "productId", "active");
CREATE INDEX "Address_tenantId_customerId_idx" ON "Address"("tenantId", "customerId");
CREATE INDEX "Delivery_tenantId_storeId_createdAt_idx" ON "Delivery"("tenantId", "storeId", "createdAt");
CREATE INDEX "StockTransferItem_tenantId_transferId_idx" ON "StockTransferItem"("tenantId", "transferId");
CREATE INDEX "StockReservationItem_tenantId_reservationId_idx" ON "StockReservationItem"("tenantId", "reservationId");

