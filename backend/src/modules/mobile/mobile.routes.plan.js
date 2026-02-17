
const express = require("express");

// Planejamento de rota (MOCK / heurística simples)
// POST /mobile/routes/plan
// { points: [{id?, lat, lng, label?}], startIndex?: 0 }
// Retorna order[] e totalKm estimado por Haversine

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const q = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
}

function nearestNeighbor(points, startIndex = 0) {
  const remaining = points.map((p, idx) => ({ ...p, _idx: idx }));
  const route = [];
  let current = remaining.splice(startIndex, 1)[0];
  route.push(current);

  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i]);
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    current = remaining.splice(bestIdx, 1)[0];
    route.push(current);
  }
  return route;
}

function buildMobileRoutePlanner({}) {
  const router = express.Router();

  router.post("/routes/plan", async (req, res) => {
    const { points = [], startIndex = 0 } = req.body || {};
    if (!Array.isArray(points) || points.length < 2) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "points deve ter pelo menos 2 itens" } });
    }

    const norm = points.map((p, i) => ({
      id: p.id || String(i + 1),
      label: p.label || p.id || `P${i + 1}`,
      lat: Number(p.lat),
      lng: Number(p.lng),
    }));

    if (norm.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "lat/lng inválidos em points" } });
    }

    const route = nearestNeighbor(norm, Math.max(0, Math.min(Number(startIndex) || 0, norm.length - 1)));
    let totalKm = 0;
    for (let i = 1; i < route.length; i++) totalKm += haversineKm(route[i - 1], route[i]);

    res.json({ ok: true, order: route.map((p) => ({ id: p.id, label: p.label, lat: p.lat, lng: p.lng })), totalKm: Number(totalKm.toFixed(2)) });
  });

  return router;
}

module.exports = { buildMobileRoutePlanner };
