const PLAN_CATALOG = {
  MINIMO: {
    code: "MINIMO",
    name: "Pacote Minimo",
    monthlyPriceCents: 14900,
    annualPriceCents: 143000,
    currency: "BRL",
    dashboardMode: "SIMPLIFIED",
    limits: {
      maxActiveUsers: 4,
      maxActiveStores: 1,
      maxRoleActive: {
        ADMIN: 1,
        VENDEDOR: 1,
        CAIXA: 1,
        FARMACEUTICO: 1,
      },
    },
    features: {
      dashboard: true,
      sales: true,
      cash: true,
      inventory: true,
      inventoryTransfers: false,
      inventoryReservations: false,
      products: true,
      chat: false,
      config: true,
      reportsSales: true,
      reportsCashClosings: true,
      reportsTransfers: false,
    },
  },
  PROFISSIONAL: {
    code: "PROFISSIONAL",
    name: "Profissional",
    monthlyPriceCents: 29900,
    annualPriceCents: 287000,
    currency: "BRL",
    dashboardMode: "FULL",
    limits: {
      maxActiveUsers: 15,
      maxActiveStores: 5,
      maxRoleActive: {},
    },
    features: {
      dashboard: true,
      sales: true,
      cash: true,
      inventory: true,
      inventoryTransfers: true,
      inventoryReservations: true,
      products: true,
      chat: true,
      config: true,
      reportsSales: true,
      reportsCashClosings: true,
      reportsTransfers: true,
    },
  },
  ENTERPRISE: {
    code: "ENTERPRISE",
    name: "Enterprise",
    monthlyPriceCents: 89900,
    annualPriceCents: 863000,
    currency: "BRL",
    dashboardMode: "FULL",
    limits: {
      maxActiveUsers: 999999,
      maxActiveStores: 999999,
      maxRoleActive: {},
    },
    features: {
      dashboard: true,
      sales: true,
      cash: true,
      inventory: true,
      inventoryTransfers: true,
      inventoryReservations: true,
      products: true,
      chat: true,
      config: true,
      reportsSales: true,
      reportsCashClosings: true,
      reportsTransfers: true,
    },
  },
};

function normalizeStatus(raw) {
  const s = String(raw || "ACTIVE").trim().toUpperCase();
  if (["TRIAL", "ACTIVE", "GRACE", "SUSPENDED", "EXPIRED", "CANCELED"].includes(s)) return s;
  return "ACTIVE";
}

function buildLicenseFromPlan(planCode, statusRaw) {
  const requestedPlan = String(planCode || process.env.LICENSE_PLAN || "MINIMO").trim().toUpperCase();
  const plan = PLAN_CATALOG[requestedPlan] || PLAN_CATALOG.MINIMO;
  const status = normalizeStatus(statusRaw || process.env.LICENSE_STATUS);
  return {
    planCode: plan.code,
    planName: plan.name,
    status,
    dashboardMode: plan.dashboardMode,
    limits: plan.limits,
    features: plan.features,
    pricing: {
      currency: plan.currency,
      monthlyPriceCents: plan.monthlyPriceCents,
      annualPriceCents: plan.annualPriceCents,
    },
    catalog: Object.values(PLAN_CATALOG).map((p) => ({
      code: p.code,
      name: p.name,
      currency: p.currency,
      monthlyPriceCents: p.monthlyPriceCents,
      annualPriceCents: p.annualPriceCents,
      limits: p.limits,
      features: p.features,
      dashboardMode: p.dashboardMode,
    })),
  };
}

function getActiveLicense() {
  return buildLicenseFromPlan(null, null);
}

function resolveTenantLicense(tenantLicenseRow) {
  if (!tenantLicenseRow) return getActiveLicense();
  const base = buildLicenseFromPlan(tenantLicenseRow.planCode, tenantLicenseRow.status);
  return {
    ...base,
    startsAt: tenantLicenseRow.startsAt || null,
    endsAt: tenantLicenseRow.endsAt || null,
    graceUntil: tenantLicenseRow.graceUntil || null,
    updatedAt: tenantLicenseRow.updatedAt || null,
  };
}

function isLicenseActive(license) {
  const status = String(license?.status || "").toUpperCase();
  return ["TRIAL", "ACTIVE", "GRACE"].includes(status);
}

function isFeatureEnabled(featureKey, license = getActiveLicense()) {
  if (!isLicenseActive(license)) return false;
  return Boolean(license.features?.[featureKey]);
}

module.exports = {
  PLAN_CATALOG,
  normalizeStatus,
  buildLicenseFromPlan,
  getActiveLicense,
  resolveTenantLicense,
  isFeatureEnabled,
  isLicenseActive,
};
