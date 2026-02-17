// backend/src/routes/health.routes.js
const express = require("express");
const { dbPing } = require("../common/prisma");

function buildHealthRouter({ startedAt = Date.now() } = {}) {
  const router = express.Router();

  router.get("/live", (req, res) => {
    res.json({ status: "ok", uptimeSec: Math.floor(process.uptime()) });
  });

  router.get("/ready", async (req, res) => {
    try {
      await dbPing();
      res.json({
        status: "ok",
        db: "ok",
        uptimeSec: Math.floor(process.uptime()),
        startedAt: new Date(startedAt).toISOString(),
      });
    } catch {
      res.status(503).json({
        status: "degraded",
        db: "fail",
        uptimeSec: Math.floor(process.uptime()),
        startedAt: new Date(startedAt).toISOString(),
      });
    }
  });

  return router;
}

module.exports = { buildHealthRouter };
