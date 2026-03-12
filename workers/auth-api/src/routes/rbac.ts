// ============================================================
// Infinity OS — RBAC Routes
// /api/v1/rbac/users/me/roles
// /api/v1/rbac/evaluate
// /api/v1/rbac/switch-role
// ============================================================

import { Env, ROLE_PERMISSIONS } from '../types';
import { jsonResponse, errorResponse } from '../middleware/cors';
import { requireAuth, isAuthContext } from '../middleware/auth';
import { getUserById, updateUser } from '../db';

// ── GET /api/v1/rbac/users/me/roles ──────────────────────

export async function handleGetMyRoles(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!isAuthContext(auth)) return auth;

  const user = await getUserById(env, auth.userId);
  if (!user) return errorResponse('User not found', 404, request, env);

  const availableRoles = getAvailableRoles(user.role);

  return jsonResponse({
    roles: availableRoles.map(r => ({
      id: r,
      name: r.charAt(0).toUpperCase() + r.slice(1),
      level: ROLE_LEVELS[r] ?? 0,
      permissions: ROLE_PERMISSIONS[r] ?? [],
    })),
    active_role: user.role,
    subscription_tier: 'free',
  }, 200, {}, request, env);
}

// ── POST /api/v1/rbac/evaluate ────────────────────────────

export async function handleEvaluate(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!isAuthContext(auth)) return auth;

  let body: { permission: string; resource?: string };
  try {
    body = await request.json() as { permission: string; resource?: string };
  } catch {
    return errorResponse('Invalid JSON body', 400, request, env);
  }

  const { permission } = body;
  if (!permission) return errorResponse('permission is required', 400, request, env);

  const user = await getUserById(env, auth.userId);
  if (!user) return errorResponse('User not found', 404, request, env);

  const userPermissions = ROLE_PERMISSIONS[user.role] ?? [];
  const allowed = userPermissions.includes('*') || userPermissions.includes(permission);

  return jsonResponse({
    allowed,
    permission,
    role: user.role,
    evaluated_at: new Date().toISOString(),
  }, 200, {}, request, env);
}

// ── POST /api/v1/rbac/switch-role ─────────────────────────

export async function handleSwitchRole(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!isAuthContext(auth)) return auth;

  let body: { role: string };
  try {
    body = await request.json() as { role: string };
  } catch {
    return errorResponse('Invalid JSON body', 400, request, env);
  }

  const { role } = body;
  if (!role) return errorResponse('role is required', 400, request, env);

  const user = await getUserById(env, auth.userId);
  if (!user) return errorResponse('User not found', 404, request, env);

  // Can only switch to equal or lower roles
  const available = getAvailableRoles(user.role);
  if (!available.includes(role)) {
    return errorResponse('Role not available for your account', 403, request, env);
  }

  await updateUser(env, user.id, { role });

  return jsonResponse({
    message: `Switched to role: ${role}`,
    active_role: {
      id: role,
      name: role.charAt(0).toUpperCase() + role.slice(1),
      level: ROLE_LEVELS[role] ?? 0,
    },
  }, 200, {}, request, env);
}

// ── Helpers ───────────────────────────────────────────────

const ROLE_LEVELS: Record<string, number> = {
  superadmin: 100,
  admin: 80,
  manager: 60,
  member: 40,
  viewer: 20,
};

const ALL_ROLES = ['superadmin', 'admin', 'manager', 'member', 'viewer'];

function getAvailableRoles(currentRole: string): string[] {
  const level = ROLE_LEVELS[currentRole] ?? 0;
  return ALL_ROLES.filter(r => (ROLE_LEVELS[r] ?? 0) <= level);
}