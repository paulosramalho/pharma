import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiFetch, setAuth, clearAuth, getUser, getToken, getStoreId, setStoreId } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getUser);
  const [storeId, setCurrentStore] = useState(getStoreId);
  const [stores, setStores] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(!!getToken());

  const isAuthenticated = !!user;

  const login = useCallback(async (email, password) => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const d = res.data;
    setAuth({ accessToken: d.accessToken, refreshToken: d.refreshToken, user: d.user, stores: d.stores });
    setUser(d.user);
    setPermissions(d.permissions || []);
    setStores(d.stores || []);
    const defaultStore = d.stores?.find((s) => s.isDefault) || d.stores?.[0];
    if (defaultStore) setCurrentStore(defaultStore.id);
    return d;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    setPermissions([]);
    setStores([]);
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

  // Restore session on mount
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    apiFetch("/me")
      .then((res) => {
        const d = res.data;
        setUser(d.user);
        setPermissions(d.permissions || []);
        setStores(d.stores || []);
      })
      .catch(() => { clearAuth(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, stores, storeId, switchStore, permissions, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
