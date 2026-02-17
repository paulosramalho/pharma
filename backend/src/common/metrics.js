// backend/src/common/metrics.js
const buckets = [50, 100, 200, 500, 1000, 2000, 5000]; // ms

function createMetrics() {
  const state = {
    startedAt: Date.now(),
    requests: 0,
    errors5xx: 0,
    byRoute: new Map(),
  };

  function keyOf(method, path) {
    return `${method} ${path}`;
  }

  function observe(method, path, status, ms) {
    state.requests += 1;
    if (status >= 500) state.errors5xx += 1;

    const key = keyOf(method, path);
    let rec = state.byRoute.get(key);
    if (!rec) {
      rec = { count: 0, errors5xx: 0, buckets: new Array(buckets.length + 1).fill(0) };
      state.byRoute.set(key, rec);
    }

    rec.count += 1;
    if (status >= 500) rec.errors5xx += 1;

    let placed = false;
    for (let i = 0; i < buckets.length; i++) {
      if (ms <= buckets[i]) {
        rec.buckets[i] += 1;
        placed = true;
        break;
      }
    }
    if (!placed) rec.buckets[buckets.length] += 1; // +Inf
  }

  function middleware(req, res, next) {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      const path = req.route?.path ? req.baseUrl + req.route.path : (req.originalUrl || req.url);
      observe(req.method, path, res.statusCode, ms);
    });
    next();
  }

  function toPrometheus() {
    let out = "";
    out += "# TYPE http_requests_total counter\n";
    out += `http_requests_total ${state.requests}\n`;
    out += "# TYPE http_5xx_total counter\n";
    out += `http_5xx_total ${state.errors5xx}\n`;

    for (const [key, rec] of state.byRoute.entries()) {
      const safeKey = key.replace(/"/g, '\\"');
      out += `http_route_requests_total{route="${safeKey}"} ${rec.count}\n`;
      out += `http_route_5xx_total{route="${safeKey}"} ${rec.errors5xx}\n`;

      let cumulative = 0;
      for (let i = 0; i < buckets.length; i++) {
        cumulative += rec.buckets[i];
        out += `http_route_latency_bucket{route="${safeKey}",le="${buckets[i]}"} ${cumulative}\n`;
      }
      cumulative += rec.buckets[buckets.length];
      out += `http_route_latency_bucket{route="${safeKey}",le="+Inf"} ${cumulative}\n`;
    }
    return out;
  }

  return { middleware, toPrometheus, state };
}

module.exports = { createMetrics };
