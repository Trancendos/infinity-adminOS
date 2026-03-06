/**
 * AuthProvider — React context for authentication + IAM state
 * ============================================================
 * Unified: talks directly to FastAPI backend (/api/v1/auth/*)
 * IAM-Enriched: multi-role, active role, permission evaluation
 * Stores tokens in localStorage with auto-refresh
 * ============================================================
 * Ticket: TRN-IAM-003b
 * 2060 Standard: Modular, composable, quantum-safe defaults
 * Revert: 2993380
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import type { User } from '@infinity-os/types';
import { useKernel } from './KernelProvider';

// ============================================================
// IAM TYPES — Mirrors backend IAMService output
// ============================================================

/** IAM Role Level (0 = Continuity Guardian, 6 = External AI) */
export type IAMRoleLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** IAM Role as returned by the backend */
export interface IAMRole {
  id: string;
  name: string;
  display_name: string;
  level: IAMRoleLevel;
  role_type: 'system' | 'custom' | 'dynamic';
  description: string;
  is_active: boolean;
  is_primary: boolean;
}

/** Subscription tier summary */
export interface SubscriptionTierSummary {
  id: string;
  name: string;
  slug: string;
  level: number;
  ai_access_tier: number;
  monthly_ai_token_budget: number;
}

/** Permission evaluation result from POST /api/v1/rbac/evaluate */
export interface PermissionEvalResult {
  allowed: boolean;
  decision: 'ALLOW' | 'DENY' | 'DENY_RESTRICTION' | 'DENY_SUBSCRIPTION' | 'DENY_NO_ROLE';
  reason: string;
  evaluated_at: string;
}

/** IAM context exposed to the entire application */
export interface IAMContext {
  /** All roles assigned to the current user */
  roles: IAMRole[];
  /** Currently active role (used for permission evaluation) */
  activeRole: IAMRole | null;
  /** Numeric level of the active role (0 = highest privilege) */
  activeRoleLevel: IAMRoleLevel | null;
  /** Current subscription tier */
  subscriptionTier: SubscriptionTierSummary | null;
  /** Cached permissions for the active role (namespace:resource:action) */
  permissions: string[];
  /** Whether IAM data has been loaded */
  isIAMReady: boolean;
  /** Switch to a different assigned role (returns new token pair) */
  switchRole: (roleId: string) => Promise<void>;
  /** Evaluate a specific permission against the backend (full 5-step chain) */
  evaluatePermission: (
    namespace: string,
    resource: string,
    action: string,
  ) => Promise<PermissionEvalResult>;
  /** Quick client-side permission check against cached permissions */
  hasPermission: (namespace: string, resource: string, action: string) => boolean;
  /** Check if user has at least the given role level (lower = more privileged) */
  hasMinLevel: (maxLevel: IAMRoleLevel) => boolean;
  /** Refresh IAM context from backend */
  refreshIAM: () => Promise<void>;
}

// ============================================================
// AUTH TYPES — Extended with IAM
// ============================================================

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  refreshToken: () => Promise<boolean>;
  getAccessToken: () => string | null;
  /** IAM context — null until IAM data is loaded */
  iam: IAMContext;
}

/** Backend user shape (extended with IAM fields) */
interface BackendUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  organisation_id: string;
  is_active: boolean;
  permissions: string[];
  // IAM enrichment (optional — graceful fallback if not present)
  available_roles?: IAMRole[];
  active_role?: string;
  active_role_level?: IAMRoleLevel;
  subscription_tier?: string;
}

/** Token response from login/register/refresh */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: BackendUser;
}

/** Role switch response */
interface RoleSwitchResponse {
  access_token: string;
  refresh_token: string;
  active_role: IAMRole;
  message: string;
}

