ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "isDeveloperTenant" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "contractorDocument" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorNameOrCompany" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorAddressFull" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorZipCode" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorPhoneWhatsapp" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorLogoFile" TEXT;

UPDATE "Tenant"
SET "isDeveloperTenant" = true
WHERE "slug" = 'default';
