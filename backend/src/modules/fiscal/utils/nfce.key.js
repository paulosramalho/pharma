// backend/src/modules/fiscal/utils/nfce.key.js
// Geração da Chave de Acesso (44) + DV (módulo 11) para NFC-e (modelo 65).
// Estrutura da chave (44):
// cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9) + tpEmis(1) + cNF(8) + DV(1)

function onlyDigits(s) {
  return String(s ?? "").replace(/\D/g, "");
}

function padLeft(v, len) {
  return String(v ?? "").padStart(len, "0");
}

// DV módulo 11 (peso 2..9 da direita p/ esquerda)
function calcMod11DV(base43) {
  let weight = 2;
  let sum = 0;
  for (let i = base43.length - 1; i >= 0; i--) {
    sum += Number(base43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  const dv = 11 - mod;
  if (dv === 0 || dv === 10 || dv === 11) return "0";
  return String(dv);
}

function randomCNF8() {
  const n = Math.floor(Math.random() * 100000000);
  return padLeft(n, 8);
}

function buildAccessKey({ ufCode, issueDate, cnpj, model = "65", series, number, tpEmis = "1", cnf } = {}) {
  const cUF = padLeft(onlyDigits(ufCode), 2);
  const dt = issueDate instanceof Date ? issueDate : new Date(issueDate || Date.now());
  const aamm = padLeft(dt.getFullYear() % 100, 2) + padLeft(dt.getMonth() + 1, 2);
  const CNPJ = padLeft(onlyDigits(cnpj), 14);
  const mod = padLeft(model, 2);
  const serie = padLeft(series, 3);
  const nNF = padLeft(number, 9);
  const tp = padLeft(onlyDigits(tpEmis), 1);
  const cNF = padLeft(onlyDigits(cnf || randomCNF8()), 8);

  const base43 = `${cUF}${aamm}${CNPJ}${mod}${serie}${nNF}${tp}${cNF}`;
  if (base43.length !== 43) {
    const err = new Error(`Chave base inválida (esperado 43, veio ${base43.length}).`);
    err.statusCode = 500;
    throw err;
  }
  const dv = calcMod11DV(base43);
  return { accessKey: base43 + dv, cnf: cNF, dv };
}

function extractCNF(accessKey44) {
  const k = onlyDigits(accessKey44);
  if (k.length !== 44) return null;
  return k.substring(35, 43);
}

module.exports = { buildAccessKey, calcMod11DV, extractCNF, onlyDigits, padLeft };
