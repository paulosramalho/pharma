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
  BarChart3, DollarSign, Tag, Truck, BookmarkCheck,
} from "lucide-react";

const TABS = [
  { key: "overview", label: "Visão Geral" },
  { key: "receive", label: "Entrada" },
  { key: "adjust", label: "Ajuste" },
  { key: "valuation", label: "Valoração" },
  { key: "transfers", label: "Transferencias" },
  { key: "reservations", label: "Reservas" },
];

const TYPE_ICON = { CENTRAL: Warehouse, LOJA: Store };
const TYPE_LABEL = { CENTRAL: "Depósito", LOJA: "Loja" };
const MOV_LABELS = { IN: "Entrada", OUT: "Saída", ADJUST_POS: "Ajuste +", ADJUST_NEG: "Ajuste -", TRANSFER_IN: "Transf. Entrada", TRANSFER_OUT: "Transf. Saída" };

export default function Estoque() {
  const { hasPermission, user, storeId } = useAuth();
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
  const [transfers, setTransfers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [flowLoading, setFlowLoading] = useState(false);
  const [transferForm, setTransferForm] = useState({ originStoreId: "", note: "" });
  const [transferItems, setTransferItems] = useState([]);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferProducts, setTransferProducts] = useState([]);
  const [transferSelectedIds, setTransferSelectedIds] = useState([]);
  const [transferSendDraft, setTransferSendDraft] = useState({});
  const [transferSendConfirm, setTransferSendConfirm] = useState(null);
  const [reservationForm, setReservationForm] = useState({ sourceStoreId: "", customerId: "", note: "" });
  const [reservationItems, setReservationItems] = useState([]);
  const [reservationSearch, setReservationSearch] = useState("");
  const [reservationProducts, setReservationProducts] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const canFlowOperate = user?.role === "ADMIN" || user?.role === "FARMACEUTICO";

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
    else if (tab === "transfers") {
      setLoading(false);
      loadTransfers();
      if (allStores.length === 0) apiFetch("/api/stores").then((res) => setAllStores(res.data || [])).catch(() => {});
    } else if (tab === "reservations") {
      setLoading(false);
      loadReservations();
      if (allStores.length === 0) apiFetch("/api/stores").then((res) => setAllStores(res.data || [])).catch(() => {});
    }
    else {
      setLoading(false);
      if (allStores.length === 0) {
        apiFetch("/api/stores").then((res) => setAllStores(res.data || [])).catch(() => {});
      }
    }
  }, [tab]);

  useEffect(() => {
    if (!transferForm.originStoreId) return;
    setTransferItems((prev) => prev
      .map((it) => {
        const available = getAvailableForStore(it.stores, transferForm.originStoreId);
        if (available < 1) return null;
        return { ...it, quantity: Math.min(it.quantity, available) };
      })
      .filter(Boolean));
  }, [transferForm.originStoreId]);

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

  const searchTransferProducts = async (q) => {
    if (q.length < 2) { setTransferProducts([]); setTransferSelectedIds([]); return; }
    try {
      const res = await apiFetch(`/api/inventory/lookup?search=${encodeURIComponent(q)}&limit=20`);
      setTransferProducts(res.data.products || []);
      setTransferSelectedIds([]);
    } catch { setTransferProducts([]); }
  };

  const searchReservationProducts = async (q) => {
    if (q.length < 2) { setReservationProducts([]); return; }
    try {
      const res = await apiFetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`);
      setReservationProducts(res.data.products || []);
    } catch { setReservationProducts([]); }
  };

  const searchCustomers = async (q) => {
    if (q.length < 3) { setCustomerResults([]); return; }
    try {
      const res = await apiFetch(`/api/customers?search=${encodeURIComponent(q)}`);
      setCustomerResults(res.data?.customers || []);
    } catch { setCustomerResults([]); }
  };

  const loadTransfers = async () => {
    setFlowLoading(true);
    try {
      const res = await apiFetch("/api/inventory/transfers");
      setTransfers(res.data?.transfers || []);
    } catch (err) { addToast(err.message, "error"); }
    setFlowLoading(false);
  };

  const loadReservations = async () => {
    setFlowLoading(true);
    try {
      const res = await apiFetch("/api/inventory/reservations");
      setReservations(res.data?.reservations || []);
    } catch (err) { addToast(err.message, "error"); }
    setFlowLoading(false);
  };

  const selectReceiveProductByBarcode = async () => {
    const code = productSearch.replace(/\D/g, "").trim();
    if (!/^\d{8,14}$/.test(code)) return;
    try {
      const res = await apiFetch(`/api/products?search=${encodeURIComponent(code)}&limit=20`);
      const list = res.data?.products || [];
      const exact = list.find((p) => String(p.ean || "") === code);
      if (!exact) {
        addToast("Codigo de barras nao encontrado", "warning");
        return;
      }
      setReceiveForm((prev) => ({ ...prev, productId: exact.id }));
      setProductSearch(exact.name);
      setProducts([]);
      addToast(`Produto selecionado: ${exact.name}`, "success", 1200);
    } catch (err) {
      addToast(err.message, "error");
    }
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

  const getAvailableForStore = (storesList, originStoreId) => {
    if (!originStoreId) return 0;
    const storeStock = (storesList || []).find((s) => s.id === originStoreId);
    return Number(storeStock?.available || 0);
  };

  const addTransferItem = (product) => {
    if (!product?.id) return;
    const available = getAvailableForStore(product.stores, transferForm.originStoreId);
    if (available < 1) {
      addToast("Sem saldo disponivel na loja de origem selecionada", "warning");
      return;
    }
    setTransferItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        return prev.map((i, k) => {
          if (k !== idx) return i;
          const currentAvailable = getAvailableForStore(i.stores, transferForm.originStoreId);
          return { ...i, quantity: Math.min(currentAvailable, i.quantity + 1) };
        });
      }
      return [...prev, { productId: product.id, productName: product.name, quantity: 1, stores: product.stores || [] }];
    });
  };

  const addSelectedTransferItems = () => {
    if (!transferForm.originStoreId) {
      addToast("Selecione a loja de origem", "warning");
      return;
    }
    if (transferSelectedIds.length === 0) {
      addToast("Selecione ao menos um item", "warning");
      return;
    }
    const selectedProducts = transferProducts.filter((p) => transferSelectedIds.includes(p.id));
    setTransferItems((prev) => {
      const next = [...prev];
      for (const product of selectedProducts) {
        const available = getAvailableForStore(product.stores, transferForm.originStoreId);
        if (available < 1) continue;
        const idx = next.findIndex((i) => i.productId === product.id);
        if (idx >= 0) {
          const currentAvailable = getAvailableForStore(next[idx].stores, transferForm.originStoreId);
          next[idx] = { ...next[idx], quantity: Math.min(currentAvailable, next[idx].quantity + 1) };
        } else {
          next.push({ productId: product.id, productName: product.name, quantity: 1, stores: product.stores || [] });
        }
      }
      return next;
    });
    setTransferSelectedIds([]);
    setTransferSearch("");
    setTransferProducts([]);
  };

  const createTransfer = async () => {
    if (!transferForm.originStoreId || transferItems.length === 0) {
      addToast("Selecione loja origem e itens", "warning");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/inventory/transfers", {
        method: "POST",
        body: JSON.stringify({
          originStoreId: transferForm.originStoreId,
          note: transferForm.note || null,
          items: transferItems,
        }),
      });
      setTransferForm({ originStoreId: "", note: "" });
      setTransferItems([]);
      addToast("Solicitacao de transferencia criada", "success");
      loadTransfers();
    } catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  const sendTransfer = async (id) => {
    const transfer = transfers.find((t) => t.id === id);
    const transferItems = summarizeTransferItems(transfer?.items || []);
    const sendRows = transferItems
      .map((it) => {
        const row = getTransferSendRow(id, it);
        return {
          productId: it.productId,
          selected: !!row.selected,
          quantity: Number(row.quantity || 0),
        };
      })
      .filter((row) => row.selected && row.quantity > 0)
      .map((row) => ({ productId: row.productId, quantity: row.quantity }));
    if (sendRows.length === 0) {
      addToast("Nenhum item com quantidade maior que zero para envio", "warning");
      return;
    }
    const itemMap = (transferItems || []).reduce((acc, it) => {
      acc[it.productId] = it.productName;
      return acc;
    }, {});
    setTransferSendConfirm({
      transferId: id,
      rows: sendRows.map((row) => ({
        productId: row.productId,
        productName: itemMap[row.productId] || row.productId,
        quantity: row.quantity,
      })),
    });
  };

  const confirmSendTransfer = async () => {
    if (!transferSendConfirm?.transferId || !Array.isArray(transferSendConfirm?.rows) || transferSendConfirm.rows.length === 0) {
      setTransferSendConfirm(null);
      return;
    }
    const id = transferSendConfirm.transferId;
    const sendRows = transferSendConfirm.rows.map((row) => ({ productId: row.productId, quantity: row.quantity }));
    setSubmitting(true);
    try {
      await apiFetch(`/api/inventory/transfers/${id}/send`, { method: "POST", body: JSON.stringify({ items: sendRows }) });
      addToast("Transferencia enviada", "success");
      setTransferSendDraft((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${id}:`))));
      setTransferSendConfirm(null);
      loadTransfers();
    }
    catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  const receiveTransfer = async (id) => {
    setSubmitting(true);
    try { await apiFetch(`/api/inventory/transfers/${id}/receive`, { method: "POST" }); addToast("Transferencia recebida", "success"); loadTransfers(); loadOverview(); }
    catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  const cancelTransfer = async (id) => {
    setSubmitting(true);
    try { await apiFetch(`/api/inventory/transfers/${id}/cancel`, { method: "POST" }); addToast("Transferencia cancelada", "warning"); loadTransfers(); }
    catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  const addReservationItem = (product) => {
    if (!product?.id) return;
    setReservationItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id);
      if (idx >= 0) return prev.map((i, k) => k === idx ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { productId: product.id, productName: product.name, quantity: 1 }];
    });
    setReservationSearch("");
    setReservationProducts([]);
  };

  const createReservation = async () => {
    if (!reservationForm.sourceStoreId || reservationItems.length === 0) {
      addToast("Selecione loja origem e itens", "warning");
      return;
    }
    if (!reservationForm.customerId) {
      addToast("Selecione o cliente", "warning");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/inventory/reservations", {
        method: "POST",
        body: JSON.stringify({
          sourceStoreId: reservationForm.sourceStoreId,
          customerId: reservationForm.customerId,
          note: reservationForm.note || null,
          items: reservationItems,
        }),
      });
      setReservationForm({ sourceStoreId: "", customerId: "", note: "" });
      setReservationItems([]);
      setCustomerSearch("");
      setCustomerResults([]);
      addToast("Solicitacao de reserva enviada", "success");
      loadReservations();
    } catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  const approveReservation = async (id) => {
    setSubmitting(true);
    try { await apiFetch(`/api/inventory/reservations/${id}/approve`, { method: "POST" }); addToast("Reserva aprovada", "success"); loadReservations(); loadOverview(); }
    catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  const rejectReservation = async (id) => {
    const reason = window.prompt("Motivo da rejeicao:");
    if (!reason) return;
    setSubmitting(true);
    try { await apiFetch(`/api/inventory/reservations/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }); addToast("Reserva rejeitada", "warning"); loadReservations(); }
    catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  const cancelReservation = async (id) => {
    setSubmitting(true);
    try { await apiFetch(`/api/inventory/reservations/${id}/cancel`, { method: "POST" }); addToast("Reserva cancelada", "warning"); loadReservations(); loadOverview(); }
    catch (err) { addToast(err.message, "error"); }
    setSubmitting(false);
  };

  const fulfillReservation = async (id) => {
    setSubmitting(true);
    try { await apiFetch(`/api/inventory/reservations/${id}/fulfill`, { method: "POST" }); addToast("Reserva finalizada", "success"); loadReservations(); loadOverview(); }
    catch (err) { addToast(err.message, "error"); }
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
  const transferOriginStores = allStores.filter((s) => !storeId || s.id !== storeId);
  const transferStatusLabel = { DRAFT: "Rascunho", SENT: "Enviado", RECEIVED: "Recebido", CANCELED: "Cancelado" };
  const summarizeTransferItems = (items = []) => {
    const grouped = {};
    for (const it of items) {
      if (!it?.productId) continue;
      const key = it.productId;
      if (!grouped[key]) {
        grouped[key] = {
          productId: key,
          productName: it.product?.name || "Produto",
          quantity: 0,
        };
      }
      grouped[key].quantity += Number(it.quantity || 0);
    }
    return Object.values(grouped).sort((a, b) => a.productName.localeCompare(b.productName));
  };
  const getTransferSendRow = (transferId, item) => {
    const key = `${transferId}:${item.productId}`;
    const row = transferSendDraft[key];
    if (row) return row;
    return {
      selected: true,
      quantity: Number(item.quantity || 0),
    };
  };

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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    selectReceiveProductByBarcode();
                  }
                }}
                placeholder="Buscar produto..."
                className={inputClass}
              />
              <p className="text-xs text-gray-500">Leitor de codigo de barras: escaneie o EAN e pressione Enter.</p>
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

      {tab === "transfers" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center gap-2">
              <Truck size={18} className="text-gray-400" />
              <h3 className="font-semibold text-gray-900">Solicitar Transferencia</h3>
            </CardHeader>
            <CardBody className="space-y-3 max-w-2xl">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Loja origem</label>
                <select
                  value={transferForm.originStoreId}
                  onChange={(e) => {
                    setTransferForm({ ...transferForm, originStoreId: e.target.value });
                    setTransferSelectedIds([]);
                  }}
                  className={inputClass}
                >
                  <option value="">Selecione...</option>
                  {transferOriginStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Itens</label>
                <input
                  value={transferSearch}
                  onChange={(e) => { setTransferSearch(e.target.value); searchTransferProducts(e.target.value); }}
                  placeholder="Buscar produto..."
                  className={inputClass}
                />
                {transferProducts.length > 0 && (
                  <div className="space-y-2">
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
                      {transferProducts.map((p) => {
                        const available = getAvailableForStore(p.stores, transferForm.originStoreId);
                        const checked = transferSelectedIds.includes(p.id);
                        const disabled = !transferForm.originStoreId || available < 1;
                        return (
                          <label key={p.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${disabled ? "bg-gray-50 text-gray-400" : "hover:bg-gray-50 cursor-pointer"}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={(e) => {
                                setTransferSelectedIds((prev) => e.target.checked
                                  ? [...prev, p.id]
                                  : prev.filter((id) => id !== p.id));
                              }}
                            />
                            <span className="flex-1">{p.name}</span>
                            <span className={`text-xs ${available > 0 ? "text-emerald-700" : "text-red-600"}`}>
                              Disp.: {available}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={addSelectedTransferItems} disabled={transferSelectedIds.length === 0 || !transferForm.originStoreId}>
                        <Plus size={14} /> Adicionar selecionados
                      </Button>
                    </div>
                  </div>
                )}
                {transferItems.length > 0 && (
                  <div className="space-y-1">
                    {transferItems.map((it, idx) => (
                      <div key={it.productId} className="flex items-center gap-2">
                        <span className="flex-1 text-sm">{it.productName}</span>
                        <span className="text-xs text-gray-500">Disp.: {getAvailableForStore(it.stores, transferForm.originStoreId)}</span>
                        <input
                          type="number"
                          min="1"
                          max={Math.max(1, getAvailableForStore(it.stores, transferForm.originStoreId))}
                          value={it.quantity}
                          onChange={(e) => {
                            const requested = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setTransferItems((prev) => prev.map((x, i) => {
                              if (i !== idx) return x;
                              const available = getAvailableForStore(x.stores, transferForm.originStoreId);
                              return { ...x, quantity: Math.min(available || 1, requested) };
                            }));
                          }}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                        />
                        <button onClick={() => setTransferItems((prev) => prev.filter((_, i) => i !== idx))} className="text-xs text-red-600">remover</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Observacao</label>
                <input value={transferForm.note} onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })} className={inputClass} />
              </div>
              <Button loading={submitting} onClick={createTransfer} disabled={!transferForm.originStoreId || transferItems.length === 0}>
                <Plus size={16} /> Solicitar Transferencia
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Transferencias</h3>
              <Button variant="secondary" onClick={loadTransfers}>Atualizar</Button>
            </CardHeader>
            {flowLoading ? <PageSpinner /> : (
              <div className="divide-y divide-gray-100">
                {transfers.map((t) => (
                  <div key={t.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{t.originStore?.name} → {t.destinationStore?.name}</p>
                        <p className="text-xs text-gray-500">{formatDateTime(t.createdAt)} • {t.items?.length || 0} item(ns)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color={t.status === "RECEIVED" ? "green" : t.status === "SENT" ? "blue" : t.status === "CANCELED" ? "red" : "gray"}>{transferStatusLabel[t.status] || t.status}</Badge>
                        {canFlowOperate && t.originStore?.id === storeId && t.status === "DRAFT" && <Button size="sm" onClick={() => sendTransfer(t.id)}>Enviar</Button>}
                        {canFlowOperate && t.destinationStore?.id === storeId && t.status === "SENT" && <Button size="sm" onClick={() => receiveTransfer(t.id)}>Receber</Button>}
                        {t.originStore?.id === storeId && t.status === "DRAFT" && <Button size="sm" variant="secondary" onClick={() => cancelTransfer(t.id)}>Cancelar</Button>}
                      </div>
                    </div>
                    {(() => {
                      const groupedItems = summarizeTransferItems(t.items || []);
                      if (groupedItems.length === 0) return null;
                      const isRequestedStore = t.originStore?.id === storeId;
                      const isRequesterStore = t.destinationStore?.id === storeId;
                      const label = isRequestedStore
                        ? "Itens solicitados"
                        : isRequesterStore
                          ? "Itens transferidos"
                          : "Itens";
                      return (
                        <div className="mt-2 pl-0.5">
                          <p className="text-xs font-medium text-gray-600">{label}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {groupedItems.map((it) => (
                              <span key={`${t.id}-${it.productId}`} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                                <span>{it.productName}</span>
                                <span className="font-semibold">x{it.quantity}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {canFlowOperate && t.originStore?.id === storeId && t.status === "DRAFT" && (
                      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">
                        <p className="text-xs font-medium text-gray-700">Envio: selecione itens e quantidade</p>
                        {summarizeTransferItems(t.items || []).map((it) => {
                          const key = `${t.id}:${it.productId}`;
                          const row = getTransferSendRow(t.id, it);
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={!!row.selected}
                                onChange={(e) => setTransferSendDraft((prev) => ({
                                  ...prev,
                                  [key]: { ...row, selected: e.target.checked },
                                }))}
                              />
                              <span className="flex-1 text-sm text-gray-700">{it.productName}</span>
                              <span className="text-xs text-gray-500">Solic.: {it.quantity}</span>
                              <input
                                type="number"
                                min="0"
                                max={Math.max(1, Number(it.quantity || 0))}
                                value={row.quantity}
                                onChange={(e) => {
                                  const next = Math.max(0, Math.min(Number(it.quantity || 0), parseInt(e.target.value, 10) || 0));
                                  setTransferSendDraft((prev) => ({
                                    ...prev,
                                    [key]: { ...row, quantity: next },
                                  }));
                                }}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {transfers.length === 0 && <div className="px-4 py-6 text-sm text-gray-400 text-center">Nenhuma transferencia</div>}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "reservations" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center gap-2">
              <BookmarkCheck size={18} className="text-gray-400" />
              <h3 className="font-semibold text-gray-900">Solicitar Reserva</h3>
            </CardHeader>
            <CardBody className="space-y-3 max-w-2xl">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Loja que vai reservar</label>
                <select value={reservationForm.sourceStoreId} onChange={(e) => setReservationForm({ ...reservationForm, sourceStoreId: e.target.value })} className={inputClass}>
                  <option value="">Selecione...</option>
                  {allStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Cliente</label>
                <input value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); searchCustomers(e.target.value); }} placeholder="Buscar cliente por nome/CPF..." className={inputClass} />
                {customerResults.length > 0 && (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-32 overflow-y-auto">
                    {customerResults.map((c) => (
                      <button key={c.id} onClick={() => { setReservationForm({ ...reservationForm, customerId: c.id }); setCustomerSearch(c.name); setCustomerResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">{c.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Itens</label>
                <input value={reservationSearch} onChange={(e) => { setReservationSearch(e.target.value); searchReservationProducts(e.target.value); }} placeholder="Buscar produto..." className={inputClass} />
                {reservationProducts.length > 0 && (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-36 overflow-y-auto">
                    {reservationProducts.map((p) => (
                      <button key={p.id} onClick={() => addReservationItem(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">{p.name}</button>
                    ))}
                  </div>
                )}
                {reservationItems.length > 0 && (
                  <div className="space-y-1">
                    {reservationItems.map((it, idx) => (
                      <div key={it.productId} className="flex items-center gap-2">
                        <span className="flex-1 text-sm">{it.productName}</span>
                        <input type="number" min="1" value={it.quantity} onChange={(e) => setReservationItems((prev) => prev.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, parseInt(e.target.value) || 1) } : x))} className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center" />
                        <button onClick={() => setReservationItems((prev) => prev.filter((_, i) => i !== idx))} className="text-xs text-red-600">remover</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button loading={submitting} onClick={createReservation} disabled={!reservationForm.sourceStoreId || !reservationForm.customerId || reservationItems.length === 0}>
                <Plus size={16} /> Solicitar Reserva
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Reservas</h3>
              <Button variant="secondary" onClick={loadReservations}>Atualizar</Button>
            </CardHeader>
            {flowLoading ? <PageSpinner /> : (
              <div className="divide-y divide-gray-100">
                {reservations.map((r) => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.customer?.name || "Sem cliente"} • {r.sourceStore?.name}</p>
                        <p className="text-xs text-gray-500">{formatDateTime(r.createdAt)} • {r.items?.length || 0} item(ns)</p>
                        {r.rejectReason && <p className="text-xs text-red-600">Motivo rejeicao: {r.rejectReason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color={r.status === "APPROVED" ? "green" : r.status === "REQUESTED" ? "yellow" : r.status === "REJECTED" ? "red" : "gray"}>{r.status}</Badge>
                        {canFlowOperate && r.status === "REQUESTED" && (
                          <>
                            <Button size="sm" onClick={() => approveReservation(r.id)}>Aprovar</Button>
                            <Button size="sm" variant="secondary" onClick={() => rejectReservation(r.id)}>Rejeitar</Button>
                          </>
                        )}
                        {r.status === "APPROVED" && <Button size="sm" variant="secondary" onClick={() => fulfillReservation(r.id)}>Finalizar</Button>}
                        {["REQUESTED", "APPROVED"].includes(r.status) && <Button size="sm" variant="secondary" onClick={() => cancelReservation(r.id)}>Cancelar</Button>}
                      </div>
                    </div>
                  </div>
                ))}
                {reservations.length === 0 && <div className="px-4 py-6 text-sm text-gray-400 text-center">Nenhuma reserva</div>}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Edit Lot Modal */}
      <Modal open={!!transferSendConfirm} onClose={() => setTransferSendConfirm(null)} title="Confirmar Envio de Transferencia">
        {transferSendConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Confirme as quantidades que serao enviadas:</p>
            <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {transferSendConfirm.rows.map((row) => (
                <div key={row.productId} className="px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-gray-800">{row.productName}</span>
                  <span className="font-semibold text-gray-900">Qtd: {row.quantity}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={() => setTransferSendConfirm(null)}>Cancelar</Button>
              <Button className="flex-1" loading={submitting} onClick={confirmSendTransfer}>Confirmar Envio</Button>
            </div>
          </div>
        )}
      </Modal>

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
