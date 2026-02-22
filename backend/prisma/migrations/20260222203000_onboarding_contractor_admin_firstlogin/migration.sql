ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "contractorStreet" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorComplement" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorDistrict" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorCity" TEXT,
  ADD COLUMN IF NOT EXISTS "contractorState" TEXT;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
