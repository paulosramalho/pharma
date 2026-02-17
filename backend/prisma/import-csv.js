const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

// ─── Category mapping by product name keywords ───
const CATEGORY_RULES = [
  { keywords: ["mg", "cápsula", "comprimido", "sódica", "potássica", "metformina", "clonazepam", "azitromicina", "amoxicilina", "omeprazol", "loratadina", "ibuprofeno", "paracetamol", "dipirona", "rivotril"], category: "Medicamentos" },
  { keywords: ["vitamina", "efervescente"], category: "Suplementos" },
  { keywords: ["shampoo", "condicionador", "sabonete", "desodorante", "creme dental", "escova dental", "fio dental", "enxaguante", "absorvente", "papel higiênico", "protetor solar"], category: "Higiene" },
  { keywords: ["termômetro", "máscara", "álcool", "soro fisiológico", "curativo", "gaze", "algodão", "seringa"], category: "Diversos" },
];

// ─── Price ranges by category ───
const PRICE_RANGES = {
  Medicamentos: [5, 45],
  Suplementos: [12, 35],
  Higiene: [4, 30],
  Cosmeticos: [15, 60],
  Diversos: [3, 25],
};

function guessCategory(name) {
  const lower = name.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.category;
  }
  return "Diversos";
}

function randomPrice(category) {
  const [min, max] = PRICE_RANGES[category] || [5, 30];
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function randomCost(price) {
  return parseFloat((price * (0.3 + Math.random() * 0.3)).toFixed(4));
}

function randomQty() {
  return Math.floor(Math.random() * 150) + 20;
}

function futureExpiration() {
  const d = new Date();
  d.setMonth(d.getMonth() + Math.floor(Math.random() * 18) + 6);
  return d;
}

function parseCsv(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // Handle quoted fields
    const values = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
    rows.push(row);
  }
  return rows;
}

async function main() {
  console.log("═══ Import CSV Products + Create Users ═══\n");

  // 1. Ensure categories exist
  const cats = ["Medicamentos", "Higiene", "Cosmeticos", "Suplementos", "Diversos"];
  const categoryMap = {};
  for (const name of cats) {
    const cat = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    categoryMap[name] = cat.id;
  }
  console.log(`  ✓ ${cats.length} categories ready`);

  // 2. Get store for inventory
  const loja = await prisma.store.findFirst({ where: { type: "LOJA", active: true } });
  if (!loja) { console.error("  ✗ No active LOJA store found!"); return; }
  console.log(`  ✓ Using store: ${loja.name} (${loja.id})`);

  // 3. Read CSV
  const csvPath = path.resolve(__dirname, "../../Depósito/Pharma_Produtos_Ficticios.csv");
  if (!fs.existsSync(csvPath)) { console.error(`  ✗ CSV not found at ${csvPath}`); return; }
  const csv = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(csv);
  console.log(`  ✓ ${rows.length} rows in CSV\n`);

  // 4. Import products
  let created = 0, skipped = 0;
  for (const row of rows) {
    const ean = row.ean;
    const name = row.name;
    const brand = row.brand || "Genérico";
    const controlled = row.controlled === "true";

    const catName = guessCategory(name);
    const categoryId = categoryMap[catName];
    const price = randomPrice(catName);
    const cost = randomCost(price);
    const qty = randomQty();
    const expiration = futureExpiration();

    // Upsert product
    const existing = await prisma.product.findUnique({ where: { ean } });
    if (existing) {
      skipped++;
      continue;
    }

    const product = await prisma.product.create({
      data: { name, ean, brand, controlled, active: true, categoryId },
    });

    // Price
    await prisma.productPrice.create({
      data: { productId: product.id, price, active: true },
    });

    // Inventory lot
    await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        storeId: loja.id,
        lotNumber: `L${Date.now().toString(36).toUpperCase().slice(-6)}`,
        expiration,
        costUnit: cost,
        quantity: qty,
        active: true,
      },
    });

    console.log(`  + ${name.padEnd(55)} ${catName.padEnd(14)} ${("R$ " + price.toFixed(2)).padStart(10)} qty=${String(qty).padStart(3)}`);
    created++;
  }

  console.log(`\n  Products: ${created} created, ${skipped} skipped (already exist)`);

  // 5. Ensure users exist
  console.log("\n─── Users ───");

  const USERS = [
    { name: "Maria Vendedora", email: "vendedor@pharma.local", password: "vend123", roleName: "VENDEDOR" },
    { name: "João Caixa", email: "caixa@pharma.local", password: "caixa123", roleName: "CAIXA" },
    { name: "Ana Farmacêutica", email: "farma@pharma.local", password: "farma123", roleName: "FARMACEUTICO" },
  ];

  for (const u of USERS) {
    const role = await prisma.role.findUnique({ where: { name: u.roleName } });
    if (!role) { console.log(`  ✗ Role ${u.roleName} not found`); continue; }

    const passwordHash = await bcrypt.hash(u.password, 10);

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, roleId: role.id, name: u.name },
      create: { name: u.name, email: u.email, passwordHash, active: true, roleId: role.id },
    });

    // Ensure store access
    const stores = await prisma.store.findMany({ where: { active: true } });
    for (const store of stores) {
      await prisma.storeUser.upsert({
        where: { storeId_userId: { storeId: store.id, userId: user.id } },
        update: {},
        create: { storeId: store.id, userId: user.id, isDefault: store.id === loja.id },
      });
    }

    console.log(`  ✓ ${u.email} (${u.roleName}) — senha: ${u.password}`);
  }

  console.log("\n═══ Done! ═══");
}

main()
  .catch((e) => { console.error("Import error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
