// backend/src/modules/fiscal/providers/mock.provider.js
// Provider MOCK com suporte a rejeições simuladas.
// Controle por ENV: MOCK_SEFAZ_REJECT
// Exemplos:
//   MOCK_SEFAZ_REJECT=NONE
//   MOCK_SEFAZ_REJECT=351  (sempre rejeita com 351)
//   MOCK_SEFAZ_REJECT=RANDOM (rejeita aleatoriamente ~25%)
//   MOCK_SEFAZ_REJECT=SEQUENCE:351,999,0 (351 na 1ª, 999 na 2ª, depois autoriza)

const crypto = require("crypto");
const { buildNfceConsultaUrlMock } = require("../qr/qrCode");

function randHex(len) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function makeProtocol() {
  const n = Math.floor(Math.random() * 1e15);
  return String(n).padStart(15, "0");
}

function parseRejectMode() {
  const raw = String(process.env.MOCK_SEFAZ_REJECT || "NONE").toUpperCase().trim();
  if (raw === "NONE" || raw === "0") return { mode: "NONE" };
  if (raw === "RANDOM") return { mode: "RANDOM" };
  if (raw.startsWith("SEQUENCE:")) {
    const list = raw.replace("SEQUENCE:", "").split(",").map(s => s.trim()).filter(Boolean);
    return { mode: "SEQUENCE", list };
  }
  // assume código
  return { mode: "CODE", code: raw };
}

let seqIdx = 0;

function pickRejection() {
  const cfg = parseRejectMode();
  if (cfg.mode === "NONE") return null;
  if (cfg.mode === "RANDOM") return (Math.random() < 0.25) ? "999" : null;
  if (cfg.mode === "CODE") return cfg.code;
  if (cfg.mode === "SEQUENCE") {
    const code = cfg.list[seqIdx] ?? null;
    seqIdx += 1;
    if (!code || code === "0" || code === "NONE") return null;
    return code;
  }
  return null;
}

function messageFor(code) {
  const c = String(code);
  if (c === "351") return "Rejeição 351: Duplicidade de NF-e (MOCK)";
  if (c === "999") return "Rejeição 999: Erro não catalogado (MOCK)";
  if (c === "215") return "Rejeição 215: Falha no schema XML (MOCK)";
  return `Rejeição ${c} (MOCK)`;
}

function mockProvider({ cfg, log }) {
  return {
    async authorizeNfce({ xml, requestId }) {
      const m = String(xml || "").match(/<infNFe[^>]*\sId="NFe(\d{44})"/);
      const accessKey = m?.[1] || null;
      const tpAmb = cfg?.env === "PROD" ? "1" : "2";

      const rej = pickRejection();
      if (rej) {
        log.warn("mock_nfce_reject", { requestId, accessKey, rejectionCode: rej });
        return {
          status: "REJECTED",
          rejectionCode: rej,
          message: messageFor(rej),
          details: { mocked: true, code: rej },
          accessKey,
          sefaz: { mocked: true, rejected: true, code: rej },
        };
      }

      const protocol = makeProtocol();
      const sefazReceipt = randHex(24);
      const qrCodeUrl = accessKey ? buildNfceConsultaUrlMock({ accessKey, tpAmb }) : null;

      log.info("mock_nfce_authorize", { requestId, accessKey, tpAmb, protocol });

      return {
        status: "AUTHORIZED",
        accessKey,
        protocol,
        sefazReceipt,
        message: "AUTORIZADO (MOCK)",
        xml,
        qrCodeUrl,
        sefaz: { mocked: true },
      };
    },
  };
}

module.exports = { mockProvider };
