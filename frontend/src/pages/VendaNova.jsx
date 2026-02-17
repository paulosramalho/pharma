import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { money, cpfMask, formatDate, whatsappMask } from "../lib/format";
import { useToast } from "../contexts/ToastContext";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";
import { Search, Trash2, ShoppingCart, X, UserPlus, User, Plus, Tag, Pencil, Check } from "lucide-react";

export default function VendaNova() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchRef = useRef(null);

  const [sale, setSale] = useState(null);
  const [creating, setCreating] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Edit item
  const [editingItem, setEditingItem] = useState(null); // { id, quantity }

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [addQty, setAddQty] = useState(1);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  // Customer/CPF
  const [cpfInput, setCpfInput] = useState("");
  const [customerFound, setCustomerFound] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", birthDate: "", whatsapp: "" });
  const [searchingCpf, setSearchingCpf] = useState(false);

  // Resume existing draft if ?resume=id is in URL
  useEffect(() => {
    const resumeId = searchParams.get("resume");
    if (resumeId) {
      setCreating(true);
      apiFetch(`/api/sales/${resumeId}`)
        .then((res) => {
          setSale(res.data);
          if (res.data?.customer) {
            setCustomerFound(res.data.customer);
            setCpfInput(res.data.customer.document || "");
          }
        })
        .catch((err) => { addToast(err.message, "error"); navigate("/vendas"); })
        .finally(() => setCreating(false));
    }
  }, []);

  // Ensure a draft exists (lazy — created on first action, not on mount)
  const ensureDraft = async () => {
    if (sale) return sale;
    const s = await createDraft();
    return s;
  };

  const createDraft = async () => {
    setCreating(true);
    try {
      const res = await apiFetch("/api/sales", { method: "POST", body: JSON.stringify({}) });
      setSale(res.data);
      setCpfInput("");
      setCustomerFound(null);
      setShowNewCustomer(false);
      setNewCustomer({ name: "", birthDate: "", whatsapp: "" });
      setProductSearch("");
      setProducts([]);
      setSelectedProduct(null);
      setAddQty(1);
      setCreating(false);
      return res.data;
    } catch (err) {
      addToast(err.message, "error");
      navigate("/vendas");
      setCreating(false);
      return null;
    }
  };

  // CPF search
  const handleCpfChange = async (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    setCpfInput(digits);
    setCustomerFound(null);
    setShowNewCustomer(false);

    if (digits.length === 11) {
      setSearchingCpf(true);
      try {
        const res = await apiFetch(`/api/customers?search=${digits}`);
        const list = res.data?.customers || [];
        if (list.length > 0) {
          setCustomerFound(list[0]);
          // Link customer to sale (ensure draft exists)
          const s = await ensureDraft();
          if (s) await apiFetch(`/api/sales/${s.id}`, {
            method: "PUT",
            body: JSON.stringify({ customerId: list[0].id }),
          }).then((r) => setSale(r.data));
          addToast(`Cliente: ${list[0].name}`, "success", 2000);
        } else {
          setShowNewCustomer(true);
        }
      } catch { /* ignore */ }
      setSearchingCpf(false);
    }
  };

  const createCustomer = async () => {
    if (!newCustomer.name) { addToast("Nome obrigatório", "warning"); return; }
    try {
      const res = await apiFetch("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          name: newCustomer.name,
          document: cpfInput,
          birthDate: newCustomer.birthDate || null,
          whatsapp: newCustomer.whatsapp || null,
        }),
      });
      setCustomerFound(res.data);
      setShowNewCustomer(false);
      // Link to sale (ensure draft exists)
      const s = await ensureDraft();
      if (s) await apiFetch(`/api/sales/${s.id}`, {
        method: "PUT",
        body: JSON.stringify({ customerId: res.data.id }),
      }).then((r) => setSale(r.data));
      addToast(`Cliente cadastrado: ${res.data.name}`, "success");
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  // Product search
  const searchProducts = async (q) => {
    if (q.length < 2) { setProducts([]); return; }
    try {
      const res = await apiFetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`);
      setProducts(res.data.products || []);
    } catch { /* ignore */ }
  };

  // Compute final price considering active discount
  const getDiscountedPrice = (product) => {
    const base = Number(product.prices?.[0]?.price || 0);
    const d = product.discounts?.[0];
    if (!d || !d.active) return { base, final: base, discount: null };
    const now = new Date();
    if (d.endDate && new Date(d.endDate) < now) return { base, final: base, discount: null };
    const discounted = d.type === "PERCENT"
      ? base * (1 - Number(d.value) / 100)
      : Math.max(0, base - Number(d.value));
    return { base, final: Math.round(discounted * 100) / 100, discount: d };
  };

  const selectProduct = (product) => {
    setSelectedProduct(product);
    setAddQty(1);
    setProductSearch("");
    setProducts([]);
    setHighlightIdx(-1);
  };

  const addItem = async () => {
    if (!selectedProduct || addQty < 1) return;
    try {
      const s = await ensureDraft();
      if (!s) return;
      const res = await apiFetch(`/api/sales/${s.id}/items`, {
        method: "POST",
        body: JSON.stringify({ productId: selectedProduct.id, quantity: addQty }),
      });
      setSale(res.data);
      setSelectedProduct(null);
      setAddQty(1);
      searchRef.current?.focus();
      addToast(`${selectedProduct.name} x${addQty} adicionado`, "success", 2000);
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const removeItem = async (itemId) => {
    try {
      const res = await apiFetch(`/api/sales/${sale.id}/items/${itemId}`, { method: "DELETE" });
      setSale(res.data);
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const updateItem = async (itemId, newQty) => {
    if (!newQty || newQty < 1) return;
    try {
      const res = await apiFetch(`/api/sales/${sale.id}/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity: newQty }),
      });
      setSale(res.data);
      setEditingItem(null);
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const confirmSale = async () => {
    try {
      await apiFetch(`/api/sales/${sale.id}/confirm`, { method: "POST" });
      addToast("Venda confirmada! Dirija-se ao caixa para pagamento.", "success");
      navigate("/vendas");
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const cancelSale = async (reason) => {
    try {
      await apiFetch(`/api/sales/${sale.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || undefined }),
      });
      addToast("Venda cancelada", "warning");
      setCancelModal(false);
      navigate("/vendas");
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  if (creating) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const items = sale?.items || [];
  const isDraft = !sale || sale.status === "DRAFT";
  const isConfirmed = sale?.status === "CONFIRMED";

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nova Venda</h1>
          <p className="text-sm text-gray-500">{sale ? `Venda #${sale.number} — ${sale.status}` : "Nova venda"}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate("/vendas")}><X size={16} /> Fechar</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Customer + Product search + Items */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer / CPF */}
          {isDraft && (
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-2">
                  <User size={16} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Cliente</span>
                </div>

                {customerFound ? (
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-emerald-800">{customerFound.name}</p>
                      <p className="text-xs text-emerald-600">CPF: {cpfMask(customerFound.document)}</p>
                    </div>
                    <button
                      onClick={() => {
                        setCustomerFound(null);
                        setCpfInput("");
                        if (sale) apiFetch(`/api/sales/${sale.id}`, { method: "PUT", body: JSON.stringify({ customerId: null }) })
                          .then((r) => setSale(r.data));
                      }}
                      className="text-xs text-gray-500 hover:text-red-600"
                    >
                      Alterar
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        value={cpfMask(cpfInput)}
                        onChange={(e) => handleCpfChange(e.target.value)}
                        placeholder="CPF do cliente (opcional)"
                        className={inputClass}
                      />
                      {searchingCpf && (
                        <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      )}
                    </div>
                    {showNewCustomer && (
                      <div className="mt-3 p-3 border border-amber-200 bg-amber-50 rounded-lg space-y-2">
                        <p className="text-xs font-medium text-amber-800 flex items-center gap-1">
                          <UserPlus size={14} /> Cliente não encontrado — cadastrar novo
                        </p>
                        <input
                          value={newCustomer.name}
                          onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                          placeholder="Nome completo *"
                          className={inputClass}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={newCustomer.birthDate}
                            onChange={(e) => setNewCustomer({ ...newCustomer, birthDate: e.target.value })}
                            className={inputClass}
                            title="Data de nascimento"
                          />
                          <input
                            value={whatsappMask(newCustomer.whatsapp)}
                            onChange={(e) => setNewCustomer({ ...newCustomer, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                            placeholder="WhatsApp (opcional)"
                            className={inputClass}
                          />
                        </div>
                        <Button size="sm" onClick={createCustomer}>
                          <UserPlus size={14} /> Cadastrar
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          )}

          {/* Product Search */}
          {isDraft && (
            <Card>
              <CardBody>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={searchRef}
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); searchProducts(e.target.value); setHighlightIdx(-1); }}
                    onKeyDown={(e) => {
                      if (!products.length || selectedProduct) return;
                      if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx((i) => Math.min(i + 1, products.length - 1)); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx((i) => Math.max(i - 1, 0)); }
                      else if (e.key === "Enter" && highlightIdx >= 0) { e.preventDefault(); selectProduct(products[highlightIdx]); }
                      else if (e.key === "Escape") { setProducts([]); setHighlightIdx(-1); }
                    }}
                    placeholder="Buscar produto por nome ou EAN..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                </div>

                {/* Search results */}
                {products.length > 0 && !selectedProduct && (
                  <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
                    {products.map((p, idx) => {
                      const dp = getDiscountedPrice(p);
                      return (
                        <button
                          key={p.id}
                          onClick={() => selectProduct(p)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left ${
                            idx === highlightIdx ? "bg-primary-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{p.name}</span>
                            <span className="text-gray-400 text-xs">{p.ean}</span>
                            {dp.discount && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">
                                <Tag size={10} />
                                {dp.discount.type === "PERCENT" ? `${Number(dp.discount.value)}%` : money(dp.discount.value)}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            {dp.discount ? (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400 line-through text-xs">{money(dp.base)}</span>
                                <span className="text-emerald-600 font-bold">{money(dp.final)}</span>
                              </div>
                            ) : (
                              <span className="text-primary-600 font-medium">{money(dp.base)}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selected product: qty input + add button */}
                {selectedProduct && (() => {
                  const dp = getDiscountedPrice(selectedProduct);
                  return (
                    <div className={`mt-3 p-3 border rounded-lg ${dp.discount ? "bg-amber-50 border-amber-200" : "bg-primary-50 border-primary-200"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{selectedProduct.name}</p>
                          <p className="text-xs text-gray-500">
                            Valor unit.:{" "}
                            {dp.discount ? (
                              <>
                                <span className="line-through text-gray-400 mr-1">{money(dp.base)}</span>
                                <span className="font-bold text-emerald-600">{money(dp.final)}</span>
                                <span className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">
                                  <Tag size={9} />
                                  {dp.discount.type === "PERCENT" ? `-${Number(dp.discount.value)}%` : `-${money(dp.discount.value)}`}
                                </span>
                              </>
                            ) : (
                              <span className="font-medium text-primary-700">{money(dp.base)}</span>
                            )}
                          </p>
                        </div>
                        <button onClick={() => setSelectedProduct(null)} className="text-gray-400 hover:text-gray-600">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Qtd:</label>
                        <input
                          type="number"
                          min="1"
                          value={addQty}
                          onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-20 px-2 py-1.5 text-sm text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          onKeyDown={(e) => e.key === "Enter" && addItem()}
                          autoFocus
                        />
                        <span className="text-sm text-gray-500">
                          = {money(dp.final * addQty)}
                        </span>
                        <Button size="sm" onClick={addItem} className="ml-auto">
                          <Plus size={14} /> Adicionar
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </CardBody>
            </Card>
          )}

          {/* Items table */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Itens ({items.length})</h3>
            </CardHeader>
            {items.length === 0 ? (
              <CardBody>
                <p className="text-sm text-gray-400 text-center py-4">Busque e adicione produtos acima</p>
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Produto</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">Qtd</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">Unit.</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase text-right">Subtotal</th>
                      {isDraft && <th className="px-4 py-2 w-10" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item) => {
                      const hasDiscount = item.priceOriginal && Number(item.priceOriginal) > Number(item.priceUnit);
                      return (
                      <tr key={item.id} className={hasDiscount ? "bg-amber-50/50 hover:bg-amber-50" : "hover:bg-gray-50"}>
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {item.product?.name || "—"}
                          {hasDiscount && <Tag size={12} className="inline ml-1.5 text-amber-500" />}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {editingItem?.id === item.id ? (
                            <input
                              type="number"
                              min="1"
                              value={editingItem.quantity}
                              onChange={(e) => setEditingItem({ ...editingItem, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") updateItem(item.id, editingItem.quantity);
                                if (e.key === "Escape") setEditingItem(null);
                              }}
                              className="w-16 px-1 py-0.5 text-sm text-center border border-primary-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                              autoFocus
                            />
                          ) : (
                            item.quantity
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {hasDiscount ? (
                            <span>
                              <span className="text-gray-400 line-through text-xs mr-1">{money(item.priceOriginal)}</span>
                              <span className="text-emerald-600 font-medium">{money(item.priceUnit)}</span>
                            </span>
                          ) : money(item.priceUnit)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">{money(item.subtotal)}</td>
                        {isDraft && (
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              {editingItem?.id === item.id ? (
                                <>
                                  <button onClick={() => updateItem(item.id, editingItem.quantity)} className="text-emerald-500 hover:text-emerald-700" title="Confirmar">
                                    <Check size={14} />
                                  </button>
                                  <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-600" title="Cancelar">
                                    <X size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => setEditingItem({ id: item.id, quantity: item.quantity })} className="text-gray-400 hover:text-primary-600" title="Editar">
                                    <Pencil size={14} />
                                  </button>
                                  <button onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-red-600" title="Remover">
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right: Summary */}
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <h3 className="font-semibold text-gray-900">Resumo</h3>

              {sale?.customer && (
                <div className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Cliente</p>
                  <p className="text-sm font-medium text-gray-900">{sale.customer.name}</p>
                  {sale.customer.document && (
                    <p className="text-xs text-gray-500">CPF: {cpfMask(sale.customer.document)}</p>
                  )}
                </div>
              )}

              {(() => {
                const originalSubtotal = items.reduce((s, i) => {
                  const orig = i.priceOriginal && Number(i.priceOriginal) > 0 ? Number(i.priceOriginal) : Number(i.priceUnit);
                  return s + orig * i.quantity;
                }, 0);
                const discountTotal = originalSubtotal - Number(sale?.total || 0);
                return (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span>{money(originalSubtotal)}</span>
                    </div>
                    {discountTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-600 flex items-center gap-1"><Tag size={12} /> Desconto</span>
                        <span className="text-amber-600 font-medium">-{money(discountTotal)}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-primary-600">{money(sale?.total || 0)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                {isDraft && sale && items.length > 0 && (
                  <Button className="w-full" onClick={confirmSale}>
                    <ShoppingCart size={16} /> Confirmar Venda
                  </Button>
                )}
                {isDraft && sale && (
                  <Button variant="danger" className="w-full" onClick={() => cancelSale()}>
                    Cancelar Venda
                  </Button>
                )}
                {isConfirmed && (
                  <>
                    <div className="p-3 bg-emerald-50 rounded-lg text-center">
                      <Badge color="green">Confirmada</Badge>
                      <p className="text-sm text-emerald-700 mt-1">Dirija-se ao caixa para pagamento</p>
                    </div>
                    <Button className="w-full" onClick={() => createDraft()}>
                      <ShoppingCart size={16} /> Nova Venda
                    </Button>
                    <Button variant="danger" className="w-full" onClick={() => { setCancelReason(""); setCancelModal(true); }}>
                      Cancelar Venda
                    </Button>
                    <Button variant="secondary" className="w-full" onClick={() => navigate("/vendas")}>
                      Voltar
                    </Button>
                  </>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Cancel reason modal (for confirmed sales) */}
      <Modal open={cancelModal} onClose={() => setCancelModal(false)} title="Cancelar Venda Confirmada">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Informe o motivo do cancelamento:</p>
          <input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Motivo do cancelamento..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCancelModal(false)}>Voltar</Button>
            <Button variant="danger" className="flex-1" disabled={!cancelReason.trim()} onClick={() => cancelSale(cancelReason)}>
              Confirmar Cancelamento
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
