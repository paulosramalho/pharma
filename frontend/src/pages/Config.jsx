import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { cnpjMask, phoneMask, cpfMask, cpfCnpjMask, validateCPFOrCNPJ, whatsappMask, formatDate } from "../lib/format";
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

export default function Config() {
  const { user, isLicenseActive } = useAuth();
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
  const [novoContratanteMode, setNovoContratanteMode] = useState(false);
  const contractorLogoInputRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const adminLicenseLocked = user?.role === "ADMIN" && !isLicenseActive;
  const [licensesList, setLicensesList] = useState([]);
  const [licensesLoading, setLicensesLoading] = useState(false);
  const [selectedLicenseId, setSelectedLicenseId] = useState("");
  const [cleanupTarget, setCleanupTarget] = useState(null);
  const [cleanupConfirm, setCleanupConfirm] = useState("");
  const [cleanupSubmitting, setCleanupSubmitting] = useState(false);

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
      ])
        .then(([res, listRes]) => {
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
          setLicensesList(list);
          setSelectedLicenseId((prev) => {
            if (prev && list.some((l) => l.id === prev && !l.isDeveloperTenant)) return prev;
            return "";
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
        addToast("Licenca removida com sucesso", "success");
      }
      setCleanupTarget(null);
      const listRes = await apiFetch("/api/license/admin/licenses");
      setLicensesList(listRes?.data?.licenses || []);
    } catch (err) {
      addToast(err.message || "Falha ao limpar licenca", "error");
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
  const moneyLabel = (cents, currency = "BRL") =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(cents || 0) / 100);

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
      addToast("Licenca atualizada com sucesso!", "success");
    } catch (err) {
      addToast(err.message || "Erro ao atualizar licenca", "error");
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
      addToast("CPF/CNPJ invalido", "error");
      return;
    }
    const contractorZipDigits = String(contractorForm.zipCode || "").replace(/\D/g, "");
    if (contractorZipDigits && contractorZipDigits.length !== 8) {
      addToast("CEP invalido", "error");
      return;
    }
    const phoneDigits = String(contractorForm.phoneWhatsapp || "").replace(/\D/g, "");
    if (phoneDigits && phoneDigits.length !== 10 && phoneDigits.length !== 11) {
      addToast("Telefone/WhatsApp invalido", "error");
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
      addToast("Nao foi possivel ler o arquivo", "error");
    } finally {
      event.target.value = "";
    }
  };

  const dateLabel = (v) => (v ? formatDate(v) : "—");
  const moduloHabilitado = (features = {}) =>
    Object.entries(features)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => MODULO_LABELS[key] || key);

  const perfisContratados = (limits = {}) =>
    Object.entries(limits?.maxRoleActive || {})
      .filter(([, qty]) => Number(qty) > 0)
      .map(([role, qty]) => `${PERFIL_LABELS[role] || role}: ${qty}`);

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {((adminLicenseLocked || novoContratanteMode) ? TABS.filter((t) => t.key === "licenciamento") : TABS).map((t) => (
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
                  <Button type="button" variant={novoContratanteMode ? "secondary" : "primary"} onClick={() => setNovoContratanteMode(false)}>
                    Contratantes
                  </Button>
                  <Button type="button" variant={novoContratanteMode ? "primary" : "secondary"} onClick={() => setNovoContratanteMode(true)}>
                    Novo contratante
                  </Button>
                </div>
              ) : null}

              {!novoContratanteMode ? (
                <>
                  {isDeveloperAdmin ? (
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

                  {isDeveloperAdmin && !selectedLicense ? (
                    <div className="p-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-600">
                      Selecione um contratante para visualizar o plano e alterar a licença.
                    </div>
                  ) : (
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
                  </div>
                  )}
                </>
              ) : (
                <>
                  <OnboardingLicencaWizard
                    canManage={isDeveloperAdmin}
                    catalog={licenseData?.catalog || []}
                    defaultPlanCode={licenseForm.planCode}
                    addToast={addToast}
                    onSuccess={() => {
                      setNovoContratanteMode(false);
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






