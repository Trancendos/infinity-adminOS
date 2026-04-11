/**
 * Infinity OS Shell — Root Application Component
 * Routes between auth screens, desktop environment,
 * and all feature views (observability, marketplace,
 * AI builder, integrations, git, terminal, etc.)
 */

import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './providers/AuthProvider';
import { LoadingScreen } from './components/LoadingScreen';

// ── Lazy-load all views for code-splitting ──

// Auth views
const Login = lazy(() => import('./views/Login'));
const Register = lazy(() => import('./views/Register'));
const LockScreen = lazy(() => import('./views/LockScreen'));

// Core views
const Desktop = lazy(() => import('./views/Desktop'));
const Terminal = lazy(() => import('./views/Terminal'));
const FileManager = lazy(() => import('./views/FileManager'));
const Settings = lazy(() => import('./views/Settings'));

// Observability & Infrastructure views
const ObservabilityDashboard = lazy(() => import('./views/ObservabilityDashboard'));
const DatabaseConsole = lazy(() => import('./views/DatabaseConsole'));
const FinOpsDashboard = lazy(() => import('./views/FinOpsDashboard'));
const CICDOverview = lazy(() => import('./views/CICDOverview'));

// Feature views
const Marketplace = lazy(() => import('./views/Marketplace'));
const IntegrationsHub = lazy(() => import('./views/IntegrationsHub'));
const AgentFactory = lazy(() => import('./views/AgentFactory'));
const GitHub = lazy(() => import('./views/GitHub'));
const AIBuilder = lazy(() => import('./views/AIBuilder'));

// ── Route Guards ────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (user) return <Navigate to="/desktop" replace />;
  return <>{children}</>;
}

// ── Application Root ────────────────────────

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* ── Public Routes ── */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

        {/* ── Protected Routes ── */}
        <Route path="/desktop" element={<ProtectedRoute><Desktop /></ProtectedRoute>} />
        <Route path="/lock" element={<ProtectedRoute><LockScreen /></ProtectedRoute>} />

        {/* Core Tools */}
        <Route path="/terminal" element={<ProtectedRoute><Terminal /></ProtectedRoute>} />
        <Route path="/files" element={<ProtectedRoute><FileManager /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        {/* Observability & Infrastructure */}
        <Route path="/observability" element={<ProtectedRoute><ObservabilityDashboard /></ProtectedRoute>} />
        <Route path="/database" element={<ProtectedRoute><DatabaseConsole /></ProtectedRoute>} />
        <Route path="/finops" element={<ProtectedRoute><FinOpsDashboard /></ProtectedRoute>} />
        <Route path="/cicd" element={<ProtectedRoute><CICDOverview /></ProtectedRoute>} />

        {/* Features */}
        <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
        <Route path="/integrations" element={<ProtectedRoute><IntegrationsHub /></ProtectedRoute>} />
        <Route path="/agents" element={<ProtectedRoute><AgentFactory /></ProtectedRoute>} />
        <Route path="/git" element={<ProtectedRoute><GitHub /></ProtectedRoute>} />
        <Route path="/ai" element={<ProtectedRoute><AIBuilder /></ProtectedRoute>} />

        {/* ── Default & Fallback ── */}
        <Route path="/" element={<Navigate to="/desktop" replace />} />
        <Route path="*" element={<Navigate to="/desktop" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;