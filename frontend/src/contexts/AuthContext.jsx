import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { apiFetch, setAuth, clearAuth, getUser, getToken, getStoreId, setStoreId } from "../lib/api";
import { loginSync, refreshCounts } from "../lib/sync";

const AuthContext = createContext(null);
const INACTIVITY_TIMEOUT_MIN = Math.max(1, Number(import.meta.env.VITE_INACTIVITY_TIMEOUT_MINUTES || 1));
const INACTIVITY_TIMEOUT_MS = INACTIVITY_TIMEOUT_MIN * 60 * 1000;
const ACTIVITY_KEY = "pharma_last_activity_at";
const FORCE_LOGOUT_KEY = "pharma_force_logout";
const LOGOUT_NOTICE_KEY = "pharma_logout_notice";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getUser);
  const [storeId, setCurrentStore] = useState(getStoreId);
  const [stores, setStores] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const [inactivityWarningSeconds, setInactivityWarningSeconds] = useState(null);
  const warningActiveRef = useRef(false);

  const isAuthenticated = !!user;
  const touchActivity = useCallback(() => {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const d = res.data;
    let licenseData = null;
    try {
      const lic = await apiFetch("/api/license/me");
      licenseData = lic.data || null;
    } catch {
      licenseData = null;
    }
    setAuth({ accessToken: d.accessToken, refreshToken: d.refreshToken, user: d.user, stores: d.stores });
    setUser(d.user);
    setPermissions(d.permissions || []);
    setStores(d.stores || []);
    setLicense(licenseData);
    touchActivity();
    const defaultStore = d.stores?.find((s) => s.isDefault) || d.stores?.[0];
    if (defaultStore) {
      setCurrentStore(defaultStore.id);
      // Check local vs remote on login:
      // replay any pending local ops → remote, then clear stale cache so next GETs are fresh
      loginSync(defaultStore.id).catch(console.warn);
    }
    return d;
  }, []);

  const logout = useCallback((options = {}) => {
    const reason = String(options.reason || "").trim();
    const broadcast = !!options.broadcast;
    if (reason) localStorage.setItem(LOGOUT_NOTICE_KEY, reason);
    if (broadcast) {
      localStorage.setItem(FORCE_LOGOUT_KEY, JSON.stringify({ at: Date.now(), reason: reason || "forced" }));
    }
    localStorage.removeItem(ACTIVITY_KEY);
    clearAuth();
    setUser(null);
    setPermissions([]);
    setStores([]);
    setLicense(null);
    setInactivityWarningSeconds(null);
    warningActiveRef.current = false;
    setCurrentStore(null);
  }, []);

  const continueSession = useCallback(() => {
    warningActiveRef.current = false;
    setInactivityWarningSeconds(null);
    touchActivity();
  }, [touchActivity]);

  const forceLogoutNow = useCallback(() => {
    logout({ reason: "forced", broadcast: true });
  }, [logout]);

  const switchStore = useCallback((id) => {
    setStoreId(id);
    setCurrentStore(id);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!getToken()) return null;
    const [meRes, licRes] = await Promise.all([apiFetch("/me"), apiFetch("/api/license/me").catch(() => ({ data: null }))]);
    const d = meRes.data;
    setUser(d.user);
    setPermissions(d.permissions || []);
    setStores(d.stores || []);
    setLicense(licRes?.data || null);
    touchActivity();

    // On session restore: refresh pending/failed counts and replay if online
    const sid = getStoreId();
    if (sid) {
      if (navigator.onLine) {
        loginSync(sid).catch(console.warn);
      } else {
        refreshCounts(sid).catch(console.warn);
      }
    }

    return d;
  }, [touchActivity]);

  const hasPermission = useCallback((key) => {
    if (!user) return false;
    if (user.role === "ADMIN") return true;
    return permissions.includes(key);
  }, [user, permissions]);

  const hasFeature = useCallback((key) => {
    if (!license?.features) return true;
    return Boolean(license.features[key]);
  }, [license]);

  const isLicenseActive = ["TRIAL", "ACTIVE", "GRACE"].includes(String(license?.status || "ACTIVE").toUpperCase());

  // Restore session on mount
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    refreshSession()
      .catch(() => { clearAuth(); setUser(null); })
      .finally(() => setLoading(false));
  }, [refreshSession]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const mark = () => {
      if (warningActiveRef.current) return;
      touchActivity();
    };
    const events = ["click", "keydown", "mousemove", "scroll", "touchstart", "focus"];
    events.forEach((evt) => window.addEventListener(evt, mark, { passive: true }));
    document.addEventListener("visibilitychange", mark);
    if (!Number(localStorage.getItem(ACTIVITY_KEY) || 0)) touchActivity();

    const checkId = setInterval(() => {
      const lastAt = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
      if (!lastAt) {
        touchActivity();
        return;
      }

      const leftMs = INACTIVITY_TIMEOUT_MS - (Date.now() - lastAt);
      if (leftMs <= 0) {
        setInactivityWarningSeconds(null);
        warningActiveRef.current = false;
        logout({ reason: "inactivity", broadcast: true });
        return;
      }

      if (leftMs <= 60000) {
        const leftSeconds = Math.ceil(leftMs / 1000);
        warningActiveRef.current = true;
        setInactivityWarningSeconds((prev) => (prev === leftSeconds ? prev : leftSeconds));
      } else {
        warningActiveRef.current = false;
        setInactivityWarningSeconds((prev) => (prev === null ? prev : null));
      }
    }, 1000);

    const onStorage = (event) => {
      if (event.key !== FORCE_LOGOUT_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        logout({ reason: payload?.reason || "forced", broadcast: false });
      } catch {
        logout({ reason: "forced", broadcast: false });
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      clearInterval(checkId);
      events.forEach((evt) => window.removeEventListener(evt, mark));
      document.removeEventListener("visibilitychange", mark);
      window.removeEventListener("storage", onStorage);
    };
  }, [isAuthenticated, logout, touchActivity]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, refreshSession, stores, storeId, switchStore, permissions, hasPermission, license, hasFeature, isLicenseActive, inactivityWarningSeconds, continueSession, forceLogoutNow }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
