const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { prisma } = require("../../common/prisma");

const SECRET = process.env.JWT_SECRET || "fallback-secret";
const ACCESS_EXP = process.env.JWT_ACCESS_EXPIRES || "15m";
const REFRESH_EXP = process.env.JWT_REFRESH_EXPIRES || "7d";

function signAccess(user, roleName) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: roleName },
    SECRET,
    { expiresIn: ACCESS_EXP }
  );
}

function signRefresh(userId) {
  return jwt.sign({ sub: userId, type: "refresh" }, SECRET, { expiresIn: REFRESH_EXP });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

async function login(email, password) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      role: { include: { perms: true } },
      stores: { include: { store: true }, where: { store: { active: true } } },
    },
  });

  if (!user || !user.active) throw Object.assign(new Error("Credenciais inválidas"), { statusCode: 401 });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw Object.assign(new Error("Credenciais inválidas"), { statusCode: 401 });

  const roleName = user.role?.name || "USER";
  const permissions = (user.role?.perms || []).map((p) => p.permissionKey);
  let stores = user.stores.map((su) => ({
    id: su.store.id,
    name: su.store.name,
    type: su.store.type,
    isDefault: su.isDefault,
  }));
  if (roleName === "ADMIN") {
    const allStores = await prisma.store.findMany({
      where: { active: true },
      select: { id: true, name: true, type: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    stores = allStores.map((s) => ({ id: s.id, name: s.name, type: s.type, isDefault: s.isDefault }));
  }

  const accessToken = signAccess(user, roleName);
  const refreshToken = signRefresh(user.id);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: roleName },
    permissions,
    stores,
  };
}

async function refresh(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, SECRET);
  } catch {
    throw Object.assign(new Error("Token inválido"), { statusCode: 401 });
  }

  if (payload.type !== "refresh") throw Object.assign(new Error("Token inválido"), { statusCode: 401 });

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { role: true },
  });

  if (!user || !user.active) throw Object.assign(new Error("Usuário inativo"), { statusCode: 401 });

  const roleName = user.role?.name || "USER";
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

  if (!user) throw Object.assign(new Error("Usuário não encontrado"), { statusCode: 404 });

  const roleName = user.role?.name || "USER";
  const permissions = (user.role?.perms || []).map((p) => p.permissionKey);
  let stores = user.stores.map((su) => ({
    id: su.store.id,
    name: su.store.name,
    type: su.store.type,
    isDefault: su.isDefault,
  }));
  if (roleName === "ADMIN") {
    const allStores = await prisma.store.findMany({
      where: { active: true },
      select: { id: true, name: true, type: true, isDefault: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    stores = allStores.map((s) => ({ id: s.id, name: s.name, type: s.type, isDefault: s.isDefault }));
  }

  return {
    user: { id: user.id, name: user.name, email: user.email, role: roleName },
    permissions,
    stores,
  };
}

module.exports = { login, refresh, getMe, verifyToken };
