// backend/src/modules/fiscal/index.js
const express = require("express");
const { nfceController } = require("./nfce.controller");

function buildFiscalRouter({ prisma, log } = {}) {
  const router = express.Router();

  router.get("/ping", (req, res) => res.json({ status: "ok", module: "fiscal" }));

  // NFC-e
  router.post("/nfce/prepare", nfceController.prepare({ prisma, log })); // cria draft + xml base
  router.post("/nfce/:id/sign", nfceController.sign({ prisma, log }));    // assina (A1 PFX) — stub c/ TODO
  router.post("/nfce/:id/send", nfceController.send({ prisma, log }));    // envia p/ SEFAZ (provider)
  router.post("/nfce/:id/cancel", nfceController.cancel({ prisma, log }));// evento cancelamento (stub)
  router.get("/nfce/:id", nfceController.get({ prisma, log }));           // consulta local

  return router;
}

module.exports = { buildFiscalRouter };
