/**
 * Idempotency guard middleware.
 *
 * When a client sends the same X-Idempotency-Key twice (e.g., on a sync
 * retry after a network timeout), this middleware returns the cached
 * response instead of executing the handler again, preventing duplicate
 * records (duplicate sales, double cash movements, etc.).
 *
 * Storage: in-memory Map with 24 h TTL — sufficient for a single-server
 * pharmacy deployment. A Redis-backed version can replace this later
 * without changing the interface.
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** @type {Map<string, { statusCode: number, body: unknown, expiresAt: number }>} */
const store = new Map();

// Periodically purge expired entries to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 60 * 60 * 1000); // every hour

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function idempotencyGuard(req, res, next) {
  const key = req.headers["x-idempotency-key"];
  if (!key) return next();

  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return res.status(hit.statusCode).json(hit.body);
  }

  // Intercept res.json to cache the response before sending
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Only cache successful responses (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      store.set(key, {
        statusCode: res.statusCode,
        body,
        expiresAt: Date.now() + TTL_MS,
      });
    }
    return originalJson(body);
  };

  next();
}

module.exports = idempotencyGuard;
