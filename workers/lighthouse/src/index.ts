/**
 * LIGHTHOUSE Cloudflare Worker — Phase 29 Cloudflare-Native Refactor
 * Cryptographic Token Management Hub
 * 
 * 100% Cloudflare: D1 + KV + Zero third-party deps
 */

export interface Env {
  DB: D1Database;
  KV_TOKEN_CACHE: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  HIVE_URL: string;
  VOID_URL: string;
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

async function d1Run(db: D1Database, sql: string, params: unknown[] = []): Promise<{ success: boolean; error: string | null }> {
  try {
    await db.prepare(sql).bind(...params).run();
    return { success: true, error: null };
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
// JWT (HS256) — Web Crypto API, zero npm deps
// ============================================================

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
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
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
    `CREATE TABLE IF NOT EXISTS lighthouse_entity_tokens (
      token_id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'user',
      token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      risk_level TEXT NOT NULL DEFAULT 'low',
      classification TEXT NOT NULL DEFAULT 'standard',
      issued_at TEXT NOT NULL,
      expires_at TEXT,
      last_activity_at TEXT,
      revoked_at TEXT,
      revoke_reason TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE TABLE IF NOT EXISTS lighthouse_threat_events (
      event_id TEXT PRIMARY KEY,
      entity_id TEXT,
      token_id TEXT,
      severity TEXT NOT NULL DEFAULT 'low',
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      source_ip TEXT,
      evidence TEXT NOT NULL DEFAULT '{}',
      resolved_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS lighthouse_warp_transfers (
      transfer_id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL,
      source_zone TEXT NOT NULL,
      target_zone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload_hash TEXT,
      initiated_at TEXT NOT NULL,
      completed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_lh_tokens_entity ON lighthouse_entity_tokens(entity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_lh_tokens_status ON lighthouse_entity_tokens(status)`,
    `CREATE INDEX IF NOT EXISTS idx_lh_threats_status ON lighthouse_threat_events(status)`,
    `CREATE INDEX IF NOT EXISTS idx_lh_threats_severity ON lighthouse_threat_events(severity)`,
  ];
  for (const sql of stmts) {
    await db.prepare(sql).run().catch(console.error);
  }
}

// ============================================================
// HANDLERS
// ============================================================

async function handleIssueToken(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_SECRET) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json<{ entity_id: string; entity_type?: string; classification?: string; ttl_seconds?: number; metadata?: unknown }>();
  if (!body?.entity_id) return errorResponse('entity_id required', 400);

  const tokenId = crypto.randomUUID();
  const now = new Date();
  const ttl = body.ttl_seconds ?? 86400;
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();

  const payload = {
    token_id: tokenId,
    entity_id: body.entity_id,
    entity_type: body.entity_type ?? 'user',
    classification: body.classification ?? 'standard',
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(now.getTime() / 1000) + ttl,
  };

  const jwt = await signJwt(payload, env.JWT_SECRET);
  const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jwt))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));

  await d1Run(env.DB,
    'INSERT INTO lighthouse_entity_tokens (token_id, entity_id, entity_type, token_hash, status, risk_level, classification, issued_at, expires_at, metadata) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [tokenId, body.entity_id, body.entity_type ?? 'user', tokenHash, 'active', 'low', body.classification ?? 'standard', now.toISOString(), expiresAt, JSON.stringify(body.metadata ?? {})],
  );

  return jsonResponse({ token_id: tokenId, token: jwt, expires_at: expiresAt, entity_id: body.entity_id }, 201);
}

async function handleVerifyToken(tokenId: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ token: string }>().catch(() => ({ token: '' }));
  const token = body?.token ?? request.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!token) return errorResponse('token required', 400);

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) return errorResponse('Invalid or expired token', 401, 'INVALID_TOKEN');
  if (payload.token_id !== tokenId) return errorResponse('Token ID mismatch', 401, 'TOKEN_MISMATCH');

  const { data } = await d1Query<{ status: string; risk_level: string }>(
    env.DB, 'SELECT status, risk_level FROM lighthouse_entity_tokens WHERE token_id = ?', [tokenId],
  );
  if (!data?.length) return errorResponse('Token not found', 404, 'NOT_FOUND');
  if (data[0].status !== 'active') return errorResponse('Token is not active', 401, 'TOKEN_INACTIVE');

  await d1Run(env.DB, 'UPDATE lighthouse_entity_tokens SET last_activity_at = ? WHERE token_id = ?', [new Date().toISOString(), tokenId]);
  return jsonResponse({ valid: true, token_id: tokenId, entity_id: payload.entity_id, risk_level: data[0].risk_level });
}

async function handleRevokeToken(tokenId: string, request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_SECRET) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json<{ reason?: string }>().catch(() => ({}));
  const now = new Date().toISOString();
  await d1Run(env.DB, 'UPDATE lighthouse_entity_tokens SET status = ?, revoked_at = ?, revoke_reason = ? WHERE token_id = ?',
    ['revoked', now, body?.reason ?? 'manual_revoke', tokenId]);

  // Invalidate KV cache
  await env.KV_TOKEN_CACHE.delete(`token:${tokenId}`).catch(() => {});
  return jsonResponse({ token_id: tokenId, status: 'revoked', revoked_at: now });
}

