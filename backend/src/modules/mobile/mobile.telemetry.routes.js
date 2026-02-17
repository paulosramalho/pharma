
const express = require("express");

// Telemetria (DEV/MOCK friendly)
// - Recebe posição do entregador e grava em AuditLog (sem alterar schema)
// POST /mobile/telemetry/location { storeId?, userId?, deviceId?, lat, lng, accuracy?, speed?, heading? }

function buildMobileTelemetryRoutes({ prisma }) {
  const router = express.Router();

  router.post("/telemetry/location", async (req, res) => {
    const { storeId = null, userId = null, deviceId = null, lat, lng, accuracy, speed, heading } = req.body || {};

    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "lat/lng obrigatórios" } });
    }

    const payload = {
      deviceId: deviceId ? String(deviceId) : null,
      lat: latN,
      lng: lngN,
      accuracy: accuracy != null ? Number(accuracy) : null,
      speed: speed != null ? Number(speed) : null,
      heading: heading != null ? Number(heading) : null,
      at: new Date().toISOString(),
    };

    await prisma.auditLog.create({
      data: {
        action: "MOBILE_LOCATION",
        entity: "DeliveryTelemetry",
        entityId: payload.deviceId || "device",
        message: "Mobile telemetry location ping",
        payload: JSON.stringify(payload),
        storeId,
        userId,
      },
    });

    res.json({ ok: true });
  });

  return router;
}

module.exports = { buildMobileTelemetryRoutes };
