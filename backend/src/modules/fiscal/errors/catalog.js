// backend/src/modules/fiscal/errors/catalog.js
const { FISCAL } = require("./fiscalErrors");

function listFiscalErrors() {
  // expõe apenas os "load-bearing"
  return [
    FISCAL.DOC_NOT_FOUND,
    FISCAL.CFG_NOT_FOUND,
    FISCAL.NOT_SIGNED,
    FISCAL.INVALID_STATUS,
    FISCAL.SEFAZ_TIMEOUT,
    FISCAL.SEFAZ_UNAVAIL,
    { http: 422, code: "SEFAZ_REJECT_###", message: "Rejeição SEFAZ (detalhes no payload)" },
  ];
}

module.exports = { listFiscalErrors };
