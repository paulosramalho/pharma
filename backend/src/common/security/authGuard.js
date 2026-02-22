const { verifyToken } = require("../../modules/auth/auth.service");

function authGuard() {
  return function authGuardMiddleware(req, res, next) {
    try {
      if (req.user) return next();

      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") return next();
        return res.status(401).json({ error: { code: 401, message: "Token não fornecido" } });
      }

      const token = header.slice(7);
      const payload = verifyToken(token);

      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        tenantId: payload.tenantId || null,
        mustChangePassword: Boolean(payload.mustChangePassword),
      };

      return next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: { code: 401, message: "Token expirado" } });
      }
      return res.status(401).json({ error: { code: 401, message: "Token inválido" } });
    }
  };
}

module.exports = { authGuard };
