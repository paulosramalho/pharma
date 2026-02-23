import {
  getPendingMutations,
  getFailedMutations,
  updateMutationStatus,
  clearFailedMutations,
  setLocalSaleServerId,
  invalidateCacheByStoreId,
  invalidateCacheForPaths,
  upsertLocalSaleFromServer,
  getLastSyncAt,
  setLastSyncAt,
} from "./localDb";
import { getToken, getStoreId } from "./api";

const BASE = import.meta.env.VITE_API_URL || "";

// ─── Pub/sub for UI listeners ─────────────────────────────────────────────────
const listeners = new Set();

export function onSyncStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(getSyncState());
}

// ─── Internal state ───────────────────────────────────────────────────────────
let _status = "idle";
let _pendingCount = 0;
let _failedCount = 0;

export function getSyncState() {
  return { status: _status, pendingCount: _pendingCount, failedCount: _failedCount };
}

export async function refreshCounts(storeId) {
  const sid = storeId || getStoreId();
  if (!sid) return;
  const [pending, failed] = await Promise.all([
    getPendingMutations(sid),
    getFailedMutations(sid),
  ]);
  _pendingCount = pending.length;
  _failedCount = failed.length;
  emit();
}

// ─── Fetch server changes since lastSyncAt ────────────────────────────────────
// Returns the changes that happened on the SERVER while we were offline.
// These are the ops the local DB doesn't know about yet.
async function fetchServerChanges(storeId) {
  const since = getLastSyncAt(storeId);
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  headers["X-Store-Id"] = storeId;

  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  try {
    const res = await fetch(`${BASE}/api/sync/changes${qs}`, { headers });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null; // network failure — skip server pull, proceed with local push only
  }
}

// ─── Apply a single server change to the local DB ────────────────────────────
// This is the SERVER → LOCAL direction.
// For inventory: invalidate the cache so the next GET pulls fresh stock levels.
// For sales: update the local sale replica with the server-confirmed state.
async function applyServerChangeToLocal(change, storeId) {
  switch (change._type) {
    case "inventoryMovement":
      // A server-side sale or adjustment changed stock for productId.
      // Invalidate inventory cache — next lookup fetches fresh data.
      await invalidateCacheForPaths(["/api/inventory"], storeId).catch(() => {});
      break;

    case "sale":
      // A sale's status changed on the server (e.g., confirmed by another terminal).
      await upsertLocalSaleFromServer(change, storeId).catch(() => {});
      break;

    case "cashMovement":
      // Cash movement recorded on server — no local state to update directly.
      // The Caixa page will re-fetch on next visit.
      break;

    default:
      break;
  }
}

// ─── Merge phase ──────────────────────────────────────────────────────────────
// Collapses redundant LOCAL ops before sending to server.
function mergeLocalQueue(mutations) {
  const merged = new Map();

  for (const m of mutations) {
    const isNonMergeable =
      m.resource === "cashMovement" ||
      m.resource === "cashSession" ||
      m.resource === "saleConfirm";

    if (isNonMergeable) {
      merged.set(`${m.resource}::${m.requestId}`, m);
      continue;
    }

    if (m.method === "DELETE") {
      const postKey = `${m.resource}::${m.resourceId}::POST`;
      if (merged.has(postKey)) {
        merged.delete(postKey);
        continue;
      }
      merged.set(`${m.resource}::${m.resourceId}::DELETE`, m);
      continue;
    }

    if (m.method === "PUT") {
      merged.set(`${m.resource}::${m.resourceId}::PUT`, m);
      continue;
    }

    if (m.resourceId && m.resourceId.startsWith("local-")) {
      const key = `${m.resource}::${m.resourceId}::POST`;
      if (!merged.has(key)) merged.set(key, m);
    } else {
      merged.set(`${m.resource}::${m.requestId}`, m);
    }
  }

  return [...merged.values()].sort((a, b) => a.createdAt - b.createdAt);
}

