// IP allow/deny control (simple CIDR-less)
// - IP_ALLOWLIST: comma-separated exact IPs (if set, only these can access)
// - IP_DENYLIST: comma-separated exact IPs (always blocked)
// For CIDR support later, we can add ipaddr.js.

function parseCsv(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function ipControl(opts = {}) {
  const allow = parseCsv(opts.allow || process.env.IP_ALLOWLIST || "");
  const deny = parseCsv(opts.deny || process.env.IP_DENYLIST || "");
  const skipPaths = new Set(parseCsv(opts.skipPaths || process.env.IP_CONTROL_SKIP_PATHS || "/health/live,/health/ready"));

  const allowSet = new Set(allow);
  const denySet = new Set(deny);

  return function ipControlMiddleware(req, res, next) {
    try {
      if (skipPaths.has(req.path)) return next();

      const ip = req.ip || req.connection?.remoteAddress || "unknown";

      if (denySet.size && denySet.has(ip)) {
        return res.status(403).json({ error: { code: "IP_DENIED", message: "IP bloqueado." }, requestId: req.requestId });
      }

      if (allowSet.size && !allowSet.has(ip)) {
        return res.status(403).json({ error: { code: "IP_NOT_ALLOWED", message: "IP não autorizado." }, requestId: req.requestId });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { ipControl };
