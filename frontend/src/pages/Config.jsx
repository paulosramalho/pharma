import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cnpjMask, phoneMask, cpfMask, whatsappMask, formatDate } from "../lib/format";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import Table from "../components/ui/Table";
import EmptyState from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import { Settings, Store, Shield, Plus, Pencil, Users, UserCheck } from "lucide-react";

const TABS = [
  { key: "lojas", label: "Lojas", icon: Store },
  { key: "usuarios", label: "Usuários", icon: Users },
  { key: "clientes", label: "Clientes", icon: UserCheck },
  { key: "permissoes", label: "Permissões", icon: Shield },
];

const TYPE_LABELS = { CENTRAL: "Central (Depósito)", LOJA: "Loja" };
const ROLE_COLORS = { ADMIN: "purple", CAIXA: "blue", VENDEDOR: "green", FARMACUTICO: "yellow" };
const ROLE_LABELS = { ADMIN: "Administrador", CAIXA: "Caixa", VENDEDOR: "Vendedor", FARMACEUTICO: "Farmacêutico" };

const emptyStoreForm = { name: "", type: "LOJA", cnpj: "", phone: "", email: "", street: "", number: "", complement: "", district: "", city: "", state: "", zipCode: "" };
const emptyUserForm = { name: "", email: "", password: "", passwordConfirm: "", roleName: "VENDEDOR" };
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
  { name: "FARMACEUTICO", perms: ["products.manage", "inventory.receive", "inventory.adjust", "sales.create", "reports.view"] },
];

export default function Config() {
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

  const [submitting, setSubmitting] = useState(false);

  // Load data based on tab
  useEffect(() => {
    setLoading(true);
    if (tab === "lojas") {
      apiFetch("/api/stores?all=true").then((res) => setStores(res.data || [])).catch((err) => addToast(err.message, "error")).finally(() => setLoading(false));
    } else if (tab === "usuarios") {
      apiFetch("/api/users").then((res) => setUsers(res.data || [])).catch((err) => addToast(err.message, "error")).finally(() => setLoading(false));
    } else if (tab === "clientes") {
      loadCustomers();
    } else {
      setLoading(false);
    }
  }, [tab]);

  const loadCustomers = (search) => {
    setLoading(true);
    const q = search || customerSearch;
    const url = q && q.length >= 2 ? `/api/customers?search=${encodeURIComponent(q)}` : "/api/customers";
    apiFetch(url).then((res) => setCustomers(res.data?.customers || [])).catch((err) => addToast(err.message, "error")).finally(() => setLoading(false));
  };

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";

  // ─── STORE HANDLERS ───
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

  // ─── USER HANDLERS ───
  const openCreateUser = () => { setUserForm(emptyUserForm); setUserEditId(null); setUserModal(true); };
  const openEditUser = (u) => {
    setUserForm({ name: u.name, email: u.email, password: "", passwordConfirm: "", roleName: u.role?.name || "VENDEDOR" });
    setUserEditId(u.id); setUserModal(true);
  };
  const submitUser = async () => {
    if (userForm.password && userForm.password !== userForm.passwordConfirm) {
      addToast("As senhas não coincidem", "error"); return;
    }
    setSubmitting(true);
    try {
      const body = { name: userForm.name, email: userForm.email, roleName: userForm.roleName };
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

  // ─── CUSTOMER HANDLERS ───
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === t.key ? "bg-white text-primary-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ LOJAS TAB ═══ */}
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

      {/* ═══ USUARIOS TAB ═══ */}
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
                        <td className="px-4 py-2"><button onClick={() => openEditUser(u)} className="p-1 text-gray-400 hover:text-primary-600 rounded"><Pencil size={14} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ═══ CLIENTES TAB ═══ */}
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

      {/* ═══ PERMISSOES TAB ═══ */}
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

      {/* ═══ STORE MODAL ═══ */}
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
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Endereco</p>
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

      {/* ═══ USER MODAL ═══ */}
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
            <select value={userForm.roleName} onChange={(e) => setUserForm({ ...userForm, roleName: e.target.value })} className={inputClass}>
              <option value="ADMIN">Administrador</option><option value="VENDEDOR">Vendedor</option><option value="CAIXA">Caixa</option><option value="FARMACEUTICO">Farmacêutico</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setUserModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={submitting} onClick={submitUser} disabled={!userForm.name || !userForm.email || (userForm.password && userForm.password !== userForm.passwordConfirm)}>{userEditId ? "Salvar" : "Criar"}</Button>
          </div>
        </div>
      </Modal>

      {/* ═══ CUSTOMER MODAL ═══ */}
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
