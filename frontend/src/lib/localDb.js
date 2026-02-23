import Dexie from "dexie";

// ─── TTLs ────────────────────────────────────────────────────────────────────
const TTL = {
  products:  60 * 60 * 1000,   // 1 hour
  customers: 30 * 60 * 1000,   // 30 minutes
  inventory:  5 * 60 * 1000,   // 5 minutes
};

// ─── Database ─────────────────────────────────────────────────────────────────
export const db = new Dexie("pharma_offline_v1");

// v1 → original schema
db.version(1).stores({
  apiCache:    "++id, cacheKey, storeId, expiresAt",
  mutationLog: "++id, requestId, storeId, resource, resourceId, method, status, createdAt, [status+storeId]",
  localSales:  "++id, localId, storeId, status",
});

// v2 → adds serverId index to localSales for write-through lookups
db.version(2).stores({
  apiCache:    "++id, cacheKey, storeId, expiresAt",
  mutationLog: "++id, requestId, storeId, resource, resourceId, method, status, createdAt, [status+storeId]",
  localSales:  "++id, localId, serverId, storeId, status",
});

// ─── Cache key ────────────────────────────────────────────────────────────────
export function buildCacheKey(path, storeId) {
  try {
    const url = new URL(path, "http://x");
    const params = [...url.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const resource = url.pathname.replace(/^\/api\//, "").replace(/\//g, "_");
    return `${resource}::${storeId}::${params}`;
  } catch {
    return `${path}::${storeId}`;
  }
}

function getTTL(path) {
  if (path.includes("/inventory")) return TTL.inventory;
  if (path.includes("/customers")) return TTL.customers;
  return TTL.products;
}

// ─── API Cache helpers ────────────────────────────────────────────────────────
export async function writeCacheEntry(path, storeId, data) {
  const cacheKey = buildCacheKey(path, storeId);
  const now = Date.now();
  await db.apiCache.where("cacheKey").equals(cacheKey).delete();
  await db.apiCache.add({
    cacheKey,
    storeId,
    url: path,
    data,
    cachedAt: now,
    expiresAt: now + getTTL(path),
  });
}

export async function readCacheEntry(path, storeId) {
  const cacheKey = buildCacheKey(path, storeId);
  const entry = await db.apiCache.where("cacheKey").equals(cacheKey).first();
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    await db.apiCache.delete(entry.id);
    return null;
  }
  return entry.data;
}

// Delete all cache for a store (forces fresh server fetch on next GET)
export async function invalidateCacheByStoreId(storeId) {
  await db.apiCache.where("storeId").equals(storeId).delete();
}

// Delete cache entries whose URL starts with one of the given prefixes
export async function invalidateCacheForPaths(pathPrefixes, storeId) {
  const all = await db.apiCache.where("storeId").equals(storeId).toArray();
  const ids = all
    .filter((e) => e.url && pathPrefixes.some((p) => e.url.startsWith(p)))
    .map((e) => e.id);
  if (ids.length) await db.apiCache.bulkDelete(ids);
}

// ─── Mutation log helpers ──────────────────────────────────────────────────────
export async function enqueueMutation({ requestId, storeId, resource, resourceId, method, path, body }) {
  await db.mutationLog.add({
    requestId,
    storeId,
    resource,
    resourceId,
    method,
    path,
    body,
    status: "pending",
    attempts: 0,
    errorMessage: null,
    createdAt: Date.now(),
  });
}

export async function getPendingMutations(storeId) {
  return db.mutationLog
    .where("[status+storeId]")
    .equals(["pending", storeId])
    .sortBy("createdAt");
}

export async function getFailedMutations(storeId) {
  return db.mutationLog
    .where("[status+storeId]")
    .equals(["failed", storeId])
    .sortBy("createdAt");
}

export async function updateMutationStatus(id, status, errorMessage = null) {
  await db.mutationLog.update(id, {
    status,
    errorMessage,
    attempts: (await db.mutationLog.get(id))?.attempts + 1 ?? 1,
  });
}

export async function clearFailedMutations(storeId) {
  await db.mutationLog
    .where("[status+storeId]")
    .equals(["failed", storeId])
    .delete();
}

// ─── Local sales — write-through helpers ──────────────────────────────────────
// Called after every successful server response that returns a sale object.
// Keeps local replica in sync with the server-confirmed state.
export async function upsertLocalSaleFromServer(saleData, storeId) {
  if (!saleData?.id) return;

  // Find existing record by server ID or local-{uuid} placeholder
  const existing =
    await db.localSales.where("serverId").equals(saleData.id).first() ||
    await db.localSales.where("localId").equals(saleData.id).first();

  const record = {
    storeId,
    serverId: saleData.id,
    localId: existing?.localId || saleData.id,
    status: saleData.status,
    items: saleData.items || [],
    total: Number(saleData.total || 0),
    discount: Number(saleData.discount || 0),
    customerId: saleData.customer?.id || null,
    customer: saleData.customer || null,
    updatedAt: Date.now(),
  };

  if (existing) {
    await db.localSales.update(existing.id, record);
  } else {
    await db.localSales.add({ ...record, createdAt: Date.now() });
  }
}

// ─── Offline draft helpers ─────────────────────────────────────────────────────
export async function offlineCreateDraft(storeId) {
  const localId = "local-" + crypto.randomUUID();
  const draft = {
    localId,
    serverId: null,
    storeId,
    status: "DRAFT",
    items: [],
    total: 0,
    discount: 0,
    customerId: null,
    customer: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.localSales.add(draft);
  return {
    id: localId,
    number: "OFFLINE",
    status: "DRAFT",
    items: [],
    total: 0,
    discount: 0,
    customer: null,
    _isLocal: true,
  };
}

export async function getLocalSale(localId) {
  return db.localSales.where("localId").equals(localId).first();
}

export async function setLocalSaleServerId(localId, serverId) {
  const rec = await db.localSales.where("localId").equals(localId).first();
  if (rec) await db.localSales.update(rec.id, { serverId, updatedAt: Date.now() });
}

// ─── Last sync timestamp ───────────────────────────────────────────────────────
// Tracks when data was last confirmed in sync with the server, per store.
// Used by the sync engine to fetch only server changes that happened after this point.
export function getLastSyncAt(storeId) {
  return localStorage.getItem(`pharma_sync_ts_${storeId}`) || null;
}

export function setLastSyncAt(storeId, isoTime) {
  localStorage.setItem(`pharma_sync_ts_${storeId}`, isoTime);
}
