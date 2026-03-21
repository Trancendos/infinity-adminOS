// ============================================================
// Infinity OS — App Factory Worker
// ============================================================
// Orchestrates tenant app provisioning and lifecycle management.
//
// Routes:
//   GET  /health
//   POST /api/v1/apps                — Provision new app
//   GET  /api/v1/apps/:appId         — Get app status
//   GET  /api/v1/apps                — List tenant apps
//   PUT  /api/v1/apps/:appId/config  — Update app config
//   POST /api/v1/apps/:appId/deploy  — Trigger deployment
//   DELETE /api/v1/apps/:appId       — Deprovision app
//   GET  /api/v1/apps/:appId/logs    — Fetch build/run logs
//   GET  /api/v1/templates           — List app templates
// ============================================================

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  REGISTRY: Fetcher;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  PROVISIONING_SECRET: string;
}

// ── Types ─────────────────────────────────────────────────────

export type AppStatus =
  | 'pending'
  | 'provisioning'
  | 'active'
  | 'failed'
  | 'suspended'
  | 'deprovisioned';

export type AppTemplate =
  | 'blank'
  | 'nextjs'
  | 'react-spa'
  | 'api-only'
  | 'fullstack'
  | 'worker-only';

export interface AppProvisionRequest {
  name: string;
  tenantId: string;
  template: AppTemplate;
  region?: string;
  env?: Record<string, string>;
}

export interface AppRecord {
  id: string;
  tenantId: string;
  name: string;
  template: AppTemplate;
  status: AppStatus;
  region: string;
  deployUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentLog {
  id: string;
  appId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

// ── Constants ──────────────────────────────────────────────────

export const APP_TEMPLATES: Record<AppTemplate, { name: string; description: string; stack: string[] }> = {
  blank: {
    name: 'Blank Worker',
    description: 'Minimal Cloudflare Worker with health check',
    stack: ['cloudflare-workers', 'typescript'],
  },
  'nextjs': {
    name: 'Next.js App',
    description: 'Full Next.js application on Cloudflare Pages',
    stack: ['nextjs', 'react', 'cloudflare-pages'],
  },
  'react-spa': {
    name: 'React SPA',
    description: 'React single-page application',
    stack: ['react', 'vite', 'cloudflare-pages'],
  },
  'api-only': {
    name: 'API Worker',
    description: 'REST API worker with D1 database',
    stack: ['cloudflare-workers', 'hono', 'd1', 'typescript'],
  },
  fullstack: {
    name: 'Fullstack App',
    description: 'Full-stack app with Pages + Worker API + D1',
    stack: ['nextjs', 'cloudflare-workers', 'd1', 'kv'],
  },
  'worker-only': {
    name: 'Worker Only',
    description: 'Pure Cloudflare Worker for background tasks',
    stack: ['cloudflare-workers', 'typescript'],
  },
};

export const VALID_REGIONS = ['auto', 'wnam', 'enam', 'weur', 'eeur', 'apac'] as const;

// ── Helpers ────────────────────────────────────────────────────

export function generateAppId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `app-${ts}-${rand}`;
}

export function isValidAppName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name);
}

export function isValidTenantId(tenantId: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(tenantId);
}

export function isValidTemplate(template: string): template is AppTemplate {
  return Object.keys(APP_TEMPLATES).includes(template);
}

export function isValidRegion(region: string): boolean {
  return (VALID_REGIONS as readonly string[]).includes(region);
}

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = [
    'https://infinity-portal.pages.dev',
    'https://infinity-portal.com',
    'http://localhost:5173',
    'http://localhost:3000',
    ...(env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
  ];
  if (allowed.includes(origin) || origin.endsWith('.infinity-portal.pages.dev')) return origin;
  return null;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = getAllowedOrigin(request, env);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
    'Access-Control-Allow-Credentials': 'true',
  };
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

