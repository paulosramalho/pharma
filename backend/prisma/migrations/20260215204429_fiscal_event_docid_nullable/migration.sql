-- DropForeignKey
ALTER TABLE "FiscalEvent" DROP CONSTRAINT "FiscalEvent_docId_fkey";

-- AlterTable
ALTER TABLE "FiscalEvent" ALTER COLUMN "docId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "FiscalEvent" ADD CONSTRAINT "FiscalEvent_docId_fkey" FOREIGN KEY ("docId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
