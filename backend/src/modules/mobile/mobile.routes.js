
const express = require("express");

// Módulo Mobile (Delivery & Força de Venda)
// - Listagem por status via model Delivery (Sale NÃO tem deliveryStatus)
// - Default: PENDING + OUT_FOR_DELIVERY (entregas em aberto)

function parseStatuses(q) {
  const raw = String(q || "").trim();
  if (!raw) return ["PENDING", "OUT_FOR_DELIVERY"];
  // aceita: status=PENDING ou status=PENDING,OUT_FOR_DELIVERY ou status=ALL
  if (raw.toUpperCase() === "ALL") return null;
  return raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

function buildMobileRoutes({ prisma }) {
  const router = express.Router();

  // List deliveries (default = open: PENDING + OUT_FOR_DELIVERY)
  // GET /mobile/deliveries?status=PENDING,OUT_FOR_DELIVERY | status=ALL
  router.get("/deliveries", async (req, res) => {
    const statuses = parseStatuses(req.query.status);

    const where = statuses ? { status: { in: statuses } } : {};
    const deliveries = await prisma.delivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        sale: {
          select: { id: true, number: true, total: true, discount: true, createdAt: true },
        },
        store: { select: { id: true, name: true } },
      },
    });

    res.json({ ok: true, deliveries, filter: { status: statuses || "ALL" } });
  });

  // Back-compat: endpoint antigo
  router.get("/deliveries/open", async (req, res) => {
    const deliveries = await prisma.delivery.findMany({
      where: { status: { in: ["PENDING", "OUT_FOR_DELIVERY"] } },
      orderBy: { createdAt: "desc" },
      include: {
        sale: { select: { id: true, number: true, total: true, discount: true, createdAt: true } },
        store: { select: { id: true, name: true } },
      },
    });
    res.json({ ok: true, deliveries, filter: { status: ["PENDING", "OUT_FOR_DELIVERY"] } });
  });

  // Update delivery status
  router.post("/deliveries/:id/status", async (req, res) => {
    const { status } = req.body;
    const { id } = req.params;

    const normalized = String(status || "").trim().toUpperCase();
    if (!normalized) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "status obrigatório" } });

    const updated = await prisma.delivery.update({
      where: { id },
      data: {
        status: normalized,
        deliveredAt: normalized === "DELIVERED" ? new Date() : null,
      },
      include: {
        sale: { select: { id: true, number: true, total: true } },
        store: { select: { id: true, name: true } },
      },
    });

    res.json({ ok: true, delivery: updated });
  });

  return router;
}

module.exports = { buildMobileRoutes };
