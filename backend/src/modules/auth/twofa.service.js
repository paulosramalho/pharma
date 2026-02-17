const { generateSecretBase32, verifyTotp, buildOtpAuthUri, totp } = require("../../common/security/totp");
const { encryptJson, decryptJson } = require("../../common/security/cryptoBox");

function issuer() {
  return String(process.env.TWOFA_ISSUER || "Pharma");
}

function digits() {
  return Number(process.env.TWOFA_DIGITS || 6);
}

function step() {
  return Number(process.env.TWOFA_STEP || 30);
}

function windowSkew() {
  return Number(process.env.TWOFA_WINDOW || 2); // default 2 (±60s)
}

function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function debugTokens(secret) {
  const d = digits();
  const s = step();
  const now = Date.now();
  return {
    serverTimeIso: new Date(now).toISOString(),
    step: s,
    digits: d,
    window: windowSkew(),
    tokenPrev: totp(secret, { step: s, digits: d, time: now - s * 1000 }),
    tokenNow: totp(secret, { step: s, digits: d, time: now }),
    tokenNext: totp(secret, { step: s, digits: d, time: now + s * 1000 }),
  };
}

async function setup2FA({ prisma, user }) {
  const secret = generateSecretBase32(20);
  const enc = encryptJson({ secret });

  const userUpdated = await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecretEnc: enc,
      twoFactorEnabled: false,
    },
  });

  const account = user.email || user.id;
  const otpauth = buildOtpAuthUri({ issuer: issuer(), account, secret, digits: digits(), step: step() });

  return { user: userUpdated, secret, otpauth };
}

async function enable2FA({ prisma, user, token }) {
  if (!user.twoFactorSecretEnc) {
    const err = new Error("2FA não configurado.");
    err.code = "TWOFA_NOT_CONFIGURED";
    throw err;
  }

  const { secret } = decryptJson(user.twoFactorSecretEnc);
  const ok = verifyTotp(token, secret, { digits: digits(), step: step(), window: windowSkew() });

  if (!ok) {
    const err = new Error("Token 2FA inválido.");
    err.code = "TWOFA_INVALID";
    if (!isProd()) {
      err.details = { received: String(token || ""), ...debugTokens(secret) };
    }
    throw err;
  }

  return prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true },
  });
}

async function disable2FA({ prisma, user }) {
  return prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecretEnc: null },
  });
}

async function verify2FA({ prisma, user, token }) {
  if (!user.twoFactorEnabled) return true;
  if (!user.twoFactorSecretEnc) return false;
  const { secret } = decryptJson(user.twoFactorSecretEnc);
  return verifyTotp(token, secret, { digits: digits(), step: step(), window: windowSkew() });
}

function debugTokensFromUser(user) {
  if (!user?.twoFactorSecretEnc) return null;
  const { secret } = decryptJson(user.twoFactorSecretEnc);
  return debugTokens(secret);
}

module.exports = { setup2FA, enable2FA, disable2FA, verify2FA, debugTokensFromUser };
