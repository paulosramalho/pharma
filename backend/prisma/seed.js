const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const PERMISSIONS = [
  "users.manage", "stores.manage", "products.manage",
  "inventory.receive", "inventory.adjust",
  "sales.create", "sales.cancel",
  "cash.open", "cash.close", "cash.refund",
  "reports.view",
];

const ROLE_PERMISSIONS = {
  ADMIN: PERMISSIONS,
  CAIXA: ["cash.open", "cash.close", "cash.refund", "sales.cancel", "reports.view"],
  VENDEDOR: ["sales.create", "sales.cancel", "reports.view"],
  FARMACEUTICO: ["products.manage", "inventory.receive", "inventory.adjust", "sales.create", "reports.view"],
};

const USERS = [
  { name: "Administrador", email: "admin@pharma.local", password: "admin123", roleName: "ADMIN" },
  { name: "Maria Vendedora", email: "vendedor@pharma.local", password: "vend123", roleName: "VENDEDOR" },
  { name: "João Caixa", email: "caixa@pharma.local", password: "caixa123", roleName: "CAIXA" },
  { name: "Ana Farmacêutica", email: "farma@pharma.local", password: "farma123", roleName: "FARMACEUTICO" },
];

async function main() {
  console.log("Seeding...\n");

  // 1. Stores
  const central = await prisma.store.upsert({
    where: { id: "store-central" },
    update: {},
    create: { id: "store-central", name: "Central", type: "CENTRAL", active: true },
  });
  const loja1 = await prisma.store.upsert({
    where: { id: "store-loja-01" },
    update: {},
    create: { id: "store-loja-01", name: "Loja Centro", type: "LOJA", active: true },
  });
  console.log("  Stores:", central.name, "|", loja1.name);

  // 2. Roles + Permissions
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    for (const pk of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey: pk } },
        update: {},
        create: { roleId: role.id, permissionKey: pk },
      });
    }
    console.log(`  Role ${roleName}: ${perms.length} permissions`);
  }

  // 3. Users
  for (const u of USERS) {
    const role = await prisma.role.findUnique({ where: { name: u.roleName } });
    const passwordHash = await bcrypt.hash(u.password, 10);

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, roleId: role.id },
      create: { name: u.name, email: u.email, passwordHash, active: true, roleId: role.id },
    });

    for (const store of [central, loja1]) {
      await prisma.storeUser.upsert({
        where: { storeId_userId: { storeId: store.id, userId: user.id } },
        update: {},
        create: { storeId: store.id, userId: user.id, isDefault: store.id === loja1.id },
      });
    }
    console.log(`  User ${u.email} (${u.roleName})`);
  }

  // 4. Categories
  const cats = ["Medicamentos", "Higiene", "Cosmeticos", "Suplementos", "Diversos"];
  for (const name of cats) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`  ${cats.length} categories`);

  // 5. Products + Prices + Lots
  const medCat = await prisma.category.findUnique({ where: { name: "Medicamentos" } });
  const higCat = await prisma.category.findUnique({ where: { name: "Higiene" } });

  const products = [
    { name: "Dipirona 500mg", ean: "7891234560001", brand: "Generico", categoryId: medCat.id, controlled: false },
    { name: "Ibuprofeno 400mg", ean: "7891234560002", brand: "Generico", categoryId: medCat.id, controlled: false },
    { name: "Amoxicilina 500mg", ean: "7891234560003", brand: "Generico", categoryId: medCat.id, controlled: true },
    { name: "Paracetamol 750mg", ean: "7891234560004", brand: "Generico", categoryId: medCat.id, controlled: false },
    { name: "Omeprazol 20mg", ean: "7891234560005", brand: "Generico", categoryId: medCat.id, controlled: false },
    { name: "Loratadina 10mg", ean: "7891234560006", brand: "Generico", categoryId: medCat.id, controlled: false },
    { name: "Dorflex", ean: "7891234560007", brand: "Sanofi", categoryId: medCat.id, controlled: false },
    { name: "Buscopan Composto", ean: "7891234560008", brand: "Boehringer", categoryId: medCat.id, controlled: false },
    { name: "Sabonete Dove", ean: "7891234560010", brand: "Dove", categoryId: higCat.id, controlled: false },
    { name: "Shampoo H&S", ean: "7891234560011", brand: "P&G", categoryId: higCat.id, controlled: false },
    { name: "Protetor Solar FPS 50", ean: "7891234560012", brand: "La Roche", categoryId: higCat.id, controlled: false },
    { name: "Creme Dental Colgate", ean: "7891234560013", brand: "Colgate", categoryId: higCat.id, controlled: false },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { ean: p.ean },
      update: {},
      create: { name: p.name, ean: p.ean, brand: p.brand, categoryId: p.categoryId, controlled: p.controlled, active: true },
    });

    const existingPrice = await prisma.productPrice.findFirst({ where: { productId: product.id, active: true } });
    if (!existingPrice) {
      await prisma.productPrice.create({
        data: { productId: product.id, price: parseFloat((Math.random() * 40 + 5).toFixed(2)), active: true },
      });
    }

    const existingLot = await prisma.inventoryLot.findFirst({ where: { productId: product.id, storeId: loja1.id, active: true } });
    if (!existingLot) {
      const exp = new Date();
      exp.setFullYear(exp.getFullYear() + 1);
      await prisma.inventoryLot.create({
        data: {
          productId: product.id, storeId: loja1.id,
          lotNumber: `L${Date.now().toString(36).toUpperCase().slice(-6)}`,
          expiration: exp,
          costUnit: parseFloat((Math.random() * 20 + 2).toFixed(4)),
          quantity: Math.floor(Math.random() * 100) + 10,
          active: true,
        },
      });
    }
  }
  console.log(`  ${products.length} products with prices and lots`);

  console.log("\nSeed complete!");
}

main()
  .catch((e) => { console.error("Seed error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
