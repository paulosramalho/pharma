const express = require("express");
const { asyncHandler } = require("../../common/http/asyncHandler");
const { sendOk } = require("../../common/http/response");
const authService = require("./auth.service");

function buildAuthRoutes() {
  const router = express.Router();

  router.post("/login", asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 400, message: "Email e senha obrigatórios" } });
    }
    const result = await authService.login(email, password);
    return sendOk(res, req, result);
  }));

  router.post("/refresh", asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: { code: 400, message: "refreshToken obrigatório" } });
    }
    const result = await authService.refresh(refreshToken);
    return sendOk(res, req, result);
  }));

  return router;
}

module.exports = { buildAuthRoutes };