/** IAM roles list response */
interface IAMRolesResponse {
  roles: IAMRole[];
  active_role: string | null;
  subscription_tier: SubscriptionTierSummary | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

// Storage keys
const ACCESS_TOKEN_KEY = 'infinity_access_token';
const REFRESH_TOKEN_KEY = 'infinity_refresh_token';
const USER_KEY = 'infinity_user';
const IAM_ROLES_KEY = 'infinity_iam_roles';
const IAM_ACTIVE_ROLE_KEY = 'infinity_iam_active_role';
const IAM_PERMISSIONS_KEY = 'infinity_iam_permissions';

// ============================================================
// HELPERS
// ============================================================

function backendUserToUser(bu: BackendUser): User {
  return {
    id: bu.id,
    email: bu.email,
    displayName: bu.display_name,
    role: bu.role as User['role'],
    organisationId: bu.organisation_id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mfaEnabled: false,
    preferences: {
      theme: 'dark',
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      aiEnabled: true,
      analyticsEnabled: true,
    },
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

/** Authenticated API fetch — auto-injects Bearer token */
async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) throw new Error('No access token available');

  return apiFetch<T>(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

// ============================================================
// PROVIDER
// ============================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { kernel } = useKernel();

  // ---- Core auth state ----
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  // ---- IAM state ----
  const [iamRoles, setIamRoles] = useState<IAMRole[]>(() => {
    const stored = localStorage.getItem(IAM_ROLES_KEY);
    return stored ? JSON.parse(stored) : [];
  });
  const [activeRole, setActiveRole] = useState<IAMRole | null>(() => {
    const stored = localStorage.getItem(IAM_ACTIVE_ROLE_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [iamPermissions, setIamPermissions] = useState<string[]>(() => {
    const stored = localStorage.getItem(IAM_PERMISSIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  });
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTierSummary | null>(null);
  const [isIAMReady, setIsIAMReady] = useState(false);

  // ---- Token helpers ----

  const getAccessToken = useCallback((): string | null => {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }, []);

  const storeTokens = useCallback((tokens: TokenResponse) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    const mappedUser = backendUserToUser(tokens.user);
    localStorage.setItem(USER_KEY, JSON.stringify(mappedUser));
    setUser(mappedUser);
    kernel.setUser(mappedUser);

    // Store IAM enrichment if present
    if (tokens.user.available_roles) {
      localStorage.setItem(IAM_ROLES_KEY, JSON.stringify(tokens.user.available_roles));
      setIamRoles(tokens.user.available_roles);

      // Set active role from enrichment
      const primary = tokens.user.available_roles.find((r) => r.is_primary);
      if (primary) {
        localStorage.setItem(IAM_ACTIVE_ROLE_KEY, JSON.stringify(primary));
        setActiveRole(primary);
      }
    }
  }, [kernel]);

  const clearTokens = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(IAM_ROLES_KEY);
    localStorage.removeItem(IAM_ACTIVE_ROLE_KEY);
    localStorage.removeItem(IAM_PERMISSIONS_KEY);
    setUser(null);
    setIamRoles([]);
    setActiveRole(null);
    setIamPermissions([]);
    setSubscriptionTier(null);
    setIsIAMReady(false);
    kernel.setUser(null);
  }, [kernel]);

  // ---- IAM data loading ----

  const loadIAMContext = useCallback(async () => {
    try {
      // Fetch user's IAM roles and subscription tier
      const iamData = await authFetch<IAMRolesResponse>('/api/v1/rbac/users/me/roles');

      setIamRoles(iamData.roles);
      localStorage.setItem(IAM_ROLES_KEY, JSON.stringify(iamData.roles));

      if (iamData.subscription_tier) {
        setSubscriptionTier(iamData.subscription_tier);
      }

      // Determine active role
      const active = iamData.roles.find((r) => r.is_primary) || iamData.roles[0] || null;
      setActiveRole(active);
      if (active) {
        localStorage.setItem(IAM_ACTIVE_ROLE_KEY, JSON.stringify(active));
      }

      // Fetch permissions for active role
      if (active) {
        try {
          const permData = await authFetch<{ permissions: string[] }>(
            `/api/v1/rbac/roles/${active.id}/permissions`,
          );
          setIamPermissions(permData.permissions);
          localStorage.setItem(IAM_PERMISSIONS_KEY, JSON.stringify(permData.permissions));
        } catch {
          // Permissions endpoint may not be available yet — graceful fallback
          setIamPermissions([]);
        }
      }

      setIsIAMReady(true);
    } catch {
      // IAM endpoints not available — graceful degradation
      // The app continues to work with legacy role-based auth
      console.warn('[IAM] IAM context unavailable — falling back to legacy auth');
      setIsIAMReady(true); // Mark ready so UI doesn't block
    }
  }, []);

  // ---- Role switching ----

  const switchRole = useCallback(async (roleId: string) => {
    const data = await authFetch<RoleSwitchResponse>('/api/v1/rbac/switch-role', {
      method: 'POST',
      body: JSON.stringify({ role_id: roleId }),
    });

    // Update tokens
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);

    // Update active role
    setActiveRole(data.active_role);
    localStorage.setItem(IAM_ACTIVE_ROLE_KEY, JSON.stringify(data.active_role));

    // Reload permissions for new role
    try {
      const permData = await authFetch<{ permissions: string[] }>(
        `/api/v1/rbac/roles/${data.active_role.id}/permissions`,
      );
      setIamPermissions(permData.permissions);
      localStorage.setItem(IAM_PERMISSIONS_KEY, JSON.stringify(permData.permissions));
    } catch {
      setIamPermissions([]);
    }
  }, []);

  // ---- Permission evaluation ----

  const evaluatePermission = useCallback(
    async (
      namespace: string,
      resource: string,
      action: string,
    ): Promise<PermissionEvalResult> => {
      return authFetch<PermissionEvalResult>('/api/v1/rbac/evaluate', {
        method: 'POST',
        body: JSON.stringify({ namespace, resource, action }),
      });
    },
    [],
  );

  /** Client-side permission check against cached permissions (fast, no network) */
  const hasPermission = useCallback(
    (namespace: string, resource: string, action: string): boolean => {
      const target = `${namespace}:${resource}:${action}`;
      return iamPermissions.some((p) => {
        if (p === '*') return true; // Wildcard — CG has all permissions
        if (p === target) return true; // Exact match
        // Namespace wildcard: "admin-os:*:read" matches "admin-os:dashboard:read"
        const parts = p.split(':');
        const targetParts = target.split(':');
        return parts.every((part, i) => part === '*' || part === targetParts[i]);
      });
    },
    [iamPermissions],
  );

  /** Check if user has at least the given role level (lower number = more privileged) */
  const hasMinLevel = useCallback(
    (maxLevel: IAMRoleLevel): boolean => {
      if (!activeRole) return false;
      return activeRole.level <= maxLevel;
    },
    [activeRole],
  );

  // ---- Auto-refresh ----

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!rt) return false;

    try {
      const data = await apiFetch<TokenResponse>('/api/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: rt }),
      });
      storeTokens(data);
      return true;
    } catch {
      clearTokens();
      return false;
    }
  }, [storeTokens, clearTokens]);

  // ---- Session restore on mount ----

  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        setIsIAMReady(true);
        return;
      }

      try {
        // Verify token is still valid by calling /me
        const backendUser = await apiFetch<BackendUser>('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const mappedUser = backendUserToUser(backendUser);
        setUser(mappedUser);
        kernel.setUser(mappedUser);
        localStorage.setItem(USER_KEY, JSON.stringify(mappedUser));

        // Load IAM context after successful auth
        await loadIAMContext();
      } catch {
        // Token invalid — try refresh
        const refreshed = await refreshToken();
        if (refreshed) {
          await loadIAMContext();
        } else {
          clearTokens();
        }
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-refresh timer (every 25 minutes) ----

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      refreshToken();
    }, 25 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, refreshToken]);

  // ---- Auth actions ----

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const data = await apiFetch<TokenResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    storeTokens(data);
    // Load IAM context after login
    await loadIAMContext();
  }, [storeTokens, loadIAMContext]);

  const logout = useCallback(async (): Promise<void> => {
    const token = getAccessToken();
    if (token) {
      try {
        await apiFetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Ignore logout errors — clear locally regardless
      }
    }
    clearTokens();
  }, [getAccessToken, clearTokens]);

  const register = useCallback(async (
    email: string,
    password: string,
    displayName: string,
  ): Promise<void> => {
    const data = await apiFetch<TokenResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    storeTokens(data);
    // Load IAM context after registration
    await loadIAMContext();
  }, [storeTokens, loadIAMContext]);

  // ---- Memoised IAM context ----

  const iam = useMemo<IAMContext>(
    () => ({
      roles: iamRoles,
      activeRole,
      activeRoleLevel: activeRole?.level ?? null,
      subscriptionTier,
      permissions: iamPermissions,
      isIAMReady,
      switchRole,
      evaluatePermission,
      hasPermission,
      hasMinLevel,
      refreshIAM: loadIAMContext,
    }),
    [
      iamRoles,
      activeRole,
      subscriptionTier,
      iamPermissions,
      isIAMReady,
      switchRole,
      evaluatePermission,
      hasPermission,
      hasMinLevel,
      loadIAMContext,
    ],
  );

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      register,
      refreshToken,
      getAccessToken,
      iam,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// HOOKS
// ============================================================

/** Full auth context including IAM */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Convenience hook — IAM context only */
export function useIAM(): IAMContext {
  const { iam } = useAuth();
  return iam;
}

/**
 * Convenience hook — check if user has a specific permission
 * Usage: const canEdit = usePermission('admin-os', 'dashboard', 'write');
 */
export function usePermission(namespace: string, resource: string, action: string): boolean {
  const { hasPermission, isIAMReady } = useIAM();
  return isIAMReady ? hasPermission(namespace, resource, action) : false;
}

/**
 * Convenience hook — check if user meets minimum role level
 * Usage: const isAdmin = useMinLevel(2); // Level 0, 1, or 2
 */
export function useMinLevel(maxLevel: IAMRoleLevel): boolean {
  const { hasMinLevel, isIAMReady } = useIAM();
  return isIAMReady ? hasMinLevel(maxLevel) : false;
}