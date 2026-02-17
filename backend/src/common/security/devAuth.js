// DEV ONLY: inject req.user using X-DEV-USER-ID or X-DEV-EMAIL
// This is a scaffold so you can exercise protected endpoints before the full login module.
//
// Usage in server.js (before protected routes):
//   const { devAuth } = require("./common/security/devAuth");
//   app.use(devAuth({ prisma }));
//
// Then call endpoints with header:
//   X-DEV-USER-ID: <uuid>
// or
//   X-DEV-EMAIL: admin@pharma.local

function isDev() {
  return String(process.env.NODE_ENV || "").toLowerCase() !== "production";
}

function devAuth({ prisma }) {
  if (!prisma) throw new Error("devAuth requires prisma");

  return async function devAuthMiddleware(req, res, next) {
    try {
      if (!isDev()) return next();

      // Don't override real auth if already set
      if (req.user) return next();

      const id = String(req.headers["x-dev-user-id"] || "").trim();
      const email = String(req.headers["x-dev-email"] || "").trim();

      if (!id && !email) return next();

      let user = null;
      if (id) user = await prisma.user.findUnique({ where: { id } });
      if (!user && email) user = await prisma.user.findUnique({ where: { email } });

      if (user) req.user = user;

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { devAuth };
