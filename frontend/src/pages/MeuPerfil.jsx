import { useState } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import { User, Mail, Lock, Shield } from "lucide-react";

const ROLE_LABELS = { ADMIN: "Administrador", CAIXA: "Caixa", VENDEDOR: "Vendedor", FARMACEUTICO: "Farmaceutico" };

export default function MeuPerfil() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";

  const saveEmail = async () => {
    if (!email) { addToast("Email obrigatório", "error"); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/users/${user.id}/profile`, {
        method: "PUT",
        body: JSON.stringify({ email }),
      });
      addToast("Email atualizado!", "success");
      setEditingEmail(false);
    } catch (err) { addToast(err.message, "error"); }
    setSaving(false);
  };

  const savePassword = async () => {
    if (!currentPassword) { addToast("Senha atual obrigatória", "error"); return; }
    if (!newPassword) { addToast("Nova senha obrigatória", "error"); return; }
    if (newPassword !== confirmPassword) { addToast("As senhas não coincidem", "error"); return; }
    if (newPassword.length < 4) { addToast("Senha deve ter no mínimo 4 caracteres", "error"); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/users/${user.id}/profile`, {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      addToast("Senha alterada!", "success");
      setEditingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) { addToast(err.message, "error"); }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>

      {/* User Info Card */}
      <Card>
        <CardHeader className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xl font-bold">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{user?.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge color="blue">{ROLE_LABELS[user?.role] || user?.role}</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Email Section */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Email</h3>
          </div>
          {!editingEmail && (
            <button onClick={() => setEditingEmail(true)} className="text-sm text-primary-600 hover:underline">Alterar</button>
          )}
        </CardHeader>
        <CardBody>
          {editingEmail ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Novo Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoFocus />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setEditingEmail(false); setEmail(user?.email || ""); }}>Cancelar</Button>
                <Button size="sm" loading={saving} onClick={saveEmail} disabled={!email || email === user?.email}>Salvar</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-700">{user?.email}</p>
          )}
        </CardBody>
      </Card>

      {/* Password Section */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Senha</h3>
          </div>
          {!editingPassword && (
            <button onClick={() => setEditingPassword(true)} className="text-sm text-primary-600 hover:underline">Alterar</button>
          )}
        </CardHeader>
        <CardBody>
          {editingPassword ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Senha Atual</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} onPaste={(e) => e.preventDefault()} autoComplete="current-password" className={inputClass} autoFocus />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} onPaste={(e) => e.preventDefault()} autoComplete="new-password" className={inputClass} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Confirmar Nova Senha</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} onPaste={(e) => e.preventDefault()} autoComplete="new-password" className={inputClass} />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600">As senhas não coincidem</p>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setEditingPassword(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}>Cancelar</Button>
                <Button size="sm" loading={saving} onClick={savePassword} disabled={!currentPassword || !newPassword || newPassword !== confirmPassword}>Salvar</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">**********</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
