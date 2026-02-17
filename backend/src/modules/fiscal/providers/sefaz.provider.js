// backend/src/modules/fiscal/providers/sefaz.provider.js
// ESQUELETO para integrar com webservices NFC-e 4.00.
// Implementação real envolve SOAP + TLS + certificado + schemas + retornos.
// Este arquivo já define o contrato e pontos de extensão.

function sefazProvider({ cfg, log } = {}) {
  return {
    async authorizeNfce({ xml, requestId }) {
      const err = new Error(
        "Provider SEFAZ ainda não implementado. Use FISCAL_PROVIDER=MOCK por enquanto."
      );
      err.statusCode = 501;
      log.warn("sefaz_provider_not_implemented", { requestId, uf: cfg?.uf, env: cfg?.env });
      throw err;
    },
  };
}

module.exports = { sefazProvider };
