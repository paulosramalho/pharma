import { useMemo, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import Button from "../ui/Button";
import { cpfCnpjMask, phoneMask } from "../../lib/format";

const STEPS = [
  { key: 1, label: "Identificacao" },
  { key: 2, label: "Endereco" },
  { key: 3, label: "Comunicacao e logo" },
  { key: 4, label: "Pacote e admin" },
];

function cepMask(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function isValidCpf(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (let t = 9; t < 11; t += 1) {
    let sum = 0;
    for (let i = 0; i < t; i += 1) sum += Number(d[i]) * (t + 1 - i);
    const digit = ((sum * 10) % 11) % 10;
    if (Number(d[t]) !== digit) return false;
  }
  return true;
}

function isValidCnpj(cnpj) {
  const d = String(cnpj || "").replace(/\D/g, "");
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

function isValidCpfCnpj(value) {
  const d = String(value || "").replace(/\D/g, "");
  if (!d) return true;
  if (d.length === 11) return isValidCpf(d);
  if (d.length === 14) return isValidCnpj(d);
  return false;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OnboardingLicencaWizard({ canManage, catalog = [], defaultPlanCode = "MINIMO", onSuccess, addToast }) {
  const [step, setStep] = useState(1);
  const [loadingCep, setLoadingCep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdAdmin, setCreatedAdmin] = useState(null);
  const fileRef = useRef(null);
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

  const setContractor = (k, v) => {
    setForm((prev) => ({ ...prev, contractor: { ...prev.contractor, [k]: v } }));
  };

  const canNext = useMemo(() => {
    const c = form.contractor;
    if (step === 1) return Boolean(c.nameOrCompany.trim()) && isValidCpfCnpj(c.document);
    if (step === 2) return Boolean(c.zipCode.replace(/\D/g, "").length === 8 && c.street && c.district && c.city && c.state);
    if (step === 3) return (!c.email || isValidEmail(c.email));
    if (step === 4) return Boolean(form.planCode && form.admin.name.trim() && isValidEmail(form.admin.email));
    return false;
  }, [form, step]);

  const buscarCep = async () => {
    const cep = String(form.contractor.zipCode || "").replace(/\D/g, "");
    if (cep.length !== 8) return addToast?.("CEP invalido", "warning");
    setLoadingCep(true);
    const applyCepData = (d) => {
      setForm((prev) => ({
        ...prev,
        contractor: {
          ...prev.contractor,
          zipCode: d.zipCode || cep,
          street: d.street || "",
          complement: d.complement || "",
          district: d.district || "",
          city: d.city || "",
          state: String(d.state || "").toUpperCase(),
        },
      }));
    };
    try {
      const res = await apiFetch(`/api/license/cep/${cep}`);
      const d = res.data || {};
      applyCepData(d);
      addToast?.("Endereco preenchido pelo CEP", "success");
    } catch (err) {
      try {
        // Fallback: consulta direta no navegador quando o backend nao consegue acessar o ViaCEP.
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!response.ok) throw new Error("Falha ao consultar CEP");
        const viaCep = await response.json();
        if (viaCep?.erro) throw new Error("CEP nao encontrado");
        applyCepData({
          zipCode: cep,
          street: String(viaCep.logradouro || "").trim() || "",
          complement: String(viaCep.complemento || "").trim() || "",
          district: String(viaCep.bairro || "").trim() || "",
          city: String(viaCep.localidade || "").trim() || "",
          state: String(viaCep.uf || "").trim().toUpperCase() || "",
        });
        addToast?.("Endereco preenchido pelo CEP", "success");
      } catch {
        addToast?.(err.message || "Falha ao buscar CEP", "error");
      }
    } finally {
      setLoadingCep(false);
    }
  };

  const montarAddressFull = (c) => {
    const left = [c.street, c.number, c.complement].filter(Boolean).join(", ");
    const right = [c.district, c.city, c.state].filter(Boolean).join(" - ");
    return [left, right].filter(Boolean).join(" | ");
  };

  const onFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await toDataUrl(file);
      setContractor("logoFile", dataUrl);
      addToast?.("Arquivo de logo carregado", "success");
    } catch {
      addToast?.("Nao foi possivel ler o arquivo", "error");
    } finally {
      event.target.value = "";
    }
  };

  const finalizar = async () => {
    if (!canManage) return;
    const c = form.contractor;
    if (!isValidCpfCnpj(c.document)) return addToast?.("CPF/CNPJ invalido", "error");
    if (!canNext) return;

    setSaving(true);
    try {
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
      addToast?.("Novo contratante cadastrado com sucesso", "success");
      onSuccess?.(res.data || null);
    } catch (err) {
      addToast?.(err.message || "Falha ao finalizar onboarding", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 rounded-lg border border-gray-200 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Novo contratante</p>
        <p className="text-xs text-gray-500">Etapa {step}/4</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {STEPS.map((s) => (
          <div key={s.key} className={`text-xs px-2 py-1 rounded border ${step === s.key ? "border-primary-500 text-primary-700 bg-primary-50" : "border-gray-200 text-gray-500"}`}>
            {s.key}. {s.label}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">CPF/CNPJ</label>
            <input
              className={inputClass}
              value={cpfCnpjMask(form.contractor.document)}
              onChange={(e) => setContractor("document", String(e.target.value || "").replace(/\D/g, "").slice(0, 14))}
            />
            {form.contractor.document && !isValidCpfCnpj(form.contractor.document) ? (
              <p className="text-xs text-red-600">Documento invalido</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nome/Razao social *</label>
            <input className={inputClass} value={form.contractor.nameOrCompany} onChange={(e) => setContractor("nameOrCompany", e.target.value)} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">CEP *</label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={cepMask(form.contractor.zipCode)}
                onChange={(e) => setContractor("zipCode", String(e.target.value || "").replace(/\D/g, "").slice(0, 8))}
              />
              <Button type="button" variant="secondary" onClick={buscarCep} loading={loadingCep}>Buscar</Button>
            </div>
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="block text-sm font-medium text-gray-700">Logradouro *</label>
            <input className={inputClass} value={form.contractor.street} onChange={(e) => setContractor("street", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Numero</label>
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
            <input
              className={inputClass}
              value={phoneMask(form.contractor.phoneWhatsapp)}
              onChange={(e) => setContractor("phoneWhatsapp", String(e.target.value || "").replace(/\D/g, "").slice(0, 11))}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">E-mail</label>
            <input type="email" className={inputClass} value={form.contractor.email} onChange={(e) => setContractor("email", e.target.value)} />
            {form.contractor.email && !isValidEmail(form.contractor.email) ? (
              <p className="text-xs text-red-600">E-mail invalido</p>
            ) : null}
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="block text-sm font-medium text-gray-700">Logo (URL/base64)</label>
            <input className={inputClass} value={form.contractor.logoFile} onChange={(e) => setContractor("logoFile", e.target.value)} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.svg,image/*" onChange={onFileChange} className="hidden" />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              Inserir arquivo
            </Button>
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
          <p>Usuario: {createdAdmin.email}</p>
          <p>Senha provisoria: <span className="font-mono">{createdAdmin.temporaryPassword}</span></p>
          <p className="text-xs mt-1">Esse usuario sera obrigado a trocar senha no primeiro login.</p>
        </div>
      ) : null}

      <div className="flex justify-between">
        <Button type="button" variant="secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
          Voltar
        </Button>
        {step < 4 ? (
          <Button type="button" onClick={() => canNext && setStep((s) => Math.min(4, s + 1))} disabled={!canNext}>
            Avancar
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
