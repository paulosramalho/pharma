// backend/src/modules/fiscal/fiscal.errors.routes.js
const express = require("express");
const { listFiscalErrors } = require("./errors/catalog");

function buildFiscalErrorsRoutes() {
  const r = express.Router();

  // GET /fiscal/errors
  r.get("/errors", async (req, res) => {
    res.status(200).json({
      ok: true,
      errors: listFiscalErrors(),
      requestId: req.requestId,
    });
  });

  return r;
}

module.exports = { buildFiscalErrorsRoutes };
