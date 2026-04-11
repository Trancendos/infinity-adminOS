/**
 * Dispatch Worker — Router
 * ═══════════════════════════════════════════════════════════════
 * The OS kernel routing engine.
 *
 * Request flow:
 *   1. Extract tenantId from hostname / header / path
 *   2. Get TenantDO stub → call resolveRoute(path, method)
 *   3. Dispatch to the target User Worker via Workers for Platforms
 *   4. Or route to a built-in system worker (auth, admin, etc.)
 *
 * Tenant resolution priority:
 *   1. Custom domain → D1 lookup → tenantId
 *   2. Subdomain:    {tenant}.app.trancendos.com → tenantId
 *   3. Header:       X-Tenant-ID → tenantId
 *   4. Path prefix:  /t/{tenantId}/... → tenantId
 */

import type {
  Env,
  TenantIdentity,
  ResolvedRoute,
  RequestContext,
} from './types';
import { DispatchError, errorResponse } from './types';

// ─── System Workers (built-in, not per-tenant) ─────────────────

const SYSTEM_ROUTES: Record<string, string> = {
  '/_system/health':    '__system_health',
  '/_system/metrics':   '__system_metrics',
  '/_system/admin':     '__system_admin',
  '/_dispatch/status':  '__dispatch_status',
};

// ─── Tenant Resolution ──────────────────────────────────────────

/**
 * Resolve the tenant identity from the incoming request.
 * Tries multiple strategies in priority order.
 */
export async function resolveTenant(
  request: Request,
  env: Env,
): Promise<TenantIdentity | null> {
  const url = new URL(request.url);
  let tenantId: string | null = null;

  // Strategy 1: Custom domain lookup (D1)
  tenantId = await resolveByCustomDomain(url.hostname, env);
  if (tenantId) return await fetchTenantIdentity(tenantId, env);

  // Strategy 2: Subdomain extraction
  tenantId = resolveBySubdomain(url.hostname);
  if (tenantId) return await fetchTenantIdentity(tenantId, env);

  // Strategy 3: X-Tenant-ID header
  tenantId = request.headers.get('X-Tenant-ID');
  if (tenantId) return await fetchTenantIdentity(tenantId, env);

  // Strategy 4: Path prefix /t/{tenantId}/...
  tenantId = resolveByPathPrefix(url.pathname);
  if (tenantId) return await fetchTenantIdentity(tenantId, env);

  return null;
}

/**
 * Look up a custom domain in D1 to find the owning tenant.
 */
async function resolveByCustomDomain(
  hostname: string,
  env: Env,
): Promise<string | null> {
  try {
    const row = await env.DB.prepare(
      'SELECT tenant_id FROM custom_domains WHERE domain = ? AND active = 1',
    )
      .bind(hostname)
      .first<{ tenant_id: string }>();
    return row?.tenant_id ?? null;
  } catch {
    // D1 not provisioned yet or table doesn't exist — graceful fallback
    return null;
  }
}

/**
 * Extract tenantId from subdomain: {tenant}.app.trancendos.com
 */
