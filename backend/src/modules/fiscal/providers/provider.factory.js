// backend/src/modules/fiscal/providers/provider.factory.js
const { mockProvider } = require("./mock.provider");
const { sefazProvider } = require("./sefaz.provider");

function getProvider({ cfg, log } = {}) {
  // Por padrão, usamos MOCK até configurar UF/URLs/cert e liberar emissão real.
  // Para habilitar SEFAZ real: setar FISCAL_PROVIDER=SEFAZ no .env (ou cfg.env/projeto).
  const providerName = (process.env.FISCAL_PROVIDER || "MOCK").toUpperCase();
  if (providerName === "SEFAZ") return sefazProvider({ cfg, log });
  return mockProvider({ cfg, log });
}

module.exports = { getProvider };
