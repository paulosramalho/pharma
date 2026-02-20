import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { money, formatDate, parseDateNoon } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Table, { Pagination } from "../components/ui/Table";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import { PageSpinner } from "../components/ui/Spinner";
import { Plus, ShoppingCart, Search, RefreshCw, X, Tag, XCircle, Play, Trash2, PackageSearch } from "lucide-react";

const STATUS_TABS = [
  { key: "", label: "Todas" },
  { key: "DRAFT", label: "Rascunho" },
  { key: "CONFIRMED", label: "Confirmadas" },
  { key: "PAID", label: "Pagas" },
  { key: "CANCELED", label: "Canceladas" },
];

const STATUS_LABELS = { DRAFT: "Rascunho", CONFIRMED: "Confirmada", PAID: "Paga", CANCELED: "Cancelada", REFUNDED: "Estornada" };

export default function Vendas() {
  const { hasPermission } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Exchange modal state
  const [exchangeModal, setExchangeModal] = useState(null);
  const [exchangeItems, setExchangeItems] = useState([]);
  const [exchangeReason, setExchangeReason] = useState("");
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [submittingExchange, setSubmittingExchange] = useState(false);

  // Cancel modal
  const [cancelModal, setCancelModal] = useState(null); // sale object
  const [cancelReason, setCancelReason] = useState("");

  // New items for exchange
  const [newItemSearch, setNewItemSearch] = useState("");
  const [newItemResults, setNewItemResults] = useState([]);
  const [newItems, setNewItems] = useState([]); // [{productId, productName, priceUnit, quantity, discount}]
  const [newItemHighlight, setNewItemHighlight] = useState(-1);
  const newSearchRef = useRef(null);
  const [lookupModal, setLookupModal] = useState(false);
  const [lookupSearch, setLookupSearch] = useState("");
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  const load = ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    apiFetch(`/api/sales?${params}`)
      .then((res) => {
        setSales(res.data.sales || []);
        setTotalPages(res.data.totalPages || 1);
      })
      .catch((err) => addToast(err.message, "error"))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      load({ silent: true });
    }, 10000);
    return () => clearInterval(interval);
  }, [page, statusFilter, search]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const openExchange = async (sale) => {
    setExchangeModal(sale);
    setExchangeReason("");
    setNewItems([]);
    setNewItemSearch("");
    setNewItemResults([]);
    setExchangeLoading(true);
    try {
      const res = await apiFetch(`/api/sales/${sale.id}`);
      const items = (res.data?.items || []).map((i) => ({
        saleItemId: i.id,
        productName: i.product?.name || "—",
        priceUnit: Number(i.priceUnit),
        max: i.quantity,
        quantity: 0,
      }));
      setExchangeItems(items);
    } catch (err) {
      addToast(err.message, "error");
      setExchangeModal(null);
    }
    setExchangeLoading(false);
  };

  const deleteDraft = async (sale) => {
    try {
      await apiFetch(`/api/sales/${sale.id}`, { method: "DELETE" });
      addToast("Rascunho apagado", "success");
      load();
    } catch (err) { addToast(err.message, "error"); }
  };

  const openCancel = (sale) => {
    setCancelModal(sale);
    setCancelReason("");
  };

  const submitCancel = async () => {
    if (!cancelReason.trim()) { addToast("Informe o motivo do cancelamento", "warning"); return; }
    try {
      await apiFetch(`/api/sales/${cancelModal.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason }),
      });
      addToast("Venda cancelada", "warning");
      setCancelModal(null);
      load();
    } catch (err) { addToast(err.message, "error"); }
  };

  const updateExchangeQty = (idx, qty) => {
    setExchangeItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, quantity: Math.max(0, Math.min(qty, item.max)) } : item
    ));
  };

  // Product search for new items
  const searchNewProducts = async (q) => {
    if (q.length < 2) { setNewItemResults([]); return; }
    try {
      const res = await apiFetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`);
      setNewItemResults(res.data.products || []);
    } catch { setNewItemResults([]); }
  };

  const getDiscountedPrice = (product) => {
    const base = Number(product.prices?.[0]?.price || 0);
    const d = product.discounts?.[0];
    if (!d || !d.active) return { base, final: base, discount: null };
    const now = parseDateNoon(new Date());
    if (d.endDate && parseDateNoon(d.endDate) < now) return { base, final: base, discount: null };
    const discounted = d.type === "PERCENT"
      ? base * (1 - Number(d.value) / 100)
      : Math.max(0, base - Number(d.value));
    return { base, final: Math.round(discounted * 100) / 100, discount: d };
  };

  const addNewItem = (product) => {
    const existing = newItems.find((i) => i.productId === product.id);
    if (existing) {
      setNewItems((prev) => prev.map((i) =>
        i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      const dp = getDiscountedPrice(product);
      setNewItems((prev) => [...prev, {
        productId: product.id,
        productName: product.name,
        priceUnit: dp.final,
        priceOriginal: dp.discount ? dp.base : null,
        discount: dp.discount,
        quantity: 1,
      }]);
    }
    setNewItemSearch("");
    setNewItemResults([]);
    setNewItemHighlight(-1);
    newSearchRef.current?.focus();
  };

  const updateNewItemQty = (idx, qty) => {
    if (qty <= 0) {
      setNewItems((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setNewItems((prev) => prev.map((item, i) => i === idx ? { ...item, quantity: qty } : item));
    }
  };

  const removeNewItem = (idx) => {
    setNewItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const searchLookup = async (q) => {
    const term = String(q || "").trim();
    if (term.length < 2) { setLookupResults([]); return; }
    setLookupLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/lookup?search=${encodeURIComponent(term)}&limit=30`);
      setLookupResults(res.data?.products || []);
    } catch (err) {
      addToast(err.message, "error");
      setLookupResults([]);
    }
    setLookupLoading(false);
  };

  const submitExchange = async () => {
    const returnedSelected = exchangeItems.filter((i) => i.quantity > 0);
    if (returnedSelected.length === 0 && newItems.length === 0) {
      addToast("Selecione itens para devolver ou novos itens para troca", "warning");
      return;
    }
    setSubmittingExchange(true);
    try {
      const res = await apiFetch(`/api/sales/${exchangeModal.id}/exchange`, {
        method: "POST",
        body: JSON.stringify({
          returnedItems: returnedSelected.map((i) => ({ saleItemId: i.saleItemId, quantity: i.quantity })),
          newItems: newItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          reason: exchangeReason,
        }),
      });
      const d = res.data;
      if (d.pendingSettlement) {
        const net = d.netDifference;
        addToast(`Troca registrada! Diferença de ${money(Math.abs(net))} a liquidar no Caixa.`, "info");
      } else {
        addToast("Troca realizada! Valores iguais, sem diferença.", "success");
      }
      setExchangeModal(null);
      load();
    } catch (err) { addToast(err.message, "error"); }
    setSubmittingExchange(false);
  };

  const returnTotal = exchangeItems.reduce((s, i) => s + (i.quantity * i.priceUnit), 0);
  const newTotal = newItems.reduce((s, i) => s + (i.quantity * i.priceUnit), 0);
  const netDifference = newTotal - returnTotal;

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";

  const columns = [
    { key: "number", label: "#", render: (r) => <span className="font-mono text-xs">{r.number}</span> },
    { key: "createdAt", label: "Data", render: (r) => formatDate(r.createdAt) },
    { key: "customer", label: "Cliente", render: (r) => r.customer?.name || "—" },
    { key: "itemCount", label: "Itens", render: (r) => r._count?.items ?? 0 },
    { key: "total", label: "Total", render: (r) => money(r.total), className: "text-right font-medium" },
    { key: "status", label: "Status", render: (r) => (
      <div>
        <Badge status={r.status}>{STATUS_LABELS[r.status] || r.status}</Badge>
        {r.exchangeBalance && Number(r.exchangeBalance) !== 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] rounded">Troca pendente</span>
        )}
        {r.status === "CANCELED" && r.cancelReason && (
          <p className="text-[10px] text-gray-500 mt-0.5 max-w-[150px] truncate" title={r.cancelReason}>{r.cancelReason}</p>
        )}
      </div>
    )},
    { key: "actions", label: "", render: (r) => (
      <div className="flex items-center gap-1">
        {r.status === "DRAFT" && (
          <>
            <button onClick={() => navigate(`/vendas/nova?resume=${r.id}`)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded" title="Continuar">
              <Play size={14} />
            </button>
            <button onClick={() => deleteDraft(r)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Apagar">
              <Trash2 size={14} />
            </button>
          </>
        )}
        {r.status === "CONFIRMED" && (
          <button onClick={() => openCancel(r)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Cancelar">
            <XCircle size={14} />
          </button>
        )}
        {r.status === "PAID" && (
          <button onClick={() => openExchange(r)} className="p-1.5 text-gray-400 hover:text-amber-600 rounded" title="Troca/Devolução">
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Vendas</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setLookupModal(true)}>
            <PackageSearch size={16} /> Consultar Estoque/Preco
          </Button>
          {hasPermission("sales.create") && (
            <Button onClick={() => navigate("/vendas/nova")}>
              <Plus size={16} /> Nova Venda
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              statusFilter === tab.key ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por numero..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <Button type="submit" variant="secondary" size="md">Buscar</Button>
      </form>

      {/* Table */}
      <Card>
        {loading ? (
          <PageSpinner />
        ) : sales.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Nenhuma venda" description="Crie uma nova venda para comecar." />
        ) : (
          <>
            <Table columns={columns} data={sales} />
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </Card>

      {/* Exchange Modal */}
      <Modal open={!!exchangeModal} onClose={() => setExchangeModal(null)} title="Troca / Devolução" size="lg">
        {exchangeModal && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Venda #{exchangeModal.number}</span>
                <span className="font-bold text-gray-900">{money(exchangeModal.total)}</span>
              </div>
              {exchangeModal.customer && (
                <p className="text-xs text-gray-500 mt-1">{exchangeModal.customer.name}</p>
              )}
            </div>

            {exchangeLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Section 1: Items to return */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Itens para devolver:</p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {exchangeItems.map((item, idx) => (
                      <div key={item.saleItemId} className={`flex items-center gap-3 px-4 py-3 ${item.quantity > 0 ? "bg-red-50/50" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900">{item.productName}</p>
                          <p className="text-xs text-gray-500">{money(item.priceUnit)} x {item.max}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Qtd:</label>
                          <input
                            type="number"
                            min={0}
                            max={item.max}
                            value={item.quantity}
                            onChange={(e) => updateExchangeQty(idx, parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                          />
                          <span className="text-xs text-gray-400">/ {item.max}</span>
                        </div>
                        {item.quantity > 0 && (
                          <span className="text-sm font-medium text-red-600">-{money(item.quantity * item.priceUnit)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {returnTotal > 0 && (
                    <p className="text-xs text-right mt-1 text-red-600 font-medium">
                      Credito: {money(returnTotal)}
                    </p>
                  )}
                </div>

                {/* Section 2: New items to take */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Novos itens (troca por):</p>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={newSearchRef}
                      value={newItemSearch}
                      onChange={(e) => { setNewItemSearch(e.target.value); searchNewProducts(e.target.value); setNewItemHighlight(-1); }}
                      onKeyDown={(e) => {
                        if (!newItemResults.length) return;
                        if (e.key === "ArrowDown") { e.preventDefault(); setNewItemHighlight((i) => Math.min(i + 1, newItemResults.length - 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setNewItemHighlight((i) => Math.max(i - 1, 0)); }
                        else if (e.key === "Enter" && newItemHighlight >= 0) { e.preventDefault(); addNewItem(newItemResults[newItemHighlight]); }
                        else if (e.key === "Escape") { setNewItemResults([]); setNewItemHighlight(-1); }
                      }}
                      placeholder="Buscar produto para trocar..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* Search results dropdown */}
                  {newItemResults.length > 0 && (
                    <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                      {newItemResults.map((p, idx) => {
                        const dp = getDiscountedPrice(p);
                        return (
                          <button
                            key={p.id}
                            onClick={() => addNewItem(p)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                              idx === newItemHighlight ? "bg-primary-50" : "hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-gray-900">{p.name}</span>
                              {dp.discount && (
                                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">
                                  <Tag size={9} />
                                  {dp.discount.type === "PERCENT" ? `${Number(dp.discount.value)}%` : money(dp.discount.value)}
                                </span>
                              )}
                            </div>
                            {dp.discount ? (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 line-through text-xs">{money(dp.base)}</span>
                                <span className="text-emerald-600 font-bold">{money(dp.final)}</span>
                              </div>
                            ) : (
                              <span className="text-primary-600 font-medium">{money(dp.base)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Added new items list */}
                  {newItems.length > 0 && (
                    <div className="mt-2 border border-emerald-200 rounded-lg divide-y divide-emerald-100">
                      {newItems.map((item, idx) => (
                        <div key={item.productId} className="flex items-center gap-3 px-4 py-2 bg-emerald-50/50">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900">
                              {item.productName}
                              {item.discount && <Tag size={11} className="inline ml-1 text-amber-500" />}
                            </p>
                            <p className="text-xs text-gray-500">
                              {item.priceOriginal ? (
                                <><span className="line-through">{money(item.priceOriginal)}</span> → {money(item.priceUnit)}</>
                              ) : money(item.priceUnit)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateNewItemQty(idx, parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                            />
                            <button onClick={() => removeNewItem(idx)} className="text-gray-400 hover:text-red-500">
                              <X size={14} />
                            </button>
                          </div>
                          <span className="text-sm font-medium text-emerald-700">+{money(item.quantity * item.priceUnit)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {newTotal > 0 && (
                    <p className="text-xs text-right mt-1 text-emerald-700 font-medium">
                      Novos itens: {money(newTotal)}
                    </p>
                  )}
                </div>

                {/* Net difference summary */}
                {(returnTotal > 0 || newTotal > 0) && (
                  <div className={`p-3 rounded-lg ${
                    netDifference > 0 ? "bg-blue-50" : netDifference < 0 ? "bg-amber-50" : "bg-green-50"
                  }`}>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Devolvido:</span>
                      <span className="text-red-600 font-medium">-{money(returnTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Novos itens:</span>
                      <span className="text-emerald-600 font-medium">+{money(newTotal)}</span>
                    </div>
                    <div className="border-t mt-1.5 pt-1.5 flex justify-between text-sm font-bold">
                      <span>{netDifference > 0 ? "Cliente paga:" : netDifference < 0 ? "Devolver ao cliente:" : "Diferenca:"}</span>
                      <span className={netDifference > 0 ? "text-blue-700" : netDifference < 0 ? "text-amber-700" : "text-green-700"}>
                        {money(Math.abs(netDifference))}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Motivo da troca</label>
                  <input
                    value={exchangeReason}
                    onChange={(e) => setExchangeReason(e.target.value)}
                    placeholder="Descreva o motivo..."
                    className={inputClass}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setExchangeModal(null)}>Cancelar</Button>
                  <Button className="flex-1" loading={submittingExchange} onClick={submitExchange}
                    disabled={exchangeItems.every((i) => i.quantity === 0) && newItems.length === 0}>
                    <RefreshCw size={14} /> Confirmar Troca
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal open={lookupModal} onClose={() => setLookupModal(false)} title="Consulta de Estoque / Preco" size="lg">
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={lookupSearch}
              onChange={(e) => { setLookupSearch(e.target.value); searchLookup(e.target.value); }}
              placeholder="Buscar por nome ou EAN..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>
          {lookupLoading ? (
            <div className="flex items-center justify-center py-6"><div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : lookupResults.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Digite ao menos 2 caracteres para consultar.</p>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto space-y-2">
              {lookupResults.map((p) => (
                <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.ean || "Sem EAN"}</p>
                    </div>
                    <p className="text-sm font-bold text-primary-700">{p.price != null ? money(p.price) : "Sem preco"}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {(p.stores || []).map((s) => (
                      <div key={s.id} className="text-xs bg-gray-50 rounded px-2 py-1 flex items-center justify-between">
                        <span className="text-gray-600">{s.name}</span>
                        <span className="font-medium text-gray-800">Disp: {s.available} {s.reserved > 0 ? `(Res: ${s.reserved})` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Cancel Modal */}
      <Modal open={!!cancelModal} onClose={() => setCancelModal(null)} title="Cancelar Venda">
        {cancelModal && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Venda #{cancelModal.number}</span>
                <span className="font-bold text-gray-900">{money(cancelModal.total)}</span>
              </div>
              {cancelModal.customer && (
                <p className="text-xs text-gray-500 mt-1">{cancelModal.customer.name}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Motivo do cancelamento *</label>
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Informe o motivo..."
                className={inputClass}
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setCancelModal(null)}>Voltar</Button>
              <Button variant="danger" className="flex-1" disabled={!cancelReason.trim()} onClick={submitCancel}>
                <XCircle size={14} /> Confirmar Cancelamento
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
