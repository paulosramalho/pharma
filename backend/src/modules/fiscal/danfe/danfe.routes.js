// backend/src/modules/fiscal/danfe/danfe.routes.js
const express = require("express");
const { makeDanfeNfcePdfBuffer } = require("./danfePdf");

function buildDanfeRoutes({ prisma, log }) {
  const r = express.Router();

  // GET /fiscal/nfce/:id/danfe.pdf
  r.get("/nfce/:id/danfe.pdf", async (req, res, next) => {
    try {
      const id = req.params.id;
      const doc = await prisma.fiscalDocument.findUnique({ where: { id } });
      if (!doc) {
        const e = new Error("Documento fiscal não encontrado");
        e.statusCode = 404;
        throw e;
      }

      const store = await prisma.store.findUnique({ where: { id: doc.storeId } });
      const cfg = await prisma.fiscalConfig.findUnique({ where: { storeId: doc.storeId } });

      const pdfBuf = await makeDanfeNfcePdfBuffer({ doc, store, cfg });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="danfe-nfce-${id}.pdf"`);
      res.status(200).send(pdfBuf);
    } catch (err) {
      next(err);
    }
  });

  return r;
}

module.exports = { buildDanfeRoutes };
