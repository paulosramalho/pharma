import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { money, formatDateTime, formatDate } from "../lib/format";
import Card, { CardBody } from "../components/ui/Card";
import { PageSpinner } from "../components/ui/Spinner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart as RePieChart, Pie, Cell, CartesianGrid, Legend,
} from "recharts";
import {
  DollarSign, ShoppingCart, Receipt, Package,
  TrendingUp, Wallet, Plus, ArrowRight, ArrowDownUp, PieChart as PieChartIcon,
} from "lucide-react";

const STATUS_LABEL = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  RECEIVED: "Recebido",
  CANCELED: "Cancelado",
};

const PIE_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#6b7280"];

function toInputDate(v) {
  const d = new Date(v);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function Dashboard() {
  const { user, hasPermission, storeId } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storeOptions, setStoreOptions] = useState([]);
  const [filters, setFilters] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    return {
      startDate: toInputDate(start),
      endDate: toInputDate(end),
      storeId: storeId || "",
    };
  });

  const loadDashboard = async (currentFilters = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("startDate", currentFilters.startDate);
      params.set("endDate", currentFilters.endDate);
      if (currentFilters.storeId) params.set("storeIds", currentFilters.storeId);
      const res = await apiFetch(`/api/dashboard?${params}`);
      const payload = res.data || {};
      setData(payload);
    } catch (err) {
      addToast(err.message, "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    apiFetch("/api/stores")
      .then((res) => {
        const stores = res.data || [];
        setStoreOptions(stores);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDashboard(filters);
  }, [filters.startDate, filters.endDate, filters.storeId]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, storeId: storeId || "" }));
  }, [storeId]);

  if (loading && !data) return <PageSpinner />;

  const kpis = [
    { label: "Vendas Hoje", value: data?.salesToday ?? 0, icon: ShoppingCart, color: "text-blue-600 bg-blue-50" },
    { label: "Receita Bruta", value: money(data?.grossRevenue ?? 0), icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
    { label: "Ticket Medio", value: money(data?.avgTicket ?? 0), icon: TrendingUp, color: "text-indigo-600 bg-indigo-50" },
    { label: "Itens Vendidos", value: data?.itemsSold ?? 0, icon: Package, color: "text-amber-600 bg-amber-50" },
  ];

  const stockCards = [
    {
      label: "Evolucao - Quantidade",
      value: `${data?.stockEvolution?.quantityDelta ?? 0}`,
      icon: Package,
      color: "text-sky-700 bg-sky-50",
    },
    {
      label: "Evolucao - Transferencia",
      value: `${data?.stockEvolution?.transferDelta ?? 0}`,
      icon: ArrowDownUp,
      color: "text-violet-700 bg-violet-50",
    },
    {
      label: "Evolucao - Valor",
      value: money(data?.stockEvolution?.currentValue ?? 0),
      icon: DollarSign,
      color: "text-emerald-700 bg-emerald-50",
    },
  ];

  const salesByDay = data?.charts?.salesByDay || [];
  const salesMax = salesByDay.reduce((m, d) => Math.max(m, Number(d.revenue || 0)), 0);
  const stockByStore = data?.charts?.stockByStore || [];
  const transferStatus = data?.charts?.transferStatus || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Bem-vindo, {user?.name}</p>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Periodo inicio</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Periodo fim</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Lojas</label>
            <select
              value={filters.storeId}
              onChange={(e) => setFilters((prev) => ({ ...prev, storeId: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            >
              <option value="">Todas as lojas</option>
              {(storeOptions.length > 0 ? storeOptions : (data?.filters?.stores || [])).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stockCards.map((card) => (
          <Card key={card.label}>
            <CardBody className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
                <p className="text-lg font-bold text-gray-900">{card.value}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  Aberto por {data.cashSession.openedBy} em {formatDateTime(data.cashSession.openedAt)}
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

        <Card>
          <CardBody>
            <h3 className="font-semibold text-gray-900 mb-3">Acoes Rapidas</h3>
            <div className="grid grid-cols-2 gap-2">
              {hasPermission("sales.create") && (
                <button onClick={() => navigate("/vendas/nova")} className="flex items-center gap-2 px-3 py-2 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors">
                  <Plus size={16} /> Nova Venda
                </button>
              )}
              {hasPermission("cash.open") && (
                <button onClick={() => navigate("/caixa")} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                  <Wallet size={16} /> Caixa
                </button>
              )}
              {hasPermission("inventory.receive") && (
                <button onClick={() => navigate("/estoque")} className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors">
                  <Package size={16} /> Estoque
                </button>
              )}
              {hasPermission("reports.view") && (
                <button onClick={() => navigate("/vendas")} className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors">
                  <Receipt size={16} /> Vendas
                </button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardBody>
            <h3 className="font-semibold text-gray-900 mb-3">Receita por Dia (barra)</h3>
            {salesByDay.length === 0 ? (
              <p className="text-sm text-gray-400">Sem dados no periodo</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByDay}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} />
                    <YAxis />
                    <Tooltip formatter={(v) => money(Number(v || 0))} labelFormatter={(v) => formatDate(v)} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="flex items-center gap-2 mb-3">
              <PieChartIcon size={16} className="text-gray-500" />
              <h3 className="font-semibold text-gray-900">Transferencias por Status (pizza)</h3>
            </div>
            <div className="space-y-3">
              {transferStatus.length === 0 ? (
                <p className="text-gray-400">Sem dados no periodo</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={transferStatus}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        label={(entry) => STATUS_LABEL[entry.status] || entry.status}
                      >
                        {transferStatus.map((item, idx) => (
                          <Cell key={item.status} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => Number(v || 0)} labelFormatter={(v) => STATUS_LABEL[v] || v} />
                      <Legend formatter={(v) => STATUS_LABEL[v] || v} />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="space-y-1 text-sm">
                {transferStatus.map((item, idx) => (
                  <div key={item.status} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                    <span className="text-gray-700">{STATUS_LABEL[item.status] || item.status}</span>
                    <span className="text-gray-500">({item.count})</span>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <h3 className="font-semibold text-gray-900 mb-3">Estoque por Loja (barra)</h3>
          {stockByStore.length === 0 ? (
            <p className="text-sm text-gray-400">Sem estoque para as lojas selecionadas</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockByStore}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v, n, row) => (n === "value" ? money(Number(v || 0)) : Number(row?.payload?.quantity || 0))} />
                  <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="font-semibold text-gray-900 mb-3">Rentabilidade por Produto</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-2 py-2 text-xs text-gray-500 uppercase">Produto</th>
                  <th className="px-2 py-2 text-xs text-gray-500 uppercase text-right">Qtd</th>
                  <th className="px-2 py-2 text-xs text-gray-500 uppercase text-right">Receita</th>
                  <th className="px-2 py-2 text-xs text-gray-500 uppercase text-right">Custo</th>
                  <th className="px-2 py-2 text-xs text-gray-500 uppercase text-right">Lucro</th>
                  <th className="px-2 py-2 text-xs text-gray-500 uppercase text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.profitabilityByProduct || []).map((p) => (
                  <tr key={p.productId}>
                    <td className="px-2 py-2 font-medium text-gray-900">{p.name}</td>
                    <td className="px-2 py-2 text-right">{p.qty}</td>
                    <td className="px-2 py-2 text-right">{money(p.revenue)}</td>
                    <td className="px-2 py-2 text-right">{money(p.cogs)}</td>
                    <td className={`px-2 py-2 text-right font-medium ${p.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(p.profit)}</td>
                    <td className={`px-2 py-2 text-right ${p.margin >= 0 ? "text-emerald-700" : "text-red-600"}`}>{p.margin}%</td>
                  </tr>
                ))}
                {(data?.profitabilityByProduct || []).length === 0 && (
                  <tr>
                    <td className="px-2 py-3 text-sm text-gray-400" colSpan={6}>Sem dados de rentabilidade no periodo</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
