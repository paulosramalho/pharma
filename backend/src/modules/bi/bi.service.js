const { Prisma } = require("@prisma/client");

function toDateISO(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function parseRange({ from, to, days }) {
  const today = new Date();
  const dTo = to ? new Date(to) : today;
  const dFrom = from ? new Date(from) : new Date(dTo.getTime() - (Number(days || 30) * 86400000));
  return { fromISO: toDateISO(dFrom), toISO: toDateISO(dTo) };
}

async function kpis({ prisma, storeId, from, to }) {
  const { fromISO, toISO } = parseRange({ from, to, days: 30 });

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      COUNT(*)::int as sales_count,
      COALESCE(SUM(total), 0)::numeric as gross_revenue,
      COALESCE(SUM(discount), 0)::numeric as total_discount
    FROM "Sale"
    WHERE status = 'PAID'
      AND "storeId" = ${storeId}
      AND "createdAt" >= ${fromISO}::date
      AND "createdAt" < (${toISO}::date + INTERVAL '1 day')
  `);

  const r = rows?.[0] || { sales_count: 0, gross_revenue: "0", total_discount: "0" };

  return {
    storeId,
    from: fromISO,
    to: toISO,
    salesCount: Number(r.sales_count || 0),
    grossRevenue: Number(r.gross_revenue || 0),
    totalDiscount: Number(r.total_discount || 0),
  };
}

/**
 * Top demand series (qty) with optional ranking metric:
 *   rankBy=QTY (default) or rankBy=REVENUE (uses SaleItem.subtotal)
 * Response always includes qty series; when rankBy=REVENUE also returns revenue in summary and daily series.
 */
async function topDemandSeries({ prisma, storeId, days = 30, top = 20, rankBy = "QTY" }) {
  const { fromISO, toISO } = parseRange({ days });

  const by = String(rankBy || "QTY").toUpperCase().trim();
  const rankExpr = by === "REVENUE" ? Prisma.sql`COALESCE(SUM(si."subtotal"),0)` : Prisma.sql`COALESCE(SUM(si."quantity"),0)`;

  const topRows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      si."productId" as product_id,
      COALESCE(SUM(si."quantity"),0)::numeric as qty,
      COALESCE(SUM(si."subtotal"),0)::numeric as revenue
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId"
    WHERE s.status = 'PAID'
      AND s."storeId" = ${storeId}
      AND s."createdAt" >= ${fromISO}::date
      AND s."createdAt" < (${toISO}::date + INTERVAL '1 day')
    GROUP BY si."productId"
    ORDER BY ${rankExpr} DESC
    LIMIT ${Number(top || 20)}
  `);

  const productIds = topRows.map(r => r.product_id).filter(Boolean);
  if (productIds.length === 0) return { storeId, from: fromISO, to: toISO, rankBy: by, products: [] };

  const seriesRows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      si."productId" as product_id,
      to_char(date_trunc('day', s."createdAt"), 'YYYY-MM-DD') as day,
      COALESCE(SUM(si."quantity"),0)::numeric as qty,
      COALESCE(SUM(si."subtotal"),0)::numeric as revenue
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId"
    WHERE s.status = 'PAID'
      AND s."storeId" = ${storeId}
      AND s."createdAt" >= ${fromISO}::date
      AND s."createdAt" < (${toISO}::date + INTERVAL '1 day')
      AND si."productId" IN (${Prisma.join(productIds)})
    GROUP BY si."productId", day
    ORDER BY si."productId", day
  `);

  const prodRows = await prisma.$queryRaw(Prisma.sql`
    SELECT id, ean, name
    FROM "Product"
    WHERE id IN (${Prisma.join(productIds)})
  `);
  const prodMap = new Map(prodRows.map(p => [p.id, p]));

  const map = new Map();
  for (const row of seriesRows) {
    const pid = row.product_id;
    const day = row.day;
    const qty = Number(row.qty || 0);
    const revenue = Number(row.revenue || 0);
    if (!map.has(pid)) map.set(pid, new Map());
    map.get(pid).set(day, { qty, revenue });
  }

  const start = new Date(fromISO + "T00:00:00Z");
  const end = new Date(toISO + "T00:00:00Z");
  const daysList = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    daysList.push(`${yyyy}-${mm}-${dd}`);
  }

  const topMap = new Map(topRows.map(r => [r.product_id, { qty: Number(r.qty||0), revenue: Number(r.revenue||0) }]));

  const products = productIds.map(pid => {
    const meta = prodMap.get(pid) || { id: pid, ean: null, name: null };
    const dayMap = map.get(pid) || new Map();
    const series = daysList.map(day => {
      const v = dayMap.get(day) || { qty: 0, revenue: 0 };
      return { date: day, qty: Number(v.qty||0), revenue: Number(v.revenue||0) };
    });
    const totals = topMap.get(pid) || { qty: 0, revenue: 0 };
    return { productId: pid, ean: meta.ean, name: meta.name, totals, series };
  });

  return { storeId, from: fromISO, to: toISO, rankBy: by, products };
}

module.exports = { kpis, topDemandSeries };
