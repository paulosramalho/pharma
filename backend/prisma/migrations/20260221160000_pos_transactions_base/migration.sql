-- CreateTable
CREATE TABLE "PosTransaction" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL,
    "transactionId" TEXT,
    "nsu" TEXT,
    "authorizationCode" TEXT,
    "cardBrand" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosTransaction_paymentId_key" ON "PosTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "PosTransaction_saleId_createdAt_idx" ON "PosTransaction"("saleId", "createdAt");

-- CreateIndex
CREATE INDEX "PosTransaction_status_createdAt_idx" ON "PosTransaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PosTransaction_provider_createdAt_idx" ON "PosTransaction"("provider", "createdAt");

-- AddForeignKey
ALTER TABLE "PosTransaction" ADD CONSTRAINT "PosTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransaction" ADD CONSTRAINT "PosTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
