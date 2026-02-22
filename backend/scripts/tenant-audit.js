/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

function deriveDirectUrl(url) {
  if (!url || typeof url !== "string") return null;
  if (!url.includes("-pooler.")) return null;
  return url.replace("-pooler.", ".");
}

function resolveCandidateUrls() {
  const urls = [];
  const base = process.env.DATABASE_URL || "";
  const direct = process.env.DIRECT_DATABASE_URL || "";
  if (base) urls.push(base);
  if (direct) urls.push(direct);
  const derived = deriveDirectUrl(base);
  if (derived) urls.push(derived);
  return Array.from(new Set(urls.filter(Boolean)));
}

let prisma = null;

async function scalar(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
  const val = first.count ?? first.total ?? Object.values(first)[0] ?? 0;
  return Number(val || 0);
}

async function run() {
  const checks = [
    {
      name: "store_user_cross_tenant",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "StoreUser" su
        JOIN "Store" s ON s.id = su."storeId"
        JOIN "User" u ON u.id = su."userId"
        WHERE s."tenantId" <> u."tenantId"
      `,
    },
    {
      name: "inventory_lot_cross_tenant",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "InventoryLot" l
        JOIN "Store" s ON s.id = l."storeId"
        JOIN "Product" p ON p.id = l."productId"
        WHERE s."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "inventory_lot_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "InventoryLot" l
        JOIN "Store" s ON s.id = l."storeId"
        JOIN "Product" p ON p.id = l."productId"
        WHERE l."tenantId" <> s."tenantId"
           OR l."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "inventory_movement_store_product_cross_tenant",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "InventoryMovement" m
        JOIN "Store" s ON s.id = m."storeId"
        JOIN "Product" p ON p.id = m."productId"
        WHERE s."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "inventory_movement_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "InventoryMovement" m
        JOIN "Store" s ON s.id = m."storeId"
        JOIN "Product" p ON p.id = m."productId"
        WHERE m."tenantId" <> s."tenantId"
           OR m."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "sale_store_cross_tenant",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "Sale" sa
        JOIN "Store" s ON s.id = sa."storeId"
        WHERE sa."tenantId" <> s."tenantId"
      `,
    },
    {
      name: "sale_customer_cross_tenant",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "Sale" sa
        JOIN "Customer" c ON c.id = sa."customerId"
        WHERE sa."customerId" IS NOT NULL
          AND sa."tenantId" <> c."tenantId"
      `,
    },
    {
      name: "sale_item_cross_tenant",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "SaleItem" si
        JOIN "Sale" sa ON sa.id = si."saleId"
        JOIN "Product" p ON p.id = si."productId"
        WHERE sa."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "sale_item_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "SaleItem" si
        JOIN "Sale" sa ON sa.id = si."saleId"
        JOIN "Product" p ON p.id = si."productId"
        WHERE si."tenantId" <> sa."tenantId"
           OR si."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "payment_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "Payment" p
        JOIN "Sale" sa ON sa.id = p."saleId"
        WHERE p."tenantId" <> sa."tenantId"
      `,
    },
    {
      name: "pos_transaction_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "PosTransaction" pt
        JOIN "Sale" sa ON sa.id = pt."saleId"
        WHERE pt."tenantId" <> sa."tenantId"
      `,
    },
    {
      name: "stock_transfer_cross_tenant_origin",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "StockTransfer" t
        JOIN "Store" s ON s.id = t."originStoreId"
        WHERE t."tenantId" <> s."tenantId"
      `,
    },
    {
      name: "stock_transfer_cross_tenant_destination",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "StockTransfer" t
        JOIN "Store" s ON s.id = t."destinationStoreId"
        WHERE t."tenantId" <> s."tenantId"
      `,
    },
    {
      name: "stock_transfer_item_cross_tenant",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "StockTransferItem" ti
        JOIN "StockTransfer" t ON t.id = ti."transferId"
        JOIN "Product" p ON p.id = ti."productId"
        WHERE t."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "stock_transfer_item_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "StockTransferItem" ti
        JOIN "StockTransfer" t ON t.id = ti."transferId"
        JOIN "Product" p ON p.id = ti."productId"
        WHERE ti."tenantId" <> t."tenantId"
           OR ti."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "stock_reservation_cross_tenant_request",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "StockReservation" r
        JOIN "Store" s ON s.id = r."requestStoreId"
        WHERE r."tenantId" <> s."tenantId"
      `,
    },
    {
      name: "stock_reservation_cross_tenant_source",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "StockReservation" r
        JOIN "Store" s ON s.id = r."sourceStoreId"
        WHERE r."tenantId" <> s."tenantId"
      `,
    },
    {
      name: "stock_reservation_item_cross_tenant",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "StockReservationItem" ri
        JOIN "StockReservation" r ON r.id = ri."reservationId"
        JOIN "Product" p ON p.id = ri."productId"
        WHERE r."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "stock_reservation_item_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "StockReservationItem" ri
        JOIN "StockReservation" r ON r.id = ri."reservationId"
        JOIN "Product" p ON p.id = ri."productId"
        WHERE ri."tenantId" <> r."tenantId"
           OR ri."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "chat_message_cross_tenant_sender",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "ChatMessage" cm
        JOIN "User" u ON u.id = cm."senderId"
        WHERE cm."tenantId" <> u."tenantId"
      `,
    },
    {
      name: "chat_message_cross_tenant_recipient",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "ChatMessage" cm
        JOIN "User" u ON u.id = cm."recipientId"
        WHERE cm."tenantId" <> u."tenantId"
      `,
    },
    {
      name: "cash_session_store_cross_tenant",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "CashSession" cs
        JOIN "Store" s ON s.id = cs."storeId"
        WHERE cs."tenantId" <> s."tenantId"
      `,
    },
    {
      name: "discount_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "Discount" d
        JOIN "Product" p ON p.id = d."productId"
        WHERE d."tenantId" <> p."tenantId"
      `,
    },
    {
      name: "address_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "Address" a
        JOIN "Customer" c ON c.id = a."customerId"
        WHERE a."tenantId" <> c."tenantId"
      `,
    },
    {
      name: "delivery_tenantid_mismatch",
      sql: `
        SELECT COUNT(*)::int AS count
        FROM "Delivery" d
        JOIN "Sale" sa ON sa.id = d."saleId"
        JOIN "Store" s ON s.id = d."storeId"
        WHERE d."tenantId" <> sa."tenantId"
           OR d."tenantId" <> s."tenantId"
      `,
    },
  ];

  const results = [];
  for (const check of checks) {
    const count = await scalar(check.sql);
    results.push({ name: check.name, count });
  }

  const totalIssues = results.reduce((sum, r) => sum + r.count, 0);

  console.log("Tenant audit report");
  console.log("===================");
  for (const r of results) {
    const status = r.count === 0 ? "OK" : "FAIL";
    console.log(`${status.padEnd(5)} ${String(r.count).padStart(5)}  ${r.name}`);
  }
  console.log("-------------------");
  console.log(`Total issues: ${totalIssues}`);

  if (totalIssues > 0) {
    process.exitCode = 1;
  }
}

async function runWithClient(client) {
  prisma = client;
  await run();
}

function isConnectivityError(err) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("Can't reach database server")
    || msg.includes("timed out")
    || msg.includes("ECONN")
  );
}

async function main() {
  const candidates = resolveCandidateUrls();
  if (candidates.length === 0) {
    throw new Error("DATABASE_URL nao definido.");
  }

  let lastErr = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i];
    const client = new PrismaClient({
      datasources: { db: { url } },
    });
    try {
      await runWithClient(client);
      return;
    } catch (err) {
      lastErr = err;
      await client.$disconnect();
      if (!isConnectivityError(err)) throw err;
      if (i < candidates.length - 1) {
        console.warn(`tenant-audit: falha de conectividade na tentativa ${i + 1}, tentando proxima URL...`);
      }
    }
  }
  throw lastErr || new Error("Falha ao executar tenant-audit.");
}

main()
  .catch((err) => {
    console.error("tenant-audit error:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
