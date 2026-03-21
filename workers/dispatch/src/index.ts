/**
 * Dispatch Worker — OS Kernel Entry Point
 * ═══════════════════════════════════════════════════════════════
 * ALL requests to the Trancendos platform enter here.
 *
 * This is the "init process" of the OS — it:
 *   1. Generates a request ID
 *   2. Handles CORS preflight
 *   3. Resolves the tenant (domain / subdomain / header / path)
 *   4. Validates tenant status (active / suspended / provisioning)
 *   5. Authenticates the request (JWT via auth middleware)
 *   6. Checks rate limits (per-tenant, per-plan)
 *   7. Resolves the target worker via TenantDO routing table
 *   8. Dispatches to the User Worker via Workers for Platforms
 *   9. Adds CORS + rate-limit headers to the response
 *  10. Returns the response with full observability headers
 *
 * Architecture:
 *   Internet → Cloudflare Edge → Dispatch Worker → TenantDO → User Worker
 *                                     ↓
 *                              D1 (tenant registry)
 *                              KV (cache + rate limits)
 *
 * Workers for Platforms:
 *   The DISPATCHER binding gives us access to all tenant User Workers
 *   deployed on the platform. Each tenant's code runs in an isolated
 *   V8 isolate with its own bindings and limits.
 */

import type { Env, RequestContext } from './types';
import { DispatchError, errorResponse } from './types';
import {
  resolveTenant,
  resolveRoute,
  dispatchToWorker,
  isSystemRoute,
  handleSystemRoute,
} from './router';
import { authenticateRequest } from './middleware/auth';
import { checkRateLimit, rateLimitHeaders, rateLimitedResponse, getEffectiveRateLimit } from './middleware/ratelimit';
import { handleCORS, addCORSHeaders } from './middleware/cors';

// ─── Main Export ────────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    cfCtx: ExecutionContext,
  ): Promise<Response> {
    // ── 1. Request Context ──────────────────────────────────────
    const ctx: RequestContext = {
      requestId: generateRequestId(),
      startTime: Date.now(),
    };

    try {
      const url = new URL(request.url);

      // ── 2. System Routes (bypass tenant resolution) ───────────
      if (isSystemRoute(url.pathname)) {
        return handleSystemRoute(url.pathname, ctx.requestId);
      }

      // ── 3. CORS Preflight (early return for OPTIONS) ──────────
      const corsResponse = handleCORS(request, ctx);
      if (corsResponse) return corsResponse;

      // ── 4. Resolve Tenant ─────────────────────────────────────
      const tenant = await resolveTenant(request, env);
      if (!tenant) {
        return errorResponse(
          DispatchError.TENANT_NOT_FOUND,
          'Unable to resolve tenant from request. Use a subdomain, X-Tenant-ID header, or /t/{tenantId}/ path prefix.',
          404,
          ctx.requestId,
        );
      }
      ctx.tenant = tenant;

      // ── 5. Validate Tenant Status ─────────────────────────────
      if (tenant.status === 'suspended') {
        return errorResponse(
          DispatchError.TENANT_SUSPENDED,
          'This tenant account has been suspended. Contact support.',
          403,
          ctx.requestId,
        );
      }
      if (tenant.status === 'provisioning') {
        return errorResponse(
          DispatchError.TENANT_PROVISIONING,
          'This tenant is still being provisioned. Please try again shortly.',
          503,
          ctx.requestId,
        );
      }

      // ── 6. Resolve Route via TenantDO ─────────────────────────
      const route = await resolveRoute(request, tenant, env);
      if (!route) {
        return errorResponse(
          DispatchError.ROUTE_NOT_FOUND,
          `No route configured for ${request.method} ${url.pathname}`,
          404,
          ctx.requestId,
        );
      }
      ctx.route = route;

      // ── 7. Authentication (if route requires it) ──────────────
      if (route.auth) {
        const auth = await authenticateRequest(request, env);
        ctx.auth = auth;

        if (!auth.authenticated) {
          const errorCode =
            auth.error === 'Token expired'
              ? DispatchError.AUTH_EXPIRED
              : auth.error === 'No authentication token provided'
                ? DispatchError.AUTH_REQUIRED
                : DispatchError.AUTH_INVALID;

          const status = errorCode === DispatchError.AUTH_REQUIRED ? 401 : 403;

          return errorResponse(errorCode, auth.error ?? 'Authentication failed', status, ctx.requestId);
        }

        // Verify tenant ID in token matches resolved tenant
        if (auth.tenantId && auth.tenantId !== tenant.tenantId) {
          return errorResponse(
            DispatchError.AUTH_INVALID,
            'Token tenant does not match resolved tenant',
            403,
            ctx.requestId,
          );
        }
      }

      // ── 8. Rate Limiting ──────────────────────────────────────
      const rlConfig = getEffectiveRateLimit(tenant, route.rateLimit);
      const rlResult = await checkRateLimit(tenant, env, rlConfig);
      ctx.rateLimit = rlResult;

      if (!rlResult.allowed) {
        return rateLimitedResponse(rlResult, tenant.plan, ctx.requestId);
      }

      // ── 9. Dispatch to Target Worker ──────────────────────────
      let response = await dispatchToWorker(request, route, ctx, env);

      // ── 10. Post-Processing ───────────────────────────────────
      // Add CORS headers
      response = addCORSHeaders(response, request, ctx);

      // Add rate-limit headers
      const rlHeaders = rateLimitHeaders(rlResult, tenant.plan);
      const finalHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(rlHeaders)) {
        finalHeaders.set(key, value);
      }

      // Add observability headers
      const durationMs = Date.now() - ctx.startTime;
      finalHeaders.set('X-Request-ID', ctx.requestId);
      finalHeaders.set('X-Dispatch-Duration', `${durationMs}ms`);
      finalHeaders.set('X-Tenant-ID', tenant.tenantId);
      finalHeaders.set('X-Powered-By', 'Trancendos OS');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: finalHeaders,
      });

    } catch (error) {
      // ── Global Error Handler ──────────────────────────────────
      console.error(`[dispatch] Unhandled error:`, error);
      const durationMs = Date.now() - ctx.startTime;

      return errorResponse(
        DispatchError.INTERNAL_ERROR,
        env.ENVIRONMENT === 'production'
          ? 'Internal server error'
          : `Internal error: ${error instanceof Error ? error.message : String(error)}`,
        500,
        ctx.requestId,
      );
    }
  },
};

// ─── Utilities ──────────────────────────────────────────────────

/**
 * Generate a unique request ID using crypto.randomUUID.
 * Format: drq-{uuid} (dispatch request)
 */
function generateRequestId(): string {
  try {
    return `drq-${crypto.randomUUID()}`;
  } catch {
    // Fallback for environments without crypto.randomUUID
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `drq-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

// ─── TenantDO Binding ───────────────────────────────────────────
// The TenantDO Durable Object class is deployed as part of the
// tenant-do package. It is bound to this worker via wrangler.toml
// using script_name, so no re-export is needed here.
//
// In wrangler.toml:
//   [[durable_objects.bindings]]
//   name = "TENANT_DO"
//   class_name = "TenantDO"
//   script_name = "tenant-do-dev"
//
// The Dispatch Worker communicates with TenantDO via the
// env.TENANT_DO namespace binding (DurableObjectNamespace).