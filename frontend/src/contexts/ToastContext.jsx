import { createContext, useContext, useState, useCallback, useRef } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

const ToastContext = createContext(null);

const EXIT_MS = 900; // duração do fade-out (mais devagar)

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: "bg-emerald-50 border-emerald-400 text-emerald-800",
  error: "bg-red-50 border-red-400 text-red-800",
  warning: "bg-amber-50 border-amber-400 text-amber-800",
  info: "bg-blue-50 border-blue-400 text-blue-800",
};

const ICON_COLORS = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const addToast = useCallback((message, type = "info", duration = 4000) => {
    const id = ++idRef.current;

    // entra
    setToasts((prev) => [...prev, { id, message, type, exiting: false }]);

    if (duration > 0) {
      // inicia saída
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));

        // remove depois da animação
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, EXIT_MS);
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 p-3 rounded-lg border shadow-lg
                ${t.exiting ? "animate-slide-out" : "animate-slide-in"}
                ${COLORS[t.type]}
              `}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${ICON_COLORS[t.type]}`} />
              <p className="text-sm flex-1">{t.message}</p>
              <button onClick={() => removeToast(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        @keyframes slide-out {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(30%); opacity: 0; }
        }

        .animate-slide-in { animation: slide-in 0.25s ease-out; }
        .animate-slide-out { animation: slide-out 0.9s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>

    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
