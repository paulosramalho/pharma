import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { money, formatDate, formatDateTime } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import EmptyState from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import {
  Package, Plus, ArrowDownUp, AlertTriangle, Search, Pencil,
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, Warehouse, Store,
  BarChart3, DollarSign, Tag,
} from "lucide-react";

const TABS = [
  { key: "overview", label: "Visão Geral" },
  { key: "receive", label: "Entrada" },
  { key: "adjust", label: "Ajuste" },
  { key: "valuation", label: "Valoração" },
];

const TYPE_ICON = { CENTRAL: Warehouse, LOJA: Store };
const TYPE_LABEL = { CENTRAL: "Depósito", LOJA: "Loja" };
const MOV_LABELS = { IN: "Entrada", OUT: "Saída", ADJUST_POS: "Ajuste +", ADJUST_NEG: "Ajuste -", TRANSFER_IN: "Transf. Entrada", TRANSFER_OUT: "Transf. Saída" };

export default function Estoque() {
  const { hasPermission } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState("overview");

  // Overview state
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // Receive form
  const [receiveForm, setReceiveForm] = useState({ productId: "", lotNumber: "", expiration: "", costUnit: "", quantity: "", storeId: "" });
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Adjust form
  const [adjustForm, setAdjustForm] = useState({ lotId: "", type: "ADJUST_POS", quantity: "", reason: "" });
  const [adjustLots, setAdjustLots] = useState([]);

  // Stores for receive form
  const [allStores, setAllStores] = useState([]);

  // Edit lot modal
  const [editModal, setEditModal] = useState(null); // lot object to edit
  const [editForm, setEditForm] = useState({ quantity: "", costUnit: "", reason: "" });

  // Valuation
  const [valuation, setValuation] = useState(null);
  const [loadingVal, setLoadingVal] = useState(false);
  const [valStoreId, setValStoreId] = useState("");

  // Auto-price modal
  const [priceModal, setPriceModal] = useState(null); // product from valuation
  const [markup, setMarkup] = useState("");
  const [pricingResult, setPricingResult] = useState(null);

  const loadOverview = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    apiFetch(`/api/inventory/overview?${params}`)
      .then((res) => {
        setOverview(res.data);
        setAllStores(res.data?.stores || []);
      })
      .catch((err) => addToast(err.message, "error"))
      .finally(() => setLoading(false));
  };

  const loadValuation = () => {
    setLoadingVal(true);
    const params = new URLSearchParams();
    if (valStoreId) params.set("storeId", valStoreId);
    apiFetch(`/api/inventory/valuation?${params}`)
      .then((res) => setValuation(res.data))
      .catch((err) => addToast(err.message, "error"))
      .finally(() => setLoadingVal(false));
  };

  useEffect(() => {
    if (tab === "overview") loadOverview();
    else if (tab === "valuation") loadValuation();
    else {
      setLoading(false);
      if (allStores.length === 0) {
        apiFetch("/api/stores").then((res) => setAllStores(res.data || [])).catch(() => {});
      }
    }
  }, [tab]);

  const loadProductMovements = async (productId) => {
    if (expandedProduct === productId) {
      setExpandedProduct(null);
      return;
    }
    setExpandedProduct(productId);
    setLoadingMovements(true);
    try {
      const res = await apiFetch(`/api/inventory/product/${productId}/movements?limit=20`);
      setMovements(res.data.movements || []);
    } catch { setMovements([]); }
    setLoadingMovements(false);
  };

  const searchProducts = async (q) => {
    if (q.length < 2) { setProducts([]); return; }
    try {
      const res = await apiFetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`);
      setProducts(res.data.products || []);
    } catch { /* ignore */ }
  };

  const handleReceive = async () => {
    setSubmitting(true);
    try {
      const headers = {};
      if (receiveForm.storeId) headers["X-Store-Id"] = receiveForm.storeId;
      await apiFetch("/api/inventory/receive", {
        method: "POST",
        headers,
        body: JSON.stringify({
          productId: receiveForm.productId,
          lotNumber: receiveForm.lotNumber,
          expiration: receiveForm.expiration,
          costUnit: parseFloat(receiveForm.costUnit),
          quantity: parseInt(receiveForm.quantity),
        }),
      });
      addToast("Entrada registrada!", "success");
      setReceiveForm({ productId: "", lotNumber: "", expiration: "", costUnit: "", quantity: "", storeId: "" });
      setProductSearch("");
    } catch (err) {
      addToast(err.message, "error");
    }
    setSubmitting(false);
  };

  const handleAdjust = async () => {
    setSubmitting(true);
    try {
      await apiFetch("/api/inventory/adjust", {
        method: "POST",
        body: JSON.stringify({
          lotId: adjustForm.lotId,
          type: adjustForm.type,
          quantity: parseInt(adjustForm.quantity),
          reason: adjustForm.reason,
        }),
      });
      addToast("Ajuste registrado!", "success");
      setAdjustForm({ lotId: "", type: "ADJUST_POS", quantity: "", reason: "" });
    } catch (err) {
      addToast(err.message, "error");
    }
    setSubmitting(false);
  };

  const loadLotsForAdjust = async (q) => {
    if (q.length < 2) { setAdjustLots([]); return; }
    try {
      const res = await apiFetch(`/api/inventory/lots?search=${encodeURIComponent(q)}&limit=10`);
      setAdjustLots(res.data.lots || []);
    } catch { /* ignore */ }
  };

  // Edit lot
  const openEditLot = (lotId, lotNumber, currentQty, currentCost) => {
    setEditModal({ lotId, lotNumber });
    setEditForm({ quantity: String(currentQty), costUnit: String(currentCost), reason: "" });
  };

  const submitEditLot = async () => {
    if (!editForm.reason.trim()) { addToast("Motivo obrigatório", "warning"); return; }
    try {
      await apiFetch(`/api/inventory/lots/${editModal.lotId}`, {
        method: "PUT",
        body: JSON.stringify({
          quantity: parseInt(editForm.quantity),
          costUnit: parseFloat(editForm.costUnit),
          reason: editForm.reason,
        }),
      });
      addToast("Lote corrigido!", "success");
      setEditModal(null);
      if (expandedProduct) loadProductMovements(expandedProduct);
      loadOverview();
    } catch (err) { addToast(err.message, "error"); }
  };

  // Auto-price
  const openAutoPrice = (p) => {
    setPriceModal(p);
    setMarkup(p.defaultMarkup || "30");
    setPricingResult(null);
  };

  const submitAutoPrice = async () => {
    try {
      const res = await apiFetch(`/api/products/${priceModal.productId}/auto-price`, {
        method: "POST",
        body: JSON.stringify({ markup: parseFloat(markup) }),
      });
      setPricingResult(res.data);
      addToast(`Preço atualizado: ${money(res.data.sellingPrice)}`, "success");
      loadValuation();
    } catch (err) { addToast(err.message, "error"); }
  };

  const isExpiringSoon = (date) => {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    const diff = (d - now) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 90;
  };

  const stores = overview?.stores || [];
  const overviewProducts = overview?.products || [];

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.filter((t) => {
          if (t.key === "receive") return hasPermission("inventory.receive");
          if (t.key === "adjust") return hasPermission("inventory.adjust");
          return true;
        }).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.key ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-600 hover:text-gray-900"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <>
          <form onSubmit={(e) => { e.preventDefault(); loadOverview(); }} className="flex gap-2 max-w-md">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <Button type="submit" variant="secondary">Buscar</Button>
          </form>

          <Card>
            {loading ? <PageSpinner /> : overviewProducts.length === 0 ? (
              <EmptyState icon={Package} title="Nenhum produto em estoque" description="Registre uma entrada para comecar." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase w-8"></th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Produto</th>
                      {stores.map((s) => (
                        <th key={s.id} className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-center">
                          <div className="flex items-center justify-center gap-1">
                            {s.type === "CENTRAL" ? <Warehouse size={12} /> : <Store size={12} />}
                            {s.name}
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {overviewProducts.map((p) => (
                      <>
                        <tr
                          key={p.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => loadProductMovements(p.id)}
                        >
                          <td className="px-4 py-2.5 text-gray-400">
                            {expandedProduct === p.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="px-4 py-2.5">
                            <div>
                              <span className="font-medium text-gray-900">{p.name}</span>
                              {p.controlled && <Badge color="red" className="ml-2">Controlado</Badge>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {p.ean && <span className="text-xs text-gray-400 font-mono">{p.ean}</span>}
                              {p.category && <span className="text-xs text-gray-400">{p.category}</span>}
                            </div>
                          </td>
                          {stores.map((s) => {
                            const storeData = p.stores[s.id];
                            const qty = storeData?.available || 0;
                            const expiring = isExpiringSoon(storeData?.nearestExpiry);
                            return (
                              <td key={s.id} className="px-4 py-2.5 text-center">
                                {qty > 0 ? (
                                  <div>
                                    <span className={`font-medium ${qty < 10 ? "text-red-600" : "text-gray-900"}`}>{qty}</span>
                                    {expiring && (
                                      <div className="flex items-center justify-center gap-0.5 text-amber-600 text-xs mt-0.5">
                                        <AlertTriangle size={10} />
                                        <span>{formatDate(storeData.nearestExpiry)}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-center gap-2 mt-0.5">
                                      {storeData?.entries?.length > 0 && (
                                        <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                                          <ArrowDown size={9} />+{storeData.entries.reduce((s, e) => s + e.qty, 0)}
                                        </span>
                                      )}
                                      {storeData?.exits?.length > 0 && (
                                        <span className="text-xs text-red-500 flex items-center gap-0.5">
                                          <ArrowUp size={9} />-{storeData.exits.reduce((s, e) => s + e.qty, 0)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-2.5 text-center">
                            <span className="font-bold text-gray-900">{p.totalQty}</span>
                          </td>
                        </tr>

                        {/* Expanded: movement history */}
                        {expandedProduct === p.id && (
                          <tr key={`${p.id}-detail`}>
                            <td colSpan={stores.length + 3} className="bg-gray-50 px-6 py-3">
                              {loadingMovements ? (
                                <div className="flex items-center justify-center py-4">
                                  <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                                </div>
                              ) : movements.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-2">Nenhuma movimentacao registrada</p>
                              ) : (
                                <div className="max-h-60 overflow-y-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-gray-500 border-b border-gray-200">
                                        <th className="pb-1 pr-3 font-medium">Data</th>
                                        <th className="pb-1 pr-3 font-medium">Loja</th>
                                        <th className="pb-1 pr-3 font-medium">Tipo</th>
                                        <th className="pb-1 pr-3 font-medium text-right">Qtd</th>
                                        <th className="pb-1 pr-3 font-medium">Lote</th>
                                        <th className="pb-1 font-medium">Motivo</th>
                                        {hasPermission("inventory.adjust") && <th className="pb-1 w-8"></th>}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {movements.map((m) => {
                                        const isIn = m.type === "IN" || m.type === "ADJUST_POS" || m.type === "TRANSFER_IN";
                                        return (
                                          <tr key={m.id} className="hover:bg-white">
                                            <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                                            <td className="py-1.5 pr-3 text-gray-700">{m.store}</td>
                                            <td className="py-1.5 pr-3">
                                              <span className={`inline-flex items-center gap-0.5 ${isIn ? "text-emerald-600" : "text-red-500"}`}>
                                                {isIn ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                                                {MOV_LABELS[m.type] || m.type}
                                              </span>
                                            </td>
                                            <td className={`py-1.5 pr-3 text-right font-medium ${isIn ? "text-emerald-600" : "text-red-500"}`}>
                                              {isIn ? "+" : "-"}{m.quantity}
                                            </td>
                                            <td className="py-1.5 pr-3 text-gray-400 font-mono">{m.lotNumber || "—"}</td>
                                            <td className="py-1.5 text-gray-500">{m.reason || "—"}</td>
                                            {hasPermission("inventory.adjust") && (
                                              <td className="py-1.5">
                                                {m.lotId && m.type === "IN" && (
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); openEditLot(m.lotId, m.lotNumber, m.lotQty ?? m.quantity, m.lotCost ?? 0); }}
                                                    className="p-0.5 text-gray-400 hover:text-primary-600 rounded"
                                                    title="Corrigir lote"
                                                  >
                                                    <Pencil size={11} />
                                                  </button>
                                                )}
                                              </td>
                                            )}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Receive tab */}
      {tab === "receive" && (
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-900">Entrada de Estoque</h3></CardHeader>
          <CardBody className="space-y-4 max-w-lg">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Loja destino</label>
              <select value={receiveForm.storeId} onChange={(e) => setReceiveForm({ ...receiveForm, storeId: e.target.value })} className={inputClass}>
                <option value="">Loja padrao</option>
                {allStores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({TYPE_LABEL[s.type] || s.type})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Produto</label>
              <input
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); searchProducts(e.target.value); }}
                placeholder="Buscar produto..."
                className={inputClass}
              />
              {products.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {products.map((p) => (
                    <button key={p.id} onClick={() => { setReceiveForm({ ...receiveForm, productId: p.id }); setProductSearch(p.name); setProducts([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >{p.name} <span className="text-gray-400 text-xs">({p.ean})</span></button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Número do Lote</label>
                <input value={receiveForm.lotNumber} onChange={(e) => setReceiveForm({ ...receiveForm, lotNumber: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Validade</label>
                <input type="date" value={receiveForm.expiration} onChange={(e) => setReceiveForm({ ...receiveForm, expiration: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Custo Unitário (R$)</label>
                <input type="number" step="0.0001" value={receiveForm.costUnit} onChange={(e) => setReceiveForm({ ...receiveForm, costUnit: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Quantidade</label>
                <input type="number" value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })} className={inputClass} />
              </div>
            </div>
            <Button loading={submitting} onClick={handleReceive} disabled={!receiveForm.productId || !receiveForm.quantity}>
              <Plus size={16} /> Registrar Entrada
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Adjust tab */}
      {tab === "adjust" && (
        <Card>
          <CardHeader><h3 className="font-semibold text-gray-900">Ajuste de Estoque</h3></CardHeader>
          <CardBody className="space-y-4 max-w-lg">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Buscar Lote</label>
              <input
                onChange={(e) => loadLotsForAdjust(e.target.value)}
                placeholder="Buscar por produto..."
                className={inputClass}
              />
              {adjustLots.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {adjustLots.map((l) => (
                    <button key={l.id} onClick={() => { setAdjustForm({ ...adjustForm, lotId: l.id }); setAdjustLots([]); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >{l.product?.name} — Lote {l.lotNumber} ({l.store?.name}, Qtd: {l.quantity})</button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Tipo</label>
                <select value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })} className={inputClass}>
                  <option value="ADJUST_POS">Positivo (+)</option>
                  <option value="ADJUST_NEG">Negativo (-)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Quantidade</label>
                <input type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Motivo (obrigatório)</label>
              <input value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                placeholder="Descreva o motivo do ajuste..."
                className={inputClass} />
            </div>
            <Button loading={submitting} onClick={handleAdjust} disabled={!adjustForm.lotId || !adjustForm.quantity || !adjustForm.reason}>
              <ArrowDownUp size={16} /> Registrar Ajuste
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Valuation tab */}
      {tab === "valuation" && (
        <>
          <div className="flex gap-2 items-center max-w-md">
            <select value={valStoreId} onChange={(e) => setValStoreId(e.target.value)} className={inputClass}>
              <option value="">Todas as lojas</option>
              {allStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Button variant="secondary" onClick={loadValuation}>Atualizar</Button>
          </div>

          {/* Summary cards */}
          {valuation?.summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card>
                <CardBody className="text-center">
                  <p className="text-xs text-gray-500 uppercase">Valor em Estoque</p>
                  <p className="text-xl font-bold text-primary-700">{money(valuation.summary.totalStockValue)}</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="text-center">
                  <p className="text-xs text-gray-500 uppercase">Valor Vendido</p>
                  <p className="text-xl font-bold text-emerald-600">{money(valuation.summary.totalSoldValue)}</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="text-center">
                  <p className="text-xs text-gray-500 uppercase">Unidades em Estoque</p>
                  <p className="text-xl font-bold text-gray-900">{valuation.summary.totalStockQty}</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="text-center">
                  <p className="text-xs text-gray-500 uppercase">Produtos</p>
                  <p className="text-xl font-bold text-gray-900">{valuation.summary.productCount}</p>
                </CardBody>
              </Card>
            </div>
          )}

          {/* Products table */}
          <Card>
            {loadingVal ? <PageSpinner /> : !valuation?.products?.length ? (
              <EmptyState icon={BarChart3} title="Sem dados" description="Registre entradas de estoque primeiro." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Produto</th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Estoque</th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Custo Médio</th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Valor Estoque</th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Vendido (Qtd)</th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Vendido (R$)</th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-center w-20">Precificar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {valuation.products.map((p) => (
                      <tr key={p.productId} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-900">{p.productName}</span>
                          {p.ean && <span className="text-xs text-gray-400 ml-1 font-mono">{p.ean}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">{p.stockQty}</td>
                        <td className="px-4 py-2.5 text-right">{money(p.avgCost)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-primary-700">{money(p.stockValue)}</td>
                        <td className="px-4 py-2.5 text-right">{p.soldQty}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">{money(p.soldValue)}</td>
                        <td className="px-4 py-2.5 text-center">
                          {p.stockQty > 0 && (
                            <button onClick={() => openAutoPrice(p)} className="p-1 text-gray-400 hover:text-primary-600 rounded" title="Calcular preço de venda">
                              <DollarSign size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Edit Lot Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Corrigir Lote">
        {editModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Lote: <span className="font-mono font-medium">{editModal.lotNumber}</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Quantidade</label>
                <input type="number" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Custo Unitário</label>
                <input type="number" step="0.0001" value={editForm.costUnit} onChange={(e) => setEditForm({ ...editForm, costUnit: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Motivo da correção *</label>
              <input value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                placeholder="Ex: digitado qty errada..." className={inputClass} autoFocus />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setEditModal(null)}>Cancelar</Button>
              <Button className="flex-1" disabled={!editForm.reason.trim()} onClick={submitEditLot}>
                <Pencil size={14} /> Corrigir
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Auto-Price Modal */}
      <Modal open={!!priceModal} onClose={() => setPriceModal(null)} title="Calcular Preço de Venda">
        {priceModal && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900">{priceModal.productName}</p>
              <p className="text-xs text-gray-500 mt-1">Custo medio: <span className="font-bold">{money(priceModal.avgCost)}</span></p>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Markup (%)</label>
              <input type="number" step="0.1" min="1" value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                className={inputClass}
                placeholder="Ex: 30 = 30% sobre o custo" />
              {markup > 0 && priceModal.avgCost > 0 && (
                <p className="text-xs text-gray-500">
                  Preço estimado: <span className="font-bold text-primary-700">
                    {money(priceModal.avgCost * (1 + parseFloat(markup || 0) / 100))}
                  </span>
                </p>
              )}
            </div>
            {pricingResult && (
              <div className="p-3 bg-emerald-50 rounded-lg space-y-1">
                <div className="flex justify-between text-sm"><span className="text-gray-600">Custo medio:</span><span>{money(pricingResult.avgCost)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Markup:</span><span>{pricingResult.markup}%</span></div>
                <div className="flex justify-between text-sm font-bold"><span>Preço de venda:</span><span className="text-emerald-700">{money(pricingResult.sellingPrice)}</span></div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPriceModal(null)}>Fechar</Button>
              <Button className="flex-1" disabled={!markup || parseFloat(markup) <= 0} onClick={submitAutoPrice}>
                <DollarSign size={14} /> Definir Preço
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
