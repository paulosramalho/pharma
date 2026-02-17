const { prisma } = require("../prisma");

function requirePermission(permissionKey) {
  return async function rbacMiddleware(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { code: 401, message: "Não autenticado" } });
      }

      if (req.user.role === "ADMIN") return next();

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { role: { include: { perms: true } } },
      });

      if (!user || !user.role) {
        return res.status(403).json({ error: { code: 403, message: "Sem permissão" } });
      }

      const hasPermission = user.role.perms.some((p) => p.permissionKey === permissionKey);
      if (!hasPermission) {
        return res.status(403).json({ error: { code: 403, message: `Permissão necessária: ${permissionKey}` } });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requirePermission };
