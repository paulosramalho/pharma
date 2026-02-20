import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { money, formatDate, moneyMask, parseMoney, parseDateNoon } from "../lib/format";
import { useToast } from "../contexts/ToastContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Badge from "../components/ui/Badge";
import Table, { Pagination } from "../components/ui/Table";
import EmptyState from "../components/ui/EmptyState";
import { PageSpinner } from "../components/ui/Spinner";
import { Pill, Plus, Search, Pencil, Tag } from "lucide-react";

const emptyForm = { name: "", ean: "", brand: "", categoryId: "", controlled: false, price: "" };
const emptyDiscountForm = { type: "PERCENT", value: "", startDate: "", endDate: "" };

export default function Produtos() {
  const { addToast } = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Discount state
  const [discountModal, setDiscountModal] = useState(null); // product object
  const [discountForm, setDiscountForm] = useState(emptyDiscountForm);
  const [discountHistory, setDiscountHistory] = useState([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [submittingDiscount, setSubmittingDiscount] = useState(false);

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (search) params.set("search", search);
    apiFetch(`/api/products?${params}`)
      .then((res) => { setProducts(res.data.products || []); setTotalPages(res.data.totalPages || 1); })
      .catch((err) => addToast(err.message, "error"))
      .finally(() => setLoading(false));
  };

  const searchByBarcode = async (code) => {
    const clean = code.replace(/\D/g, "").trim();
    if (!/^\d{8,14}$/.test(clean)) return;
    setSearch(clean);
    setPage(1);
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: 1, limit: 20, search: clean });
      const res = await apiFetch(`/api/products?${params}`);
      setProducts(res.data.products || []);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);
  useEffect(() => {
    apiFetch("/api/categories").then((res) => setCategories(res.data || [])).catch(() => {});
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditId(null);
    setModal(true);
  };

  const openEdit = (product) => {
    setForm({
      name: product.name,
      ean: product.ean || "",
      brand: product.brand || "",
      categoryId: product.categoryId || "",
      controlled: product.controlled || false,
      price: product.prices?.[0]?.price?.toString() || "",
    });
    setEditId(product.id);
    setModal(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body = {
        name: form.name,
        ean: form.ean || undefined,
        brand: form.brand || undefined,
        categoryId: form.categoryId || undefined,
        controlled: form.controlled,
        price: form.price ? parseFloat(form.price) : undefined,
      };
      if (editId) {
        await apiFetch(`/api/products/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        addToast("Produto atualizado!", "success");
      } else {
        await apiFetch("/api/products", { method: "POST", body: JSON.stringify(body) });
        addToast("Produto criado!", "success");
      }
      setModal(false);
      load();
    } catch (err) {
      addToast(err.message, "error");
    }
    setSubmitting(false);
  };

  // ─── Discount handlers ───
  const openDiscount = async (product) => {
    setDiscountModal(product);
    setDiscountForm(emptyDiscountForm);
    setLoadingDiscounts(true);
    try {
      const res = await apiFetch(`/api/discounts?productId=${product.id}`);
      setDiscountHistory(res.data || []);
    } catch { setDiscountHistory([]); }
    setLoadingDiscounts(false);
  };

  const submitDiscount = async () => {
    if (!discountForm.value) { addToast("Informe o valor do desconto", "warning"); return; }
    setSubmittingDiscount(true);
    try {
      await apiFetch("/api/discounts", {
        method: "POST",
        body: JSON.stringify({
          productId: discountModal.id,
          type: discountForm.type,
          value: parseFloat(discountForm.value),
          startDate: discountForm.startDate || undefined,
          endDate: discountForm.endDate || undefined,
        }),
      });
      addToast("Desconto aplicado!", "success");
      // Reload discounts and products
      const res = await apiFetch(`/api/discounts?productId=${discountModal.id}`);
      setDiscountHistory(res.data || []);
      setDiscountForm(emptyDiscountForm);
      load();
    } catch (err) { addToast(err.message, "error"); }
    setSubmittingDiscount(false);
  };

  const removeDiscount = async (discountId) => {
    try {
      await apiFetch(`/api/discounts/${discountId}`, { method: "DELETE" });
      addToast("Desconto removido!", "success");
      const res = await apiFetch(`/api/discounts?productId=${discountModal.id}`);
      setDiscountHistory(res.data || []);
      load();
    } catch (err) { addToast(err.message, "error"); }
  };

  const getActiveDiscount = (product) => {
    const d = product.discounts?.[0];
    if (!d || !d.active) return null;
    const now = parseDateNoon(new Date());
    if (d.endDate && parseDateNoon(d.endDate) < now) return null;
    return d;
  };

  const columns = [
    { key: "name", label: "Nome", render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: "ean", label: "EAN", render: (r) => <span className="font-mono text-xs text-gray-500">{r.ean || "—"}</span> },
    { key: "brand", label: "Marca", render: (r) => r.brand || "—" },
    { key: "category", label: "Categoria", render: (r) => r.category?.name || "—" },
    { key: "price", label: "Preço", className: "text-right", render: (r) => {
      const price = r.prices?.[0]?.price;
      return price != null ? money(price) : "—";
    }},
    { key: "discount", label: "Desconto", render: (r) => {
      const d = getActiveDiscount(r);
      if (!d) return <span className="text-gray-400 text-xs">—</span>;
      return (
        <Badge color="amber">
          {d.type === "PERCENT" ? `${Number(d.value)}%` : money(d.value)}
          {d.endDate && <span className="ml-1 text-[10px]">até {formatDate(d.endDate)}</span>}
        </Badge>
      );
    }},
    { key: "controlled", label: "Controlado", render: (r) => r.controlled ? <Badge color="red">Sim</Badge> : <Badge color="gray">Não</Badge> },
    { key: "actions", label: "", className: "w-20", render: (r) => (
      <div className="flex items-center gap-1">
        <button onClick={() => openDiscount(r)} className="p-1 text-gray-400 hover:text-amber-600 rounded" title="Descontos">
          <Tag size={14} />
        </button>
        <button onClick={() => openEdit(r)} className="p-1 text-gray-400 hover:text-primary-600 rounded" title="Editar">
          <Pencil size={14} />
        </button>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
        <Button onClick={openCreate}><Plus size={16} /> Novo Produto</Button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setPage(1); load(); }} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou EAN..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const clean = search.replace(/\D/g, "").trim();
                if (/^\d{8,14}$/.test(clean)) {
                  e.preventDefault();
                  searchByBarcode(clean);
                }
              }
            }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>
      <p className="text-xs text-gray-500">Leitor de codigo de barras: no campo de busca, escaneie o EAN e pressione Enter.</p>

      <Card>
        {loading ? <PageSpinner /> : products.length === 0 ? (
          <EmptyState icon={Pill} title="Nenhum produto" description="Cadastre seu primeiro produto." />
        ) : (
          <>
            <Table columns={columns} data={products} />
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Editar Produto" : "Novo Produto"}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Nome *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">EAN</label>
              <input value={form.ean} onChange={(e) => setForm({ ...form, ean: e.target.value.replace(/\D/g, "").slice(0, 14) })} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Marca</label>
              <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Categoria</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={inputClass}>
                <option value="">Selecione...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Preço (R$)</label>
              <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.controlled} onChange={(e) => setForm({ ...form, controlled: e.target.checked })}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" />
            <span className="text-sm text-gray-700">Medicamento controlado</span>
          </label>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={submitting} onClick={handleSubmit} disabled={!form.name}>
              {editId ? "Salvar" : "Criar"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Discount Modal */}
      <Modal open={!!discountModal} onClose={() => setDiscountModal(null)} title={`Descontos — ${discountModal?.name || ""}`} size="lg">
        {discountModal && (
          <div className="space-y-5">
            {/* New discount form */}
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <p className="text-sm font-medium text-gray-700">Novo Desconto</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">Tipo</label>
                  <select value={discountForm.type} onChange={(e) => setDiscountForm({ ...discountForm, type: e.target.value })} className={inputClass}>
                    <option value="PERCENT">Percentual (%)</option>
                    <option value="FIXED">Valor Fixo (R$)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">
                    {discountForm.type === "PERCENT" ? "Percentual (%)" : "Valor (R$)"}
                  </label>
                  <input
                    type="number" step="0.01" min="0"
                    value={discountForm.value}
                    onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })}
                    placeholder={discountForm.type === "PERCENT" ? "Ex: 10" : "Ex: 5.00"}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">Inicio (opcional)</label>
                  <input type="date" value={discountForm.startDate} onChange={(e) => setDiscountForm({ ...discountForm, startDate: e.target.value })} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">Fim (vazio = indefinido)</label>
                  <input type="date" value={discountForm.endDate} onChange={(e) => setDiscountForm({ ...discountForm, endDate: e.target.value })} className={inputClass} />
                </div>
              </div>
              <Button size="sm" loading={submittingDiscount} onClick={submitDiscount} disabled={!discountForm.value}>
                <Tag size={14} /> Aplicar Desconto
              </Button>
            </div>

            {/* Discount history */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Historico de Descontos</p>
              {loadingDiscounts ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : discountHistory.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum desconto cadastrado</p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {discountHistory.map((d) => {
                    const isActive = d.active && (!d.endDate || parseDateNoon(d.endDate) >= parseDateNoon(new Date()));
                    return (
                      <div key={d.id} className={`flex items-center gap-3 px-4 py-2.5 ${isActive ? "bg-amber-50" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {d.type === "PERCENT" ? `${Number(d.value)}%` : money(d.value)}
                            </span>
                            {isActive ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge>}
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatDate(d.startDate)}
                            {d.endDate ? ` — ${formatDate(d.endDate)}` : " — Indefinido"}
                          </p>
                        </div>
                        {isActive && (
                          <button onClick={() => removeDiscount(d.id)} className="text-xs text-red-600 hover:underline">Remover</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setDiscountModal(null)}>Fechar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
