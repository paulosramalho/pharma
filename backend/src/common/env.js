// backend/src/common/env.js
// Fail-fast env validation (no deps). Keeps config centralized and reusable.

function requireEnv(name, { allowEmpty = false } = {}) {
  const v = process.env[name];
  if (v === undefined || v === null) throw new Error(`Missing env var: ${name}`);
  if (!allowEmpty && String(v).trim() === "") throw new Error(`Empty env var: ${name}`);
  return v;
}

function envInt(name, def) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer env var: ${name}`);
  return n;
}

function envBool(name, def = false) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === "") return def;
  return ["1", "true", "yes", "y", "on"].includes(String(v).toLowerCase());
}

function loadConfig() {
  return {
    env: process.env.NODE_ENV || "dev",
    port: envInt("PORT", 3000),
    serviceName: process.env.SERVICE_NAME || "pharma-backend",
    databaseUrl: requireEnv("DATABASE_URL"),
    // Monitoring hooks (optional)
    readyUrl: process.env.READY_URL || "http://localhost:3000/health/ready",
    // Backups
    backupDir: process.env.BACKUP_DIR || "C:\\pharma\\backups\\db",
    backupKeepDays: envInt("BACKUP_KEEP_DAYS", 14),
    // Alerts (optional) - webhook/email left for future
    enableAlertExitCode: envBool("ENABLE_ALERT_EXIT_CODE", true),
  };
}

module.exports = { loadConfig };
