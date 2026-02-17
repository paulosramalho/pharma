const express = require("express");

function buildNfceCancelRoutes({ prisma, log }) {
  const r = express.Router();

  r.post("/nfce/:id/cancel", async (req, res, next) => {
    try {
      const id = req.params.id;
      const reason = String(req.body?.reason || "").trim();

      if (!reason || reason.length < 15) {
        return res.status(400).json({
          error: { code: 400, message: "reason obrigatório (mín. 15 caracteres) para cancelamento." },
          requestId: req.requestId,
        });
      }

      const doc = await prisma.fiscalDocument.findUnique({ where: { id } });
      if (!doc) {
        return res.status(404).json({
          error: { code: 404, message: "Documento fiscal não encontrado" },
          requestId: req.requestId,
        });
      }

      if (doc.status !== "AUTHORIZED") {
        return res.status(409).json({
          error: { code: 409, message: `Cancelamento permitido apenas para status AUTHORIZED. Atual: ${doc.status}` },
          requestId: req.requestId,
        });
      }

      const evt = await prisma.fiscalEvent.create({
        data: {
          docId: doc.id,
          type: "CANCELAMENTO",
          message: "CANCELAMENTO (MOCK)",
          payload: JSON.stringify({ reason }),
        },
      });

      const updated = await prisma.fiscalDocument.update({
        where: { id: doc.id },
        data: { status: "CANCELED", sefazMessage: "CANCELADO (MOCK)" },
      });

      log.warn("nfce_cancel_mock_ok", { requestId: req.requestId, docId: doc.id, eventId: evt.id });

      return res.status(200).json({ ok: true, doc: updated, event: evt });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

module.exports = { buildNfceCancelRoutes };
