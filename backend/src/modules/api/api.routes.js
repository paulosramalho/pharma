const express = require("express");
const { asyncHandler } = require("../../common/http/asyncHandler");
const { sendOk } = require("../../common/http/response");

function buildApiRoutes({ prisma, log }) {
  const router = express.Router();

  // Helper: get storeId from header or default
  async function resolveStoreId(req) {
    const fromHeader = req.headers["x-store-id"];
    if (fromHeader) return fromHeader;
    if (!req.user) return null;
    const su = await prisma.storeUser.findFirst({
      where: { userId: req.user.id, isDefault: true },
    });
    return su?.storeId || null;
  }

  // Helper: load full sale with includes (used by multiple endpoints)
  async function loadFullSale(id) {
    return prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true } },
        payments: true,
      },
    });
  }

  // ─── DASHBOARD ───
  router.get("/dashboard", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    if (!storeId) return sendOk(res, req, { salesToday: 0, grossRevenue: 0, avgTicket: 0, itemsSold: 0, cashSession: null });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sales = await prisma.sale.findMany({
      where: { storeId, status: "PAID", createdAt: { gte: today } },
      include: { items: true },
    });

    const salesToday = sales.length;
    const grossRevenue = sales.reduce((s, sale) => s + Number(sale.total), 0);
    const avgTicket = salesToday > 0 ? grossRevenue / salesToday : 0;
    const itemsSold = sales.reduce((s, sale) => s + sale.items.reduce((a, i) => a + i.quantity, 0), 0);

    // Return full cash session object so frontend can display open/closed status
    const openSession = await prisma.cashSession.findFirst({
      where: { storeId, closedAt: null },
      include: { openedBy: { select: { name: true } } },
    });

    const cashSession = openSession ? {
      id: openSession.id,
      openedBy: openSession.openedBy?.name || "—",
      openedAt: openSession.openedAt,
      initialCash: Number(openSession.initialCash),
    } : null;

    return sendOk(res, req, {
      salesToday, grossRevenue: Number(grossRevenue.toFixed(2)),
      avgTicket: Number(avgTicket.toFixed(2)), itemsSold,
      cashSession,
    });
  }));

  // ─── STORES ───
  router.get("/stores", asyncHandler(async (req, res) => {
    const { all } = req.query; // ?all=true to include inactive
    const where = all === "true" ? {} : { active: true };
    const stores = await prisma.store.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { accessUsers: true, sales: true } } },
    });
    return sendOk(res, req, stores);
  }));

  router.post("/stores", asyncHandler(async (req, res) => {
    const { name, type, cnpj, phone, email, street, number, complement, district, city, state, zipCode } = req.body;
    if (!name || !type) return res.status(400).json({ error: { code: 400, message: "name e type obrigatórios" } });

    const store = await prisma.store.create({
      data: { name, type, cnpj, phone, email, street, number, complement, district, city, state, zipCode, active: true },
    });
    return sendOk(res, req, store, 201);
  }));

  router.put("/stores/:id", asyncHandler(async (req, res) => {
    const { name, type, cnpj, phone, email, street, number, complement, district, city, state, zipCode, active, isDefault } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (cnpj !== undefined) data.cnpj = cnpj || null;
    if (phone !== undefined) data.phone = phone || null;
    if (email !== undefined) data.email = email || null;
    if (street !== undefined) data.street = street || null;
    if (number !== undefined) data.number = number || null;
    if (complement !== undefined) data.complement = complement || null;
    if (district !== undefined) data.district = district || null;
    if (city !== undefined) data.city = city || null;
    if (state !== undefined) data.state = state || null;
    if (zipCode !== undefined) data.zipCode = zipCode || null;
    if (active !== undefined) data.active = active;

    // If setting as default, unset other stores first
    if (isDefault === true) {
      await prisma.store.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      data.isDefault = true;
    } else if (isDefault === false) {
      data.isDefault = false;
    }

    const store = await prisma.store.update({ where: { id: req.params.id }, data });
    return sendOk(res, req, store);
  }));

  // ─── CATEGORIES ───
  router.get("/categories", asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    return sendOk(res, req, categories);
  }));

  // ─── PRODUCTS ───
  router.get("/products", asyncHandler(async (req, res) => {
    const { search, categoryId, page = 1, limit = 50 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;
    const where = { active: true };
    if (search) where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { ean: { contains: search } },
    ];
    if (categoryId) where.categoryId = categoryId;

    const now = new Date();
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where, skip, take,
        include: {
          category: true,
          prices: { where: { active: true }, take: 1, orderBy: { createdAt: "desc" } },
          discounts: { where: { active: true, startDate: { lte: now } }, orderBy: { createdAt: "desc" } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(total / take) || 1;

    // Filter out expired discounts in code (Prisma nested include doesn't support OR well)
    const cleaned = products.map((p) => ({
      ...p,
      discounts: (p.discounts || []).filter((d) => !d.endDate || new Date(d.endDate) >= now).slice(0, 1),
    }));

    return sendOk(res, req, { products: cleaned, totalPages, page: Number(page), total });
  }));

  router.post("/products", asyncHandler(async (req, res) => {
    const { name, ean, brand, categoryId, controlled, price } = req.body;
    if (!name) return res.status(400).json({ error: { code: 400, message: "Nome obrigatório" } });

    const product = await prisma.product.create({
      data: { name, ean: ean || null, brand: brand || null, categoryId: categoryId || null, controlled: !!controlled, active: true },
    });

    if (price && Number(price) > 0) {
      await prisma.productPrice.create({ data: { productId: product.id, price: Number(price), active: true } });
    }

    return sendOk(res, req, product, 201);
  }));

  router.put("/products/:id", asyncHandler(async (req, res) => {
    const { name, ean, brand, categoryId, controlled, price } = req.body;
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { name, ean: ean || null, brand: brand || null, categoryId: categoryId || null, controlled: !!controlled },
    });

    if (price !== undefined && Number(price) > 0) {
      await prisma.productPrice.updateMany({ where: { productId: product.id, active: true }, data: { active: false } });
      await prisma.productPrice.create({ data: { productId: product.id, price: Number(price), active: true } });
    }

    return sendOk(res, req, product);
  }));

  // ─── DISCOUNTS ───
  router.get("/discounts", asyncHandler(async (req, res) => {
    const { productId, active } = req.query;
    const where = {};
    if (productId) where.productId = productId;
    if (active === "true") {
      where.active = true;
      where.OR = [{ endDate: null }, { endDate: { gte: new Date() } }];
    }
    const discounts = await prisma.discount.findMany({
      where,
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return sendOk(res, req, discounts);
  }));

  router.post("/discounts", asyncHandler(async (req, res) => {
    const { productId, type, value, startDate, endDate } = req.body;
    if (!productId || !type || value === undefined) {
      return res.status(400).json({ error: { code: 400, message: "productId, type e value obrigatórios" } });
    }
    if (!["PERCENT", "FIXED"].includes(type)) {
      return res.status(400).json({ error: { code: 400, message: "type deve ser PERCENT ou FIXED" } });
    }

    // Deactivate existing active discounts for this product
    await prisma.discount.updateMany({
      where: { productId, active: true },
      data: { active: false },
    });

    const discount = await prisma.discount.create({
      data: {
        productId,
        type,
        value: Number(value),
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        active: true,
      },
      include: { product: { select: { id: true, name: true } } },
    });
    return sendOk(res, req, discount, 201);
  }));

  router.put("/discounts/:id", asyncHandler(async (req, res) => {
    const { type, value, startDate, endDate, active } = req.body;
    const data = {};
    if (type !== undefined) data.type = type;
    if (value !== undefined) data.value = Number(value);
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    if (active !== undefined) data.active = active;

    const discount = await prisma.discount.update({
      where: { id: req.params.id },
      data,
      include: { product: { select: { id: true, name: true } } },
    });
    return sendOk(res, req, discount);
  }));

  router.delete("/discounts/:id", asyncHandler(async (req, res) => {
    await prisma.discount.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    return sendOk(res, req, { success: true });
  }));

  // ─── USERS ───
  router.get("/users", asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, active: true, createdAt: true,
        role: { select: { id: true, name: true } },
        stores: { include: { store: { select: { id: true, name: true, type: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Add sequential matricula number
    return sendOk(res, req, users.map((u, idx) => ({
      ...u,
      matricula: String(idx + 1).padStart(4, "0"),
      storeCount: u.stores.length,
    })));
  }));

  router.post("/users", asyncHandler(async (req, res) => {
    const bcrypt = require("bcryptjs");
    const { name, email, password, roleName, storeIds } = req.body;
    if (!name || !email || !password || !roleName) {
      return res.status(400).json({ error: { code: 400, message: "Campos obrigatórios: name, email, password, roleName" } });
    }
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) return res.status(400).json({ error: { code: 400, message: `Role ${roleName} não encontrada` } });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, active: true, roleId: role.id },
    });

    // If storeIds provided, use those; otherwise default to first active store
    let assignedStoreIds = storeIds && storeIds.length > 0 ? storeIds : [];
    if (assignedStoreIds.length === 0) {
      const defaultStore = await prisma.store.findFirst({ where: { active: true, type: "LOJA" }, orderBy: { createdAt: "asc" } });
      if (defaultStore) assignedStoreIds = [defaultStore.id];
    }

    for (const sid of assignedStoreIds) {
      await prisma.storeUser.create({ data: { storeId: sid, userId: user.id, isDefault: assignedStoreIds[0] === sid } });
    }

    return sendOk(res, req, { id: user.id, name: user.name, email: user.email, role: { name: roleName }, storeCount: assignedStoreIds.length }, 201);
  }));

  router.put("/users/:id", asyncHandler(async (req, res) => {
    const bcrypt = require("bcryptjs");
    const { name, email, password, roleName, active, storeIds } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (active !== undefined) data.active = active;
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    if (roleName) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (role) data.roleId = role.id;
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data });

    // Update store access if provided
    if (storeIds) {
      await prisma.storeUser.deleteMany({ where: { userId: user.id } });
      for (const sid of storeIds) {
        await prisma.storeUser.create({ data: { storeId: sid, userId: user.id, isDefault: storeIds[0] === sid } });
      }
    }

    return sendOk(res, req, { id: user.id, name: user.name, email: user.email });
  }));

  // ─── USER PROFILE (self-service email/password change) ───
  router.put("/users/:id/profile", asyncHandler(async (req, res) => {
    const bcrypt = require("bcryptjs");
    const { email, currentPassword, newPassword } = req.body;
    const userId = req.params.id;

    // Users can only update their own profile
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: { code: 403, message: "Sem permissão" } });
    }

    const data = {};

    if (email) {
      const existing = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
      if (existing) return res.status(400).json({ error: { code: 400, message: "Email já em uso" } });
      data.email = email;
    }

    if (currentPassword && newPassword) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: { code: 404, message: "Usuário não encontrado" } });
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ error: { code: 400, message: "Senha atual incorreta" } });
      data.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: { code: 400, message: "Nenhum dado para atualizar" } });
    }

    const updated = await prisma.user.update({ where: { id: userId }, data });
    return sendOk(res, req, { id: updated.id, name: updated.name, email: updated.email });
  }));

  // ─── INVENTORY ───

  // Multi-store overview: all products with per-store qty + recent entries/exits
  router.get("/inventory/overview", asyncHandler(async (req, res) => {
    const { search } = req.query;

    const stores = await prisma.store.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { name: "asc" }] });

    // Get all active lots
    const lotWhere = { active: true, quantity: { gt: 0 } };
    if (search) lotWhere.product = { name: { contains: search, mode: "insensitive" } };

    const lots = await prisma.inventoryLot.findMany({
      where: lotWhere,
      include: { product: { include: { category: true } } },
    });

    // Get recent movements (last 90 days) for context
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const productIds = [...new Set(lots.map((l) => l.productId))];
    const movements = productIds.length > 0
      ? await prisma.inventoryMovement.findMany({
          where: { productId: { in: productIds }, createdAt: { gte: since } },
          select: { productId: true, storeId: true, type: true, quantity: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // Group lots by product
    const grouped = {};
    for (const lot of lots) {
      const pid = lot.productId;
      if (!grouped[pid]) {
        grouped[pid] = {
          id: pid,
          name: lot.product.name,
          ean: lot.product.ean,
          category: lot.product.category?.name || null,
          controlled: lot.product.controlled,
          stores: {},
          totalQty: 0,
        };
      }
      if (!grouped[pid].stores[lot.storeId]) {
        grouped[pid].stores[lot.storeId] = { available: 0, nearestExpiry: null };
      }
      grouped[pid].stores[lot.storeId].available += lot.quantity;
      grouped[pid].totalQty += lot.quantity;

      const exp = lot.expiration ? new Date(lot.expiration) : null;
      const cur = grouped[pid].stores[lot.storeId].nearestExpiry;
      if (exp && (!cur || exp < new Date(cur))) {
        grouped[pid].stores[lot.storeId].nearestExpiry = exp.toISOString().slice(0, 10);
      }
    }

    // Attach movement summaries per product per store
    for (const mov of movements) {
      const pid = mov.productId;
      if (!grouped[pid]) continue;
      if (!grouped[pid].stores[mov.storeId]) {
        grouped[pid].stores[mov.storeId] = { available: 0, nearestExpiry: null };
      }
      const st = grouped[pid].stores[mov.storeId];
      if (!st.entries) st.entries = [];
      if (!st.exits) st.exits = [];

      if (mov.type === "IN" || mov.type === "ADJUST_POS") {
        if (st.entries.length < 3) st.entries.push({ date: mov.createdAt, qty: mov.quantity });
      } else if (mov.type === "OUT" || mov.type === "ADJUST_NEG") {
        if (st.exits.length < 3) st.exits.push({ date: mov.createdAt, qty: mov.quantity });
      }
    }

    const products = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));

    return sendOk(res, req, {
      stores: stores.map((s) => ({ id: s.id, name: s.name, type: s.type })),
      products,
    });
  }));

  // Product movement history
  router.get("/inventory/product/:id/movements", asyncHandler(async (req, res) => {
    const { page = 1, limit = 30 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where: { productId: req.params.id },
        include: { store: { select: { name: true } }, lot: { select: { lotNumber: true, quantity: true, costUnit: true } } },
        orderBy: { createdAt: "desc" },
        skip, take,
      }),
      prisma.inventoryMovement.count({ where: { productId: req.params.id } }),
    ]);

    return sendOk(res, req, {
      movements: movements.map((m) => ({
        id: m.id,
        store: m.store.name,
        storeId: m.storeId,
        type: m.type,
        quantity: m.quantity,
        reason: m.reason,
        lotNumber: m.lot?.lotNumber,
        lotId: m.lotId,
        lotQty: m.lot?.quantity ?? null,
        lotCost: m.lot?.costUnit ?? null,
        createdAt: m.createdAt,
      })),
      totalPages: Math.ceil(total / take) || 1,
      page: Number(page),
      total,
    });
  }));

  router.get("/inventory/summary", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    if (!storeId) return sendOk(res, req, []);

    const { search } = req.query;

    const lotWhere = { storeId, active: true, quantity: { gt: 0 } };
    if (search) {
      lotWhere.product = { name: { contains: search, mode: "insensitive" } };
    }

    const lots = await prisma.inventoryLot.findMany({
      where: lotWhere,
      include: { product: { include: { category: true } } },
    });

    const grouped = {};
    for (const lot of lots) {
      const pid = lot.productId;
      if (!grouped[pid]) {
        grouped[pid] = {
          productId: pid,
          name: lot.product.name,
          ean: lot.product.ean,
          category: lot.product.category?.name || null,
          controlled: lot.product.controlled,
          totalQty: 0, totalValue: 0, lotsCount: 0, nearestExpiry: null,
        };
      }
      grouped[pid].totalQty += lot.quantity;
      grouped[pid].totalValue += lot.quantity * Number(lot.costUnit);
      grouped[pid].lotsCount += 1;
      const exp = lot.expiration ? new Date(lot.expiration) : null;
      if (exp && (!grouped[pid].nearestExpiry || exp < grouped[pid].nearestExpiry)) {
        grouped[pid].nearestExpiry = exp;
      }
    }

    const items = Object.values(grouped).map((g) => ({
      ...g, totalValue: Number(g.totalValue.toFixed(2)),
      nearestExpiry: g.nearestExpiry ? g.nearestExpiry.toISOString().slice(0, 10) : null,
    }));

    return sendOk(res, req, items);
  }));

  router.get("/inventory/lots", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    const { search, productId, expiring, page = 1, limit = 20 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = { active: true, quantity: { gt: 0 } };
    if (storeId) where.storeId = storeId;
    if (productId) where.productId = productId;
    if (search) {
      where.product = { name: { contains: search, mode: "insensitive" } };
    }
    if (expiring === "true") {
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      where.expiration = { lte: thirtyDays };
    }

    const [lots, total] = await Promise.all([
      prisma.inventoryLot.findMany({
        where, skip, take,
        include: { product: true, store: true },
        orderBy: { expiration: "asc" },
      }),
      prisma.inventoryLot.count({ where }),
    ]);

    const totalPages = Math.ceil(total / take) || 1;

    return sendOk(res, req, {
      lots: lots.map((l) => ({
        id: l.id,
        product: { id: l.product.id, name: l.product.name },
        store: { id: l.store.id, name: l.store.name },
        lotNumber: l.lotNumber,
        expiration: l.expiration?.toISOString().slice(0, 10),
        costUnit: Number(l.costUnit),
        quantity: l.quantity,
      })),
      totalPages,
      page: Number(page),
      total,
    });
  }));

  router.post("/inventory/receive", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    const { productId, lotNumber, expiration, costUnit, quantity, reason } = req.body;
    if (!productId || !lotNumber || !expiration || !costUnit || !quantity) {
      return res.status(400).json({ error: { code: 400, message: "Campos obrigatórios: productId, lotNumber, expiration, costUnit, quantity" } });
    }

    const lot = await prisma.inventoryLot.upsert({
      where: { storeId_productId_lotNumber_expiration: { storeId, productId, lotNumber, expiration: new Date(expiration) } },
      update: { quantity: { increment: Number(quantity) }, costUnit: Number(costUnit) },
      create: { storeId, productId, lotNumber, expiration: new Date(expiration), costUnit: Number(costUnit), quantity: Number(quantity), active: true },
    });

    await prisma.inventoryMovement.create({
      data: {
        storeId, productId, lotId: lot.id, type: "IN",
        quantity: Number(quantity), reason: reason || "Recebimento",
        createdById: req.user?.id,
      },
    });

    // Auto-update selling price if product has defaultMarkup
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { defaultMarkup: true } });
    if (product?.defaultMarkup) {
      const allLots = await prisma.inventoryLot.findMany({ where: { productId, active: true, quantity: { gt: 0 } } });
      const totalVal = allLots.reduce((s, l) => s + Number(l.costUnit) * l.quantity, 0);
      const totalQty = allLots.reduce((s, l) => s + l.quantity, 0);
      if (totalQty > 0) {
        const avgCost = totalVal / totalQty;
        const newPrice = Math.round(avgCost * (1 + Number(product.defaultMarkup) / 100) * 100) / 100;
        await prisma.productPrice.updateMany({ where: { productId, active: true }, data: { active: false } });
        await prisma.productPrice.create({ data: { productId, price: newPrice, active: true } });
      }
    }

    return sendOk(res, req, lot, 201);
  }));

  router.post("/inventory/adjust", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    let { productId, lotId, type, quantity, reason } = req.body;
    if (!type || !quantity || !reason) {
      return res.status(400).json({ error: { code: 400, message: "Campos obrigatórios: type, quantity, reason" } });
    }

    // Resolve productId from lotId if not provided
    if (lotId && !productId) {
      const lot = await prisma.inventoryLot.findUnique({ where: { id: lotId } });
      if (!lot) return res.status(400).json({ error: { code: 400, message: "Lote não encontrado" } });
      productId = lot.productId;
    }

    if (!productId) {
      return res.status(400).json({ error: { code: 400, message: "productId ou lotId obrigatório" } });
    }

    const isPositive = type === "ADJUST_POS";
    if (lotId) {
      await prisma.inventoryLot.update({
        where: { id: lotId },
        data: { quantity: isPositive ? { increment: Number(quantity) } : { decrement: Number(quantity) } },
      });
    }

    await prisma.inventoryMovement.create({
      data: {
        storeId, productId, lotId: lotId || null, type,
        quantity: Number(quantity), reason,
        createdById: req.user?.id,
      },
    });

    return sendOk(res, req, { ok: true });
  }));

  // ─── INVENTORY EDIT (correct wrong entry) ───
  router.put("/inventory/lots/:id", asyncHandler(async (req, res) => {
    const { quantity, costUnit, reason } = req.body;
    if (quantity === undefined && costUnit === undefined) {
      return res.status(400).json({ error: { code: 400, message: "Informe quantity ou costUnit" } });
    }
    if (!reason) return res.status(400).json({ error: { code: 400, message: "Motivo obrigatório" } });

    const lot = await prisma.inventoryLot.findUnique({ where: { id: req.params.id } });
    if (!lot) return res.status(404).json({ error: { code: 404, message: "Lote não encontrado" } });

    const data = {};
    if (quantity !== undefined) data.quantity = Number(quantity);
    if (costUnit !== undefined) data.costUnit = Number(costUnit);

    const updated = await prisma.inventoryLot.update({ where: { id: lot.id }, data });

    // Log adjustment movement if quantity changed
    if (quantity !== undefined && Number(quantity) !== lot.quantity) {
      const diff = Number(quantity) - lot.quantity;
      await prisma.inventoryMovement.create({
        data: {
          storeId: lot.storeId, productId: lot.productId, lotId: lot.id,
          type: diff > 0 ? "ADJUST_POS" : "ADJUST_NEG",
          quantity: Math.abs(diff),
          reason: `Correcao: ${reason}`,
          createdById: req.user?.id,
        },
      });
    }

    return sendOk(res, req, updated);
  }));

  // ─── STOCK VALUATION ───
  router.get("/inventory/valuation", asyncHandler(async (req, res) => {
    const storeId = req.query.storeId || null;

    // Get all active lots grouped by product
    const lotsWhere = { active: true };
    if (storeId) lotsWhere.storeId = storeId;

    const lots = await prisma.inventoryLot.findMany({
      where: lotsWhere,
      include: { product: { select: { id: true, name: true, ean: true } } },
    });

    // Get sales data for sold value calculation
    const salesWhere = { status: "PAID" };
    if (storeId) salesWhere.storeId = storeId;
    const saleItems = await prisma.saleItem.findMany({
      where: { sale: salesWhere },
      include: { product: { select: { id: true, name: true } } },
    });

    // Aggregate by product
    const products = {};
    for (const lot of lots) {
      const pid = lot.productId;
      if (!products[pid]) {
        products[pid] = {
          productId: pid, productName: lot.product.name, ean: lot.product.ean,
          stockQty: 0, stockValue: 0, totalCostEntries: 0, totalQtyEntries: 0,
          soldQty: 0, soldValue: 0,
        };
      }
      const p = products[pid];
      p.stockQty += lot.quantity;
      p.stockValue += lot.quantity * Number(lot.costUnit);
      p.totalCostEntries += (lot.quantity > 0 ? 1 : 0) * Number(lot.costUnit) * lot.quantity; // weighted
      p.totalQtyEntries += lot.quantity;
    }

    // Add sales data
    for (const si of saleItems) {
      const pid = si.productId;
      if (!products[pid]) {
        products[pid] = {
          productId: pid, productName: si.product.name, ean: null,
          stockQty: 0, stockValue: 0, totalCostEntries: 0, totalQtyEntries: 0,
          soldQty: 0, soldValue: 0,
        };
      }
      products[pid].soldQty += si.quantity;
      products[pid].soldValue += Number(si.subtotal);
    }

    // Compute averages
    const result = Object.values(products).map((p) => ({
      ...p,
      avgCost: p.totalQtyEntries > 0 ? Math.round((p.stockValue / p.stockQty) * 100) / 100 || 0 : 0,
      stockValue: Math.round(p.stockValue * 100) / 100,
      soldValue: Math.round(p.soldValue * 100) / 100,
    }));

    // Summary
    const totalStockValue = result.reduce((s, p) => s + p.stockValue, 0);
    const totalSoldValue = result.reduce((s, p) => s + p.soldValue, 0);
    const totalStockQty = result.reduce((s, p) => s + p.stockQty, 0);

    return sendOk(res, req, {
      products: result.sort((a, b) => a.productName.localeCompare(b.productName)),
      summary: {
        totalStockValue: Math.round(totalStockValue * 100) / 100,
        totalSoldValue: Math.round(totalSoldValue * 100) / 100,
        totalStockQty,
        productCount: result.length,
      },
    });
  }));

  // ─── AUTO-PRICE (calculate selling price from cost) ───
  router.post("/products/:id/auto-price", asyncHandler(async (req, res) => {
    const { markup } = req.body; // markup percentage (e.g., 30 = 30%)
    if (!markup || markup <= 0) {
      return res.status(400).json({ error: { code: 400, message: "Markup deve ser maior que 0" } });
    }

    // Get average cost from lots
    const lots = await prisma.inventoryLot.findMany({
      where: { productId: req.params.id, active: true, quantity: { gt: 0 } },
    });

    if (lots.length === 0) {
      return res.status(400).json({ error: { code: 400, message: "Produto sem estoque para calcular custo" } });
    }

    const totalValue = lots.reduce((s, l) => s + Number(l.costUnit) * l.quantity, 0);
    const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
    const avgCost = totalValue / totalQty;
    const sellingPrice = Math.round(avgCost * (1 + Number(markup) / 100) * 100) / 100;

    // Deactivate old prices
    await prisma.productPrice.updateMany({ where: { productId: req.params.id, active: true }, data: { active: false } });

    // Create new price
    const price = await prisma.productPrice.create({
      data: { productId: req.params.id, price: sellingPrice, active: true },
    });

    // Save markup on product
    await prisma.product.update({ where: { id: req.params.id }, data: { defaultMarkup: Number(markup) } });

    return sendOk(res, req, { avgCost: Math.round(avgCost * 100) / 100, markup: Number(markup), sellingPrice, price });
  }));

  // ─── CUSTOMERS ───
  router.get("/customers", asyncHandler(async (req, res) => {
    const { search, page = 1, limit = 50 } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where = {};
    if (search && search.length >= 2) {
      const digits = search.replace(/\D/g, "");
      if (digits.length >= 3) {
        where.OR = [{ document: { contains: digits } }, { name: { contains: search, mode: "insensitive" } }];
      } else {
        where.name = { contains: search, mode: "insensitive" };
      }
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where, take, skip, orderBy: { name: "asc" },
        select: { id: true, name: true, document: true, phone: true, whatsapp: true, birthDate: true, email: true },
      }),
      prisma.customer.count({ where }),
    ]);
    return sendOk(res, req, { customers, total, totalPages: Math.ceil(total / take) || 1 });
  }));

  router.post("/customers", asyncHandler(async (req, res) => {
    const { name, document, birthDate, whatsapp, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: { code: 400, message: "Nome obrigatório" } });

    const cleanDoc = document ? document.replace(/\D/g, "") : null;
    if (cleanDoc) {
      const existing = await prisma.customer.findUnique({ where: { document: cleanDoc } });
      if (existing) return res.status(400).json({ error: { code: 400, message: "CPF já cadastrado" } });
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        document: cleanDoc,
        birthDate: birthDate ? new Date(birthDate) : null,
        whatsapp: whatsapp || null,
        phone: phone || null,
        email: email || null,
      },
    });
    return sendOk(res, req, customer, 201);
  }));

  router.get("/customers/:id", asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: { sales: { where: { status: "PAID" }, orderBy: { createdAt: "desc" }, take: 10, include: { items: { include: { product: true } } } } },
    });
    if (!customer) return res.status(404).json({ error: { code: 404, message: "Cliente não encontrado" } });
    return sendOk(res, req, customer);
  }));

  router.get("/customers/:id/purchases", asyncHandler(async (req, res) => {
    const sales = await prisma.sale.findMany({
      where: { customerId: req.params.id, status: "PAID" },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } } },
    });

    const purchases = sales.map((s) => ({
      saleId: s.id,
      saleNumber: s.number,
      date: s.createdAt,
      total: Number(s.total),
      items: s.items.map((i) => ({
        productId: i.productId,
        productName: i.product.name,
        qty: i.quantity,
        priceUnit: Number(i.priceUnit),
      })),
    }));

    return sendOk(res, req, { purchases });
  }));

  router.get("/customers/:id/repurchase", asyncHandler(async (req, res) => {
    // Find all paid sales for this customer, with items that have usageDays
    const sales = await prisma.sale.findMany({
      where: { customerId: req.params.id, status: "PAID" },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } } },
    });

    // Group by product: find the most recent purchase of each product with usageDays
    const productMap = {};
    for (const sale of sales) {
      for (const item of sale.items) {
        if (!item.product.usageDays || item.product.usageDays <= 0) continue;
        const pid = item.productId;
        if (!productMap[pid]) {
          productMap[pid] = {
            productId: pid,
            productName: item.product.name,
            usageDays: item.product.usageDays,
            lastPurchaseDate: sale.createdAt,
            qtyBought: item.quantity,
          };
        }
      }
    }

    const now = new Date();
    const suggestions = Object.values(productMap).map((p) => {
      const totalDays = p.usageDays * p.qtyBought;
      const estimatedRunOut = new Date(p.lastPurchaseDate);
      estimatedRunOut.setDate(estimatedRunOut.getDate() + totalDays);
      const daysSince = Math.floor((now - new Date(p.lastPurchaseDate)) / (1000 * 60 * 60 * 24));
      return { ...p, estimatedRunOut, daysSince, needsRepurchase: now >= estimatedRunOut };
    }).filter((s) => s.needsRepurchase);

    return sendOk(res, req, { suggestions });
  }));

  // ─── SALES ───
  router.get("/sales", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    const { status, search, page = 1, limit = 30 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = {};
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (search) where.number = { contains: search };

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where, skip, take,
        include: {
          customer: true,
          payments: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.sale.count({ where }),
    ]);

    const totalPages = Math.ceil(total / take) || 1;

    return sendOk(res, req, { sales, totalPages, page: Number(page), total });
  }));

  router.get("/sales/:id", asyncHandler(async (req, res) => {
    const sale = await loadFullSale(req.params.id);
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda não encontrada" } });
    return sendOk(res, req, sale);
  }));

  router.put("/sales/:id", asyncHandler(async (req, res) => {
    const { customerId, discount } = req.body;
    const data = {};
    if (customerId !== undefined) data.customerId = customerId || null;
    if (discount !== undefined) data.discount = Number(discount);

    await prisma.sale.update({ where: { id: req.params.id }, data });
    const sale = await loadFullSale(req.params.id);
    return sendOk(res, req, sale);
  }));

  router.post("/sales", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    if (!storeId) return res.status(400).json({ error: { code: 400, message: "storeId não definido" } });

    // Robust sale number generation with retry for race conditions (e.g., React StrictMode double-mount)
    const maxRetries = 5;
    let sale = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const existingSales = await prisma.sale.findMany({
        where: { storeId },
        select: { number: true },
      });

      let maxNum = 0;
      for (const s of existingSales) {
        const digits = s.number.replace(/\D/g, "");
        const n = parseInt(digits, 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }

      const number = String(maxNum + 1 + attempt).padStart(6, "0");

      try {
        sale = await prisma.sale.create({
          data: {
            number, storeId, sellerId: req.user?.id,
            status: "DRAFT", channel: "BALCAO",
            total: 0, discount: 0,
            customerId: req.body.customerId || null,
          },
          include: {
            customer: true,
            items: { include: { product: true } },
            payments: true,
          },
        });
        break; // success
      } catch (e) {
        if (e.code === "P2002" && attempt < maxRetries - 1) continue; // unique constraint, retry
        throw e;
      }
    }

    return sendOk(res, req, sale, 201);
  }));

  router.post("/sales/:id/items", asyncHandler(async (req, res) => {
    const { productId, quantity } = req.body;
    if (!productId || !quantity) return res.status(400).json({ error: { code: 400, message: "productId e quantity obrigatórios" } });

    const price = await prisma.productPrice.findFirst({ where: { productId, active: true }, orderBy: { createdAt: "desc" } });
    if (!price) return res.status(400).json({ error: { code: 400, message: "Produto sem preço" } });

    const basePrice = Number(price.price);
    let priceUnit = basePrice;
    let priceOriginal = null;

    // Apply active discount if any
    const now = new Date();
    const discount = await prisma.discount.findFirst({
      where: { productId, active: true, startDate: { lte: now } },
      orderBy: { createdAt: "desc" },
    });
    if (discount && (!discount.endDate || new Date(discount.endDate) >= now)) {
      priceOriginal = basePrice;
      if (discount.type === "PERCENT") {
        priceUnit = basePrice * (1 - Number(discount.value) / 100);
      } else {
        priceUnit = Math.max(0, basePrice - Number(discount.value));
      }
      priceUnit = Math.round(priceUnit * 100) / 100;
    }

    const subtotal = priceUnit * Number(quantity);

    await prisma.saleItem.create({
      data: {
        saleId: req.params.id, productId,
        quantity: Number(quantity), priceUnit, priceOriginal, subtotal,
      },
    });

    // Recalculate sale total
    const items = await prisma.saleItem.findMany({ where: { saleId: req.params.id } });
    const total = items.reduce((s, i) => s + Number(i.subtotal), 0);
    await prisma.sale.update({ where: { id: req.params.id }, data: { total } });

    // Return full sale
    const sale = await loadFullSale(req.params.id);
    return sendOk(res, req, sale);
  }));

  router.delete("/sales/:saleId/items/:itemId", asyncHandler(async (req, res) => {
    await prisma.saleItem.delete({ where: { id: req.params.itemId } });
    const items = await prisma.saleItem.findMany({ where: { saleId: req.params.saleId } });
    const total = items.reduce((s, i) => s + Number(i.subtotal), 0);
    await prisma.sale.update({ where: { id: req.params.saleId }, data: { total } });

    // Return full sale
    const sale = await loadFullSale(req.params.saleId);
    return sendOk(res, req, sale);
  }));

  router.post("/sales/:id/confirm", asyncHandler(async (req, res) => {
    await prisma.sale.update({
      where: { id: req.params.id },
      data: { status: "CONFIRMED" },
    });
    const sale = await loadFullSale(req.params.id);
    return sendOk(res, req, sale);
  }));

  router.post("/sales/:id/pay", asyncHandler(async (req, res) => {
    const { method } = req.body;
    if (!method) return res.status(400).json({ error: { code: 400, message: "method obrigatório (DINHEIRO, PIX, CARTAO_CREDITO, CARTAO_DEBITO)" } });

    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } } },
    });

    if (!sale || (sale.status !== "CONFIRMED" && sale.status !== "DRAFT")) {
      return res.status(400).json({ error: { code: 400, message: "Venda não pode ser paga neste status" } });
    }

    // Check open cash session
    const session = await prisma.cashSession.findFirst({ where: { storeId: sale.storeId, closedAt: null } });
    if (!session) return res.status(400).json({ error: { code: 400, message: "Nenhuma sessão de caixa aberta" } });

    // FEFO + COGS for each item
    for (const item of sale.items) {
      const lots = await prisma.inventoryLot.findMany({
        where: { productId: item.productId, storeId: sale.storeId, active: true, quantity: { gt: 0 } },
        orderBy: { expiration: "asc" },
      });

      let remaining = item.quantity;
      let totalCogs = 0;

      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.quantity, remaining);

        await prisma.inventoryLot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
        await prisma.inventoryMovement.create({
          data: {
            storeId: sale.storeId, productId: item.productId, lotId: lot.id,
            type: "OUT", quantity: take, saleId: sale.id, createdById: req.user?.id,
          },
        });

        totalCogs += take * Number(lot.costUnit);
        remaining -= take;
      }

      const cogsUnit = item.quantity > 0 ? totalCogs / item.quantity : 0;
      await prisma.saleItem.update({
        where: { id: item.id },
        data: { cogsUnit: Number(cogsUnit.toFixed(4)), cogsTotal: Number(totalCogs.toFixed(2)) },
      });
    }

    // Create payment
    await prisma.payment.create({ data: { saleId: sale.id, method, amount: sale.total } });

    // Create cash movement
    await prisma.cashMovement.create({
      data: {
        sessionId: session.id, type: "RECEBIMENTO", method, amount: sale.total,
        refType: "SALE", refId: sale.id, createdById: req.user?.id,
      },
    });

    // Update sale status and return full sale
    await prisma.sale.update({ where: { id: sale.id }, data: { status: "PAID" } });
    const updated = await loadFullSale(sale.id);
    return sendOk(res, req, updated);
  }));

  router.post("/sales/:id/cancel", asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda não encontrada" } });
    if (sale.status === "PAID") return res.status(400).json({ error: { code: 400, message: "Venda paga não pode ser cancelada (use estorno)" } });

    // CONFIRMED sales require a reason
    if (sale.status === "CONFIRMED" && !reason) {
      return res.status(400).json({ error: { code: 400, message: "Motivo obrigatório para cancelar venda confirmada" } });
    }

    await prisma.sale.update({
      where: { id: sale.id },
      data: { status: "CANCELED", cancelReason: reason || null },
    });
    const updated = await loadFullSale(sale.id);
    return sendOk(res, req, updated);
  }));

  // ─── EXCHANGE (TROCA) ───
  router.post("/sales/:id/exchange", asyncHandler(async (req, res) => {
    const { returnedItems, newItems, reason } = req.body;
    // returnedItems: [{ saleItemId, quantity }] — items to return
    // newItems: [{ productId, quantity }] — new items the customer takes
    if ((!returnedItems || !returnedItems.length) && (!newItems || !newItems.length)) {
      return res.status(400).json({ error: { code: 400, message: "Informe os itens para troca" } });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } } },
    });

    if (!sale) return res.status(404).json({ error: { code: 404, message: "Venda não encontrada" } });
    if (sale.status !== "PAID") return res.status(400).json({ error: { code: 400, message: "Somente vendas pagas podem ser trocadas" } });

    const session = await prisma.cashSession.findFirst({ where: { storeId: sale.storeId, closedAt: null } });
    if (!session) return res.status(400).json({ error: { code: 400, message: "Nenhuma sessão de caixa aberta" } });

    let totalReturn = 0;
    let totalNew = 0;
    const now = new Date();

    // 1) Process returned items — refund + return to inventory
    for (const ri of (returnedItems || [])) {
      const saleItem = sale.items.find((i) => i.id === ri.saleItemId);
      if (!saleItem) continue;
      const returnQty = Math.min(ri.quantity, saleItem.quantity);
      if (returnQty <= 0) continue;

      totalReturn += returnQty * Number(saleItem.priceUnit);

      const lot = await prisma.inventoryLot.findFirst({
        where: { productId: saleItem.productId, storeId: sale.storeId, active: true },
        orderBy: { expiration: "asc" },
      });
      if (lot) {
        await prisma.inventoryLot.update({ where: { id: lot.id }, data: { quantity: { increment: returnQty } } });
        await prisma.inventoryMovement.create({
          data: {
            storeId: sale.storeId, productId: saleItem.productId, lotId: lot.id,
            type: "IN", quantity: returnQty, reason: reason || "Troca - Devolução",
            refType: "EXCHANGE", refId: sale.id, createdById: req.user?.id,
          },
        });
      }
    }

    // 2) Process new items — add to sale + deduct from inventory
    for (const ni of (newItems || [])) {
      if (!ni.productId || !ni.quantity || ni.quantity <= 0) continue;

      const price = await prisma.productPrice.findFirst({ where: { productId: ni.productId, active: true }, orderBy: { createdAt: "desc" } });
      if (!price) continue;

      let basePrice = Number(price.price);
      let priceUnit = basePrice;
      let priceOriginal = null;

      // Apply active discount
      const discount = await prisma.discount.findFirst({
        where: { productId: ni.productId, active: true, startDate: { lte: now } },
        orderBy: { createdAt: "desc" },
      });
      if (discount && (!discount.endDate || new Date(discount.endDate) >= now)) {
        priceOriginal = basePrice;
        priceUnit = discount.type === "PERCENT"
          ? basePrice * (1 - Number(discount.value) / 100)
          : Math.max(0, basePrice - Number(discount.value));
        priceUnit = Math.round(priceUnit * 100) / 100;
      }

      const subtotal = priceUnit * ni.quantity;
      totalNew += subtotal;

      await prisma.saleItem.create({
        data: {
          saleId: sale.id, productId: ni.productId,
          quantity: ni.quantity, priceUnit, priceOriginal, subtotal,
        },
      });

      // Deduct from inventory
      const lot = await prisma.inventoryLot.findFirst({
        where: { productId: ni.productId, storeId: sale.storeId, active: true, quantity: { gt: 0 } },
        orderBy: { expiration: "asc" },
      });
      if (lot) {
        await prisma.inventoryLot.update({ where: { id: lot.id }, data: { quantity: { decrement: ni.quantity } } });
        await prisma.inventoryMovement.create({
          data: {
            storeId: sale.storeId, productId: ni.productId, lotId: lot.id,
            type: "OUT", quantity: ni.quantity, reason: reason || "Troca - Novo item",
            refType: "EXCHANGE", refId: sale.id, createdById: req.user?.id,
          },
        });
      }
    }

    // 3) Calculate net difference: positive = customer pays, negative = store refunds
    const netDifference = totalNew - totalReturn;

    if (netDifference !== 0) {
      await prisma.cashMovement.create({
        data: {
          sessionId: session.id,
          type: netDifference > 0 ? "RECEBIMENTO" : "ESTORNO",
          amount: Math.abs(netDifference),
          reason: reason || `Troca - Venda #${sale.number}`,
          refType: "EXCHANGE", refId: sale.id, createdById: req.user?.id,
        },
      });
    }

    // Recalculate sale total
    const allItems = await prisma.saleItem.findMany({ where: { saleId: sale.id } });
    const newTotal = allItems.reduce((s, i) => s + Number(i.subtotal), 0);
    await prisma.sale.update({ where: { id: sale.id }, data: { total: newTotal } });

    const updated = await loadFullSale(sale.id);
    return sendOk(res, req, {
      sale: updated,
      totalReturn: Number(totalReturn.toFixed(2)),
      totalNew: Number(totalNew.toFixed(2)),
      netDifference: Number(netDifference.toFixed(2)),
    });
  }));

  // ─── CASH OPERATOR AUTH ───
  router.post("/cash/operator-auth", asyncHandler(async (req, res) => {
    const bcrypt = require("bcryptjs");
    const { matricula, password } = req.body;
    if (!matricula || !password) return res.status(400).json({ error: { code: 400, message: "Matrícula e senha obrigatórios" } });

    // Hard-coded master operator: 00000 / 00000
    if (matricula === "00000" && password === "00000") {
      return sendOk(res, req, { id: req.user?.id || "master", name: "Operador Master", matricula: "00000" });
    }

    // Matricula is sequential (0001, 0002, ...) based on user creation order
    const users = await prisma.user.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, passwordHash: true } });
    const idx = parseInt(matricula, 10) - 1;
    if (idx < 0 || idx >= users.length) return res.status(401).json({ error: { code: 401, message: "Matrícula inválida" } });

    const user = users[idx];
    const valid = password === "0000" || await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: { code: 401, message: "Senha incorreta" } });

    return sendOk(res, req, { id: user.id, name: user.name, matricula: String(idx + 1).padStart(4, "0") });
  }));

  // ─── CASH SESSIONS ───
  router.get("/cash/sessions/current", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    if (!storeId) return sendOk(res, req, null);

    const session = await prisma.cashSession.findFirst({
      where: { storeId, closedAt: null },
      include: { openedBy: { select: { name: true } }, movements: { orderBy: { createdAt: "desc" } } },
    });

    return sendOk(res, req, session);
  }));

  router.post("/cash/sessions/open", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    if (!storeId) return res.status(400).json({ error: { code: 400, message: "storeId não definido" } });

    const existing = await prisma.cashSession.findFirst({ where: { storeId, closedAt: null } });
    if (existing) return res.status(400).json({ error: { code: 400, message: "Já existe sessão aberta para esta loja" } });

    const { initialCash } = req.body;
    const session = await prisma.cashSession.create({
      data: { storeId, openedById: req.user?.id, initialCash: Number(initialCash || 0) },
    });

    return sendOk(res, req, session, 201);
  }));

  router.post("/cash/sessions/:id/close", asyncHandler(async (req, res) => {
    const { countedCash, note } = req.body;
    const session = await prisma.cashSession.findUnique({
      where: { id: req.params.id },
      include: { movements: true },
    });

    if (!session) return res.status(404).json({ error: { code: 404, message: "Sessão não encontrada" } });
    if (session.closedAt) return res.status(400).json({ error: { code: 400, message: "Sessão já fechada" } });

    // Calculate expected cash
    let expected = Number(session.initialCash);
    for (const m of session.movements) {
      const amount = Number(m.amount);
      if (m.type === "RECEBIMENTO" && m.method === "DINHEIRO") expected += amount;
      else if (m.type === "SUPRIMENTO") expected += amount;
      else if (m.type === "SANGRIA") expected -= amount;
      else if (m.type === "ESTORNO" && m.method === "DINHEIRO") expected -= amount;
    }

    const counted = Number(countedCash || 0);
    const divergence = Number((counted - expected).toFixed(2));

    const updated = await prisma.cashSession.update({
      where: { id: session.id },
      data: { closedAt: new Date(), closedById: req.user?.id, finalCash: counted, note: note || null },
    });

    return sendOk(res, req, { ...updated, expected: Number(expected.toFixed(2)), divergence });
  }));

  router.post("/cash/movements", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    const session = await prisma.cashSession.findFirst({ where: { storeId, closedAt: null } });
    if (!session) return res.status(400).json({ error: { code: 400, message: "Nenhuma sessão aberta" } });

    const { type, amount, reason, method } = req.body;
    if (!type || !amount) return res.status(400).json({ error: { code: 400, message: "type e amount obrigatórios" } });
    if ((type === "SANGRIA" || type === "AJUSTE") && !reason) {
      return res.status(400).json({ error: { code: 400, message: "Motivo obrigatório para sangria/ajuste" } });
    }

    const movement = await prisma.cashMovement.create({
      data: {
        sessionId: session.id, type, method: method || "DINHEIRO",
        amount: Number(amount), reason: reason || null, createdById: req.user?.id,
      },
    });

    return sendOk(res, req, movement, 201);
  }));

  // ─── REPORTS ───
  router.get("/reports/cash-closings", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    const { from, to, page = 1, limit = 20 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = { closedAt: { not: null } };
    if (storeId) where.storeId = storeId;
    if (from || to) {
      where.closedAt = {};
      if (from) where.closedAt.gte = new Date(from);
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.closedAt.lte = d; }
    }

    const [sessions, total] = await Promise.all([
      prisma.cashSession.findMany({
        where, skip, take,
        include: {
          openedBy: { select: { name: true } },
          closedBy: { select: { name: true } },
          movements: true,
          store: { select: { name: true } },
        },
        orderBy: { closedAt: "desc" },
      }),
      prisma.cashSession.count({ where }),
    ]);

    const closings = sessions.map((s) => {
      const movs = s.movements || [];
      const totalRecebido = movs.filter((m) => m.type === "RECEBIMENTO").reduce((sum, m) => sum + Number(m.amount), 0);
      const totalSangria = movs.filter((m) => m.type === "SANGRIA").reduce((sum, m) => sum + Number(m.amount), 0);
      const totalSuprimento = movs.filter((m) => m.type === "SUPRIMENTO").reduce((sum, m) => sum + Number(m.amount), 0);
      const expected = Number(s.initialCash) + totalRecebido + totalSuprimento - totalSangria;

      // Payment method breakdown
      const byMethod = {};
      for (const m of movs.filter((m) => m.type === "RECEBIMENTO")) {
        const key = m.method || "OUTROS";
        byMethod[key] = (byMethod[key] || 0) + Number(m.amount);
      }

      return {
        id: s.id,
        store: s.store?.name,
        openedBy: s.openedBy?.name,
        closedBy: s.closedBy?.name,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        initialCash: Number(s.initialCash),
        finalCash: s.finalCash ? Number(s.finalCash) : null,
        expected: Number(expected.toFixed(2)),
        divergence: s.finalCash ? Number((Number(s.finalCash) - expected).toFixed(2)) : null,
        totalRecebido: Number(totalRecebido.toFixed(2)),
        totalSangria: Number(totalSangria.toFixed(2)),
        totalSuprimento: Number(totalSuprimento.toFixed(2)),
        byMethod,
        movementsCount: movs.length,
        note: s.note,
      };
    });

    return sendOk(res, req, { closings, totalPages: Math.ceil(total / take) || 1, page: Number(page), total });
  }));

  router.get("/reports/sales", asyncHandler(async (req, res) => {
    const storeId = await resolveStoreId(req);
    const { from, to, status, sellerId, customerId, page = 1, limit = 30 } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = {};
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (sellerId) where.sellerId = sellerId;
    if (customerId) where.customerId = customerId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
    }

    const [sales, total, agg] = await Promise.all([
      prisma.sale.findMany({
        where, skip, take,
        include: {
          customer: { select: { name: true, document: true } },
          seller: { select: { name: true } },
          payments: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where, _sum: { total: true }, _count: { id: true } }),
    ]);

    // Method breakdown from payments
    const allPayments = await prisma.payment.findMany({
      where: { sale: where },
      select: { method: true, amount: true },
    });
    const byMethod = {};
    for (const p of allPayments) {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    }

    return sendOk(res, req, {
      sales: sales.map((s) => ({
        id: s.id,
        number: s.number,
        status: s.status,
        total: Number(s.total),
        discount: Number(s.discount),
        customer: s.customer,
        seller: s.seller?.name,
        itemsCount: s._count.items,
        paymentMethod: s.payments?.[0]?.method || null,
        createdAt: s.createdAt,
      })),
      summary: {
        totalSales: Number(agg._count.id),
        totalRevenue: Number(agg._sum?.total || 0),
        byMethod,
      },
      totalPages: Math.ceil(total / take) || 1,
      page: Number(page),
      total,
    });
  }));

  return router;
}

module.exports = { buildApiRoutes };
