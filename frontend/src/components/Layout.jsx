import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { apiFetch } from "../lib/api";
import { useOfflineSync } from "../hooks/useOfflineSync";
import {
  LayoutDashboard, ShoppingCart, Wallet, Package, Pill,
  Settings, LogOut, Menu, X, ChevronDown, Store, UserCircle, BarChart3, MessageCircle,
  WifiOff, RefreshCw, AlertTriangle,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: null, feature: "dashboard" },
  { to: "/vendas", label: "Vendas", icon: ShoppingCart, perm: "sales.create", feature: "sales" },
  { to: "/caixa", label: "Caixa", icon: Wallet, perm: "cash.open", feature: "cash" },
  { to: "/estoque", label: "Estoque", icon: Package, perm: "inventory.receive", feature: "inventory" },
  { to: "/produtos", label: "Produtos", icon: Pill, perm: "products.manage", feature: "products" },
  { to: "/chat", label: "Chat", icon: MessageCircle, perm: null, feature: "chat" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, perm: "reports.view", feature: "reportsSales" },
  { to: "/config", label: "Configurações", icon: Settings, perm: "users.manage", feature: "config" },
  { to: "/perfil", label: "Meu Perfil", icon: UserCircle, perm: null, restrictedOnly: true },
];

// Restricted roles see only specific items
const ROLE_NAV_RESTRICT = {
  CAIXA: ["/caixa", "/chat", "/perfil"],
  VENDEDOR: ["/vendas", "/chat", "/perfil"],
};

