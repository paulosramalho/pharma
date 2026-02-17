// backend/src/modules/fiscal/errors/fiscalErrors.js
// Catálogo enxuto (padrão) para o módulo fiscal.
const FISCAL = {
  DOC_NOT_FOUND:  { http: 404, code: "FISCAL_DOC_NOT_FOUND", message: "Documento fiscal não encontrado" },
  CFG_NOT_FOUND:  { http: 400, code: "FISCAL_CFG_NOT_FOUND", message: "FiscalConfig não encontrado para esta loja" },
  NOT_SIGNED:     { http: 400, code: "FISCAL_NOT_SIGNED", message: "Documento deve estar assinado (SIGNED) antes do envio" },
  INVALID_STATUS: { http: 409, code: "FISCAL_INVALID_STATUS", message: "Status do documento não permite esta operação" },

  SEFAZ_TIMEOUT:  { http: 504, code: "SEFAZ_TIMEOUT", message: "Timeout ao comunicar com SEFAZ" },
  SEFAZ_UNAVAIL:  { http: 503, code: "SEFAZ_UNAVAILABLE", message: "SEFAZ indisponível" },

  // Rejeições (front consegue tratar por prefixo)
  REJECT: (rejCode, message, details) => ({
    http: 422,
    code: `SEFAZ_REJECT_${String(rejCode).padStart(3,"0")}`,
    message: message || "Rejeição SEFAZ",
    details,
  }),
};

module.exports = { FISCAL };
