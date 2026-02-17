// backend/src/modules/fiscal/qr/qrCode.js
// QRCode NFC-e (MOCK)
// No real, o QRCode depende de CSC (id/token) e do padrão por UF/ambiente.
// Aqui geramos:
// - payload padrão "p=" com chave e parâmetros mínimos
// - url de consulta mock, determinística, para uso em DEV/Front-end
//
// Referência conceitual: QRCode NFC-e usa querystring "p=" com chave + versão + ambiente + hash CSC.
// Neste mock, substituímos o hash por um token determinístico (sha256) para testes.

const crypto = require("crypto");

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

// tpAmb: 1=prod, 2=homolog
function buildNfceQrPayloadMock({ accessKey, tpAmb = "2" }) {
  if (!accessKey || String(accessKey).replace(/\D/g, "").length !== 44) {
    const e = new Error("accessKey inválida para QR payload (esperado 44 dígitos).");
    e.statusCode = 400;
    throw e;
  }
  const chave = String(accessKey).replace(/\D/g, "");
  const versaoQr = "2"; // placeholder
  const token = sha256Hex(chave + "|" + tpAmb).slice(0, 12); // curto p/ DEV
  // p = chave|versao|tpAmb|token
  return `${chave}|${versaoQr}|${tpAmb}|${token}`;
}

function buildNfceConsultaUrlMock({ accessKey, tpAmb = "2" }) {
  const payload = buildNfceQrPayloadMock({ accessKey, tpAmb });
  // URL fake para DEV (front pode renderizar QR com esta URL)
  const base = "https://nfce.mock/consulta";
  return `${base}?p=${encodeURIComponent(payload)}`;
}

module.exports = { buildNfceQrPayloadMock, buildNfceConsultaUrlMock };
