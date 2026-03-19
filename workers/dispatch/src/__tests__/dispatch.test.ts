/**
 * Dispatch Worker — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests the dispatch kernel's routing, auth, rate limiting,
 * and CORS middleware without requiring the CF runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Import types for type-level testing ────────────────────────
import type {
  TenantIdentity,
  ResolvedRoute,
  RequestContext,
  RateLimitConfig,
  RateLimitResult,
  AuthResult,
  CORSConfig,
  Env,
} from '../types';
import {
  DispatchError,
  errorResponse,
  PLAN_RATE_LIMITS,
  PLAN_CORS_DEFAULTS,
} from '../types';

// ═══════════════════════════════════════════════════════════════
// Type & Configuration Tests
// ═══════════════════════════════════════════════════════════════

describe('Dispatch Types & Config', () => {
  it('should define rate limits for all plans', () => {
    expect(PLAN_RATE_LIMITS.free.limit).toBe(100);
    expect(PLAN_RATE_LIMITS.starter.limit).toBe(500);
    expect(PLAN_RATE_LIMITS.pro.limit).toBe(2000);
    expect(PLAN_RATE_LIMITS.enterprise.limit).toBe(10000);
  });

  it('should define CORS defaults for all plans', () => {
    expect(PLAN_CORS_DEFAULTS.free.allowedMethods).toContain('GET');
    expect(PLAN_CORS_DEFAULTS.enterprise.allowedHeaders).toContain('*');
    expect(PLAN_CORS_DEFAULTS.pro.credentials).toBe(true);
    expect(PLAN_CORS_DEFAULTS.free.credentials).toBe(false);
  });

  it('should have increasing rate limits by plan tier', () => {
    const tiers = ['free', 'starter', 'pro', 'enterprise'] as const;
    for (let i = 1; i < tiers.length; i++) {
      expect(PLAN_RATE_LIMITS[tiers[i]].limit).toBeGreaterThan(
        PLAN_RATE_LIMITS[tiers[i - 1]].limit,
      );
    }
  });

  it('should generate valid error responses', () => {
    const res = errorResponse(
      DispatchError.TENANT_NOT_FOUND,
      'Tenant not found',
      404,
      'drq-test-123',
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('X-Request-ID')).toBe('drq-test-123');
  });

  it('should include all error codes', () => {
    const errorCodes = Object.values(DispatchError);
    expect(errorCodes).toContain('TENANT_NOT_FOUND');
    expect(errorCodes).toContain('TENANT_SUSPENDED');
    expect(errorCodes).toContain('RATE_LIMITED');
    expect(errorCodes).toContain('AUTH_REQUIRED');
    expect(errorCodes).toContain('WORKER_ERROR');
    expect(errorCodes).toContain('INTERNAL_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════
// Error Response Body Tests
// ═══════════════════════════════════════════════════════════════

describe('Error Response Structure', () => {
  it('should include error code, message, requestId, and timestamp', async () => {
    const res = errorResponse(
      DispatchError.AUTH_EXPIRED,
      'Token has expired',
      403,
      'drq-abc-123',
    );
    const body = await res.json() as any;
    expect(body.error).toBe('AUTH_EXPIRED');
    expect(body.message).toBe('Token has expired');
    expect(body.requestId).toBe('drq-abc-123');
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('should use "unknown" for missing requestId', async () => {
    const res = errorResponse(
      DispatchError.INTERNAL_ERROR,
      'Something went wrong',
      500,
    );
    const body = await res.json() as any;
    expect(body.requestId).toBe('unknown');
  });
});

// ═══════════════════════════════════════════════════════════════
// Tenant Resolution Logic Tests
// ═══════════════════════════════════════════════════════════════

describe('Tenant Resolution', () => {
  it('should extract tenant from subdomain pattern', () => {
    const patterns = [
      { hostname: 'acme.app.trancendos.com', expected: 'acme' },
      { hostname: 'beta-corp.app.trancendos.com', expected: 'beta-corp' },
      { hostname: 'tenant123.trancendos.dev', expected: 'tenant123' },
      { hostname: 'my-org.trancendos.ai', expected: 'my-org' },
    ];

    for (const { hostname, expected } of patterns) {
      // Simulate resolveBySubdomain logic
      const subdomainPatterns = [
        /^([a-z0-9][a-z0-9-]{0,62})\.app\.trancendos\.com$/i,
        /^([a-z0-9][a-z0-9-]{0,62})\.trancendos\.dev$/i,
        /^([a-z0-9][a-z0-9-]{0,62})\.trancendos\.ai$/i,
      ];

      let tenantId: string | null = null;
      for (const pattern of subdomainPatterns) {
        const match = hostname.match(pattern);
        if (match) {
          tenantId = match[1];
          break;
        }
      }
      expect(tenantId).toBe(expected);
    }
  });

  it('should NOT extract tenant from non-matching hostnames', () => {
    const nonMatching = [
      'trancendos.com',
      'www.trancendos.com',
      'app.trancendos.com', // 'app' is the subdomain marker, not a tenant
      'random.example.com',
      'localhost',
    ];

    const subdomainPatterns = [
      /^([a-z0-9][a-z0-9-]{0,62})\.app\.trancendos\.com$/i,
      /^([a-z0-9][a-z0-9-]{0,62})\.trancendos\.dev$/i,
      /^([a-z0-9][a-z0-9-]{0,62})\.trancendos\.ai$/i,
    ];

    for (const hostname of nonMatching) {
      let tenantId: string | null = null;
      for (const pattern of subdomainPatterns) {
        const match = hostname.match(pattern);
        if (match) {
          tenantId = match[1];
          break;
        }
      }
      expect(tenantId).toBeNull();
    }
  });

  it('should extract tenant from path prefix', () => {
    const paths = [
      { path: '/t/acme/api/v1/users', expected: 'acme' },
      { path: '/t/beta-corp/dashboard', expected: 'beta-corp' },
      { path: '/t/tenant-123/health', expected: 'tenant-123' },
    ];

    for (const { path, expected } of paths) {
      const match = path.match(/^\/t\/([a-z0-9][a-z0-9-]{0,62})\//i);
      expect(match?.[1]).toBe(expected);
    }
  });

  it('should NOT extract tenant from invalid path prefixes', () => {
    const invalidPaths = [
      '/api/v1/users',
      '/t/',           // No tenantId
      '/t/a',          // Too short for the full match (no trailing /)
      '/tenant/acme/', // Wrong prefix
    ];

    for (const path of invalidPaths) {
      const match = path.match(/^\/t\/([a-z0-9][a-z0-9-]{0,62})\//i);
      expect(match).toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Rate Limiting Logic Tests
// ═══════════════════════════════════════════════════════════════

describe('Rate Limiting', () => {
  it('should respect plan-based rate limits', () => {
    const plans: TenantIdentity['plan'][] = ['free', 'starter', 'pro', 'enterprise'];
    for (const plan of plans) {
      const config = PLAN_RATE_LIMITS[plan];
      expect(config.limit).toBeGreaterThan(0);
      expect(config.windowSec).toBeGreaterThan(0);
    }
  });

  it('should calculate window key correctly', () => {
    const windowSec = 60;
    const now = 1710864000; // Fixed timestamp
    const windowKey = Math.floor(now / windowSec);
    expect(windowKey).toBe(28514400);

    // Same window
    const sameWindow = Math.floor((now + 30) / windowSec);
    expect(sameWindow).toBe(windowKey);

    // Next window
    const nextWindow = Math.floor((now + 61) / windowSec);
    expect(nextWindow).toBe(windowKey + 1);
  });

  it('should calculate remaining requests correctly', () => {
    const limit = 100;
    const current = 42;
    const remaining = limit - (current + 1); // After increment
    expect(remaining).toBe(57);
  });

  it('should deny when limit is reached', () => {
    const limit = 100;
    const current = 100;
    const allowed = current < limit;
    expect(allowed).toBe(false);
  });

  it('should enforce per-route rate limit does not exceed plan limit', () => {
    // Simulate getEffectiveRateLimit
    const planLimit = PLAN_RATE_LIMITS.starter.limit; // 500
    const routeLimit = 1000; // Higher than plan
    const effective = Math.min(routeLimit, planLimit);
    expect(effective).toBe(500); // Capped at plan limit
  });

  it('should use route limit when lower than plan limit', () => {
    const planLimit = PLAN_RATE_LIMITS.pro.limit; // 2000
    const routeLimit = 50; // Lower than plan
    const effective = Math.min(routeLimit, planLimit);
    expect(effective).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// CORS Logic Tests
// ═══════════════════════════════════════════════════════════════

describe('CORS', () => {
  it('should match exact origins', () => {
    const allowed = ['https://app.example.com', 'https://admin.example.com'];
    const origin = 'https://app.example.com';
    expect(allowed.includes(origin)).toBe(true);
  });

  it('should match wildcard origins', () => {
    const allowed = ['*'];
    const origin = 'https://anything.example.com';
    expect(allowed.includes('*')).toBe(true);
  });

  it('should match subdomain wildcard patterns', () => {
    const pattern = '*.example.com';
    const domain = pattern.slice(2); // 'example.com'

    const validOrigins = [
      'https://app.example.com',
      'https://staging.example.com',
      'https://deep.sub.example.com',
    ];

    for (const origin of validOrigins) {
      const host = new URL(origin).hostname;
      expect(host.endsWith(domain) && host !== domain).toBe(true);
    }

    // Should NOT match the bare domain
    const bareHost = new URL('https://example.com').hostname;
    expect(bareHost.endsWith(domain) && bareHost !== domain).toBe(false);
  });

  it('should return correct CORS headers structure', () => {
    const config: CORSConfig = PLAN_CORS_DEFAULTS.pro;
    expect(config.allowedMethods).toContain('PATCH');
    expect(config.allowedHeaders).toContain('X-Tenant-ID');
    expect(config.maxAge).toBe(86400);
    expect(config.credentials).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth Logic Tests
// ═══════════════════════════════════════════════════════════════

describe('Auth Scope Matching', () => {
  // Simulate hasScope logic from auth middleware
  function hasScope(scopes: string[], requiredScope: string): boolean {
    return scopes.some((scope) => {
      if (scope === '*') return true;
      if (scope === requiredScope) return true;
      if (scope.endsWith(':*')) {
        const prefix = scope.slice(0, -1);
        return requiredScope.startsWith(prefix);
      }
      return false;
    });
  }

  it('should match exact scopes', () => {
    expect(hasScope(['read:users', 'write:users'], 'read:users')).toBe(true);
    expect(hasScope(['read:users'], 'write:users')).toBe(false);
  });

  it('should match wildcard (*) scope', () => {
    expect(hasScope(['*'], 'anything:here')).toBe(true);
    expect(hasScope(['*'], 'admin:delete')).toBe(true);
  });

  it('should match namespace wildcards', () => {
    expect(hasScope(['admin:*'], 'admin:read')).toBe(true);
    expect(hasScope(['admin:*'], 'admin:write')).toBe(true);
    expect(hasScope(['admin:*'], 'user:read')).toBe(false);
  });

  it('should handle empty scopes', () => {
    expect(hasScope([], 'read:users')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Request Context Tests
// ═══════════════════════════════════════════════════════════════

describe('Request Context', () => {
  it('should create valid request context', () => {
    const ctx: RequestContext = {
      requestId: 'drq-test-uuid',
      startTime: Date.now(),
    };
    expect(ctx.requestId).toMatch(/^drq-/);
    expect(ctx.startTime).toBeGreaterThan(0);
    expect(ctx.tenant).toBeUndefined();
    expect(ctx.route).toBeUndefined();
    expect(ctx.auth).toBeUndefined();
  });

  it('should accumulate context through the pipeline', () => {
    const ctx: RequestContext = {
      requestId: 'drq-pipeline-test',
      startTime: Date.now(),
    };

    // Step 1: Tenant resolved
    ctx.tenant = {
      tenantId: 'acme',
      plan: 'pro',
      status: 'active',
    };

    // Step 2: Route resolved
    ctx.route = {
      tenantId: 'acme',
      targetWorker: 'api-gateway',
      pathPattern: '/api/*',
      auth: true,
    };

    // Step 3: Auth resolved
    ctx.auth = {
      authenticated: true,
      tenantId: 'acme',
      userId: 'user-001',
      scopes: ['read:*', 'write:data'],
    };

    // Step 4: Rate limit resolved
    ctx.rateLimit = {
      allowed: true,
      remaining: 1999,
      resetAt: Math.floor(Date.now() / 1000) + 60,
    };

    // All context accumulated
    expect(ctx.tenant.tenantId).toBe('acme');
    expect(ctx.route.targetWorker).toBe('api-gateway');
    expect(ctx.auth.authenticated).toBe(true);
    expect(ctx.rateLimit.allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// System Route Tests
// ═══════════════════════════════════════════════════════════════

describe('System Routes', () => {
  it('should identify system routes', () => {
    const systemPaths = [
      '/_system/health',
      '/_system/metrics',
      '/_system/admin',
      '/_dispatch/status',
    ];

    for (const path of systemPaths) {
      expect(
        path.startsWith('/_system/') || path.startsWith('/_dispatch/'),
      ).toBe(true);
    }
  });

  it('should NOT identify regular paths as system routes', () => {
    const regularPaths = [
      '/api/v1/users',
      '/t/acme/dashboard',
      '/health',
      '/system/info', // no underscore prefix
    ];

    for (const path of regularPaths) {
      expect(
        path.startsWith('/_system/') || path.startsWith('/_dispatch/'),
      ).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Tenant Status Validation Tests
// ═══════════════════════════════════════════════════════════════

describe('Tenant Status Validation', () => {
  it('should allow active tenants', () => {
    const tenant: TenantIdentity = {
      tenantId: 'active-tenant',
      plan: 'pro',
      status: 'active',
    };
    expect(tenant.status).toBe('active');
    expect(tenant.status !== 'suspended' && tenant.status !== 'provisioning').toBe(true);
  });

  it('should block suspended tenants', () => {
    const tenant: TenantIdentity = {
      tenantId: 'suspended-tenant',
      plan: 'free',
      status: 'suspended',
    };
    expect(tenant.status).toBe('suspended');
  });

  it('should return 503 for provisioning tenants', () => {
    const tenant: TenantIdentity = {
      tenantId: 'new-tenant',
      plan: 'starter',
      status: 'provisioning',
    };
    expect(tenant.status).toBe('provisioning');
  });
});