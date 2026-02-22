import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import Button from "../ui/Button";

const steps = [
  { key: 1, label: "Identificação" },
  { key: 2, label: "Endereço" },
  { key: 3, label: "Comunicação e logo" },
  { key: 4, label: "Pacote e admin" },
];

export default function OnboardingLicencaWizard({ canManage, catalog = [], defaultPlanCode = "MINIMO", onSuccess, addToast }) {
  const [step, setStep] = useState(1);
  const [loadingCep, setLoadingCep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdAdmin, setCreatedAdmin] = useState(null);
  const [form, setForm] = useState({
    contractor: {
      document: "",
      nameOrCompany: "",
      zipCode: "",
      street: "",
      number: "",
      complement: "",
      district: "",
      city: "",
      state: "",
      phoneWhatsapp: "",
      email: "",
      logoFile: "",
    },
    planCode: defaultPlanCode || "MINIMO",
    admin: {
      name: "",
      email: "",
    },
  });

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";
  const canNext = useMemo(() => {
    const c = form.contractor;
    if (step === 1) return Boolean(c.nameOrCompany.trim());
    if (step === 2) return Boolean(c.zipCode.length === 8 && c.street && c.district && c.city && c.state);
    if (step === 3) return true;
    if (step === 4) return Boolean(form.planCode && form.admin.name.trim() && form.admin.email.trim());
    return false;
  }, [form, step]);

  const setContractor = (k, v) => {
    setForm((prev) => ({ ...prev, contractor: { ...prev.contractor, [k]: v } }));
  };

  const buscarCep = async () => {
    const cep = String(form.contractor.zipCode || "").replace(/\D/g, "");
    if (cep.length !== 8) return addToast?.("CEP inválido", "warning");
    setLoadingCep(true);
    try {
      const res = await apiFetch(`/api/license/cep/${cep}`);
      const d = res.data || {};
      // Regra solicitada: resultado da busca se sobrepõe ao informado.
      setForm((prev) => ({
        ...prev,
        contractor: {
          ...prev.contractor,
          zipCode: d.zipCode || cep,
          street: d.street || "",
          complement: d.complement || "",
          district: d.district || "",
          city: d.city || "",
          state: d.state || "",
        },
      }));
      addToast?.("Endereço preenchido pelo CEP", "success");
    } catch (err) {
      addToast?.(err.message || "Falha ao buscar CEP", "error");
    } finally {
      setLoadingCep(false);
    }
  };

  const montarAddressFull = (c) => {
    const left = [c.street, c.number, c.complement].filter(Boolean).join(", ");
    const right = [c.district, c.city, c.state].filter(Boolean).join(" - ");
    return [left, right].filter(Boolean).join(" | ");
  };

  const finalizar = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const c = form.contractor;
      const payload = {
        contractor: {
          document: String(c.document || "").replace(/\D/g, ""),
          nameOrCompany: String(c.nameOrCompany || "").trim(),
          zipCode: String(c.zipCode || "").replace(/\D/g, ""),
          street: String(c.street || "").trim(),
          number: String(c.number || "").trim(),
          complement: String(c.complement || "").trim(),
          district: String(c.district || "").trim(),
          city: String(c.city || "").trim(),
          state: String(c.state || "").trim().toUpperCase().slice(0, 2),
          addressFull: montarAddressFull(c),
          phoneWhatsapp: String(c.phoneWhatsapp || "").replace(/\D/g, ""),
          email: String(c.email || "").trim().toLowerCase(),
          logoFile: String(c.logoFile || "").trim(),
        },
        planCode: String(form.planCode || "").toUpperCase(),
        admin: {
          name: String(form.admin.name || "").trim(),
          email: String(form.admin.email || "").trim().toLowerCase(),
        },
      };
      const res = await apiFetch("/api/license/onboarding/finalize", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreatedAdmin(res.data?.admin || null);
      addToast?.("Onboarding de licenciamento concluído", "success");
      if (onSuccess) onSuccess(res.data || null);
    } catch (err) {
      addToast?.(err.message || "Falha ao finalizar onboarding", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Onboarding de licenciamento</p>
        <p className="text-xs text-gray-500">Etapa {step}/4</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {steps.map((s) => (
          <div key={s.key} className={`text-xs px-2 py-1 rounded border ${step === s.key ? "border-primary-500 text-primary-700 bg-primary-50" : "border-gray-200 text-gray-500"}`}>
            {s.key}. {s.label}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">CPF/CNPJ</label>
            <input className={inputClass} value={form.contractor.document} onChange={(e) => setContractor("document", String(e.target.value || "").replace(/\D/g, "").slice(0, 14))} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nome/Razão social *</label>
            <input className={inputClass} value={form.contractor.nameOrCompany} onChange={(e) => setContractor("nameOrCompany", e.target.value)} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">CEP *</label>
            <div className="flex gap-2">
              <input className={inputClass} value={form.contractor.zipCode} onChange={(e) => setContractor("zipCode", String(e.target.value || "").replace(/\D/g, "").slice(0, 8))} />
              <Button type="button" variant="secondary" onClick={buscarCep} loading={loadingCep}>Buscar</Button>
            </div>
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="block text-sm font-medium text-gray-700">Logradouro *</label>
            <input className={inputClass} value={form.contractor.street} onChange={(e) => setContractor("street", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Número</label>
            <input className={inputClass} value={form.contractor.number} onChange={(e) => setContractor("number", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Complemento</label>
            <input className={inputClass} value={form.contractor.complement} onChange={(e) => setContractor("complement", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Bairro *</label>
            <input className={inputClass} value={form.contractor.district} onChange={(e) => setContractor("district", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Cidade *</label>
            <input className={inputClass} value={form.contractor.city} onChange={(e) => setContractor("city", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">UF *</label>
            <input className={inputClass} maxLength={2} value={form.contractor.state} onChange={(e) => setContractor("state", String(e.target.value || "").toUpperCase())} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Telefone/WhatsApp</label>
            <input className={inputClass} value={form.contractor.phoneWhatsapp} onChange={(e) => setContractor("phoneWhatsapp", String(e.target.value || "").replace(/\D/g, "").slice(0, 11))} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">E-mail</label>
            <input type="email" className={inputClass} value={form.contractor.email} onChange={(e) => setContractor("email", e.target.value)} />
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="block text-sm font-medium text-gray-700">Logo (URL/base64)</label>
            <input className={inputClass} value={form.contractor.logoFile} onChange={(e) => setContractor("logoFile", e.target.value)} />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Pacote *</label>
            <select className={inputClass} value={form.planCode} onChange={(e) => setForm((prev) => ({ ...prev, planCode: e.target.value }))}>
              {(catalog || []).map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nome do Admin *</label>
            <input className={inputClass} value={form.admin.name} onChange={(e) => setForm((prev) => ({ ...prev, admin: { ...prev.admin, name: e.target.value } }))} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">E-mail do Admin *</label>
            <input type="email" className={inputClass} value={form.admin.email} onChange={(e) => setForm((prev) => ({ ...prev, admin: { ...prev.admin, email: e.target.value } }))} />
          </div>
        </div>
      )}

      {createdAdmin?.temporaryPassword ? (
        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
          <p className="font-semibold">Admin provisório criado</p>
          <p>Usuário: {createdAdmin.email}</p>
          <p>Senha provisória: <span className="font-mono">{createdAdmin.temporaryPassword}</span></p>
          <p className="text-xs mt-1">Esse usuário será obrigado a trocar senha no primeiro login.</p>
        </div>
      ) : null}

      <div className="flex justify-between">
        <Button type="button" variant="secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
          Voltar
        </Button>
        {step < 4 ? (
          <Button type="button" onClick={() => canNext && setStep((s) => Math.min(4, s + 1))} disabled={!canNext}>
            Avançar
          </Button>
        ) : (
          <Button type="button" onClick={finalizar} loading={saving} disabled={!canNext || !canManage}>
            Finalizar onboarding
          </Button>
        )}
      </div>
    </div>
  );
}
