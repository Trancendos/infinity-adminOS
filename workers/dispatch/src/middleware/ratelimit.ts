/**
 * Dispatch Worker — Rate Limiting Middleware
 * ═══════════════════════════════════════════════════════════════
 * Per-tenant sliding window rate limiter using Cloudflare KV.
 *
 * Strategy: Fixed-window counters with KV expiration.
 * Each key = `rl:{tenantId}:{windowKey}` with TTL = windowSec.
 * Atomic increment isn't available in KV, so we use optimistic
 * read-increment-write with short TTLs. For strict atomicity,
 * upgrade to Durable Objects or the Rate Limiting API.
 */

import type {
  RateLimitConfig,
  RateLimitResult,
  TenantIdentity,
  Env,
} from '../types';
import { PLAN_RATE_LIMITS } from '../types';

// ─── Rate Limit Check ───────────────────────────────────────────

/**
 * Check and increment the rate limit counter for a tenant.
 * Returns whether the request is allowed and remaining quota.
 */
export async function checkRateLimit(
  tenant: TenantIdentity,
  env: Env,
  customConfig?: RateLimitConfig,
): Promise<RateLimitResult> {
  const config = customConfig ?? PLAN_RATE_LIMITS[tenant.plan];
  const now = Math.floor(Date.now() / 1000);
  const windowKey = Math.floor(now / config.windowSec);
  const kvKey = `rl:${tenant.tenantId}:${windowKey}`;

  try {
    // Read current count
    const currentStr = await env.CACHE.get(kvKey);
    const current = currentStr ? parseInt(currentStr, 10) : 0;

    if (current >= config.limit) {
      // Rate limited
      const resetAt = (windowKey + 1) * config.windowSec;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: resetAt - now,
      };
    }

    // Increment counter (optimistic — acceptable for KV)
    const newCount = current + 1;
    await env.CACHE.put(kvKey, newCount.toString(), {
      expirationTtl: config.windowSec * 2, // 2x window for safety
    });

    const resetAt = (windowKey + 1) * config.windowSec;
    return {
      allowed: true,
      remaining: config.limit - newCount,
      resetAt,
    };
  } catch (error) {
    // On KV failure, fail open (allow the request)
    // Log the error for observability
    console.error(`[ratelimit] KV error for ${kvKey}:`, error);
    return {
      allowed: true,
      remaining: config.limit,
      resetAt: now + config.windowSec,
    };
  }
}

// ─── Rate Limit Headers ─────────────────────────────────────────

/**
 * Generate standard rate-limit response headers.
 * Follows the RateLimit header fields draft (RFC 9110 extension).
 */
export function rateLimitHeaders(
  result: RateLimitResult,
  plan: TenantIdentity['plan'],
): Record<string, string> {
  const config = PLAN_RATE_LIMITS[plan];
  const headers: Record<string, string> = {
    'RateLimit-Limit': config.limit.toString(),
    'RateLimit-Remaining': result.remaining.toString(),
    'RateLimit-Reset': result.resetAt.toString(),
    'X-RateLimit-Plan': plan,
  };

  if (!result.allowed && result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }

  return headers;
}

// ─── Utilities ──────────────────────────────────────────────────

/**
 * Get the effective rate limit config for a tenant,
 * considering per-route overrides.
 */
export function getEffectiveRateLimit(
  tenant: TenantIdentity,
  routeRateLimit?: number,
): RateLimitConfig {
  const planConfig = PLAN_RATE_LIMITS[tenant.plan];

  if (routeRateLimit && routeRateLimit > 0) {
    return {
      limit: Math.min(routeRateLimit, planConfig.limit), // Never exceed plan limit
      windowSec: planConfig.windowSec,
    };
  }

  return planConfig;
}

/**
 * Generate a 429 Too Many Requests response.
 */
export function rateLimitedResponse(
  result: RateLimitResult,
  plan: TenantIdentity['plan'],
  requestId: string,
): Response {
  const headers = rateLimitHeaders(result, plan);
  return new Response(
    JSON.stringify({
      error: 'RATE_LIMITED',
      message: `Rate limit exceeded for ${plan} plan. Retry after ${result.retryAfter ?? 60} seconds.`,
      requestId,
      retryAfter: result.retryAfter,
      limit: PLAN_RATE_LIMITS[plan].limit,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        ...headers,
      },
    },
  );
}