import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import Layout from "./components/Layout";
import { PageSpinner } from "./components/ui/Spinner";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Vendas from "./pages/Vendas";
import VendaNova from "./pages/VendaNova";
import Caixa from "./pages/Caixa";
import Estoque from "./pages/Estoque";
import Produtos from "./pages/Produtos";
import Usuarios from "./pages/Usuarios";
import Config from "./pages/Config";
import MeuPerfil from "./pages/MeuPerfil";
import Relatorios from "./pages/Relatorios";
import Chat from "./pages/Chat";

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <PageSpinner />;
  if (isAuthenticated) {
    const role = user?.role;
    if (role === "CAIXA") return <Navigate to="/caixa" replace />;
    if (role === "VENDEDOR") return <Navigate to="/vendas" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function DefaultRedirect() {
  const { user } = useAuth();
  const role = user?.role;
  if (role === "CAIXA") return <Navigate to="/caixa" replace />;
  if (role === "VENDEDOR") return <Navigate to="/vendas" replace />;
  return <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/vendas/nova" element={<VendaNova />} />
        <Route path="/caixa" element={<Caixa />} />
        <Route path="/estoque" element={<Estoque />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/config" element={<Config />} />
        <Route path="/perfil" element={<MeuPerfil />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/relatorios" element={<Relatorios />} />
      </Route>
      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
