import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "../lib/api";
import { money, cpfMask, formatDateTime, formatTime } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import MoneyInput from "../components/ui/MoneyInput";
import Badge from "../components/ui/Badge";
import { PageSpinner } from "../components/ui/Spinner";
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, DollarSign,
  CreditCard, ShoppingCart, ChevronDown, ChevronUp, Clock, User, XCircle, RefreshCw,
} from "lucide-react";

const MOVEMENT_LABELS = {
  RECEBIMENTO: { label: "Recebimento", color: "green", icon: ArrowDownCircle },
  SANGRIA: { label: "Sangria", color: "red", icon: ArrowUpCircle },
  SUPRIMENTO: { label: "Suprimento", color: "blue", icon: ArrowDownCircle },
  ESTORNO: { label: "Estorno", color: "yellow", icon: ArrowUpCircle },
  AJUSTE: { label: "Ajuste", color: "gray", icon: DollarSign },
};

const PAY_METHODS = [
  { key: "DINHEIRO", label: "Dinheiro" },
  { key: "CARTAO_CREDITO", label: "Cartão de Crédito" },
  { key: "CARTAO_DEBITO", label: "Cartão de Debito" },
  { key: "PIX", label: "PIX" },
];

export default function Caixa() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // Open modal
  const [openModal, setOpenModal] = useState(false);
  const [operatorMatricula, setOperatorMatricula] = useState("");
  const [operatorPassword, setOperatorPassword] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [initialCash, setInitialCash] = useState(0);
  const [operatorVerified, setOperatorVerified] = useState(false);
  const [verifyingOperator, setVerifyingOperator] = useState(false);

  // Close modal
  const [closeModal, setCloseModal] = useState(false);
  const [countedCash, setCountedCash] = useState(0);
  const [closeNote, setCloseNote] = useState("");

  // Movement modal
  const [movModal, setMovModal] = useState(null);
  const [movAmount, setMovAmount] = useState(0);
  const [movReason, setMovReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pending sales
  const [pendingSales, setPendingSales] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [expandedSale, setExpandedSale] = useState(null);
  const [saleItems, setSaleItems] = useState({});

  // Payment modal
  const [payModal, setPayModal] = useState(null);
  const [payMethod, setPayMethod] = useState("DINHEIRO");
  const [payAmount, setPayAmount] = useState(0);
  const [paying, setPaying] = useState(false);

  // Cancel modal
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  // Pending exchanges
  const [pendingExchanges, setPendingExchanges] = useState([]);
  const [settlingExchange, setSettlingExchange] = useState(null);

  // Clock update every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadSession = () => {
    setLoading(true);
    apiFetch("/api/cash/sessions/current")
      .then((res) => setSession(res.data))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  };

  const loadPendingSales = ({ silent = false } = {}) => {
    if (!silent) setLoadingPending(true);
    apiFetch("/api/sales?status=CONFIRMED&limit=100")
      .then((res) => setPendingSales(res.data?.sales || []))
      .catch(() => setPendingSales([]))
      .finally(() => {
        if (!silent) setLoadingPending(false);
      });
  };

  const loadPendingExchanges = () => {
    apiFetch("/api/sales?exchangePending=true&limit=100")
      .then((res) => setPendingExchanges(res.data?.sales || []))
      .catch(() => setPendingExchanges([]));
  };

  useEffect(() => { loadSession(); loadPendingSales(); loadPendingExchanges(); }, []);

  useEffect(() => {
    if (!session) return undefined;
    const interval = setInterval(() => {
      if (document.hidden) return;
      loadPendingSales({ silent: true });
      loadPendingExchanges();
    }, 10000);
    return () => clearInterval(interval);
  }, [session]);

  const submitCancelSale = async () => {
    if (!cancelReason.trim()) { addToast("Informe o motivo", "warning"); return; }
    try {
      await apiFetch(`/api/sales/${cancelModal.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason }),
      });
      addToast("Venda cancelada", "warning");
      setCancelModal(null);
      loadPendingSales();
    } catch (err) { addToast(err.message, "error"); }
  };

  const settleExchange = async (sale) => {
    setSettlingExchange(sale.id);
    try {
      await apiFetch(`/api/sales/${sale.id}/settle-exchange`, { method: "POST" });
      const bal = Number(sale.exchangeBalance);
      addToast(
        bal > 0
          ? `Recebido ${money(bal)} do cliente (Troca #${sale.number})`
          : `Devolvido ${money(Math.abs(bal))} ao cliente (Troca #${sale.number})`,
        "success"
      );
      loadPendingExchanges();
      loadSession();
    } catch (err) { addToast(err.message, "error"); }
    setSettlingExchange(null);
  };

  // Verify operator by matrícula + password
  const verifyOperator = async () => {
    if (!operatorMatricula || !operatorPassword) { addToast("Preencha matrícula e senha", "warning"); return; }
    setVerifyingOperator(true);
    try {
      const res = await apiFetch("/api/cash/operator-auth", {
        method: "POST",
        body: JSON.stringify({ matricula: operatorMatricula, password: operatorPassword }),
      });
      setOperatorName(res.data.name);
      setOperatorVerified(true);
      addToast(`Operador: ${res.data.name}`, "success", 2000);
    } catch (err) {
      addToast(err.message, "error");
      setOperatorVerified(false);
    }
    setVerifyingOperator(false);
  };

  const openSessionFn = async () => {
    if (!operatorVerified) { addToast("Verifique o operador primeiro", "warning"); return; }
    setSubmitting(true);
    try {
      await apiFetch("/api/cash/sessions/open", {
        method: "POST",
        body: JSON.stringify({ initialCash: initialCash || 0 }),
      });
      setOpenModal(false);
      resetOpenForm();
      addToast("Caixa aberto!", "success");
      loadSession();
      loadPendingSales();
    } catch (err) {
      addToast(err.message, "error");
    }
    setSubmitting(false);
  };

  const resetOpenForm = () => {
    setOperatorMatricula("");
    setOperatorPassword("");
    setOperatorName("");
    setOperatorVerified(false);
    setInitialCash(0);
  };

  const closeSessionFn = async () => {
    if (!session) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/cash/sessions/${session.id}/close`, {
        method: "POST",
        body: JSON.stringify({ countedCash: countedCash || 0, note: closeNote }),
      });
      setSession(null);
      setCloseModal(false);
      setCountedCash(0);
      setCloseNote("");
      addToast(`Caixa fechado! Divergencia: ${money(res.data.divergence || 0)}`, "info");
    } catch (err) {
      addToast(err.message, "error");
    }
    setSubmitting(false);
  };

  const createMovement = async () => {
    setSubmitting(true);
    try {
      await apiFetch("/api/cash/movements", {
        method: "POST",
        body: JSON.stringify({ type: movModal, amount: movAmount, reason: movReason }),
      });
      setMovModal(null);
      setMovAmount(0);
      setMovReason("");
      addToast(`${movModal === "SANGRIA" ? "Sangria" : "Suprimento"} registrado!`, "success");
      loadSession();
    } catch (err) {
      addToast(err.message, "error");
    }
    setSubmitting(false);
  };

  const toggleSaleItems = async (saleId) => {
    if (expandedSale === saleId) { setExpandedSale(null); return; }
    setExpandedSale(saleId);
    if (!saleItems[saleId]) {
      try {
        const res = await apiFetch(`/api/sales/${saleId}`);
        setSaleItems((prev) => ({ ...prev, [saleId]: res.data?.items || [] }));
      } catch {
        setSaleItems((prev) => ({ ...prev, [saleId]: [] }));
      }
    }
  };

  const openPayModal = (sale) => {
    setPayModal(sale);
    setPayMethod("DINHEIRO");
    setPayAmount(parseFloat(sale.total || 0));
  };

  const paySale = async () => {
    if (!payModal) return;
    setPaying(true);
    try {
      await apiFetch(`/api/sales/${payModal.id}/pay`, {
        method: "POST",
        body: JSON.stringify({ method: payMethod, amount: payAmount || 0 }),
      });
      setPayModal(null);
      addToast("Pagamento registrado!", "success");
      loadPendingSales();
      loadSession();
    } catch (err) {
      addToast(err.message, "error");
    }
    setPaying(false);
  };

  if (loading) return <PageSpinner />;

  const orderedPendingSales = useMemo(
    () =>
      [...pendingSales].sort((a, b) => {
        const ad = new Date(a?.createdAt || 0).getTime();
        const bd = new Date(b?.createdAt || 0).getTime();
        return ad - bd;
      }),
    [pendingSales],
  );

  const movements = session?.movements || [];
  const totalIn = movements.filter((m) => ["RECEBIMENTO", "SUPRIMENTO"].includes(m.type)).reduce((s, m) => s + parseFloat(m.amount || 0), 0);
  const totalOut = movements.filter((m) => ["SANGRIA", "ESTORNO"].includes(m.type)).reduce((s, m) => s + parseFloat(m.amount || 0), 0);
  const expectedCash = parseFloat(session?.initialCash || 0) + totalIn - totalOut;
  const payTotal = payModal ? parseFloat(payModal.total || 0) : 0;
  const troco = payMethod === "DINHEIRO" && payAmount > payTotal ? payAmount - payTotal : 0;

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500";

  return (
    <div className="space-y-4">
      {/* Header with user info and clock */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caixa</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-sm text-gray-600">
              <User size={14} /> {user?.name || "—"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-2xl font-bold text-gray-900 tabular-nums">
            <Clock size={20} className="text-gray-400" />
            {now.toLocaleTimeString("pt-BR")}
          </div>
          <p className="text-sm text-gray-500">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
          {!session && (
            <Button className="mt-2" onClick={() => { resetOpenForm(); setOpenModal(true); }}>
              <Wallet size={16} /> Abrir Caixa
            </Button>
          )}
        </div>
      </div>

      {session ? (
        <>
          {/* Operator + status cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500 uppercase">Operador</p>
                <p className="text-sm font-bold text-gray-900 mt-1">{session.openedBy?.name || user?.name || "—"}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-600">Caixa aberto</span>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500 uppercase">Abertura</p>
                <p className="text-sm font-medium text-gray-900 mt-1">{formatDateTime(session.openedAt)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500 uppercase">Fundo Inicial</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{money(session.initialCash)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500 uppercase">Entradas</p>
                <p className="text-xl font-bold text-emerald-600 mt-1">{money(totalIn)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs text-gray-500 uppercase">Saídas</p>
                <p className="text-xl font-bold text-red-600 mt-1">{money(totalOut)}</p>
              </CardBody>
            </Card>
          </div>

          {/* Expected cash + actions */}
          <Card>
            <CardBody className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm text-gray-500">Valor Esperado no Caixa</p>
                <p className="text-2xl font-bold text-gray-900">{money(expectedCash)}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" onClick={() => setMovModal("SANGRIA")}>
                  <ArrowUpCircle size={16} /> Sangria
                </Button>
                <Button variant="secondary" onClick={() => setMovModal("SUPRIMENTO")}>
                  <ArrowDownCircle size={16} /> Suprimento
                </Button>
                <Button variant="danger" onClick={() => setCloseModal(true)}>
                  Fechar Caixa
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Pending Sales */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-gray-400" />
                <h3 className="font-semibold text-gray-900">
                  Vendas Pendentes de Pagamento
                  {orderedPendingSales.length > 0 && (
                    <Badge color="amber" className="ml-2">{orderedPendingSales.length}</Badge>
                  )}
                </h3>
              </div>
              <button onClick={loadPendingSales} className="text-xs text-primary-600 hover:underline">Atualizar</button>
            </CardHeader>

            {loadingPending ? (
              <CardBody><div className="flex items-center justify-center py-4"><div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div></CardBody>
            ) : orderedPendingSales.length === 0 ? (
              <CardBody><p className="text-sm text-gray-400 text-center py-4">Nenhuma venda pendente de pagamento</p></CardBody>
            ) : (
              <div className="divide-y divide-gray-100">
                {orderedPendingSales.map((s) => (
                  <div key={s.id}>
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">#{s.number}</span>
                          <Badge color="amber">Confirmada</Badge>
                          <span className="text-xs text-gray-400">{s._count?.items || 0} itens</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          {s.customer ? (
                            <>
                              <span className="inline-flex items-center rounded-md bg-primary-50 px-2 py-0.5 text-sm font-semibold text-primary-700">
                                {s.customer.name}
                              </span>
                              {s.customer.document && <span>CPF: {cpfMask(s.customer.document)}</span>}
                            </>
                          ) : (
                            <span className="text-gray-400 italic">Sem cliente</span>
                          )}
                          <span>{formatDateTime(s.createdAt)}</span>
                        </div>
                      </div>
                      <span className="text-lg font-bold text-gray-900">{money(s.total)}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleSaleItems(s.id)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded" title="Ver itens">
                          {expandedSale === s.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button onClick={() => { setCancelModal(s); setCancelReason(""); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Cancelar venda">
                          <XCircle size={14} />
                        </button>
                        <Button size="sm" onClick={() => openPayModal(s)}>
                          <CreditCard size={14} /> Pagar
                        </Button>
                      </div>
                    </div>
                    {expandedSale === s.id && (
                      <div className="px-5 pb-3">
                        <div className="bg-gray-50 rounded-lg p-3">
                          {saleItems[s.id] ? (
                            saleItems[s.id].length > 0 ? (
                              <table className="w-full text-xs">
                                <thead><tr className="text-left text-gray-500"><th className="pb-1">Produto</th><th className="pb-1 text-right">Qtd</th><th className="pb-1 text-right">Unit.</th><th className="pb-1 text-right">Subtotal</th></tr></thead>
                                <tbody>
                                  {saleItems[s.id].map((item) => (
                                    <tr key={item.id}><td className="py-0.5 text-gray-700">{item.product?.name || "—"}</td><td className="py-0.5 text-right">{item.quantity}</td><td className="py-0.5 text-right">{money(item.priceUnit)}</td><td className="py-0.5 text-right font-medium">{money(item.subtotal)}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : <p className="text-xs text-gray-400">Sem itens</p>
                          ) : (
                            <div className="flex items-center justify-center py-2"><div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Pending Exchanges */}
          {pendingExchanges.length > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw size={18} className="text-yellow-500" />
                  <h3 className="font-semibold text-gray-900">
                    Trocas Pendentes
                    <Badge color="yellow" className="ml-2">{pendingExchanges.length}</Badge>
                  </h3>
                </div>
                <button onClick={loadPendingExchanges} className="text-xs text-primary-600 hover:underline">Atualizar</button>
              </CardHeader>
              <div className="divide-y divide-gray-100">
                {pendingExchanges.map((s) => {
                  const bal = Number(s.exchangeBalance);
                  const isPositive = bal > 0;
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">#{s.number}</span>
                          <Badge color={isPositive ? "green" : "red"}>
                            {isPositive ? "Receber" : "Devolver"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          {s.customer ? (
                            <span>{s.customer.name}</span>
                          ) : (
                            <span className="text-gray-400 italic">Sem cliente</span>
                          )}
                          <span>{formatDateTime(s.createdAt)}</span>
                        </div>
                      </div>
                      <span className={`text-lg font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                        {isPositive ? "+" : "-"}{money(Math.abs(bal))}
                      </span>
                      <Button
                        size="sm"
                        color={isPositive ? "green" : "red"}
                        loading={settlingExchange === s.id}
                        onClick={() => settleExchange(s)}
                      >
                        {isPositive ? "Receber" : "Devolver"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Movements */}
          <Card>
            <CardHeader><h3 className="font-semibold text-gray-900">Movimentacoes</h3></CardHeader>
            {movements.length === 0 ? (
              <CardBody><p className="text-sm text-gray-400 text-center py-4">Nenhuma movimentacao</p></CardBody>
            ) : (
              <div className="divide-y divide-gray-100">
                {movements.map((m) => {
                  const info = MOVEMENT_LABELS[m.type] || { label: m.type, color: "gray", icon: DollarSign };
                  const Icon = info.icon;
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                      <Icon size={18} className="text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{info.label}</p>
                        <p className="text-xs text-gray-500">{m.reason || "—"}</p>
                      </div>
                      <Badge color={info.color}>{money(m.amount)}</Badge>
                      <span className="text-xs text-gray-400">{formatTime(m.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <CardBody className="text-center py-12">
            <Wallet size={40} className="mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-medium text-gray-900">Caixa Fechado</h3>
            <p className="text-sm text-gray-500 mt-1">Abra o caixa para iniciar as operações do dia.</p>
            <Button className="mt-4" onClick={() => { resetOpenForm(); setOpenModal(true); }}>
              <Wallet size={16} /> Abrir Caixa
            </Button>
          </CardBody>
        </Card>
      )}

      {/* ═══ OPEN MODAL — Operator auth + initial cash ═══ */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Abrir Caixa" size="sm">
        <div className="space-y-4">
          {!operatorVerified ? (
            <>
              <p className="text-sm text-gray-600">Identifique o operador do caixa:</p>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Matrícula</label>
                <input value={operatorMatricula} onChange={(e) => setOperatorMatricula(e.target.value.replace(/\D/g, ""))}
                  placeholder="0001" className={inputClass} autoFocus />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Senha</label>
                <input type="password" value={operatorPassword} onChange={(e) => setOperatorPassword(e.target.value)}
                  className={inputClass} onKeyDown={(e) => e.key === "Enter" && verifyOperator()} />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setOpenModal(false)}>Cancelar</Button>
                <Button className="flex-1" loading={verifyingOperator} onClick={verifyOperator} disabled={!operatorMatricula || !operatorPassword}>
                  Verificar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <p className="text-sm text-emerald-800">
                  Operador: <span className="font-bold">{operatorName}</span>
                </p>
                <p className="text-xs text-emerald-600">Matricula: {operatorMatricula.padStart(4, "0")}</p>
              </div>
              <MoneyInput label="Fundo Inicial" value={initialCash} onChange={setInitialCash} autoFocus />
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setOpenModal(false)}>Cancelar</Button>
                <Button className="flex-1" loading={submitting} onClick={openSessionFn}>Abrir Caixa</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Close Modal */}
      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Fechar Caixa" size="sm">
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Valor esperado: <span className="font-bold">{money(expectedCash)}</span></p>
          </div>
          <MoneyInput label="Valor Contado" value={countedCash} onChange={setCountedCash} autoFocus />
          {countedCash > 0 && (
            <div className={`p-3 rounded-lg ${countedCash === expectedCash ? "bg-emerald-50" : "bg-amber-50"}`}>
              <p className={`text-sm ${countedCash === expectedCash ? "text-emerald-700" : "text-amber-700"}`}>
                Divergencia: {money(countedCash - expectedCash)}
              </p>
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Observacao</label>
            <textarea value={closeNote} onChange={(e) => setCloseNote(e.target.value)} rows={2} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCloseModal(false)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" loading={submitting} onClick={closeSessionFn}>Fechar Caixa</Button>
          </div>
        </div>
      </Modal>

      {/* Movement Modal */}
      <Modal open={!!movModal} onClose={() => setMovModal(null)} title={movModal === "SANGRIA" ? "Sangria" : "Suprimento"} size="sm">
        <div className="space-y-4">
          <MoneyInput label="Valor" value={movAmount} onChange={setMovAmount} autoFocus />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Motivo</label>
            <input value={movReason} onChange={(e) => setMovReason(e.target.value)} placeholder="Descreva o motivo..." className={inputClass} />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setMovModal(null)}>Cancelar</Button>
            <Button className="flex-1" loading={submitting} onClick={createMovement}>Confirmar</Button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Registrar Pagamento" size="sm">
        <div className="space-y-4">
          {payModal && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Venda #{payModal.number}</span>
                <span className="font-bold text-gray-900">{money(payModal.total)}</span>
              </div>
              {payModal.customer && (
                <p className="text-xs text-gray-500 mt-1">
                  {payModal.customer.name}
                  {payModal.customer.document && ` — CPF: ${cpfMask(payModal.customer.document)}`}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Forma de Pagamento</label>
            <div className="grid grid-cols-2 gap-2">
              {PAY_METHODS.map((m) => (
                <button key={m.key} onClick={() => setPayMethod(m.key)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${payMethod === m.key ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 hover:bg-gray-50"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {payMethod === "DINHEIRO" && (
            <MoneyInput label="Valor Recebido" value={payAmount} onChange={setPayAmount} />
          )}
          {troco > 0 && (
            <div className="p-3 bg-emerald-50 rounded-lg">
              <p className="text-sm text-emerald-700">Troco: <span className="font-bold">{money(troco)}</span></p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setPayModal(null)}>Cancelar</Button>
            <Button className="flex-1" loading={paying} onClick={paySale}>
              <CreditCard size={14} /> Confirmar Pagamento
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Sale Modal */}
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setCancelModal(null)}>Voltar</Button>
              <Button variant="danger" className="flex-1" disabled={!cancelReason.trim()} onClick={submitCancelSale}>
                <XCircle size={14} /> Confirmar Cancelamento
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