function resolveBySubdomain(hostname: string): string | null {
  // Match: {tenant}.app.trancendos.com or {tenant}.trancendos.dev
  const patterns = [
    /^([a-z0-9][a-z0-9-]{0,62})\.app\.trancendos\.com$/i,
    /^([a-z0-9][a-z0-9-]{0,62})\.trancendos\.dev$/i,
    /^([a-z0-9][a-z0-9-]{0,62})\.trancendos\.ai$/i,
  ];

  for (const pattern of patterns) {
    const match = hostname.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Extract tenantId from path: /t/{tenantId}/rest/of/path
 */
function resolveByPathPrefix(pathname: string): string | null {
  const match = pathname.match(/^\/t\/([a-z0-9][a-z0-9-]{0,62})\//i);
  return match ? match[1] : null;
}

/**
 * Fetch the full tenant identity from D1.
 * Includes caching via KV for hot-path performance.
 */
async function fetchTenantIdentity(
  tenantId: string,
  env: Env,
): Promise<TenantIdentity | null> {
  // 1. Check KV cache first (60s TTL)
  const cacheKey = `tenant:${tenantId}`;
  try {
    const cached = await env.CACHE.get(cacheKey, 'json');
    if (cached) return cached as TenantIdentity;
  } catch {
    // Cache miss or error — continue to D1
  }

  // 2. Fetch from D1
  try {
    const row = await env.DB.prepare(
      'SELECT tenant_id, name, plan, status, domain FROM tenants WHERE tenant_id = ?',
    )
      .bind(tenantId)
      .first<{
        tenant_id: string;
        name: string;
        plan: TenantIdentity['plan'];
        status: TenantIdentity['status'];
        domain?: string;
      }>();

    if (!row) return null;

    const identity: TenantIdentity = {
      tenantId: row.tenant_id,
      plan: row.plan,
      status: row.status,
      domain: row.domain,
    };

    // 3. Cache in KV (60s TTL)
    try {
      await env.CACHE.put(cacheKey, JSON.stringify(identity), {
        expirationTtl: 60,
      });
    } catch {
      // Non-critical — continue without cache
    }

    return identity;
  } catch {
    // D1 not provisioned yet — return a minimal identity for development
    return null;
  }
}

// ─── Route Resolution ───────────────────────────────────────────

/**
 * Resolve the target worker for a request by consulting TenantDO.
 */
export async function resolveRoute(
  request: Request,
  tenant: TenantIdentity,
  env: Env,
): Promise<ResolvedRoute | null> {
  const url = new URL(request.url);
  let pathname = url.pathname;

  // Strip /t/{tenantId} prefix if present
  const prefixMatch = pathname.match(/^\/t\/[a-z0-9][a-z0-9-]{0,62}(\/.*)/i);
  if (prefixMatch) {
    pathname = prefixMatch[1];
  }

  try {
    // Get the TenantDO stub for this tenant
    const doId = env.TENANT_DO.idFromName(`tenant:${tenant.tenantId}`);
    const stub = env.TENANT_DO.get(doId);

    // Call RPC method to resolve the route
    // TenantDO.resolveRoute returns the matching RouteConfig or null
    const route = await (stub as any).resolveRoute(pathname, request.method);

    if (!route) return null;

    return {
      tenantId: tenant.tenantId,
      targetWorker: route.targetWorker,
      pathPattern: route.pathPattern,
      auth: route.auth ?? false,
      rateLimit: route.rateLimit,
    };
  } catch (error) {
    console.error(`[router] TenantDO RPC error for ${tenant.tenantId}:`, error);
    return null;
  }
}

// ─── Request Dispatch ───────────────────────────────────────────

/**
 * Dispatch the request to the target worker via Workers for Platforms.
 */
export async function dispatchToWorker(
  request: Request,
  route: ResolvedRoute,
  ctx: RequestContext,
  env: Env,
): Promise<Response> {
  try {
    // Get the User Worker from the dispatcher
    const userWorker = env.DISPATCHER.get(route.targetWorker);

    // Forward the request with tenant context headers
    const forwardedRequest = new Request(request.url, {
      method: request.method,
      headers: enrichHeaders(request.headers, ctx),
      body: request.body,
    });

    const response = await userWorker.fetch(forwardedRequest);
    return response;
  } catch (error) {
    console.error(
      `[dispatch] Worker fetch error for ${route.targetWorker}:`,
      error,
    );
    return errorResponse(
      DispatchError.WORKER_ERROR,
      `Worker '${route.targetWorker}' execution failed`,
      502,
      ctx.requestId,
    );
  }
}

/**
 * Enrich the forwarded request headers with tenant context.
 */
function enrichHeaders(
  original: Headers,
  ctx: RequestContext,
): Headers {
  const headers = new Headers(original);

  // Inject tenant context for downstream workers
  headers.set('X-Request-ID', ctx.requestId);
  headers.set('X-Dispatch-Time', ctx.startTime.toString());

  if (ctx.tenant) {
    headers.set('X-Tenant-ID', ctx.tenant.tenantId);
    headers.set('X-Tenant-Plan', ctx.tenant.plan);
  }

  if (ctx.auth?.authenticated) {
    headers.set('X-User-ID', ctx.auth.userId ?? '');
    headers.set('X-User-Scopes', ctx.auth.scopes?.join(',') ?? '');
  }

  return headers;
}

// ─── System Routes ──────────────────────────────────────────────

/**
 * Check if this is a system route (not tenant-specific).
 */
export function isSystemRoute(pathname: string): boolean {
  return pathname.startsWith('/_system/') || pathname.startsWith('/_dispatch/');
}

/**
 * Handle system routes (health, metrics, admin).
 */
export function handleSystemRoute(
  pathname: string,
  requestId: string,
): Response {
  switch (pathname) {
    case '/_dispatch/status':
    case '/_system/health':
      return new Response(
        JSON.stringify({
          status: 'healthy',
          service: 'dispatch-kernel',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          requestId,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
          },
        },
      );

    case '/_system/metrics':
      return new Response(
        JSON.stringify({
          message: 'Metrics endpoint — connect to Analytics Engine',
          requestId,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );

    default:
      return errorResponse(
        DispatchError.ROUTE_NOT_FOUND,
        `System route '${pathname}' not found`,
        404,
        requestId,
      );
  }
}