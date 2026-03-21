/**
 * Dispatch Worker — CORS Middleware
 * ═══════════════════════════════════════════════════════════════
 * Dynamic per-tenant CORS based on plan and TenantDO config.
 *
 * Enterprise tenants can override CORS via TenantDO config.
 * Other plans get sensible defaults from PLAN_CORS_DEFAULTS.
 */

import type { CORSConfig, TenantIdentity, RequestContext } from '../types';
import { PLAN_CORS_DEFAULTS } from '../types';

// ─── CORS Handler ───────────────────────────────────────────────

/**
 * Handle CORS for an incoming request.
 * Returns a preflight Response for OPTIONS, or null to continue.
 */
export function handleCORS(
  request: Request,
  ctx: RequestContext,
  customConfig?: Partial<CORSConfig>,
): Response | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null; // Not a CORS request

  const config = resolveCORSConfig(ctx.tenant, customConfig);

  // Check if origin is allowed
  if (!isOriginAllowed(origin, config.allowedOrigins)) {
    return new Response('CORS origin not allowed', {
      status: 403,
      headers: { 'X-Request-ID': ctx.requestId },
    });
  }

  // Handle preflight (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: buildCORSHeaders(origin, config, ctx.requestId),
    });
  }

  // For non-preflight, return null — headers will be added to the actual response
  return null;
}

/**
 * Add CORS headers to an existing response.
 * Creates a new Response with the headers appended (Response headers are immutable).
 */
export function addCORSHeaders(
  response: Response,
  request: Request,
  ctx: RequestContext,
  customConfig?: Partial<CORSConfig>,
): Response {
  const origin = request.headers.get('Origin');
  if (!origin) return response;

  const config = resolveCORSConfig(ctx.tenant, customConfig);

  if (!isOriginAllowed(origin, config.allowedOrigins)) {
    return response; // Don't add CORS headers for disallowed origins
  }

  const corsHeaders = buildCORSHeaders(origin, config, ctx.requestId);

  // Clone response and add headers
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ─── Internal Helpers ───────────────────────────────────────────

/**
 * Resolve the effective CORS config for a tenant.
 * Merges plan defaults with any custom overrides.
 */
function resolveCORSConfig(
  tenant?: TenantIdentity,
  customConfig?: Partial<CORSConfig>,
): CORSConfig {
  const plan = tenant?.plan ?? 'free';
  const defaults = PLAN_CORS_DEFAULTS[plan];

  if (!customConfig) return defaults;

  return {
    allowedOrigins: customConfig.allowedOrigins ?? defaults.allowedOrigins,
    allowedMethods: customConfig.allowedMethods ?? defaults.allowedMethods,
    allowedHeaders: customConfig.allowedHeaders ?? defaults.allowedHeaders,
    maxAge: customConfig.maxAge ?? defaults.maxAge,
    credentials: customConfig.credentials ?? defaults.credentials,
  };
}

/**
 * Check if an origin is in the allowed list.
 * Supports exact match, wildcard (*), and pattern matching (*.example.com).
 */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  for (const allowed of allowedOrigins) {
    // Wildcard — allow everything
    if (allowed === '*') return true;

    // Exact match
    if (allowed === origin) return true;

    // Subdomain wildcard: *.example.com matches foo.example.com
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2); // 'example.com'
      try {
        const originHost = new URL(origin).hostname;
        if (originHost.endsWith(domain) && originHost !== domain) {
          return true;
        }
      } catch {
        // Invalid origin URL
      }
    }
  }

  return false;
}

/**
 * Build the CORS response headers record.
 */
function buildCORSHeaders(
  origin: string,
  config: CORSConfig,
  requestId: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': config.allowedOrigins.includes('*') ? '*' : origin,
    'Access-Control-Allow-Methods': config.allowedMethods.join(', '),
    'Access-Control-Allow-Headers': config.allowedHeaders.join(', '),
    'Access-Control-Max-Age': config.maxAge.toString(),
    'X-Request-ID': requestId,
    'Vary': 'Origin',
  };

  if (config.credentials && !config.allowedOrigins.includes('*')) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}