-- Ajuste global da janela de alertas de vencimento
ALTER TABLE "TenantLicense"
  ALTER COLUMN "alertDaysPrimary" SET DEFAULT 5,
  ALTER COLUMN "alertDaysSecondary" SET DEFAULT 3;

UPDATE "TenantLicense"
SET "alertDaysPrimary" = 5
WHERE "alertDaysPrimary" = 10;

UPDATE "TenantLicense"
SET "alertDaysSecondary" = 3
WHERE "alertDaysSecondary" = 5;
