import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { cnpjMask, phoneMask, cpfMask, cpfCnpjMask, validateCPFOrCNPJ, whatsappMask, formatDate, moneyMask, parseMoney } from "../lib/format";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import Table from "../components/ui/Table";
import EmptyState from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import OnboardingLicencaWizard from "../components/licensing/OnboardingLicencaWizard";
import { Settings, Store, Shield, Plus, Pencil, Users, UserCheck } from "lucide-react";

const TABS = [
  { key: "lojas", label: "Lojas", icon: Store },
  { key: "usuarios", label: "Usuários", icon: Users },
  { key: "clientes", label: "Clientes", icon: UserCheck },
  { key: "licenciamento", label: "Licenciamento", icon: Settings },
  { key: "permissoes", label: "Permissões", icon: Shield },
];

const TYPE_LABELS = { CENTRAL: "Central (Depósito)", LOJA: "Loja" };
const ROLE_COLORS = { ADMIN: "purple", CAIXA: "blue", VENDEDOR: "green", FARMACUTICO: "yellow" };
const ROLE_LABELS = { ADMIN: "Administrador", CAIXA: "Caixa", VENDEDOR: "Vendedor", FARMACEUTICO: "Farmacêutico" };

const emptyStoreForm = { name: "", type: "LOJA", cnpj: "", phone: "", email: "", street: "", number: "", complement: "", district: "", city: "", state: "", zipCode: "" };
const emptyUserForm = { name: "", email: "", password: "", passwordConfirm: "", roleName: "VENDEDOR", storeIds: [] };
const emptyCustomerForm = { name: "", document: "", birthDate: "", whatsapp: "", phone: "", email: "" };

const PERMISSIONS = [
  { key: "users.manage", label: "Gerenciar usuários" },
  { key: "stores.manage", label: "Gerenciar lojas" },
  { key: "products.manage", label: "Gerenciar produtos" },
  { key: "inventory.receive", label: "Receber estoque" },
  { key: "inventory.adjust", label: "Ajustar estoque" },
  { key: "sales.create", label: "Criar vendas" },
  { key: "sales.cancel", label: "Cancelar vendas" },
  { key: "cash.open", label: "Abrir caixa" },
  { key: "cash.close", label: "Fechar caixa" },
  { key: "cash.refund", label: "Estornar" },
  { key: "reports.view", label: "Ver relatórios" },
];

const ROLES = [
  { name: "ADMIN", perms: PERMISSIONS.map((p) => p.key) },
  { name: "CAIXA", perms: ["cash.open", "cash.close", "cash.refund", "sales.cancel", "reports.view"] },
  { name: "VENDEDOR", perms: ["sales.create", "sales.cancel", "reports.view"] },
  { name: "FARMACEUTICO", perms: ["products.manage", "inventory.receive", "inventory.adjust", "sales.create", "cash.open", "cash.close", "cash.refund", "reports.view"] },
];

const STATUS_LABELS = {
  TRIAL: "Teste",
  ACTIVE: "Ativa",
  GRACE: "Carência",
  SUSPENDED: "Suspensa",
  EXPIRED: "Expirada",
  CANCELED: "Cancelada",
};

const PAYMENT_STATUS_LABELS = {
  PENDING: "Pendente",
  PAID: "Pago",
  OVERDUE: "Em atraso",
};

const ALERT_TYPE_LABELS = {
  DUE_DAYS_BEFORE_PRIMARY: "Aviso antecipado (X dias)",
  DUE_DAYS_BEFORE_SECONDARY: "Aviso antecipado (Y dias)",
  DUE_EVE: "Véspera do vencimento",
  DUE_TODAY: "Vencimento hoje",
  PAYMENT_RECEIVED: "Pagamento recebido",
  THREE_BUSINESS_DAYS_OVERDUE: "3 dias úteis em atraso",
  THREE_DAYS_AFTER_OVERDUE_WARNING: "3 dias após aviso de atraso",
  SERVICE_SUSPENDED: "Serviço suspenso",
};

const PERFIL_LABELS = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  CAIXA: "Caixa",
  FARMACEUTICO: "Farmacêutico",
};

const MODULO_LABELS = {
  dashboard: "Dashboard",
  sales: "Vendas",
  cash: "Caixa",
  inventory: "Estoque",
  inventoryTransfers: "Transferências de estoque",
  inventoryReservations: "Reservas de estoque",
  products: "Produtos",
  chat: "Chat",
  config: "Configurações",
  reportsSales: "Relatórios de vendas",
  reportsCashClosings: "Relatórios de caixa",
  reportsTransfers: "Relatórios de transferências",
};

const LICENSE_FEATURE_KEYS = Object.keys(MODULO_LABELS);

const LICENSE_REQUEST_STATUS = {
  PENDING_MASTER_REVIEW: "Pendente do Desenvolvedor",
  PENDING_CONTRACTOR_APPROVAL: "Pendente do Contratante",
  APPLIED: "Aplicada",
  REJECTED: "Rejeitada",
  CANCELED: "Cancelada",
};

const DASHBOARD_MODE_LABELS = {
  SIMPLIFIED: "Simplificado",
  FULL: "Completo",
};

const USER_ROLE_ORDER = ["ADMIN", "VENDEDOR", "CAIXA", "FARMACEUTICO"];

const IMPORT_TABLE_OPTIONS = [
  { key: "stores", label: "Lojas", columns: "name;type;active;isDefault;cnpj;phone;email;street;number;complement;district;city;state;zipCode" },
  { key: "categories", label: "Categorias", columns: "name;active" },
  { key: "products", label: "Produtos", columns: "name;ean;active;requiresPrescription;controlled;defaultMarkup;categoryName;basePrice" },
  { key: "customers", label: "Clientes", columns: "name;document;birthDate;whatsapp;phone;email" },
];

