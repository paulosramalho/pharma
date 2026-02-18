import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { money, formatDateTime } from "../lib/format";
import Card, { CardBody } from "../components/ui/Card";
import { PageSpinner } from "../components/ui/Spinner";
import {
  DollarSign, ShoppingCart, Receipt, Package,
  TrendingUp, Wallet, Plus, ArrowRight,
} from "lucide-react";

export default function Dashboard() {
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/dashboard")
      .then((res) => setData(res.data))
      .catch((err) => addToast(err.message, "error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  const kpis = [
    { label: "Vendas Hoje", value: data?.salesToday ?? 0, icon: ShoppingCart, color: "text-blue-600 bg-blue-50" },
    { label: "Receita Bruta", value: money(data?.grossRevenue ?? 0), icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
    { label: "Ticket Médio", value: money(data?.avgTicket ?? 0), icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
    { label: "Itens Vendidos", value: data?.itemsSold ?? 0, icon: Package, color: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Bem-vindo, {user?.name}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardBody className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.color}`}>
                <kpi.icon size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Cash status + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cash status */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Caixa</h3>
              <Wallet size={18} className="text-gray-400" />
            </div>
            {data?.cashSession ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-gray-700">Aberto</span>
                </div>
                <p className="text-xs text-gray-500">
                  Aberto por {data.cashSession.openedBy} em{" "}
                  {formatDateTime(data.cashSession.openedAt)}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-sm text-gray-700">Fechado</span>
                </div>
                {hasPermission("cash.open") && (
                  <button
                    onClick={() => navigate("/caixa")}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                  >
                    Abrir caixa <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardBody>
            <h3 className="font-semibold text-gray-900 mb-3">Ações Rápidas</h3>
            <div className="grid grid-cols-2 gap-2">
              {hasPermission("sales.create") && (
                <button
                  onClick={() => navigate("/vendas/nova")}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
                >
                  <Plus size={16} /> Nova Venda
                </button>
              )}
              {hasPermission("cash.open") && (
                <button
                  onClick={() => navigate("/caixa")}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Wallet size={16} /> Caixa
                </button>
              )}
              {hasPermission("inventory.receive") && (
                <button
                  onClick={() => navigate("/estoque")}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <Package size={16} /> Estoque
                </button>
              )}
              {hasPermission("reports.view") && (
                <button
                  onClick={() => navigate("/vendas")}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  <Receipt size={16} /> Vendas
                </button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