function jsonResponse(
  data: unknown,
  status = 200,
  request?: Request,
  env?: Env,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
      ...(request && env ? corsHeaders(request, env) : {}),
    },
  });
}

function getTenantIdFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  // In real implementation this would be decoded from JWT
  // For now, extract from X-Tenant-ID header (set by dispatch kernel)
  return request.headers.get('X-Tenant-ID');
}

// ── Route Handlers ─────────────────────────────────────────────

async function handleProvision(
  request: Request,
  env: Env,
): Promise<Response> {
  const tenantId = getTenantIdFromRequest(request);
  if (!tenantId) {
    return jsonResponse({ error: 'Authentication required' }, 401, request, env);
  }

  let body: AppProvisionRequest;
  try {
    body = await request.json() as AppProvisionRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, request, env);
  }

  // Validate inputs
  if (!body.name || !isValidAppName(body.name)) {
    return jsonResponse(
      { error: 'Invalid app name. Must be lowercase alphanumeric with hyphens, 3-64 chars.' },
      400, request, env,
    );
  }

  if (!body.template || !isValidTemplate(body.template)) {
    return jsonResponse(
      { error: `Invalid template. Choose from: ${Object.keys(APP_TEMPLATES).join(', ')}` },
      400, request, env,
    );
  }

  const region = body.region || 'auto';
  if (!isValidRegion(region)) {
    return jsonResponse(
      { error: `Invalid region. Choose from: ${VALID_REGIONS.join(', ')}` },
      400, request, env,
    );
  }

  const appId = generateAppId();
  const now = new Date().toISOString();
  const app: AppRecord = {
    id: appId,
    tenantId,
    name: body.name,
    template: body.template,
    status: 'pending',
    region,
    createdAt: now,
    updatedAt: now,
  };

  // Persist to D1
  try {
    await env.DB.prepare(
      `INSERT INTO apps (id, tenant_id, name, template, status, region, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(app.id, app.tenantId, app.name, app.template, app.status, app.region, app.createdAt, app.updatedAt).run();
  } catch (err) {
    return jsonResponse(
      { error: 'Failed to provision app', detail: String(err) },
      500, request, env,
    );
  }

  return jsonResponse({ app, message: 'App provisioning initiated' }, 202, request, env);
}

async function handleGetApp(
  request: Request,
  env: Env,
  appId: string,
): Promise<Response> {
  const tenantId = getTenantIdFromRequest(request);
  if (!tenantId) {
    return jsonResponse({ error: 'Authentication required' }, 401, request, env);
  }

  // Check cache first
  const cacheKey = `app:${tenantId}:${appId}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    try {
      return jsonResponse(JSON.parse(cached), 200, request, env);
    } catch {
      await env.CACHE.delete(cacheKey);
    }
  }

  try {
    const row = await env.DB.prepare(
      'SELECT * FROM apps WHERE id = ? AND tenant_id = ?',
    ).bind(appId, tenantId).first();

    if (!row) {
      return jsonResponse({ error: 'App not found' }, 404, request, env);
    }

    await env.CACHE.put(cacheKey, JSON.stringify(row), { expirationTtl: 30 });
    return jsonResponse(row, 200, request, env);
  } catch (err) {
    return jsonResponse({ error: 'Database error', detail: String(err) }, 500, request, env);
  }
}

async function handleListApps(
  request: Request,
  env: Env,
): Promise<Response> {
  const tenantId = getTenantIdFromRequest(request);
  if (!tenantId) {
    return jsonResponse({ error: 'Authentication required' }, 401, request, env);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    let query = 'SELECT * FROM apps WHERE tenant_id = ?';
    const binds: unknown[] = [tenantId];

    if (status) {
      query += ' AND status = ?';
      binds.push(status);
    }
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    binds.push(limit, offset);

    const result = await env.DB.prepare(query).bind(...binds).all();
    return jsonResponse(
      { apps: result.results, total: result.results.length, limit, offset },
      200, request, env,
    );
  } catch (err) {
    return jsonResponse({ error: 'Database error', detail: String(err) }, 500, request, env);
  }
}