export default function Layout() {
  const { user, logout, stores, storeId, switchStore, hasPermission, hasFeature, isLicenseActive, license } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [billingNotice, setBillingNotice] = useState({ hasAdminNotice: false, notices: [] });
  const shownBillingNoticeIdsRef = useRef(new Set());
  const { isOnline, pendingCount, failedCount, syncStatus, syncNow, clearFailed } = useOfflineSync();

  const roleRestrict = ROLE_NAV_RESTRICT[user?.role];
  const adminLicenseLocked = user?.role === "ADMIN" && !isLicenseActive;
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (adminLicenseLocked) return item.to === "/config";
    if (item.feature && !hasFeature(item.feature)) return false;
    if (roleRestrict) return roleRestrict.includes(item.to);
    if (item.to === "/caixa" && user?.role === "FARMACEUTICO") return true;
    if (item.restrictedOnly) return false; // only shown for restricted roles
    return !item.perm || hasPermission(item.perm);
  });
  const currentStore = stores.find((s) => s.id === storeId);
  const contractor = license?.contractor || {};
  const brandName = contractor?.tradeName || contractor?.tenantName || "Pharma";
  const brandLogo = contractor?.logoFile || "/brand/LogoPharma.PNG";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    if (!user?.id || !hasFeature("chat")) return undefined;
    let cancelled = false;

    const loadChatUnread = async () => {
      try {
        const res = await apiFetch("/api/chat/conversations?limit=60");
        const total = (res?.data?.conversations || []).reduce(
          (sum, c) => sum + Number(c?.unreadCount || 0),
          0,
        );
        if (!cancelled) setChatUnreadCount(total);
      } catch {
        if (!cancelled) setChatUnreadCount(0);
      }
    };

    loadChatUnread();
    const id = setInterval(loadChatUnread, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id, hasFeature]);

  useEffect(() => {
    const role = String(user?.role || "").toUpperCase();
    if (!user?.id || !["ADMIN", "FARMACEUTICO"].includes(role)) return undefined;
    let cancelled = false;

    const loadBillingNotices = async () => {
      try {
        const res = await apiFetch("/api/license/me/billing-notices");
        const data = res?.data || { hasAdminNotice: false, notices: [] };
        if (cancelled) return;
        setBillingNotice(data);
        if (role !== "ADMIN") return;
        const notices = Array.isArray(data.notices) ? data.notices : [];
        notices.slice(0, 2).forEach((n) => {
          if (!n?.paymentId || shownBillingNoticeIdsRef.current.has(n.paymentId)) return;
          const fallback = Number(n?.daysToDue || 0) < 0
            ? `Licença em atraso desde ${new Date(n.dueDate).toLocaleDateString("pt-BR")}.`
            : `Licença vence em ${new Date(n.dueDate).toLocaleDateString("pt-BR")}.`;
          addToast(n?.message || fallback, Number(n?.daysToDue || 0) < 0 ? "warning" : "info", 6500);
          shownBillingNoticeIdsRef.current.add(n.paymentId);
        });
      } catch {
        if (!cancelled) setBillingNotice({ hasAdminNotice: false, notices: [] });
      }
    };

    loadBillingNotices();
    const id = setInterval(loadBillingNotices, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id, user?.role, addToast]);

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-primary-50 text-primary-700"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Logo */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={brandLogo}
              alt="Logo"
              className="w-11 h-11 object-contain bg-transparent shrink-0"
            />
            <div className="min-w-0 max-w-[150px]">
              <span className="block text-base font-bold text-gray-900 truncate leading-5">{brandName}</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Store selector */}
        {stores.length > 1 && (
          <div className="px-3 py-3 border-b border-gray-100">
            <div className="relative">
              <button
                onClick={() => setStoreMenuOpen(!storeMenuOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Store size={14} className="text-gray-400" />
                <span className="flex-1 text-left truncate">{currentStore?.name || "Loja"}</span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              {storeMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { switchStore(s.id); setStoreMenuOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${s.id === storeId ? "text-primary-600 font-medium" : "text-gray-700"}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setSidebarOpen(false)}>
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.to === "/chat" && chatUnreadCount > 0 && (
                <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 animate-pulse">
                  Nova
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User / Logout */}
        <div className="px-3 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-bold">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <img
              src={brandLogo}
              alt="Logo"
              className="w-8 h-8 object-contain bg-transparent shrink-0"
            />
            <div className="min-w-0 max-w-[180px]">
              <span className="font-bold text-gray-900 block truncate leading-5">{brandName}</span>
            </div>
          </div>
        </header>

        {/* Offline / sync status banner */}
        {(!isOnline || pendingCount > 0 || failedCount > 0) && (
          <div className={`px-4 py-2 text-sm flex items-center gap-3 border-b ${
            failedCount > 0
              ? "bg-red-50 border-red-200 text-red-800"
              : syncStatus === "syncing"
              ? "bg-blue-50 border-blue-200 text-blue-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            {syncStatus === "syncing" ? (
              <RefreshCw size={15} className="animate-spin shrink-0" />
            ) : failedCount > 0 ? (
              <AlertTriangle size={15} className="shrink-0" />
            ) : (
              <WifiOff size={15} className="shrink-0" />
            )}

            <span className="flex-1">
              {syncStatus === "syncing"
                ? "Sincronizando operações pendentes..."
                : failedCount > 0
                ? `${failedCount} operação(ões) rejeitada(s) pelo servidor`
                : !isOnline && pendingCount > 0
                ? `Sem conexão — ${pendingCount} operação(ões) aguardando sincronização`
                : !isOnline
                ? "Sem conexão — modo offline"
                : `${pendingCount} operação(ões) pendente(s) de sincronização`}
            </span>

            {failedCount > 0 && (
              <button
                onClick={clearFailed}
                className="text-xs underline hover:no-underline shrink-0"
              >
                Limpar falhas
              </button>
            )}

            {isOnline && pendingCount > 0 && syncStatus !== "syncing" && (
              <button
                onClick={syncNow}
                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-white border border-current hover:bg-amber-100 shrink-0"
              >
                <RefreshCw size={12} />
                Sincronizar agora
              </button>
            )}
          </div>
        )}

        {String(user?.role || "").toUpperCase() === "FARMACEUTICO" && billingNotice?.hasAdminNotice ? (
          <div className="px-4 py-2 text-sm flex items-center gap-3 border-b bg-amber-50 border-amber-200 text-amber-800">
            <AlertTriangle size={15} className="shrink-0" />
            <span className="flex-1">
              Existe aviso financeiro para o administrador. Solicite acesso em Configurações &gt; Licenciamento.
            </span>
          </div>
        ) : null}

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet key={storeId || "no-store"} />
        </main>
      </div>
    </div>
  );
}
