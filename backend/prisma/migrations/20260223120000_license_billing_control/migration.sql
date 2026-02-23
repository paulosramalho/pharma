-- License billing control: schedule, alerts and tolerance
ALTER TABLE "TenantLicense"
  ADD COLUMN IF NOT EXISTS "billingToleranceDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "alertDaysPrimary" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "alertDaysSecondary" INTEGER NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantLicensePaymentStatus') THEN
    CREATE TYPE "TenantLicensePaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantLicenseAlertType') THEN
    CREATE TYPE "TenantLicenseAlertType" AS ENUM (
      'DUE_DAYS_BEFORE_PRIMARY',
      'DUE_DAYS_BEFORE_SECONDARY',
      'DUE_EVE',
      'DUE_TODAY',
      'PAYMENT_RECEIVED',
      'THREE_BUSINESS_DAYS_OVERDUE',
      'THREE_DAYS_AFTER_OVERDUE_WARNING',
      'SERVICE_SUSPENDED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TenantLicensePayment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "licenseId" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "status" "TenantLicensePaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "paidAmountCents" INTEGER,
  "paidByUserId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantLicensePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantLicensePayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TenantLicensePayment_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "TenantLicense"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantLicensePayment_tenantId_dueDate_key" ON "TenantLicensePayment"("tenantId", "dueDate");
CREATE INDEX IF NOT EXISTS "TenantLicensePayment_tenantId_status_dueDate_idx" ON "TenantLicensePayment"("tenantId", "status", "dueDate");
CREATE INDEX IF NOT EXISTS "TenantLicensePayment_licenseId_dueDate_idx" ON "TenantLicensePayment"("licenseId", "dueDate");

CREATE TABLE IF NOT EXISTS "TenantLicenseAlert" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "paymentId" TEXT,
  "type" "TenantLicenseAlertType" NOT NULL,
  "message" TEXT NOT NULL,
  "alertDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantLicenseAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantLicenseAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TenantLicenseAlert_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "TenantLicensePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantLicenseAlert_tenantId_type_alertDate_paymentId_key" ON "TenantLicenseAlert"("tenantId", "type", "alertDate", "paymentId");
CREATE INDEX IF NOT EXISTS "TenantLicenseAlert_tenantId_alertDate_idx" ON "TenantLicenseAlert"("tenantId", "alertDate");
CREATE INDEX IF NOT EXISTS "TenantLicenseAlert_paymentId_type_idx" ON "TenantLicenseAlert"("paymentId", "type");
