const { verify2FA } = require("../../modules/auth/twofa.service");

function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

/**
 * Enforce 2FA for sensitive routes.
 * - If user.twoFactorEnabled === false => allow (until you make 2FA mandatory for roles)
 * - If true => require token in header:
 *     X-2FA-TOKEN: 123456
 *   DEV helper (only when NODE_ENV != production):
 *     X-DEV-2FA-TOKEN: 123456
 */
function require2FA({ prisma }) {
  if (!prisma) throw new Error("require2FA requires prisma");

  return async function require2FAMiddleware(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Login requerido" },
          requestId: req.requestId,
        });
      }

      // Fetch fresh user (avoid stale req.user)
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Usuário não encontrado" },
          requestId: req.requestId,
        });
      }

      if (!user.twoFactorEnabled) return next();

      const tokenHeader =
        String(req.headers["x-2fa-token"] || "").trim() ||
        (!isProd() ? String(req.headers["x-dev-2fa-token"] || "").trim() : "");

      if (!tokenHeader) {
        return res.status(401).json({
          error: { code: "TWOFA_REQUIRED", message: "2FA requerido. Envie X-2FA-TOKEN." },
          requestId: req.requestId,
        });
      }

      const ok = await verify2FA({ prisma, user, token: tokenHeader });
      if (!ok) {
        return res.status(401).json({
          error: { code: "TWOFA_INVALID", message: "Token 2FA inválido." },
          requestId: req.requestId,
        });
      }

      req.twoFactorVerified = true;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { require2FA };