export default function Config() {
  const { user, isLicenseActive, refreshSession } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState("lojas");
  const [loading, setLoading] = useState(true);

  // Stores
  const [stores, setStores] = useState([]);
  const [storeModal, setStoreModal] = useState(false);
  const [storeForm, setStoreForm] = useState(emptyStoreForm);
  const [storeEditId, setStoreEditId] = useState(null);

  // Users
  const [users, setUsers] = useState([]);
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [userEditId, setUserEditId] = useState(null);

  // Customers
  const [customers, setCustomers] = useState([]);
  const [customerModal, setCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [customerEditId, setCustomerEditId] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [licenseData, setLicenseData] = useState(null);
  const [licenseForm, setLicenseForm] = useState({ planCode: "MINIMO", status: "ACTIVE", endsAt: "", reason: "" });
  const [contractorForm, setContractorForm] = useState({
    document: "",
    nameOrCompany: "",
    tradeName: "",
    addressFull: "",
    zipCode: "",
    phoneWhatsapp: "",
    email: "",
    logoFile: "",
  });
  const [licenciamentoView, setLicenciamentoView] = useState("CONTRATANTES");
  const contractorLogoInputRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const adminLicenseLocked = user?.role === "ADMIN" && !isLicenseActive;
  const [licensesList, setLicensesList] = useState([]);
  const [licensesLoading, setLicensesLoading] = useState(false);
  const [selectedLicenseId, setSelectedLicenseId] = useState("");
  const [cleanupTarget, setCleanupTarget] = useState(null);
  const [cleanupConfirm, setCleanupConfirm] = useState("");
  const [cleanupSubmitting, setCleanupSubmitting] = useState(false);
  const [myLicenseRequests, setMyLicenseRequests] = useState([]);
  const [adminLicenseRequests, setAdminLicenseRequests] = useState([]);
  const [requestForm, setRequestForm] = useState({ ADMIN: 1, VENDEDOR: 1, CAIXA: 1, FARMACEUTICO: 1, note: "" });
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [selectedAdminRequestId, setSelectedAdminRequestId] = useState("");
  const [adminProposalForm, setAdminProposalForm] = useState({
    ADMIN: 1,
    VENDEDOR: 1,
    CAIXA: 1,
    FARMACEUTICO: 1,
    monthlyPriceCents: "",
    annualPriceCents: "",
    extrasDescription: "",
    note: "",
  });
  const [adminReviewSubmitting, setAdminReviewSubmitting] = useState(false);
  const [licensePlans, setLicensePlans] = useState([]);
  const [planForm, setPlanForm] = useState({
    code: "NOVO_PLANO",
    name: "",
    currency: "BRL",
    monthlyPriceCents: "",
    annualPriceCents: "",
    dashboardMode: "FULL",
    maxActiveUsers: "",
    maxActiveStores: "",
    roleAdmin: "",
    roleVendedor: "",
    roleCaixa: "",
    roleFarmaceutico: "",
    active: true,
    features: LICENSE_FEATURE_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {}),
  });
  const [planEditingCode, setPlanEditingCode] = useState("");
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [copyPlanCode, setCopyPlanCode] = useState("");
  const [importSelections, setImportSelections] = useState({});
  const [importValidation, setImportValidation] = useState([]);
  const [importValidating, setImportValidating] = useState(false);
  const [importExecuting, setImportExecuting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [exportSelections, setExportSelections] = useState({});
  const [exportExecuting, setExportExecuting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [licensePayments, setLicensePayments] = useState([]);
  const [licenseAlerts, setLicenseAlerts] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [markingPaymentId, setMarkingPaymentId] = useState("");
  const planosLicenciamentoMode = licenciamentoView === "PLANOS";

  // Load data based on tab
  useEffect(() => {
    if (adminLicenseLocked && tab !== "licenciamento") {
      setTab("licenciamento");
      return;
    }
    setLoading(true);
    if (tab === "lojas") {
      apiFetch("/api/stores?all=true").then((res) => setStores(res.data || [])).catch((err) => addToast(err.message, "error")).finally(() => setLoading(false));
    } else if (tab === "usuarios") {
      Promise.all([
        apiFetch("/api/users"),
        apiFetch("/api/stores?all=true"),
      ])
        .then(([usersRes, storesRes]) => {
          setUsers(usersRes.data || []);
          setStores(storesRes.data || []);
        })
        .catch((err) => addToast(err.message, "error"))
        .finally(() => setLoading(false));
    } else if (tab === "clientes") {
      loadCustomers();
    } else if (tab === "licenciamento") {
      Promise.all([
        apiFetch("/api/license/me"),
        canManageLicense ? apiFetch("/api/license/admin/licenses").catch(() => ({ data: { licenses: [] } })) : Promise.resolve({ data: { licenses: [] } }),
        canManageLicense ? apiFetch("/api/license/me/change-requests").catch(() => ({ data: { requests: [] } })) : Promise.resolve({ data: { requests: [] } }),
        canManageLicense ? apiFetch("/api/license/admin/change-requests").catch(() => ({ data: { requests: [] } })) : Promise.resolve({ data: { requests: [] } }),
        canManageLicense ? apiFetch("/api/license/admin/plans").catch(() => ({ data: { plans: [] } })) : Promise.resolve({ data: { plans: [] } }),
      ])
        .then(([res, listRes, myReqRes, adminReqRes, plansRes]) => {
          const lic = res.data || null;
          const now = new Date();
          const oneYear = new Date(now);
          oneYear.setFullYear(oneYear.getFullYear() + 1);
          const endsAtDefault = oneYear.toISOString().slice(0, 10);
          setLicenseData(lic);
          setLicenseForm((prev) => ({
            ...prev,
            planCode: String(lic?.planCode || "MINIMO").toUpperCase(),
            status: String(lic?.status || "ACTIVE").toUpperCase(),
            endsAt: lic?.endsAt ? String(lic.endsAt).slice(0, 10) : endsAtDefault,
          }));
          setContractorForm({
            document: String(lic?.contractor?.document || ""),
            nameOrCompany: String(lic?.contractor?.nameOrCompany || ""),
            tradeName: String(lic?.contractor?.tradeName || ""),
            addressFull: String(lic?.contractor?.addressFull || ""),
            zipCode: String(lic?.contractor?.zipCode || ""),
            phoneWhatsapp: String(lic?.contractor?.phoneWhatsapp || ""),
            email: String(lic?.contractor?.email || ""),
            logoFile: String(lic?.contractor?.logoFile || ""),
          });
          const list = listRes?.data?.licenses || [];
          const reqs = myReqRes?.data?.requests || [];
          const adminReqs = adminReqRes?.data?.requests || [];
          setLicensesList(list);
          setMyLicenseRequests(reqs);
          setAdminLicenseRequests(adminReqs);
          setLicensePlans(plansRes?.data?.plans || []);
          setSelectedLicenseId((prev) => {
            if (prev && list.some((l) => l.id === prev && !l.isDeveloperTenant)) return prev;
            return "";
          });
          setSelectedAdminRequestId((prev) => {
            if (prev && adminReqs.some((r) => r.id === prev)) return prev;
            return adminReqs[0]?.id || "";
          });
        })
        .catch((err) => addToast(err.message, "error"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [tab, adminLicenseLocked]);

  const loadCustomers = (search) => {
    setLoading(true);
    const q = search || customerSearch;
    const url = q && q.length >= 2 ? `/api/customers?search=${encodeURIComponent(q)}` : "/api/customers";
    apiFetch(url).then((res) => setCustomers(res.data?.customers || [])).catch((err) => addToast(err.message, "error")).finally(() => setLoading(false));
  };

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";

  const cepMask = (v) => {
    const d = String(v || "").replace(/\D/g, "").slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
  };

  const openCleanupLicense = (tenant) => {
    if (tenant?.isDeveloperTenant) return;
    setCleanupTarget(tenant);
    setCleanupConfirm("");
  };

  const openCleanupAllNonMaster = () => {
    setCleanupTarget({ id: "__ALL__", name: "Todos os licenciados (exceto Desenvolvedor)" });
    setCleanupConfirm("");
  };

  const runCleanupLicense = async () => {
    if (!cleanupTarget?.id) return;
    if (cleanupConfirm.trim().toUpperCase() !== "CONFIRMAR") {
      addToast("Digite CONFIRMAR para executar a limpeza", "warning");
      return;
    }
    setCleanupSubmitting(true);
    try {
      if (cleanupTarget.id === "__ALL__") {
        await apiFetch("/api/license/admin/cleanup-non-master", {
          method: "POST",
          body: JSON.stringify({ confirm: cleanupConfirm.trim().toUpperCase() }),
        });
        addToast("Base limpa (exceto Desenvolvedor)", "success");
      } else {
        await apiFetch("/api/license/admin/cleanup", {
          method: "POST",
          body: JSON.stringify({
            tenantId: cleanupTarget.id,
            confirm: cleanupConfirm.trim().toUpperCase(),
          }),
        });
        addToast("Licença removida com sucesso", "success");
      }
      setCleanupTarget(null);
      const listRes = await apiFetch("/api/license/admin/licenses");
      setLicensesList(listRes?.data?.licenses || []);
    } catch (err) {
      addToast(err.message || "Falha ao limpar licença", "error");
    } finally {
      setCleanupSubmitting(false);
    }
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsText(file, "utf-8");
    });

  const toggleImportTable = (tableKey, checked) => {
    setImportSelections((prev) => ({
      ...prev,
      [tableKey]: {
        selected: Boolean(checked),
        file: checked ? (prev[tableKey]?.file || null) : null,
      },
    }));
    setImportValidation([]);
    setImportResult(null);
  };

  const pickImportFile = (tableKey, file) => {
    setImportSelections((prev) => ({
      ...prev,
      [tableKey]: {
        selected: true,
        file: file || null,
      },
    }));
    setImportValidation([]);
    setImportResult(null);
  };

  const buildImportFilesPayload = async () => {
    const selectedEntries = IMPORT_TABLE_OPTIONS
      .map((opt) => ({ table: opt.key, meta: importSelections[opt.key] || {} }))
      .filter((entry) => entry.meta.selected);

    if (!selectedEntries.length) {
      throw new Error("Selecione ao menos uma tabela para importar");
    }

    const missing = selectedEntries.filter((entry) => !entry.meta.file).map((entry) => entry.table);
    if (missing.length) {
      throw new Error(`Selecione o arquivo para: ${missing.join(", ")}`);
    }

    const files = [];
    for (const entry of selectedEntries) {
      // eslint-disable-next-line no-await-in-loop
      const content = await readFileAsText(entry.meta.file);
      files.push({
        table: entry.table,
        fileName: entry.meta.file?.name || `${entry.table}.txt`,
        content,
      });
    }
    return files;
  };

  const resolveImportExportTarget = () => {
    const selectedTenantId = String(selectedLicense?.id || "").trim();
    const ownTenantId = String(licenseData?.tenantId || "").trim();
    if (isDeveloperAdmin && selectedTenantId) {
      return { targetTenantId: selectedTenantId, useAdminEndpoint: true };
    }
    return { targetTenantId: ownTenantId, useAdminEndpoint: false };
  };

  const validateSelectedImports = async () => {
    const { targetTenantId, useAdminEndpoint } = resolveImportExportTarget();
    if (!targetTenantId) {
      addToast("Licenciado não identificado para validar importação", "warning");
      return false;
    }
    setImportValidating(true);
    try {
      const files = await buildImportFilesPayload();
      const endpoint = useAdminEndpoint ? "/api/license/admin/import/validate" : "/api/license/me/import/validate";
      const body = useAdminEndpoint ? { tenantId: targetTenantId, files } : { files };
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const validation = res?.data?.validation || [];
      setImportValidation(validation);
      setImportResult(null);
      const compatible = validation.every((item) => item.compatible);
      addToast(compatible ? "Arquivos validados com sucesso" : "Existem arquivos incompatíveis", compatible ? "success" : "warning");
      return compatible;
    } catch (err) {
      addToast(err.message || "Falha na validação dos arquivos", "error");
      return false;
    } finally {
      setImportValidating(false);
    }
  };

  const loadLicensePlans = async () => {
    if (!isDeveloperAdmin) return;
    try {
      const res = await apiFetch("/api/license/admin/plans");
      setLicensePlans(res?.data?.plans || []);
    } catch (err) {
      addToast(err.message || "Falha ao carregar planos", "error");
    }
  };

  const resetPlanForm = () => {
    setPlanEditingCode("");
    setCopyPlanCode("");
    setPlanForm({
      code: "NOVO_PLANO",
      name: "",
      currency: "BRL",
      monthlyPriceCents: "0,00",
      annualPriceCents: "0,00",
      dashboardMode: "FULL",
      maxActiveUsers: "",
      maxActiveStores: "",
      roleAdmin: "",
      roleVendedor: "",
      roleCaixa: "",
      roleFarmaceutico: "",
      active: true,
      features: LICENSE_FEATURE_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {}),
    });
  };

  const mountPlanForm = (plan) => {
    if (!plan) return;
    const limits = plan?.limits || {};
    const roleCaps = limits?.maxRoleActive || {};
    const features = LICENSE_FEATURE_KEYS.reduce((acc, key) => ({ ...acc, [key]: Boolean(plan?.features?.[key]) }), {});
    setPlanEditingCode(String(plan.code || "").toUpperCase());
    setPlanForm({
      code: String(plan.code || "").toUpperCase(),
      name: String(plan.name || ""),
      currency: String(plan.currency || "BRL").toUpperCase(),
      monthlyPriceCents: centsToInput(plan.monthlyPriceCents),
      annualPriceCents: centsToInput(plan.annualPriceCents),
      dashboardMode: String(plan.dashboardMode || "FULL").toUpperCase(),
      maxActiveUsers: String(limits.maxActiveUsers ?? ""),
      maxActiveStores: String(limits.maxActiveStores ?? ""),
      roleAdmin: String(roleCaps.ADMIN ?? ""),
      roleVendedor: String(roleCaps.VENDEDOR ?? ""),
      roleCaixa: String(roleCaps.CAIXA ?? ""),
      roleFarmaceutico: String(roleCaps.FARMACEUTICO ?? ""),
      active: Boolean(plan.active),
      features,
    });
  };

  const copyPlanToNew = () => {
    const source = (licensePlans || []).find((p) => String(p.code || "").toUpperCase() === String(copyPlanCode || "").toUpperCase());
    if (!source) {
      addToast("Selecione um plano para copiar", "warning");
      return;
    }
    const limits = source?.limits || {};
    const roleCaps = limits?.maxRoleActive || {};
    const features = LICENSE_FEATURE_KEYS.reduce((acc, key) => ({ ...acc, [key]: Boolean(source?.features?.[key]) }), {});
    setPlanEditingCode("");
    setPlanForm({
      code: `${String(source.code || "NOVO").toUpperCase()}_NOVO`,
      name: `${String(source.name || "Plano")} (cópia)`,
      currency: String(source.currency || "BRL").toUpperCase(),
      monthlyPriceCents: centsToInput(source.monthlyPriceCents),
      annualPriceCents: centsToInput(source.annualPriceCents),
      dashboardMode: String(source.dashboardMode || "FULL").toUpperCase(),
      maxActiveUsers: String(limits.maxActiveUsers ?? ""),
      maxActiveStores: String(limits.maxActiveStores ?? ""),
      roleAdmin: String(roleCaps.ADMIN ?? ""),
      roleVendedor: String(roleCaps.VENDEDOR ?? ""),
      roleCaixa: String(roleCaps.CAIXA ?? ""),
      roleFarmaceutico: String(roleCaps.FARMACEUTICO ?? ""),
      active: Boolean(source.active),
      features,
    });
    addToast("Plano copiado para criação de novo", "success");
  };

  const submitPlan = async () => {
    if (!isDeveloperAdmin) return;
    const code = String(planForm.code || "").trim().toUpperCase();
    const name = String(planForm.name || "").trim();
    if (!code && !planEditingCode) {
      addToast("Código do plano é obrigatório", "warning");
      return;
    }
    if (!name) {
      addToast("Nome do plano é obrigatório", "warning");
      return;
    }
    setPlanSubmitting(true);
    try {
      const payload = {
        code: planEditingCode || code,
        name,
        currency: String(planForm.currency || "BRL").trim().toUpperCase() || "BRL",
        monthlyPriceCents: inputToCents(planForm.monthlyPriceCents),
        annualPriceCents: inputToCents(planForm.annualPriceCents),
        dashboardMode: String(planForm.dashboardMode || "FULL").trim().toUpperCase(),
        active: Boolean(planForm.active),
        limits: {
          maxActiveUsers: Number(planForm.maxActiveUsers || 0),
          maxActiveStores: Number(planForm.maxActiveStores || 0),
          maxRoleActive: {
            ADMIN: Number(planForm.roleAdmin || 0),
            VENDEDOR: Number(planForm.roleVendedor || 0),
            CAIXA: Number(planForm.roleCaixa || 0),
            FARMACEUTICO: Number(planForm.roleFarmaceutico || 0),
          },
        },
        features: LICENSE_FEATURE_KEYS.reduce((acc, key) => {
          acc[key] = Boolean(planForm.features?.[key]);
          return acc;
        }, {}),
      };
      if (planEditingCode) {
        await apiFetch(`/api/license/admin/plans/${encodeURIComponent(planEditingCode)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        addToast("Plano atualizado", "success");
      } else {
        await apiFetch("/api/license/admin/plans", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        addToast("Plano criado", "success");
      }
      await loadLicensePlans();
      const meRes = await apiFetch("/api/license/me");
      setLicenseData(meRes?.data || null);
      resetPlanForm();
    } catch (err) {
      addToast(err.message || "Falha ao salvar plano", "error");
    } finally {
      setPlanSubmitting(false);
    }
  };

  const removePlan = async (code) => {
    if (!isDeveloperAdmin || !code) return;
    if (!window.confirm(`Excluir plano ${code}?`)) return;
    setPlanSubmitting(true);
    try {
      await apiFetch(`/api/license/admin/plans/${encodeURIComponent(String(code).toUpperCase())}`, {
        method: "DELETE",
      });
      addToast("Plano excluído", "success");
      await loadLicensePlans();
      const meRes = await apiFetch("/api/license/me");
      setLicenseData(meRes?.data || null);
      if (String(planEditingCode || "").toUpperCase() === String(code || "").toUpperCase()) {
        resetPlanForm();
      }
    } catch (err) {
      addToast(err.message || "Falha ao excluir plano", "error");
    } finally {
      setPlanSubmitting(false);
    }
  };

  const executeSelectedImports = async () => {
    const { targetTenantId, useAdminEndpoint } = resolveImportExportTarget();
    if (!targetTenantId) {
      addToast("Licenciado não identificado para importar", "warning");
      return;
    }
    setImportExecuting(true);
    try {
      const files = await buildImportFilesPayload();
      const currentValidation = importValidation || [];
      const needsValidation = currentValidation.length === 0;
      let compatible = !needsValidation && currentValidation.every((item) => item.compatible);
      if (needsValidation) compatible = await validateSelectedImports();
      if (!compatible) {
        addToast("Importação bloqueada. Corrija os arquivos incompatíveis.", "warning");
        return;
      }
      const endpoint = useAdminEndpoint ? "/api/license/admin/import/execute" : "/api/license/me/import/execute";
      const body = useAdminEndpoint ? { tenantId: targetTenantId, files } : { files };
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const imported = res?.data?.imported || [];
      setImportResult(imported);
      addToast("Importação concluída com sucesso", "success");
      if (useAdminEndpoint) {
        const listRes = await apiFetch("/api/license/admin/licenses");
        setLicensesList(listRes?.data?.licenses || []);
        if (String(targetTenantId || "") === String(licenseData?.tenantId || "")) {
          await refreshSession().catch(() => {});
        }
      } else {
        const meRes = await apiFetch("/api/license/me");
        setLicenseData(meRes?.data || null);
        await refreshSession().catch(() => {});
      }
    } catch (err) {
      addToast(err.message || "Falha na importação", "error");
    } finally {
      setImportExecuting(false);
    }
  };

  const toggleExportTable = (tableKey, checked) => {
    setExportSelections((prev) => ({
      ...prev,
      [tableKey]: { selected: Boolean(checked) },
    }));
    setExportResult(null);
  };

  const triggerDownloadTextFile = (fileName, content) => {
    const blob = new Blob([String(content || "")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "exportacao.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const executeSelectedExports = async () => {
    const { targetTenantId, useAdminEndpoint } = resolveImportExportTarget();
    if (!targetTenantId) {
      addToast("Licenciado não identificado para exportar", "warning");
      return;
    }
    const tables = IMPORT_TABLE_OPTIONS
      .map((opt) => opt.key)
      .filter((key) => Boolean(exportSelections[key]?.selected));
    if (!tables.length) {
      addToast("Selecione ao menos uma tabela para exportar", "warning");
      return;
    }
    setExportExecuting(true);
    try {
      const endpoint = useAdminEndpoint ? "/api/license/admin/export" : "/api/license/me/export";
      const body = useAdminEndpoint ? { tenantId: targetTenantId, tables } : { tables };
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const exported = res?.data?.exported || [];
      if (!exported.length) {
        addToast("Nenhum arquivo gerado para exportação", "warning");
        setExportResult([]);
        return;
      }
      exported.forEach((file) => {
        triggerDownloadTextFile(file.fileName || `${file.table}.txt`, file.content || "");
      });
      setExportResult(exported);
      addToast("Exportação concluída com sucesso", "success");
    } catch (err) {
      addToast(err.message || "Falha na exportação", "error");
    } finally {
      setExportExecuting(false);
    }
  };

  const submitLicenseRequest = async () => {
    setRequestSubmitting(true);
    try {
      const roleCaps = USER_ROLE_ORDER.reduce((acc, role) => {
        acc[role] = Math.max(0, Number(requestForm?.[role] || 0));
        return acc;
      }, {});
      await apiFetch("/api/license/me/change-requests", {
        method: "POST",
        body: JSON.stringify({
          roleCaps,
          note: String(requestForm.note || "").trim() || null,
        }),
      });
      const myReqRes = await apiFetch("/api/license/me/change-requests");
      setMyLicenseRequests(myReqRes?.data?.requests || []);
      addToast("Solicitação enviada ao Desenvolvedor", "success");
    } catch (err) {
      addToast(err.message || "Falha ao enviar solicitação", "error");
    } finally {
      setRequestSubmitting(false);
    }
  };

  const approveLicenseRequest = async (requestId) => {
    if (!requestId) return;
    setRequestSubmitting(true);
    try {
      await apiFetch(`/api/license/me/change-requests/${requestId}/approve`, {
        method: "POST",
        body: JSON.stringify({ note: "Aprovado pelo contratante" }),
      });
      const [myReqRes, meRes] = await Promise.all([
        apiFetch("/api/license/me/change-requests"),
        apiFetch("/api/license/me"),
      ]);
      setMyLicenseRequests(myReqRes?.data?.requests || []);
      setLicenseData(meRes?.data || null);
      addToast("Nova configuração aplicada com sucesso", "success");
    } catch (err) {
      addToast(err.message || "Falha ao aprovar alteração", "error");
    } finally {
      setRequestSubmitting(false);
    }
  };

  const selectedAdminRequest = adminLicenseRequests.find((r) => r.id === selectedAdminRequestId) || null;

  const sendAdminProposal = async (action = "PROPOSE") => {
    if (!selectedAdminRequestId) {
      addToast("Selecione uma solicitação", "warning");
      return;
    }
    setAdminReviewSubmitting(true);
    try {
      const roleCaps = USER_ROLE_ORDER.reduce((acc, role) => {
        acc[role] = Math.max(0, Number(adminProposalForm?.[role] || 0));
        return acc;
      }, {});
      await apiFetch(`/api/license/admin/change-requests/${selectedAdminRequestId}/review`, {
        method: "PUT",
        body: JSON.stringify({
          action,
          roleCaps,
          monthlyPriceCents: adminProposalForm.monthlyPriceCents === "" ? null : inputToCents(adminProposalForm.monthlyPriceCents),
          annualPriceCents: adminProposalForm.annualPriceCents === "" ? null : inputToCents(adminProposalForm.annualPriceCents),
          extrasDescription: String(adminProposalForm.extrasDescription || "").trim() || null,
          note: String(adminProposalForm.note || "").trim() || null,
        }),
      });
      const adminReqRes = await apiFetch("/api/license/admin/change-requests");
      setAdminLicenseRequests(adminReqRes?.data?.requests || []);
      addToast(action === "REJECT" ? "Solicitação rejeitada" : "Proposta enviada ao contratante", "success");
    } catch (err) {
      addToast(err.message || "Falha ao revisar solicitação", "error");
    } finally {
      setAdminReviewSubmitting(false);
    }
  };

  // STORE HANDLERS
  const openCreateStore = () => { setStoreForm(emptyStoreForm); setStoreEditId(null); setStoreModal(true); };
  const openEditStore = (s) => {
    setStoreForm({ name: s.name || "", type: s.type || "LOJA", cnpj: s.cnpj || "", phone: s.phone || "", email: s.email || "", street: s.street || "", number: s.number || "", complement: s.complement || "", district: s.district || "", city: s.city || "", state: s.state || "", zipCode: s.zipCode || "" });
    setStoreEditId(s.id); setStoreModal(true);
  };
  const submitStore = async () => {
    setSubmitting(true);
    try {
      if (storeEditId) {
        await apiFetch(`/api/stores/${storeEditId}`, { method: "PUT", body: JSON.stringify(storeForm) });
        addToast("Loja atualizada!", "success");
      } else {
        await apiFetch("/api/stores", { method: "POST", body: JSON.stringify(storeForm) });
        addToast("Loja criada!", "success");
      }
      setStoreModal(false); setTab("lojas"); // triggers reload
      apiFetch("/api/stores?all=true").then((res) => setStores(res.data || []));
    } catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };
  const toggleStoreActive = async (s) => {
    try {
      await apiFetch(`/api/stores/${s.id}`, { method: "PUT", body: JSON.stringify({ active: !s.active }) });
      addToast(s.active ? "Loja desativada" : "Loja ativada", "success");
      apiFetch("/api/stores?all=true").then((res) => setStores(res.data || []));
    } catch (err) { addToast(err.message, "error"); }
  };

  const toggleStoreDefault = async (s) => {
    try {
      await apiFetch(`/api/stores/${s.id}`, { method: "PUT", body: JSON.stringify({ isDefault: !s.isDefault }) });
      addToast(s.isDefault ? "Removido como padrão" : `${s.name} definida como padrão`, "success");
      apiFetch("/api/stores?all=true").then((res) => setStores(res.data || []));
    } catch (err) { addToast(err.message, "error"); }
  };

  // USER HANDLERS
  const openCreateUser = () => { setUserForm(emptyUserForm); setUserEditId(null); setUserModal(true); };
  const openEditUser = (u) => {
    setUserForm({
      name: u.name,
      email: u.email,
      password: "",
      passwordConfirm: "",
      roleName: u.role?.name || "VENDEDOR",
      storeIds: (u.stores || []).map((s) => s.storeId || s.store?.id).filter(Boolean),
    });
    setUserEditId(u.id); setUserModal(true);
  };
  const submitUser = async () => {
    if (userForm.password && userForm.password !== userForm.passwordConfirm) {
      addToast("As senhas não coincidem", "error"); return;
    }
    if (userForm.roleName !== "ADMIN" && (!userForm.storeIds || userForm.storeIds.length === 0)) {
      addToast("Selecione ao menos uma loja para este perfil", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const body = { name: userForm.name, email: userForm.email, roleName: userForm.roleName };
      if (userForm.roleName !== "ADMIN") body.storeIds = userForm.storeIds;
      if (userForm.password) body.password = userForm.password;
      if (userEditId) {
        await apiFetch(`/api/users/${userEditId}`, { method: "PUT", body: JSON.stringify(body) });
        addToast("Usuário atualizado!", "success");
      } else {
        if (!userForm.password) { addToast("Senha obrigatória", "error"); setSubmitting(false); return; }
        await apiFetch("/api/users", { method: "POST", body: JSON.stringify(body) });
        addToast("Usuário criado!", "success");
      }
      setUserModal(false);
      apiFetch("/api/users").then((res) => setUsers(res.data || []));
    } catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  // CUSTOMER HANDLERS
  const openCreateCustomer = () => { setCustomerForm(emptyCustomerForm); setCustomerEditId(null); setCustomerModal(true); };
  const submitCustomer = async () => {
    setSubmitting(true);
    try {
      const body = {
        name: customerForm.name,
        document: customerForm.document.replace(/\D/g, "") || null,
        birthDate: customerForm.birthDate || null,
        whatsapp: customerForm.whatsapp.replace(/\D/g, "") || null,
        phone: customerForm.phone.replace(/\D/g, "") || null,
        email: customerForm.email || null,
      };
      await apiFetch("/api/customers", { method: "POST", body: JSON.stringify(body) });
      addToast("Cliente cadastrado!", "success");
      setCustomerModal(false);
      loadCustomers();
    } catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  const roleName = (u) => u.role?.name || u.role || "—";
  const canManageLicense = user?.role === "ADMIN";
  const isDeveloperAdmin = canManageLicense && Boolean(licenseData?.contractor?.isDeveloperTenant);
  const contractorLicenses = (licensesList || []).filter((l) => !l.isDeveloperTenant);
  const selectedLicense = contractorLicenses.find((l) => l.id === selectedLicenseId) || null;
  const selectedPlanCode = String((isDeveloperAdmin ? selectedLicense?.license?.planCode : licenseData?.planCode) || licenseForm.planCode || "MINIMO").toUpperCase();
  const selectedPlanMeta = (licenseData?.catalog || []).find((p) => String(p.code || "").toUpperCase() === selectedPlanCode) || null;
  const moneyLabel = (cents) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(cents || 0) / 100);
  const centsToInput = (cents) => moneyMask(String(Math.max(0, Number(cents || 0))));
  const inputToCents = (value) => Math.round(parseMoney(value || "0") * 100);

  const submitLicense = async () => {
    if (!canManageLicense) return;
    setSubmitting(true);
    try {
      const endpoint = isDeveloperAdmin && selectedLicense?.id
        ? `/api/license/admin/licenses/${selectedLicense.id}`
        : "/api/license/me";
      const res = await apiFetch(endpoint, {
        method: "PUT",
        body: JSON.stringify({
          planCode: String(licenseForm.planCode || "").toUpperCase(),
          status: String(licenseForm.status || "").toUpperCase(),
          endsAt: licenseForm.endsAt || null,
          reason: String(licenseForm.reason || "").trim() || null,
        }),
      });
      if (isDeveloperAdmin && selectedLicense?.id) {
        const listRes = await apiFetch("/api/license/admin/licenses");
        const list = listRes?.data?.licenses || [];
        setLicensesList(list);
      } else {
        setLicenseData(res.data || null);
      }
      addToast("Licença atualizada com sucesso!", "success");
    } catch (err) {
      addToast(err.message || "Erro ao atualizar licença", "error");
    } finally {
      setSubmitting(false);
    }
  };


  const submitContractor = async () => {
    if (!canManageLicense) return;
    if (!String(contractorForm.nameOrCompany || "").trim()) {
      addToast("Informe o nome/razao social do contratante", "warning");
      return;
    }
    const contractorDocDigits = String(contractorForm.document || "").replace(/\D/g, "");
    if (contractorDocDigits && !validateCPFOrCNPJ(contractorDocDigits)) {
      addToast("CPF/CNPJ inválido", "error");
      return;
    }
    const contractorZipDigits = String(contractorForm.zipCode || "").replace(/\D/g, "");
    if (contractorZipDigits && contractorZipDigits.length !== 8) {
      addToast("CEP inválido", "error");
      return;
    }
    const phoneDigits = String(contractorForm.phoneWhatsapp || "").replace(/\D/g, "");
    if (phoneDigits && phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      addToast("Telefone/WhatsApp inválido", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/license/me/contractor", {
        method: "PUT",
        body: JSON.stringify({
          document: contractorDocDigits || null,
          nameOrCompany: String(contractorForm.nameOrCompany || "").trim(),
          tradeName: String(contractorForm.tradeName || "").trim() || null,
          addressFull: String(contractorForm.addressFull || "").trim() || null,
          zipCode: contractorZipDigits || null,
          phoneWhatsapp: phoneDigits || null,
          email: String(contractorForm.email || "").trim() || null,
          logoFile: String(contractorForm.logoFile || "").trim() || null,
        }),
      });
      const lic = res.data || null;
      setLicenseData(lic);
      setContractorForm({
        document: String(lic?.contractor?.document || ""),
        nameOrCompany: String(lic?.contractor?.nameOrCompany || ""),
        tradeName: String(lic?.contractor?.tradeName || ""),
        addressFull: String(lic?.contractor?.addressFull || ""),
        zipCode: String(lic?.contractor?.zipCode || ""),
        phoneWhatsapp: String(lic?.contractor?.phoneWhatsapp || ""),
        email: String(lic?.contractor?.email || ""),
        logoFile: String(lic?.contractor?.logoFile || ""),
      });
      addToast("Dados do contratante atualizados!", "success");
    } catch (err) {
      addToast(err.message || "Erro ao atualizar contratante", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const onContractorLogoFilePicked = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setContractorForm((prev) => ({ ...prev, logoFile: dataUrl }));
      addToast("Arquivo de logo carregado", "success");
    } catch {
      addToast("Não foi possível ler o arquivo", "error");
    } finally {
      event.target.value = "";
    }
  };

  const dateLabel = (v) => (v ? formatDate(v) : "—");
  const dateTimeLabel = (v) => {
    if (!v) return "—";
    return new Date(v).toLocaleString("pt-BR");
  };
  const moduloHabilitado = (features = {}) =>
    Object.entries(features)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => MODULO_LABELS[key] || key);

  const perfisContratados = (limits = {}) =>
    Object.entries(limits?.maxRoleActive || {})
      .filter(([, qty]) => Number(qty) > 0)
      .map(([role, qty]) => `${PERFIL_LABELS[role] || role}: ${qty}`);

  const loadLicensePayments = async ({ targetTenantId = null } = {}) => {
    if (!canManageLicense) return;
    if (isDeveloperAdmin && !targetTenantId) {
      setLicensePayments([]);
      setLicenseAlerts([]);
      return;
    }
    setPaymentsLoading(true);
    try {
      const endpoint = isDeveloperAdmin
        ? `/api/license/admin/licenses/${targetTenantId}/payments`
        : "/api/license/me/payments";
      const res = await apiFetch(endpoint);
      setLicensePayments(res?.data?.payments || []);
      setLicenseAlerts(res?.data?.alerts || []);
    } catch (err) {
      addToast(err.message || "Falha ao carregar pagamentos da licença", "error");
      setLicensePayments([]);
      setLicenseAlerts([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const markLicensePaymentAsPaid = async (payment) => {
    if (!isDeveloperAdmin || !selectedLicense?.id || !payment?.id) return;
    const amount = Number(payment.amountCents || 0);
    const due = dateLabel(payment.dueDate);
    const ok = window.confirm(
      `Registrar pagamento desta parcela?\n\nVencimento: ${due}\nValor: ${moneyLabel(amount)}`
    );
    if (!ok) return;
    setMarkingPaymentId(payment.id);
    try {
      await apiFetch(`/api/license/admin/licenses/${selectedLicense.id}/payments/${payment.id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          paidAmountCents: amount,
        }),
      });
      addToast("Pagamento registrado com sucesso", "success");
      await loadLicensePayments({ targetTenantId: selectedLicense.id });
      const listRes = await apiFetch("/api/license/admin/licenses");
      setLicensesList(listRes?.data?.licenses || []);
    } catch (err) {
      addToast(err.message || "Falha ao registrar pagamento", "error");
    } finally {
      setMarkingPaymentId("");
    }
  };

  useEffect(() => {
    if (!isDeveloperAdmin || !selectedLicense) return;
    const now = new Date();
    const oneYear = new Date(now);
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    const endsAtDefault = oneYear.toISOString().slice(0, 10);
    setLicenseForm((prev) => ({
      ...prev,
      planCode: String(selectedLicense?.license?.planCode || prev.planCode || "MINIMO").toUpperCase(),
      status: String(selectedLicense?.license?.status || prev.status || "ACTIVE").toUpperCase(),
      endsAt: selectedLicense?.license?.endsAt ? String(selectedLicense.license.endsAt).slice(0, 10) : (prev.endsAt || endsAtDefault),
    }));
  }, [isDeveloperAdmin, selectedLicenseId, selectedLicense?.license?.planCode, selectedLicense?.license?.status, selectedLicense?.license?.endsAt]);

  useEffect(() => {
    setImportSelections({});
    setImportValidation([]);
    setImportResult(null);
  }, [selectedLicenseId, licenciamentoView]);

  useEffect(() => {
    if (tab !== "licenciamento" || !canManageLicense || planosLicenciamentoMode || licenciamentoView === "NOVO") return;
    if (isDeveloperAdmin) {
      if (!selectedLicense?.id) {
        setLicensePayments([]);
        setLicenseAlerts([]);
        return;
      }
      loadLicensePayments({ targetTenantId: selectedLicense.id });
      return;
    }
    loadLicensePayments();
  }, [tab, canManageLicense, isDeveloperAdmin, licenciamentoView, planosLicenciamentoMode, selectedLicense?.id]);

  useEffect(() => {
    if (!selectedAdminRequest) return;
    const caps = selectedAdminRequest.requestedRoleCaps || {};
    setAdminProposalForm((prev) => ({
      ...prev,
      ADMIN: Number(caps.ADMIN || 0),
      VENDEDOR: Number(caps.VENDEDOR || 0),
      CAIXA: Number(caps.CAIXA || 0),
      FARMACEUTICO: Number(caps.FARMACEUTICO || 0),
      monthlyPriceCents: selectedAdminRequest.proposedMonthlyPriceCents != null ? centsToInput(selectedAdminRequest.proposedMonthlyPriceCents) : "",
      annualPriceCents: selectedAdminRequest.proposedAnnualPriceCents != null ? centsToInput(selectedAdminRequest.proposedAnnualPriceCents) : "",
      extrasDescription: selectedAdminRequest.proposedExtrasDescription || "",
      note: selectedAdminRequest.proposedNote || "",
    }));
  }, [selectedAdminRequestId, selectedAdminRequest?.id]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {(adminLicenseLocked ? TABS.filter((t) => t.key === "licenciamento") : TABS).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === t.key ? "bg-white text-primary-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* LOJAS TAB */}
      {tab === "lojas" && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store size={18} className="text-gray-400" />
              <h3 className="font-semibold text-gray-900">Lojas e Depósitos</h3>
            </div>
            <Button size="sm" onClick={openCreateStore}><Plus size={14} /> Nova Loja</Button>
          </CardHeader>
          {loading ? <PageSpinner /> : (
            <div className="divide-y divide-gray-100">
              {stores.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{s.name}</p>
                      <Badge color={s.type === "CENTRAL" ? "blue" : "green"}>{TYPE_LABELS[s.type] || s.type}</Badge>
                      {s.isDefault && <Badge color="purple">Padrão</Badge>}
                      {!s.active && <Badge color="red">Inativa</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      {s.cnpj && <span>CNPJ: {cnpjMask(s.cnpj)}</span>}
                      {s.phone && <span>Tel: {phoneMask(s.phone)}</span>}
                      {s.city && s.state && <span>{s.city}/{s.state}</span>}
                      {!s.cnpj && !s.phone && !s.city && <span className="text-gray-400 italic">Sem dados cadastrais</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      <span>{s._count?.accessUsers || 0} usuários</span>
                      <span>{s._count?.sales || 0} vendas</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button onClick={() => toggleStoreDefault(s)}
                      className={`text-xs px-2 py-1 rounded ${s.isDefault ? "text-purple-600 hover:bg-purple-50 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>
                      {s.isDefault ? "Padrão" : "Def. Padrão"}
                    </button>
                    <button onClick={() => toggleStoreActive(s)}
                      className={`text-xs px-2 py-1 rounded ${s.active ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}>
                      {s.active ? "Desativar" : "Ativar"}
                    </button>
                    <button onClick={() => openEditStore(s)} className="p-1 text-gray-400 hover:text-primary-600 rounded"><Pencil size={14} /></button>
                  </div>
                </div>
              ))}
              {stores.length === 0 && <div className="px-5 py-8 text-center text-sm text-gray-400">Nenhuma loja cadastrada</div>}
            </div>
          )}
        </Card>
      )}

      {/* USUARIOS TAB */}
      {tab === "usuarios" && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Users size={18} className="text-gray-400" /><h3 className="font-semibold text-gray-900">Usuários</h3></div>
            <Button size="sm" onClick={openCreateUser}><Plus size={14} /> Novo Usuário</Button>
          </CardHeader>
          {loading ? <PageSpinner /> : users.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum usuário" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Matrícula</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Nome</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Perfil</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Lojas</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Criado em</th>
                  <th className="px-4 py-2 w-10" />
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => {
                    const rn = roleName(u);
                    return (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{u.matricula || "—"}</td>
                        <td className="px-4 py-2 font-medium text-gray-900">{u.name}</td>
                        <td className="px-4 py-2 text-gray-500">{u.email}</td>
                        <td className="px-4 py-2"><Badge color={ROLE_COLORS[rn] || "gray"}>{ROLE_LABELS[rn] || rn}</Badge></td>
                        <td className="px-4 py-2 text-gray-500">{u.storeCount ?? u.stores?.length ?? 0}</td>
                        <td className="px-4 py-2"><Badge color={u.active ? "green" : "red"}>{u.active ? "Ativo" : "Inativo"}</Badge></td>
                        <td className="px-4 py-2 text-xs text-gray-400">{u.createdAt ? formatDate(u.createdAt) : "—"}</td>
                        <td className="px-4 py-2">
                          <button onClick={() => openEditUser(u)} className="p-1 text-gray-400 hover:text-primary-600 rounded">
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* CLIENTES TAB */}
      {tab === "clientes" && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2"><UserCheck size={18} className="text-gray-400" /><h3 className="font-semibold text-gray-900">Clientes</h3></div>
            <div className="flex items-center gap-2">
              <input value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); if (e.target.value.length >= 2) loadCustomers(e.target.value); }}
                placeholder="Buscar por nome ou CPF..." className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-56" />
              <Button size="sm" onClick={openCreateCustomer}><Plus size={14} /> Novo Cliente</Button>
            </div>
          </CardHeader>
          {loading ? <PageSpinner /> : customers.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">Nenhum cliente encontrado. Busque ou cadastre um novo.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Nome</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">CPF</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">WhatsApp</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Nascimento</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Email</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-2 text-gray-500">{c.document ? cpfMask(c.document) : "—"}</td>
                      <td className="px-4 py-2 text-gray-500">{c.whatsapp ? whatsappMask(c.whatsapp) : "—"}</td>
                      <td className="px-4 py-2 text-gray-500">{c.birthDate ? formatDate(c.birthDate) : "—"}</td>
                      <td className="px-4 py-2 text-gray-500">{c.email || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* LICENCIAMENTO TAB */}
      {/* LICENCIAMENTO TAB */}
      {tab === "licenciamento" && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Settings size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Licenciamento</h3>
          </CardHeader>
          {loading ? <PageSpinner /> : (
            <CardBody className="space-y-4">
              {isDeveloperAdmin ? (
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant={licenciamentoView === "CONTRATANTES" ? "primary" : "secondary"} onClick={() => setLicenciamentoView("CONTRATANTES")}>
                    Contratantes
                  </Button>
                  <Button type="button" variant={licenciamentoView === "NOVO" ? "primary" : "secondary"} onClick={() => setLicenciamentoView("NOVO")}>
                    Novo contratante
                  </Button>
                  <Button type="button" variant={licenciamentoView === "PLANOS" ? "primary" : "secondary"} onClick={() => setLicenciamentoView("PLANOS")}>
                    Planos de Licenciamento
                  </Button>
                </div>
              ) : null}

              {licenciamentoView !== "NOVO" ? (
                <>
                  {isDeveloperAdmin && planosLicenciamentoMode ? (
                    <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
                      <p className="text-sm font-semibold text-gray-900">Licenças (Planos)</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-500">
                              <th className="px-2 py-1">Código</th>
                              <th className="px-2 py-1">Nome</th>
                              <th className="px-2 py-1">Mensal</th>
                              <th className="px-2 py-1">Anual</th>
                              <th className="px-2 py-1">Dashboard</th>
                              <th className="px-2 py-1">Limites</th>
                              <th className="px-2 py-1">Módulos</th>
                              <th className="px-2 py-1">Status</th>
                              <th className="px-2 py-1">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(licensePlans || []).map((plan) => {
                              const limits = plan?.limits || {};
                              const roleCaps = limits?.maxRoleActive || {};
                              const enabledFeatures = LICENSE_FEATURE_KEYS.filter((key) => Boolean(plan?.features?.[key]));
                              return (
                                <tr key={plan.id}>
                                  <td className="px-2 py-1 font-medium text-gray-900">{plan.code}</td>
                                  <td className="px-2 py-1 text-gray-700">{plan.name}</td>
                                  <td className="px-2 py-1 text-gray-700">{moneyLabel(plan.monthlyPriceCents, plan.currency || "BRL")}</td>
                                  <td className="px-2 py-1 text-gray-700">{moneyLabel(plan.annualPriceCents, plan.currency || "BRL")}</td>
                                  <td className="px-2 py-1 text-gray-700">{DASHBOARD_MODE_LABELS[String(plan.dashboardMode || "").toUpperCase()] || plan.dashboardMode}</td>
                                  <td className="px-2 py-1 text-gray-700">
                                    U:{Number(limits.maxActiveUsers || 0)} / L:{Number(limits.maxActiveStores || 0)} / Perfis:{Object.values(roleCaps || {}).some((n) => Number(n || 0) > 0) ? `${Number(roleCaps.ADMIN || 0)}/${Number(roleCaps.VENDEDOR || 0)}/${Number(roleCaps.CAIXA || 0)}/${Number(roleCaps.FARMACEUTICO || 0)}` : "ilimitado"}
                                  </td>
                                  <td className="px-2 py-1 text-gray-700">{enabledFeatures.length}</td>
                                  <td className="px-2 py-1 text-gray-700">{plan.active ? "Ativo" : "Inativo"}</td>
                                  <td className="px-2 py-1">
                                    <div className="flex gap-2">
                                      <button type="button" className="text-primary-700 hover:text-primary-800" onClick={() => mountPlanForm(plan)}>
                                        Editar
                                      </button>
                                      <button type="button" className="text-red-600 hover:text-red-700" onClick={() => removePlan(plan.code)}>
                                        Excluir
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {!licensePlans?.length ? <tr><td colSpan={9} className="px-2 py-2 text-gray-400">Nenhum plano cadastrado.</td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                      <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Copiar plano (para criar novo)</label>
                          <select className={inputClass} value={copyPlanCode} onChange={(e) => setCopyPlanCode(e.target.value)}>
                            <option value="">Selecione...</option>
                            {(licensePlans || []).map((plan) => (
                              <option key={`copy-${plan.id}`} value={String(plan.code || "").toUpperCase()}>
                                {String(plan.code || "").toUpperCase()} - {plan.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button type="button" variant="secondary" onClick={copyPlanToNew}>
                          Copiar plano
                        </Button>
                      </div>
                      <div className="grid md:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Código</label>
                          <input className={inputClass} value={planForm.code} onChange={(e) => setPlanForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} disabled={Boolean(planEditingCode)} />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Nome</label>
                          <input className={inputClass} value={planForm.name} onChange={(e) => setPlanForm((prev) => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Moeda</label>
                          <input className={inputClass} value={planForm.currency} onChange={(e) => setPlanForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Dashboard</label>
                          <select className={inputClass} value={planForm.dashboardMode} onChange={(e) => setPlanForm((prev) => ({ ...prev, dashboardMode: e.target.value }))}>
                            <option value="SIMPLIFIED">Simplificado</option>
                            <option value="FULL">Completo</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Valor mensal (R$)</label>
                          <input type="text" inputMode="numeric" className={inputClass} value={planForm.monthlyPriceCents} onChange={(e) => setPlanForm((prev) => ({ ...prev, monthlyPriceCents: moneyMask(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Valor anual (R$)</label>
                          <input type="text" inputMode="numeric" className={inputClass} value={planForm.annualPriceCents} onChange={(e) => setPlanForm((prev) => ({ ...prev, annualPriceCents: moneyMask(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Max usuários</label>
                          <input type="number" min={0} className={inputClass} value={planForm.maxActiveUsers} onChange={(e) => setPlanForm((prev) => ({ ...prev, maxActiveUsers: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Max lojas</label>
                          <input type="number" min={0} className={inputClass} value={planForm.maxActiveStores} onChange={(e) => setPlanForm((prev) => ({ ...prev, maxActiveStores: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid md:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Perfil ADMIN</label>
                          <input type="number" min={0} className={inputClass} value={planForm.roleAdmin} onChange={(e) => setPlanForm((prev) => ({ ...prev, roleAdmin: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Perfil VENDEDOR</label>
                          <input type="number" min={0} className={inputClass} value={planForm.roleVendedor} onChange={(e) => setPlanForm((prev) => ({ ...prev, roleVendedor: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Perfil CAIXA</label>
                          <input type="number" min={0} className={inputClass} value={planForm.roleCaixa} onChange={(e) => setPlanForm((prev) => ({ ...prev, roleCaixa: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Perfil FARMACÊUTICO</label>
                          <input type="number" min={0} className={inputClass} value={planForm.roleFarmaceutico} onChange={(e) => setPlanForm((prev) => ({ ...prev, roleFarmaceutico: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-600">Módulos habilitados</p>
                        <div className="grid md:grid-cols-3 gap-2">
                          {LICENSE_FEATURE_KEYS.map((key) => (
                            <label key={key} className="flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="checkbox"
                                checked={Boolean(planForm.features?.[key])}
                                onChange={(e) => setPlanForm((prev) => ({ ...prev, features: { ...(prev.features || {}), [key]: e.target.checked } }))}
                              />
                              <span>{MODULO_LABELS[key] || key}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-gray-700">
                        <input type="checkbox" checked={Boolean(planForm.active)} onChange={(e) => setPlanForm((prev) => ({ ...prev, active: e.target.checked }))} />
                        <span>Plano ativo</span>
                      </label>
                      <div className="flex gap-2">
                        <Button type="button" onClick={submitPlan} loading={planSubmitting}>
                          {planEditingCode ? "Salvar plano" : "Criar plano"}
                        </Button>
                        {planEditingCode ? <Button type="button" variant="secondary" onClick={resetPlanForm}>Cancelar edição</Button> : null}
                      </div>
                    </div>
                  ) : null}

                  {!planosLicenciamentoMode && isDeveloperAdmin ? (
                    <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
                      <p className="text-sm font-semibold text-gray-900">Contratantes</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-500">
                              <th className="px-2 py-1">Licenciado</th>
                              <th className="px-2 py-1">Documento</th>
                              <th className="px-2 py-1">Plano</th>
                              <th className="px-2 py-1">Status</th>
                              <th className="px-2 py-1">L/U/C</th>
                              <th className="px-2 py-1">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(contractorLicenses || []).map((l) => (
                              <tr
                                key={l.id}
                                onClick={() => setSelectedLicenseId(l.id)}
                                className={`cursor-pointer hover:bg-gray-50 ${selectedLicenseId === l.id ? "bg-primary-50" : ""}`}
                              >
                                <td className="px-2 py-1 font-medium text-gray-900">
                                  {l.name}
                                </td>
                                <td className="px-2 py-1 text-gray-600">{cpfCnpjMask(l.contractorDocument || "") || "-"}</td>
                                <td className="px-2 py-1 text-gray-700">{l.license?.planCode || "-"}</td>
                                <td className="px-2 py-1 text-gray-700">{STATUS_LABELS[String(l.license?.status || "").toUpperCase()] || l.license?.status || "-"}</td>
                                <td className="px-2 py-1 text-gray-700">{Number(l?._count?.stores || 0)}/{Number(l?._count?.users || 0)}/{Number(l?._count?.customers || 0)}</td>
                                <td className="px-2 py-1">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); openCleanupLicense(l); }} className="text-red-600 hover:text-red-700">
                                    Limpar base
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {!contractorLicenses?.length ? <tr><td colSpan={6} className="px-2 py-2 text-gray-400">Nenhum contratante encontrado.</td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-gray-500">L/U/C = Lojas / Usuários / Clientes</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => openCleanupLicense(selectedLicense)}
                          disabled={!selectedLicense}
                        >
                          Zerar base do licenciado selecionado
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {!planosLicenciamentoMode && isDeveloperAdmin ? (
                    <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
                      <p className="text-sm font-semibold text-gray-900">Solicitações pendentes de ajuste de licença</p>
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-gray-600">Solicitação</label>
                        <select
                          className={inputClass}
                          value={selectedAdminRequestId}
                          onChange={(e) => setSelectedAdminRequestId(e.target.value)}
                        >
                          {(adminLicenseRequests || []).map((r) => (
                            <option key={r.id} value={r.id}>
                              {`${r.tenant?.contractorTradeName || r.tenant?.name || "Licenciado"} | ${LICENSE_REQUEST_STATUS[r.status] || r.status}`}
                            </option>
                          ))}
                        </select>
                      </div>
                      {!adminLicenseRequests?.length ? (
                        <p className="text-xs text-gray-500">Nenhuma solicitação encontrada.</p>
                      ) : (
                        <>
                          <div className="grid md:grid-cols-4 gap-2">
                            {USER_ROLE_ORDER.map((role) => (
                              <div key={role} className="space-y-1">
                                <label className="block text-xs font-medium text-gray-600">{PERFIL_LABELS[role] || role}</label>
                                <input
                                  type="number"
                                  min={0}
                                  className={inputClass}
                                  value={adminProposalForm[role] ?? 0}
                                  onChange={(e) => setAdminProposalForm((prev) => ({ ...prev, [role]: Number(e.target.value || 0) }))}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="grid md:grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="block text-xs font-medium text-gray-600">Valor mensal proposto (R$)</label>
                              <input className={inputClass} inputMode="numeric" value={adminProposalForm.monthlyPriceCents} onChange={(e) => setAdminProposalForm((prev) => ({ ...prev, monthlyPriceCents: moneyMask(e.target.value) }))} />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-xs font-medium text-gray-600">Valor anual proposto (R$)</label>
                              <input className={inputClass} inputMode="numeric" value={adminProposalForm.annualPriceCents} onChange={(e) => setAdminProposalForm((prev) => ({ ...prev, annualPriceCents: moneyMask(e.target.value) }))} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-gray-600">Extras / observação</label>
                            <input className={inputClass} value={adminProposalForm.extrasDescription} onChange={(e) => setAdminProposalForm((prev) => ({ ...prev, extrasDescription: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-gray-600">Nota da proposta</label>
                            <input className={inputClass} value={adminProposalForm.note} onChange={(e) => setAdminProposalForm((prev) => ({ ...prev, note: e.target.value }))} />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" onClick={() => sendAdminProposal("PROPOSE")} loading={adminReviewSubmitting}>Enviar ao contratante</Button>
                            <Button type="button" variant="secondary" onClick={() => sendAdminProposal("REJECT")} loading={adminReviewSubmitting}>Rejeitar</Button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                  {!planosLicenciamentoMode && canManageLicense ? (
                    <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Importação de tabelas</p>
                        <p className="text-xs text-gray-500">Selecione uma ou mais tabelas, anexe os arquivos e valide antes de importar.</p>
                      </div>
                      <div className="grid md:grid-cols-2 gap-2">
                        {IMPORT_TABLE_OPTIONS.map((opt) => (
                          <div key={opt.key} className="rounded border border-gray-200 p-2">
                            <label className="flex items-center gap-2 text-sm text-gray-800">
                              <input
                                type="checkbox"
                                checked={Boolean(importSelections[opt.key]?.selected)}
                                onChange={(e) => toggleImportTable(opt.key, e.target.checked)}
                              />
                              <span className="font-medium">{opt.label}</span>
                            </label>
                            <p className="text-[11px] text-gray-500 mt-1">Colunas: {opt.columns}</p>
                            <input
                              type="file"
                              accept=".txt,.csv"
                              className="mt-2 block w-full text-xs text-gray-600"
                              onChange={(e) => pickImportFile(opt.key, e.target.files?.[0] || null)}
                              disabled={!importSelections[opt.key]?.selected}
                            />
                            {importSelections[opt.key]?.file ? (
                              <p className="text-[11px] text-gray-500 mt-1">Arquivo: {importSelections[opt.key].file.name}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" onClick={validateSelectedImports} loading={importValidating}>
                          Validar arquivos
                        </Button>
                        <Button type="button" onClick={executeSelectedImports} loading={importExecuting}>
                          Importar selecionadas
                        </Button>
                      </div>

                      {importValidation.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 text-left text-gray-500">
                                <th className="px-2 py-1">Tabela</th>
                                <th className="px-2 py-1">Arquivo</th>
                                <th className="px-2 py-1">Compatível</th>
                                <th className="px-2 py-1">Detalhes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {importValidation.map((item) => (
                                <tr key={`${item.table}-${item.fileName}`}>
                                  <td className="px-2 py-1 font-medium text-gray-900">{item.label || item.table}</td>
                                  <td className="px-2 py-1 text-gray-700">{item.fileName || "-"}</td>
                                  <td className={`px-2 py-1 font-semibold ${item.compatible ? "text-emerald-700" : "text-red-700"}`}>
                                    {item.compatible ? "Sim" : "Não"}
                                  </td>
                                  <td className="px-2 py-1 text-gray-700">
                                    {item.errors?.length ? item.errors.join(" | ") : (item.warnings?.join(" | ") || "OK")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}

                      {importResult?.length ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 text-left text-gray-500">
                                <th className="px-2 py-1">Tabela</th>
                                <th className="px-2 py-1">Arquivo</th>
                                <th className="px-2 py-1">Linhas</th>
                                <th className="px-2 py-1">Importadas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {importResult.map((row) => (
                                <tr key={`${row.table}-${row.fileName}`}>
                                  <td className="px-2 py-1 font-medium text-gray-900">{row.label || row.table}</td>
                                  <td className="px-2 py-1 text-gray-700">{row.fileName || "-"}</td>
                                  <td className="px-2 py-1 text-gray-700">{Number(row.totalRows || 0)}</td>
                                  <td className="px-2 py-1 text-emerald-700 font-semibold">{Number(row.imported || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!planosLicenciamentoMode && canManageLicense ? (
                    <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Exportação de tabelas</p>
                        <p className="text-xs text-gray-500">Selecione uma ou mais tabelas para gerar e baixar os arquivos em TXT.</p>
                      </div>
                      <div className="grid md:grid-cols-2 gap-2">
                        {IMPORT_TABLE_OPTIONS.map((opt) => (
                          <label key={`export-${opt.key}`} className="rounded border border-gray-200 p-2 flex items-start gap-2 text-sm text-gray-800">
                            <input
                              type="checkbox"
                              checked={Boolean(exportSelections[opt.key]?.selected)}
                              onChange={(e) => toggleExportTable(opt.key, e.target.checked)}
                            />
                            <span>
                              <span className="font-medium">{opt.label}</span>
                              <span className="block text-[11px] text-gray-500 mt-1">Colunas: {opt.columns}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={executeSelectedExports} loading={exportExecuting}>
                          Exportar selecionadas
                        </Button>
                      </div>
                      {exportResult?.length ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 text-left text-gray-500">
                                <th className="px-2 py-1">Tabela</th>
                                <th className="px-2 py-1">Arquivo</th>
                                <th className="px-2 py-1">Linhas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {exportResult.map((row) => (
                                <tr key={`${row.table}-${row.fileName}`}>
                                  <td className="px-2 py-1 font-medium text-gray-900">{row.label || row.table}</td>
                                  <td className="px-2 py-1 text-gray-700">{row.fileName || "-"}</td>
                                  <td className="px-2 py-1 text-gray-700">{Number(row.totalRows || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!planosLicenciamentoMode && isDeveloperAdmin && !selectedLicense ? (
                    <div className="p-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-600">
                      Selecione um contratante para visualizar o plano e alterar a licença.
                    </div>
                  ) : !planosLicenciamentoMode ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border border-gray-200 bg-white">
                      <p className="text-sm font-semibold text-gray-900 mb-2">Plano contratado</p>
                      {isDeveloperAdmin && selectedLicense?.provisionalAdmin?.temporaryPassword ? (
                        <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                          <p className="font-semibold">Senha temporária do Admin (até ser alterada)</p>
                          <p>Usuário: {selectedLicense.provisionalAdmin.email || "-"}</p>
                          <p>Senha: <span className="font-mono">{selectedLicense.provisionalAdmin.temporaryPassword}</span></p>
                        </div>
                      ) : null}
                      <ul className="text-sm text-gray-700 space-y-1">
                          <li>Licenciado: {isDeveloperAdmin ? (selectedLicense?.name || "-") : (licenseData?.contractor?.tenantName || "-")}</li>
                          <li>Status: {STATUS_LABELS[String((isDeveloperAdmin ? selectedLicense?.license?.status : licenseData?.status) || "").toUpperCase()] || (isDeveloperAdmin ? selectedLicense?.license?.status : licenseData?.status) || "-"}</li>
                          <li>Validade: {dateLabel(isDeveloperAdmin ? selectedLicense?.license?.endsAt : licenseData?.endsAt)}</li>
                          <li>Valor mensal: {selectedPlanMeta ? moneyLabel(selectedPlanMeta.monthlyPriceCents, selectedPlanMeta.currency) : "-"}</li>
                          <li>Valor anual: {selectedPlanMeta ? moneyLabel(selectedPlanMeta.annualPriceCents, selectedPlanMeta.currency) : "-"}</li>
                          <li>Usuários contratados: {Number(selectedPlanMeta?.limits?.maxActiveUsers || 0)}</li>
                          <li>Tipos de usuários: {(perfisContratados(selectedPlanMeta?.limits).join(", ") || "Sem limite por perfil")}</li>
                          <li>Módulos: {(moduloHabilitado(selectedPlanMeta?.features).join(", ") || "Nenhum módulo habilitado")}</li>
                        </ul>
                    </div>

                    {isDeveloperAdmin ? (
                      <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
                        <p className="text-sm font-semibold text-gray-900">Alterar licença</p>
                        <div className="grid md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-700">Plano</label>
                            <select className={inputClass} value={licenseForm.planCode} onChange={(e) => setLicenseForm((prev) => ({ ...prev, planCode: e.target.value }))} disabled={!canManageLicense}>
                              {(licenseData?.catalog || []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-700">Status</label>
                            <select className={inputClass} value={licenseForm.status} onChange={(e) => setLicenseForm((prev) => ({ ...prev, status: e.target.value }))} disabled={!canManageLicense}>
                              {["TRIAL", "ACTIVE", "GRACE", "SUSPENDED", "EXPIRED", "CANCELED"].map((s) => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-700">Data de encerramento</label>
                            <input type="date" className={inputClass} value={licenseForm.endsAt} onChange={(e) => setLicenseForm((prev) => ({ ...prev, endsAt: e.target.value }))} disabled={!canManageLicense} />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-gray-700">Motivo</label>
                            <input className={inputClass} value={licenseForm.reason} onChange={(e) => setLicenseForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="Opcional" disabled={!canManageLicense} />
                          </div>
                        </div>
                        {isDeveloperAdmin && selectedLicense ? (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            Implicações: alterar plano/status pode impactar limite de usuários, módulos disponíveis e valores.
                          </div>
                        ) : null}
                        {canManageLicense ? <div className="flex justify-end"><Button onClick={submitLicense} loading={submitting}>Salvar licença</Button></div> : null}
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
                        <p className="text-sm font-semibold text-gray-900">Solicitar ajuste de usuários</p>
                        <p className="text-xs text-gray-500">Contratante não altera licença diretamente. Envie a solicitação para revisão do Desenvolvedor.</p>
                        <div className="grid md:grid-cols-4 gap-2">
                          {USER_ROLE_ORDER.map((role) => (
                            <div key={role} className="space-y-1">
                              <label className="block text-xs font-medium text-gray-600">{PERFIL_LABELS[role] || role}</label>
                              <input
                                type="number"
                                min={0}
                                className={inputClass}
                                value={requestForm[role] ?? 0}
                                onChange={(e) => setRequestForm((prev) => ({ ...prev, [role]: Number(e.target.value || 0) }))}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-600">Observação</label>
                          <input className={inputClass} value={requestForm.note} onChange={(e) => setRequestForm((prev) => ({ ...prev, note: e.target.value }))} />
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" onClick={submitLicenseRequest} loading={requestSubmitting}>Enviar solicitação</Button>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gray-700">Solicitações</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-200 text-left text-gray-500">
                                  <th className="px-2 py-1">Status</th>
                                  <th className="px-2 py-1">Plano proposto</th>
                                  <th className="px-2 py-1">Mensal</th>
                                  <th className="px-2 py-1">Diferença</th>
                                  <th className="px-2 py-1">Ação</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {(myLicenseRequests || []).map((r) => (
                                  <tr key={r.id}>
                                    <td className="px-2 py-1">{LICENSE_REQUEST_STATUS[r.status] || r.status}</td>
                                    <td className="px-2 py-1">{r.proposedPlanCode || "-"}</td>
                                    <td className="px-2 py-1">{r.proposedMonthlyPriceCents != null ? moneyLabel(r.proposedMonthlyPriceCents) : "-"}</td>
                                    <td className="px-2 py-1">{r.proposedDifferenceMonthlyCents != null ? moneyLabel(r.proposedDifferenceMonthlyCents) : "-"}</td>
                                    <td className="px-2 py-1">
                                      {r.status === "PENDING_CONTRACTOR_APPROVAL" ? (
                                        <button type="button" className="text-primary-700 hover:text-primary-800" onClick={() => approveLicenseRequest(r.id)}>
                                          Aprovar e aplicar
                                        </button>
                                      ) : "-"}
                                    </td>
                                  </tr>
                                ))}
                                {!myLicenseRequests?.length ? <tr><td colSpan={5} className="px-2 py-2 text-gray-400">Sem solicitações.</td></tr> : null}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  ) : null}

                  {!planosLicenciamentoMode && canManageLicense && (!isDeveloperAdmin || selectedLicense) ? (
                    <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">Controle de pagamentos da licença</p>
                        {paymentsLoading ? <span className="text-xs text-gray-500">Atualizando...</span> : null}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-500">
                              <th className="px-2 py-1">Vencimento</th>
                              <th className="px-2 py-1">Valor</th>
                              <th className="px-2 py-1">Status</th>
                              <th className="px-2 py-1">Pago em</th>
                              <th className="px-2 py-1">Valor pago</th>
                              <th className="px-2 py-1">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(licensePayments || []).map((p) => (
                              <tr key={p.id}>
                                <td className="px-2 py-1 text-gray-700">{dateLabel(p.dueDate)}</td>
                                <td className="px-2 py-1 text-gray-700">{moneyLabel(p.amountCents)}</td>
                                <td className="px-2 py-1 text-gray-700">{PAYMENT_STATUS_LABELS[p.status] || p.status}</td>
                                <td className="px-2 py-1 text-gray-700">{dateTimeLabel(p.paidAt)}</td>
                                <td className="px-2 py-1 text-gray-700">{p.paidAmountCents != null ? moneyLabel(p.paidAmountCents) : "-"}</td>
                                <td className="px-2 py-1">
                                  {isDeveloperAdmin && p.status !== "PAID" ? (
                                    <button
                                      type="button"
                                      className="text-primary-700 hover:text-primary-800 disabled:opacity-50"
                                      disabled={markingPaymentId === p.id}
                                      onClick={() => markLicensePaymentAsPaid(p)}
                                    >
                                      {markingPaymentId === p.id ? "Registrando..." : "Registrar pagamento"}
                                    </button>
                                  ) : "-"}
                                </td>
                              </tr>
                            ))}
                            {!licensePayments?.length ? (
                              <tr>
                                <td colSpan={6} className="px-2 py-2 text-gray-400">Sem parcelas geradas para esta licença.</td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-700">Alertas de cobrança</p>
                        <div className="max-h-56 overflow-auto rounded border border-gray-200">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 text-left text-gray-500">
                                <th className="px-2 py-1">Data</th>
                                <th className="px-2 py-1">Tipo</th>
                                <th className="px-2 py-1">Mensagem</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {(licenseAlerts || []).map((a) => (
                                <tr key={a.id}>
                                  <td className="px-2 py-1 text-gray-700">{dateTimeLabel(a.alertDate)}</td>
                                  <td className="px-2 py-1 text-gray-700">{ALERT_TYPE_LABELS[a.type] || a.type}</td>
                                  <td className="px-2 py-1 text-gray-700">{a.message || "-"}</td>
                                </tr>
                              ))}
                              {!licenseAlerts?.length ? (
                                <tr>
                                  <td colSpan={3} className="px-2 py-2 text-gray-400">Sem alertas registrados.</td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <OnboardingLicencaWizard
                    canManage={isDeveloperAdmin}
                    catalog={licenseData?.catalog || []}
                    defaultPlanCode={licenseForm.planCode}
                    addToast={addToast}
                    onSuccess={async (payload) => {
                      if (isDeveloperAdmin) {
                        try {
                          const listRes = await apiFetch("/api/license/admin/licenses");
                          const list = listRes?.data?.licenses || [];
                          setLicensesList(list);
                          if (payload?.tenantId && list.some((l) => l.id === payload.tenantId && !l.isDeveloperTenant)) {
                            setSelectedLicenseId(payload.tenantId);
                          }
                        } catch (err) {
                          addToast(err.message || "Falha ao atualizar contratantes", "error");
                        }
                      }
                      setLicenciamentoView("CONTRATANTES");
                      setTab("licenciamento");
                    }}
                  />
                  <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-2">
                    <p className="text-sm font-semibold text-gray-900">Layouts para importações</p>
                    <p className="text-xs text-gray-500">Use os arquivos como modelo para importação de dados do novo licenciado.</p>
                    <div className="flex flex-wrap gap-2">
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/tenant_contratante.txt" target="_blank" rel="noreferrer">layout_contratante.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/tenant_licenca.txt" target="_blank" rel="noreferrer">layout_licenca.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/usuario_admin.txt" target="_blank" rel="noreferrer">layout_usuario_admin.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/stores_ok.txt" target="_blank" rel="noreferrer">stores_ok.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/stores_bad.txt" target="_blank" rel="noreferrer">stores_bad.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/categories_ok.txt" target="_blank" rel="noreferrer">categories_ok.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/categories_bad.txt" target="_blank" rel="noreferrer">categories_bad.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/products_ok.txt" target="_blank" rel="noreferrer">products_ok.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/products_bad.txt" target="_blank" rel="noreferrer">products_bad.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/customers_ok.txt" target="_blank" rel="noreferrer">customers_ok.txt</a>
                      <a className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50" href="/import-layouts/customers_bad.txt" target="_blank" rel="noreferrer">customers_bad.txt</a>
                    </div>
                  </div>
                </>
              )}
            </CardBody>
          )}
        </Card>
      )}
      {/* PERMISSOES TAB */}
      {tab === "permissoes" && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Shield size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Matriz de Permissões</h3>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permissão</th>
                {ROLES.map((r) => <th key={r.name} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{r.name}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {PERMISSIONS.map((p) => (
                  <tr key={p.key} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">{p.label}</td>
                    {ROLES.map((r) => (
                      <td key={r.name} className="px-4 py-2 text-center">
                        {r.perms.includes(p.key) ? <span className="inline-block w-4 h-4 bg-emerald-500 rounded-full" /> : <span className="inline-block w-4 h-4 bg-gray-200 rounded-full" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* STORE MODAL */}
      <Modal open={!!cleanupTarget} onClose={() => setCleanupTarget(null)} title="Limpar licença selecionada">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Esta ação apagará todos os dados da licença selecionada.
          </p>
          <p className="text-xs text-gray-500">
            Licença selecionada: <span className="font-medium">{cleanupTarget?.name || "-"}</span>
          </p>
          <p className="text-xs text-red-600">
            Digite <span className="font-semibold">CONFIRMAR</span> para continuar.
          </p>
          <input
            className={inputClass}
            value={cleanupConfirm}
            onChange={(e) => setCleanupConfirm(e.target.value)}
            placeholder="CONFIRMAR"
          />
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setCleanupTarget(null)}>Cancelar</Button>
            <Button className="flex-1" loading={cleanupSubmitting} onClick={runCleanupLicense}>Executar limpeza</Button>
          </div>
        </div>
      </Modal>

      <Modal open={storeModal} onClose={() => setStoreModal(false)} title={storeEditId ? "Editar Loja" : "Nova Loja"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><label className="block text-sm font-medium text-gray-700">Nome *</label><input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} className={inputClass} /></div>
            <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Tipo *</label><select value={storeForm.type} onChange={(e) => setStoreForm({ ...storeForm, type: e.target.value })} className={inputClass}><option value="LOJA">Loja</option><option value="CENTRAL">Central (Depósito)</option></select></div>
            <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">CNPJ</label><input value={cnpjMask(storeForm.cnpj)} onChange={(e) => setStoreForm({ ...storeForm, cnpj: e.target.value.replace(/\D/g, "").slice(0, 14) })} placeholder="00.000.000/0000-00" className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Telefone</label><input value={phoneMask(storeForm.phone)} onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="(00) 00000-0000" className={inputClass} /></div>
            <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Email</label><input type="email" value={storeForm.email} onChange={(e) => setStoreForm({ ...storeForm, email: e.target.value })} className={inputClass} /></div>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Endereço</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1"><label className="block text-sm font-medium text-gray-700">Rua</label><input value={storeForm.street} onChange={(e) => setStoreForm({ ...storeForm, street: e.target.value })} className={inputClass} /></div>
              <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Número</label><input value={storeForm.number} onChange={(e) => setStoreForm({ ...storeForm, number: e.target.value })} className={inputClass} /></div>
              <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Complemento</label><input value={storeForm.complement} onChange={(e) => setStoreForm({ ...storeForm, complement: e.target.value })} className={inputClass} /></div>
              <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Bairro</label><input value={storeForm.district} onChange={(e) => setStoreForm({ ...storeForm, district: e.target.value })} className={inputClass} /></div>
              <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">CEP</label><input value={storeForm.zipCode} onChange={(e) => setStoreForm({ ...storeForm, zipCode: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="00000-000" className={inputClass} /></div>
              <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Cidade</label><input value={storeForm.city} onChange={(e) => setStoreForm({ ...storeForm, city: e.target.value })} className={inputClass} /></div>
              <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">UF</label><input value={storeForm.state} onChange={(e) => setStoreForm({ ...storeForm, state: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} className={inputClass} /></div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStoreModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={submitting} onClick={submitStore} disabled={!storeForm.name}>{storeEditId ? "Salvar" : "Criar"}</Button>
          </div>
        </div>
      </Modal>

      {/* USER MODAL */}
      <Modal open={userModal} onClose={() => setUserModal(false)} title={userEditId ? "Editar Usuário" : "Novo Usuário"}>
        <div className="space-y-4">
          <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Nome *</label><input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} className={inputClass} /></div>
          <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Email *</label><input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className={inputClass} /></div>
          <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">{userEditId ? "Nova Senha (deixe vazio para manter)" : "Senha *"}</label><input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} onPaste={(e) => e.preventDefault()} autoComplete="new-password" className={inputClass} /></div>
          <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Confirmar Senha {!userEditId && "*"}</label><input type="password" value={userForm.passwordConfirm} onChange={(e) => setUserForm({ ...userForm, passwordConfirm: e.target.value })} onPaste={(e) => e.preventDefault()} autoComplete="new-password" className={inputClass} /></div>
          {userForm.password && userForm.passwordConfirm && userForm.password !== userForm.passwordConfirm && (
            <p className="text-xs text-red-600">As senhas não coincidem</p>
          )}
          <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Perfil</label>
            <select value={userForm.roleName} onChange={(e) => setUserForm({ ...userForm, roleName: e.target.value, storeIds: e.target.value === "ADMIN" ? [] : userForm.storeIds })} className={inputClass}>
              <option value="ADMIN">Administrador</option><option value="VENDEDOR">Vendedor</option><option value="CAIXA">Caixa</option><option value="FARMACEUTICO">Farmacêutico</option>
            </select>
          </div>
          {userForm.roleName !== "ADMIN" ? (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Lojas vinculadas *</label>
              <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {stores.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={(userForm.storeIds || []).includes(s.id)}
                      onChange={(e) => {
                        const curr = userForm.storeIds || [];
                        const next = e.target.checked ? [...curr, s.id] : curr.filter((id) => id !== s.id);
                        setUserForm({ ...userForm, storeIds: next });
                      }}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
                {stores.length === 0 && <p className="text-xs text-gray-400">Nenhuma loja disponível</p>}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Administrador tem acesso a todas as lojas automaticamente.</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setUserModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={submitting} onClick={submitUser} disabled={!userForm.name || !userForm.email || (userForm.password && userForm.password !== userForm.passwordConfirm)}>{userEditId ? "Salvar" : "Criar"}</Button>
          </div>
        </div>
      </Modal>

      {/* CUSTOMER MODAL */}
      <Modal open={customerModal} onClose={() => setCustomerModal(false)} title="Novo Cliente">
        <div className="space-y-4">
          <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Nome *</label><input value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">CPF</label><input value={cpfMask(customerForm.document)} onChange={(e) => setCustomerForm({ ...customerForm, document: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="000.000.000-00" className={inputClass} /></div>
            <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Data de Nascimento</label><input type="date" value={customerForm.birthDate} onChange={(e) => setCustomerForm({ ...customerForm, birthDate: e.target.value })} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">WhatsApp</label><input value={whatsappMask(customerForm.whatsapp)} onChange={(e) => setCustomerForm({ ...customerForm, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="(99) 9 9999-9999" className={inputClass} /></div>
            <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Telefone</label><input value={phoneMask(customerForm.phone)} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })} className={inputClass} /></div>
          </div>
          <div className="space-y-1"><label className="block text-sm font-medium text-gray-700">Email</label><input type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} className={inputClass} /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCustomerModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={submitting} onClick={submitCustomer} disabled={!customerForm.name}>Cadastrar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}







