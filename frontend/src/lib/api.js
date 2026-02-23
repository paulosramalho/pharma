import {
  writeCacheEntry,
  readCacheEntry,
  enqueueMutation,
  upsertLocalSaleFromServer,
  invalidateCacheForPaths,
} from "./localDb";

const BASE = import.meta.env.VITE_API_URL || "";

export function getToken() {
  return localStorage.getItem("pharma_access_token");
}
export function getRefreshToken() {
  return localStorage.getItem("pharma_refresh_token");
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem("pharma_user")); } catch { return null; }
}
export function getStoreId() {
  return localStorage.getItem("pharma_store_id");
}

export function setAuth({ accessToken, refreshToken, user, stores }) {
  localStorage.setItem("pharma_access_token", accessToken);
  localStorage.setItem("pharma_refresh_token", refreshToken);
  localStorage.setItem("pharma_user", JSON.stringify(user));
  if (stores?.length) {
    const defaultStore = stores.find((s) => s.isDefault) || stores[0];
    localStorage.setItem("pharma_store_id", defaultStore.id);
  }
}
export function setStoreId(id) {
  localStorage.setItem("pharma_store_id", id);
}
export function clearAuth() {
  localStorage.removeItem("pharma_access_token");
  localStorage.removeItem("pharma_refresh_token");
  localStorage.removeItem("pharma_user");
  localStorage.removeItem("pharma_store_id");
}

// ─── Offline-queued error ─────────────────────────────────────────────────────
export class OfflineQueuedError extends Error {
  constructor(message = "Sem conexão. Operação salva para sincronizar.") {
    super(message);
    this.name = "OfflineQueuedError";
    this.queued = true;
  }
}

// ─── Route classification ─────────────────────────────────────────────────────
const CACHEABLE_PREFIXES = [
  "/api/inventory/lookup",
  "/api/inventory/overview",
  "/api/products",
  "/api/customers",
];

// Routes whose mutations are queued when offline AND written through to local when online
const QUEUEABLE_PREFIXES = [
  "/api/sales",
  "/api/cash/sessions",
  "/api/cash/movements",
];

// Paths that touch inventory stock — invalidated after every sale mutation
const INVENTORY_CACHE_PREFIXES = ["/api/inventory"];

function isCacheable(path) {
  return CACHEABLE_PREFIXES.some((p) => path.startsWith(p));
}

function isQueueable(path) {
  return QUEUEABLE_PREFIXES.some((p) => path.startsWith(p));
}

// Derive resource name and resourceId from path for the mutation log
function parseMutationMeta(path) {
  const parts = path.split("?")[0].split("/").filter(Boolean);
  if (parts[1] === "sales") {
    const id = parts[2];
    if (parts[3] === "items") return { resource: "saleItem", resourceId: parts[4] || id || null };
    if (parts[3] === "confirm") return { resource: "saleConfirm", resourceId: id };
    if (parts[3] === "cancel")  return { resource: "saleCancel",  resourceId: id };
    return { resource: "sale", resourceId: id || null };
  }
  if (parts[1] === "cash") {
    if (parts[2] === "sessions") return { resource: "cashSession",  resourceId: parts[3] || null };
    if (parts[2] === "movements") return { resource: "cashMovement", resourceId: parts[3] || null };
  }
  return { resource: parts[1] || "unknown", resourceId: parts[2] || null };
}

// Write-through: after a successful online mutation, apply to local DB.
// Local is updated AFTER server confirms (server is the source of truth).
// Order: server → local (sequential, not parallel).
async function applyMutationToLocal(resource, serverResponse, storeId) {
  const data = serverResponse?.data;
  if (!data) return;

  const isSaleMutation =
    resource === "sale" ||
    resource === "saleItem" ||
    resource === "saleConfirm" ||
    resource === "saleCancel";

  if (isSaleMutation) {
    // 1. Write server-confirmed sale state to local replica
    await upsertLocalSaleFromServer(data, storeId);
    // 2. Invalidate inventory cache — stock levels changed
    await invalidateCacheForPaths(INVENTORY_CACHE_PREFIXES, storeId);
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────
let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const rt = getRefreshToken();
    if (!rt) throw new Error("No refresh token");
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) throw new Error("Refresh failed");
    const data = await res.json();
    localStorage.setItem("pharma_access_token", data.data.accessToken);
    return data.data.accessToken;
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// ─── Core fetch (no offline logic) ───────────────────────────────────────────
async function coreFetch(path, opts, headers) {
  let res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401 && getToken()) {
    try {
      const newToken = await refreshAccessToken();
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${BASE}${path}`, { ...opts, headers });
    } catch {
      clearAuth();
      window.location.href = "/login";
      throw new Error("Session expired");
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return res.json();
}

// ─── apiFetch ─────────────────────────────────────────────────────────────────
export async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const storeId = getStoreId();
  if (storeId && !headers["X-Store-Id"]) headers["X-Store-Id"] = storeId;

  const method = (opts.method || "GET").toUpperCase();
  const isGet = method === "GET";

  // ── Cacheable GETs ─────────────────────────────────────────────────────────
  if (isGet && isCacheable(path)) {
    // Offline: serve from local cache immediately
    if (!navigator.onLine) {
      const cached = await readCacheEntry(path, storeId);
      if (cached) return cached;
      throw new OfflineQueuedError("Sem conexão e sem dados em cache para esta consulta.");
    }

    // Online: network first → write to local → return
    // On network failure: fall back to local cache
    try {
      const data = await coreFetch(path, opts, headers);
      writeCacheEntry(path, storeId, data).catch(() => {}); // non-blocking
      return data;
    } catch (err) {
      if (err.queued) throw err;
      if (err instanceof TypeError) {
        const cached = await readCacheEntry(path, storeId);
        if (cached) return cached;
      }
      throw err;
    }
  }

  // ── Queueable mutations ────────────────────────────────────────────────────
  if (!isGet && isQueueable(path)) {
    const requestId = opts.requestId || crypto.randomUUID();
    const { resource, resourceId } = parseMutationMeta(path);

    // Enqueue to local mutation log (used for offline replay)
    const enqueue = async () => {
      const body = opts.body ? JSON.parse(opts.body) : undefined;
      await enqueueMutation({ requestId, storeId, resource, resourceId, method, path, body });
      window.dispatchEvent(new CustomEvent("pharma:mutation-queued", { detail: { storeId } }));
      throw new OfflineQueuedError();
    };

    if (!navigator.onLine) return enqueue();

    // Online path:
    // 1. Send to server (server is authoritative source of truth)
    // 2. On success: apply server response to local DB (write-through)
    // 3. On network failure: fall back to queue
    headers["X-Idempotency-Key"] = requestId;
    try {
      const result = await coreFetch(path, { ...opts, headers }, headers);
      // Sequential write-through: local updated AFTER server confirms
      applyMutationToLocal(resource, result, storeId).catch(() => {});
      return result;
    } catch (err) {
      if (err instanceof TypeError) return enqueue(); // network failure → queue
      throw err;
    }
  }

  // ── Default path (auth, reports, etc.) ────────────────────────────────────
  return coreFetch(path, opts, headers);
}
