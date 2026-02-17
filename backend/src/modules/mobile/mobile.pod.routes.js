const express = require("express");
const { asyncHandler } = require("../../common/asyncHandler");

// POD (Proof of Delivery) — MOCK/DEV
// Evidências gravadas em AuditLog (payload Json). Sem schema novo.
//
// Endpoints:
// POST /mobile/pod/:deliveryId/photo
// POST /mobile/pod/:deliveryId/signature
// GET  /mobile/pod/:deliveryId/status
// POST /mobile/pod/:deliveryId/complete
// GET  /mobile/pod/report?from=YYYY-MM-DD&to=YYYY-MM-DD&storeId=<id>

function buildMobilePodRoutes({ prisma }) {
  const router = express.Router();

  const POD_ENTITY = "DeliveryPOD";
  const ACTION_PHOTO = "MOBILE_POD_PHOTO";
  const ACTION_SIG = "MOBILE_POD_SIGNATURE";
  const ACTION_COMPLETE = "MOBILE_POD_COMPLETE";

  function getDeliveryId(req) {
    return String(req.params.deliveryId || "").trim();
  }

  function parseDateYMD(s, endOfDay = false) {
    const str = String(s || "").trim();
    if (!str) return null;
    // YYYY-MM-DD
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const [_, y, mo, d] = m;
    const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0));
    if (endOfDay) dt.setUTCHours(23, 59, 59, 999);
    return dt;
  }

  async function ensureDelivery(deliveryId) {
    return prisma.delivery.findUnique({ where: { id: deliveryId } });
  }

  async function createAudit({ storeId, userId, action, entityId, payload }) {
    await prisma.auditLog.create({
      data: {
        action,
        entity: POD_ENTITY,
        entityId,
        payload,
        storeId: storeId || null,
        userId: userId || null,
      },
    });
  }

  async function loadEvidence(deliveryId) {
    const rows = await prisma.auditLog.findMany({
      where: {
        entity: POD_ENTITY,
        entityId: deliveryId,
        action: { in: [ACTION_PHOTO, ACTION_SIG, ACTION_COMPLETE] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const hasPhoto = rows.some((r) => r.action === ACTION_PHOTO);
    const hasSignature = rows.some((r) => r.action === ACTION_SIG);
    const hasComplete = rows.some((r) => r.action === ACTION_COMPLETE);

    const lastPhotoAt = rows.find((r) => r.action === ACTION_PHOTO)?.createdAt || null;
    const lastSignatureAt = rows.find((r) => r.action === ACTION_SIG)?.createdAt || null;
    const lastCompleteAt = rows.find((r) => r.action === ACTION_COMPLETE)?.createdAt || null;

    return { hasPhoto, hasSignature, hasComplete, lastPhotoAt, lastSignatureAt, lastCompleteAt, rows };
  }

  // -------------------- PHOTO --------------------
  router.post(
    "/pod/:deliveryId/photo",
    asyncHandler(async (req, res) => {
      const deliveryId = getDeliveryId(req);
      if (!deliveryId) {
        return res.status(400).json({ error: { code: "BAD_REQUEST", message: "deliveryId obrigatório" }, requestId: req.requestId });
      }

      const { storeId = null, userId = null, deviceId = null, imageBase64 = null, mime = "image/jpeg", note = null } = req.body || {};

      const delivery = await ensureDelivery(deliveryId);
      if (!delivery) {
        return res.status(404).json({ error: { code: "DELIVERY_NOT_FOUND", message: "Entrega não encontrada" }, requestId: req.requestId });
      }

      const payload = {
        kind: "PHOTO",
        deliveryId,
        deviceId: deviceId ? String(deviceId) : null,
        mime: String(mime || "image/jpeg"),
        hasImage: Boolean(imageBase64), // MOCK: não armazenamos a imagem ainda
        note: note ? String(note) : null,
        at: new Date().toISOString(),
      };

      await createAudit({ storeId, userId, action: ACTION_PHOTO, entityId: deliveryId, payload });

      return res.json({ ok: true, deliveryId, stored: true, payload, requestId: req.requestId });
    })
  );

  // -------------------- SIGNATURE --------------------
  router.post(
    "/pod/:deliveryId/signature",
    asyncHandler(async (req, res) => {
      const deliveryId = getDeliveryId(req);
      if (!deliveryId) {
        return res.status(400).json({ error: { code: "BAD_REQUEST", message: "deliveryId obrigatório" }, requestId: req.requestId });
      }

      const {
        storeId = null,
        userId = null,
        deviceId = null,
        signatureBase64 = null,
        signerName = null,
        note = null,
        markDelivered = false, // ✅ agora: só marca entregue no COMPLETE (default)
      } = req.body || {};

      const delivery = await ensureDelivery(deliveryId);
      if (!delivery) {
        return res.status(404).json({ error: { code: "DELIVERY_NOT_FOUND", message: "Entrega não encontrada" }, requestId: req.requestId });
      }

      const payload = {
        kind: "SIGNATURE",
        deliveryId,
        deviceId: deviceId ? String(deviceId) : null,
        signerName: signerName ? String(signerName) : null,
        hasSignature: Boolean(signatureBase64), // MOCK: não armazenamos assinatura ainda
        note: note ? String(note) : null,
        at: new Date().toISOString(),
      };

      await createAudit({ storeId, userId, action: ACTION_SIG, entityId: deliveryId, payload });

      let updated = delivery;
      if (markDelivered) {
        updated = await prisma.delivery.update({
          where: { id: deliveryId },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
      }

      return res.json({ ok: true, delivery: updated, stored: true, payload, requestId: req.requestId });
    })
  );

  // -------------------- STATUS (evidências) --------------------
  router.get(
    "/pod/:deliveryId/status",
    asyncHandler(async (req, res) => {
      const deliveryId = getDeliveryId(req);
      if (!deliveryId) {
        return res.status(400).json({ error: { code: "BAD_REQUEST", message: "deliveryId obrigatório" }, requestId: req.requestId });
      }

      const delivery = await ensureDelivery(deliveryId);
      if (!delivery) {
        return res.status(404).json({ error: { code: "DELIVERY_NOT_FOUND", message: "Entrega não encontrada" }, requestId: req.requestId });
      }

      const ev = await loadEvidence(deliveryId);
      return res.json({ ok: true, delivery, pod: {
        hasPhoto: ev.hasPhoto,
        hasSignature: ev.hasSignature,
        hasComplete: ev.hasComplete,
        lastPhotoAt: ev.lastPhotoAt,
        lastSignatureAt: ev.lastSignatureAt,
        lastCompleteAt: ev.lastCompleteAt,
      }, requestId: req.requestId });
    })
  );

  // -------------------- COMPLETE (POD guiado) --------------------
  router.post(
    "/pod/:deliveryId/complete",
    asyncHandler(async (req, res) => {
      const deliveryId = getDeliveryId(req);
      if (!deliveryId) {
        return res.status(400).json({ error: { code: "BAD_REQUEST", message: "deliveryId obrigatório" }, requestId: req.requestId });
      }

      const delivery = await ensureDelivery(deliveryId);
      if (!delivery) {
        return res.status(404).json({ error: { code: "DELIVERY_NOT_FOUND", message: "Entrega não encontrada" }, requestId: req.requestId });
      }

      const {
        storeId = null,
        userId = null,
        requirePhoto = true,
        requireSignature = true,
        checklist = [],
        note = null,
        markDelivered = true, // ✅ default: somente no COMPLETE
      } = req.body || {};

      const ev = await loadEvidence(deliveryId);

      const checklistArr = Array.isArray(checklist) ? checklist : [];
      const checklistMissing = checklistArr.filter((i) => i && i.required && !i.ok).map((i) => i.key || i.label || "item");

      const missing = [];
      if (requirePhoto && !ev.hasPhoto) missing.push("PHOTO");
      if (requireSignature && !ev.hasSignature) missing.push("SIGNATURE");
      if (checklistMissing.length) missing.push("CHECKLIST");

      if (missing.length) {
        return res.status(422).json({
          error: {
            code: "POD_INCOMPLETE",
            message: "POD incompleto: faltam evidências obrigatórias",
            details: {
              missing,
              checklistMissing,
              hasPhoto: ev.hasPhoto,
              hasSignature: ev.hasSignature,
              hasComplete: ev.hasComplete,
            },
          },
          requestId: req.requestId,
        });
      }

      const payload = {
        kind: "COMPLETE",
        deliveryId,
        requirePhoto: Boolean(requirePhoto),
        requireSignature: Boolean(requireSignature),
        checklist: checklistArr.map((i) => ({
          key: String(i.key || ""),
          label: String(i.label || ""),
          ok: Boolean(i.ok),
          required: Boolean(i.required),
        })),
        note: note ? String(note) : null,
        at: new Date().toISOString(),
      };

      await createAudit({ storeId, userId, action: ACTION_COMPLETE, entityId: deliveryId, payload });

      let updated = delivery;
      if (markDelivered) {
        updated = await prisma.delivery.update({
          where: { id: deliveryId },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
      }

      return res.json({
        ok: true,
        delivery: updated,
        pod: { hasPhoto: ev.hasPhoto, hasSignature: ev.hasSignature, hasComplete: true },
        requestId: req.requestId,
      });
    })
  );

  // -------------------- REPORT (período) --------------------
  router.get(
    "/pod/report",
    asyncHandler(async (req, res) => {
      const from = parseDateYMD(req.query.from, false);
      const to = parseDateYMD(req.query.to, true);
      const storeId = req.query.storeId ? String(req.query.storeId) : null;

      if (!from || !to) {
        return res.status(400).json({
          error: { code: "BAD_REQUEST", message: "from/to obrigatórios no formato YYYY-MM-DD" },
          requestId: req.requestId,
        });
      }

      const rows = await prisma.auditLog.findMany({
        where: {
          entity: POD_ENTITY,
          action: { in: [ACTION_PHOTO, ACTION_SIG, ACTION_COMPLETE] },
          createdAt: { gte: from, lte: to },
          ...(storeId ? { storeId } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: 5000,
      });

      // agrega por deliveryId
      const by = new Map();
      for (const r of rows) {
        const id = r.entityId || "unknown";
        if (!by.has(id)) {
          by.set(id, {
            deliveryId: id,
            storeId: r.storeId || null,
            photoAt: null,
            signatureAt: null,
            completeAt: null,
            counts: { photo: 0, signature: 0, complete: 0 },
          });
        }
        const agg = by.get(id);
        if (r.action === ACTION_PHOTO) { agg.counts.photo += 1; agg.photoAt = agg.photoAt || r.createdAt; }
        if (r.action === ACTION_SIG) { agg.counts.signature += 1; agg.signatureAt = agg.signatureAt || r.createdAt; }
        if (r.action === ACTION_COMPLETE) { agg.counts.complete += 1; agg.completeAt = agg.completeAt || r.createdAt; }
        // mantém storeId mais recente se vier
        if (r.storeId) agg.storeId = r.storeId;
      }

      const items = Array.from(by.values()).map((i) => ({
        ...i,
        hasPhoto: i.counts.photo > 0,
        hasSignature: i.counts.signature > 0,
        hasComplete: i.counts.complete > 0,
      }));

      // enriquecer com status do Delivery (best-effort, em lote)
      const ids = items.map((i) => i.deliveryId).filter((x) => x && x !== "unknown");
      const deliveries = ids.length
        ? await prisma.delivery.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, deliveredAt: true, saleId: true, storeId: true, createdAt: true } })
        : [];
      const dMap = new Map(deliveries.map((d) => [d.id, d]));

      const out = items.map((i) => ({
        ...i,
        delivery: dMap.get(i.deliveryId) || null,
      }));

      const totals = {
        deliveries: out.length,
        withPhoto: out.filter((x) => x.hasPhoto).length,
        withSignature: out.filter((x) => x.hasSignature).length,
        completed: out.filter((x) => x.hasComplete).length,
      };

      return res.json({
        ok: true,
        filter: { from: req.query.from, to: req.query.to, storeId: storeId || null },
        totals,
        items: out.sort((a, b) => String(a.deliveryId).localeCompare(String(b.deliveryId))),
        requestId: req.requestId,
      });
    })
  );

  return router;
}

module.exports = { buildMobilePodRoutes };
