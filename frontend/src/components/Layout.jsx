import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard, ShoppingCart, Wallet, Package, Pill,
  Settings, LogOut, Menu, X, ChevronDown, Store, UserCircle, BarChart3,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: null },
  { to: "/vendas", label: "Vendas", icon: ShoppingCart, perm: "sales.create" },
  { to: "/caixa", label: "Caixa", icon: Wallet, perm: "cash.open" },
  { to: "/estoque", label: "Estoque", icon: Package, perm: "inventory.receive" },
  { to: "/produtos", label: "Produtos", icon: Pill, perm: "products.manage" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, perm: "reports.view" },
  { to: "/config", label: "Configurações", icon: Settings, perm: "users.manage" },
  { to: "/perfil", label: "Meu Perfil", icon: UserCircle, perm: null, restrictedOnly: true },
];

// Restricted roles see only specific items
const ROLE_NAV_RESTRICT = {
  CAIXA: ["/caixa", "/perfil"],
  VENDEDOR: ["/vendas", "/perfil"],
};

export default function Layout() {
  const { user, logout, stores, storeId, switchStore, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);

  const roleRestrict = ROLE_NAV_RESTRICT[user?.role];
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (roleRestrict) return roleRestrict.includes(item.to);
    if (item.restrictedOnly) return false; // only shown for restricted roles
    return !item.perm || hasPermission(item.perm);
  });
  const currentStore = stores.find((s) => s.id === storeId);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

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
          <div className="flex items-center gap-2">
            <video
              src="/brand/LogoPharma.MP4"
              poster="/brand/LogoPharma.PNG"
              autoPlay
              muted
              loop
              playsInline
              className="w-8 h-8 object-contain bg-transparent mix-blend-multiply"
            />
            <span className="text-lg font-bold text-gray-900">Pharma</span>
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
              {item.label}
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
            <video
              src="/brand/LogoPharma.MP4"
              poster="/brand/LogoPharma.PNG"
              autoPlay
              muted
              loop
              playsInline
              className="w-6 h-6 object-contain bg-transparent mix-blend-multiply"
            />
            <span className="font-bold text-gray-900">Pharma</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet key={storeId || "no-store"} />
        </main>
      </div>
    </div>
  );
}
