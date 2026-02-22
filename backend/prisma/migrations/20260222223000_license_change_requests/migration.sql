-- licensing change request workflow (contractor -> master -> contractor approval)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LicenseChangeRequestStatus') THEN
    CREATE TYPE "LicenseChangeRequestStatus" AS ENUM (
      'PENDING_MASTER_REVIEW',
      'PENDING_CONTRACTOR_APPROVAL',
      'APPLIED',
      'REJECTED',
      'CANCELED'
    );
  END IF;
END $$;

ALTER TABLE "TenantLicense"
  ADD COLUMN IF NOT EXISTS "addonMaxActiveUsers" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "addonMaxRoleActive" JSONB,
  ADD COLUMN IF NOT EXISTS "overrideMonthlyPriceCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "overrideAnnualPriceCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "extrasDescription" TEXT;

CREATE TABLE IF NOT EXISTS "TenantLicenseChangeRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" "LicenseChangeRequestStatus" NOT NULL DEFAULT 'PENDING_MASTER_REVIEW',
  "currentPlanCode" TEXT NOT NULL,
  "currentEndsAt" TIMESTAMP(3),
  "currentMonthlyPriceCents" INTEGER NOT NULL,
  "currentAnnualPriceCents" INTEGER NOT NULL,
  "requestedTotalUsers" INTEGER NOT NULL,
  "requestedRoleCaps" JSONB NOT NULL,
  "requestedNote" TEXT,
  "requestedByUserId" TEXT,
  "requestedByName" TEXT,
  "requestedByEmail" TEXT,
  "proposedPlanCode" TEXT,
  "proposedIsExistingPlan" BOOLEAN DEFAULT false,
  "proposedTotalUsers" INTEGER,
  "proposedRoleCaps" JSONB,
  "proposedMonthlyPriceCents" INTEGER,
  "proposedAnnualPriceCents" INTEGER,
  "proposedExtrasDescription" TEXT,
  "proposedDifferenceMonthlyCents" INTEGER,
  "proposedDifferenceAnnualCents" INTEGER,
  "proposedNote" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedByName" TEXT,
  "reviewedByEmail" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "decisionByUserId" TEXT,
  "decisionByName" TEXT,
  "decisionByEmail" TEXT,
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantLicenseChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TenantLicenseChangeRequest_tenantId_status_createdAt_idx"
  ON "TenantLicenseChangeRequest"("tenantId", "status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TenantLicenseChangeRequest_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantLicenseChangeRequest"
      ADD CONSTRAINT "TenantLicenseChangeRequest_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
