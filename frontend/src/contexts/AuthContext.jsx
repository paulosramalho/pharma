import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiFetch, setAuth, clearAuth, getUser, getToken, getStoreId, setStoreId } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getUser);
  const [storeId, setCurrentStore] = useState(getStoreId);
  const [stores, setStores] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const isAuthenticated = !!user;

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
    const defaultStore = d.stores?.find((s) => s.isDefault) || d.stores?.[0];
    if (defaultStore) setCurrentStore(defaultStore.id);
    return d;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    setPermissions([]);
    setStores([]);
    setLicense(null);
    setCurrentStore(null);
  }, []);

  const switchStore = useCallback((id) => {
    setStoreId(id);
    setCurrentStore(id);
  }, []);

  const hasPermission = useCallback((key) => {
    if (!user) return false;
    if (user.role === "ADMIN") return true;
    return permissions.includes(key);
  }, [user, permissions]);

  const hasFeature = useCallback((key) => {
    if (!license?.features) return true;
    return Boolean(license.features[key]);
  }, [license]);

  // Restore session on mount
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    Promise.all([apiFetch("/me"), apiFetch("/api/license/me").catch(() => ({ data: null }))])
      .then(([meRes, licRes]) => {
        const d = meRes.data;
        setUser(d.user);
        setPermissions(d.permissions || []);
        setStores(d.stores || []);
        setLicense(licRes?.data || null);
      })
      .catch(() => { clearAuth(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, stores, storeId, switchStore, permissions, hasPermission, license, hasFeature }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
