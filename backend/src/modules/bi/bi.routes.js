const express = require("express");
const { asyncHandler } = require("../../common/asyncHandler");
const { kpis, topDemandSeries } = require("./bi.service");
const { forecastNext } = require("./forecasting");

function buildBiRoutes({ prisma }) {
  const router = express.Router();

  // KPIs (by store)
  router.get("/kpis", asyncHandler(async (req, res) => {
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "storeId obrigatório" }, requestId: req.requestId });
    const out = await kpis({ prisma, storeId, from: req.query.from, to: req.query.to });
    return res.json({ ok: true, kpis: out, requestId: req.requestId });
  }));

  // Demand series (top products in last N days)
  router.get("/demand/top", asyncHandler(async (req, res) => {
    const storeId = String(req.query.storeId || "").trim();
    if (!storeId) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "storeId obrigatório" }, requestId: req.requestId });

    const days = Number(req.query.days || 30);
    const top = Number(req.query.top || 20);

    const out = await topDemandSeries({ prisma, storeId, days, top });
    return res.json({ ok: true, demand: out, requestId: req.requestId });
  }));

  // Forecast for a given product series payload (client sends series)
  router.post("/demand/forecast", asyncHandler(async (req, res) => {
    const { series, method, window, horizonDays } = req.body || {};
    if (!Array.isArray(series) || series.length === 0) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "series obrigatório (array)" }, requestId: req.requestId });
    }
    const out = forecastNext({ series, method, window, horizonDays });
    return res.json({ ok: true, forecast: out, requestId: req.requestId });
  }));

  return router;
}

module.exports = { buildBiRoutes };
