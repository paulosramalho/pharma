// backend/src/common/boot.js
// Centralized bootstrapping helpers shared by server.js (small, reusable).

const { createLogger } = require("./logger");
const { loadConfig } = require("./env");

function boot() {
  const cfg = loadConfig();
  const log = createLogger({ service: cfg.serviceName, env: cfg.env });
  return { cfg, log };
}

module.exports = { boot };
