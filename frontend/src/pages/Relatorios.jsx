import { useState, useEffect } from "react";
import { apiFetch, getStoreId, getToken } from "../lib/api";
import { money, formatDate, formatDateTime, cpfMask } from "../lib/format";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import {
  BarChart3, DollarSign, ShoppingCart, Wallet, CreditCard,
  Calendar, Filter, TrendingUp, ArrowDownCircle, ArrowUpCircle,
  Printer,
} from "lucide-react";

const BASE_TABS = [
  { key: "vendas", label: "Vendas", icon: ShoppingCart },
  { key: "caixa", label: "Fechamentos de Caixa", icon: Wallet },
  { key: "transferencias", label: "Transferencias", icon: ArrowUpCircle },
];

const STATUS_LABELS = { DRAFT: "Rascunho", CONFIRMED: "Confirmada", PAID: "Paga", CANCELED: "Cancelada", REFUNDED: "Estornada" };
const STATUS_COLORS = { DRAFT: "gray", CONFIRMED: "amber", PAID: "green", CANCELED: "red", REFUNDED: "purple" };
const METHOD_LABELS = { DINHEIRO: "Dinheiro", PIX: "PIX", CARTAO_CREDITO: "Cartão de Crédito", CARTAO_DEBITO: "Cartão de Débito" };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function Relatorios() {
  const { addToast } = useToast();
  const { hasFeature } = useAuth();
  const [tab, setTab] = useState("vendas");
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [loading, setLoading] = useState(false);

  // Sales report
  const [salesData, setSalesData] = useState(null);
  const [salesPage, setSalesPage] = useState(1);

  // Cash closings report
  const [cashData, setCashData] = useState(null);
  const [cashPage, setCashPage] = useState(1);
  const [transferData, setTransferData] = useState(null);
  const [transferPage, setTransferPage] = useState(1);
  const [selectedTransferId, setSelectedTransferId] = useState("");
  const [originStoreId, setOriginStoreId] = useState("");
  const [destinationStoreId, setDestinationStoreId] = useState("");
  const [requesterId, setRequesterId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [printing, setPrinting] = useState(false);
  const tabs = BASE_TABS.filter((t) => {
    if (t.key === "transferencias") return hasFeature("reportsTransfers");
    if (t.key === "vendas") return hasFeature("reportsSales");
    if (t.key === "caixa") return hasFeature("reportsCashClosings");
    return true;
  });

  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab("vendas");
  }, [tab, tabs]);

  const inputClass = "px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";
  const handlePrint = async () => {
    setPrinting(true);
    try {
      const params = new URLSearchParams({ type: tab, from, to });
      if (tab === "transferencias") {
        if (originStoreId) params.set("originStoreId", originStoreId);
        if (destinationStoreId) params.set("destinationStoreId", destinationStoreId);
        if (requesterId) params.set("requesterId", requesterId);
        if (senderId) params.set("senderId", senderId);
        if (itemFilter) params.set("item", itemFilter);
      }

      const base = import.meta.env.VITE_API_URL || "";
      const token = getToken();
      const storeId = getStoreId();
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (storeId) headers["X-Store-Id"] = storeId;

      const res = await fetch(`${base}/api/reports/export-pdf?${params.toString()}`, { headers });
      if (!res.ok) {
        let msg = `Erro ao gerar PDF (${res.status})`;
        try {
          const j = await res.json();
          msg = j?.error?.message || msg;
        } catch {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${tab}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setPrinting(false);
    }
  };

  const loadSalesReport = (pg = 1) => {
    setLoading(true);
    setSalesPage(pg);
    const params = new URLSearchParams({ from, to, status: "PAID", page: pg, limit: 30 });
    apiFetch(`/api/reports/sales?${params}`)
      .then((res) => setSalesData(res.data))
      .catch((err) => addToast(err.message, "error"))
      .finally(() => setLoading(false));
  };

  const loadCashReport = (pg = 1) => {
    setLoading(true);
    setCashPage(pg);
    const params = new URLSearchParams({ from, to, page: pg, limit: 20 });
    apiFetch(`/api/reports/cash-closings?${params}`)
      .then((res) => setCashData(res.data))
      .catch((err) => addToast(err.message, "error"))
      .finally(() => setLoading(false));
  };

  const loadTransfersReport = (pg = 1) => {
    setLoading(true);
    setTransferPage(pg);
    const params = new URLSearchParams({ from, to, page: pg, limit: 20 });
    if (originStoreId) params.set("originStoreId", originStoreId);
    if (destinationStoreId) params.set("destinationStoreId", destinationStoreId);
    if (requesterId) params.set("requesterId", requesterId);
    if (senderId) params.set("senderId", senderId);
    if (itemFilter) params.set("item", itemFilter);
    apiFetch(`/api/reports/transfers?${params}`)
      .then((res) => setTransferData(res.data))
      .catch((err) => addToast(err.message, "error"))
      .finally(() => setLoading(false));
  };

  const handleFilter = () => {
    if (tab === "vendas") loadSalesReport(1);
    else if (tab === "caixa") loadCashReport(1);
    else loadTransfersReport(1);
  };

  useEffect(() => { handleFilter(); }, [tab]);

  useEffect(() => {
    if (!transferData?.transfers?.length) {
      setSelectedTransferId("");
      return;
    }
    const exists = transferData.transfers.some((t) => t.id === selectedTransferId);
    if (!exists) setSelectedTransferId(transferData.transfers[0].id);
  }, [transferData]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t.key ? "bg-white text-primary-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <Card>
        <CardBody className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">De</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Ate</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </div>
          <Button onClick={handleFilter} disabled={loading}>
            <Filter size={14} /> Filtrar
          </Button>
          <Button variant="secondary" onClick={handlePrint} disabled={loading} loading={printing}>
            <Printer size={14} /> Imprimir
          </Button>
        </CardBody>
      </Card>

      {tab === "transferencias" && (
        <Card>
          <CardBody className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Origem</label>
              <select value={originStoreId} onChange={(e) => setOriginStoreId(e.target.value)} className={inputClass}>
                <option value="">Todas</option>
                {(transferData?.filters?.stores || []).map((s) => <option key={`o-${s.id}`} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Destino</label>
              <select value={destinationStoreId} onChange={(e) => setDestinationStoreId(e.target.value)} className={inputClass}>
                <option value="">Todos</option>
                {(transferData?.filters?.stores || []).map((s) => <option key={`d-${s.id}`} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Solicitante</label>
              <select value={requesterId} onChange={(e) => setRequesterId(e.target.value)} className={inputClass}>
                <option value="">Todos</option>
                {(transferData?.filters?.users || []).map((u) => <option key={`r-${u.id}`} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Remetente</label>
              <select value={senderId} onChange={(e) => setSenderId(e.target.value)} className={inputClass}>
                <option value="">Todos</option>
                {(transferData?.filters?.users || []).map((u) => <option key={`s-${u.id}`} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="block text-xs font-medium text-gray-600">Item</label>
              <input value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} placeholder="Nome ou EAN do item" className={inputClass} />
            </div>
          </CardBody>
        </Card>
      )}

      {loading && <PageSpinner />}

      {/* ═══ SALES REPORT ═══ */}
      {tab === "vendas" && salesData && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardBody className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Total Vendas</p>
                  <p className="text-xl font-bold text-gray-900">{salesData.summary?.totalSales || 0}</p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                  <DollarSign size={20} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Receita Total</p>
                  <p className="text-xl font-bold text-gray-900">{money(salesData.summary?.totalRevenue || 0)}</p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Ticket Medio</p>
                  <p className="text-xl font-bold text-gray-900">
                    {salesData.summary?.totalSales > 0
                      ? money(salesData.summary.totalRevenue / salesData.summary.totalSales)
                      : money(0)}
                  </p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500 uppercase mb-2">Por Forma de Pagamento</p>
                {salesData.summary?.byMethod && Object.keys(salesData.summary.byMethod).length > 0 ? (
                  <div className="space-y-1">
                    {Object.entries(salesData.summary.byMethod).map(([method, amount]) => (
                      <div key={method} className="flex justify-between text-sm">
                        <span className="text-gray-600">{METHOD_LABELS[method] || method}</span>
                        <span className="font-medium text-gray-900">{money(amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400">—</p>}
              </CardBody>
            </Card>
          </div>

          {/* Sales table */}
          <Card>
            <CardHeader className="flex items-center gap-2">
              <BarChart3 size={18} className="text-gray-400" />
              <h3 className="font-semibold text-gray-900">Vendas no Período</h3>
              <span className="text-xs text-gray-400 ml-2">{salesData.total || 0} registros</span>
            </CardHeader>
            {(salesData.sales || []).length === 0 ? (
              <CardBody><p className="text-sm text-gray-400 text-center py-4">Nenhuma venda encontrada no período</p></CardBody>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">#</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Data</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Vendedor</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Itens</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">Total</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Pagamento</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {salesData.sales.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-xs text-gray-500">{s.number}</td>
                          <td className="px-4 py-2 text-gray-500">{formatDate(s.createdAt)}</td>
                          <td className="px-4 py-2">
                            {s.customer ? (
                              <div>
                                <span className="text-gray-900">{s.customer.name}</span>
                                {s.customer.document && <span className="text-xs text-gray-400 ml-1">{cpfMask(s.customer.document)}</span>}
                              </div>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-2 text-gray-500">{s.seller || "—"}</td>
                          <td className="px-4 py-2 text-gray-500">{s.itemsCount}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-900">{money(s.total)}</td>
                          <td className="px-4 py-2">
                            {s.paymentMethod ? (
                              <Badge color="blue">{METHOD_LABELS[s.paymentMethod] || s.paymentMethod}</Badge>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-2">
                            <Badge color={STATUS_COLORS[s.status] || "gray"}>{STATUS_LABELS[s.status] || s.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {salesData.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-100">
                    <button onClick={() => loadSalesReport(salesPage - 1)} disabled={salesPage <= 1}
                      className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40">Anterior</button>
                    <span className="text-sm text-gray-500">{salesPage} / {salesData.totalPages}</span>
                    <button onClick={() => loadSalesReport(salesPage + 1)} disabled={salesPage >= salesData.totalPages}
                      className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40">Proximo</button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}

      {/* ═══ CASH CLOSINGS REPORT ═══ */}
      {tab === "caixa" && cashData && !loading && (
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Wallet size={18} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Fechamentos de Caixa</h3>
            <span className="text-xs text-gray-400 ml-2">{cashData.total || 0} registros</span>
          </CardHeader>
          {(cashData.closings || []).length === 0 ? (
            <CardBody><p className="text-sm text-gray-400 text-center py-4">Nenhum fechamento encontrado no período</p></CardBody>
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                {cashData.closings.map((c) => (
                  <div key={c.id} className="px-5 py-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{c.store || "—"}</span>
                          <span className="text-xs text-gray-400">{formatDateTime(c.closedAt)}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span>Aberto por: {c.openedBy || "—"}</span>
                          <span>Fechado por: {c.closedBy || "—"}</span>
                          <span>{c.movementsCount} movimentacoes</span>
                        </div>
                        {c.note && <p className="text-xs text-gray-400 mt-1 italic">{c.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">{money(c.finalCash ?? 0)}</p>
                        {c.divergence !== null && (
                          <p className={`text-xs font-medium ${c.divergence === 0 ? "text-emerald-600" : c.divergence > 0 ? "text-blue-600" : "text-red-600"}`}>
                            Diverg: {money(c.divergence)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-[10px] text-gray-500 uppercase">Fundo Inicial</p>
                        <p className="text-sm font-medium text-gray-900">{money(c.initialCash)}</p>
                      </div>
                      <div className="bg-emerald-50 rounded p-2">
                        <p className="text-[10px] text-emerald-600 uppercase">Recebimentos</p>
                        <p className="text-sm font-medium text-emerald-700">{money(c.totalRecebido)}</p>
                      </div>
                      <div className="bg-blue-50 rounded p-2">
                        <p className="text-[10px] text-blue-600 uppercase">Suprimentos</p>
                        <p className="text-sm font-medium text-blue-700">{money(c.totalSuprimento)}</p>
                      </div>
                      <div className="bg-red-50 rounded p-2">
                        <p className="text-[10px] text-red-600 uppercase">Sangrias</p>
                        <p className="text-sm font-medium text-red-700">{money(c.totalSangria)}</p>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-[10px] text-gray-500 uppercase">Esperado</p>
                        <p className="text-sm font-medium text-gray-900">{money(c.expected)}</p>
                      </div>
                    </div>
                    {c.byMethod && Object.keys(c.byMethod).length > 0 && (
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="text-gray-400">Pagamentos:</span>
                        {Object.entries(c.byMethod).map(([m, v]) => (
                          <Badge key={m} color="blue">{METHOD_LABELS[m] || m}: {money(v)}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {cashData.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-100">
                  <button onClick={() => loadCashReport(cashPage - 1)} disabled={cashPage <= 1}
                    className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40">Anterior</button>
                  <span className="text-sm text-gray-500">{cashPage} / {cashData.totalPages}</span>
                  <button onClick={() => loadCashReport(cashPage + 1)} disabled={cashPage >= cashData.totalPages}
                    className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40">Proximo</button>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {tab === "transferencias" && transferData && !loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500 uppercase">Transferencias</p>
                <p className="text-xl font-bold text-gray-900">{transferData.summary?.totalTransfers || 0}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500 uppercase">Qtd Pedida</p>
                <p className="text-xl font-bold text-gray-900">{transferData.summary?.totalRequested || 0}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500 uppercase">Qtd Enviada</p>
                <p className="text-xl font-bold text-gray-900">{transferData.summary?.totalSent || 0}</p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex items-center gap-2">
              <ArrowUpCircle size={18} className="text-gray-400" />
              <h3 className="font-semibold text-gray-900">Relatorio de Transferencias</h3>
              <span className="text-xs text-gray-400 ml-2">{transferData.total || 0} registros</span>
            </CardHeader>
            {(transferData.transfers || []).length === 0 ? (
              <CardBody><p className="text-sm text-gray-400 text-center py-4">Nenhuma transferencia encontrada no periodo</p></CardBody>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Data</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Origem</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Destino</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Solicitante</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Remetente</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">Pedida</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">Enviada</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Itens</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(transferData.transfers || []).map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50 align-top">
                          <td className="px-4 py-2 text-gray-500">{formatDateTime(t.createdAt)}</td>
                          <td className="px-4 py-2 text-gray-900">{t.originStore?.name || "—"}</td>
                          <td className="px-4 py-2 text-gray-900">{t.destinationStore?.name || "—"}</td>
                          <td className="px-4 py-2 text-gray-500">{t.requester?.name || "—"}</td>
                          <td className="px-4 py-2 text-gray-500">{t.sender?.name || "—"}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-900">{t.requestedQty || 0}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-900">{t.sentQty || 0}</td>
                          <td className="px-4 py-2">
                            <Badge color={t.status === "RECEIVED" ? "green" : t.status === "SENT" ? "blue" : t.status === "CANCELED" ? "red" : "gray"}>
                              {t.status === "RECEIVED" ? "Recebido" : t.status === "SENT" ? "Enviado" : t.status === "CANCELED" ? "Cancelado" : "Rascunho"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => setSelectedTransferId(t.id)}
                              className={`text-xs font-medium ${selectedTransferId === t.id ? "text-primary-700" : "text-primary-600 hover:text-primary-700"}`}
                            >
                              {selectedTransferId === t.id ? "Selecionada" : "Ver itens"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(() => {
                  const selected = (transferData.transfers || []).find((t) => t.id === selectedTransferId);
                  if (!selected) return null;
                  return (
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                      <p className="text-sm font-medium text-gray-800">
                        Itens da transferencia {selected.originStore?.name || "—"} → {selected.destinationStore?.name || "—"}
                      </p>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-500 border-b border-gray-200">
                              <th className="py-1 pr-2 font-medium">Item</th>
                              <th className="py-1 pr-2 font-medium">EAN</th>
                              <th className="py-1 pr-2 font-medium text-right">Pedida</th>
                              <th className="py-1 pr-2 font-medium text-right">Enviada</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(selected.items || []).map((it) => (
                              <tr key={`${selected.id}-${it.productId}`}>
                                <td className="py-1.5 pr-2 text-gray-800">{it.productName}</td>
                                <td className="py-1.5 pr-2 text-gray-500 font-mono">{it.ean || "—"}</td>
                                <td className="py-1.5 pr-2 text-right text-gray-900">{it.requestedQty}</td>
                                <td className="py-1.5 pr-2 text-right text-gray-900">{it.sentQty}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
                {transferData.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-100">
                    <button onClick={() => loadTransfersReport(transferPage - 1)} disabled={transferPage <= 1}
                      className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40">Anterior</button>
                    <span className="text-sm text-gray-500">{transferPage} / {transferData.totalPages}</span>
                    <button onClick={() => loadTransfersReport(transferPage + 1)} disabled={transferPage >= transferData.totalPages}
                      className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40">Proximo</button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