async function handleGetToken(tokenId: string, env: Env): Promise<Response> {
  const cached = await env.KV_TOKEN_CACHE.get(`token:${tokenId}`);
  if (cached) return jsonResponse(JSON.parse(cached));

  const { data } = await d1Query(env.DB,
    'SELECT token_id, entity_id, entity_type, status, risk_level, classification, issued_at, expires_at, last_activity_at FROM lighthouse_entity_tokens WHERE token_id = ?',
    [tokenId],
  );
  if (!data?.length) return errorResponse('Token not found', 404, 'NOT_FOUND');

  await env.KV_TOKEN_CACHE.put(`token:${tokenId}`, JSON.stringify(data[0]), { expirationTtl: 300 });
  return jsonResponse(data[0]);
}

async function handleUpdateRisk(tokenId: string, request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_SECRET) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json<{ risk_level: string }>();
  if (!body?.risk_level) return errorResponse('risk_level required', 400);
  if (!['low', 'medium', 'high', 'critical'].includes(body.risk_level)) return errorResponse('Invalid risk_level', 400);

  await d1Run(env.DB, 'UPDATE lighthouse_entity_tokens SET risk_level = ? WHERE token_id = ?', [body.risk_level, tokenId]);
  await env.KV_TOKEN_CACHE.delete(`token:${tokenId}`).catch(() => {});
  return jsonResponse({ token_id: tokenId, risk_level: body.risk_level });
}

async function handleCreateThreat(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_SECRET) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json<{ entity_id?: string; token_id?: string; severity: string; type: string; description: string; source_ip?: string; evidence?: unknown }>();
  if (!body?.severity || !body?.type || !body?.description) return errorResponse('severity, type, description required', 400);

  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Run(env.DB,
    'INSERT INTO lighthouse_threat_events (event_id, entity_id, token_id, severity, type, description, status, source_ip, evidence, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [eventId, body.entity_id ?? null, body.token_id ?? null, body.severity, body.type, body.description, 'open', body.source_ip ?? null, JSON.stringify(body.evidence ?? {}), now],
  );

  return jsonResponse({ event_id: eventId, severity: body.severity, status: 'open', created_at: now }, 201);
}

async function handleListThreats(env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB, 'SELECT * FROM lighthouse_threat_events ORDER BY created_at DESC LIMIT 100');
  return jsonResponse({ threats: data ?? [], count: data?.length ?? 0 });
}

async function handleMetrics(env: Env): Promise<Response> {
  const [tokensResult, threatsResult, warpsResult] = await Promise.all([
    d1Query<{ status: string; risk_level: string; classification: string }>(env.DB, 'SELECT status, risk_level, classification FROM lighthouse_entity_tokens'),
    d1Query<{ severity: string; status: string }>(env.DB, 'SELECT severity, status FROM lighthouse_threat_events'),
    d1Query<{ status: string }>(env.DB, 'SELECT status FROM lighthouse_warp_transfers'),
  ]);

  const tokens = tokensResult.data ?? [];
  const threats = threatsResult.data ?? [];
  const warps = warpsResult.data ?? [];

  return jsonResponse({
    tokens: {
      total: tokens.length,
      active: tokens.filter(t => t.status === 'active').length,
      by_risk: tokens.reduce((acc: Record<string, number>, t) => { acc[t.risk_level] = (acc[t.risk_level] ?? 0) + 1; return acc; }, {}),
    },
    threats: {
      total: threats.length,
      open: threats.filter(t => t.status === 'open').length,
      by_severity: threats.reduce((acc: Record<string, number>, t) => { acc[t.severity] = (acc[t.severity] ?? 0) + 1; return acc; }, {}),
    },
    warp_transfers: { total: warps.length, pending: warps.filter(w => w.status === 'pending').length },
    timestamp: new Date().toISOString(),
  });
}

async function handleHealth(env: Env): Promise<Response> {
  return jsonResponse({
    status: 'healthy',
    service: 'lighthouse',
    version: '2.0.0',
    environment: env.ENVIRONMENT,
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
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-Secret' },
      });
    }

    await initSchema(env.DB).catch(console.error);

    try {
      if (method === 'GET' && path === '/health') return handleHealth(env);
      if (method === 'GET' && path === '/metrics') return handleMetrics(env);

      // Tokens
      if (method === 'POST' && path === '/tokens') return handleIssueToken(request, env);
      if (method === 'GET' && path === '/threats') return handleListThreats(env);
      if (method === 'POST' && path === '/threats') return handleCreateThreat(request, env);

      const tokenMatch = path.match(/^\/tokens\/([\w-]+)$/);
      if (tokenMatch) {
        const tokenId = tokenMatch[1];
        if (method === 'GET') return handleGetToken(tokenId, env);
        if (method === 'POST') return errorResponse('Use /tokens/:id/verify or /tokens/:id/revoke', 400);
      }

      const tokenActionMatch = path.match(/^\/tokens\/([\w-]+)\/(verify|revoke|risk|activity)$/);
      if (tokenActionMatch) {
        const [, tokenId, action] = tokenActionMatch;
        if (action === 'verify' && method === 'POST') return handleVerifyToken(tokenId, request, env);
        if (action === 'revoke' && method === 'POST') return handleRevokeToken(tokenId, request, env);
        if (action === 'risk' && method === 'PATCH') return handleUpdateRisk(tokenId, request, env);
        if (action === 'activity' && method === 'POST') {
          await d1Run(env.DB, 'UPDATE lighthouse_entity_tokens SET last_activity_at = ? WHERE token_id = ?', [new Date().toISOString(), tokenId]);
          return jsonResponse({ token_id: tokenId, recorded: true });
        }
      }

      return errorResponse('Not found', 404, 'NOT_FOUND');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Internal server error';
      console.error('LIGHTHOUSE error:', msg);
      return errorResponse(msg, 500, 'INTERNAL_ERROR');
    }
  },
};