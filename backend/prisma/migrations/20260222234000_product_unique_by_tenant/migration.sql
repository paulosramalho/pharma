-- product uniqueness must be scoped by tenant

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Product_ean_key'
  ) THEN
    ALTER TABLE "Product" DROP CONSTRAINT "Product_ean_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Product_tenantId_ean_key'
  ) THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_tenantId_ean_key" UNIQUE ("tenantId", "ean");
  END IF;
END $$;
