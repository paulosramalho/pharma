-- CreateEnum
CREATE TYPE "FiscalEnv" AS ENUM ('HOMOLOG', 'PROD');

-- CreateEnum
CREATE TYPE "FiscalDocType" AS ENUM ('NFCE');

-- CreateEnum
CREATE TYPE "FiscalDocStatus" AS ENUM ('DRAFT', 'SIGNED', 'SENT', 'AUTHORIZED', 'REJECTED', 'CANCELED');

-- CreateTable
CREATE TABLE "FiscalConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "ie" TEXT,
    "cscId" TEXT,
    "cscToken" TEXT,
    "certPfxPath" TEXT,
    "certPassword" TEXT,
    "env" "FiscalEnv" NOT NULL DEFAULT 'HOMOLOG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "FiscalDocType" NOT NULL DEFAULT 'NFCE',
    "status" "FiscalDocStatus" NOT NULL DEFAULT 'DRAFT',
    "saleId" TEXT,
    "number" INTEGER,
    "series" INTEGER,
    "issueAt" TIMESTAMP(3),
    "accessKey" TEXT,
    "protocol" TEXT,
    "sefazReceipt" TEXT,
    "sefazMessage" TEXT,
    "xml" TEXT,
    "qrCodeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalEvent" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT,
    "protocol" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalConfig_storeId_key" ON "FiscalConfig"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_accessKey_key" ON "FiscalDocument"("accessKey");

-- CreateIndex
CREATE INDEX "FiscalDocument_storeId_status_idx" ON "FiscalDocument"("storeId", "status");

-- CreateIndex
CREATE INDEX "FiscalDocument_storeId_issueAt_idx" ON "FiscalDocument"("storeId", "issueAt");

-- AddForeignKey
ALTER TABLE "FiscalConfig" ADD CONSTRAINT "FiscalConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalEvent" ADD CONSTRAINT "FiscalEvent_docId_fkey" FOREIGN KEY ("docId") REFERENCES "FiscalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
