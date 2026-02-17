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

export async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const storeId = getStoreId();
  if (storeId) headers["X-Store-Id"] = storeId;

  let res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401 && token) {
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
