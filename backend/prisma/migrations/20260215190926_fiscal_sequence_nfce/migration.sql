-- CreateTable
CREATE TABLE "FiscalSequence" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "docType" "FiscalDocType" NOT NULL DEFAULT 'NFCE',
    "series" INTEGER NOT NULL DEFAULT 1,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiscalSequence_storeId_idx" ON "FiscalSequence"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalSequence_storeId_docType_series_key" ON "FiscalSequence"("storeId", "docType", "series");

-- AddForeignKey
ALTER TABLE "FiscalSequence" ADD CONSTRAINT "FiscalSequence_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
