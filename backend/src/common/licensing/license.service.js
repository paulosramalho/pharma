const DEFAULT_PLAN_CATALOG = {
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

function normalizeRoleCaps(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  ["ADMIN", "VENDEDOR", "CAIXA", "FARMACEUTICO"].forEach((role) => {
    const val = Number(src?.[role] || 0);
    out[role] = Number.isFinite(val) && val > 0 ? Math.floor(val) : 0;
  });
  return out;
}

function totalRoleCaps(roleCaps) {
  const caps = normalizeRoleCaps(roleCaps);
  return Object.values(caps).reduce((sum, n) => sum + Number(n || 0), 0);
}

function normalizePlanRow(row) {
  if (!row) return null;
  const code = String(row.code || "").trim().toUpperCase();
  if (!code) return null;
  return {
    code,
    name: String(row.name || code),
    monthlyPriceCents: Number(row.monthlyPriceCents || 0),
    annualPriceCents: Number(row.annualPriceCents || 0),
    currency: String(row.currency || "BRL").trim().toUpperCase() || "BRL",
    dashboardMode: String(row.dashboardMode || "FULL").trim().toUpperCase() || "FULL",
    limits: row.limits && typeof row.limits === "object" ? row.limits : {},
    features: row.features && typeof row.features === "object" ? row.features : {},
  };
}

function getCatalogMap(catalogInput) {
  if (!catalogInput || typeof catalogInput !== "object") return DEFAULT_PLAN_CATALOG;
  const values = Object.values(catalogInput);
  if (!values.length) return DEFAULT_PLAN_CATALOG;
  return catalogInput;
}

function listCatalog(catalogInput) {
  const map = getCatalogMap(catalogInput);
  return Object.values(map).map((p) => ({
    code: p.code,
    name: p.name,
    currency: p.currency,
    monthlyPriceCents: p.monthlyPriceCents,
    annualPriceCents: p.annualPriceCents,
    limits: p.limits,
    features: p.features,
    dashboardMode: p.dashboardMode,
  }));
}

async function loadPlanCatalog(prisma) {
  if (!prisma?.licensePlan) return DEFAULT_PLAN_CATALOG;
  const rows = await prisma.licensePlan.findMany({
    where: { active: true },
    orderBy: [{ monthlyPriceCents: "asc" }, { code: "asc" }],
    select: {
      code: true,
      name: true,
      monthlyPriceCents: true,
      annualPriceCents: true,
      currency: true,
      dashboardMode: true,
      limits: true,
      features: true,
    },
  });
  if (!rows.length) return DEFAULT_PLAN_CATALOG;
  const map = {};
  rows.forEach((row) => {
    const normalized = normalizePlanRow(row);
    if (normalized?.code) map[normalized.code] = normalized;
  });
  return Object.keys(map).length ? map : DEFAULT_PLAN_CATALOG;
}

function buildLicenseFromPlan(planCode, statusRaw, catalogInput) {
  const catalog = getCatalogMap(catalogInput);
  const requestedPlan = String(planCode || process.env.LICENSE_PLAN || "MINIMO").trim().toUpperCase();
  const firstPlan = Object.values(catalog)[0] || DEFAULT_PLAN_CATALOG.MINIMO;
  const plan = catalog[requestedPlan] || catalog.MINIMO || firstPlan;
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
    catalog: listCatalog(catalog),
  };
}

function planSupportsRoleCaps(plan, roleCaps) {
  const wanted = normalizeRoleCaps(roleCaps);
  const maxRole = plan?.limits?.maxRoleActive || {};
  const hasUnlimitedRoles = Object.keys(maxRole).length === 0;
  if (!hasUnlimitedRoles) {
    for (const role of Object.keys(wanted)) {
      if ((wanted[role] || 0) > Number(maxRole?.[role] || 0)) return false;
    }
  }
  const wantedTotal = totalRoleCaps(wanted);
  const maxUsers = Number(plan?.limits?.maxActiveUsers || 0);
  return wantedTotal <= maxUsers;
}

function findBestPlanForRoleCaps(roleCaps, catalogInput) {
  const catalog = getCatalogMap(catalogInput);
  const plans = Object.values(catalog).slice().sort((a, b) => Number(a.monthlyPriceCents || 0) - Number(b.monthlyPriceCents || 0));
  return plans.find((plan) => planSupportsRoleCaps(plan, roleCaps)) || null;
}

function getActiveLicense(catalogInput) {
  return buildLicenseFromPlan(null, null, catalogInput);
}

function resolveTenantLicense(tenantLicenseRow, catalogInput) {
  if (!tenantLicenseRow) return getActiveLicense(catalogInput);
  const base = buildLicenseFromPlan(tenantLicenseRow.planCode, tenantLicenseRow.status, catalogInput);
  const addonRole = normalizeRoleCaps(tenantLicenseRow.addonMaxRoleActive || {});
  const baseRole = normalizeRoleCaps(base?.limits?.maxRoleActive || {});
  const mergedRole = Object.keys(baseRole).reduce((acc, role) => {
    acc[role] = Number(baseRole[role] || 0) + Number(addonRole[role] || 0);
    return acc;
  }, {});
  const hasUnlimitedRole = Object.keys(base?.limits?.maxRoleActive || {}).length === 0;
  const addonUsers = Number(tenantLicenseRow.addonMaxActiveUsers || 0);
  const maxActiveUsersBase = Number(base?.limits?.maxActiveUsers || 0);
  const maxActiveUsers = maxActiveUsersBase + (addonUsers > 0 ? addonUsers : 0);
  const monthly = Number.isFinite(Number(tenantLicenseRow.overrideMonthlyPriceCents))
    ? Number(tenantLicenseRow.overrideMonthlyPriceCents)
    : Number(base?.pricing?.monthlyPriceCents || 0);
  const annual = Number.isFinite(Number(tenantLicenseRow.overrideAnnualPriceCents))
    ? Number(tenantLicenseRow.overrideAnnualPriceCents)
    : Number(base?.pricing?.annualPriceCents || 0);
  return {
    ...base,
    limits: {
      ...base.limits,
      maxActiveUsers,
      maxRoleActive: hasUnlimitedRole ? {} : mergedRole,
    },
    pricing: {
      ...base.pricing,
      monthlyPriceCents: monthly,
      annualPriceCents: annual,
    },
    extras: {
      addonMaxActiveUsers: addonUsers,
      addonMaxRoleActive: addonRole,
      description: tenantLicenseRow.extrasDescription || null,
    },
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
  PLAN_CATALOG: DEFAULT_PLAN_CATALOG,
  DEFAULT_PLAN_CATALOG,
  normalizeStatus,
  normalizeRoleCaps,
  totalRoleCaps,
  listCatalog,
  loadPlanCatalog,
  findBestPlanForRoleCaps,
  buildLicenseFromPlan,
  getActiveLicense,
  resolveTenantLicense,
  isFeatureEnabled,
  isLicenseActive,
};
