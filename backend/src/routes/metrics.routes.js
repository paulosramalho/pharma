// backend/src/routes/metrics.routes.js
const express = require("express");

function buildMetricsRouter(metrics) {
  const router = express.Router();
  router.get("/", (req, res) => {
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.send(metrics.toPrometheus());
  });
  return router;
}

module.exports = { buildMetricsRouter };
