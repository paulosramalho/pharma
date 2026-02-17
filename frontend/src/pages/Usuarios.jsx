import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { formatDate } from "../lib/format";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import Table from "../components/ui/Table";
import EmptyState from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import { Users, Plus, Pencil } from "lucide-react";

const ROLE_COLORS = { ADMIN: "purple", CAIXA: "blue", VENDEDOR: "green", FARMACEUTICO: "yellow" };
const ROLE_LABELS = { ADMIN: "Administrador", CAIXA: "Caixa", VENDEDOR: "Vendedor", FARMACEUTICO: "Farmaceutico" };
const emptyForm = { name: "", email: "", password: "", roleName: "VENDEDOR" };

export default function UsuariosPage() {
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch("/api/users")
      .then((res) => setUsers(res.data || []))
      .catch((err) => addToast(err.message, "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditId(null);
    setModal(true);
  };

  const openEdit = (user) => {
    setForm({ name: user.name, email: user.email, password: "", roleName: user.role?.name || "VENDEDOR" });
    setEditId(user.id);
    setModal(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body = { name: form.name, email: form.email, roleName: form.roleName };
      if (form.password) body.password = form.password;
      if (editId) {
        await apiFetch(`/api/users/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        addToast("Usuário atualizado!", "success");
      } else {
        if (!form.password) {
          addToast("Senha obrigatoria para novo usuário", "error");
          setSubmitting(false);
          return;
        }
        await apiFetch("/api/users", { method: "POST", body: JSON.stringify(body) });
        addToast("Usuário criado!", "success");
      }
      setModal(false);
      load();
    } catch (err) {
      addToast(err.message, "error");
    }
    setSubmitting(false);
  };

  const roleName = (r) => r.role?.name || r.role || "—";

  const columns = [
    { key: "matricula", label: "Matricula", render: (r) => (
      <span className="font-mono text-xs text-gray-500">{r.matricula || "—"}</span>
    )},
    { key: "name", label: "Nome", render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: "email", label: "Email", render: (r) => <span className="text-gray-500">{r.email}</span> },
    { key: "role", label: "Perfil", render: (r) => {
      const rn = roleName(r);
      return <Badge color={ROLE_COLORS[rn] || "gray"}>{ROLE_LABELS[rn] || rn}</Badge>;
    }},
    { key: "stores", label: "Lojas", render: (r) => (
      <span className="text-sm text-gray-500">{r.storeCount ?? r.stores?.length ?? 0}</span>
    )},
    { key: "active", label: "Status", render: (r) => (
      <Badge color={r.active ? "green" : "red"}>{r.active ? "Ativo" : "Inativo"}</Badge>
    )},
    { key: "createdAt", label: "Criado em", render: (r) => (
      <span className="text-xs text-gray-400">{r.createdAt ? formatDate(r.createdAt) : "—"}</span>
    )},
    { key: "actions", label: "", className: "w-10", render: (r) => (
      <button onClick={() => openEdit(r)} className="p-1 text-gray-400 hover:text-primary-600 rounded">
        <Pencil size={14} />
      </button>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        <Button onClick={openCreate}><Plus size={16} /> Novo Usuário</Button>
      </div>

      <Card>
        {loading ? <PageSpinner /> : users.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum usuário" />
        ) : (
          <Table columns={columns} data={users} />
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar Usuário" : "Novo Usuário"}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nome *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{editId ? "Nova Senha (deixe vazio para manter)" : "Senha *"}</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Perfil</label>
            <select value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="ADMIN">Administrador</option>
              <option value="VENDEDOR">Vendedor</option>
              <option value="CAIXA">Caixa</option>
              <option value="FARMACEUTICO">Farmaceutico</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={submitting} onClick={handleSubmit} disabled={!form.name || !form.email}>
              {editId ? "Salvar" : "Criar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
