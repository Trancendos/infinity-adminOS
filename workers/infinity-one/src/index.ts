/**
 * INFINITY-ONE Cloudflare Worker — Phase 29 Cloudflare-Native Refactor
 * Central Account Management Hub
 * 
 * 100% Cloudflare: D1 + KV + Zero third-party deps
 * Replaces Supabase REST client with native D1 queries
 */

export interface Env {
  DB: D1Database;
  KV_SESSIONS: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  LIGHTHOUSE_URL: string;
  HIVE_URL: string;
  INTERNAL_SECRET: string;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

// ============================================================
// HELPERS
// ============================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(message: string, status = 400, code = 'ERROR'): Response {
  return jsonResponse({ error: { message, code, status }, timestamp: new Date().toISOString() }, status);
}

// ============================================================
// D1 HELPERS
// ============================================================

async function d1Query<T = Record<string, unknown>>(db: D1Database, sql: string, params: unknown[] = []): Promise<{ data: T[] | null; error: string | null }> {
  try {
    const result = await db.prepare(sql).bind(...params).all<T>();
    return { data: result.results as T[], error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function d1Run(db: D1Database, sql: string, params: unknown[] = []): Promise<{ success: boolean; meta?: { last_row_id?: number }; error: string | null }> {
  try {
    const result = await db.prepare(sql).bind(...params).run();
    return { success: true, meta: result.meta, error: null };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================
// RATE LIMITING
// ============================================================

async function checkRateLimit(kv: KVNamespace, key: string, max: number, window: number): Promise<boolean> {
  const k = `rl:${key}`;
  const cur = parseInt((await kv.get(k)) ?? '0', 10);
  if (cur >= max) return false;
  await kv.put(k, String(cur + 1), { expirationTtl: window });
  return true;
}

// ============================================================
// CRYPTO — PBKDF2 password hashing + HS256 JWT (Web Crypto API)
// ============================================================

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:310000:${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [, , saltHex, hashHex] = stored.split(':');
    const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
      keyMaterial,
      256,
    );
    const computedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    // Constant-time comparison
    if (computedHex.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < computedHex.length; i++) diff |= computedHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sigB64}`;
}

async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const data = `${header}.${body}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// SCHEMA INIT
// ============================================================

async function initSchema(db: D1Database): Promise<void> {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS infinity_one_users (
      user_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_secret TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS infinity_one_sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS infinity_one_webauthn_credentials (
      credential_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      device_type TEXT,
      backed_up INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_io_users_email ON infinity_one_users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_io_sessions_user ON infinity_one_sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_io_sessions_expires ON infinity_one_sessions(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_io_webauthn_user ON infinity_one_webauthn_credentials(user_id)`,
  ];
  for (const sql of stmts) {
    await db.prepare(sql).run().catch(console.error);
  }
}

// ============================================================
// AUTH HELPERS
// ============================================================

async function getAuthUser(request: Request, env: Env): Promise<{ user_id: string; email: string; role: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload?.user_id) return null;

  // Check session in KV cache first
  const sessionKey = `session:${payload.user_id}:${payload.session_id}`;
  const cached = await env.KV_SESSIONS.get(sessionKey);
  if (!cached) return null;

  return { user_id: payload.user_id as string, email: payload.email as string, role: payload.role as string };
}

// ============================================================
// HANDLERS
// ============================================================

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rl = await checkRateLimit(env.KV_RATE_LIMIT, `register:${ip}`, 5, 3600);
  if (!rl) return errorResponse('Rate limit exceeded. Max 5 registrations per hour per IP.', 429, 'RATE_LIMIT');

  const body = await request.json<{ email: string; password: string; username?: string; display_name?: string }>();
  if (!body?.email || !body?.password) return errorResponse('email and password required', 400);
  if (body.password.length < 8) return errorResponse('Password must be at least 8 characters', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return errorResponse('Invalid email format', 400);

  const { data: existing } = await d1Query(env.DB, 'SELECT user_id FROM infinity_one_users WHERE email = ?', [body.email.toLowerCase()]);
  if (existing?.length) return errorResponse('Email already registered', 409, 'EMAIL_EXISTS');

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(body.password);

  await d1Run(env.DB,
    'INSERT INTO infinity_one_users (user_id, email, username, password_hash, display_name, role, status, mfa_enabled, email_verified, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [userId, body.email.toLowerCase(), body.username ?? null, passwordHash, body.display_name ?? null, 'user', 'active', 0, 0, '{}', now, now],
  );

  return jsonResponse({ user_id: userId, email: body.email.toLowerCase(), status: 'active', created_at: now }, 201);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rl = await checkRateLimit(env.KV_RATE_LIMIT, `login:${ip}`, 10, 900);
  if (!rl) return errorResponse('Rate limit exceeded. Try again in 15 minutes.', 429, 'RATE_LIMIT');

  const body = await request.json<{ email: string; password: string }>();
  if (!body?.email || !body?.password) return errorResponse('email and password required', 400);

  const { data } = await d1Query<{ user_id: string; email: string; password_hash: string; role: string; status: string; mfa_enabled: number }>(
    env.DB, 'SELECT user_id, email, password_hash, role, status, mfa_enabled FROM infinity_one_users WHERE email = ?', [body.email.toLowerCase()],
  );
  if (!data?.length) return errorResponse('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  const user = data[0];
  if (user.status !== 'active') return errorResponse('Account suspended', 403, 'ACCOUNT_SUSPENDED');

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) return errorResponse('Invalid credentials', 401, 'INVALID_CREDENTIALS');

  // Create session
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  const payload = {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    session_id: sessionId,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(now.getTime() / 1000) + 86400,
  };

  const token = await signJwt(payload, env.JWT_SECRET);
  const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));

  // Store session in D1
  await d1Run(env.DB,
    'INSERT INTO infinity_one_sessions (session_id, user_id, token_hash, ip_address, user_agent, expires_at, created_at, last_used_at) VALUES (?,?,?,?,?,?,?,?)',
    [sessionId, user.user_id, tokenHash, ip, request.headers.get('User-Agent') ?? null, expiresAt, now.toISOString(), now.toISOString()],
  );

  // Cache session in KV for fast auth checks
  await env.KV_SESSIONS.put(
    `session:${user.user_id}:${sessionId}`,
    JSON.stringify({ user_id: user.user_id, email: user.email, role: user.role }),
    { expirationTtl: 86400 },
  );

  // Update last login
  await d1Run(env.DB, 'UPDATE infinity_one_users SET last_login_at = ? WHERE user_id = ?', [now.toISOString(), user.user_id]);

  return jsonResponse({ access_token: token, token_type: 'bearer', expires_at: expiresAt, user: { user_id: user.user_id, email: user.email, role: user.role } });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return errorResponse('No token provided', 400);
  const token = authHeader.slice(7);
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload?.session_id) return jsonResponse({ message: 'Logged out' });

  // Remove from KV and D1
  await env.KV_SESSIONS.delete(`session:${payload.user_id}:${payload.session_id}`);
  await d1Run(env.DB, 'DELETE FROM infinity_one_sessions WHERE session_id = ?', [payload.session_id]);

  return jsonResponse({ message: 'Logged out successfully' });
}

async function handleVerifyToken(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_SECRET) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json<{ token: string }>();
  if (!body?.token) return errorResponse('token required', 400);

  const payload = await verifyJwt(body.token, env.JWT_SECRET);
  if (!payload) return errorResponse('Invalid or expired token', 401, 'INVALID_TOKEN');

  const sessionKey = `session:${payload.user_id}:${payload.session_id}`;
  const session = await env.KV_SESSIONS.get(sessionKey);
  if (!session) return errorResponse('Session not found or expired', 401, 'SESSION_EXPIRED');

  return jsonResponse({ valid: true, user_id: payload.user_id, email: payload.email, role: payload.role, session_id: payload.session_id });
}

async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const { data } = await d1Query(env.DB,
    'SELECT user_id, email, username, display_name, avatar_url, role, status, mfa_enabled, email_verified, created_at, last_login_at FROM infinity_one_users WHERE user_id = ?',
    [authUser.user_id],
  );
  if (!data?.length) return errorResponse('User not found', 404, 'NOT_FOUND');
  return jsonResponse(data[0]);
}

async function handleUpdateMe(request: Request, env: Env): Promise<Response> {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json<{ display_name?: string; username?: string; avatar_url?: string }>();
  const now = new Date().toISOString();

  if (body.username) {
    const { data: existing } = await d1Query(env.DB, 'SELECT user_id FROM infinity_one_users WHERE username = ? AND user_id != ?', [body.username, authUser.user_id]);
    if (existing?.length) return errorResponse('Username already taken', 409, 'USERNAME_TAKEN');
  }

  await d1Run(env.DB,
    'UPDATE infinity_one_users SET display_name = COALESCE(?, display_name), username = COALESCE(?, username), avatar_url = COALESCE(?, avatar_url), updated_at = ? WHERE user_id = ?',
    [body.display_name ?? null, body.username ?? null, body.avatar_url ?? null, now, authUser.user_id],
  );

  return jsonResponse({ user_id: authUser.user_id, updated: true, updated_at: now });
}

async function handleDeleteMe(request: Request, env: Env): Promise<Response> {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  // GDPR erasure — anonymise rather than hard delete
  const now = new Date().toISOString();
  await d1Run(env.DB,
    "UPDATE infinity_one_users SET email = ?, username = NULL, display_name = 'Deleted User', password_hash = 'DELETED', status = 'deleted', updated_at = ? WHERE user_id = ?",
    [`deleted_${authUser.user_id}@void.invalid`, now, authUser.user_id],
  );
  await d1Run(env.DB, 'DELETE FROM infinity_one_sessions WHERE user_id = ?', [authUser.user_id]);

  return jsonResponse({ message: 'Account deleted. Your data has been anonymised per GDPR Article 17.' });
}

async function handleGetUser(userId: string, env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB,
    'SELECT user_id, email, username, display_name, role, status, created_at FROM infinity_one_users WHERE user_id = ?',
    [userId],
  );
  if (!data?.length) return errorResponse('User not found', 404, 'NOT_FOUND');
  return jsonResponse(data[0]);
}

async function handleListUsers(env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB,
    "SELECT user_id, email, username, display_name, role, status, created_at FROM infinity_one_users WHERE status != 'deleted' ORDER BY created_at DESC LIMIT 100",
  );
  return jsonResponse({ users: data ?? [], count: data?.length ?? 0 });
}

async function handleSuspendUser(userId: string, env: Env): Promise<Response> {
  await d1Run(env.DB, 'UPDATE infinity_one_users SET status = ?, updated_at = ? WHERE user_id = ?', ['suspended', new Date().toISOString(), userId]);
  return jsonResponse({ user_id: userId, status: 'suspended' });
}

async function handleHealth(env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB, "SELECT COUNT(*) as count FROM infinity_one_users WHERE status = 'active'");
  return jsonResponse({
    status: 'healthy',
    service: 'infinity-one',
    version: '2.0.0',
    environment: env.ENVIRONMENT,
    active_users: (data?.[0] as { count: number })?.count ?? 0,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// MAIN FETCH HANDLER
// ============================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-Secret',
        },
      });
    }

    await initSchema(env.DB).catch(console.error);

    try {
      if (method === 'GET' && path === '/health') return handleHealth(env);

      // Auth routes
      if (method === 'POST' && path === '/auth/register') return handleRegister(request, env);
      if (method === 'POST' && path === '/auth/login') return handleLogin(request, env);
      if (method === 'POST' && path === '/auth/logout') return handleLogout(request, env);
      if (method === 'POST' && path === '/auth/verify') return handleVerifyToken(request, env);

      // User routes
      if (method === 'GET' && path === '/users/me') return handleGetMe(request, env);
      if (method === 'PATCH' && path === '/users/me') return handleUpdateMe(request, env);
      if (method === 'DELETE' && path === '/users/me') return handleDeleteMe(request, env);
      if (method === 'GET' && path === '/users') return handleListUsers(env);

      const userMatch = path.match(/^\/users\/([\w-]+)$/);
      if (userMatch) {
        const userId = userMatch[1];
        if (method === 'GET') return handleGetUser(userId, env);
      }

      const suspendMatch = path.match(/^\/users\/([\w-]+)\/suspend$/);
      if (suspendMatch && method === 'POST') return handleSuspendUser(suspendMatch[1], env);

      return errorResponse('Not found', 404, 'NOT_FOUND');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Internal server error';
      console.error('INFINITY-ONE error:', msg);
      return errorResponse(msg, 500, 'INTERNAL_ERROR');
    }
  },
};