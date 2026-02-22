const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { prisma } = require("../../common/prisma");
const { resolveTenantLicense, isLicenseActive } = require("../../common/licensing/license.service");

const SECRET = process.env.JWT_SECRET || "fallback-secret";
const ACCESS_EXP = process.env.JWT_ACCESS_EXPIRES || "15m";
const REFRESH_EXP = process.env.JWT_REFRESH_EXPIRES || "7d";

function signAccess(user, roleName) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: roleName, tenantId: user.tenantId || null },
    SECRET,
    { expiresIn: ACCESS_EXP }
  );
}

function signRefresh(userId, tenantId) {
  return jwt.sign({ sub: userId, type: "refresh", tenantId: tenantId || null }, SECRET, { expiresIn: REFRESH_EXP });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

async function loadTenantLicense(tenantId) {
  const row = await prisma.tenantLicense.findUnique({
    where: { tenantId },
    select: {
      planCode: true,
      status: true,
      startsAt: true,
      endsAt: true,
      graceUntil: true,
      updatedAt: true,
    },
  });
  return resolveTenantLicense(row);
}

async function login(email, password) {
  const foundUser = await prisma.user.findUnique({
    where: { email },
    include: {
      role: { include: { perms: true } },
      stores: { include: { store: true }, where: { store: { active: true } } },
    },
  });

  if (!foundUser || !foundUser.active) throw Object.assign(new Error("Credenciais invalidas"), { statusCode: 401 });

  const match = await bcrypt.compare(password, foundUser.passwordHash);
  if (!match) throw Object.assign(new Error("Credenciais invalidas"), { statusCode: 401 });

  const license = await loadTenantLicense(foundUser.tenantId);
  const roleNamePre = foundUser.role?.name || "USER";
  if (!isLicenseActive(license) && roleNamePre !== "ADMIN") {
    throw Object.assign(new Error("Licenca inativa para este tenant. Contate o administrador."), { statusCode: 403 });
  }

  const user = await prisma.user.update({
    where: { id: foundUser.id },
    data: { lastSeenAt: new Date() },
    include: {
      role: { include: { perms: true } },
      stores: { include: { store: true }, where: { store: { active: true } } },
    },
  });
  const roleName = user.role?.name || "USER";
  const permissions = (user.role?.perms || []).map((p) => p.permissionKey);
  let stores = user.stores
    .filter((su) => su.store?.tenantId === user.tenantId)
    .map((su) => ({
      id: su.store.id,
      name: su.store.name,
      type: su.store.type,
      isDefault: su.isDefault,
    }));
  if (roleName === "ADMIN") {
    const allStores = await prisma.store.findMany({
      where: { active: true, tenantId: user.tenantId },
      select: { id: true, name: true, type: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    stores = allStores.map((s) => ({ id: s.id, name: s.name, type: s.type, isDefault: s.isDefault }));
  }

  const accessToken = signAccess(user, roleName);
  const refreshToken = signRefresh(user.id, user.tenantId);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: roleName, tenantId: user.tenantId || null },
    permissions,
    stores,
  };
}

async function refresh(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, SECRET);
  } catch {
    throw Object.assign(new Error("Token invalido"), { statusCode: 401 });
  }

  if (payload.type !== "refresh") throw Object.assign(new Error("Token invalido"), { statusCode: 401 });

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { role: true },
  });

  if (!user || !user.active) throw Object.assign(new Error("Usuario inativo"), { statusCode: 401 });

  const roleName = user.role?.name || "USER";
  const license = await loadTenantLicense(user.tenantId);
  if (!isLicenseActive(license) && roleName !== "ADMIN") {
    throw Object.assign(new Error("Licenca inativa para este tenant. Contate o administrador."), { statusCode: 403 });
  }

  const accessToken = signAccess(user, roleName);

  return { accessToken };
}

async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { perms: true } },
      stores: { include: { store: true }, where: { store: { active: true } } },
    },
  });

  if (!user) throw Object.assign(new Error("Usuario nao encontrado"), { statusCode: 404 });

  const roleName = user.role?.name || "USER";
  const permissions = (user.role?.perms || []).map((p) => p.permissionKey);
  let stores = user.stores
    .filter((su) => su.store?.tenantId === user.tenantId)
    .map((su) => ({
      id: su.store.id,
      name: su.store.name,
      type: su.store.type,
      isDefault: su.isDefault,
    }));
  if (roleName === "ADMIN") {
    const allStores = await prisma.store.findMany({
      where: { active: true, tenantId: user.tenantId },
      select: { id: true, name: true, type: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    stores = allStores.map((s) => ({ id: s.id, name: s.name, type: s.type, isDefault: s.isDefault }));
  }

  return {
    user: { id: user.id, name: user.name, email: user.email, role: roleName, tenantId: user.tenantId || null },
    permissions,
    stores,
  };
}

module.exports = { login, refresh, getMe, verifyToken };
