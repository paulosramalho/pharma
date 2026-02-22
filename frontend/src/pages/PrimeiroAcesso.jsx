import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Button from "../components/ui/Button";

export default function PrimeiroAcesso() {
  const { user, refreshSession } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user && !user.mustChangePassword) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";

  const submit = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    if (!name.trim()) return addToast("Nome obrigatório", "error");
    if (!email.trim()) return addToast("E-mail obrigatório", "error");
    if (!currentPassword) return addToast("Informe a senha provisória", "error");
    if (!newPassword) return addToast("Informe a nova senha", "error");
    if (newPassword.length < 4) return addToast("Nova senha deve ter no mínimo 4 caracteres", "error");
    if (newPassword !== confirmPassword) return addToast("As senhas não coincidem", "error");

    setSaving(true);
    try {
      await apiFetch(`/api/users/${user.id}/profile`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          currentPassword,
          newPassword,
        }),
      });
      await refreshSession();
      addToast("Primeiro acesso concluído com sucesso!", "success");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      addToast(err.message || "Falha ao concluir primeiro acesso", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <h1 className="text-lg font-semibold text-gray-900">Primeiro acesso</h1>
            <p className="text-sm text-gray-500">
              Atualize seus dados e troque a senha provisória para continuar.
            </p>
          </CardHeader>
          <CardBody>
            <form className="space-y-3" onSubmit={submit}>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Nome</label>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">E-mail</label>
                <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Senha provisória</label>
                <input type="password" className={inputClass} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Nova senha</label>
                <input type="password" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Confirmar nova senha</label>
                <input type="password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <div className="pt-2">
                <Button type="submit" loading={saving} className="w-full">Concluir primeiro acesso</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