// ─── Execute a single local mutation against the server ───────────────────────
async function executeMutation(m, localIdMap) {
  let path = m.path;
  let body = m.body ? { ...m.body } : undefined;

  for (const [localId, serverId] of localIdMap.entries()) {
    path = path.replaceAll(localId, serverId);
    if (body) {
      body = JSON.parse(JSON.stringify(body).replaceAll(localId, serverId));
    }
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Idempotency-Key": m.requestId,
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const storeId = m.storeId || getStoreId();
  if (storeId) headers["X-Store-Id"] = storeId;

  const res = await fetch(`${BASE}${path}`, {
    method: m.method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message = errBody?.error?.message || `HTTP ${res.status}`;
    const isClientError = res.status >= 400 && res.status < 500;
    throw Object.assign(new Error(message), { isClientError, status: res.status });
  }

  return res.json().catch(() => ({}));
}

// ─── syncAll — main bidirectional sync ───────────────────────────────────────
//
// Implements the full chronological, bidirectional sync:
//
//   SERVER → LOCAL  (ops that happened on server while offline)
//   LOCAL  → SERVER (ops that were queued locally while offline)
//
// Both streams are sorted by timestamp and interleaved before processing,
// so all ops are applied in the global chronological order:
//
//   OP1 (server 10:00) → applied to LOCAL
//   OP2 (local  10:01) → applied to SERVER (then local updated from response)
//   OP3 (local  10:02) → applied to SERVER (then local updated from response)
//   OP4 (server 10:40) → applied to LOCAL
//
export async function syncAll({ storeId, onProgress, onError, onDone } = {}) {
  const sid = storeId || getStoreId();
  if (!sid) return;

  const rawLocal = await getPendingMutations(sid);
  const serverChanges = await fetchServerChanges(sid);

  const hasAnything = rawLocal.length > 0 || (serverChanges && (
    serverChanges.inventoryMovements?.length > 0 ||
    serverChanges.salesUpdated?.length > 0 ||
    serverChanges.cashMovements?.length > 0
  ));

  if (!hasAnything) {
    await refreshCounts(sid);
    if (serverChanges?.serverTime) setLastSyncAt(sid, serverChanges.serverTime);
    return;
  }

  _status = "syncing";
  emit();

  // Build unified timeline: server changes + local pending, all with _at (ms timestamp)
  const serverOps = [];
  if (serverChanges) {
    for (const m of serverChanges.inventoryMovements || []) {
      serverOps.push({ _type: "inventoryMovement", _at: new Date(m.createdAt).getTime(), ...m });
    }
    for (const s of serverChanges.salesUpdated || []) {
      serverOps.push({ _type: "sale", _at: new Date(s.updatedAt).getTime(), ...s });
    }
    for (const c of serverChanges.cashMovements || []) {
      serverOps.push({ _type: "cashMovement", _at: new Date(c.createdAt).getTime(), ...c });
    }
  }

  const mergedLocal = mergeLocalQueue(rawLocal);
  const localOps = mergedLocal.map((m) => ({ _type: "localMutation", _at: m.createdAt, ...m }));

  // Interleave: sort ALL ops by timestamp (chronological global order)
  const allOps = [...serverOps, ...localOps].sort((a, b) => a._at - b._at);
  const total = allOps.length;
  let done = 0;
  let failed = 0;
  const localIdMap = new Map(); // localId → serverId (for draft sales)

  for (const op of allOps) {
    if (op._type !== "localMutation") {
      // SERVER → LOCAL: apply server change to local DB
      await applyServerChangeToLocal(op, sid);
      done++;
      onProgress?.({ done, total });
    } else {
      // LOCAL → SERVER: send local op to server, then update local from response
      const m = op; // shape matches mutationLog record
      try {
        const result = await executeMutation(m, localIdMap);

        // Capture server-assigned ID for offline-drafted sales
        if (m.resource === "sale" && m.method === "POST" && m.resourceId?.startsWith("local-")) {
          const serverId = result?.data?.id;
          if (serverId) {
            localIdMap.set(m.resourceId, serverId);
            await setLocalSaleServerId(m.resourceId, serverId);
          }
        }

        // Update local from server response (write-through: server → local)
        const data = result?.data;
        if (data && (m.resource === "sale" || m.resource === "saleItem" || m.resource === "saleConfirm")) {
          await upsertLocalSaleFromServer(data, sid).catch(() => {});
          await invalidateCacheForPaths(["/api/inventory"], sid).catch(() => {});
        }

        await updateMutationStatus(m.id, "done");
        done++;
        onProgress?.({ done, total });
      } catch (err) {
        if (err.isClientError) {
          await updateMutationStatus(m.id, "failed", err.message);
          failed++;
          onError?.({ mutation: m, error: err });
        } else {
          // Network/server error: abort, retry next time
          _status = "error";
          emit();
          await refreshCounts(sid);
          return;
        }
      }
    }
  }

  // Record when we last successfully synced (used as `since` on next sync)
  if (serverChanges?.serverTime) {
    setLastSyncAt(sid, serverChanges.serverTime);
  } else {
    setLastSyncAt(sid, new Date().toISOString());
  }

  _status = failed > 0 ? "error" : "idle";
  await refreshCounts(sid);
  onDone?.({ done, failed });
}

// ─── loginSync ────────────────────────────────────────────────────────────────
// Called after login and on session restore.
// Full bidirectional sync + cache reset so the session starts clean.
export async function loginSync(storeId) {
  const sid = storeId || getStoreId();
  if (!sid || !navigator.onLine) {
    await refreshCounts(sid);
    return;
  }

  // Full sync: interleave server changes + local pending, apply in chronological order
  await syncAll({ storeId: sid });

  // Clear remaining stale cache so first GETs after login are fresh from server
  await invalidateCacheByStoreId(sid).catch(() => {});
}

// ─── replayQueue (kept for backward compat / manual "sync now" button) ────────
// Delegates to syncAll for the full bidirectional flow.
export async function replayQueue(opts = {}) {
  return syncAll(opts);
}

// ─── Public helpers ───────────────────────────────────────────────────────────
export async function getPendingCount(storeId) {
  const sid = storeId || getStoreId();
  if (!sid) return 0;
  return (await getPendingMutations(sid)).length;
}

export async function clearFailed(storeId) {
  const sid = storeId || getStoreId();
  if (!sid) return;
  await clearFailedMutations(sid);
  await refreshCounts(sid);
}
