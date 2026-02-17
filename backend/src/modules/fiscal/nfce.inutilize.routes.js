// backend/src/modules/fiscal/nfce.inutilize.routes.js
const express = require("express");

function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function buildNfceInutilizeRoutes({ prisma, log }) {
  const r = express.Router();

  // POST /fiscal/nfce/inutilize
  // Body: { storeId, series=1, nStart, nEnd, reason }
  r.post("/nfce/inutilize", async (req, res, next) => {
    try {
      const storeId = String(req.body?.storeId || "").trim();
      const series = asInt(req.body?.series ?? 1) ?? 1;
      const nStart = asInt(req.body?.nStart);
      const nEnd = asInt(req.body?.nEnd);
      const reason = String(req.body?.reason || "").trim();

      if (!storeId) {
        return res.status(400).json({ error: { code: 400, message: "storeId é obrigatório" }, requestId: req.requestId });
      }
      if (!Number.isFinite(series) || series < 1 || series > 999) {
        return res.status(400).json({ error: { code: 400, message: "series inválida (1..999)" }, requestId: req.requestId });
      }
      if (!Number.isFinite(nStart) || !Number.isFinite(nEnd) || nStart < 1 || nEnd < 1 || nStart > nEnd) {
        return res.status(400).json({ error: { code: 400, message: "Intervalo inválido (nStart <= nEnd, ambos >= 1)" }, requestId: req.requestId });
      }
      if (!reason || reason.length < 15) {
        return res.status(400).json({ error: { code: 400, message: "reason obrigatório (mín. 15 caracteres)" }, requestId: req.requestId });
      }

      const maxRange = 100; // DEV safeguard
      if ((nEnd - nStart + 1) > maxRange) {
        return res.status(400).json({
          error: { code: 400, message: `Intervalo muito grande. Máximo permitido: ${maxRange} números por chamada.` },
          requestId: req.requestId,
        });
      }

      // Valida store
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) {
        return res.status(404).json({ error: { code: 404, message: "Store não encontrada" }, requestId: req.requestId });
      }

      // Verifica se já existe FiscalDocument usando algum número no intervalo (mesma store/serie)
      const used = await prisma.fiscalDocument.findMany({
        where: {
          storeId,
          type: "NFCE",
          series,
          number: { gte: nStart, lte: nEnd },
        },
        select: { id: true, number: true },
        take: 5,
        orderBy: { number: "asc" },
      });

      if (used.length) {
        return res.status(409).json({
          error: {
            code: 409,
            message: "Intervalo contém numeração já utilizada em documentos fiscais. Ajuste o intervalo.",
            usedSample: used,
          },
          requestId: req.requestId,
        });
      }

      // Registra evento (MOCK)
      const payload = {
        storeId,
        series,
        nStart,
        nEnd,
        reason,
        env: "MOCK",
        doneAt: new Date().toISOString(),
        evidence: {
          rule: "Sem uso na FiscalDocument (store/serie/intervalo)",
          maxRange,
        },
      };

      const evt = await prisma.fiscalEvent.create({
        data: {
          docId: null, // inutilização não está atrelada a um doc específico
          type: "INUTILIZACAO",
          message: `INUTILIZAÇÃO NFC-e ${series}/${nStart}-${nEnd} (MOCK)`,
          payload: JSON.stringify(payload),
        },
      });

      log.warn("nfce_inutilize_mock_ok", { requestId: req.requestId, storeId, series, nStart, nEnd, eventId: evt.id });

      return res.status(200).json({
        ok: true,
        message: "Inutilização registrada (MOCK).",
        event: evt,
      });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

module.exports = { buildNfceInutilizeRoutes };
