/**
 * Infinity OS Shell — Root Application Component
 * ============================================================
 * Routes between login, desktop, and IAM-gated views
 * Supports role-based routing with IAM level guards
 * ============================================================
 * Ticket: TRN-IAM-003b
 * 2060 Standard: Modular, composable, adaptive routing
 * Revert: 2993380
 */

import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, type IAMRoleLevel } from './providers/AuthProvider';
import { LoadingScreen } from './components/LoadingScreen';

// Lazy-load major views for performance
const Desktop = lazy(() => import('./views/Desktop'));
const Login = lazy(() => import('./views/Login'));
const Register = lazy(() => import('./views/Register'));
const LockScreen = lazy(() => import('./views/LockScreen'));
const RoleSelector = lazy(() => import('./views/RoleSelector'));

// ============================================================
// ROUTE GUARDS
// ============================================================

/** Redirects unauthenticated users to /login */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Redirects authenticated users to /desktop */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (user) return <Navigate to="/desktop" replace />;
  return <>{children}</>;
}

/**
 * Role-gated route — requires authentication AND minimum IAM role level.
 * Level 0 = Continuity Guardian (highest privilege)
 * Level 6 = External AI (lowest privilege)
 *
 * Usage: <RoleGatedRoute maxLevel={2}> only allows Level 0, 1, 2
 *
 * If IAM is not yet loaded, shows loading screen.
 * If user lacks required level, redirects to /desktop with no error
 * (the desktop will show appropriate UI based on their actual level).
 *
 * 2060 Note: This guard is designed to be replaced by a policy engine
 * that evaluates ABAC conditions dynamically. The maxLevel prop maps
 * directly to IAMRoleLevel for forward compatibility.
 */
function RoleGatedRoute({
  children,
  maxLevel,
}: {
  children: React.ReactNode;
  maxLevel: IAMRoleLevel;
}) {
  const { user, isLoading, iam } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  // Wait for IAM context to load before making access decisions
  if (!iam.isIAMReady) return <LoadingScreen />;

  // Check role level — lower number = higher privilege
  if (!iam.hasMinLevel(maxLevel)) {
    // Insufficient privilege — redirect to desktop gracefully
    // No error flash — the desktop adapts to the user's actual role
    return <Navigate to="/desktop" replace />;
  }

  return <>{children}</>;
}

/**
 * Multi-role redirect — if user has multiple roles and none is primary,
 * redirect to role selector. Otherwise, pass through.
 *
 * This ensures users with multiple roles explicitly choose their
 * operating context before accessing the system.
 */
function MultiRoleGuard({ children }: { children: React.ReactNode }) {
  const { iam, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!iam.isIAMReady) return <LoadingScreen />;

  // If user has multiple roles and no active role, redirect to selector
  if (iam.roles.length > 1 && !iam.activeRole) {
    return <Navigate to="/select-role" replace />;
  }

  return <>{children}</>;
}

// ============================================================
// APP COMPONENT
// ============================================================

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* ---- Public routes ---- */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

        {/* ---- IAM: Role selection (for multi-role users) ---- */}
        <Route
          path="/select-role"
          element={
            <ProtectedRoute>
              <RoleSelector />
            </ProtectedRoute>
          }
        />

        {/* ---- Protected routes (all authenticated users) ---- */}
        <Route
          path="/desktop"
          element={
            <ProtectedRoute>
              <MultiRoleGuard>
                <Desktop />
              </MultiRoleGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lock"
          element={
            <ProtectedRoute>
              <LockScreen />
            </ProtectedRoute>
          }
        />

        {/* ---- Admin routes (Level 0-2: CG, Platform Architect, Ops Commander) ---- */}
        <Route
          path="/admin/*"
          element={
            <RoleGatedRoute maxLevel={2}>
              <MultiRoleGuard>
                <Desktop />
              </MultiRoleGuard>
            </RoleGatedRoute>
          }
        />

        {/* ---- Default redirect ---- */}
        <Route path="/" element={<Navigate to="/desktop" replace />} />
        <Route path="*" element={<Navigate to="/desktop" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;