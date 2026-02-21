import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

function formatDateTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export default function Chat() {
  const { addToast } = useToast();
  const [usersLoading, setUsersLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeUserId, setActiveUserId] = useState("");
  const [activeUser, setActiveUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  const conversationMap = useMemo(() => {
    const m = {};
    for (const c of conversations) m[c.user?.id] = c;
    return m;
  }, [conversations]);

  const loadUsers = async (search = "") => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (search?.trim()) params.set("search", search.trim());
      params.set("limit", "30");
      const res = await apiFetch(`/api/chat/users?${params.toString()}`);
      setUsers(res.data?.users || []);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setUsersLoading(false);
    }
  };

  const loadConversations = async () => {
    try {
      const res = await apiFetch("/api/chat/conversations?limit=60");
      const list = res.data?.conversations || [];
      setConversations(list);
      if (!activeUserId && list.length > 0) setActiveUserId(list[0].user?.id || "");
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const loadMessages = async (userId) => {
    if (!userId) return;
    try {
      const res = await apiFetch(`/api/chat/messages/${userId}?limit=120`);
      setActiveUser(res.data?.user || null);
      setMessages(res.data?.messages || []);
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  useEffect(() => {
    loadConversations();
    loadUsers("");
  }, []);

  useEffect(() => {
    if (!activeUserId) return;
    loadMessages(activeUserId);
  }, [activeUserId]);

  useEffect(() => {
    const id = setInterval(() => {
      loadConversations();
      if (activeUserId) loadMessages(activeUserId);
    }, 5000);
    return () => clearInterval(id);
  }, [activeUserId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeUserId]);

  const sendMessage = async () => {
    const text = String(draft || "").trim();
    if (!activeUserId || !text) return;
    setSending(true);
    try {
      await apiFetch("/api/chat/messages", {
        method: "POST",
        body: JSON.stringify({
          recipientId: activeUserId,
          content: text,
        }),
      });
      setDraft("");
      await loadMessages(activeUserId);
      await loadConversations();
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSending(false);
    }
  };

  const groupedMessages = useMemo(() => {
    const out = [];
    let current = null;
    for (const msg of messages) {
      const d = new Date(msg.createdAt);
      if (!current || !sameDay(current.date, d)) {
        current = { date: d, items: [] };
        out.push(current);
      }
      current.items.push(msg);
    }
    return out;
  }, [messages]);

  return (
    <div className="h-[calc(100vh-120px)] grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <Card className="flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-base font-semibold text-gray-900">Chat</p>
          <p className="text-xs text-gray-500">Converse com qualquer usuario ativo</p>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadUsers(query); }}
            placeholder="Buscar usuario..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <Button size="sm" variant="secondary" className="w-full" onClick={() => loadUsers(query)} loading={usersLoading}>
            Buscar
          </Button>
        </div>

        <div className="overflow-y-auto px-2 py-2 space-y-1">
          {conversations.map((c) => {
            const selected = activeUserId === c.user?.id;
            return (
              <button
                key={`conv-${c.user?.id}`}
                onClick={() => setActiveUserId(c.user?.id || "")}
                className={`w-full text-left px-3 py-2 rounded-lg border ${selected ? "bg-primary-50 border-primary-200" : "bg-white border-transparent hover:bg-gray-50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.user?.name}</p>
                  {!!c.unreadCount && <span className="text-[11px] bg-red-100 text-red-700 rounded-full px-2 py-0.5">{c.unreadCount}</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">{c.lastMessage?.content || "-"}</p>
              </button>
            );
          })}

          {users.length > 0 && (
            <div className="pt-3 mt-2 border-t border-gray-100">
              <p className="px-2 mb-1 text-[11px] uppercase text-gray-400">Usuarios</p>
              {users.map((u) => {
                const selected = activeUserId === u.id;
                const unread = conversationMap[u.id]?.unreadCount || 0;
                return (
                  <button
                    key={`user-${u.id}`}
                    onClick={() => setActiveUserId(u.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border ${selected ? "bg-primary-50 border-primary-200" : "bg-white border-transparent hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                      {!!unread && <span className="text-[11px] bg-red-100 text-red-700 rounded-full px-2 py-0.5">{unread}</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{u.role?.name || "-"}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-base font-semibold text-gray-900">{activeUser?.name || "Selecione um usuario"}</p>
          <p className="text-xs text-gray-500">{activeUser?.role?.name || ""}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50">
          {!activeUserId && <p className="text-sm text-gray-400">Escolha uma conversa para iniciar.</p>}
          {activeUserId && groupedMessages.length === 0 && <p className="text-sm text-gray-400">Sem mensagens ainda.</p>}

          {groupedMessages.map((group, idx) => (
            <div key={`day-${idx}`} className="mb-4">
              <p className="text-center text-[11px] text-gray-500 mb-2">{new Date(group.date).toLocaleDateString("pt-BR")}</p>
              <div className="space-y-2">
                {group.items.map((m) => {
                  const mine = m.senderId !== activeUserId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${mine ? "bg-primary-600 text-white" : "bg-white border border-gray-200 text-gray-900"}`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                        <p className={`text-[10px] mt-1 ${mine ? "text-primary-100" : "text-gray-400"}`}>{formatDateTime(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={!activeUserId}
            placeholder={activeUserId ? "Digite sua mensagem..." : "Selecione um usuario para conversar"}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
          />
          <Button onClick={sendMessage} loading={sending} disabled={!activeUserId || !String(draft || "").trim()}>
            Enviar
          </Button>
        </div>
      </Card>
    </div>
  );
}
