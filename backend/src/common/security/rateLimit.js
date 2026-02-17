// Simple in-memory rate limiter (DEV / single instance)
// For production multi-instance, swap to Redis later.
// Usage:
//   const { rateLimit } = require("./common/security/rateLimit");
//   app.use(rateLimit({ windowMs: 60000, max: 120 }));

function nowMs() { return Date.now(); }

function parseCsv(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function getClientKey(req, { keyBy = "ip" } = {}) {
  if (keyBy === "ip") return req.ip || req.connection?.remoteAddress || "unknown";
  if (keyBy === "user") return req.user?.id ? `u:${req.user.id}` : (req.ip || "unknown");
  return req.ip || "unknown";
}

function rateLimit(opts = {}) {
  const windowMs = Number(opts.windowMs || process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(opts.max || process.env.RATE_LIMIT_MAX || 120);
  const keyBy = String(opts.keyBy || process.env.RATE_LIMIT_KEYBY || "ip"); // ip|user
  const skipPaths = new Set(parseCsv(opts.skipPaths || process.env.RATE_LIMIT_SKIP_PATHS || "/health/live,/health/ready"));

  // key => { resetAt, count }
  const buckets = new Map();

  // lightweight GC
  const gcEvery = Math.max(10_000, Math.floor(windowMs / 2));
  let lastGc = 0;

  return function rateLimitMiddleware(req, res, next) {
    try {
      if (skipPaths.has(req.path)) return next();

      const t = nowMs();
      if (t - lastGc > gcEvery) {
        lastGc = t;
        for (const [k, v] of buckets.entries()) {
          if (v.resetAt <= t) buckets.delete(k);
        }
      }

      const key = getClientKey(req, { keyBy });
      const b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        buckets.set(key, { resetAt: t + windowMs, count: 1 });
        res.setHeader("X-RateLimit-Limit", String(max));
        res.setHeader("X-RateLimit-Remaining", String(max - 1));
        res.setHeader("X-RateLimit-Reset", String(Math.floor((t + windowMs) / 1000)));
        return next();
      }

      b.count += 1;
      const remaining = Math.max(0, max - b.count);
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.floor(b.resetAt / 1000)));

      if (b.count > max) {
        return res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Muitas requisições. Tente novamente em instantes.",
            retryAfterSec: Math.ceil((b.resetAt - t) / 1000),
          },
          requestId: req.requestId,
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { rateLimit };
