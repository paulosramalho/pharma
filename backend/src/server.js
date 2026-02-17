// backend/src/server.js
const express = require("express");
const cors = require("cors");

const { boot } = require("./common/boot");
const { requestIdMiddleware } = require("./common/requestId.middleware");
const { httpLoggerMiddleware } = require("./common/httpLogger.middleware");
const { errorHandlerMiddleware } = require("./common/errorHandler.middleware");
const { createMetrics } = require("./common/metrics");
const { buildHealthRouter } = require("./routes/health.routes");
const { buildMetricsRouter } = require("./routes/metrics.routes");

const { prisma } = require("./common/prisma");

// Security
const { ipControl } = require("./common/security/ipControl");
const { rateLimit } = require("./common/security/rateLimit");
const { devAuth } = require("./common/security/devAuth");
const { authGuard } = require("./common/security/authGuard");
const { require2FA } = require("./common/security/require2FA");

// Auth routes
const { buildTwoFaRoutes } = require("./modules/auth/twofa.routes");
const { buildAuthRoutes } = require("./modules/auth/auth.routes");
const authService = require("./modules/auth/auth.service");

// API routes
const { buildApiRoutes } = require("./modules/api/api.routes");

// Fiscal module
const { buildFiscalRouter } = require("./modules/fiscal");
const { buildDanfeRoutes } = require("./modules/fiscal/danfe/danfe.routes");
const { buildNfceCancelRoutes } = require("./modules/fiscal/nfce.cancel.routes");
const { buildNfceInutilizeRoutes } = require("./modules/fiscal/nfce.inutilize.routes");
const { buildFiscalErrorsRoutes } = require("./modules/fiscal/fiscal.errors.routes");
const { fiscalResponseMiddleware } = require("./modules/fiscal/fiscal.response.middleware");

// Mobile module
const { buildMobileRoutes } = require("./modules/mobile/mobile.routes");
const { buildMobilePodRoutes } = require("./modules/mobile/mobile.pod.routes");

// BI module
const { buildBiRoutes } = require("./modules/bi/bi.routes");

const { cfg, log } = boot();
const metrics = createMetrics();

const app = express();

app.set("trust proxy", 1);

// CORS
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
app.use(cors({
  origin: corsOrigin.split(",").map((s) => s.trim()),
  credentials: true,
}));

app.use(express.json({ limit: "3mb" }));
app.use(requestIdMiddleware);
app.use(httpLoggerMiddleware(log));
app.use(metrics.middleware);

// IP control + Rate limit
app.use(ipControl());
app.use(rateLimit());

// Public routes (no auth)
app.get("/", (req, res) => res.json({ status: "ok", service: cfg.serviceName }));
app.use("/health", buildHealthRouter({ startedAt: Date.now() }));
app.use("/metrics", buildMetricsRouter(metrics));

// Auth routes (login/refresh — public)
app.use("/auth", buildAuthRoutes());
app.use("/auth", buildTwoFaRoutes({ prisma }));

// Auth guard (JWT) + DEV fallback
app.use(authGuard());
app.use(devAuth({ prisma }));

// GET /me — requires auth
const { asyncHandler } = require("./common/http/asyncHandler");
const { sendOk } = require("./common/http/response");
app.get("/me", asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: { code: 401, message: "Não autenticado" } });
  const result = await authService.getMe(req.user.id);
  return sendOk(res, req, result);
}));

// API routes (CRUD — requires auth)
app.use("/api", buildApiRoutes({ prisma, log }));

// Fiscal
app.use("/fiscal", buildFiscalErrorsRoutes());
app.use("/fiscal", fiscalResponseMiddleware());
app.use("/fiscal", require2FA({ prisma }));
app.use("/fiscal", buildFiscalRouter({ prisma, log }));
app.use("/fiscal", buildDanfeRoutes({ prisma, log }));
app.use("/fiscal", buildNfceCancelRoutes({ prisma, log }));
app.use("/fiscal", buildNfceInutilizeRoutes({ prisma, log }));

// Mobile
app.use("/mobile", buildMobileRoutes({ prisma, log }));
app.use("/mobile", require2FA({ prisma }), buildMobilePodRoutes({ prisma, log }));

// BI
app.use("/bi", require2FA({ prisma }), buildBiRoutes({ prisma }));

// Global error handler
app.use((err, req, res, _next) => {
  const status = err.statusCode || 500;
  log.error("http_error", { requestId: req.requestId, status, code: err.code, message: err.message });
  res.status(status).json({
    error: { code: err.code || status, message: err.message || "Internal Server Error", details: err.details },
    requestId: req.requestId,
  });
});

app.use((req, res) => {
  res.status(404).json({ error: { code: 404, message: "Not Found", requestId: req.requestId } });
});

app.use(errorHandlerMiddleware(log));

app.listen(cfg.port, () => {
  log.info("server_started", { port: cfg.port });
});
