/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import GenerateContract from './pages/GenerateContract';
import ContractHistory from './pages/ContractHistory';
import AdminUsers from './pages/AdminUsers';
import AdminLogs from './pages/AdminLogs';
import Companies from './pages/Companies';
import RecentFlows from './pages/RecentFlows';
import TestArea from './pages/TestArea';
import InstitutionalSite from './pages/InstitutionalSite';
import { Loader2 } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { TEST_AREA_PUBLIC, TEST_ADMIN_EMAIL } from './config/featureFlags';
import { isAsoWorker, isInternalEmployee } from './utils/userClassification';

import CompanyDashboard from './pages/CompanyDashboard';
import MyAsos from './pages/MyAsos';
import AccessPdfPreview from './pages/AccessPdfPreview';

function AppContent() {
  const { user, userData, loading, isAdmin } = useAuth();
  
  // Detecção de Domínio para Produção
  const hostname = window.location.hostname;
  const isAppSubdomain = hostname === 'app.biosegurancaarqmed.com.br';
  const isWwwSubdomain = hostname === 'www.biosegurancaarqmed.com.br' || hostname === 'biosegurancaarqmed.com.br';
  const isProd = isAppSubdomain || isWwwSubdomain;

  const canAccessTestArea = TEST_AREA_PUBLIC || user?.email === TEST_ADMIN_EMAIL;

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white dark:bg-slate-950 transition-colors">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">Carregando Sistema...</p>
        </div>
      </div>
    );
  }

  // Helper para decidir o destino padrão do usuário logado
  const getDefaultDashboard = () => {
    if (!userData) return "/login";
    
    const tipo = userData.tipo || '';
    const login = (userData.loginVisivel || '').replace(/\D/g, '');
    
    console.log("PORTAL_REDIRECIONAMENTO_DEBUG:", {
      uid: userData.uid,
      tipo: tipo,
      login: login,
      len: login.length
    });

    if (tipo === 'admin') {
      console.log("LOGIN_REDIRECT_INTERNAL_APP", userData.email);
      return "/dashboard";
    }
    
    if (isAsoWorker(userData)) {
      console.log("LOGIN_REDIRECT_ASO_WORKER_PORTAL", userData.email);
      return "/meus-asos";
    }
    
    if (tipo === 'empresa' || login.length === 14) {
      return "/empresa/asos";
    }
    
    if (isInternalEmployee(userData)) {
      console.log("LOGIN_REDIRECT_INTERNAL_APP", userData.email);
      return "/dashboard";
    }
    
    return "/dashboard";
  };

  const isInternal = user && (userData?.tipo === 'admin' || isInternalEmployee(userData));
  const isTrabalhador = user && isAsoWorker(userData);
  const isEmpresa = user && (userData?.tipo === 'empresa' || (userData?.loginVisivel || '').replace(/\D/g, '').length === 14);

  const getInternalElement = (component: React.ReactElement) => {
    if (isInternal) {
      console.log("ROUTE_GUARD_INTERNAL_ALLOWED", userData?.email);
      return component;
    }
    if (isTrabalhador) {
      console.log("ROUTE_GUARD_ASO_BLOCKED_FROM_INTERNAL", userData?.email);
    }
    return <Navigate to={getDefaultDashboard()} replace />;
  };

  const getAsoWorkerElement = (component: React.ReactElement) => {
    if (isTrabalhador) {
      console.log("ROUTE_GUARD_ASO_WORKER_ALLOWED", userData?.email);
      return component;
    }
    return <Navigate to={getDefaultDashboard()} replace />;
  };

  const getEmpresaElement = (component: React.ReactElement) => {
    if (isEmpresa) {
      return component;
    }
    return <Navigate to={getDefaultDashboard()} replace />;
  };

  // Lógica de Redirecionamento entre Domínios (Produção)
  if (isProd) {
    // Se estiver no domínio principal (www ou root)
    if (isWwwSubdomain) {
      return (
        <Routes>
          <Route path="/" element={<InstitutionalSite />} />
          <Route path="/login" element={<Navigate to="https://app.biosegurancaarqmed.com.br/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      );
    }

    // Se estiver no subdomínio da aplicação (app)
    if (isAppSubdomain) {
      return (
        <Routes>
          <Route path="/login" element={user ? <Navigate to={getDefaultDashboard()} replace /> : <LoginPage />} />
          <Route path="/" element={user ? <Navigate to={getDefaultDashboard()} replace /> : <Navigate to="/login" replace />} />
          <Route path="/dashboard" element={getInternalElement(<Dashboard />)} />
          <Route path="/empresa/asos" element={getEmpresaElement(<CompanyDashboard />)} />
          <Route path="/meus-asos" element={getAsoWorkerElement(<MyAsos />)} />
          <Route path="/gerar-contrato" element={getInternalElement(<GenerateContract />)} />
          <Route path="/contratos" element={getInternalElement(<ContractHistory />)} />
          <Route path="/fluxos-recentes" element={getInternalElement(<RecentFlows />)} />
          <Route path="/empresas" element={getInternalElement(<Companies />)} />
          <Route path="/usuarios" element={getInternalElement(<AdminUsers />)} />
          <Route path="/logs" element={getInternalElement(<AdminLogs />)} />
          <Route path="/teste" element={user && canAccessTestArea ? getInternalElement(<TestArea />) : <Navigate to={getDefaultDashboard()} replace />} />
          <Route path="/preview-acesso" element={user ? <AccessPdfPreview /> : <Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to={getDefaultDashboard()} replace />} />
        </Routes>
      );
    }
  }

  // Modo de Desenvolvimento (Preview/Local) - Mantém rotas acessíveis no mesmo domínio
  return (
    <Routes>
      <Route path="/" element={<InstitutionalSite />} />
      <Route path="/login" element={user ? <Navigate to={getDefaultDashboard()} /> : <LoginPage />} />
      <Route path="/dashboard" element={getInternalElement(<Dashboard />)} />
      <Route path="/empresa/asos" element={getEmpresaElement(<CompanyDashboard />)} />
      <Route path="/meus-asos" element={getAsoWorkerElement(<MyAsos />)} />
      <Route path="/gerar-contrato" element={getInternalElement(<GenerateContract />)} />
      <Route path="/contratos" element={getInternalElement(<ContractHistory />)} />
      <Route path="/fluxos-recentes" element={getInternalElement(<RecentFlows />)} />
      <Route path="/empresas" element={getInternalElement(<Companies />)} />
      <Route path="/site" element={<Navigate to="/" />} />
      <Route path="/usuarios" element={getInternalElement(<AdminUsers />)} />
      <Route path="/logs" element={getInternalElement(<AdminLogs />)} />
      <Route path="/teste" element={user && canAccessTestArea ? getInternalElement(<TestArea />) : <Navigate to={getDefaultDashboard()} />} />
      <Route path="/preview-acesso" element={user ? <AccessPdfPreview /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={getDefaultDashboard()} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
          <Toaster position="top-center" />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