async function handleDeploy(
  request: Request,
  env: Env,
  appId: string,
): Promise<Response> {
  const tenantId = getTenantIdFromRequest(request);
  if (!tenantId) {
    return jsonResponse({ error: 'Authentication required' }, 401, request, env);
  }

  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(
      `UPDATE apps SET status = 'provisioning', updated_at = ? WHERE id = ? AND tenant_id = ?`,
    ).bind(now, appId, tenantId).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'App not found or not owned by tenant' }, 404, request, env);
    }

    // Invalidate cache
    await env.CACHE.put(`app:${tenantId}:${appId}`, '', { expirationTtl: 1 });

    return jsonResponse(
      { message: 'Deployment triggered', appId, deployedAt: now },
      202, request, env,
    );
  } catch (err) {
    return jsonResponse({ error: 'Deployment failed', detail: String(err) }, 500, request, env);
  }
}

async function handleDeprovision(
  request: Request,
  env: Env,
  appId: string,
): Promise<Response> {
  const tenantId = getTenantIdFromRequest(request);
  if (!tenantId) {
    return jsonResponse({ error: 'Authentication required' }, 401, request, env);
  }

  try {
    const result = await env.DB.prepare(
      `UPDATE apps SET status = 'deprovisioned', updated_at = ? WHERE id = ? AND tenant_id = ?`,
    ).bind(new Date().toISOString(), appId, tenantId).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'App not found' }, 404, request, env);
    }

    return jsonResponse({ message: 'App deprovisioned', appId }, 200, request, env);
  } catch (err) {
    return jsonResponse({ error: 'Deprovision failed', detail: String(err) }, 500, request, env);
  }
}

function handleListTemplates(request: Request, env: Env): Response {
  const templates = Object.entries(APP_TEMPLATES).map(([id, info]) => ({
    id,
    ...info,
  }));
  return jsonResponse({ templates }, 200, request, env);
}

// ── Main Fetch Handler ─────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      const origin = getAllowedOrigin(request, env);
      return new Response(null, {
        status: 204,
        headers: {
          ...(origin ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-Tenant-ID',
            'Access-Control-Max-Age': '86400',
          } : {}),
          ...SECURITY_HEADERS,
        },
      });
    }

    try {
      // Health check
      if (pathname === '/health' || pathname === '/api/health') {
        return jsonResponse({
          status: 'healthy',
          service: 'app-factory',
          environment: env.ENVIRONMENT,
          timestamp: new Date().toISOString(),
          templates: Object.keys(APP_TEMPLATES).length,
          regions: VALID_REGIONS.length,
        }, 200, request, env);
      }

      // List templates — public
      if (pathname === '/api/v1/templates' && request.method === 'GET') {
        return handleListTemplates(request, env);
      }

      // App provisioning
      if (pathname === '/api/v1/apps') {
        if (request.method === 'POST') return handleProvision(request, env);
        if (request.method === 'GET') return handleListApps(request, env);
      }

      // App-specific routes
      const appMatch = pathname.match(/^\/api\/v1\/apps\/([^/]+)(\/(.+))?$/);
      if (appMatch) {
        const appId = appMatch[1];
        const subpath = appMatch[3] || '';

        if (subpath === 'deploy' && request.method === 'POST') {
          return handleDeploy(request, env, appId);
        }
        if (!subpath && request.method === 'GET') {
          return handleGetApp(request, env, appId);
        }
        if (!subpath && request.method === 'DELETE') {
          return handleDeprovision(request, env, appId);
        }
      }

      return jsonResponse({ error: `Route not found: ${request.method} ${pathname}` }, 404, request, env);
    } catch (err) {
      console.error('App Factory error:', err);
      return jsonResponse({
        error: env.ENVIRONMENT === 'production' ? 'Internal server error' : String(err),
      }, 500, request, env);
    }
  },
};