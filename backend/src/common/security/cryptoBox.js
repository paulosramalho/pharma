const crypto = require("crypto");

function requireKey() {
  const k = String(process.env.APP_ENC_KEY || "").trim();
  if (!k) throw new Error("APP_ENC_KEY ausente (precisa de 32 bytes em hex: 64 chars).");
  const buf = Buffer.from(k, "hex");
  if (buf.length !== 32) throw new Error("APP_ENC_KEY inválida (use 64 hex chars = 32 bytes).");
  return buf;
}

function encryptJson(obj) {
  const key = requireKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: enc.toString("hex"),
  };
}

function decryptJson(payload) {
  const key = requireKey();
  const p = payload || {};
  const iv = Buffer.from(String(p.iv || ""), "hex");
  const tag = Buffer.from(String(p.tag || ""), "hex");
  const data = Buffer.from(String(p.data || ""), "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}

module.exports = { encryptJson, decryptJson };
