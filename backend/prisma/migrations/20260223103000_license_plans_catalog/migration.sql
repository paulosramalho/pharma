-- License plans catalog (master-managed)
CREATE TABLE IF NOT EXISTS "LicensePlan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "monthlyPriceCents" INTEGER NOT NULL,
  "annualPriceCents" INTEGER NOT NULL,
  "dashboardMode" TEXT NOT NULL DEFAULT 'FULL',
  "limits" JSONB NOT NULL,
  "features" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LicensePlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LicensePlan_code_key" ON "LicensePlan"("code");
CREATE INDEX IF NOT EXISTS "LicensePlan_active_code_idx" ON "LicensePlan"("active", "code");

INSERT INTO "LicensePlan" (
  "id", "code", "name", "currency", "monthlyPriceCents", "annualPriceCents", "dashboardMode", "limits", "features", "active", "createdAt", "updatedAt"
)
SELECT
  lower(v.code),
  v.code,
  v.name,
  'BRL',
  v.monthly_price,
  v.annual_price,
  v.dashboard_mode,
  v.limits::jsonb,
  v.features::jsonb,
  true,
  NOW(),
  NOW()
FROM (
  VALUES
    (
      'MINIMO',
      'Pacote Minimo',
      14900,
      143000,
      'SIMPLIFIED',
      '{"maxActiveUsers":4,"maxActiveStores":1,"maxRoleActive":{"ADMIN":1,"VENDEDOR":1,"CAIXA":1,"FARMACEUTICO":1}}',
      '{"dashboard":true,"sales":true,"cash":true,"inventory":true,"inventoryTransfers":false,"inventoryReservations":false,"products":true,"chat":false,"config":true,"reportsSales":true,"reportsCashClosings":true,"reportsTransfers":false}'
    ),
    (
      'PROFISSIONAL',
      'Profissional',
      29900,
      287000,
      'FULL',
      '{"maxActiveUsers":15,"maxActiveStores":5,"maxRoleActive":{}}',
      '{"dashboard":true,"sales":true,"cash":true,"inventory":true,"inventoryTransfers":true,"inventoryReservations":true,"products":true,"chat":true,"config":true,"reportsSales":true,"reportsCashClosings":true,"reportsTransfers":true}'
    ),
    (
      'ENTERPRISE',
      'Enterprise',
      89900,
      863000,
      'FULL',
      '{"maxActiveUsers":999999,"maxActiveStores":999999,"maxRoleActive":{}}',
      '{"dashboard":true,"sales":true,"cash":true,"inventory":true,"inventoryTransfers":true,"inventoryReservations":true,"products":true,"chat":true,"config":true,"reportsSales":true,"reportsCashClosings":true,"reportsTransfers":true}'
    )
) AS v(code, name, monthly_price, annual_price, dashboard_mode, limits, features)
WHERE NOT EXISTS (SELECT 1 FROM "LicensePlan" lp WHERE lp."code" = v.code);
