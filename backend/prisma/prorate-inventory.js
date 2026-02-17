const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Prorate existing inventory lots across all active stores.
 * Distribution: 20% Central (warehouse), rest split evenly among LOJAs.
 * Creates new lots on target stores with same product/expiration/cost.
 */
async function main() {
  console.log("═══ Prorate Inventory Across Stores ═══\n");

  const stores = await prisma.store.findMany({ where: { active: true }, orderBy: { type: "asc" } });
  const central = stores.find((s) => s.type === "CENTRAL");
  const lojas = stores.filter((s) => s.type === "LOJA");

  console.log(`  Stores: ${stores.map((s) => `${s.name} (${s.type})`).join(", ")}`);
  if (!central) console.log("  ⚠ No CENTRAL store found — skipping warehouse allocation");
  console.log(`  LOJAs: ${lojas.length}\n`);

  // Get all lots with qty > 0
  const allLots = await prisma.inventoryLot.findMany({
    where: { active: true, quantity: { gt: 0 } },
    include: { product: true, store: true },
  });

  console.log(`  Total lots to process: ${allLots.length}\n`);

  // Group lots by productId
  const byProduct = {};
  for (const lot of allLots) {
    if (!byProduct[lot.productId]) byProduct[lot.productId] = [];
    byProduct[lot.productId].push(lot);
  }

  let created = 0;
  let updated = 0;

  for (const [productId, lots] of Object.entries(byProduct)) {
    const productName = lots[0].product.name;

    // Sum total qty for this product across all stores
    const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
    if (totalQty < lojas.length + (central ? 1 : 0)) continue; // too few to split

    // Calculate target qty per store
    const centralPct = central ? 0.15 : 0;
    const centralQty = central ? Math.floor(totalQty * centralPct) : 0;
    const remainingQty = totalQty - centralQty;
    const perLojaQty = Math.floor(remainingQty / lojas.length);

    // Pick the "best" lot for metadata (cost, expiration, lotNumber)
    const templateLot = lots.reduce((best, l) => l.quantity > best.quantity ? l : best, lots[0]);

    // First, set ALL existing lots for this product to 0
    for (const lot of lots) {
      if (lot.quantity > 0) {
        await prisma.inventoryLot.update({ where: { id: lot.id }, data: { quantity: 0 } });
      }
    }

    // Now distribute: upsert lots on each target store
    const targets = [];
    if (central) targets.push({ store: central, qty: centralQty });
    for (let i = 0; i < lojas.length; i++) {
      // Last loja gets the remainder to avoid rounding loss
      const qty = i === lojas.length - 1
        ? totalQty - centralQty - perLojaQty * (lojas.length - 1)
        : perLojaQty;
      targets.push({ store: lojas[i], qty });
    }

    for (const target of targets) {
      if (target.qty <= 0) continue;

      const lot = await prisma.inventoryLot.upsert({
        where: {
          storeId_productId_lotNumber_expiration: {
            storeId: target.store.id,
            productId,
            lotNumber: templateLot.lotNumber,
            expiration: templateLot.expiration,
          },
        },
        update: { quantity: target.qty, costUnit: templateLot.costUnit },
        create: {
          storeId: target.store.id,
          productId,
          lotNumber: templateLot.lotNumber,
          expiration: templateLot.expiration,
          costUnit: templateLot.costUnit,
          quantity: target.qty,
          active: true,
        },
      });

      // Create IN movement for the allocation
      await prisma.inventoryMovement.create({
        data: {
          storeId: target.store.id,
          productId,
          lotId: lot.id,
          type: "IN",
          quantity: target.qty,
          reason: "Rateio inicial de estoque",
        },
      });

      created++;
    }

    const distribution = targets.map((t) => `${t.store.name}=${t.qty}`).join(", ");
    console.log(`  ${productName.padEnd(55)} total=${totalQty} → ${distribution}`);
    updated++;
  }

  console.log(`\n  Products distributed: ${updated}`);
  console.log(`  Lots created/updated: ${created}`);
  console.log("\n═══ Done! ═══");
}

main()
  .catch((e) => { console.error("Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
