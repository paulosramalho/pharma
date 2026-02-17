// backend/src/common/logger.js
// Minimal JSON logger (no external deps). One JSON per line.

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function createLogger({ service = "pharma-backend", env = process.env.NODE_ENV || "dev" } = {}) {
  function emit(level, msg, meta) {
    const payload = {
      ts: nowIso(),
      level,
      service,
      env,
      msg: String(msg || ""),
    };
    if (meta && typeof meta === "object") payload.meta = safeJson(meta);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  }

  return {
    info: (msg, meta) => emit("info", msg, meta),
    warn: (msg, meta) => emit("warn", msg, meta),
    error: (msg, meta) => emit("error", msg, meta),
    debug: (msg, meta) => emit("debug", msg, meta),
  };
}

module.exports = { createLogger };
