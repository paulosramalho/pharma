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
import PrimeiroAcesso from "./pages/PrimeiroAcesso";

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
    if (user?.mustChangePassword) return <Navigate to="/primeiro-acesso" replace />;
    const role = user?.role;
    if (role === "CAIXA") return <Navigate to="/caixa" replace />;
    if (role === "VENDEDOR") return <Navigate to="/vendas" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function DefaultRedirect() {
  const { user, isLicenseActive } = useAuth();
  if (user?.mustChangePassword) return <Navigate to="/primeiro-acesso" replace />;
  if (user?.role === "ADMIN" && !isLicenseActive) return <Navigate to="/config" replace />;
  const role = user?.role;
  if (role === "CAIXA") return <Navigate to="/caixa" replace />;
  if (role === "VENDEDOR") return <Navigate to="/vendas" replace />;
  return <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  const { hasFeature, user, isLicenseActive } = useAuth();
  const adminLicenseLocked = user?.role === "ADMIN" && !isLicenseActive;
  const firstAccessLocked = !!user?.mustChangePassword;
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/primeiro-acesso" element={<ProtectedRoute><PrimeiroAcesso /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : <Dashboard />)} />
        <Route path="/vendas" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : <Vendas />)} />
        <Route path="/vendas/nova" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : <VendaNova />)} />
        <Route path="/caixa" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : <Caixa />)} />
        <Route path="/estoque" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : <Estoque />)} />
        <Route path="/produtos" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : <Produtos />)} />
        <Route path="/usuarios" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : <Usuarios />)} />
        <Route path="/config" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : <Config />} />
        <Route path="/perfil" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : <MeuPerfil />)} />
        <Route path="/chat" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : (hasFeature("chat") ? <Chat /> : <Navigate to="/dashboard" replace />))} />
        <Route path="/relatorios" element={firstAccessLocked ? <Navigate to="/primeiro-acesso" replace /> : (adminLicenseLocked ? <Navigate to="/config" replace /> : <Relatorios />)} />
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
