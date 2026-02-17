// ─── Money ───
export function money(value) {
  const n = typeof value === "string" ? parseFloat(value) : (value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Parse "1.234,56" or "1234.56" → number
export function parseMoney(str) {
  if (!str) return 0;
  const s = String(str).replace(/\s/g, "");
  // If has comma as decimal separator (Brazilian)
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

// Format input as money while typing: "123456" → "1.234,56"
export function moneyMask(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── CPF / CNPJ ───
export function cpfMask(v) {
  const d = String(v).replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function cnpjMask(v) {
  const d = String(v).replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function cpfCnpjMask(v) {
  const d = String(v).replace(/\D/g, "");
  return d.length <= 11 ? cpfMask(d) : cnpjMask(d);
}

export function validateCPF(cpf) {
  const d = String(cpf).replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += parseInt(d[i]) * (t + 1 - i);
    const digit = ((sum * 10) % 11) % 10;
    if (parseInt(d[t]) !== digit) return false;
  }
  return true;
}

export function validateCNPJ(cnpj) {
  const d = String(cnpj).replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let t = 0; t < 2; t++) {
    const w = t === 0 ? weights1 : weights2;
    let sum = 0;
    for (let i = 0; i < w.length; i++) sum += parseInt(d[i]) * w[i];
    const digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (parseInt(d[12 + t]) !== digit) return false;
  }
  return true;
}

export function validateCPFOrCNPJ(v) {
  const d = String(v).replace(/\D/g, "");
  return d.length <= 11 ? validateCPF(d) : validateCNPJ(d);
}

// ─── Phone ───
export function phoneMask(v) {
  const d = String(v).replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// WhatsApp: (99) 9 9999-9999
export function whatsappMask(v) {
  const d = String(v).replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 3) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

// ─── Date ───
export function formatDate(v) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-BR");
}

export function formatDateTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR");
}

export function formatTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
