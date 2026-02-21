-- CreateTable
CREATE TABLE "SaleControlledDispensation" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientDocument" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerDocument" TEXT NOT NULL,
    "prescriberName" TEXT NOT NULL,
    "prescriberCrm" TEXT NOT NULL,
    "prescriberUf" TEXT NOT NULL,
    "prescriptionNumber" TEXT NOT NULL,
    "prescriptionDate" TIMESTAMP(3) NOT NULL,
    "signatureDataUrl" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleControlledDispensation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleControlledDispensation_saleId_key" ON "SaleControlledDispensation"("saleId");

-- CreateIndex
CREATE INDEX "SaleControlledDispensation_createdById_idx" ON "SaleControlledDispensation"("createdById");

-- CreateIndex
CREATE INDEX "SaleControlledDispensation_prescriberCrm_idx" ON "SaleControlledDispensation"("prescriberCrm");

-- AddForeignKey
ALTER TABLE "SaleControlledDispensation" ADD CONSTRAINT "SaleControlledDispensation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
