/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function digits(v) {
  return String(v || "").replace(/\D/g, "");
}

async function main() {
  const confirm = String(process.env.CONFIRM_CLEANUP || "").toLowerCase();
  const contractorDoc = digits(process.env.CONTRACTOR_DOCUMENT || "04269451823");
  const dryRun = process.env.DRY_RUN === "1";

  if (confirm !== "yes") {
    console.log("ABORTADO: defina CONFIRM_CLEANUP=yes para executar.");
    return;
  }

  const devTenants = await prisma.tenant.findMany({
    where: { isDeveloperTenant: true },
    select: { id: true, name: true, slug: true },
  });
  if (devTenants.length === 0) {
    throw new Error("Nenhum tenant desenvolvedor encontrado (isDeveloperTenant=true).");
  }
  const devTenantIds = devTenants.map((t) => t.id);

  const targetTenantsByDoc = await prisma.tenant.findMany({
    where: { contractorDocument: contractorDoc },
    select: { id: true, name: true, slug: true },
  });
  const targetTenantIdsByDoc = targetTenantsByDoc.map((t) => t.id);

  const statsBefore = {
    tenantLicense: await prisma.tenantLicense.count(),
    tenantLicenseNonDev: await prisma.tenantLicense.count({ where: { tenantId: { notIn: devTenantIds } } }),
    tenantLicenseTargetDoc: targetTenantIdsByDoc.length > 0
      ? await prisma.tenantLicense.count({ where: { tenantId: { in: targetTenantIdsByDoc } } })
      : 0,
    chatMessage: await prisma.chatMessage.count(),
    stockTransfer: await prisma.stockTransfer.count(),
    stockTransferItem: await prisma.stockTransferItem.count(),
    inventoryMovementWithTransfer: await prisma.inventoryMovement.count({ where: { transferId: { not: null } } }),
  };

  console.log("=== LIMPEZA BASE ===");
  console.log(JSON.stringify({
    dryRun,
    contractorDoc,
    devTenants,
    targetTenantsByDoc,
    before: statsBefore,
  }, null, 2));

  if (dryRun) {
    console.log("DRY_RUN=1 => nenhuma alteração aplicada.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // 1) manter apenas licenças do tenant desenvolvedor
    await tx.tenantLicense.deleteMany({
      where: { tenantId: { notIn: devTenantIds } },
    });

    // 2) garantir remoção da licença do contratante informado
    if (targetTenantIdsByDoc.length > 0) {
      await tx.tenantLicense.deleteMany({
        where: { tenantId: { in: targetTenantIdsByDoc } },
      });
    }

    // 3) limpar chat
    await tx.chatMessage.deleteMany({});

    // 4) limpar transferências sem mover itens
    // Primeiro remove vínculo para evitar FK.
    await tx.inventoryMovement.updateMany({
      where: { transferId: { not: null } },
      data: { transferId: null },
    });
    await tx.stockTransferItem.deleteMany({});
    await tx.stockTransfer.deleteMany({});
  });

  const statsAfter = {
    tenantLicense: await prisma.tenantLicense.count(),
    tenantLicenseNonDev: await prisma.tenantLicense.count({ where: { tenantId: { notIn: devTenantIds } } }),
    tenantLicenseTargetDoc: targetTenantIdsByDoc.length > 0
      ? await prisma.tenantLicense.count({ where: { tenantId: { in: targetTenantIdsByDoc } } })
      : 0,
    chatMessage: await prisma.chatMessage.count(),
    stockTransfer: await prisma.stockTransfer.count(),
    stockTransferItem: await prisma.stockTransferItem.count(),
    inventoryMovementWithTransfer: await prisma.inventoryMovement.count({ where: { transferId: { not: null } } }),
  };

  console.log("=== RESULTADO ===");
  console.log(JSON.stringify({ after: statsAfter }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

