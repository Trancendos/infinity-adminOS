// ============================================================
// Infinity OS — Auth Routes
// /api/v1/auth/register
// /api/v1/auth/login
// /api/v1/auth/logout
// /api/v1/auth/refresh
// /api/v1/auth/me
// ============================================================

import { Env, TokenPayload, RegisterRequest, LoginRequest, RefreshRequest, ROLE_PERMISSIONS, TokenResponse, PublicUser } from '../types';
import { hashPassword, verifyPassword, signJWT, verifyJWT, generateId, hashToken } from '../crypto';
import { jsonResponse, errorResponse } from '../middleware/cors';
import { requireAuth, isAuthContext } from '../middleware/auth';
import { createUser, getUserByEmail, getUserById, createSession, getSessionByRefreshHash, deleteSession, deleteUserSessions, createOrganisation, logAuditEvent } from '../db';

// ── Token helpers ─────────────────────────────────────────

function getExpiryMinutes(env: Env): number {
  return parseInt(env.TOKEN_EXPIRY_MINUTES ?? '60', 10);
}

function getRefreshExpiryDays(env: Env): number {
  return parseInt(env.REFRESH_EXPIRY_DAYS ?? '30', 10);
}

async function buildTokenResponse(
  env: Env,
  user: { id: string; email: string; role: string; organisation_id: string | null; display_name: string; is_active: boolean },
  request: Request,
): Promise<TokenResponse> {
  const now = Math.floor(Date.now() / 1000);
  const expiryMinutes = getExpiryMinutes(env);
  const refreshDays = getRefreshExpiryDays(env);

  const accessPayload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    organisation_id: user.organisation_id,
    type: 'access',
    iat: now,
    exp: now + expiryMinutes * 60,
  };

  const refreshPayload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    organisation_id: user.organisation_id,
    type: 'refresh',
    iat: now,
    exp: now + refreshDays * 86400,
  };

  const accessToken = await signJWT(accessPayload, env.SECRET_KEY);
  const refreshToken = await signJWT(refreshPayload, env.SECRET_KEY);
  const refreshHash = await hashToken(refreshToken);

  // Store session
  const expiresAt = new Date(Date.now() + refreshDays * 86400 * 1000).toISOString();
  await createSession(env, {
    user_id: user.id,
    refresh_token_hash: refreshHash,
    expires_at: expiresAt,
    ip_address: request.headers.get('CF-Connecting-IP'),
    user_agent: request.headers.get('User-Agent'),
  });

  const permissions = ROLE_PERMISSIONS[user.role] ?? ROLE_PERMISSIONS['member'];

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: expiryMinutes * 60,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      organisation_id: user.organisation_id,
      is_active: user.is_active,
      permissions,
    },
  };
}

// ── POST /api/v1/auth/register ────────────────────────────

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: RegisterRequest;
  try {
    body = await request.json() as RegisterRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400, request, env);
  }

  const { email, password, display_name } = body;

  // Validation
  if (!email || !password || !display_name) {
    return errorResponse('email, password and display_name are required', 400, request, env);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse('Invalid email address', 400, request, env);
  }
  if (password.length < 8) {
    return errorResponse('Password must be at least 8 characters', 400, request, env);
  }
  if (display_name.trim().length < 2) {
    return errorResponse('Display name must be at least 2 characters', 400, request, env);
  }

  // Check existing user
  const existing = await getUserByEmail(env, email);
  if (existing) {
    return errorResponse('An account with this email already exists', 409, request, env);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create personal organisation
  const org = await createOrganisation(env, {
    name: `${display_name.trim()}'s Organisation`,
    owner_id: 'pending', // will update after user creation
  });

  // Create user
  const user = await createUser(env, {
    email,
    display_name: display_name.trim(),
    password_hash: passwordHash,
    role: 'admin', // first user of their org gets admin
    organisation_id: org.id,
  });

  // Update org owner
  await env.DB.prepare('UPDATE organisations SET owner_id = ? WHERE id = ?')
    .bind(user.id, org.id)
    .run();

  // Log audit event
  await logAuditEvent(env, {
    user_id: user.id,
    event_type: 'user.registered',
    ip_address: request.headers.get('CF-Connecting-IP'),
    metadata: { email, display_name },
  });

  const tokenResponse = await buildTokenResponse(env, user, request);
  return jsonResponse(tokenResponse, 201, {}, request, env);
}

// ── POST /api/v1/auth/login ───────────────────────────────

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: LoginRequest;
  try {
    body = await request.json() as LoginRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400, request, env);
  }

  const { email, password } = body;

  if (!email || !password) {
    return errorResponse('email and password are required', 400, request, env);
  }

  const user = await getUserByEmail(env, email);
  if (!user) {
    // Timing-safe: still hash to prevent user enumeration
    await hashPassword(password);
    return errorResponse('Invalid email or password', 401, request, env);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await logAuditEvent(env, {
      user_id: user.id,
      event_type: 'auth.login_failed',
      ip_address: request.headers.get('CF-Connecting-IP'),
    });
    return errorResponse('Invalid email or password', 401, request, env);
  }

  await logAuditEvent(env, {
    user_id: user.id,
    event_type: 'auth.login',
    ip_address: request.headers.get('CF-Connecting-IP'),
  });

  const tokenResponse = await buildTokenResponse(env, user, request);
  return jsonResponse(tokenResponse, 200, {}, request, env);
}

// ── POST /api/v1/auth/logout ──────────────────────────────

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!isAuthContext(auth)) return auth;

  // Delete all sessions for this user
  await deleteUserSessions(env, auth.userId);

  await logAuditEvent(env, {
    user_id: auth.userId,
    event_type: 'auth.logout',
    ip_address: request.headers.get('CF-Connecting-IP'),
  });

  return jsonResponse({ message: 'Logged out successfully' }, 200, {}, request, env);
}

// ── POST /api/v1/auth/refresh ─────────────────────────────

export async function handleRefresh(request: Request, env: Env): Promise<Response> {
  let body: RefreshRequest;
  try {
    body = await request.json() as RefreshRequest;
  } catch {
    return errorResponse('Invalid JSON body', 400, request, env);
  }

  const { refresh_token } = body;
  if (!refresh_token) {
    return errorResponse('refresh_token is required', 400, request, env);
  }

  // Verify JWT
  const payload = await verifyJWT<TokenPayload>(refresh_token, env.SECRET_KEY);
  if (!payload || payload.type !== 'refresh') {
    return errorResponse('Invalid or expired refresh token', 401, request, env);
  }

  // Check session exists in DB
  const tokenHash = await hashToken(refresh_token);
  const session = await getSessionByRefreshHash(env, tokenHash);
  if (!session) {
    return errorResponse('Session not found or expired', 401, request, env);
  }

  // Get user
  const user = await getUserById(env, payload.sub);
  if (!user) {
    return errorResponse('User not found', 401, request, env);
  }

  // Rotate: delete old session, create new tokens
  await deleteSession(env, session.id);

  const tokenResponse = await buildTokenResponse(env, user, request);
  return jsonResponse(tokenResponse, 200, {}, request, env);
}

// ── GET /api/v1/auth/me ───────────────────────────────────

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!isAuthContext(auth)) return auth;

  const user = await getUserById(env, auth.userId);
  if (!user) {
    return errorResponse('User not found', 404, request, env);
  }

  const permissions = ROLE_PERMISSIONS[user.role] ?? ROLE_PERMISSIONS['member'];

  const publicUser: PublicUser = {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    organisation_id: user.organisation_id,
    is_active: user.is_active,
    permissions,
  };

  return jsonResponse(publicUser, 200, {}, request, env);
}