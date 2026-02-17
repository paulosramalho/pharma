// backend/src/common/prisma.js
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function dbPing() {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}

module.exports = { prisma, dbPing };
