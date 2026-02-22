const express = require("express");
const { asyncHandler } = require("../../common/http/asyncHandler");
const { sendOk } = require("../../common/http/response");
const { makeReportSamplePdfBuffer, makeReportLinesPdfBuffer, makeReportCustomPdfBuffer } = require("../reports/reportPdfTemplate");
const {
  PLAN_CATALOG,
  getActiveLicense,
  resolveTenantLicense,
  normalizeStatus,
  normalizeRoleCaps,
  totalRoleCaps,
  findBestPlanForRoleCaps,
  isFeatureEnabled,
  isLicenseActive,
} = require("../../common/licensing/license.service");

/** Converts "YYYY-MM-DD" to noon UTC to avoid timezone day-shift */
function safeDate(v) {
  if (!v) return null;
  const s = String(v);
  if (s.includes("T")) return new Date(s);
  return new Date(s + "T12:00:00Z");
}

function buildApiRoutes({ prisma, log }) {
  const router = express.Router();
  const ONLINE_WINDOW_MS = 120000;

  function isAdmin(req) {
    return req.user?.role === "ADMIN";
  }

  async function resolveTenantId(req) {
    if (req.user?.tenantId) return req.user.tenantId;
    if (!req.user?.id) return null;
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { tenantId: true },
    });
    return user?.tenantId || null;
  }

  async function getUserStoreIds(req) {
    const tenantId = await resolveTenantId(req);
    if (!req.user) return [];
    if (isAdmin(req)) {
      const stores = await prisma.store.findMany({
        where: { active: true, tenantId },
        select: { id: true },
      });
      return stores.map((s) => s.id);
    }
    const links = await prisma.storeUser.findMany({
      where: { userId: req.user.id, store: { active: true, tenantId } },
      select: { storeId: true },
    });
    return links.map((s) => s.storeId);
  }

  function isPharmacistOrAdmin(req) {
    return req.user?.role === "ADMIN" || req.user?.role === "FARMACEUTICO";
  }

  function assertPharmacistOrAdmin(req) {
    if (!isPharmacistOrAdmin(req)) {
      throw Object.assign(new Error("Operacao permitida apenas para Farmaceutico ou Admin"), { statusCode: 403 });
    }
  }

  async function getLicense(req) {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) return getActiveLicense();
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { isDeveloperTenant: true },
    });
    if (tenant?.isDeveloperTenant) {
      // Master/dev license always has full feature set.
      return resolveTenantLicense({
        planCode: "ENTERPRISE",
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: null,
        graceUntil: null,
        updatedAt: new Date(),
      });
    }
    const row = await prisma.tenantLicense.findUnique({
      where: { tenantId },
      select: {
        planCode: true,
        status: true,
        startsAt: true,
        endsAt: true,
        graceUntil: true,
        addonMaxActiveUsers: true,
        addonMaxRoleActive: true,
        overrideMonthlyPriceCents: true,
        overrideAnnualPriceCents: true,
        extrasDescription: true,
        updatedAt: true,
      },
    });
    return resolveTenantLicense(row);
  }

  async function resolveLicenseByTenantId(tenantId) {
    if (!tenantId) return getActiveLicense();
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { isDeveloperTenant: true },
    });
    if (tenant?.isDeveloperTenant) {
      return resolveTenantLicense({
        planCode: "ENTERPRISE",
        status: "ACTIVE",
        startsAt: new Date(),
        endsAt: null,
        graceUntil: null,
        updatedAt: new Date(),
      });
    }
    const row = await prisma.tenantLicense.findUnique({
      where: { tenantId },
      select: {
        planCode: true,
        status: true,
        startsAt: true,
        endsAt: true,
        graceUntil: true,
        addonMaxActiveUsers: true,
        addonMaxRoleActive: true,
        overrideMonthlyPriceCents: true,
        overrideAnnualPriceCents: true,
        extrasDescription: true,
        updatedAt: true,
      },
    });
    return resolveTenantLicense(row);
  }

  async function getTenantLicenseProfile(req) {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return { tenantId: null, contractor: null };
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        isDeveloperTenant: true,
        contractorDocument: true,
        contractorNameOrCompany: true,
        contractorTradeName: true,
        contractorAddressFull: true,
        contractorStreet: true,
        contractorNumber: true,
        contractorComplement: true,
        contractorDistrict: true,
        contractorCity: true,
        contractorState: true,
        contractorZipCode: true,
        contractorPhoneWhatsapp: true,
        contractorEmail: true,
        contractorLogoFile: true,
      },
    });
    if (!tenant) return { tenantId, contractor: null };
    return {
      tenantId: tenant.id,
      contractor: {
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        isDeveloperTenant: Boolean(tenant.isDeveloperTenant),
        document: tenant.contractorDocument || null,
        nameOrCompany: tenant.contractorNameOrCompany || null,
        tradeName: tenant.contractorTradeName || null,
        addressFull: tenant.contractorAddressFull || null,
        street: tenant.contractorStreet || null,
        number: tenant.contractorNumber || null,
        complement: tenant.contractorComplement || null,
        district: tenant.contractorDistrict || null,
        city: tenant.contractorCity || null,
        state: tenant.contractorState || null,
        zipCode: tenant.contractorZipCode || null,
        phoneWhatsapp: tenant.contractorPhoneWhatsapp || null,
        email: tenant.contractorEmail || null,
        logoFile: tenant.contractorLogoFile || null,
      },
    };
  }

  function normalizeContractorPayload(raw = {}) {
    const state = String(raw.state || "").trim().toUpperCase().slice(0, 2) || null;
    const normalized = {
      document: String(raw.document || "").replace(/\D/g, "") || null,
      nameOrCompany: String(raw.nameOrCompany || "").trim() || null,
      tradeName: String(raw.tradeName || "").trim() || null,
      street: String(raw.street || "").trim() || null,
      number: String(raw.number || "").trim() || null,
      complement: String(raw.complement || "").trim() || null,
      district: String(raw.district || "").trim() || null,
      city: String(raw.city || "").trim() || null,
      state,
      addressFull: String(raw.addressFull || "").trim() || null,
      zipCode: String(raw.zipCode || "").replace(/\D/g, "") || null,
      phoneWhatsapp: String(raw.phoneWhatsapp || "").replace(/\D/g, "") || null,
      email: String(raw.email || "").trim().toLowerCase() || null,
      logoFile: String(raw.logoFile || "").trim() || null,
    };
    normalized.addressFull = normalized.addressFull || buildContractorAddressFull(normalized);
    return normalized;
  }

  function buildContractorAddressFull(contractor) {
    const left = [contractor.street, contractor.number, contractor.complement].filter(Boolean).join(", ");
    const right = [contractor.district, contractor.city, contractor.state].filter(Boolean).join(" - ");
    const merged = [left, right].filter(Boolean).join(" | ");
    return merged || null;
  }

  function generateProvisionalPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let out = "";
    for (let i = 0; i < 12; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  async function getTenantBranding(req) {
    const profile = await getTenantLicenseProfile(req);
    const contractor = profile?.contractor || null;
    const tradeName = String(contractor?.tradeName || "").trim();
    const tenantName = String(contractor?.tenantName || "").trim();
    const legalName = String(contractor?.nameOrCompany || "").trim();
    const systemName = tradeName || tenantName || "Pharma";
    const contractorLine = legalName
      ? (legalName !== systemName ? `Contratante: ${legalName}` : `Licenciado: ${legalName}`)
      : null;
    return {
      systemName,
      contractorLine,
      logoDataUrl: contractor?.logoFile || null,
      contractor,
    };
  }

  function slugify(input) {
    return String(input || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  }

  async function nextTenantSlug(baseInput) {
    const base = slugify(baseInput) || "tenant";
    let candidate = base;
    let idx = 1;
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await prisma.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!exists) return candidate;
      idx += 1;
      candidate = `${base}-${idx}`;
    }
  }

  async function isDeveloperTenantById(tenantId) {
    if (!tenantId) return false;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { isDeveloperTenant: true },
    });
    return Boolean(tenant?.isDeveloperTenant);
  }

  async function assertDeveloperAdmin(req) {
    if (!isAdmin(req)) {
      throw Object.assign(new Error("Somente admin pode criar novo licenciado"), { statusCode: 403 });
    }
    const tenantId = await resolveTenantId(req);
    const isDev = await isDeveloperTenantById(tenantId);
    if (!isDev) {
      throw Object.assign(new Error("Apenas admin da licenca do desenvolvedor pode criar novos licenciados"), { statusCode: 403 });
    }
    return tenantId;
  }

  async function upsertTenantLicenseWithAudit({ tenantId, actor, body }) {
    const nextPlan = String(body?.planCode || "").trim().toUpperCase();
    const nextStatus = normalizeStatus(body?.status || "ACTIVE");
    const reason = body?.reason ? String(body.reason) : null;
    if (!nextPlan) throw Object.assign(new Error("planCode obrigatorio"), { statusCode: 400 });

    const previous = await prisma.tenantLicense.findUnique({ where: { tenantId } });
    const now = new Date();
    const defaultEndsAt = new Date(now);
    defaultEndsAt.setFullYear(defaultEndsAt.getFullYear() + 1);
    const endsAtInput = body?.endsAt ? safeDate(body.endsAt) : defaultEndsAt;

    const updated = await prisma.tenantLicense.upsert({
      where: { tenantId },
      update: {
        planCode: nextPlan,
        status: nextStatus,
        endsAt: endsAtInput,
        graceUntil: body?.graceUntil ? safeDate(body.graceUntil) : null,
        updatedById: actor?.id || null,
        updatedByName: actor?.name || actor?.email || "Admin",
      },
      create: {
        tenantId,
        planCode: nextPlan,
        status: nextStatus,
        startsAt: now,
        endsAt: endsAtInput,
        graceUntil: body?.graceUntil ? safeDate(body.graceUntil) : null,
        updatedById: actor?.id || null,
        updatedByName: actor?.name || actor?.email || "Admin",
      },
    });

    await prisma.tenantLicenseAudit.create({
      data: {
        tenantId,
        previousPlan: previous?.planCode || null,
        newPlan: updated.planCode,
        previousStatus: previous?.status || null,
        newStatus: updated.status,
        changedById: actor?.id || null,
        changedByName: actor?.name || actor?.email || "Admin",
        reason,
        payload: {
          endsAt: updated.endsAt,
          graceUntil: updated.graceUntil,
        },
      },
    });

    return updated;
  }

  function isValidPhone(phone) {
    const d = String(phone || "").replace(/\D/g, "");
    if (!d) return true;
    return d.length === 10 || d.length === 11;
  }

  function isValidCpf(digits) {
    const d = String(digits || "").replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (let t = 9; t < 11; t += 1) {
      let sum = 0;
      for (let i = 0; i < t; i += 1) sum += Number(d[i]) * (t + 1 - i);
      const digit = ((sum * 10) % 11) % 10;
      if (Number(d[t]) !== digit) return false;
    }
    return true;
  }

  function isValidCnpj(digits) {
    const d = String(digits || "").replace(/\D/g, "");
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (let t = 0; t < 2; t += 1) {
      const w = t === 0 ? w1 : w2;
      let sum = 0;
      for (let i = 0; i < w.length; i += 1) sum += Number(d[i]) * w[i];
      const digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
      if (Number(d[12 + t]) !== digit) return false;
    }
    return true;
  }

  function isValidCpfCnpj(doc) {
    const d = String(doc || "").replace(/\D/g, "");
    if (!d) return true;
    if (d.length === 11) return isValidCpf(d);
    if (d.length === 14) return isValidCnpj(d);
    return false;
  }

  function validateOnboardingPayload(payload) {
    const contractor = normalizeContractorPayload(payload?.contractor || {});
    const planCode = String(payload?.planCode || "").trim().toUpperCase();
    const adminName = String(payload?.admin?.name || "").trim();
    const adminEmail = String(payload?.admin?.email || "").trim().toLowerCase();

    if (!contractor.nameOrCompany) throw Object.assign(new Error("Nome/Razao social do contratante e obrigatorio"), { statusCode: 400 });
    if (!contractor.tradeName) throw Object.assign(new Error("Nome fantasia do contratante e obrigatorio"), { statusCode: 400 });
    if (contractor.document && !isValidCpfCnpj(contractor.document)) throw Object.assign(new Error("CPF/CNPJ do contratante invalido"), { statusCode: 400 });
    if (!contractor.zipCode || contractor.zipCode.length !== 8) throw Object.assign(new Error("CEP do contratante invalido"), { statusCode: 400 });
    if (!contractor.street || !contractor.district || !contractor.city || !contractor.state) {
      throw Object.assign(new Error("Endereco do contratante incompleto"), { statusCode: 400 });
    }
    if (!isValidPhone(contractor.phoneWhatsapp)) throw Object.assign(new Error("Telefone/WhatsApp do contratante invalido"), { statusCode: 400 });
    if (contractor.email && !isValidEmail(contractor.email)) throw Object.assign(new Error("Email do contratante invalido"), { statusCode: 400 });
    if (!planCode) throw Object.assign(new Error("Pacote/planCode obrigatorio"), { statusCode: 400 });
    if (!adminName || !adminEmail) throw Object.assign(new Error("Nome e email do usuario admin sao obrigatorios"), { statusCode: 400 });
    if (!isValidEmail(adminEmail)) throw Object.assign(new Error("Email do usuario admin invalido"), { statusCode: 400 });

    return {
      contractor,
      planCode,
      adminName,
      adminEmail,
    };
  }

  async function deleteTenantData(tx, tenantId) {
    // Child tables with direct tenantId
    await tx.chatMessage.deleteMany({ where: { tenantId } });
    await tx.stockReservationItem.deleteMany({ where: { tenantId } });
    await tx.stockTransferItem.deleteMany({ where: { tenantId } });
    await tx.posTransaction.deleteMany({ where: { tenantId } });
    await tx.payment.deleteMany({ where: { tenantId } });
    await tx.saleItem.deleteMany({ where: { tenantId } });
    await tx.inventoryMovement.deleteMany({ where: { tenantId } });
    await tx.inventoryLot.deleteMany({ where: { tenantId } });
    await tx.discount.deleteMany({ where: { tenantId } });
    await tx.address.deleteMany({ where: { tenantId } });
    await tx.delivery.deleteMany({ where: { tenantId } });
    await tx.cashMovement.deleteMany({
      where: {
        session: { tenantId },
      },
    });
    await tx.cashSession.deleteMany({ where: { tenantId } });
    await tx.saleControlledDispensation.deleteMany({
      where: {
        sale: { tenantId },
      },
    });
    await tx.sale.deleteMany({ where: { tenantId } });
    await tx.stockReservation.deleteMany({ where: { tenantId } });
    await tx.stockTransfer.deleteMany({ where: { tenantId } });
    await tx.auditLog.deleteMany({ where: { tenantId } });
    await tx.customer.deleteMany({ where: { tenantId } });
    await tx.productPrice.deleteMany({
      where: {
        product: { tenantId },
      },
    });
    await tx.product.deleteMany({ where: { tenantId } });
    await tx.category.deleteMany({ where: { tenantId } });
    await tx.storeUser.deleteMany({
      where: {
        store: { tenantId },
      },
    });
    await tx.roleUser.deleteMany({
      where: {
        user: { tenantId },
      },
    });
    await tx.user.deleteMany({ where: { tenantId } });
    await tx.fiscalEvent.deleteMany({
      where: {
        doc: { store: { tenantId } },
      },
    });
    await tx.fiscalDocument.deleteMany({
      where: {
        store: { tenantId },
      },
    });
    await tx.fiscalSequence.deleteMany({
      where: {
        store: { tenantId },
      },
    });
    await tx.fiscalConfig.deleteMany({
      where: {
        store: { tenantId },
      },
    });
    await tx.store.deleteMany({ where: { tenantId } });
    await tx.tenantLicenseAudit.deleteMany({ where: { tenantId } });
    await tx.tenantLicense.deleteMany({ where: { tenantId } });
    await tx.tenant.delete({ where: { id: tenantId } });
  }

  async function buildProvisionalAdminByTenantMap(tenantIds = []) {
    const ids = Array.from(new Set((tenantIds || []).filter(Boolean)));
    if (ids.length === 0) return {};

    const [auditRows, pendingAdmins] = await Promise.all([
      prisma.tenantLicenseAudit.findMany({
        where: {
          tenantId: { in: ids },
          reason: "Onboarding de novo licenciado com admin provisório",
        },
        select: {
          tenantId: true,
          createdAt: true,
          payload: true,
        },
        orderBy: [{ tenantId: "asc" }, { createdAt: "desc" }],
      }),
      prisma.user.findMany({
        where: {
          tenantId: { in: ids },
          role: { name: "ADMIN" },
          mustChangePassword: true,
          active: true,
        },
        select: { id: true, tenantId: true, name: true, email: true, mustChangePassword: true },
      }),
    ]);

    const latestAuditByTenant = {};
    for (const row of auditRows) {
      if (!latestAuditByTenant[row.tenantId]) latestAuditByTenant[row.tenantId] = row;
    }

    const pendingAdminByTenant = {};
    for (const admin of pendingAdmins) {
      if (!pendingAdminByTenant[admin.tenantId]) pendingAdminByTenant[admin.tenantId] = admin;
    }

    const out = {};
    for (const tenantId of ids) {
      const audit = latestAuditByTenant[tenantId];
      const pendingAdmin = pendingAdminByTenant[tenantId];
      const payload = audit?.payload && typeof audit.payload === "object" ? audit.payload : null;
      const adminUserId = payload?.adminUserId ? String(payload.adminUserId) : null;
      const temporaryPassword = payload?.temporaryPassword ? String(payload.temporaryPassword) : null;
      if (!pendingAdmin || !temporaryPassword) continue;
      if (adminUserId && pendingAdmin.id !== adminUserId) continue;
      out[tenantId] = {
        id: pendingAdmin.id,
        name: pendingAdmin.name,
        email: pendingAdmin.email,
        mustChangePassword: Boolean(pendingAdmin.mustChangePassword),
        temporaryPassword,
      };
    }
    return out;
  }

  const IMPORT_TABLES = {
    stores: {
      label: "Lojas",
      required: ["name", "type"],
      allowed: ["name", "type", "active", "isDefault", "cnpj", "phone", "email", "street", "number", "complement", "district", "city", "state", "zipCode"],
    },
    categories: {
      label: "Categorias",
      required: ["name"],
      allowed: ["name", "active"],
    },
    products: {
      label: "Produtos",
      required: ["name"],
      allowed: ["name", "ean", "active", "requiresPrescription", "controlled", "defaultMarkup", "categoryName", "basePrice"],
    },
    customers: {
      label: "Clientes",
      required: ["name"],
      allowed: ["name", "document", "birthDate", "whatsapp", "phone", "email"],
    },
  };

  function normalizeImportHeader(value) {
    return String(value || "").trim().replace(/^\uFEFF/, "");
  }

  function parseDelimitedText(contentRaw = "") {
    const content = String(contentRaw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!content) return { headers: [], rows: [], delimiter: ";" };
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const first = lines[0] || "";
    const delims = [";", ",", "\t"];
    let delimiter = ";";
    let best = -1;
    for (const d of delims) {
      const score = first.split(d).length;
      if (score > best) {
        best = score;
        delimiter = d;
      }
    }
    const headers = first.split(delimiter).map(normalizeImportHeader);
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(delimiter);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = String(cells[idx] || "").trim();
      });
      return row;
    });
    return { headers, rows, delimiter };
  }

  function parseBool(value, fallback = false) {
    const v = String(value || "").trim().toLowerCase();
    if (!v) return fallback;
    if (["1", "true", "sim", "yes", "y"].includes(v)) return true;
    if (["0", "false", "nao", "não", "no", "n"].includes(v)) return false;
    return fallback;
  }

  function parseNum(value, fallback = 0) {
    const v = String(value || "").trim().replace(",", ".");
    if (!v) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function validateImportFile({ table, fileName, content }) {
    const schema = IMPORT_TABLES[table];
    if (!schema) {
      return {
        table,
        fileName: fileName || "-",
        compatible: false,
        errors: [`Tabela nao suportada: ${table}`],
        warnings: [],
        totalRows: 0,
        parsedRows: [],
      };
    }

    const parsed = parseDelimitedText(content || "");
    const headers = parsed.headers;
    const errors = [];
    const warnings = [];

    if (headers.length === 0) {
      errors.push("Arquivo vazio ou sem cabecalho.");
    }
    const missing = schema.required.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      errors.push(`Colunas obrigatorias ausentes: ${missing.join(", ")}`);
    }
    const unknown = headers.filter((h) => !schema.allowed.includes(h));
    if (unknown.length > 0) {
      errors.push(`Colunas nao reconhecidas: ${unknown.join(", ")}`);
    }

    const parsedRows = parsed.rows;
    if (parsedRows.length === 0) {
      warnings.push("Sem linhas de dados.");
    }

    return {
      table,
      label: schema.label,
      fileName: fileName || "-",
      compatible: errors.length === 0,
      errors,
      warnings,
      totalRows: parsedRows.length,
      parsedRows,
    };
  }

  async function applyImportRows({ tx, tenantId, table, rows }) {
    if (table === "stores") {
      let count = 0;
      for (const r of rows) {
        const name = String(r.name || "").trim();
        if (!name) continue;
        const typeRaw = String(r.type || "LOJA").trim().toUpperCase();
        const type = typeRaw === "CENTRAL" ? "CENTRAL" : "LOJA";
        const existing = await tx.store.findFirst({
          where: { tenantId, name },
          select: { id: true },
        });
        const data = {
          tenantId,
          name,
          type,
          active: parseBool(r.active, true),
          isDefault: parseBool(r.isDefault, false),
          cnpj: String(r.cnpj || "").replace(/\D/g, "") || null,
          phone: String(r.phone || "").replace(/\D/g, "") || null,
          email: String(r.email || "").trim().toLowerCase() || null,
          street: String(r.street || "").trim() || null,
          number: String(r.number || "").trim() || null,
          complement: String(r.complement || "").trim() || null,
          district: String(r.district || "").trim() || null,
          city: String(r.city || "").trim() || null,
          state: String(r.state || "").trim().toUpperCase().slice(0, 2) || null,
          zipCode: String(r.zipCode || "").replace(/\D/g, "") || null,
        };
        if (existing?.id) {
          await tx.store.update({ where: { id: existing.id }, data });
        } else {
          await tx.store.create({ data });
        }
        count += 1;
      }
      return { imported: count };
    }

    if (table === "categories") {
      let count = 0;
      for (const r of rows) {
        const name = String(r.name || "").trim();
        if (!name) continue;
        const existing = await tx.category.findFirst({
          where: { tenantId, name },
          select: { id: true },
        });
        const data = { tenantId, name };
        if (existing?.id) {
          await tx.category.update({ where: { id: existing.id }, data });
        } else {
          await tx.category.create({ data });
        }
        count += 1;
      }
      return { imported: count };
    }

    if (table === "products") {
      let count = 0;
      for (const r of rows) {
        const name = String(r.name || "").trim();
        if (!name) continue;
        const ean = String(r.ean || "").replace(/\D/g, "") || null;
        const categoryName = String(r.categoryName || "").trim();
        let categoryId = null;
        if (categoryName) {
          let cat = await tx.category.findFirst({ where: { tenantId, name: categoryName }, select: { id: true } });
          if (!cat) cat = await tx.category.create({ data: { tenantId, name: categoryName }, select: { id: true } });
          categoryId = cat.id;
        }
        const existing = ean
          ? await tx.product.findFirst({ where: { tenantId, ean }, select: { id: true } })
          : await tx.product.findFirst({ where: { tenantId, name }, select: { id: true } });
        const data = {
          tenantId,
          categoryId,
          name,
          ean,
          active: parseBool(r.active, true),
          controlled: parseBool(r.controlled, false),
          defaultMarkup: parseNum(r.defaultMarkup, 0),
        };
        if (existing?.id) {
          await tx.product.update({ where: { id: existing.id }, data });
        } else {
          await tx.product.create({ data });
        }
        count += 1;
      }
      return { imported: count };
    }

    if (table === "customers") {
      let count = 0;
      for (const r of rows) {
        const name = String(r.name || "").trim();
        if (!name) continue;
        const document = String(r.document || "").replace(/\D/g, "") || null;
        const email = String(r.email || "").trim().toLowerCase() || null;
        const where = document
          ? { tenantId, document }
          : { tenantId, name, email: email || undefined };
        const existing = await tx.customer.findFirst({ where, select: { id: true } });
        const data = {
          tenantId,
          name,
          document,
          birthDate: safeDate(r.birthDate) || null,
          whatsapp: String(r.whatsapp || "").replace(/\D/g, "") || null,
          phone: String(r.phone || "").replace(/\D/g, "") || null,
          email,
        };
        if (existing?.id) {
          await tx.customer.update({ where: { id: existing.id }, data });
        } else {
          await tx.customer.create({ data });
        }
        count += 1;
      }
      return { imported: count };
    }

    return { imported: 0 };
  }

  async function assertFeature(req, featureKey, message) {
    const license = await getLicense(req);
    if (!isFeatureEnabled(featureKey, license)) {
      throw Object.assign(new Error(message || "Recurso indisponivel no plano atual"), { statusCode: 403 });
    }
  }

  async function assertUserCreationAllowed(req, roleName, options = {}) {
    const excludeUserId = options.excludeUserId || null;
    const tenantId = await resolveTenantId(req);
    const license = await getLicense(req);
    if (!isLicenseActive(license)) {
      throw Object.assign(new Error("Licenca inativa. Regularize o plano para continuar."), { statusCode: 403 });
    }
    const maxUsers = Number(license?.limits?.maxActiveUsers || 0);
    if (maxUsers > 0) {
      const activeUsers = await prisma.user.count({
        where: excludeUserId
          ? { tenantId, active: true, id: { not: excludeUserId } }
          : { tenantId, active: true },
      });
      if (activeUsers >= maxUsers) {
        throw Object.assign(new Error("Limite do plano MINIMO atingido para usuarios."), { statusCode: 403 });
      }
    }
    const capByRole = license?.limits?.maxRoleActive || {};
    const roleCap = Number(capByRole?.[String(roleName || "").toUpperCase()] || 0);
    if (roleCap > 0) {
      const role = await prisma.role.findUnique({ where: { name: String(roleName).toUpperCase() }, select: { id: true } });
      if (role?.id) {
        const roleActiveUsers = await prisma.user.count({
          where: excludeUserId
            ? { tenantId, active: true, roleId: role.id, id: { not: excludeUserId } }
            : { tenantId, active: true, roleId: role.id },
        });
        if (roleActiveUsers >= roleCap) {
          throw Object.assign(new Error(`Limite do plano MINIMO atingido para perfil ${String(roleName).toUpperCase()}.`), { statusCode: 403 });
        }
      }
    }
  }

  async function assertStoreActivationAllowed(req, nextActiveState) {
    if (!nextActiveState) return;
    const tenantId = await resolveTenantId(req);
    const license = await getLicense(req);
    if (!isLicenseActive(license)) {
      throw Object.assign(new Error("Licenca inativa. Regularize o plano para continuar."), { statusCode: 403 });
    }
    const maxStores = Number(license?.limits?.maxActiveStores || 0);
    if (maxStores > 0) {
      const activeStores = await prisma.store.count({ where: { tenantId, active: true } });
      if (activeStores >= maxStores) {
        throw Object.assign(new Error("Limite do plano MINIMO atingido para lojas."), { statusCode: 403 });
      }
    }
  }

  function isUserOnline(lastSeenAt) {
    if (!lastSeenAt) return false;
    const ts = new Date(lastSeenAt).getTime();
    if (Number.isNaN(ts)) return false;
    return (Date.now() - ts) <= ONLINE_WINDOW_MS;
  }

  function serializeChatUser(user) {
    if (!user) return null;
    return {
      ...user,
      isOnline: isUserOnline(user.lastSeenAt),
    };
  }

  async function touchChatPresence(userId) {
    if (!userId) return;
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      });
    } catch {
      // no-op
    }
  }

  async function getReservedQtyByProduct(storeId, productIds) {
    if (!storeId || !productIds || productIds.length === 0) return {};
    const rows = await prisma.stockReservationItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        reservation: { sourceStoreId: storeId, status: "APPROVED" },
      },
      _sum: { reservedQty: true },
    });
    return rows.reduce((acc, row) => {
      acc[row.productId] = Number(row._sum.reservedQty || 0);
      return acc;
    }, {});
  }

  async function getAvailableQtyInStore(storeId, productId) {
    const total = await prisma.inventoryLot.aggregate({
      _sum: { quantity: true },
      where: { storeId, productId, active: true, quantity: { gt: 0 } },
    });
    const totalQty = Number(total._sum.quantity || 0);
    const reserved = await prisma.stockReservationItem.aggregate({
      _sum: { reservedQty: true },
      where: {
        productId,
        reservation: { sourceStoreId: storeId, status: "APPROVED" },
      },
    });
    const reservedQty = Number(reserved._sum.reservedQty || 0);
    return Math.max(0, totalQty - reservedQty);
  }

  // Helper: get storeId from header or default, validating user access.
  async function resolveStoreId(req) {
    const tenantId = await resolveTenantId(req);
    const fromHeader = String(req.headers["x-store-id"] || "").trim();
    if (fromHeader) {
      if (isAdmin(req)) {
        const adminStore = await prisma.store.findFirst({
          where: { id: fromHeader, tenantId, active: true },
          select: { id: true },
        });
        if (!adminStore) throw Object.assign(new Error("Loja informada fora do tenant"), { statusCode: 403 });
        return fromHeader;
      }
      const allowed = await prisma.storeUser.findFirst({
        where: { userId: req.user?.id, storeId: fromHeader, store: { active: true, tenantId } },
        select: { storeId: true },
      });
      if (!allowed) {
        throw Object.assign(new Error("Usuario sem acesso a loja informada"), { statusCode: 403 });
      }
      return fromHeader;
    }
    if (!req.user) return null;
    if (isAdmin(req)) {
      const defaultStore = await prisma.store.findFirst({
        where: { active: true, isDefault: true, tenantId },
        select: { id: true },
      });
      if (defaultStore?.id) return defaultStore.id;
      const firstStore = await prisma.store.findFirst({
        where: { active: true, tenantId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      return firstStore?.id || null;
    }
    const su = await prisma.storeUser.findFirst({
      where: { userId: req.user.id, isDefault: true, store: { active: true, tenantId } },
      select: { storeId: true },
    });
    if (su?.storeId) return su.storeId;
    const fallback = await prisma.storeUser.findFirst({
      where: { userId: req.user.id, store: { active: true, tenantId } },
      select: { storeId: true },
    });
    return fallback?.storeId || null;
  }

  // Helper: load full sale with includes (used by multiple endpoints)
  async function loadFullSale(id, tenantId) {
    return prisma.sale.findFirst({
      where: { id, tenantId },
      include: {
        customer: true,
        items: { include: { product: true } },
        payments: true,
        posTransactions: { orderBy: { createdAt: "desc" } },
        controlledDispensation: true,
      },
    });
  }

  // License lock: when tenant license is inactive, ADMIN can only regularize license.
  router.use(asyncHandler(async (req, res, next) => {
    if (!isAdmin(req)) return next();
    const license = await getLicense(req);
    if (isLicenseActive(license)) return next();
    const p = String(req.path || "");
    if (p === "/license/me" || p === "/license/me/contractor" || p === "/license/onboarding/finalize" || p.startsWith("/license/cep/")) return next();
    return res.status(403).json({
      error: {
        code: 403,
        message: "Licenca inativa. Regularize em Configuracoes > Licenciamento.",
      },
    });
  }));

  // First-login lock: user must change provisional password before using other modules.
  router.use(asyncHandler(async (req, res, next) => {
    if (!req.user?.id) return next();
    const userRow = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { mustChangePassword: true },
    });
    if (!userRow?.mustChangePassword) return next();
    const p = String(req.path || "");
    const selfProfilePath = `/users/${req.user.id}/profile`;
    if (p === selfProfilePath || p === "/license/me") return next();
    return res.status(403).json({
      error: {
        code: 403,
        message: "Troca de senha obrigatoria no primeiro acesso.",
      },
    });
  }));

  function normalizeDocument(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function validateControlledDispensationInput(payload) {
    const data = {
      patientName: String(payload?.patientName || "").trim(),
      patientDocument: normalizeDocument(payload?.patientDocument || ""),
      buyerName: String(payload?.buyerName || "").trim(),
      buyerDocument: normalizeDocument(payload?.buyerDocument || ""),
      prescriberName: String(payload?.prescriberName || "").trim(),
      prescriberCrm: String(payload?.prescriberCrm || "").trim().toUpperCase(),
      prescriberUf: String(payload?.prescriberUf || "").trim().toUpperCase().slice(0, 2),
      prescriptionNumber: String(payload?.prescriptionNumber || "").trim(),
      prescriptionDate: safeDate(payload?.prescriptionDate),
      signatureDataUrl: String(payload?.signatureDataUrl || "").trim(),
      notes: payload?.notes ? String(payload.notes).trim() : null,
    };

    if (!data.patientName) throw Object.assign(new Error("Paciente obrigatorio"), { statusCode: 400 });
    if (!data.buyerName) throw Object.assign(new Error("Comprador obrigatorio"), { statusCode: 400 });
    if (data.buyerDocument.length !== 11) throw Object.assign(new Error("CPF do comprador invalido"), { statusCode: 400 });
    if (!data.prescriberName) throw Object.assign(new Error("Prescritor obrigatorio"), { statusCode: 400 });
    if (!data.prescriberCrm) throw Object.assign(new Error("CRM obrigatorio"), { statusCode: 400 });
    if (data.prescriberUf.length !== 2) throw Object.assign(new Error("UF do CRM obrigatoria"), { statusCode: 400 });
    if (!data.prescriptionNumber) throw Object.assign(new Error("Numero da receita obrigatorio"), { statusCode: 400 });
    if (!data.prescriptionDate || Number.isNaN(data.prescriptionDate.getTime())) {
      throw Object.assign(new Error("Data da receita obrigatoria"), { statusCode: 400 });
    }
    if (!data.signatureDataUrl.startsWith("data:image/") || data.signatureDataUrl.length < 100) {
      throw Object.assign(new Error("Assinatura do cliente obrigatoria"), { statusCode: 400 });
    }

    if (!data.patientDocument) data.patientDocument = null;
    return data;
  }

  async function assertControlledDispensationIfRequired(saleId, tenantId) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, tenantId },
      include: {
        items: { include: { product: { select: { controlled: true } } } },
        controlledDispensation: true,
      },
    });
    if (!sale) throw Object.assign(new Error("Venda nao encontrada"), { statusCode: 404 });

    const hasControlled = (sale.items || []).some((it) => Boolean(it.product?.controlled));
    if (!hasControlled) return;

    const disp = sale.controlledDispensation;
    if (!disp) {
      throw Object.assign(new Error("Venda com controlado exige dados da receita e assinatura"), { statusCode: 400 });
    }

    validateControlledDispensationInput({
      patientName: disp.patientName,
      patientDocument: disp.patientDocument,
      buyerName: disp.buyerName,
      buyerDocument: disp.buyerDocument,
      prescriberName: disp.prescriberName,
      prescriberCrm: disp.prescriberCrm,
      prescriberUf: disp.prescriberUf,
      prescriptionNumber: disp.prescriptionNumber,
      prescriptionDate: disp.prescriptionDate,
      signatureDataUrl: disp.signatureDataUrl,
      notes: disp.notes,
    });
  }

  async function sendTransferRequestChatMessages({ transfer, senderId }) {
    if (!transfer?.originStoreId || !transfer?.destinationStoreId || !senderId) return;
    const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { tenantId: true, name: true } });
    const tenantId = sender?.tenantId;
    if (!tenantId) return;

    const [admins, pharmacists] = await Promise.all([
      prisma.user.findMany({
        where: {
          tenantId,
          active: true,
          id: { not: senderId },
          role: { name: "ADMIN" },
        },
        select: { id: true },
      }),
      prisma.user.findMany({
        where: {
          tenantId,
          active: true,
          id: { not: senderId },
          role: { name: "FARMACEUTICO" },
          stores: { some: { storeId: transfer.originStoreId } },
        },
        select: { id: true },
      }),
    ]);

    const recipientIds = Array.from(new Set([...admins, ...pharmacists].map((u) => u.id).filter(Boolean)));
    if (recipientIds.length === 0) return;

    const requesterName = sender?.name || "Usuario";
    const message = `Nova solicitacao de transferencia para ${transfer.destinationStore?.name || "Loja solicitante"} (${transfer.items?.length || 0} item(ns)). Solicitante: ${requesterName}.`;

    await prisma.chatMessage.createMany({
      data: recipientIds.map((recipientId) => ({
        tenantId,
        senderId,
        recipientId,
        content: message,
        metaType: "TRANSFER_REQUEST",
        metaJson: {
          transferId: transfer.id,
          originStoreId: transfer.originStoreId,
          destinationStoreId: transfer.destinationStoreId,
        },
      })),
    });
  }

  async function sendTransferSentChatMessage({ transferId, senderId }) {
    if (!transferId || !senderId) return;
    const senderTenant = await prisma.user.findUnique({ where: { id: senderId }, select: { tenantId: true, name: true } });
    const tenantId = senderTenant?.tenantId;
    if (!tenantId) return;

    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: {
        originStore: { select: { id: true, name: true } },
        destinationStore: { select: { id: true, name: true } },
      },
    });
    if (!transfer?.createdById) return;
    if (transfer.createdById === senderId) return;

    const [sender, movements] = await Promise.all([
      prisma.user.findUnique({ where: { id: senderId }, select: { name: true } }),
      prisma.inventoryMovement.findMany({
        where: { transferId, type: "TRANSFER_OUT" },
        select: { productId: true, quantity: true },
      }),
    ]);

    const sentItemsCount = new Set(movements.map((m) => m.productId)).size;
    const sentUnits = movements.reduce((sum, m) => sum + Number(m.quantity || 0), 0);
    const senderName = sender?.name || "Usuario";

    const message = `Transferencia enviada para ${transfer.destinationStore?.name || "loja solicitante"}. Enviado por ${senderName}: ${sentItemsCount} item(ns), ${sentUnits} unidade(s).`;

    await prisma.chatMessage.create({
      data: {
        tenantId,
        senderId,
        recipientId: transfer.createdById,
        content: message,
        metaType: "TRANSFER_SENT",
        metaJson: {
          transferId: transfer.id,
          originStoreId: transfer.originStoreId,
          destinationStoreId: transfer.destinationStoreId,
          sentItemsCount,
          sentUnits,
        },
      },
    });
  }

  // â”€â”€â”€ DASHBOARD â”€â”€â”€
  router.get("/license/me", asyncHandler(async (req, res) => {
    const license = await getLicense(req);
    const profile = await getTenantLicenseProfile(req);
    return sendOk(res, req, { ...license, tenantId: profile.tenantId, contractor: profile.contractor });
  }));

  router.put("/license/me", asyncHandler(async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: { code: 403, message: "Somente admin pode alterar licenca" } });
    }
    const tenantId = await resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "Tenant nao identificado" } });
    const isDevTenant = await isDeveloperTenantById(tenantId);
    if (!isDevTenant) {
      return res.status(403).json({ error: { code: 403, message: "Contratante nao pode alterar licenca diretamente" } });
    }

    await upsertTenantLicenseWithAudit({ tenantId, actor: req.user, body: req.body });

    const license = await getLicense(req);
    const profile = await getTenantLicenseProfile(req);
    return sendOk(res, req, { ...license, tenantId: profile.tenantId, contractor: profile.contractor });
  }));

  router.put("/license/me/contractor", asyncHandler(async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: { code: 403, message: "Somente admin pode alterar dados do contratante" } });
    }
    const tenantId = await resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "Tenant nao identificado" } });

    const contractor = normalizeContractorPayload(req.body || {});
    if (!contractor.nameOrCompany) {
      return res.status(400).json({ error: { code: 400, message: "Nome/Razao social do contratante e obrigatorio" } });
    }
    if (contractor.document && !isValidCpfCnpj(contractor.document)) {
      return res.status(400).json({ error: { code: 400, message: "CPF/CNPJ do contratante invalido" } });
    }
    if (contractor.zipCode && contractor.zipCode.length !== 8) {
      return res.status(400).json({ error: { code: 400, message: "CEP do contratante invalido" } });
    }
    if (!isValidPhone(contractor.phoneWhatsapp)) {
      return res.status(400).json({ error: { code: 400, message: "Telefone/WhatsApp do contratante invalido" } });
    }
    if (contractor.email && !isValidEmail(contractor.email)) {
      return res.status(400).json({ error: { code: 400, message: "Email do contratante invalido" } });
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        contractorDocument: contractor.document,
        contractorNameOrCompany: contractor.nameOrCompany,
        contractorTradeName: contractor.tradeName,
        contractorAddressFull: contractor.addressFull,
        contractorStreet: contractor.street,
        contractorNumber: contractor.number,
        contractorComplement: contractor.complement,
        contractorDistrict: contractor.district,
        contractorCity: contractor.city,
        contractorState: contractor.state,
        contractorZipCode: contractor.zipCode,
        contractorPhoneWhatsapp: contractor.phoneWhatsapp,
        contractorEmail: contractor.email,
        contractorLogoFile: contractor.logoFile,
      },
    });

    await prisma.tenantLicenseAudit.create({
      data: {
        tenantId,
        previousPlan: null,
        newPlan: "CONTRACTOR_PROFILE",
        previousStatus: null,
        newStatus: "ACTIVE",
        changedById: req.user?.id || null,
        changedByName: req.user?.name || req.user?.email || "Admin",
        reason: "Atualizacao de dados do contratante",
        payload: { contractor },
      },
    });

    const license = await getLicense(req);
    const profile = await getTenantLicenseProfile(req);
    return sendOk(res, req, { ...license, tenantId: profile.tenantId, contractor: profile.contractor });
  }));

  router.get("/license/cep/:cep", asyncHandler(async (req, res) => {
    const cep = String(req.params.cep || "").replace(/\D/g, "");
    if (cep.length !== 8) {
      return res.status(400).json({ error: { code: 400, message: "CEP invalido" } });
    }
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) {
      return res.status(502).json({ error: { code: 502, message: "Falha ao consultar CEP" } });
    }
    const data = await response.json();
    if (data?.erro) {
      return res.status(404).json({ error: { code: 404, message: "CEP nao encontrado" } });
    }
    return sendOk(res, req, {
      zipCode: cep,
      street: String(data.logradouro || "").trim() || null,
      complement: String(data.complemento || "").trim() || null,
      district: String(data.bairro || "").trim() || null,
      city: String(data.localidade || "").trim() || null,
      state: String(data.uf || "").trim().toUpperCase() || null,
    });
  }));

  function parseRequestedRoleCaps(raw) {
    const caps = normalizeRoleCaps(raw || {});
    if (!Number(caps.ADMIN || 0)) throw Object.assign(new Error("Informe ao menos 1 usuario ADMIN"), { statusCode: 400 });
    const total = totalRoleCaps(caps);
    if (total <= 0) throw Object.assign(new Error("Quantidade de usuarios invalida"), { statusCode: 400 });
    return { caps, total };
  }

  function serializeChangeRequest(row) {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      status: row.status,
      currentPlanCode: row.currentPlanCode,
      currentEndsAt: row.currentEndsAt,
      currentMonthlyPriceCents: row.currentMonthlyPriceCents,
      currentAnnualPriceCents: row.currentAnnualPriceCents,
      requestedTotalUsers: row.requestedTotalUsers,
      requestedRoleCaps: row.requestedRoleCaps || {},
      requestedNote: row.requestedNote || null,
      requestedByName: row.requestedByName || null,
      requestedByEmail: row.requestedByEmail || null,
      proposedPlanCode: row.proposedPlanCode || null,
      proposedIsExistingPlan: Boolean(row.proposedIsExistingPlan),
      proposedTotalUsers: row.proposedTotalUsers ?? null,
      proposedRoleCaps: row.proposedRoleCaps || null,
      proposedMonthlyPriceCents: row.proposedMonthlyPriceCents ?? null,
      proposedAnnualPriceCents: row.proposedAnnualPriceCents ?? null,
      proposedExtrasDescription: row.proposedExtrasDescription || null,
      proposedDifferenceMonthlyCents: row.proposedDifferenceMonthlyCents ?? null,
      proposedDifferenceAnnualCents: row.proposedDifferenceAnnualCents ?? null,
      proposedNote: row.proposedNote || null,
      reviewedByName: row.reviewedByName || null,
      reviewedByEmail: row.reviewedByEmail || null,
      reviewedAt: row.reviewedAt || null,
      decisionByName: row.decisionByName || null,
      decisionByEmail: row.decisionByEmail || null,
      decisionNote: row.decisionNote || null,
      decidedAt: row.decidedAt || null,
      appliedAt: row.appliedAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  function buildProposalFromRoleCaps({ currentPlanCode, roleCaps, monthlyPriceCents, annualPriceCents, extrasDescription, note }) {
    const requestedCaps = normalizeRoleCaps(roleCaps || {});
    const requestedTotal = totalRoleCaps(requestedCaps);
    const bestPlan = findBestPlanForRoleCaps(requestedCaps);
    const currentPlan = PLAN_CATALOG[String(currentPlanCode || "MINIMO").toUpperCase()] || PLAN_CATALOG.MINIMO;
    const currentMonthly = Number(currentPlan?.monthlyPriceCents || 0);
    const currentAnnual = Number(currentPlan?.annualPriceCents || 0);

    if (bestPlan) {
      return {
        proposedPlanCode: bestPlan.code,
        proposedIsExistingPlan: true,
        proposedRoleCaps: bestPlan.limits?.maxRoleActive || {},
        proposedTotalUsers: Number(bestPlan.limits?.maxActiveUsers || 0),
        proposedMonthlyPriceCents: Number(bestPlan.monthlyPriceCents || 0),
        proposedAnnualPriceCents: Number(bestPlan.annualPriceCents || 0),
        proposedExtrasDescription: null,
        proposedDifferenceMonthlyCents: Number(bestPlan.monthlyPriceCents || 0) - currentMonthly,
        proposedDifferenceAnnualCents: Number(bestPlan.annualPriceCents || 0) - currentAnnual,
        proposedNote: note || null,
        _requestedCaps: requestedCaps,
        _requestedTotal: requestedTotal,
      };
    }

    const finalMonthly = Number.isFinite(Number(monthlyPriceCents)) ? Number(monthlyPriceCents) : currentMonthly;
    const finalAnnual = Number.isFinite(Number(annualPriceCents)) ? Number(annualPriceCents) : currentAnnual;
    return {
      proposedPlanCode: currentPlan.code,
      proposedIsExistingPlan: false,
      proposedRoleCaps: requestedCaps,
      proposedTotalUsers: requestedTotal,
      proposedMonthlyPriceCents: finalMonthly,
      proposedAnnualPriceCents: finalAnnual,
      proposedExtrasDescription: String(extrasDescription || "").trim() || "Ajuste de usuarios fora dos pacotes padrao",
      proposedDifferenceMonthlyCents: finalMonthly - currentMonthly,
      proposedDifferenceAnnualCents: finalAnnual - currentAnnual,
      proposedNote: note || null,
      _requestedCaps: requestedCaps,
      _requestedTotal: requestedTotal,
    };
  }

  router.get("/license/me/change-requests", asyncHandler(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: { code: 403, message: "Somente admin pode consultar solicitacoes" } });
    const tenantId = await resolveTenantId(req);
    const rows = await prisma.tenantLicenseChangeRequest.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    });
    return sendOk(res, req, { requests: rows.map(serializeChangeRequest) });
  }));

  router.post("/license/me/change-requests", asyncHandler(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: { code: 403, message: "Somente admin pode solicitar ajuste" } });
    const tenantId = await resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "Licenciado nao identificado" } });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, isDeveloperTenant: true } });
    if (!tenant || tenant.isDeveloperTenant) {
      return res.status(403).json({ error: { code: 403, message: "Solicitacao indisponivel para licenca Desenvolvedor" } });
    }

    const open = await prisma.tenantLicenseChangeRequest.findFirst({
      where: { tenantId, status: { in: ["PENDING_MASTER_REVIEW", "PENDING_CONTRACTOR_APPROVAL"] } },
      select: { id: true },
    });
    if (open?.id) {
      return res.status(409).json({ error: { code: 409, message: "Ja existe solicitacao em andamento para este licenciado" } });
    }

    const { caps, total } = parseRequestedRoleCaps(req.body?.roleCaps || {});
    const current = await getLicense(req);
    const created = await prisma.tenantLicenseChangeRequest.create({
      data: {
        tenantId,
        status: "PENDING_MASTER_REVIEW",
        currentPlanCode: current.planCode,
        currentEndsAt: current.endsAt ? new Date(current.endsAt) : null,
        currentMonthlyPriceCents: Number(current.pricing?.monthlyPriceCents || 0),
        currentAnnualPriceCents: Number(current.pricing?.annualPriceCents || 0),
        requestedTotalUsers: total,
        requestedRoleCaps: caps,
        requestedNote: String(req.body?.note || "").trim() || null,
        requestedByUserId: req.user?.id || null,
        requestedByName: req.user?.name || null,
        requestedByEmail: req.user?.email || null,
      },
    });
    return sendOk(res, req, { request: serializeChangeRequest(created) });
  }));

  router.post("/license/me/change-requests/:id/approve", asyncHandler(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: { code: 403, message: "Somente admin pode aprovar proposta" } });
    const tenantId = await resolveTenantId(req);
    const id = String(req.params.id || "").trim();
    const request = await prisma.tenantLicenseChangeRequest.findFirst({ where: { id, tenantId } });
    if (!request) return res.status(404).json({ error: { code: 404, message: "Solicitacao nao encontrada" } });
    if (request.status !== "PENDING_CONTRACTOR_APPROVAL") {
      return res.status(400).json({ error: { code: 400, message: "Solicitacao ainda nao esta pronta para aprovacao do contratante" } });
    }

    await prisma.$transaction(async (tx) => {
      const license = await tx.tenantLicense.findUnique({ where: { tenantId }, select: { id: true, endsAt: true, status: true } });
      if (!license?.id) throw Object.assign(new Error("Licenca nao encontrada"), { statusCode: 404 });
      const appliedPlan = PLAN_CATALOG[String(request.proposedPlanCode || request.currentPlanCode || "MINIMO").toUpperCase()] || PLAN_CATALOG.MINIMO;
      const appliedRoleCaps = normalizeRoleCaps(request.proposedRoleCaps || {});
      const appliedTotalUsers = Number(request.proposedTotalUsers || totalRoleCaps(appliedRoleCaps));
      const baseRoleCaps = normalizeRoleCaps(appliedPlan?.limits?.maxRoleActive || {});
      const baseTotalUsers = Number(appliedPlan?.limits?.maxActiveUsers || 0);
      const addonRoleCaps = Object.keys(appliedRoleCaps).reduce((acc, role) => {
        const delta = Number(appliedRoleCaps[role] || 0) - Number(baseRoleCaps[role] || 0);
        acc[role] = delta > 0 ? delta : 0;
        return acc;
      }, {});
      const addonTotalUsers = Math.max(0, appliedTotalUsers - baseTotalUsers);
      const hasAddonRole = Object.values(addonRoleCaps).some((n) => Number(n || 0) > 0);

      await tx.tenantLicense.update({
        where: { tenantId },
        data: {
          planCode: request.proposedPlanCode || request.currentPlanCode,
          status: license.status || "ACTIVE",
          endsAt: license.endsAt,
          addonMaxActiveUsers: request.proposedIsExistingPlan ? 0 : addonTotalUsers,
          addonMaxRoleActive: request.proposedIsExistingPlan ? {} : (hasAddonRole ? addonRoleCaps : {}),
          overrideMonthlyPriceCents: request.proposedIsExistingPlan ? null : (request.proposedMonthlyPriceCents ?? null),
          overrideAnnualPriceCents: request.proposedIsExistingPlan ? null : (request.proposedAnnualPriceCents ?? null),
          extrasDescription: request.proposedIsExistingPlan ? null : (request.proposedExtrasDescription || null),
          updatedById: req.user?.id || null,
          updatedByName: req.user?.name || req.user?.email || "Admin",
        },
      });

      await tx.tenantLicenseChangeRequest.update({
        where: { id: request.id },
        data: {
          status: "APPLIED",
          decisionByUserId: req.user?.id || null,
          decisionByName: req.user?.name || null,
          decisionByEmail: req.user?.email || null,
          decisionNote: String(req.body?.note || "").trim() || null,
          decidedAt: new Date(),
          appliedAt: new Date(),
        },
      });
      await tx.tenantLicenseAudit.create({
        data: {
          tenantId,
          previousPlan: request.currentPlanCode || null,
          newPlan: request.proposedPlanCode || request.currentPlanCode,
          previousStatus: "ACTIVE",
          newStatus: "ACTIVE",
          changedById: req.user?.id || null,
          changedByName: req.user?.name || req.user?.email || "Admin",
          reason: "Aprovacao de ajuste de licenca pelo contratante",
          payload: {
            requestId: request.id,
            requestedRoleCaps: request.requestedRoleCaps,
            proposedRoleCaps: request.proposedRoleCaps,
            proposedIsExistingPlan: request.proposedIsExistingPlan,
            proposedExtrasDescription: request.proposedExtrasDescription,
          },
        },
      });
    });

    const applied = await prisma.tenantLicenseChangeRequest.findUnique({ where: { id } });
    return sendOk(res, req, { request: serializeChangeRequest(applied) });
  }));

  router.get("/license/admin/change-requests", asyncHandler(async (req, res) => {
    await assertDeveloperAdmin(req);
    const statusRaw = String(req.query.status || "").trim().toUpperCase();
    const where = {};
    if (statusRaw) where.status = statusRaw;
    const rows = await prisma.tenantLicenseChangeRequest.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            contractorNameOrCompany: true,
            contractorTradeName: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });
    return sendOk(res, req, {
      requests: rows.map((row) => ({
        ...serializeChangeRequest(row),
        tenant: row.tenant ? {
          id: row.tenant.id,
          name: row.tenant.name,
          contractorNameOrCompany: row.tenant.contractorNameOrCompany || null,
          contractorTradeName: row.tenant.contractorTradeName || null,
        } : null,
      })),
    });
  }));

  router.put("/license/admin/change-requests/:id/review", asyncHandler(async (req, res) => {
    await assertDeveloperAdmin(req);
    const id = String(req.params.id || "").trim();
    const action = String(req.body?.action || "PROPOSE").trim().toUpperCase();
    const request = await prisma.tenantLicenseChangeRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: { code: 404, message: "Solicitacao nao encontrada" } });
    if (request.status !== "PENDING_MASTER_REVIEW") {
      return res.status(400).json({ error: { code: 400, message: "Solicitacao nao esta pendente para revisao do Desenvolvedor" } });
    }

    if (action === "REJECT") {
      const rejected = await prisma.tenantLicenseChangeRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedByUserId: req.user?.id || null,
          reviewedByName: req.user?.name || null,
          reviewedByEmail: req.user?.email || null,
          reviewedAt: new Date(),
          proposedNote: String(req.body?.note || "").trim() || null,
        },
      });
      return sendOk(res, req, { request: serializeChangeRequest(rejected) });
    }

    const roleCapsSource = req.body?.roleCaps && typeof req.body.roleCaps === "object"
      ? req.body.roleCaps
      : request.requestedRoleCaps;
    const proposal = buildProposalFromRoleCaps({
      currentPlanCode: request.currentPlanCode,
      roleCaps: roleCapsSource,
      monthlyPriceCents: req.body?.monthlyPriceCents,
      annualPriceCents: req.body?.annualPriceCents,
      extrasDescription: req.body?.extrasDescription,
      note: req.body?.note,
    });

    const reviewed = await prisma.tenantLicenseChangeRequest.update({
      where: { id },
      data: {
        status: "PENDING_CONTRACTOR_APPROVAL",
        proposedPlanCode: proposal.proposedPlanCode,
        proposedIsExistingPlan: proposal.proposedIsExistingPlan,
        proposedRoleCaps: proposal.proposedRoleCaps,
        proposedTotalUsers: proposal.proposedTotalUsers,
        proposedMonthlyPriceCents: proposal.proposedMonthlyPriceCents,
        proposedAnnualPriceCents: proposal.proposedAnnualPriceCents,
        proposedExtrasDescription: proposal.proposedExtrasDescription,
        proposedDifferenceMonthlyCents: proposal.proposedDifferenceMonthlyCents,
        proposedDifferenceAnnualCents: proposal.proposedDifferenceAnnualCents,
        proposedNote: proposal.proposedNote,
        reviewedByUserId: req.user?.id || null,
        reviewedByName: req.user?.name || null,
        reviewedByEmail: req.user?.email || null,
        reviewedAt: new Date(),
      },
    });
    return sendOk(res, req, { request: serializeChangeRequest(reviewed) });
  }));

  router.post("/license/me/import/validate", asyncHandler(async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: { code: 403, message: "Somente admin pode validar importacao" } });
    }
    const tenantId = await resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "Licenciado nao identificado" } });
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (files.length === 0) return res.status(400).json({ error: { code: 400, message: "Informe ao menos um arquivo para validacao" } });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, isDeveloperTenant: true },
    });
    if (!tenant) return res.status(404).json({ error: { code: 404, message: "Licenciado nao encontrado" } });
    if (tenant.isDeveloperTenant) {
      return res.status(403).json({ error: { code: 403, message: "Importacao indisponivel para licenca Desenvolvedor" } });
    }

    const tables = files.map((f) => String(f?.table || "").trim()).filter(Boolean);
    const duplicated = tables.find((t, idx) => tables.indexOf(t) !== idx);
    if (duplicated) {
      return res.status(400).json({ error: { code: 400, message: `Tabela duplicada no envio: ${duplicated}` } });
    }

    const validation = files.map((f) => validateImportFile({
      table: String(f?.table || "").trim(),
      fileName: String(f?.fileName || "").trim(),
      content: String(f?.content || ""),
    }));
    const compatible = validation.every((item) => item.compatible);
    return sendOk(res, req, { tenantId, tenantName: tenant.name, compatible, validation });
  }));

  router.post("/license/me/import/execute", asyncHandler(async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: { code: 403, message: "Somente admin pode importar dados" } });
    }
    const tenantId = await resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "Licenciado nao identificado" } });
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (files.length === 0) return res.status(400).json({ error: { code: 400, message: "Informe ao menos um arquivo para importacao" } });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, isDeveloperTenant: true },
    });
    if (!tenant) return res.status(404).json({ error: { code: 404, message: "Licenciado nao encontrado" } });
    if (tenant.isDeveloperTenant) {
      return res.status(403).json({ error: { code: 403, message: "Importacao indisponivel para licenca Desenvolvedor" } });
    }

    const tables = files.map((f) => String(f?.table || "").trim()).filter(Boolean);
    const duplicated = tables.find((t, idx) => tables.indexOf(t) !== idx);
    if (duplicated) {
      return res.status(400).json({ error: { code: 400, message: `Tabela duplicada no envio: ${duplicated}` } });
    }

    const validation = files.map((f) => validateImportFile({
      table: String(f?.table || "").trim(),
      fileName: String(f?.fileName || "").trim(),
      content: String(f?.content || ""),
    }));
    const incompatible = validation.filter((item) => !item.compatible);
    if (incompatible.length > 0) {
      return res.status(400).json({
        error: { code: 400, message: "Existe arquivo incompativel. Corrija antes de importar." },
        data: { compatible: false, validation },
      });
    }

    const summary = [];
    const targetLicense = await resolveLicenseByTenantId(tenant.id);
    await prisma.$transaction(async (tx) => {
      for (const item of validation) {
        // eslint-disable-next-line no-await-in-loop
        const result = await applyImportRows({
          tx,
          tenantId: tenant.id,
          table: item.table,
          rows: item.parsedRows || [],
        });
        summary.push({
          table: item.table,
          label: item.label || item.table,
          fileName: item.fileName || "-",
          totalRows: Number(item.totalRows || 0),
          imported: Number(result?.imported || 0),
        });
      }
      await tx.tenantLicenseAudit.create({
        data: {
          tenantId: tenant.id,
          previousPlan: targetLicense?.planCode || null,
          newPlan: targetLicense?.planCode || "MINIMO",
          previousStatus: targetLicense?.status || null,
          newStatus: targetLicense?.status || "ACTIVE",
          changedById: req.user?.id || null,
          changedByName: req.user?.name || req.user?.email || "Admin",
          reason: "Importacao de dados pelo admin do licenciado",
          payload: { importedTables: summary },
        },
      });
    });

    return sendOk(res, req, {
      tenantId: tenant.id,
      tenantName: tenant.name,
      imported: summary,
    });
  }));

  router.post("/license/onboarding/finalize", asyncHandler(async (req, res) => {
    const sourceTenantId = await assertDeveloperAdmin(req);
    if (!sourceTenantId) return res.status(400).json({ error: { code: 400, message: "Tenant do desenvolvedor nao identificado" } });

    const validated = validateOnboardingPayload(req.body || {});
    const passwordTemp = generateProvisionalPassword();
    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash(passwordTemp, 10);
    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setFullYear(endsAt.getFullYear() + 1);

    const result = await prisma.$transaction(async (tx) => {
      const slugSeed = validated.contractor.document || validated.contractor.tradeName || validated.contractor.nameOrCompany || "tenant";
      const slug = await nextTenantSlug(slugSeed);
      const tenantName = validated.contractor.tradeName || validated.contractor.nameOrCompany;

      const existingAdminEmail = await tx.user.findFirst({
        where: { email: validated.adminEmail },
        select: { id: true },
      });
      if (existingAdminEmail) {
        throw Object.assign(new Error("Email de admin ja existe"), { statusCode: 400 });
      }

      const newTenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug,
          active: true,
          isDeveloperTenant: false,
          contractorDocument: validated.contractor.document,
          contractorNameOrCompany: validated.contractor.nameOrCompany,
          contractorTradeName: validated.contractor.tradeName,
          contractorAddressFull: validated.contractor.addressFull,
          contractorStreet: validated.contractor.street,
          contractorNumber: validated.contractor.number,
          contractorComplement: validated.contractor.complement,
          contractorDistrict: validated.contractor.district,
          contractorCity: validated.contractor.city,
          contractorState: validated.contractor.state,
          contractorZipCode: validated.contractor.zipCode,
          contractorPhoneWhatsapp: validated.contractor.phoneWhatsapp,
          contractorEmail: validated.contractor.email,
          contractorLogoFile: validated.contractor.logoFile,
        },
        select: { id: true, name: true, slug: true },
      });

      const license = await tx.tenantLicense.create({
        data: {
          tenantId: newTenant.id,
          planCode: validated.planCode,
          status: "ACTIVE",
          startsAt: now,
          endsAt,
          graceUntil: null,
          updatedById: req.user?.id || null,
          updatedByName: req.user?.name || req.user?.email || "Admin",
        },
      });

      const role = await tx.role.findUnique({ where: { name: "ADMIN" }, select: { id: true } });
      if (!role?.id) throw Object.assign(new Error("Role ADMIN nao encontrada"), { statusCode: 500 });
      const adminUser = await tx.user.create({
        data: {
          tenantId: newTenant.id,
          name: validated.adminName,
          email: validated.adminEmail,
          passwordHash,
          active: true,
          roleId: role.id,
          mustChangePassword: true,
          passwordChangedAt: null,
        },
        select: { id: true, name: true, email: true },
      });

      await tx.tenantLicenseAudit.create({
        data: {
          tenantId: newTenant.id,
          previousPlan: null,
          newPlan: license.planCode,
          previousStatus: null,
          newStatus: license.status,
          changedById: req.user?.id || null,
          changedByName: req.user?.name || req.user?.email || "Admin",
          reason: "Onboarding de novo licenciado com admin provisório",
          payload: {
            contractor: validated.contractor,
            adminUserId: adminUser.id,
            adminEmail: adminUser.email,
            temporaryPassword: passwordTemp,
            mustChangePassword: true,
          },
        },
      });

      return { license, adminUser, tenant: newTenant };
    });

    return sendOk(res, req, {
      tenantId: result.tenant.id,
      tenant: result.tenant,
      contractor: {
        tenantName: result.tenant.name,
        tenantSlug: result.tenant.slug,
        ...validated.contractor,
      },
      planCode: result.license.planCode,
      status: result.license.status,
      startsAt: result.license.startsAt,
      endsAt: result.license.endsAt,
      admin: {
        id: result.adminUser.id,
        name: result.adminUser.name,
        email: result.adminUser.email,
        temporaryPassword: passwordTemp,
        mustChangePassword: true,
      },
    });
  }));

  router.get("/license/admin/licenses", asyncHandler(async (req, res) => {
    await assertDeveloperAdmin(req);
    const rows = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isDeveloperTenant: true,
        contractorDocument: true,
        contractorNameOrCompany: true,
        contractorTradeName: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            stores: true,
            customers: true,
            chatMessages: true,
            transfers: true,
          },
        },
        license: {
          select: {
            id: true,
            planCode: true,
            status: true,
            startsAt: true,
            endsAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ isDeveloperTenant: "desc" }, { createdAt: "asc" }],
    });
    const provisionalByTenant = await buildProvisionalAdminByTenantMap(rows.map((r) => r.id));
    const licenses = rows.map((row) => ({
      ...row,
      provisionalAdmin: provisionalByTenant[row.id] || null,
    }));
    return sendOk(res, req, { licenses });
  }));

  router.get("/license/admin/licenses/:tenantId", asyncHandler(async (req, res) => {
    await assertDeveloperAdmin(req);
    const tenantId = String(req.params.tenantId || "").trim();
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "licenciadoId obrigatorio" } });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        isDeveloperTenant: true,
        contractorDocument: true,
        contractorNameOrCompany: true,
        contractorTradeName: true,
        contractorAddressFull: true,
        contractorStreet: true,
        contractorNumber: true,
        contractorComplement: true,
        contractorDistrict: true,
        contractorCity: true,
        contractorState: true,
        contractorZipCode: true,
        contractorPhoneWhatsapp: true,
        contractorEmail: true,
        contractorLogoFile: true,
        _count: { select: { users: true, stores: true, customers: true } },
        license: {
          select: {
            planCode: true,
            status: true,
            startsAt: true,
            endsAt: true,
            graceUntil: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!tenant) return res.status(404).json({ error: { code: 404, message: "Licenciado nao encontrado" } });
    const license = await resolveLicenseByTenantId(tenant.id);
    const provisionalByTenant = await buildProvisionalAdminByTenantMap([tenant.id]);
    return sendOk(res, req, {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isDeveloperTenant: tenant.isDeveloperTenant,
        contractor: {
          document: tenant.contractorDocument || null,
          nameOrCompany: tenant.contractorNameOrCompany || null,
          tradeName: tenant.contractorTradeName || null,
          addressFull: tenant.contractorAddressFull || null,
          street: tenant.contractorStreet || null,
          number: tenant.contractorNumber || null,
          complement: tenant.contractorComplement || null,
          district: tenant.contractorDistrict || null,
          city: tenant.contractorCity || null,
          state: tenant.contractorState || null,
          zipCode: tenant.contractorZipCode || null,
          phoneWhatsapp: tenant.contractorPhoneWhatsapp || null,
          email: tenant.contractorEmail || null,
          logoFile: tenant.contractorLogoFile || null,
        },
        counts: tenant._count || { users: 0, stores: 0, customers: 0 },
      },
      license,
      provisionalAdmin: provisionalByTenant[tenant.id] || null,
    });
  }));

  router.put("/license/admin/licenses/:tenantId", asyncHandler(async (req, res) => {
    await assertDeveloperAdmin(req);
    const tenantId = String(req.params.tenantId || "").trim();
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "licenciadoId obrigatorio" } });
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, isDeveloperTenant: true },
    });
    if (!tenant) return res.status(404).json({ error: { code: 404, message: "Licenciado nao encontrado" } });
    if (tenant.isDeveloperTenant) {
      return res.status(403).json({ error: { code: 403, message: "Licenca do Desenvolvedor nao pode ser alterada por esta tela" } });
    }

    await upsertTenantLicenseWithAudit({ tenantId: tenant.id, actor: req.user, body: req.body });
    const license = await resolveLicenseByTenantId(tenant.id);
    return sendOk(res, req, { tenantId: tenant.id, tenantName: tenant.name, license });
  }));

  router.post("/license/admin/cleanup", asyncHandler(async (req, res) => {
    await assertDeveloperAdmin(req);
    const tenantId = String(req.body?.tenantId || "").trim();
    const confirm = String(req.body?.confirm || "").trim().toUpperCase();
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "tenantId obrigatorio" } });
    if (confirm !== "CONFIRMAR") {
      return res.status(400).json({ error: { code: 400, message: "Confirmacao invalida. Informe CONFIRMAR." } });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, isDeveloperTenant: true },
    });
    if (!tenant) return res.status(404).json({ error: { code: 404, message: "Licenca/tenant nao encontrado" } });
    if (tenant.isDeveloperTenant) {
      return res.status(403).json({ error: { code: 403, message: "A licenca Master nao pode ser apagada" } });
    }

    await prisma.$transaction(async (tx) => {
      await deleteTenantData(tx, tenant.id);
    });

    return sendOk(res, req, { deleted: true, tenant });
  }));

  router.post("/license/admin/cleanup-non-master", asyncHandler(async (req, res) => {
    await assertDeveloperAdmin(req);
    const confirm = String(req.body?.confirm || "").trim().toUpperCase();
    if (confirm !== "CONFIRMAR") {
      return res.status(400).json({ error: { code: 400, message: "Confirmacao invalida. Informe CONFIRMAR." } });
    }

    const nonMaster = await prisma.tenant.findMany({
      where: { isDeveloperTenant: false },
      select: { id: true, name: true, slug: true },
    });

    for (const t of nonMaster) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$transaction(async (tx) => {
        await deleteTenantData(tx, t.id);
      });
    }

    return sendOk(res, req, {
      deletedCount: nonMaster.length,
      deletedTenants: nonMaster,
    });
  }));

  router.post("/license/admin/import/validate", asyncHandler(async (req, res) => {
    await assertDeveloperAdmin(req);
    const tenantId = String(req.body?.tenantId || "").trim();
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "licenciadoId obrigatorio" } });
    if (files.length === 0) return res.status(400).json({ error: { code: 400, message: "Informe ao menos um arquivo para validacao" } });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, isDeveloperTenant: true },
    });
    if (!tenant) return res.status(404).json({ error: { code: 404, message: "Licenciado nao encontrado" } });
    if (tenant.isDeveloperTenant) {
      return res.status(403).json({ error: { code: 403, message: "Nao e permitido importar dados para a licenca Desenvolvedor nesta tela" } });
    }

    const tables = files.map((f) => String(f?.table || "").trim()).filter(Boolean);
    const duplicated = tables.find((t, idx) => tables.indexOf(t) !== idx);
    if (duplicated) {
      return res.status(400).json({ error: { code: 400, message: `Tabela duplicada no envio: ${duplicated}` } });
    }

    const validation = files.map((f) => validateImportFile({
      table: String(f?.table || "").trim(),
      fileName: String(f?.fileName || "").trim(),
      content: String(f?.content || ""),
    }));
    const compatible = validation.every((item) => item.compatible);
    return sendOk(res, req, { tenantId, tenantName: tenant.name, compatible, validation });
  }));

  router.post("/license/admin/import/execute", asyncHandler(async (req, res) => {
    const sourceTenantId = await assertDeveloperAdmin(req);
    const tenantId = String(req.body?.tenantId || "").trim();
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "licenciadoId obrigatorio" } });
    if (files.length === 0) return res.status(400).json({ error: { code: 400, message: "Informe ao menos um arquivo para importacao" } });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, isDeveloperTenant: true },
    });
    if (!tenant) return res.status(404).json({ error: { code: 404, message: "Licenciado nao encontrado" } });
    if (tenant.isDeveloperTenant) {
      return res.status(403).json({ error: { code: 403, message: "Nao e permitido importar dados para a licenca Desenvolvedor nesta tela" } });
    }

    const tables = files.map((f) => String(f?.table || "").trim()).filter(Boolean);
    const duplicated = tables.find((t, idx) => tables.indexOf(t) !== idx);
    if (duplicated) {
      return res.status(400).json({ error: { code: 400, message: `Tabela duplicada no envio: ${duplicated}` } });
    }

    const validation = files.map((f) => validateImportFile({
      table: String(f?.table || "").trim(),
      fileName: String(f?.fileName || "").trim(),
      content: String(f?.content || ""),
    }));
    const incompatible = validation.filter((item) => !item.compatible);
    if (incompatible.length > 0) {
      return res.status(400).json({
        error: { code: 400, message: "Existe arquivo incompativel. Corrija antes de importar." },
        data: { compatible: false, validation },
      });
    }

    const summary = [];
    const sourceLicense = await resolveLicenseByTenantId(sourceTenantId);
    await prisma.$transaction(async (tx) => {
      for (const item of validation) {
        // eslint-disable-next-line no-await-in-loop
        const result = await applyImportRows({
          tx,
          tenantId: tenant.id,
          table: item.table,
          rows: item.parsedRows || [],
        });
        summary.push({
          table: item.table,
          label: item.label || item.table,
          fileName: item.fileName || "-",
          totalRows: Number(item.totalRows || 0),
          imported: Number(result?.imported || 0),
        });
      }
      await tx.tenantLicenseAudit.create({
        data: {
          tenantId: sourceTenantId,
          previousPlan: sourceLicense?.planCode || null,
          newPlan: sourceLicense?.planCode || "ENTERPRISE",
          previousStatus: sourceLicense?.status || null,
          newStatus: sourceLicense?.status || "ACTIVE",
          changedById: req.user?.id || null,
          changedByName: req.user?.name || req.user?.email || "Admin",
          reason: "Importacao de dados para licenciado",
          payload: {
            targetTenantId: tenant.id,
            targetTenantName: tenant.name,
            importedTables: summary,
          },
        },
      });
    });

    return sendOk(res, req, {
      tenantId: tenant.id,
      tenantName: tenant.name,
      imported: summary,
    });
  }));

  router.get("/dashboard", asyncHandler(async (req, res) => {
    await assertFeature(req, "dashboard", "Dashboard indisponivel no plano atual");
    const license = await getLicense(req);
    const simplifiedDashboard = license.dashboardMode === "SIMPLIFIED";
    const userStoreIds = await getUserStoreIds(req);
    if (userStoreIds.length === 0) {
      return sendOk(res, req, {
        dashboardMode: license.dashboardMode,
        filters: { stores: [], selectedStoreIds: [], startDate: null, endDate: null },
        salesToday: 0,
        grossRevenue: 0,
        avgTicket: 0,
        itemsSold: 0,
        cashSession: null,
        stockEvolution: { quantityDelta: 0, transferDelta: 0, currentValue: 0 },
        profitabilityByProduct: [],
        charts: { salesByDay: [], stockByStore: [], transferStatus: [] },
      });
    }

    const stores = await prisma.store.findMany({
      where: { id: { in: userStoreIds }, active: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    });

    const endDateRaw = safeDate(req.query.endDate) || new Date();
    endDateRaw.setHours(23, 59, 59, 999);
    const startDateRaw = safeDate(req.query.startDate) || (() => {
      const d = new Date(endDateRaw);
      d.setDate(d.getDate() - 29);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    const requestedStoreIds = String(req.query.storeIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const selectedStoreIds = requestedStoreIds.length > 0
      ? requestedStoreIds.filter((id) => userStoreIds.includes(id))
      : userStoreIds;

    if (selectedStoreIds.length === 0) {
      return sendOk(res, req, {
        dashboardMode: license.dashboardMode,
        filters: {
          stores,
          selectedStoreIds: [],
          startDate: startDateRaw,
          endDate: endDateRaw,
        },
        salesToday: 0,
        grossRevenue: 0,
        avgTicket: 0,
        itemsSold: 0,
        cashSession: null,
        stockEvolution: { quantityDelta: 0, transferDelta: 0, currentValue: 0 },
        profitabilityByProduct: [],
        charts: { salesByDay: [], stockByStore: [], transferStatus: [] },
      });
    }

    const paidSales = await prisma.sale.findMany({
      where: {
        storeId: { in: selectedStoreIds },
        status: "PAID",
        createdAt: { gte: startDateRaw, lte: endDateRaw },
      },
      include: { items: { include: { product: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "asc" },
    });

    const salesTodayBase = new Date();
    salesTodayBase.setHours(0, 0, 0, 0);
    const salesToday = paidSales.filter((s) => new Date(s.createdAt) >= salesTodayBase).length;
    const grossRevenue = paidSales.reduce((s, sale) => s + Number(sale.total || 0), 0);
    const avgTicket = paidSales.length > 0 ? grossRevenue / paidSales.length : 0;
    const itemsSold = paidSales.reduce((s, sale) => s + sale.items.reduce((a, i) => a + Number(i.quantity || 0), 0), 0);

    const storeForCash = selectedStoreIds.length === 1 ? selectedStoreIds[0] : null;
    const openSession = storeForCash
      ? await prisma.cashSession.findFirst({
          where: { storeId: storeForCash, closedAt: null },
          include: { openedBy: { select: { name: true } } },
        })
      : null;
    const cashSession = openSession ? {
      id: openSession.id,
      openedBy: openSession.openedBy?.name || "â€”",
      openedAt: openSession.openedAt,
      initialCash: Number(openSession.initialCash),
    } : null;

    const movements = await prisma.inventoryMovement.findMany({
      where: {
        storeId: { in: selectedStoreIds },
        createdAt: { gte: startDateRaw, lte: endDateRaw },
      },
      select: { type: true, quantity: true },
    });

    const movementInTypes = new Set(["IN", "ADJUST_POS", "TRANSFER_IN"]);
    const movementOutTypes = new Set(["OUT", "ADJUST_NEG", "TRANSFER_OUT"]);
    let movementInQty = 0;
    let movementOutQty = 0;
    let transferInQty = 0;
    let transferOutQty = 0;
    for (const m of movements) {
      const qty = Number(m.quantity || 0);
      if (movementInTypes.has(m.type)) movementInQty += qty;
      if (movementOutTypes.has(m.type)) movementOutQty += qty;
      if (m.type === "TRANSFER_IN") transferInQty += qty;
      if (m.type === "TRANSFER_OUT") transferOutQty += qty;
    }

    const lots = await prisma.inventoryLot.findMany({
      where: { active: true, quantity: { gt: 0 }, storeId: { in: selectedStoreIds } },
      select: { storeId: true, quantity: true, costUnit: true },
    });
    const currentValue = lots.reduce((s, lot) => s + Number(lot.quantity || 0) * Number(lot.costUnit || 0), 0);

    const storeMap = stores.reduce((acc, st) => { acc[st.id] = st; return acc; }, {});
    const stockByStoreAgg = {};
    for (const lot of lots) {
      const sid = lot.storeId;
      if (!stockByStoreAgg[sid]) {
        stockByStoreAgg[sid] = { storeId: sid, name: storeMap[sid]?.name || sid, quantity: 0, value: 0 };
      }
      const q = Number(lot.quantity || 0);
      const v = q * Number(lot.costUnit || 0);
      stockByStoreAgg[sid].quantity += q;
      stockByStoreAgg[sid].value += v;
    }
    const stockByStore = Object.values(stockByStoreAgg).sort((a, b) => b.value - a.value);

    const transferRows = await prisma.stockTransfer.findMany({
      where: {
        OR: [
          { originStoreId: { in: selectedStoreIds } },
          { destinationStoreId: { in: selectedStoreIds } },
        ],
        createdAt: { gte: startDateRaw, lte: endDateRaw },
      },
      select: { status: true },
    });
    const transferStatusAgg = transferRows.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});
    const transferStatus = Object.entries(transferStatusAgg).map(([status, count]) => ({ status, count }));

    const byDay = {};
    for (const sale of paidSales) {
      const d = new Date(sale.createdAt);
      const key = d.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { date: key, revenue: 0, sales: 0 };
      byDay[key].revenue += Number(sale.total || 0);
      byDay[key].sales += 1;
    }
    const salesByDay = Object.values(byDay).sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const profitabilityAgg = {};
    for (const sale of paidSales) {
      for (const item of sale.items) {
        const pid = item.productId;
        if (!profitabilityAgg[pid]) {
          profitabilityAgg[pid] = {
            productId: pid,
            name: item.product?.name || "Produto",
            qty: 0,
            revenue: 0,
            cogs: 0,
          };
        }
        profitabilityAgg[pid].qty += Number(item.quantity || 0);
        profitabilityAgg[pid].revenue += Number(item.subtotal || 0);
        profitabilityAgg[pid].cogs += Number(item.cogsTotal || 0);
      }
    }
    const profitabilityByProduct = Object.values(profitabilityAgg)
      .map((p) => {
        const profit = p.revenue - p.cogs;
        const margin = p.revenue > 0 ? (profit / p.revenue) * 100 : 0;
        return { ...p, profit, margin };
      })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 15);

    return sendOk(res, req, {
      dashboardMode: license.dashboardMode,
      filters: {
        stores,
        selectedStoreIds,
        startDate: startDateRaw,
        endDate: endDateRaw,
      },
      salesToday,
      grossRevenue: Number(grossRevenue.toFixed(2)),
      avgTicket: Number(avgTicket.toFixed(2)),
      itemsSold,
      cashSession,
      stockEvolution: {
        quantityDelta: simplifiedDashboard ? 0 : (movementInQty - movementOutQty),
        transferDelta: simplifiedDashboard ? 0 : (transferInQty - transferOutQty),
        currentValue: simplifiedDashboard ? 0 : Number(currentValue.toFixed(2)),
      },
      profitabilityByProduct: simplifiedDashboard ? [] : profitabilityByProduct.map((p) => ({
        ...p,
        revenue: Number(p.revenue.toFixed(2)),
        cogs: Number(p.cogs.toFixed(2)),
        profit: Number(p.profit.toFixed(2)),
        margin: Number(p.margin.toFixed(2)),
      })),
      charts: {
        salesByDay: salesByDay.map((d) => ({ ...d, revenue: Number(d.revenue.toFixed(2)) })),
        stockByStore: simplifiedDashboard ? [] : stockByStore.map((s) => ({ ...s, value: Number(s.value.toFixed(2)) })),
        transferStatus: simplifiedDashboard ? [] : transferStatus,
      },
    });
  }));

  // â”€â”€â”€ STORES â”€â”€â”€
  router.get("/stores", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { all } = req.query; // ?all=true to include inactive
    const where = all === "true" ? { tenantId } : { tenantId, active: true };
    if (!isAdmin(req)) {
      where.accessUsers = { some: { userId: req.user?.id } };
    }
    const stores = await prisma.store.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { accessUsers: true, sales: true } } },
    });
    return sendOk(res, req, stores);
  }));

  router.post("/stores", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { name, type, cnpj, phone, email, street, number, complement, district, city, state, zipCode } = req.body;
    if (!name || !type) return res.status(400).json({ error: { code: 400, message: "name e type obrigatÃ³rios" } });
    await assertStoreActivationAllowed(req, true);

    const store = await prisma.store.create({
      data: { tenantId, name, type, cnpj, phone, email, street, number, complement, district, city, state, zipCode, active: true },
    });
    return sendOk(res, req, store, 201);
  }));

  router.put("/stores/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { name, type, cnpj, phone, email, street, number, complement, district, city, state, zipCode, active, isDefault } = req.body;
    const currentStore = await prisma.store.findFirst({ where: { id: req.params.id, tenantId }, select: { active: true } });
    if (!currentStore) return res.status(404).json({ error: { code: 404, message: "Loja nao encontrada" } });
    const data = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (cnpj !== undefined) data.cnpj = cnpj || null;
    if (phone !== undefined) data.phone = phone || null;
    if (email !== undefined) data.email = email || null;
    if (street !== undefined) data.street = street || null;
    if (number !== undefined) data.number = number || null;
    if (complement !== undefined) data.complement = complement || null;
    if (district !== undefined) data.district = district || null;
    if (city !== undefined) data.city = city || null;
    if (state !== undefined) data.state = state || null;
    if (zipCode !== undefined) data.zipCode = zipCode || null;
    if (active !== undefined) {
      if (!currentStore.active && Boolean(active)) await assertStoreActivationAllowed(req, true);
      data.active = active;
    }

    // If setting as default, unset other stores first
    if (isDefault === true) {
      await prisma.store.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      data.isDefault = true;
    } else if (isDefault === false) {
      data.isDefault = false;
    }

    const store = await prisma.store.update({ where: { id: req.params.id }, data });
    return sendOk(res, req, store);
  }));

  // â”€â”€â”€ CATEGORIES â”€â”€â”€
  router.get("/categories", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const categories = await prisma.category.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
    return sendOk(res, req, categories);
  }));

  // â”€â”€â”€ PRODUCTS â”€â”€â”€
  router.get("/products", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { search, categoryId, page = 1, limit = 50 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;
    const where = { tenantId, active: true };
    if (search) where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { ean: { contains: search } },
    ];
    if (categoryId) where.categoryId = categoryId;

    const now = new Date();
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where, skip, take,
        include: {
          category: true,
          prices: { where: { active: true }, take: 1, orderBy: { createdAt: "desc" } },
          discounts: { where: { active: true, startDate: { lte: now } }, orderBy: { createdAt: "desc" } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(total / take) || 1;

    // Filter out expired discounts in code (Prisma nested include doesn't support OR well)
    const cleaned = products.map((p) => ({
      ...p,
      discounts: (p.discounts || []).filter((d) => !d.endDate || new Date(d.endDate) >= now).slice(0, 1),
    }));

    return sendOk(res, req, { products: cleaned, totalPages, page: Number(page), total });
  }));

  // Price + stock lookup (consultation only, no sale creation)
  router.get("/inventory/lookup", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { search = "", limit = 20 } = req.query;
    const q = String(search || "").trim();
    if (q.length < 2) return sendOk(res, req, { products: [] });

    const products = await prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { ean: { contains: q } },
        ],
      },
      include: {
        prices: { where: { active: true }, take: 1, orderBy: { createdAt: "desc" } },
      },
      take: Number(limit) || 20,
      orderBy: { name: "asc" },
    });

    const storeIds = (await prisma.store.findMany({ where: { tenantId, active: true }, select: { id: true, name: true, type: true } }));
    const productIds = products.map((p) => p.id);
    const lots = productIds.length > 0
      ? await prisma.inventoryLot.findMany({
          where: { active: true, quantity: { gt: 0 }, productId: { in: productIds } },
          select: { productId: true, storeId: true, quantity: true },
        })
      : [];

    const groupedByStoreProduct = {};
    for (const lot of lots) {
      const key = `${lot.storeId}:${lot.productId}`;
      groupedByStoreProduct[key] = (groupedByStoreProduct[key] || 0) + Number(lot.quantity || 0);
    }

    const reservations = productIds.length > 0
      ? await prisma.stockReservationItem.findMany({
          where: {
            productId: { in: productIds },
            reservation: { status: "APPROVED" },
          },
          include: { reservation: { select: { sourceStoreId: true } } },
        })
      : [];

    const reservedByStoreProduct = {};
    for (const row of reservations) {
      const sourceStoreId = row.reservation?.sourceStoreId;
      if (!sourceStoreId) continue;
      const key = `${sourceStoreId}:${row.productId}`;
      reservedByStoreProduct[key] = (reservedByStoreProduct[key] || 0) + Number(row.reservedQty || 0);
    }

    const result = products.map((p) => {
      const stores = storeIds.map((s) => {
        const key = `${s.id}:${p.id}`;
        const qty = groupedByStoreProduct[key] || 0;
        const reserved = reservedByStoreProduct[key] || 0;
        return {
          id: s.id,
          name: s.name,
          type: s.type,
          quantity: qty,
          reserved,
          available: Math.max(0, qty - reserved),
        };
      });
      return {
        id: p.id,
        name: p.name,
        ean: p.ean,
        price: p.prices?.[0]?.price != null ? Number(p.prices[0].price) : null,
        stores,
      };
    });

    return sendOk(res, req, { products: result });
  }));

  router.post("/products", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { name, ean, brand, categoryId, controlled, price } = req.body;
    if (!name) return res.status(400).json({ error: { code: 400, message: "Nome obrigatÃ³rio" } });

    const product = await prisma.product.create({
      data: { tenantId, name, ean: ean || null, brand: brand || null, categoryId: categoryId || null, controlled: !!controlled, active: true },
    });

    if (price && Number(price) > 0) {
      await prisma.productPrice.create({ data: { productId: product.id, price: Number(price), active: true } });
    }

    return sendOk(res, req, product, 201);
  }));

  router.put("/products/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { name, ean, brand, categoryId, controlled, price } = req.body;
    const currentProduct = await prisma.product.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
    if (!currentProduct) return res.status(404).json({ error: { code: 404, message: "Produto nao encontrado" } });
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { name, ean: ean || null, brand: brand || null, categoryId: categoryId || null, controlled: !!controlled },
    });

    if (price !== undefined && Number(price) > 0) {
      await prisma.productPrice.updateMany({ where: { productId: product.id, active: true }, data: { active: false } });
      await prisma.productPrice.create({ data: { productId: product.id, price: Number(price), active: true } });
    }

    return sendOk(res, req, product);
  }));

  // â”€â”€â”€ DISCOUNTS â”€â”€â”€
  router.get("/discounts", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { productId, active } = req.query;
    const where = { product: { tenantId } };
    if (productId) where.productId = productId;
    if (active === "true") {
      where.active = true;
      where.OR = [{ endDate: null }, { endDate: { gte: new Date() } }];
    }
    const discounts = await prisma.discount.findMany({
      where,
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return sendOk(res, req, discounts);
  }));

  router.post("/discounts", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { productId, type, value, startDate, endDate } = req.body;
    if (!productId || !type || value === undefined) {
      return res.status(400).json({ error: { code: 400, message: "productId, type e value obrigatÃ³rios" } });
    }
    if (!["PERCENT", "FIXED"].includes(type)) {
      return res.status(400).json({ error: { code: 400, message: "type deve ser PERCENT ou FIXED" } });
    }
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } });
    if (!product) return res.status(404).json({ error: { code: 404, message: "Produto nao encontrado no tenant" } });

    // Deactivate existing active discounts for this product
    await prisma.discount.updateMany({
      where: { productId, active: true },
      data: { active: false },
    });

    const discount = await prisma.discount.create({
      data: {
        tenantId,
        productId,
        type,
        value: Number(value),
        startDate: startDate ? safeDate(startDate) : new Date(),
        endDate: endDate ? safeDate(endDate) : null,
        active: true,
      },
      include: { product: { select: { id: true, name: true } } },
    });
    return sendOk(res, req, discount, 201);
  }));

  router.put("/discounts/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { type, value, startDate, endDate, active } = req.body;
    const data = {};
    if (type !== undefined) data.type = type;
    if (value !== undefined) data.value = Number(value);
    if (startDate !== undefined) data.startDate = safeDate(startDate);
    if (endDate !== undefined) data.endDate = endDate ? safeDate(endDate) : null;
    if (active !== undefined) data.active = active;

    const existing = await prisma.discount.findFirst({
      where: { id: req.params.id, product: { tenantId } },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: { code: 404, message: "Desconto nao encontrado" } });

    const discount = await prisma.discount.update({
      where: { id: req.params.id },
      data,
      include: { product: { select: { id: true, name: true } } },
    });
    return sendOk(res, req, discount);
  }));

  router.delete("/discounts/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const existing = await prisma.discount.findFirst({
      where: { id: req.params.id, product: { tenantId } },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: { code: 404, message: "Desconto nao encontrado" } });
    await prisma.discount.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    return sendOk(res, req, { success: true });
  }));

  // â”€â”€â”€ USERS â”€â”€â”€
  router.get("/users", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true, name: true, email: true, active: true, createdAt: true, lastSeenAt: true,
        role: { select: { id: true, name: true } },
        stores: { include: { store: { select: { id: true, name: true, type: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Add sequential matricula number
    return sendOk(res, req, users.map((u, idx) => ({
      ...u,
      matricula: String(idx + 1).padStart(4, "0"),
      storeCount: u.stores.length,
    })));
  }));

  router.post("/users", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const bcrypt = require("bcryptjs");
    const { name, email, password, roleName, storeIds } = req.body;
    if (!name || !email || !password || !roleName) {
      return res.status(400).json({ error: { code: 400, message: "Campos obrigatÃ³rios: name, email, password, roleName" } });
    }
    await assertUserCreationAllowed(req, roleName);
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) return res.status(400).json({ error: { code: 400, message: `Role ${roleName} nÃ£o encontrada` } });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { tenantId, name, email, passwordHash, active: true, roleId: role.id },
    });

    // ADMIN has global access and does not require store link.
    let assignedStoreIds = Array.isArray(storeIds) ? storeIds.filter(Boolean) : [];
    if (roleName !== "ADMIN" && assignedStoreIds.length === 0) {
      const defaultStore = await prisma.store.findFirst({ where: { tenantId, active: true, type: "LOJA" }, orderBy: { createdAt: "asc" } });
      if (defaultStore) assignedStoreIds = [defaultStore.id];
    }

    for (const sid of assignedStoreIds) {
      await prisma.storeUser.create({ data: { storeId: sid, userId: user.id, isDefault: assignedStoreIds[0] === sid } });
    }

    return sendOk(res, req, { id: user.id, name: user.name, email: user.email, role: { name: roleName }, storeCount: assignedStoreIds.length }, 201);
  }));

  router.put("/users/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const bcrypt = require("bcryptjs");
    const { name, email, password, roleName, active, storeIds } = req.body;
    const currentUser = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId },
      include: { role: { select: { name: true } } },
    });
    if (!currentUser) {
      return res.status(404).json({ error: { code: 404, message: "Usuario nao encontrado" } });
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (active !== undefined) data.active = active;
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    let targetRoleName = currentUser.role?.name || "USER";
    if (roleName) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (role) data.roleId = role.id;
      targetRoleName = roleName;
    }

    const nextActive = active !== undefined ? Boolean(active) : Boolean(currentUser.active);
    const roleChanged = !!roleName && String(roleName).toUpperCase() !== String(currentUser.role?.name || "").toUpperCase();
    if (nextActive && (!currentUser.active || roleChanged)) {
      await assertUserCreationAllowed(req, targetRoleName, { excludeUserId: currentUser.id });
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data });

    // Update store access when requested, or clear links when user becomes ADMIN.
    if (storeIds !== undefined || targetRoleName === "ADMIN") {
      const requestedStoreIds = Array.isArray(storeIds) ? storeIds.filter(Boolean) : [];
      await prisma.storeUser.deleteMany({ where: { userId: user.id } });
      if (targetRoleName !== "ADMIN") {
        let finalStoreIds = requestedStoreIds;
        if (finalStoreIds.length === 0) {
          const defaultStore = await prisma.store.findFirst({ where: { tenantId, active: true, type: "LOJA" }, orderBy: { createdAt: "asc" } });
          if (defaultStore) finalStoreIds = [defaultStore.id];
        }
        for (const sid of finalStoreIds) {
          await prisma.storeUser.create({ data: { storeId: sid, userId: user.id, isDefault: finalStoreIds[0] === sid } });
        }
      }
    }

    return sendOk(res, req, { id: user.id, name: user.name, email: user.email });
  }));

  // â”€â”€â”€ USER PROFILE (self-service email/password change) â”€â”€â”€
  router.put("/users/:id/profile", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const bcrypt = require("bcryptjs");
    const { name, email, currentPassword, newPassword } = req.body;
    const userId = req.params.id;

    // Users can only update their own profile
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: { code: 403, message: "Sem permissÃ£o" } });
    }

    const data = {};

    if (name !== undefined) {
      const nextName = String(name || "").trim();
      if (!nextName) return res.status(400).json({ error: { code: 400, message: "Nome obrigatorio" } });
      data.name = nextName;
    }

    if (email) {
      const existing = await prisma.user.findFirst({ where: { tenantId, email, NOT: { id: userId } } });
      if (existing) return res.status(400).json({ error: { code: 400, message: "Email jÃ¡ em uso" } });
      data.email = email;
    }

    const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) return res.status(404).json({ error: { code: 404, message: "UsuÃ¡rio nÃ£o encontrado" } });

    if (newPassword !== undefined || currentPassword !== undefined) {
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: { code: 400, message: "Senha atual e nova senha sÃ£o obrigatÃ³rias" } });
      }
      if (String(newPassword).length < 4) {
        return res.status(400).json({ error: { code: 400, message: "Nova senha deve ter no mÃ­nimo 4 caracteres" } });
      }
      if (String(currentPassword) === String(newPassword)) {
        return res.status(400).json({ error: { code: 400, message: "Nova senha deve ser diferente da senha atual" } });
      }

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ error: { code: 400, message: "Senha atual incorreta" } });
      data.passwordHash = await bcrypt.hash(newPassword, 10);
      data.mustChangePassword = false;
      data.passwordChangedAt = new Date();
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: { code: 400, message: "Nenhum dado para atualizar" } });
    }

    const updated = await prisma.user.update({ where: { id: userId }, data });
    return sendOk(res, req, {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      mustChangePassword: Boolean(updated.mustChangePassword),
    });
  }));

  // â”€â”€â”€ INVENTORY â”€â”€â”€


  // --- CHAT ---
  router.get("/chat/users", asyncHandler(async (req, res) => {
    await assertFeature(req, "chat", "Chat indisponivel no plano atual");
    const tenantId = await resolveTenantId(req);
    await touchChatPresence(req.user?.id);
    const search = String(req.query.search || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);

    const where = {
      tenantId,
      active: true,
      id: { not: req.user?.id || "" },
    };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      take: limit,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        lastSeenAt: true,
        role: { select: { name: true } },
      },
    });

    return sendOk(res, req, { users: users.map(serializeChatUser) });
  }));

  router.get("/chat/conversations", asyncHandler(async (req, res) => {
    await assertFeature(req, "chat", "Chat indisponivel no plano atual");
    const tenantId = await resolveTenantId(req);
    await touchChatPresence(req.user?.id);
    const currentUserId = req.user?.id;
    if (!currentUserId) return sendOk(res, req, { conversations: [] });

    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const scanLimit = Math.max(limit * 10, 200);

    const [messages, unreadAgg] = await Promise.all([
      prisma.chatMessage.findMany({
        where: {
          tenantId,
          OR: [
            { senderId: currentUserId },
            { recipientId: currentUserId },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: scanLimit,
        include: {
          sender: { select: { id: true, name: true, email: true, lastSeenAt: true, role: { select: { name: true } } } },
          recipient: { select: { id: true, name: true, email: true, lastSeenAt: true, role: { select: { name: true } } } },
        },
      }),
      prisma.chatMessage.groupBy({
        by: ["senderId"],
        where: { tenantId, recipientId: currentUserId, readAt: null },
        _count: { senderId: true },
      }),
    ]);

    const unreadMap = unreadAgg.reduce((acc, row) => {
      acc[row.senderId] = Number(row._count?.senderId || 0);
      return acc;
    }, {});

    const convMap = new Map();
    for (const msg of messages) {
      const otherId = msg.senderId === currentUserId ? msg.recipientId : msg.senderId;
      if (!otherId || convMap.has(otherId)) continue;
      const other = msg.senderId === currentUserId ? msg.recipient : msg.sender;
      convMap.set(otherId, {
        user: serializeChatUser(other),
        lastMessage: {
          id: msg.id,
          content: msg.content,
          replyToId: msg.replyToId || null,
          createdAt: msg.createdAt,
          senderId: msg.senderId,
          recipientId: msg.recipientId,
          metaType: msg.metaType,
          metaJson: msg.metaJson,
          readAt: msg.readAt,
        },
        unreadCount: unreadMap[otherId] || 0,
      });
      if (convMap.size >= limit) break;
    }

    const conversations = Array.from(convMap.values()).sort(
      (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime(),
    );

    return sendOk(res, req, { conversations });
  }));

  router.get("/chat/messages/:userId", asyncHandler(async (req, res) => {
    await assertFeature(req, "chat", "Chat indisponivel no plano atual");
    const tenantId = await resolveTenantId(req);
    await touchChatPresence(req.user?.id);
    const currentUserId = req.user?.id;
    const otherUserId = req.params.userId;
    if (!currentUserId) return sendOk(res, req, { messages: [] });
    if (!otherUserId) return res.status(400).json({ error: { code: 400, message: "userId obrigatorio" } });

    const otherUser = await prisma.user.findFirst({
      where: { id: otherUserId, tenantId, active: true },
      select: { id: true, name: true, email: true, lastSeenAt: true, role: { select: { name: true } } },
    });
    if (!otherUser) return res.status(404).json({ error: { code: 404, message: "Usuario nao encontrado" } });

    const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 300);
    const before = req.query.before ? new Date(String(req.query.before)) : null;

    const where = {
      tenantId,
      OR: [
        { senderId: currentUserId, recipientId: otherUserId },
        { senderId: otherUserId, recipientId: currentUserId },
      ],
    };
    if (before && !Number.isNaN(before.getTime())) {
      where.createdAt = { lt: before };
    }

    const messagesDesc = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        senderId: true,
        recipientId: true,
        content: true,
        replyToId: true,
        replyTo: {
          select: {
            id: true,
            senderId: true,
            content: true,
          },
        },
        metaType: true,
        metaJson: true,
        createdAt: true,
        readAt: true,
      },
    });

    await prisma.chatMessage.updateMany({
      where: {
        tenantId,
        senderId: otherUserId,
        recipientId: currentUserId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return sendOk(res, req, {
      user: serializeChatUser(otherUser),
      messages: messagesDesc.reverse(),
    });
  }));

  router.post("/chat/messages", asyncHandler(async (req, res) => {
    await assertFeature(req, "chat", "Chat indisponivel no plano atual");
    const tenantId = await resolveTenantId(req);
    await touchChatPresence(req.user?.id);
    const senderId = req.user?.id;
    const recipientId = String(req.body?.recipientId || "").trim();
    const content = String(req.body?.content || "").trim();
    const replyToMessageId = req.body?.replyToMessageId ? String(req.body.replyToMessageId).trim() : null;
    const metaType = req.body?.metaType ? String(req.body.metaType) : null;
    const metaJson = req.body?.metaJson ?? null;

    if (!senderId) return res.status(401).json({ error: { code: 401, message: "Nao autenticado" } });
    if (!recipientId) return res.status(400).json({ error: { code: 400, message: "recipientId obrigatorio" } });
    if (recipientId === senderId) return res.status(400).json({ error: { code: 400, message: "Nao e permitido enviar para si mesmo" } });
    if (!content) return res.status(400).json({ error: { code: 400, message: "Mensagem obrigatoria" } });

    const recipient = await prisma.user.findFirst({
      where: { id: recipientId, tenantId, active: true },
      select: { id: true },
    });
    if (!recipient) return res.status(404).json({ error: { code: 404, message: "Destinatario nao encontrado" } });

    let replyToId = null;
    if (replyToMessageId) {
      const replied = await prisma.chatMessage.findFirst({
        where: { id: replyToMessageId, tenantId },
        select: { id: true, senderId: true, recipientId: true },
      });
      if (!replied) return res.status(400).json({ error: { code: 400, message: "Mensagem respondida nao encontrada" } });
      const belongsToConversation =
        (replied.senderId === senderId && replied.recipientId === recipientId)
        || (replied.senderId === recipientId && replied.recipientId === senderId);
      if (!belongsToConversation) {
        return res.status(400).json({ error: { code: 400, message: "Mensagem respondida invalida para esta conversa" } });
      }
      replyToId = replied.id;
    }

    const message = await prisma.chatMessage.create({
      data: {
        tenantId,
        senderId,
        recipientId,
        content,
        replyToId,
        metaType,
        metaJson,
      },
      select: {
        id: true,
        senderId: true,
        recipientId: true,
        content: true,
        replyToId: true,
        replyTo: {
          select: {
            id: true,
            senderId: true,
            content: true,
          },
        },
        metaType: true,
        metaJson: true,
        createdAt: true,
        readAt: true,
      },
    });

    return sendOk(res, req, message, 201);
  }));

  router.post("/chat/messages/:userId/read", asyncHandler(async (req, res) => {
    await assertFeature(req, "chat", "Chat indisponivel no plano atual");
    const tenantId = await resolveTenantId(req);
    await touchChatPresence(req.user?.id);
    const currentUserId = req.user?.id;
    const otherUserId = req.params.userId;
    if (!currentUserId || !otherUserId) return sendOk(res, req, { updated: 0 });

    const result = await prisma.chatMessage.updateMany({
      where: {
        tenantId,
        senderId: otherUserId,
        recipientId: currentUserId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return sendOk(res, req, { updated: result.count || 0 });
  }));

  router.post("/chat/presence", asyncHandler(async (req, res) => {
    await assertFeature(req, "chat", "Chat indisponivel no plano atual");
    await touchChatPresence(req.user?.id);
    return sendOk(res, req, { ok: true, at: new Date() });
  }));
  // Multi-store overview: all products with per-store qty + recent entries/exits
  router.get("/inventory/overview", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { search } = req.query;

    const stores = await prisma.store.findMany({ where: { active: true, tenantId }, orderBy: [{ type: "asc" }, { name: "asc" }] });

    // Get all active lots
    const lotWhere = { active: true, quantity: { gt: 0 }, store: { tenantId } };
    if (search) {
      lotWhere.product = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { ean: { contains: search } },
        ],
      };
    }

    const lots = await prisma.inventoryLot.findMany({
      where: lotWhere,
      include: { product: { include: { category: true } } },
    });

    // Get recent movements (last 90 days) for context
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const productIds = [...new Set(lots.map((l) => l.productId))];
    const movements = productIds.length > 0
      ? await prisma.inventoryMovement.findMany({
          where: { productId: { in: productIds }, createdAt: { gte: since } },
          select: { productId: true, storeId: true, type: true, quantity: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // Group lots by product
    const grouped = {};
    for (const lot of lots) {
      const pid = lot.productId;
      if (!grouped[pid]) {
        grouped[pid] = {
          id: pid,
          name: lot.product.name,
          ean: lot.product.ean,
          category: lot.product.category?.name || null,
          controlled: lot.product.controlled,
          stores: {},
          totalQty: 0,
        };
      }
      if (!grouped[pid].stores[lot.storeId]) {
        grouped[pid].stores[lot.storeId] = { available: 0, nearestExpiry: null };
      }
      grouped[pid].stores[lot.storeId].available += lot.quantity;
      grouped[pid].totalQty += lot.quantity;

      const exp = lot.expiration ? new Date(lot.expiration) : null;
      const cur = grouped[pid].stores[lot.storeId].nearestExpiry;
      if (exp && (!cur || exp < new Date(cur))) {
        grouped[pid].stores[lot.storeId].nearestExpiry = exp.toISOString().slice(0, 10);
      }
    }

    // Attach movement summaries per product per store
    for (const mov of movements) {
      const pid = mov.productId;
      if (!grouped[pid]) continue;
      if (!grouped[pid].stores[mov.storeId]) {
        grouped[pid].stores[mov.storeId] = { available: 0, nearestExpiry: null };
      }
      const st = grouped[pid].stores[mov.storeId];
      if (!st.entries) st.entries = [];
      if (!st.exits) st.exits = [];

      if (mov.type === "IN" || mov.type === "ADJUST_POS") {
        if (st.entries.length < 3) st.entries.push({ date: mov.createdAt, qty: mov.quantity });
      } else if (mov.type === "OUT" || mov.type === "ADJUST_NEG") {
        if (st.exits.length < 3) st.exits.push({ date: mov.createdAt, qty: mov.quantity });
      }
    }

    const products = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));

    // Subtract approved reservations from availability
    const reservedRows = productIds.length > 0
      ? await prisma.stockReservationItem.findMany({
          where: {
            productId: { in: productIds },
            reservation: { status: "APPROVED" },
          },
          include: { reservation: { select: { sourceStoreId: true } } },
        })
      : [];
    for (const rr of reservedRows) {
      const p = grouped[rr.productId];
      const sid = rr.reservation?.sourceStoreId;
      if (!p || !sid || !p.stores[sid]) continue;
      const reserveQty = Number(rr.reservedQty || 0);
      p.stores[sid].reserved = (p.stores[sid].reserved || 0) + reserveQty;
      p.stores[sid].available = Math.max(0, Number(p.stores[sid].available || 0) - reserveQty);
      p.totalQty = Math.max(0, Number(p.totalQty || 0) - reserveQty);
    }

    return sendOk(res, req, {
      stores: stores.map((s) => ({ id: s.id, name: s.name, type: s.type })),
      products,
    });
  }));

  // Product movement history
  router.get("/inventory/product/:id/movements", asyncHandler(async (req, res) => {
    const { page = 1, limit = 30 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where: { productId: req.params.id },
        include: { store: { select: { name: true } }, lot: { select: { lotNumber: true, quantity: true, costUnit: true } } },
        orderBy: { createdAt: "desc" },
        skip, take,
      }),
      prisma.inventoryMovement.count({ where: { productId: req.params.id } }),
    ]);

    return sendOk(res, req, {
      movements: movements.map((m) => ({
        id: m.id,
        store: m.store.name,
        storeId: m.storeId,
        type: m.type,
        quantity: m.quantity,
        reason: m.reason,
        lotNumber: m.lot?.lotNumber,
        lotId: m.lotId,
        lotQty: m.lot?.quantity ?? null,
        lotCost: m.lot?.costUnit ?? null,
        createdAt: m.createdAt,
      })),
      totalPages: Math.ceil(total / take) || 1,
      page: Number(page),
      total,
    });
  }));

  router.get("/inventory/summary", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    if (!storeId) return sendOk(res, req, []);

    const { search } = req.query;

    const lotWhere = { storeId, active: true, quantity: { gt: 0 } };
    if (search) {
      lotWhere.product = { name: { contains: search, mode: "insensitive" } };
    }

    const lots = await prisma.inventoryLot.findMany({
      where: lotWhere,
      include: { product: { include: { category: true } } },
    });

    const grouped = {};
    for (const lot of lots) {
      const pid = lot.productId;
      if (!grouped[pid]) {
        grouped[pid] = {
          productId: pid,
          name: lot.product.name,
          ean: lot.product.ean,
          category: lot.product.category?.name || null,
          controlled: lot.product.controlled,
          totalQty: 0, totalValue: 0, lotsCount: 0, nearestExpiry: null,
        };
      }
      grouped[pid].totalQty += lot.quantity;
      grouped[pid].totalValue += lot.quantity * Number(lot.costUnit);
      grouped[pid].lotsCount += 1;
      const exp = lot.expiration ? new Date(lot.expiration) : null;
      if (exp && (!grouped[pid].nearestExpiry || exp < grouped[pid].nearestExpiry)) {
        grouped[pid].nearestExpiry = exp;
      }
    }

    const items = Object.values(grouped).map((g) => ({
      ...g, totalValue: Number(g.totalValue.toFixed(2)),
      nearestExpiry: g.nearestExpiry ? g.nearestExpiry.toISOString().slice(0, 10) : null,
    }));

    const reservedRows = Object.keys(grouped).length > 0
      ? await prisma.stockReservationItem.findMany({
          where: {
            productId: { in: Object.keys(grouped) },
            reservation: { sourceStoreId: storeId, status: "APPROVED" },
          },
        })
      : [];
    const reservedByProduct = reservedRows.reduce((acc, rr) => {
      acc[rr.productId] = (acc[rr.productId] || 0) + Number(rr.reservedQty || 0);
      return acc;
    }, {});
    for (const it of items) {
      const r = reservedByProduct[it.productId] || 0;
      it.reservedQty = r;
      it.availableQty = Math.max(0, Number(it.totalQty || 0) - r);
      it.totalQty = it.availableQty;
    }

    return sendOk(res, req, items);
  }));

  router.get("/inventory/lots", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    const { search, productId, expiring, page = 1, limit = 20 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = { active: true, quantity: { gt: 0 }, store: { tenantId } };
    if (storeId) where.storeId = storeId;
    if (productId) where.productId = productId;
    if (search) {
      where.product = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { ean: { contains: search } },
        ],
      };
    }
    if (expiring === "true") {
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      where.expiration = { lte: thirtyDays };
    }

    const [lots, total] = await Promise.all([
      prisma.inventoryLot.findMany({
        where, skip, take,
        include: { product: true, store: true },
        orderBy: { expiration: "asc" },
      }),
      prisma.inventoryLot.count({ where }),
    ]);

    const totalPages = Math.ceil(total / take) || 1;

    return sendOk(res, req, {
      lots: lots.map((l) => ({
        id: l.id,
        product: { id: l.product.id, name: l.product.name },
        store: { id: l.store.id, name: l.store.name },
        lotNumber: l.lotNumber,
        expiration: l.expiration?.toISOString().slice(0, 10),
        costUnit: Number(l.costUnit),
        quantity: l.quantity,
      })),
      totalPages,
      page: Number(page),
      total,
    });
  }));

  router.post("/inventory/receive", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    const { productId, lotNumber, expiration, costUnit, quantity, reason } = req.body;
    if (!productId || !lotNumber || !expiration || !costUnit || !quantity) {
      return res.status(400).json({ error: { code: 400, message: "Campos obrigatÃ³rios: productId, lotNumber, expiration, costUnit, quantity" } });
    }

    const lot = await prisma.inventoryLot.upsert({
      where: { storeId_productId_lotNumber_expiration: { storeId, productId, lotNumber, expiration: safeDate(expiration) } },
      update: { quantity: { increment: Number(quantity) }, costUnit: Number(costUnit) },
      create: { tenantId, storeId, productId, lotNumber, expiration: safeDate(expiration), costUnit: Number(costUnit), quantity: Number(quantity), active: true },
    });

    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        storeId, productId, lotId: lot.id, type: "IN",
        quantity: Number(quantity), reason: reason || "Recebimento",
        createdById: req.user?.id,
      },
    });

    // Auto-update selling price if product has defaultMarkup
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId }, select: { defaultMarkup: true } });
    if (product?.defaultMarkup) {
      const allLots = await prisma.inventoryLot.findMany({ where: { productId, active: true, quantity: { gt: 0 }, store: { tenantId } } });
      const totalVal = allLots.reduce((s, l) => s + Number(l.costUnit) * l.quantity, 0);
      const totalQty = allLots.reduce((s, l) => s + l.quantity, 0);
      if (totalQty > 0) {
        const avgCost = totalVal / totalQty;
        const newPrice = Math.round(avgCost * (1 + Number(product.defaultMarkup) / 100) * 100) / 100;
        await prisma.productPrice.updateMany({ where: { productId, active: true }, data: { active: false } });
        await prisma.productPrice.create({ data: { productId, price: newPrice, active: true } });
      }
    }

    return sendOk(res, req, lot, 201);
  }));

  router.post("/inventory/adjust", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    let { productId, lotId, type, quantity, reason } = req.body;
    if (!type || !quantity || !reason) {
      return res.status(400).json({ error: { code: 400, message: "Campos obrigatÃ³rios: type, quantity, reason" } });
    }

    // Resolve productId from lotId if not provided
    if (lotId && !productId) {
      const lot = await prisma.inventoryLot.findFirst({ where: { id: lotId, storeId, store: { tenantId } } });
      if (!lot) return res.status(400).json({ error: { code: 400, message: "Lote nÃ£o encontrado" } });
      productId = lot.productId;
    }

    if (!productId) {
      return res.status(400).json({ error: { code: 400, message: "productId ou lotId obrigatÃ³rio" } });
    }

    const isPositive = type === "ADJUST_POS";
    if (lotId) {
      const lot = await prisma.inventoryLot.findFirst({ where: { id: lotId, storeId, store: { tenantId } }, select: { id: true } });
      if (!lot) return res.status(404).json({ error: { code: 404, message: "Lote nao encontrado para esta loja" } });
      await prisma.inventoryLot.update({
        where: { id: lot.id },
        data: { quantity: isPositive ? { increment: Number(quantity) } : { decrement: Number(quantity) } },
      });
    }

    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        storeId, productId, lotId: lotId || null, type,
        quantity: Number(quantity), reason,
        createdById: req.user?.id,
      },
    });

    return sendOk(res, req, { ok: true });
  }));

  // Transfers between stores (request -> send -> receive)
  router.get("/inventory/transfers", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryTransfers", "Transferencias indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    if (!storeId) return sendOk(res, req, { transfers: [] });
    const transfers = await prisma.stockTransfer.findMany({
      where: {
        OR: [
          { originStoreId: storeId },
          { destinationStoreId: storeId },
        ],
        tenantId,
      },
      include: {
        originStore: { select: { id: true, name: true } },
        destinationStore: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, ean: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return sendOk(res, req, { transfers });
  }));

  router.post("/inventory/transfers", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryTransfers", "Transferencias indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    const destinationStoreId = await resolveStoreId(req);
    const { originStoreId, note, items = [] } = req.body || {};
    if (!destinationStoreId) return res.status(400).json({ error: { code: 400, message: "Loja atual nao definida" } });
    if (!originStoreId || originStoreId === destinationStoreId) {
      return res.status(400).json({ error: { code: 400, message: "originStoreId invalido" } });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: { code: 400, message: "Informe os itens da solicitacao" } });
    }

    const transfer = await prisma.stockTransfer.create({
      data: {
        tenantId,
        originStoreId,
        destinationStoreId,
        status: "DRAFT",
        note: note || null,
        createdById: req.user?.id,
        items: {
          create: items.map((it) => ({
            tenantId,
            productId: it.productId,
            quantity: Number(it.quantity || 0),
            costUnit: 0,
          })).filter((it) => it.productId && it.quantity > 0),
        },
      },
      include: {
        originStore: { select: { id: true, name: true } },
        destinationStore: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    });

    try {
      await sendTransferRequestChatMessages({
        transfer,
        senderId: req.user?.id,
      });
    } catch (err) {
      log?.warn?.("Falha ao notificar chat de transferencia solicitada", {
        transferId: transfer.id,
        error: err?.message || String(err),
      });
    }

    return sendOk(res, req, transfer, 201);
  }));

  router.post("/inventory/transfers/:id/send", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryTransfers", "Transferencias indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    assertPharmacistOrAdmin(req);
    const currentStoreId = await resolveStoreId(req);
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : null;
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, tenantId },
      include: { items: true },
    });
    if (!transfer) return res.status(404).json({ error: { code: 404, message: "Transferencia nao encontrada" } });
    if (transfer.status !== "DRAFT") return res.status(400).json({ error: { code: 400, message: "Transferencia nao pode ser enviada neste status" } });
    if (transfer.originStoreId !== currentStoreId) return res.status(403).json({ error: { code: 403, message: "Somente a loja de origem pode enviar" } });

    const requestedByProduct = {};
    for (const item of transfer.items) {
      requestedByProduct[item.productId] = (requestedByProduct[item.productId] || 0) + Number(item.quantity || 0);
    }

    const itemByProduct = {};
    if (requestedItems) {
      for (const item of requestedItems) {
        const productId = item?.productId;
        const qty = Number(item?.quantity || 0);
        if (!productId || qty <= 0) continue;
        if (!Object.prototype.hasOwnProperty.call(requestedByProduct, productId)) {
          return res.status(400).json({ error: { code: 400, message: "Item fora da solicitacao original" } });
        }
        itemByProduct[productId] = (itemByProduct[productId] || 0) + qty;
      }
      if (Object.keys(itemByProduct).length === 0) {
        return res.status(400).json({ error: { code: 400, message: "Selecione ao menos um item para envio" } });
      }
      for (const [productId, qty] of Object.entries(itemByProduct)) {
        if (qty > Number(requestedByProduct[productId] || 0)) {
          return res.status(400).json({ error: { code: 400, message: "Quantidade enviada excede a solicitada" } });
        }
      }
    } else {
      Object.assign(itemByProduct, requestedByProduct);
    }

    await prisma.$transaction(async (tx) => {
      for (const [productId, reqQtyRaw] of Object.entries(itemByProduct)) {
        const reqQty = Number(reqQtyRaw || 0);
        if (reqQty <= 0) continue;

        const reserved = await tx.stockReservationItem.aggregate({
          _sum: { reservedQty: true },
          where: {
            productId,
            reservation: { sourceStoreId: transfer.originStoreId, status: "APPROVED" },
          },
        });
        const reservedQty = Number(reserved._sum.reservedQty || 0);

        const lots = await tx.inventoryLot.findMany({
          where: { storeId: transfer.originStoreId, productId, active: true, quantity: { gt: 0 } },
          orderBy: { expiration: "asc" },
        });
        const totalQty = lots.reduce((s, l) => s + Number(l.quantity || 0), 0);
        const availableQty = Math.max(0, totalQty - reservedQty);
        if (availableQty < reqQty) {
          throw Object.assign(new Error("Estoque insuficiente para envio (considerando reservas)"), { statusCode: 400 });
        }

        let remaining = reqQty;
        for (const lot of lots) {
          if (remaining <= 0) break;
          const take = Math.min(Number(lot.quantity || 0), remaining);
          if (take <= 0) continue;

          await tx.inventoryLot.update({
            where: { id: lot.id },
            data: { quantity: { decrement: take } },
          });
          await tx.inventoryMovement.create({
            data: {
              tenantId,
              storeId: transfer.originStoreId,
              productId,
              lotId: lot.id,
              transferId: transfer.id,
              type: "TRANSFER_OUT",
              quantity: take,
              reason: `Transferencia para loja ${transfer.destinationStoreId}`,
              createdById: req.user?.id,
            },
          });
          remaining -= take;
        }
      }

      await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    });

    const updated = await prisma.stockTransfer.findFirst({
      where: { id: transfer.id, tenantId },
      include: {
        originStore: { select: { id: true, name: true } },
        destinationStore: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    });

    try {
      await sendTransferSentChatMessage({
        transferId: transfer.id,
        senderId: req.user?.id,
      });
    } catch (err) {
      log?.warn?.("Falha ao notificar chat de transferencia enviada", {
        transferId: transfer.id,
        error: err?.message || String(err),
      });
    }

    return sendOk(res, req, updated);
  }));

  router.post("/inventory/transfers/:id/receive", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryTransfers", "Transferencias indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    assertPharmacistOrAdmin(req);
    const currentStoreId = await resolveStoreId(req);
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        movements: {
          where: { type: "TRANSFER_OUT" },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!transfer) return res.status(404).json({ error: { code: 404, message: "Transferencia nao encontrada" } });
    if (transfer.status !== "SENT") return res.status(400).json({ error: { code: 400, message: "Transferencia nao pode ser recebida neste status" } });
    if (transfer.destinationStoreId !== currentStoreId) return res.status(403).json({ error: { code: 403, message: "Somente a loja destino pode receber" } });
    if ((transfer.movements || []).length === 0) {
      return res.status(400).json({ error: { code: 400, message: "Transferencia sem movimentacoes de envio" } });
    }

    await prisma.$transaction(async (tx) => {
      for (const mov of transfer.movements) {
        let lotNumber = `TR-${transfer.id.slice(0, 8)}`;
        let expiration = new Date();
        expiration.setFullYear(expiration.getFullYear() + 2);
        let costUnit = 0;

        if (mov.lotId) {
          const originLot = await tx.inventoryLot.findUnique({ where: { id: mov.lotId } });
          if (originLot) {
            lotNumber = originLot.lotNumber;
            expiration = originLot.expiration;
            costUnit = Number(originLot.costUnit || 0);
          }
        }

        const lot = await tx.inventoryLot.upsert({
          where: {
            storeId_productId_lotNumber_expiration: {
              storeId: transfer.destinationStoreId,
              productId: mov.productId,
              lotNumber,
              expiration,
            },
          },
          update: {
            quantity: { increment: Number(mov.quantity || 0) },
            costUnit,
          },
          create: {
            tenantId,
            storeId: transfer.destinationStoreId,
            productId: mov.productId,
            lotNumber,
            expiration,
            costUnit,
            quantity: Number(mov.quantity || 0),
            active: true,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            tenantId,
            storeId: transfer.destinationStoreId,
            productId: mov.productId,
            lotId: lot.id,
            transferId: transfer.id,
            type: "TRANSFER_IN",
            quantity: Number(mov.quantity || 0),
            reason: `Recebimento de transferencia ${transfer.id}`,
            createdById: req.user?.id,
          },
        });
      }

      await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: { status: "RECEIVED", receivedAt: new Date(), receivedById: req.user?.id },
      });
    });

    const updated = await prisma.stockTransfer.findFirst({
      where: { id: transfer.id, tenantId },
      include: {
        originStore: { select: { id: true, name: true } },
        destinationStore: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    });
    return sendOk(res, req, updated);
  }));

  router.post("/inventory/transfers/:id/cancel", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryTransfers", "Transferencias indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    const transfer = await prisma.stockTransfer.findFirst({ where: { id: req.params.id, tenantId } });
    if (!transfer) return res.status(404).json({ error: { code: 404, message: "Transferencia nao encontrada" } });
    if (transfer.status === "RECEIVED") return res.status(400).json({ error: { code: 400, message: "Transferencia recebida nao pode ser cancelada" } });
    if (transfer.status === "SENT") return res.status(400).json({ error: { code: 400, message: "Transferencia enviada deve ser recebida ou tratada por ajuste" } });

    await prisma.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "CANCELED" },
    });
    return sendOk(res, req, { canceled: true });
  }));

  // Reservation flow between stores
  router.get("/inventory/reservations", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryReservations", "Reservas indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    if (!storeId) return sendOk(res, req, { reservations: [] });
    const rows = await prisma.stockReservation.findMany({
      where: {
        OR: [
          { requestStoreId: storeId },
          { sourceStoreId: storeId },
        ],
        tenantId,
      },
      include: {
        requestStore: { select: { id: true, name: true } },
        sourceStore: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, document: true } },
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, ean: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return sendOk(res, req, { reservations: rows });
  }));

  router.post("/inventory/reservations", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryReservations", "Reservas indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    assertPharmacistOrAdmin(req);
    const requestStoreId = await resolveStoreId(req);
    const { sourceStoreId, customerId, note, items = [] } = req.body || {};
    if (!requestStoreId) return res.status(400).json({ error: { code: 400, message: "Loja solicitante nao definida" } });
    if (!sourceStoreId || sourceStoreId === requestStoreId) {
      return res.status(400).json({ error: { code: 400, message: "sourceStoreId invalido" } });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: { code: 400, message: "Informe os itens da reserva" } });
    }

    const reservation = await prisma.stockReservation.create({
      data: {
        tenantId,
        requestStoreId,
        sourceStoreId,
        customerId: customerId || null,
        note: note || null,
        status: "REQUESTED",
        requestedById: req.user?.id,
        items: {
          create: items
            .map((it) => ({ tenantId, productId: it.productId, quantity: Number(it.quantity || 0), reservedQty: 0 }))
            .filter((it) => it.productId && it.quantity > 0),
        },
      },
      include: {
        requestStore: { select: { id: true, name: true } },
        sourceStore: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    });

    return sendOk(res, req, reservation, 201);
  }));

  router.post("/inventory/reservations/:id/approve", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryReservations", "Reservas indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    assertPharmacistOrAdmin(req);
    const storeId = await resolveStoreId(req);
    const reservation = await prisma.stockReservation.findFirst({
      where: { id: req.params.id, tenantId },
      include: { items: true },
    });
    if (!reservation) return res.status(404).json({ error: { code: 404, message: "Reserva nao encontrada" } });
    if (reservation.status !== "REQUESTED") return res.status(400).json({ error: { code: 400, message: "Reserva nao pode ser aprovada neste status" } });
    if (reservation.sourceStoreId !== storeId) return res.status(403).json({ error: { code: 403, message: "Somente a loja origem pode aprovar" } });

    await prisma.$transaction(async (tx) => {
      for (const item of reservation.items) {
        const total = await tx.inventoryLot.aggregate({
          _sum: { quantity: true },
          where: { storeId: reservation.sourceStoreId, productId: item.productId, active: true, quantity: { gt: 0 } },
        });
        const totalQty = Number(total._sum.quantity || 0);

        const reserved = await tx.stockReservationItem.aggregate({
          _sum: { reservedQty: true },
          where: {
            productId: item.productId,
            reservation: { sourceStoreId: reservation.sourceStoreId, status: "APPROVED" },
          },
        });
        const reservedQty = Number(reserved._sum.reservedQty || 0);

        const available = Math.max(0, totalQty - reservedQty);
        if (available < Number(item.quantity || 0)) {
          throw Object.assign(new Error("Estoque indisponivel para aprovar reserva"), { statusCode: 400 });
        }

        await tx.stockReservationItem.update({
          where: { id: item.id },
          data: { reservedQty: Number(item.quantity || 0) },
        });
      }

      await tx.stockReservation.update({
        where: { id: reservation.id },
        data: {
          status: "APPROVED",
          reviewedById: req.user?.id,
          reviewedAt: new Date(),
          rejectReason: null,
        },
      });
    });

    return sendOk(res, req, { approved: true });
  }));

  router.post("/inventory/reservations/:id/reject", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryReservations", "Reservas indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    assertPharmacistOrAdmin(req);
    const storeId = await resolveStoreId(req);
    const { reason } = req.body || {};
    if (!reason) return res.status(400).json({ error: { code: 400, message: "Motivo obrigatorio" } });
    const reservation = await prisma.stockReservation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!reservation) return res.status(404).json({ error: { code: 404, message: "Reserva nao encontrada" } });
    if (reservation.sourceStoreId !== storeId) return res.status(403).json({ error: { code: 403, message: "Somente a loja origem pode rejeitar" } });
    if (reservation.status !== "REQUESTED") return res.status(400).json({ error: { code: 400, message: "Reserva nao pode ser rejeitada neste status" } });

    await prisma.stockReservation.update({
      where: { id: reservation.id },
      data: {
        status: "REJECTED",
        rejectReason: reason,
        reviewedById: req.user?.id,
        reviewedAt: new Date(),
      },
    });
    return sendOk(res, req, { rejected: true });
  }));

  router.post("/inventory/reservations/:id/cancel", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryReservations", "Reservas indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    const reservation = await prisma.stockReservation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!reservation) return res.status(404).json({ error: { code: 404, message: "Reserva nao encontrada" } });
    if (![reservation.requestStoreId, reservation.sourceStoreId].includes(storeId)) {
      return res.status(403).json({ error: { code: 403, message: "Sem permissao para cancelar reserva" } });
    }
    if (!["REQUESTED", "APPROVED"].includes(reservation.status)) {
      return res.status(400).json({ error: { code: 400, message: "Reserva nao pode ser cancelada neste status" } });
    }

    await prisma.stockReservation.update({
      where: { id: reservation.id },
      data: { status: "CANCELED", canceledAt: new Date() },
    });
    return sendOk(res, req, { canceled: true });
  }));

  router.post("/inventory/reservations/:id/fulfill", asyncHandler(async (req, res) => {
    await assertFeature(req, "inventoryReservations", "Reservas indisponiveis no plano atual");
    const tenantId = await resolveTenantId(req);
    assertPharmacistOrAdmin(req);
    const storeId = await resolveStoreId(req);
    const reservation = await prisma.stockReservation.findFirst({ where: { id: req.params.id, tenantId } });
    if (!reservation) return res.status(404).json({ error: { code: 404, message: "Reserva nao encontrada" } });
    if (reservation.requestStoreId !== storeId) return res.status(403).json({ error: { code: 403, message: "Somente loja solicitante pode finalizar" } });
    if (reservation.status !== "APPROVED") return res.status(400).json({ error: { code: 400, message: "Reserva nao pode ser finalizada neste status" } });

    await prisma.stockReservation.update({
      where: { id: reservation.id },
      data: { status: "FULFILLED", fulfilledAt: new Date() },
    });
    return sendOk(res, req, { fulfilled: true });
  }));

  // â”€â”€â”€ INVENTORY EDIT (correct wrong entry) â”€â”€â”€
  router.put("/inventory/lots/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { quantity, costUnit, reason } = req.body;
    if (quantity === undefined && costUnit === undefined) {
      return res.status(400).json({ error: { code: 400, message: "Informe quantity ou costUnit" } });
    }
    if (!reason) return res.status(400).json({ error: { code: 400, message: "Motivo obrigatÃ³rio" } });

    const lot = await prisma.inventoryLot.findFirst({ where: { id: req.params.id, store: { tenantId } } });
    if (!lot) return res.status(404).json({ error: { code: 404, message: "Lote nÃ£o encontrado" } });

    const data = {};
    if (quantity !== undefined) data.quantity = Number(quantity);
    if (costUnit !== undefined) data.costUnit = Number(costUnit);

    const updated = await prisma.inventoryLot.update({ where: { id: lot.id }, data });

    // Log adjustment movement if quantity changed
    if (quantity !== undefined && Number(quantity) !== lot.quantity) {
      const diff = Number(quantity) - lot.quantity;
      await prisma.inventoryMovement.create({
        data: {
          tenantId,
          storeId: lot.storeId, productId: lot.productId, lotId: lot.id,
          type: diff > 0 ? "ADJUST_POS" : "ADJUST_NEG",
          quantity: Math.abs(diff),
          reason: `Correcao: ${reason}`,
          createdById: req.user?.id,
        },
      });
    }

    return sendOk(res, req, updated);
  }));

  // â”€â”€â”€ STOCK VALUATION â”€â”€â”€
  router.get("/inventory/valuation", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const storeId = req.query.storeId || null;
    const allowedStoreIds = await getUserStoreIds(req);
    if (!isAdmin(req) && allowedStoreIds.length === 0) {
      return res.status(403).json({ error: { code: 403, message: "Usuario sem loja vinculada" } });
    }
    if (!isAdmin(req) && storeId && !allowedStoreIds.includes(storeId)) {
      return res.status(403).json({ error: { code: 403, message: "Sem acesso a loja informada" } });
    }

    // Get all active lots grouped by product
    const lotsWhere = { active: true, store: { tenantId } };
    if (storeId) lotsWhere.storeId = storeId;
    else if (!isAdmin(req)) lotsWhere.storeId = { in: allowedStoreIds };

    const lots = await prisma.inventoryLot.findMany({
      where: lotsWhere,
      include: { product: { select: { id: true, name: true, ean: true } } },
    });

    // Get sales data for sold value calculation
    const salesWhere = { status: "PAID" };
    if (storeId) salesWhere.storeId = storeId;
    else if (!isAdmin(req)) salesWhere.storeId = { in: allowedStoreIds };
    const saleItems = await prisma.saleItem.findMany({
      where: { sale: salesWhere },
      include: { product: { select: { id: true, name: true } } },
    });

    // Aggregate by product
    const products = {};
    for (const lot of lots) {
      const pid = lot.productId;
      if (!products[pid]) {
        products[pid] = {
          productId: pid, productName: lot.product.name, ean: lot.product.ean,
          stockQty: 0, stockValue: 0, totalCostEntries: 0, totalQtyEntries: 0,
          soldQty: 0, soldValue: 0,
        };
      }
      const p = products[pid];
      p.stockQty += lot.quantity;
      p.stockValue += lot.quantity * Number(lot.costUnit);
      p.totalCostEntries += (lot.quantity > 0 ? 1 : 0) * Number(lot.costUnit) * lot.quantity; // weighted
      p.totalQtyEntries += lot.quantity;
    }

    // Add sales data
    for (const si of saleItems) {
      const pid = si.productId;
      if (!products[pid]) {
        products[pid] = {
          productId: pid, productName: si.product.name, ean: null,
          stockQty: 0, stockValue: 0, totalCostEntries: 0, totalQtyEntries: 0,
          soldQty: 0, soldValue: 0,
        };
      }
      products[pid].soldQty += si.quantity;
      products[pid].soldValue += Number(si.subtotal);
    }

    // Compute averages
    const result = Object.values(products).map((p) => ({
      ...p,
      avgCost: p.totalQtyEntries > 0 ? Math.round((p.stockValue / p.stockQty) * 100) / 100 || 0 : 0,
      stockValue: Math.round(p.stockValue * 100) / 100,
      soldValue: Math.round(p.soldValue * 100) / 100,
    }));

    // Summary
    const totalStockValue = result.reduce((s, p) => s + p.stockValue, 0);
    const totalSoldValue = result.reduce((s, p) => s + p.soldValue, 0);
    const totalStockQty = result.reduce((s, p) => s + p.stockQty, 0);

    return sendOk(res, req, {
      products: result.sort((a, b) => a.productName.localeCompare(b.productName)),
      summary: {
        totalStockValue: Math.round(totalStockValue * 100) / 100,
        totalSoldValue: Math.round(totalSoldValue * 100) / 100,
        totalStockQty,
        productCount: result.length,
      },
    });
  }));

  // â”€â”€â”€ AUTO-PRICE (calculate selling price from cost) â”€â”€â”€
  router.post("/products/:id/auto-price", asyncHandler(async (req, res) => {
    const { markup } = req.body; // markup percentage (e.g., 30 = 30%)
    if (!markup || markup <= 0) {
      return res.status(400).json({ error: { code: 400, message: "Markup deve ser maior que 0" } });
    }

    // Get average cost from lots
    const lots = await prisma.inventoryLot.findMany({
      where: { productId: req.params.id, active: true, quantity: { gt: 0 } },
    });

    if (lots.length === 0) {
      return res.status(400).json({ error: { code: 400, message: "Produto sem estoque para calcular custo" } });
    }

    const totalValue = lots.reduce((s, l) => s + Number(l.costUnit) * l.quantity, 0);
    const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
    const avgCost = totalValue / totalQty;
    const sellingPrice = Math.round(avgCost * (1 + Number(markup) / 100) * 100) / 100;

    // Deactivate old prices
    await prisma.productPrice.updateMany({ where: { productId: req.params.id, active: true }, data: { active: false } });

    // Create new price
    const price = await prisma.productPrice.create({
      data: { productId: req.params.id, price: sellingPrice, active: true },
    });

    // Save markup on product
    await prisma.product.update({ where: { id: req.params.id }, data: { defaultMarkup: Number(markup) } });

    return sendOk(res, req, { avgCost: Math.round(avgCost * 100) / 100, markup: Number(markup), sellingPrice, price });
  }));

  // â”€â”€â”€ CUSTOMERS â”€â”€â”€
  router.get("/customers", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { search, page = 1, limit = 50 } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where = { tenantId };
    if (search && search.length >= 2) {
      const digits = search.replace(/\D/g, "");
      if (digits.length >= 3) {
        where.OR = [{ document: { contains: digits } }, { name: { contains: search, mode: "insensitive" } }];
      } else {
        where.name = { contains: search, mode: "insensitive" };
      }
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where, take, skip, orderBy: { name: "asc" },
        select: { id: true, name: true, document: true, phone: true, whatsapp: true, birthDate: true, email: true },
      }),
      prisma.customer.count({ where }),
    ]);
    return sendOk(res, req, { customers, total, totalPages: Math.ceil(total / take) || 1 });
  }));

  router.post("/customers", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { name, document, birthDate, whatsapp, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: { code: 400, message: "Nome obrigatÃ³rio" } });

    const cleanDoc = document ? document.replace(/\D/g, "") : null;
    if (cleanDoc) {
      const existing = await prisma.customer.findFirst({ where: { tenantId, document: cleanDoc } });
      if (existing) return res.status(400).json({ error: { code: 400, message: "CPF jÃ¡ cadastrado" } });
    }

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        name,
        document: cleanDoc,
        birthDate: safeDate(birthDate),
        whatsapp: whatsapp || null,
        phone: phone || null,
        email: email || null,
      },
    });
    return sendOk(res, req, customer, 201);
  }));

  router.get("/customers/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId },
      include: { sales: { where: { tenantId, status: "PAID" }, orderBy: { createdAt: "desc" }, take: 10, include: { items: { include: { product: true } } } } },
    });
    if (!customer) return res.status(404).json({ error: { code: 404, message: "Cliente nÃ£o encontrado" } });
    return sendOk(res, req, customer);
  }));

  router.get("/customers/:id/purchases", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const sales = await prisma.sale.findMany({
      where: { tenantId, customerId: req.params.id, status: "PAID" },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } } },
    });

    const purchases = sales.map((s) => ({
      saleId: s.id,
      saleNumber: s.number,
      date: s.createdAt,
      total: Number(s.total),
      items: s.items.map((i) => ({
        productId: i.productId,
        productName: i.product.name,
        qty: i.quantity,
        priceUnit: Number(i.priceUnit),
      })),
    }));

    return sendOk(res, req, { purchases });
  }));

  router.get("/customers/:id/repurchase", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    // Find all paid sales for this customer, with items that have usageDays
    const sales = await prisma.sale.findMany({
      where: { tenantId, customerId: req.params.id, status: "PAID" },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } } },
    });

    // Group by product: find the most recent purchase of each product with usageDays
    const productMap = {};
    for (const sale of sales) {
      for (const item of sale.items) {
        if (!item.product.usageDays || item.product.usageDays <= 0) continue;
        const pid = item.productId;
        if (!productMap[pid]) {
          productMap[pid] = {
            productId: pid,
            productName: item.product.name,
            usageDays: item.product.usageDays,
            lastPurchaseDate: sale.createdAt,
            qtyBought: item.quantity,
          };
        }
      }
    }

    const now = new Date();
    const suggestions = Object.values(productMap).map((p) => {
      const totalDays = p.usageDays * p.qtyBought;
      const estimatedRunOut = new Date(p.lastPurchaseDate);
      estimatedRunOut.setDate(estimatedRunOut.getDate() + totalDays);
      const daysSince = Math.floor((now - new Date(p.lastPurchaseDate)) / (1000 * 60 * 60 * 24));
      return { ...p, estimatedRunOut, daysSince, needsRepurchase: now >= estimatedRunOut };
    }).filter((s) => s.needsRepurchase);

    return sendOk(res, req, { suggestions });
  }));

  // â”€â”€â”€ SALES â”€â”€â”€
  router.get("/sales", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    const { status, search, page = 1, limit = 30 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = { tenantId };
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (search) where.number = { contains: search };
    if (req.query.exchangePending === "true") where.exchangeBalance = { not: null };

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where, skip, take,
        include: {
          customer: true,
          payments: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.sale.count({ where }),
    ]);

    const totalPages = Math.ceil(total / take) || 1;

    return sendOk(res, req, { sales, totalPages, page: Number(page), total });
  }));

  router.get("/sales/:id", asyncHandler(async (req, res) => {
    const sale = await loadFullSale(req.params.id, await resolveTenantId(req));
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda nÃ£o encontrada" } });
    return sendOk(res, req, sale);
  }));

  router.put("/sales/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { customerId, discount } = req.body;
    const currentSale = await prisma.sale.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
    if (!currentSale) return res.status(404).json({ error: { code: 404, message: "Venda nao encontrada" } });
    const data = {};
    if (customerId !== undefined) data.customerId = customerId || null;
    if (discount !== undefined) data.discount = Number(discount);

    await prisma.sale.update({ where: { id: currentSale.id }, data });
    const sale = await loadFullSale(currentSale.id, tenantId);
    return sendOk(res, req, sale);
  }));

  router.put("/sales/:id/controlled-dispensation", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const sale = await prisma.sale.findFirst({
      where: { id: req.params.id, tenantId },
      include: { items: { include: { product: { select: { controlled: true } } } } },
    });
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda nao encontrada" } });
    if (sale.status !== "DRAFT" && sale.status !== "CONFIRMED") {
      return res.status(400).json({ error: { code: 400, message: "Nao e possivel editar dados neste status" } });
    }

    const hasControlled = (sale.items || []).some((it) => Boolean(it.product?.controlled));
    if (!hasControlled) {
      return res.status(400).json({ error: { code: 400, message: "Venda sem item controlado" } });
    }

    const data = validateControlledDispensationInput(req.body || {});
    await prisma.saleControlledDispensation.upsert({
      where: { saleId: sale.id },
      update: {
        ...data,
        createdById: req.user?.id || null,
      },
      create: {
        saleId: sale.id,
        ...data,
        createdById: req.user?.id || null,
      },
    });

    const full = await loadFullSale(sale.id, tenantId);
    return sendOk(res, req, full);
  }));

  router.post("/sales", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    if (!storeId) return res.status(400).json({ error: { code: 400, message: "storeId nÃ£o definido" } });

    // Robust sale number generation with retry for race conditions (e.g., React StrictMode double-mount)
    const maxRetries = 5;
    let sale = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const existingSales = await prisma.sale.findMany({
        where: { storeId },
        select: { number: true },
      });

      let maxNum = 0;
      for (const s of existingSales) {
        const digits = s.number.replace(/\D/g, "");
        const n = parseInt(digits, 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }

      const number = String(maxNum + 1 + attempt).padStart(6, "0");

      try {
        sale = await prisma.sale.create({
          data: {
            tenantId,
            number, storeId, sellerId: req.user?.id,
            status: "DRAFT", channel: "BALCAO",
            total: 0, discount: 0,
            customerId: req.body.customerId || null,
          },
          include: {
            customer: true,
            items: { include: { product: true } },
            payments: true,
          },
        });
        break; // success
      } catch (e) {
        if (e.code === "P2002" && attempt < maxRetries - 1) continue; // unique constraint, retry
        throw e;
      }
    }

    return sendOk(res, req, sale, 201);
  }));

  router.post("/sales/:id/items", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { productId, quantity } = req.body;
    if (!productId || !quantity) return res.status(400).json({ error: { code: 400, message: "productId e quantity obrigatÃ³rios" } });

    const saleCtx = await prisma.sale.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true, storeId: true, status: true } });
    if (!saleCtx) return res.status(404).json({ error: { code: 404, message: "Venda nao encontrada" } });
    if (saleCtx.status !== "DRAFT" && saleCtx.status !== "CONFIRMED") {
      return res.status(400).json({ error: { code: 400, message: "Nao e possivel incluir itens neste status" } });
    }
    const qtyRequested = Number(quantity || 0);
    const availableQty = await getAvailableQtyInStore(saleCtx.storeId, productId);
    if (availableQty < qtyRequested) {
      return res.status(400).json({
        error: {
          code: 400,
          message: `Produto sem estoque suficiente na loja selecionada (disponivel: ${availableQty})`,
        },
      });
    }

    const price = await prisma.productPrice.findFirst({ where: { productId, active: true }, orderBy: { createdAt: "desc" } });
    if (!price) return res.status(400).json({ error: { code: 400, message: "Produto sem preÃ§o" } });

    const basePrice = Number(price.price);
    let priceUnit = basePrice;
    let priceOriginal = null;

    // Apply active discount if any
    const now = new Date();
    const discount = await prisma.discount.findFirst({
      where: { productId, active: true, startDate: { lte: now } },
      orderBy: { createdAt: "desc" },
    });
    if (discount && (!discount.endDate || new Date(discount.endDate) >= now)) {
      priceOriginal = basePrice;
      if (discount.type === "PERCENT") {
        priceUnit = basePrice * (1 - Number(discount.value) / 100);
      } else {
        priceUnit = Math.max(0, basePrice - Number(discount.value));
      }
      priceUnit = Math.round(priceUnit * 100) / 100;
    }

    const subtotal = priceUnit * Number(quantity);

    await prisma.saleItem.create({
      data: {
        tenantId,
        saleId: saleCtx.id, productId,
        quantity: Number(quantity), priceUnit, priceOriginal, subtotal,
      },
    });

    // Recalculate sale total
    const items = await prisma.saleItem.findMany({ where: { saleId: saleCtx.id } });
    const total = items.reduce((s, i) => s + Number(i.subtotal), 0);
    await prisma.sale.update({ where: { id: saleCtx.id }, data: { total } });

    // Return full sale
    const sale = await loadFullSale(saleCtx.id, tenantId);
    return sendOk(res, req, sale);
  }));

  // Update item quantity
  router.put("/sales/:saleId/items/:itemId", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ error: { code: 400, message: "quantity deve ser >= 1" } });

    const saleCtx = await prisma.sale.findFirst({ where: { id: req.params.saleId, tenantId }, select: { id: true, storeId: true, status: true } });
    if (!saleCtx) return res.status(404).json({ error: { code: 404, message: "Venda nao encontrada" } });
    const item = await prisma.saleItem.findFirst({ where: { id: req.params.itemId, saleId: saleCtx.id } });
    if (!item) return res.status(404).json({ error: { code: 404, message: "Item nÃ£o encontrado" } });
    if (saleCtx.status !== "DRAFT" && saleCtx.status !== "CONFIRMED") {
      return res.status(400).json({ error: { code: 400, message: "Nao e possivel alterar itens neste status" } });
    }
    const qtyRequested = Number(quantity || 0);
    const currentQty = Number(item.quantity || 0);
    const delta = qtyRequested - currentQty;
    if (delta > 0) {
      const availableQty = await getAvailableQtyInStore(saleCtx.storeId, item.productId);
      if (availableQty < delta) {
        return res.status(400).json({
          error: {
            code: 400,
            message: `Produto sem estoque suficiente na loja selecionada (disponivel para adicionar: ${availableQty})`,
          },
        });
      }
    }

    const subtotal = Number(item.priceUnit) * Number(quantity);
    await prisma.saleItem.update({ where: { id: req.params.itemId }, data: { quantity: Number(quantity), subtotal } });

    // Recalculate sale total
    const items = await prisma.saleItem.findMany({ where: { saleId: req.params.saleId } });
    const total = items.reduce((s, i) => s + Number(i.subtotal), 0);
    await prisma.sale.update({ where: { id: req.params.saleId }, data: { total } });

    const sale = await loadFullSale(saleCtx.id, tenantId);
    return sendOk(res, req, sale);
  }));

  router.delete("/sales/:saleId/items/:itemId", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const sale = await prisma.sale.findFirst({ where: { id: req.params.saleId, tenantId }, select: { id: true } });
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda nao encontrada" } });
    const item = await prisma.saleItem.findFirst({ where: { id: req.params.itemId, saleId: sale.id }, select: { id: true } });
    if (!item) return res.status(404).json({ error: { code: 404, message: "Item nao encontrado" } });

    await prisma.saleItem.delete({ where: { id: item.id } });
    const items = await prisma.saleItem.findMany({ where: { saleId: sale.id } });
    const total = items.reduce((s, i) => s + Number(i.subtotal), 0);
    await prisma.sale.update({ where: { id: sale.id }, data: { total } });

    // Return full sale
    const fullSale = await loadFullSale(sale.id, tenantId);
    return sendOk(res, req, fullSale);
  }));

  router.post("/sales/:id/confirm", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const sale = await prisma.sale.findFirst({ where: { id: req.params.id, tenantId }, select: { id: true } });
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda nao encontrada" } });
    await assertControlledDispensationIfRequired(sale.id, tenantId);
    await prisma.sale.update({
      where: { id: sale.id },
      data: { status: "CONFIRMED" },
    });
    const updatedSale = await loadFullSale(sale.id, tenantId);
    return sendOk(res, req, updatedSale);
  }));

  router.post("/sales/:id/pay", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { method, pos } = req.body || {};
    if (!method) return res.status(400).json({ error: { code: 400, message: "method obrigatÃ³rio (DINHEIRO, PIX, CARTAO_CREDITO, CARTAO_DEBITO)" } });

    const sale = await prisma.sale.findFirst({
      where: { id: req.params.id, tenantId },
      include: { items: { include: { product: true } } },
    });

    if (!sale || (sale.status !== "CONFIRMED" && sale.status !== "DRAFT")) {
      return res.status(400).json({ error: { code: 400, message: "Venda nÃ£o pode ser paga neste status" } });
    }

    // Check open cash session
    const session = await prisma.cashSession.findFirst({ where: { storeId: sale.storeId, closedAt: null } });
    if (!session) return res.status(400).json({ error: { code: 400, message: "Nenhuma sessÃ£o de caixa aberta" } });

    // FEFO + COGS for each item
    for (const item of sale.items) {
      const reserved = await prisma.stockReservationItem.aggregate({
        _sum: { reservedQty: true },
        where: {
          productId: item.productId,
          reservation: { sourceStoreId: sale.storeId, status: "APPROVED" },
        },
      });
      const reservedQty = Number(reserved._sum.reservedQty || 0);

      const totalStock = await prisma.inventoryLot.aggregate({
        _sum: { quantity: true },
        where: { productId: item.productId, storeId: sale.storeId, active: true, quantity: { gt: 0 } },
      });
      const totalQty = Number(totalStock._sum.quantity || 0);
      const availableQty = Math.max(0, totalQty - reservedQty);
      if (availableQty < Number(item.quantity || 0)) {
        return res.status(400).json({ error: { code: 400, message: `Estoque indisponivel para ${item.product?.name || "produto"} (reservas ativas)` } });
      }

      const lots = await prisma.inventoryLot.findMany({
        where: { productId: item.productId, storeId: sale.storeId, active: true, quantity: { gt: 0 } },
        orderBy: { expiration: "asc" },
      });

      let remaining = item.quantity;
      let totalCogs = 0;

      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.quantity, remaining);

        await prisma.inventoryLot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
        await prisma.inventoryMovement.create({
          data: {
            tenantId,
            storeId: sale.storeId, productId: item.productId, lotId: lot.id,
            type: "OUT", quantity: take, saleId: sale.id, createdById: req.user?.id,
          },
        });

        totalCogs += take * Number(lot.costUnit);
        remaining -= take;
      }

      const cogsUnit = item.quantity > 0 ? totalCogs / item.quantity : 0;
      await prisma.saleItem.update({
        where: { id: item.id },
        data: { cogsUnit: Number(cogsUnit.toFixed(4)), cogsTotal: Number(totalCogs.toFixed(2)) },
      });
    }

    // Create payment
    const payment = await prisma.payment.create({ data: { tenantId, saleId: sale.id, method, amount: sale.total } });

    // Optional POS metadata for card/PIX payments
    if (pos && (method === "CARTAO_CREDITO" || method === "CARTAO_DEBITO" || method === "PIX")) {
      await prisma.posTransaction.create({
        data: {
          tenantId,
          saleId: sale.id,
          paymentId: payment.id,
          provider: String(pos.provider || "MANUAL").trim().toUpperCase(),
          method,
          amount: sale.total,
          status: String(pos.status || "APPROVED").trim().toUpperCase(),
          transactionId: pos.transactionId ? String(pos.transactionId) : null,
          nsu: pos.nsu ? String(pos.nsu) : null,
          authorizationCode: pos.authorizationCode ? String(pos.authorizationCode) : null,
          cardBrand: pos.cardBrand ? String(pos.cardBrand) : null,
          rawPayload: pos.rawPayload ?? null,
        },
      });
    }

    // Create cash movement
    await prisma.cashMovement.create({
      data: {
        sessionId: session.id, type: "RECEBIMENTO", method, amount: sale.total,
        reason: `Venda #${sale.number}`,
        refType: "SALE", refId: sale.id, createdById: req.user?.id,
      },
    });

    // Update sale status and return full sale
    await prisma.sale.update({ where: { id: sale.id }, data: { status: "PAID" } });
    const updated = await loadFullSale(sale.id, tenantId);
    return sendOk(res, req, updated);
  }));

  // Delete a DRAFT sale (permanent removal, not cancellation)
  router.delete("/sales/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const sale = await prisma.sale.findFirst({ where: { id: req.params.id, tenantId } });
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda nÃ£o encontrada" } });
    if (sale.status !== "DRAFT") return res.status(400).json({ error: { code: 400, message: "Somente rascunhos podem ser apagados" } });

    await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
    await prisma.sale.delete({ where: { id: sale.id } });
    return sendOk(res, req, { deleted: true });
  }));

  router.post("/sales/:id/cancel", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { reason } = req.body || {};
    const sale = await prisma.sale.findFirst({ where: { id: req.params.id, tenantId } });
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda nÃ£o encontrada" } });
    if (sale.status === "PAID") return res.status(400).json({ error: { code: 400, message: "Venda paga nÃ£o pode ser cancelada (use estorno)" } });

    // CONFIRMED sales require a reason
    if (sale.status === "CONFIRMED" && !reason) {
      return res.status(400).json({ error: { code: 400, message: "Motivo obrigatÃ³rio para cancelar venda confirmada" } });
    }

    await prisma.sale.update({
      where: { id: sale.id },
      data: { status: "CANCELED", cancelReason: reason || null },
    });
    const updated = await loadFullSale(sale.id, tenantId);
    return sendOk(res, req, updated);
  }));

  // â”€â”€â”€ EXCHANGE (TROCA) â”€â”€â”€
  router.post("/sales/:id/exchange", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { returnedItems, newItems, reason } = req.body;
    // returnedItems: [{ saleItemId, quantity }] â€” items to return
    // newItems: [{ productId, quantity }] â€” new items the customer takes
    if ((!returnedItems || !returnedItems.length) && (!newItems || !newItems.length)) {
      return res.status(400).json({ error: { code: 400, message: "Informe os itens para troca" } });
    }

    const sale = await prisma.sale.findFirst({
      where: { id: req.params.id, tenantId },
      include: { items: { include: { product: true } } },
    });

    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda nÃ£o encontrada" } });
    if (sale.status !== "PAID") return res.status(400).json({ error: { code: 400, message: "Somente vendas pagas podem ser trocadas" } });

    let totalReturn = 0;
    let totalNew = 0;
    const now = new Date();

    // 1) Process returned items â€” refund + return to inventory
    for (const ri of (returnedItems || [])) {
      const saleItem = sale.items.find((i) => i.id === ri.saleItemId);
      if (!saleItem) continue;
      const returnQty = Math.min(ri.quantity, saleItem.quantity);
      if (returnQty <= 0) continue;

      totalReturn += returnQty * Number(saleItem.priceUnit);

      const lot = await prisma.inventoryLot.findFirst({
        where: { productId: saleItem.productId, storeId: sale.storeId, active: true },
        orderBy: { expiration: "asc" },
      });
      if (lot) {
        await prisma.inventoryLot.update({ where: { id: lot.id }, data: { quantity: { increment: returnQty } } });
        await prisma.inventoryMovement.create({
          data: {
            tenantId,
            storeId: sale.storeId, productId: saleItem.productId, lotId: lot.id,
            type: "IN", quantity: returnQty, reason: reason || "Troca - DevoluÃ§Ã£o",
            refType: "EXCHANGE", refId: sale.id, createdById: req.user?.id,
          },
        });
      }
    }

    // 2) Process new items â€” add to sale + deduct from inventory
    for (const ni of (newItems || [])) {
      if (!ni.productId || !ni.quantity || ni.quantity <= 0) continue;

      const price = await prisma.productPrice.findFirst({ where: { productId: ni.productId, active: true }, orderBy: { createdAt: "desc" } });
      if (!price) continue;

      let basePrice = Number(price.price);
      let priceUnit = basePrice;
      let priceOriginal = null;

      // Apply active discount
      const discount = await prisma.discount.findFirst({
        where: { productId: ni.productId, active: true, startDate: { lte: now } },
        orderBy: { createdAt: "desc" },
      });
      if (discount && (!discount.endDate || new Date(discount.endDate) >= now)) {
        priceOriginal = basePrice;
        priceUnit = discount.type === "PERCENT"
          ? basePrice * (1 - Number(discount.value) / 100)
          : Math.max(0, basePrice - Number(discount.value));
        priceUnit = Math.round(priceUnit * 100) / 100;
      }

      const subtotal = priceUnit * ni.quantity;
      totalNew += subtotal;

      await prisma.saleItem.create({
        data: {
          tenantId,
          saleId: sale.id, productId: ni.productId,
          quantity: ni.quantity, priceUnit, priceOriginal, subtotal,
        },
      });

      // Deduct from inventory
      const reserved = await prisma.stockReservationItem.aggregate({
        _sum: { reservedQty: true },
        where: {
          productId: ni.productId,
          reservation: { sourceStoreId: sale.storeId, status: "APPROVED" },
        },
      });
      const reservedQty = Number(reserved._sum.reservedQty || 0);
      const totalStock = await prisma.inventoryLot.aggregate({
        _sum: { quantity: true },
        where: { productId: ni.productId, storeId: sale.storeId, active: true, quantity: { gt: 0 } },
      });
      const availableQty = Math.max(0, Number(totalStock._sum.quantity || 0) - reservedQty);
      if (availableQty < Number(ni.quantity || 0)) {
        return res.status(400).json({ error: { code: 400, message: "Estoque insuficiente para novo item da troca (reservas ativas)" } });
      }

      const lot = await prisma.inventoryLot.findFirst({
        where: { productId: ni.productId, storeId: sale.storeId, active: true, quantity: { gt: 0 } },
        orderBy: { expiration: "asc" },
      });
      if (lot) {
        await prisma.inventoryLot.update({ where: { id: lot.id }, data: { quantity: { decrement: ni.quantity } } });
        await prisma.inventoryMovement.create({
          data: {
            tenantId,
            storeId: sale.storeId, productId: ni.productId, lotId: lot.id,
            type: "OUT", quantity: ni.quantity, reason: reason || "Troca - Novo item",
            refType: "EXCHANGE", refId: sale.id, createdById: req.user?.id,
          },
        });
      }
    }

    // 3) Calculate net difference: positive = customer pays, negative = store refunds
    const netDifference = totalNew - totalReturn;

    // Recalculate sale total + store pending exchange balance (settled in Caixa)
    const allItems = await prisma.saleItem.findMany({ where: { saleId: sale.id } });
    const newTotal = allItems.reduce((s, i) => s + Number(i.subtotal), 0);
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        total: newTotal,
        exchangeBalance: netDifference !== 0 ? netDifference : null,
      },
    });

    const updated = await loadFullSale(sale.id, tenantId);
    return sendOk(res, req, {
      sale: updated,
      totalReturn: Number(totalReturn.toFixed(2)),
      totalNew: Number(totalNew.toFixed(2)),
      netDifference: Number(netDifference.toFixed(2)),
      pendingSettlement: netDifference !== 0,
    });
  }));

  // â”€â”€â”€ SETTLE EXCHANGE (CAIXA) â”€â”€â”€
  router.post("/sales/:id/settle-exchange", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const sale = await prisma.sale.findFirst({ where: { id: req.params.id, tenantId } });
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda nÃ£o encontrada" } });
    if (sale.exchangeBalance === null || Number(sale.exchangeBalance) === 0) {
      return res.status(400).json({ error: { code: 400, message: "Nenhuma troca pendente para esta venda" } });
    }

    const session = await prisma.cashSession.findFirst({ where: { storeId: sale.storeId, closedAt: null } });
    if (!session) return res.status(400).json({ error: { code: 400, message: "Nenhuma sessÃ£o de caixa aberta" } });

    const amount = Number(sale.exchangeBalance);

    await prisma.cashMovement.create({
      data: {
        sessionId: session.id,
        type: amount > 0 ? "RECEBIMENTO" : "ESTORNO",
        amount: Math.abs(amount),
        reason: `Troca - Venda #${sale.number}`,
        refType: "EXCHANGE", refId: sale.id,
        createdById: req.user?.id,
      },
    });

    await prisma.sale.update({ where: { id: sale.id }, data: { exchangeBalance: null } });

    const updated = await loadFullSale(sale.id, tenantId);
    return sendOk(res, req, { sale: updated, settled: Math.abs(amount) });
  }));

  // â”€â”€â”€ CASH OPERATOR AUTH â”€â”€â”€
  // --- POS TRANSACTIONS (base integration) ---
  router.post("/pos/transactions", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const {
      saleId,
      method,
      amount,
      provider,
      status = "PENDING",
      transactionId,
      nsu,
      authorizationCode,
      cardBrand,
      rawPayload,
      paymentId,
    } = req.body || {};

    if (!saleId || !method || !amount || !provider) {
      return res.status(400).json({ error: { code: 400, message: "saleId, method, amount e provider obrigatorios" } });
    }

    const sale = await prisma.sale.findFirst({ where: { id: String(saleId), tenantId }, select: { id: true, storeId: true } });
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda nao encontrada" } });

    const currentStoreId = await resolveStoreId(req);
    if (!isAdmin(req) && currentStoreId && sale.storeId !== currentStoreId) {
      return res.status(403).json({ error: { code: 403, message: "Sem acesso a venda informada" } });
    }

    const trx = await prisma.posTransaction.create({
      data: {
        tenantId,
        saleId: sale.id,
        paymentId: paymentId ? String(paymentId) : null,
        provider: String(provider).trim().toUpperCase(),
        method,
        amount: Number(amount),
        status: String(status || "PENDING").trim().toUpperCase(),
        transactionId: transactionId ? String(transactionId) : null,
        nsu: nsu ? String(nsu) : null,
        authorizationCode: authorizationCode ? String(authorizationCode) : null,
        cardBrand: cardBrand ? String(cardBrand) : null,
        rawPayload: rawPayload ?? null,
      },
    });

    return sendOk(res, req, trx, 201);
  }));

  router.put("/pos/transactions/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const {
      status,
      transactionId,
      nsu,
      authorizationCode,
      cardBrand,
      rawPayload,
      paymentId,
    } = req.body || {};

    const existing = await prisma.posTransaction.findUnique({
      where: { id: req.params.id },
      include: { sale: { select: { tenantId: true, storeId: true } } },
    });
    if (!existing) return res.status(404).json({ error: { code: 404, message: "Transacao POS nao encontrada" } });
    if (existing.sale?.tenantId !== tenantId) {
      return res.status(404).json({ error: { code: 404, message: "Transacao POS nao encontrada" } });
    }

    const currentStoreId = await resolveStoreId(req);
    if (!isAdmin(req) && currentStoreId && existing.sale?.storeId !== currentStoreId) {
      return res.status(403).json({ error: { code: 403, message: "Sem acesso a transacao POS" } });
    }

    const data = {};
    if (status !== undefined) data.status = String(status || "").trim().toUpperCase();
    if (transactionId !== undefined) data.transactionId = transactionId ? String(transactionId) : null;
    if (nsu !== undefined) data.nsu = nsu ? String(nsu) : null;
    if (authorizationCode !== undefined) data.authorizationCode = authorizationCode ? String(authorizationCode) : null;
    if (cardBrand !== undefined) data.cardBrand = cardBrand ? String(cardBrand) : null;
    if (rawPayload !== undefined) data.rawPayload = rawPayload;
    if (paymentId !== undefined) data.paymentId = paymentId ? String(paymentId) : null;

    const trx = await prisma.posTransaction.update({
      where: { id: existing.id },
      data,
    });

    return sendOk(res, req, trx);
  }));

  router.get("/pos/transactions/:id", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const trx = await prisma.posTransaction.findUnique({
      where: { id: req.params.id },
      include: {
        sale: { select: { id: true, number: true, tenantId: true, storeId: true } },
        payment: { select: { id: true, method: true, amount: true, createdAt: true } },
      },
    });
    if (!trx) return res.status(404).json({ error: { code: 404, message: "Transacao POS nao encontrada" } });
    if (trx.sale?.tenantId !== tenantId) {
      return res.status(404).json({ error: { code: 404, message: "Transacao POS nao encontrada" } });
    }

    const currentStoreId = await resolveStoreId(req);
    if (!isAdmin(req) && currentStoreId && trx.sale?.storeId !== currentStoreId) {
      return res.status(403).json({ error: { code: 403, message: "Sem acesso a transacao POS" } });
    }

    return sendOk(res, req, trx);
  }));

  router.post("/cash/operator-auth", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const bcrypt = require("bcryptjs");
    const { matricula, password } = req.body;
    if (!matricula || !password) return res.status(400).json({ error: { code: 400, message: "MatrÃ­cula e senha obrigatÃ³rios" } });

    // Hard-coded master operator: 00000 / 00000
    if (matricula === "00000" && password === "00000") {
      return sendOk(res, req, { id: req.user?.id || "master", name: "Operador Master", matricula: "00000" });
    }

    // Matricula is sequential (0001, 0002, ...) based on user creation order
    const users = await prisma.user.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, passwordHash: true } });
    const idx = parseInt(matricula, 10) - 1;
    if (idx < 0 || idx >= users.length) return res.status(401).json({ error: { code: 401, message: "MatrÃ­cula invÃ¡lida" } });

    const user = users[idx];
    const valid = password === "0000" || await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: { code: 401, message: "Senha incorreta" } });

    return sendOk(res, req, { id: user.id, name: user.name, matricula: String(idx + 1).padStart(4, "0") });
  }));

  // â”€â”€â”€ CASH SESSIONS â”€â”€â”€
  router.get("/cash/sessions/current", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    if (!storeId) return sendOk(res, req, null);

    const session = await prisma.cashSession.findFirst({
      where: { tenantId, storeId, closedAt: null },
      include: { openedBy: { select: { name: true } }, movements: { orderBy: { createdAt: "desc" } } },
    });

    return sendOk(res, req, session);
  }));

  router.post("/cash/sessions/open", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    if (!storeId) return res.status(400).json({ error: { code: 400, message: "storeId nÃ£o definido" } });

    const existing = await prisma.cashSession.findFirst({ where: { tenantId, storeId, closedAt: null } });
    if (existing) return res.status(400).json({ error: { code: 400, message: "JÃ¡ existe sessÃ£o aberta para esta loja" } });

    const { initialCash } = req.body;
    const session = await prisma.cashSession.create({
      data: { tenantId, storeId, openedById: req.user?.id, initialCash: Number(initialCash || 0) },
    });

    return sendOk(res, req, session, 201);
  }));

  router.post("/cash/sessions/:id/close", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const { countedCash, note } = req.body;
    const session = await prisma.cashSession.findFirst({
      where: { id: req.params.id, tenantId },
      include: { movements: true },
    });

    if (!session) return res.status(404).json({ error: { code: 404, message: "SessÃ£o nÃ£o encontrada" } });
    if (session.closedAt) return res.status(400).json({ error: { code: 400, message: "SessÃ£o jÃ¡ fechada" } });

    // Calculate expected cash
    let expected = Number(session.initialCash);
    for (const m of session.movements) {
      const amount = Number(m.amount);
      if (m.type === "RECEBIMENTO" && m.method === "DINHEIRO") expected += amount;
      else if (m.type === "SUPRIMENTO") expected += amount;
      else if (m.type === "SANGRIA") expected -= amount;
      else if (m.type === "ESTORNO" && m.method === "DINHEIRO") expected -= amount;
    }

    const counted = Number(countedCash || 0);
    const divergence = Number((counted - expected).toFixed(2));

    const updated = await prisma.cashSession.update({
      where: { id: session.id },
      data: { closedAt: new Date(), closedById: req.user?.id, finalCash: counted, note: note || null },
    });

    return sendOk(res, req, { ...updated, expected: Number(expected.toFixed(2)), divergence });
  }));

  router.post("/cash/movements", asyncHandler(async (req, res) => {
    const tenantId = await resolveTenantId(req);
    const storeId = await resolveStoreId(req);
    const session = await prisma.cashSession.findFirst({ where: { tenantId, storeId, closedAt: null } });
    if (!session) return res.status(400).json({ error: { code: 400, message: "Nenhuma sessÃ£o aberta" } });

    const { type, amount, reason, method } = req.body;
    if (!type || !amount) return res.status(400).json({ error: { code: 400, message: "type e amount obrigatÃ³rios" } });
    if ((type === "SANGRIA" || type === "AJUSTE") && !reason) {
      return res.status(400).json({ error: { code: 400, message: "Motivo obrigatÃ³rio para sangria/ajuste" } });
    }

    const movement = await prisma.cashMovement.create({
      data: {
        sessionId: session.id, type, method: method || "DINHEIRO",
        amount: Number(amount), reason: reason || null, createdById: req.user?.id,
      },
    });

    return sendOk(res, req, movement, 201);
  }));

  // â”€â”€â”€ REPORTS â”€â”€â”€
  router.get("/reports/cash-closings", asyncHandler(async (req, res) => {
    await assertFeature(req, "reportsCashClosings", "Relatorio de fechamento de caixa indisponivel no plano atual");
    const tenantId = await resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "Licenciado nao identificado" } });
    const storeId = await resolveStoreId(req);
    const { from, to, page = 1, limit = 20 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = { tenantId, closedAt: { not: null } };
    if (storeId) where.storeId = storeId;
    if (from || to) {
      where.closedAt = {};
      if (from) where.closedAt.gte = safeDate(from);
      if (to) { const d = safeDate(to); d.setHours(23, 59, 59, 999); where.closedAt.lte = d; }
    }

    const [sessions, total] = await Promise.all([
      prisma.cashSession.findMany({
        where, skip, take,
        include: {
          openedBy: { select: { name: true } },
          closedBy: { select: { name: true } },
          movements: true,
          store: { select: { name: true } },
        },
        orderBy: { closedAt: "desc" },
      }),
      prisma.cashSession.count({ where }),
    ]);

    const closings = sessions.map((s) => {
      const movs = s.movements || [];
      const totalRecebido = movs.filter((m) => m.type === "RECEBIMENTO").reduce((sum, m) => sum + Number(m.amount), 0);
      const totalSangria = movs.filter((m) => m.type === "SANGRIA").reduce((sum, m) => sum + Number(m.amount), 0);
      const totalSuprimento = movs.filter((m) => m.type === "SUPRIMENTO").reduce((sum, m) => sum + Number(m.amount), 0);
      const expected = Number(s.initialCash) + totalRecebido + totalSuprimento - totalSangria;

      // Payment method breakdown
      const byMethod = {};
      for (const m of movs.filter((m) => m.type === "RECEBIMENTO")) {
        const key = m.method || "OUTROS";
        byMethod[key] = (byMethod[key] || 0) + Number(m.amount);
      }

      return {
        id: s.id,
        store: s.store?.name,
        openedBy: s.openedBy?.name,
        closedBy: s.closedBy?.name,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        initialCash: Number(s.initialCash),
        finalCash: s.finalCash ? Number(s.finalCash) : null,
        expected: Number(expected.toFixed(2)),
        divergence: s.finalCash ? Number((Number(s.finalCash) - expected).toFixed(2)) : null,
        totalRecebido: Number(totalRecebido.toFixed(2)),
        totalSangria: Number(totalSangria.toFixed(2)),
        totalSuprimento: Number(totalSuprimento.toFixed(2)),
        byMethod,
        movementsCount: movs.length,
        note: s.note,
      };
    });

    return sendOk(res, req, { closings, totalPages: Math.ceil(total / take) || 1, page: Number(page), total });
  }));

  router.get("/reports/sales", asyncHandler(async (req, res) => {
    await assertFeature(req, "reportsSales", "Relatorio de vendas indisponivel no plano atual");
    const tenantId = await resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "Licenciado nao identificado" } });
    const storeId = await resolveStoreId(req);
    const { from, to, status, sellerId, customerId, page = 1, limit = 30 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = { tenantId };
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (sellerId) where.sellerId = sellerId;
    if (customerId) where.customerId = customerId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = safeDate(from);
      if (to) { const d = safeDate(to); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
    }

    const [sales, total, agg] = await Promise.all([
      prisma.sale.findMany({
        where, skip, take,
        include: {
          customer: { select: { name: true, document: true } },
          seller: { select: { name: true } },
          payments: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where, _sum: { total: true }, _count: { id: true } }),
    ]);

    // Method breakdown from payments
    const allPayments = await prisma.payment.findMany({
      where: { sale: where },
      select: { method: true, amount: true },
    });
    const byMethod = {};
    for (const p of allPayments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    }

    return sendOk(res, req, {
      sales: sales.map((s) => ({
        id: s.id,
        number: s.number,
        status: s.status,
        total: Number(s.total),
        discount: Number(s.discount),
        customer: s.customer,
        seller: s.seller?.name,
        itemsCount: s._count.items,
        paymentMethod: s.payments?.[0]?.method || null,
        createdAt: s.createdAt,
      })),
      summary: {
        totalSales: Number(agg._count.id),
        totalRevenue: Number(agg._sum?.total || 0),
        byMethod,
      },
      totalPages: Math.ceil(total / take) || 1,
      page: Number(page),
      total,
    });
  }));

  router.get("/reports/sample-pdf", asyncHandler(async (req, res) => {
    const reportName = String(req.query.reportName || "Relatorio de Amostra");
    const emittedBy = req.user?.name || "Usuario";
    const branding = await getTenantBranding(req);
    const pdfBuf = await makeReportSamplePdfBuffer({
      reportName,
      emittedBy,
      systemName: branding.systemName,
      contractorLine: branding.contractorLine,
      logoDataUrl: branding.logoDataUrl,
      emittedAt: new Date(),
    });

    const safeName = reportName.replace(/[^a-zA-Z0-9_-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=\"${safeName || "relatorio"}-amostra.pdf\"`);
    return res.status(200).send(pdfBuf);
  }));

  router.get("/reports/export-pdf", asyncHandler(async (req, res) => {
    const type = String(req.query.type || "vendas");
    if (type === "vendas") await assertFeature(req, "reportsSales", "Relatorio de vendas indisponivel no plano atual");
    if (type === "caixa") await assertFeature(req, "reportsCashClosings", "Relatorio de fechamento de caixa indisponivel no plano atual");
    if (type === "transferencias") await assertFeature(req, "reportsTransfers", "Relatorio de transferencias indisponivel no plano atual");
    const tenantId = await resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: { code: 400, message: "Licenciado nao identificado" } });
    const from = req.query.from ? safeDate(req.query.from) : null;
    const to = req.query.to ? safeDate(req.query.to) : null;
    if (to) to.setHours(23, 59, 59, 999);

    const emittedBy = req.user?.name || "Usuario";
    const branding = await getTenantBranding(req);
    const money = (v) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
    const dateTime = (v) => {
      const d = v ? new Date(v) : null;
      if (!d || Number.isNaN(d.getTime())) return "-";
      return d.toLocaleString("pt-BR");
    };

    let reportName = "Relatorio";
    let sections = [];

    if (type === "caixa") {
      reportName = "Relatorio de Fechamentos de Caixa";
      const storeId = await resolveStoreId(req);
      const where = { tenantId, closedAt: { not: null } };
      if (storeId) where.storeId = storeId;
      if (from || to) {
        where.closedAt = {};
        if (from) where.closedAt.gte = from;
        if (to) where.closedAt.lte = to;
      }

      const sessions = await prisma.cashSession.findMany({
        where,
        include: {
          openedBy: { select: { name: true } },
          closedBy: { select: { name: true } },
          movements: true,
          store: { select: { name: true } },
        },
        orderBy: { closedAt: "desc" },
        take: 500,
      });

      const lines = sessions.map((s) => {
        const movs = s.movements || [];
        const recebido = movs.filter((m) => m.type === "RECEBIMENTO").reduce((sum, m) => sum + Number(m.amount), 0);
        const sangria = movs.filter((m) => m.type === "SANGRIA").reduce((sum, m) => sum + Number(m.amount), 0);
        const suprimento = movs.filter((m) => m.type === "SUPRIMENTO").reduce((sum, m) => sum + Number(m.amount), 0);
        const expected = Number(s.initialCash) + recebido + suprimento - sangria;
        const divergence = s.finalCash ? Number((Number(s.finalCash) - expected).toFixed(2)) : 0;
        return `${s.store?.name || "-"} | Abertura: ${dateTime(s.openedAt)} | Fechamento: ${dateTime(s.closedAt)} | Esperado: ${money(expected)} | Final: ${money(s.finalCash)} | Divergencia: ${money(divergence)}`;
      });

      sections = [
        { title: "Filtros", lines: [`Periodo: ${from ? dateTime(from) : "-"} ate ${to ? dateTime(to) : "-"}`] },
        { title: `Registros (${sessions.length})`, lines: lines.length > 0 ? lines : ["Nenhum fechamento encontrado."] },
      ];
    } else if (type === "transferencias") {
      reportName = "Relatorio de Transferencias";
      const tenantId = await resolveTenantId(req);
      const allowedStoreIds = await getUserStoreIds(req);
      const andWhere = [
        { tenantId },
        {
          OR: [
            { originStoreId: { in: allowedStoreIds } },
            { destinationStoreId: { in: allowedStoreIds } },
          ],
        },
      ];

      const originStoreId = req.query.originStoreId ? String(req.query.originStoreId) : "";
      const destinationStoreId = req.query.destinationStoreId ? String(req.query.destinationStoreId) : "";
      const requesterId = req.query.requesterId ? String(req.query.requesterId) : "";
      const senderId = req.query.senderId ? String(req.query.senderId) : "";
      const item = req.query.item ? String(req.query.item) : "";
      if (originStoreId) andWhere.push({ originStoreId });
      if (destinationStoreId) andWhere.push({ destinationStoreId });
      if (requesterId) andWhere.push({ createdById: requesterId });
      if (senderId) {
        andWhere.push({
          movements: {
            some: {
              type: "TRANSFER_OUT",
              createdById: senderId,
            },
          },
        });
      }
      if (from || to) {
        const createdAt = {};
        if (from) createdAt.gte = from;
        if (to) createdAt.lte = to;
        andWhere.push({ createdAt });
      }
      if (item) {
        andWhere.push({
          items: {
            some: {
              product: {
                OR: [
                  { name: { contains: item, mode: "insensitive" } },
                  { ean: { contains: item } },
                ],
              },
            },
          },
        });
      }

      const transfers = await prisma.stockTransfer.findMany({
        where: { AND: andWhere },
        include: {
          originStore: { select: { name: true } },
          destinationStore: { select: { name: true } },
          createdBy: { select: { name: true } },
          movements: {
            where: { type: "TRANSFER_OUT" },
            select: {
              quantity: true,
              productId: true,
              createdBy: { select: { name: true } },
            },
          },
          items: {
            select: {
              quantity: true,
              productId: true,
              product: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      const [originStore, destinationStore, requesterUser, senderUser] = await Promise.all([
        originStoreId ? prisma.store.findFirst({ where: { id: originStoreId, tenantId }, select: { name: true } }) : Promise.resolve(null),
        destinationStoreId ? prisma.store.findFirst({ where: { id: destinationStoreId, tenantId }, select: { name: true } }) : Promise.resolve(null),
        requesterId ? prisma.user.findFirst({ where: { id: requesterId, tenantId }, select: { name: true } }) : Promise.resolve(null),
        senderId ? prisma.user.findFirst({ where: { id: senderId, tenantId }, select: { name: true } }) : Promise.resolve(null),
      ]);

      const dateOnly = (v) => {
        const d = v ? new Date(v) : null;
        if (!d || Number.isNaN(d.getTime())) return "-";
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      };
      const transferStatusPt = (status) => {
        const map = {
          DRAFT: "Rascunho",
          SENT: "Enviado",
          RECEIVED: "Recebido",
          CANCELED: "Cancelado",
        };
        return map[String(status || "").toUpperCase()] || String(status || "-");
      };
      const truncate = (v, max = 24) => {
        const s = String(v || "-");
        if (s.length <= max) return s;
        return `${s.slice(0, Math.max(0, max - 1))}â€¦`;
      };

      const pdfBuf = await makeReportCustomPdfBuffer({
        reportName,
        emittedBy,
        systemName: branding.systemName,
        contractorLine: branding.contractorLine,
        logoDataUrl: branding.logoDataUrl,
        emittedAt: new Date(),
        render: (doc, layout) => {
          const { left, right, contentTop, contentBottom } = layout;
          const pageLeft = Math.max(20, left - 20);
          const pageRight = Math.min(doc.page.width - 20, right + 20);
          let y = contentTop;

          const ensureSpace = (needed) => {
            if (y + needed <= contentBottom) return;
            doc.addPage();
            y = contentTop;
          };

          const filterLines = [];
          if (from || to) {
            filterLines.push(`Periodo: ${dateOnly(from)} a ${dateOnly(to)} (00:00:00 ate 23:59:59)`);
          }
          if (originStore?.name) filterLines.push(`Origem: ${originStore.name}`);
          if (destinationStore?.name) filterLines.push(`Destino: ${destinationStore.name}`);
          if (requesterUser?.name) filterLines.push(`Solicitante: ${requesterUser.name}`);
          if (senderUser?.name) filterLines.push(`Remetente: ${senderUser.name}`);
          if (item) filterLines.push(`Item: ${item}`);
          if (filterLines.length === 0) filterLines.push("Sem filtros adicionais.");

          ensureSpace(14 + (filterLines.length * 12) + 8);
          doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text("Filtros", pageLeft, y);
          y += 14;
          doc.font("Helvetica").fontSize(9.5).fillColor("#111827");
          for (const line of filterLines) {
            doc.text(line, pageLeft, y, { width: pageRight - pageLeft, align: "left" });
            y += 12;
          }
          y += 8;

          const cols = [
            { key: "date", label: "Data", width: 56, align: "left" },
            { key: "origin", label: "Origem", width: 66, align: "left" },
            { key: "destination", label: "Destino", width: 66, align: "left" },
            { key: "requester", label: "Solicitante", width: 70, align: "left" },
            { key: "sender", label: "Remetente", width: 70, align: "left" },
            { key: "requested", label: "Qtd Pedida", width: 52, align: "right" },
            { key: "sent", label: "Qtd Enviada", width: 56, align: "right" },
            { key: "status", label: "Status", width: 54, align: "left" },
          ];
          const itemIndent = 24;
          const itemCols = [
            { key: "item", label: "Item", width: 280, align: "left" },
            { key: "requested", label: "Qtd Pedida", width: 90, align: "right" },
            { key: "sent", label: "Qtd Enviada", width: 90, align: "right" },
          ];

          for (const t of transfers) {
            const requested = (t.items || []).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
            const sent = (t.movements || []).reduce((sum, m) => sum + Number(m.quantity || 0), 0);
            const senderName = (t.movements || []).find((m) => m.createdBy?.name)?.createdBy?.name || "-";

            const byProduct = {};
            for (const it of t.items || []) {
              if (!byProduct[it.productId]) {
                byProduct[it.productId] = {
                  item: it.product?.name || "Item",
                  requestedQty: 0,
                  sentQty: 0,
                };
              }
              byProduct[it.productId].requestedQty += Number(it.quantity || 0);
            }
            for (const mv of t.movements || []) {
              if (!byProduct[mv.productId]) {
                byProduct[mv.productId] = {
                  item: "Item",
                  requestedQty: 0,
                  sentQty: 0,
                };
              }
              byProduct[mv.productId].sentQty += Number(mv.quantity || 0);
            }
            const rows = Object.values(byProduct);
            const blockHeight = 13 + 13 + 12 + Math.max(1, rows.length) * 12 + 10;
            ensureSpace(blockHeight);

            let x = pageLeft;
            doc.font("Helvetica-Bold").fontSize(8.2).fillColor("#111827");
            for (const c of cols) {
              doc.text(c.label, x, y, { width: c.width, align: c.align });
              x += c.width;
            }
            y += 13;

            const values = {
              date: dateOnly(t.createdAt),
              origin: truncate(t.originStore?.name || "-", 18),
              destination: truncate(t.destinationStore?.name || "-", 18),
              requester: truncate(t.createdBy?.name || "-", 18),
              sender: truncate(senderName, 18),
              requested: String(requested),
              sent: String(sent),
              status: transferStatusPt(t.status),
            };
            x = pageLeft;
            doc.font("Helvetica").fontSize(8.4).fillColor("#111827");
            for (const c of cols) {
              doc.text(values[c.key], x, y, { width: c.width, align: c.align });
              x += c.width;
            }
            y += 13;

            x = pageLeft + itemIndent;
            doc.font("Helvetica-Bold").fontSize(8.1).fillColor("#374151");
            for (const c of itemCols) {
              doc.text(c.label, x, y, { width: c.width, align: c.align });
              x += c.width;
            }
            y += 12;

            doc.font("Helvetica").fontSize(8.4).fillColor("#111827");
            if (rows.length === 0) {
              x = pageLeft + itemIndent;
              doc.text("-", x, y, { width: itemCols[0].width, align: "left" });
              doc.text("0", x + itemCols[0].width, y, { width: itemCols[1].width, align: "right" });
              doc.text("0", x + itemCols[0].width + itemCols[1].width, y, { width: itemCols[2].width, align: "right" });
              y += 12;
            } else {
              for (const r of rows) {
                x = pageLeft + itemIndent;
                doc.text(truncate(r.item, 58), x, y, { width: itemCols[0].width, align: "left" });
                doc.text(String(r.requestedQty), x + itemCols[0].width, y, { width: itemCols[1].width, align: "right" });
                doc.text(String(r.sentQty), x + itemCols[0].width + itemCols[1].width, y, { width: itemCols[2].width, align: "right" });
                y += 12;
              }
            }
            doc.moveTo(pageLeft, y + 2).lineTo(pageRight, y + 2).lineWidth(0.6).strokeColor("#d1d5db").stroke();
            y += 10;
          }

          if (transfers.length === 0) {
            ensureSpace(16);
            doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text("Nenhuma transferencia encontrada.", pageLeft, y);
          }
        },
      });

      const safeName = reportName.replace(/[^a-zA-Z0-9_-]+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=\"${safeName || "relatorio"}.pdf\"`);
      return res.status(200).send(pdfBuf);
    } else {
      reportName = "Relatorio de Vendas";
      const storeId = await resolveStoreId(req);
      const where = { tenantId, status: "PAID" };
      if (storeId) where.storeId = storeId;
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = from;
        if (to) where.createdAt.lte = to;
      }

      const sales = await prisma.sale.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          payments: { select: { method: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });

      const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
      const lines = sales.map((s) =>
        `#${s.number} | ${dateTime(s.createdAt)} | Cliente: ${s.customer?.name || "-"} | Total: ${money(s.total)} | Pagto: ${s.payments?.[0]?.method || "-"}`,
      );

      sections = [
        { title: "Resumo", lines: [`Total de vendas: ${sales.length}`, `Receita total: ${money(totalRevenue)}`] },
        { title: "Registros", lines: lines.length > 0 ? lines : ["Nenhuma venda encontrada."] },
      ];
    }

    const pdfBuf = await makeReportLinesPdfBuffer({
      reportName,
      emittedBy,
      sections,
      systemName: branding.systemName,
      contractorLine: branding.contractorLine,
      logoDataUrl: branding.logoDataUrl,
      emittedAt: new Date(),
    });

    const safeName = reportName.replace(/[^a-zA-Z0-9_-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${safeName || "relatorio"}.pdf\"`);
    return res.status(200).send(pdfBuf);
  }));

  router.get("/reports/transfers", asyncHandler(async (req, res) => {
    await assertFeature(req, "reportsTransfers", "Relatorio de transferencias indisponivel no plano atual");
    const tenantId = await resolveTenantId(req);
    const {
      originStoreId,
      destinationStoreId,
      from,
      to,
      requesterId,
      senderId,
      item,
      page = 1,
      limit = 20,
    } = req.query;

    const take = Number(limit) || 20;
    const skip = (Number(page) - 1) * take;
    const allowedStoreIds = await getUserStoreIds(req);
    if (allowedStoreIds.length === 0) {
      return sendOk(res, req, {
        transfers: [],
        summary: { totalTransfers: 0, totalRequested: 0, totalSent: 0 },
        filters: { stores: [], users: [] },
        totalPages: 1,
        page: Number(page),
        total: 0,
      });
    }

    const andWhere = [
      { tenantId },
      {
        OR: [
          { originStoreId: { in: allowedStoreIds } },
          { destinationStoreId: { in: allowedStoreIds } },
        ],
      },
    ];

    if (originStoreId) andWhere.push({ originStoreId });
    if (destinationStoreId) andWhere.push({ destinationStoreId });
    if (requesterId) andWhere.push({ createdById: requesterId });
    if (senderId) {
      andWhere.push({
        movements: {
          some: {
            type: "TRANSFER_OUT",
            createdById: senderId,
          },
        },
      });
    }
    if (from || to) {
      const createdAt = {};
      if (from) createdAt.gte = safeDate(from);
      if (to) { const d = safeDate(to); d.setHours(23, 59, 59, 999); createdAt.lte = d; }
      andWhere.push({ createdAt });
    }
    if (item) {
      andWhere.push({
        items: {
          some: {
            product: {
              OR: [
                { name: { contains: String(item), mode: "insensitive" } },
                { ean: { contains: String(item) } },
              ],
            },
          },
        },
      });
    }

    const where = { AND: andWhere };

    const [rows, total, stores, users] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        skip,
        take,
        include: {
          originStore: { select: { id: true, name: true } },
          destinationStore: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          receivedBy: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, name: true, ean: true } } } },
          movements: {
            where: { type: "TRANSFER_OUT" },
            include: {
              createdBy: { select: { id: true, name: true } },
              product: { select: { id: true, name: true, ean: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.stockTransfer.count({ where }),
      prisma.store.findMany({
        where: { id: { in: allowedStoreIds }, tenantId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: { tenantId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    let totalRequested = 0;
    let totalSent = 0;
    const transfers = rows.map((t) => {
      const requestedByProduct = {};
      for (const it of t.items || []) {
        const pid = it.productId;
        if (!requestedByProduct[pid]) {
          requestedByProduct[pid] = {
            productId: pid,
            productName: it.product?.name || "Produto",
            ean: it.product?.ean || null,
            requestedQty: 0,
            sentQty: 0,
          };
        }
        requestedByProduct[pid].requestedQty += Number(it.quantity || 0);
      }
      for (const mv of t.movements || []) {
        const pid = mv.productId;
        if (!requestedByProduct[pid]) {
          requestedByProduct[pid] = {
            productId: pid,
            productName: mv.product?.name || "Produto",
            ean: mv.product?.ean || null,
            requestedQty: 0,
            sentQty: 0,
          };
        }
        requestedByProduct[pid].sentQty += Number(mv.quantity || 0);
      }
      const itemsSummary = Object.values(requestedByProduct).sort((a, b) => a.productName.localeCompare(b.productName));
      const requestedQty = itemsSummary.reduce((s, it) => s + Number(it.requestedQty || 0), 0);
      const sentQty = itemsSummary.reduce((s, it) => s + Number(it.sentQty || 0), 0);
      totalRequested += requestedQty;
      totalSent += sentQty;
      const sender = (t.movements || []).find((m) => m.createdBy)?.createdBy || null;
      return {
        id: t.id,
        status: t.status,
        createdAt: t.createdAt,
        sentAt: t.sentAt,
        receivedAt: t.receivedAt,
        originStore: t.originStore,
        destinationStore: t.destinationStore,
        requester: t.createdBy,
        sender,
        receiver: t.receivedBy,
        requestedQty,
        sentQty,
        items: itemsSummary,
      };
    });

    return sendOk(res, req, {
      transfers,
      summary: {
        totalTransfers: Number(total || 0),
        totalRequested: Number(totalRequested || 0),
        totalSent: Number(totalSent || 0),
      },
      filters: {
        stores,
        users,
      },
      totalPages: Math.ceil(total / take) || 1,
      page: Number(page),
      total,
    });
  }));

  return router;
}

module.exports = { buildApiRoutes };
