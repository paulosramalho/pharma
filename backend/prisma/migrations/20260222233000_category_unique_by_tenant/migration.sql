-- category uniqueness must be scoped by tenant

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Category_name_key'
  ) THEN
    ALTER TABLE "Category" DROP CONSTRAINT "Category_name_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Category_tenantId_name_key'
  ) THEN
    ALTER TABLE "Category"
      ADD CONSTRAINT "Category_tenantId_name_key" UNIQUE ("tenantId", "name");
  END IF;
END $$;
