-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELED', 'FULFILLED');

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "requestStoreId" TEXT NOT NULL,
    "sourceStoreId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "requestedById" TEXT,
    "reviewedById" TEXT,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservationItem" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockReservationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockReservation_requestStoreId_createdAt_idx" ON "StockReservation"("requestStoreId", "createdAt");

-- CreateIndex
CREATE INDEX "StockReservation_sourceStoreId_createdAt_idx" ON "StockReservation"("sourceStoreId", "createdAt");

-- CreateIndex
CREATE INDEX "StockReservation_status_idx" ON "StockReservation"("status");

-- CreateIndex
CREATE INDEX "StockReservationItem_reservationId_idx" ON "StockReservationItem"("reservationId");

-- CreateIndex
CREATE INDEX "StockReservationItem_productId_idx" ON "StockReservationItem"("productId");

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_requestStoreId_fkey" FOREIGN KEY ("requestStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_sourceStoreId_fkey" FOREIGN KEY ("sourceStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservationItem" ADD CONSTRAINT "StockReservationItem_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StockReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservationItem" ADD CONSTRAINT "StockReservationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
