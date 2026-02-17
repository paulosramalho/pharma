const crypto = require("crypto");

// Minimal base32 (RFC4648) decoder/encoder for TOTP secrets
const ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0, value = 0, output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPH[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPH[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const clean = String(str || "").toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPH.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretBase32, counter, digits = 6) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, "0");
}

function totp(secretBase32, { step = 30, digits = 6, time = Date.now() } = {}) {
  const counter = Math.floor(time / 1000 / step);
  return hotp(secretBase32, counter, digits);
}

function verifyTotp(token, secretBase32, { step = 30, digits = 6, window = 1 } = {}) {
  const t = Date.now();
  const tok = String(token || "").trim();
  if (!tok) return false;
  for (let w = -window; w <= window; w++) {
    const cand = totp(secretBase32, { step, digits, time: t + w * step * 1000 });
    if (cand === tok) return true;
  }
  return false;
}

function generateSecretBase32(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function buildOtpAuthUri({ issuer, account, secret, digits = 6, step = 30 }) {
  const i = encodeURIComponent(String(issuer || "Pharma"));
  const a = encodeURIComponent(String(account || "user"));
  const s = encodeURIComponent(String(secret));
  return `otpauth://totp/${i}:${a}?secret=${s}&issuer=${i}&digits=${digits}&period=${step}`;
}

module.exports = {
  base32Encode,
  base32Decode,
  hotp,
  totp,
  verifyTotp,
  generateSecretBase32,
  buildOtpAuthUri,
};
