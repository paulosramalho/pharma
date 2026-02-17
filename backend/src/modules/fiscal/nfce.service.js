// backend/src/modules/fiscal/nfce.service.js
const { buildNfceXmlDraft } = require("./xml/nfce.builder");
const { signNfceXmlA1Pfx } = require("./xml/nfce.signer");
const { buildAccessKey } = require("./utils/nfce.key");
const { sendWithRetry } = require("./nfce.send.withRetry");
const { httpError } = require("./errors/httpError");
const { FISCAL } = require("./errors/fiscalErrors");

function nfceService() {}

const UF_CODE = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
};

async function nextNfceNumber({ prisma, storeId, series = 1 }) {
  const seq = await prisma.fiscalSequence.upsert({
    where: { storeId_docType_series: { storeId, docType: "NFCE", series } },
    create: { storeId, docType: "NFCE", series, lastNumber: 0 },
    update: {},
  });

  const updated = await prisma.fiscalSequence.update({
    where: { id: seq.id },
    data: { lastNumber: { increment: 1 } },
  });

  return updated.lastNumber;
}

nfceService.prepare = async ({ prisma, log, input, requestId }) => {
  const storeId = input?.storeId;
  if (!storeId) throw httpError(400, "VALIDATION", "storeId é obrigatório");

  const cfg = await prisma.fiscalConfig?.findUnique?.({ where: { storeId } }).catch(() => null);
  if (!cfg) throw httpError(FISCAL.CFG_NOT_FOUND.http, FISCAL.CFG_NOT_FOUND.code, FISCAL.CFG_NOT_FOUND.message);

  const series = 1;
  const number = await nextNfceNumber({ prisma, storeId, series });

  const ufSigla = String(cfg.uf || "").toUpperCase().trim();
  const ufCode = UF_CODE[ufSigla] || null;
  if (!ufCode) throw httpError(400, "VALIDATION", `UF inválida em FiscalConfig.uf: "${cfg.uf}". Ex.: "PA", "SP".`);

  const issueAt = new Date();
  const { accessKey } = buildAccessKey({
    ufCode,
    issueDate: issueAt,
    cnpj: cfg.cnpj,
    model: "65",
    series,
    number,
    tpEmis: "1",
  });

  const xmlDraft = buildNfceXmlDraft({
    cfg: { ...cfg, ufCode },
    input,
    accessKey,
    series,
    number,
    issueAt,
  });

  const doc = await prisma.fiscalDocument.create({
    data: {
      storeId,
      type: "NFCE",
      status: "DRAFT",
      series,
      number,
      issueAt,
      accessKey,
      xml: xmlDraft,
      sefazMessage: "DRAFT criado (XML base) + chave 44 + DV.",
    },
  });

  log.info("nfce_prepare_ok", { requestId, docId: doc.id, storeId, series, number });
  return { ok: true, doc };
};

nfceService.sign = async ({ prisma, log, id, requestId }) => {
  const doc = await prisma.fiscalDocument.findUnique({ where: { id } });
  if (!doc) throw httpError(FISCAL.DOC_NOT_FOUND.http, FISCAL.DOC_NOT_FOUND.code, FISCAL.DOC_NOT_FOUND.message);
  if (!doc.xml) throw httpError(400, "VALIDATION", "Documento sem XML");

  const cfg = await prisma.fiscalConfig.findUnique({ where: { storeId: doc.storeId } });
  const signerMode = String(process.env.FISCAL_SIGNER || "").toUpperCase();
  if (signerMode !== "MOCK") {
    if (!cfg?.certPfxPath || !cfg?.certPassword) {
      throw httpError(400, "FISCAL_CERT_MISSING", "Certificado A1 (PFX) não configurado em FiscalConfig (certPfxPath/certPassword).");
    }
  }

  const signedXml = await signNfceXmlA1Pfx({
    xml: doc.xml,
    pfxPath: cfg?.certPfxPath,
    pfxPassword: cfg?.certPassword,
  });

  const updated = await prisma.fiscalDocument.update({
    where: { id },
    data: { xml: signedXml, status: "SIGNED", sefazMessage: "XML assinado (local / mock)." },
  });

  log.info("nfce_sign_ok", { requestId, docId: id, storeId: doc.storeId, signerMode: signerMode || "REAL" });
  return { ok: true, doc: updated };
};

