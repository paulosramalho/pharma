// backend/src/modules/fiscal/nfce.send.withRetry.js
const { withRetry } = require("./utils/retry");
const { httpError } = require("./errors/httpError");
const { FISCAL } = require("./errors/fiscalErrors");
const { getProvider } = require("./providers/provider.factory");

async function sendWithRetry({ prisma, log, doc, requestId }) {
  const cfg = await prisma.fiscalConfig.findUnique({ where: { storeId: doc.storeId } });
  if (!cfg) throw httpError(FISCAL.CFG_NOT_FOUND.http, FISCAL.CFG_NOT_FOUND.code, FISCAL.CFG_NOT_FOUND.message);

  const provider = getProvider({ cfg, log });

  const attempts = Number(process.env.SEFAZ_RETRY_ATTEMPTS || 3);
  const baseDelayMs = Number(process.env.SEFAZ_RETRY_BASE_DELAY_MS || 250);

  return withRetry(async (tryNo) => {
    // registra tentativa
    await prisma.fiscalEvent.create({
      data: {
        docId: doc.id,
        type: "ENVIO_TENTATIVA",
        message: `ENVIO NFC-e tentativa ${tryNo}`,
        payload: JSON.stringify({ tryNo, at: new Date().toISOString() }),
      },
    });

    const result = await provider.authorizeNfce({ xml: doc.xml, requestId });

    // Se provider devolver rejeição, lançamos erro 422 (sem retry)
    if (result?.status === "REJECTED") {
      const rej = FISCAL.REJECT(result.rejectionCode || "000", result.message, result.details);
      const e = httpError(rej.http, rej.code, rej.message, rej.details);
      // noRetry flag (informativo)
      // err.noRetry = true;
      throw e;
    }

    return result;
  }, { attempts, baseDelayMs });
}

module.exports = { sendWithRetry };
