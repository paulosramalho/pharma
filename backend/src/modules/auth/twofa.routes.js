const express = require("express");
const { asyncHandler } = require("../../common/asyncHandler");
const { setup2FA, enable2FA, disable2FA, debugTokensFromUser } = require("./twofa.service");

function buildTwoFaRoutes({ prisma }) {
  const router = express.Router();

  router.post("/2fa/setup", asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Login requerido" }, requestId: req.requestId });
    const out = await setup2FA({ prisma, user: req.user });
    return res.json({ ok: true, user: { id: req.user.id, email: req.user.email }, otpauth: out.otpauth, secret: out.secret, requestId: req.requestId });
  }));

  router.get("/2fa/debug", asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Login requerido" }, requestId: req.requestId });
    const freshUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    const dbg = debugTokensFromUser(freshUser);
    if (!dbg) return res.status(404).json({ error: { code: "TWOFA_NOT_CONFIGURED", message: "2FA não configurado." }, requestId: req.requestId });
    return res.json({ ok: true, user: { id: freshUser.id, email: freshUser.email }, debug: dbg, twoFactorEnabled: !!freshUser.twoFactorEnabled, requestId: req.requestId });
  }));

  // Quick verifier: tells if a token is valid (DEV aid)
  router.post("/2fa/verify", asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Login requerido" }, requestId: req.requestId });
    const token = String(req.body?.token || "").trim();
    const freshUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    const dbg = debugTokensFromUser(freshUser);
    const ok = dbg ? (token === dbg.tokenPrev || token === dbg.tokenNow || token === dbg.tokenNext) : false;
    return res.json({ ok: true, user: { id: freshUser.id, email: freshUser.email }, valid: ok, debug: dbg, received: token, requestId: req.requestId });
  }));

  router.post("/2fa/enable", asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Login requerido" }, requestId: req.requestId });
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: { code: "BAD_REQUEST", message: "token obrigatório" }, requestId: req.requestId });

    const freshUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    try {
      const u = await enable2FA({ prisma, user: freshUser, token });
      return res.json({ ok: true, user: { id: u.id, email: u.email, twoFactorEnabled: u.twoFactorEnabled }, requestId: req.requestId });
    } catch (e) {
      const code = e.code || "TWOFA_ERROR";
      return res.status(422).json({ error: { code, message: e.message, details: e.details }, requestId: req.requestId });
    }
  }));

  router.post("/2fa/disable", asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Login requerido" }, requestId: req.requestId });
    const u = await disable2FA({ prisma, user: req.user });
    return res.json({ ok: true, user: { id: u.id, email: u.email, twoFactorEnabled: u.twoFactorEnabled }, requestId: req.requestId });
  }));

  return router;
}

module.exports = { buildTwoFaRoutes };