nfceService.send = async ({ prisma, log, id, requestId }) => {
  const doc = await prisma.fiscalDocument.findUnique({ where: { id } });
  if (!doc) throw httpError(FISCAL.DOC_NOT_FOUND.http, FISCAL.DOC_NOT_FOUND.code, FISCAL.DOC_NOT_FOUND.message);
  if (!doc.xml) throw httpError(400, "VALIDATION", "Documento sem XML");

  // Em MOCK, se vier DRAFT, auto-assina para destravar fluxo
  const providerName = String(process.env.FISCAL_PROVIDER || "MOCK").toUpperCase();
  if (providerName === "MOCK" && doc.status === "DRAFT") {
    if (String(process.env.FISCAL_SIGNER || "").toUpperCase() !== "MOCK") process.env.FISCAL_SIGNER = "MOCK";
    const signedXml = await signNfceXmlA1Pfx({ xml: doc.xml });
    await prisma.fiscalDocument.update({
      where: { id },
      data: { xml: signedXml, status: "SIGNED", sefazMessage: "Auto-sign (MOCK) antes do envio (MOCK)." },
    });
  }

  const doc2 = await prisma.fiscalDocument.findUnique({ where: { id } });
  if (doc2.status !== "SIGNED" && doc2.status !== "SENT") {
    throw httpError(FISCAL.NOT_SIGNED.http, FISCAL.NOT_SIGNED.code, FISCAL.NOT_SIGNED.message);
  }

  try {
    const result = await sendWithRetry({ prisma, log, doc: doc2, requestId });

    const data = {
      status: result.status,
      accessKey: result.accessKey || doc2.accessKey,
      protocol: result.protocol || doc2.protocol,
      sefazReceipt: result.sefazReceipt || doc2.sefazReceipt,
      sefazMessage: result.message || doc2.sefazMessage,
      xml: result.xml || doc2.xml,
      qrCodeUrl: result.qrCodeUrl || doc2.qrCodeUrl,
    };

    const updated = await prisma.fiscalDocument.update({ where: { id }, data });

    await prisma.fiscalEvent.create({
      data: {
        docId: id,
        type: "ENVIO_RESULTADO",
        message: `ENVIO NFC-e resultado: ${updated.status}`,
        payload: JSON.stringify({ status: updated.status, protocol: updated.protocol, at: new Date().toISOString() }),
      },
    });

    log.info("nfce_send_done", { requestId, docId: id, status: updated.status, provider: providerName });
    return { ok: true, doc: updated, sefaz: result.sefaz };
  } catch (err) {
    // registra falha
    await prisma.fiscalEvent.create({
      data: {
        docId: id,
        type: "ENVIO_FALHA",
        message: "ENVIO NFC-e falhou",
        payload: JSON.stringify({
          code: err.code || "INTERNAL",
          statusCode: err.statusCode || 500,
          message: err.message,
          details: err.details,
          at: new Date().toISOString(),
        }),
      },
    });

    throw err;
  }
};

nfceService.get = async ({ prisma, id }) => {
  const doc = await prisma.fiscalDocument.findUnique({ where: { id } });
  if (!doc) throw httpError(FISCAL.DOC_NOT_FOUND.http, FISCAL.DOC_NOT_FOUND.code, FISCAL.DOC_NOT_FOUND.message);
  return { ok: true, doc };
};

async function cancel(prisma, { docId, reason, env = "MOCK" }) {
  // 1) carrega doc
  const doc = await prisma.fiscalDocument.findUnique({ where: { id: docId } });
  if (!doc) {
    const err = new Error("Documento fiscal não encontrado");
    err.statusCode = 404;
    err.code = "FISCAL_DOC_NOT_FOUND";
    throw err;
  }

  // 2) valida status
  if (doc.status !== "AUTHORIZED") {
    const err = new Error("Status do documento não permite esta operação");
    err.statusCode = 409;
    err.code = "FISCAL_INVALID_STATUS";
    err.details = { status: doc.status };
    throw err;
  }

  // 3) atualiza doc -> CANCELED
  const updated = await prisma.fiscalDocument.update({
    where: { id: docId },
    data: {
      status: "CANCELED",
      updatedAt: new Date(),
    },
  });

  // 4) auditoria
  await prisma.fiscalEvent.create({
    data: {
      docId,
      type: "CANCELAMENTO",
      message: `CANCELAMENTO NFC-e (MOCK) - ${String(reason || "").slice(0, 120)}`.trim(),
      payload: JSON.stringify({ reason: reason || null, env }),
    },
  });

  return updated;
}

module.exports = { nfceService };
