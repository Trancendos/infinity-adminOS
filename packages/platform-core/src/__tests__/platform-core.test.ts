/**
 * @trancendos/platform-core — Test Suite
 * ========================================
 * Tests for unified worker bootstrap, error handling, and platform utilities.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // ID Generation
  generateRequestId,
  generateId,
  // Request Context
  buildRequestContext,
  // Errors
  PlatformError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
  RateLimitError,
  errorToResponse,
  // CORS
  buildCorsHeaders,
  handleCorsPrelight,
  // Security
  SECURITY_HEADERS,
  applySecurityHeaders,
  // Health
  buildHealthResponse,
  // JSON Helpers
  jsonResponse,
  parseJsonBody,
  // Validation
  requireTenantId,
  requireUserId,
  validateRequired,
  validateStringLength,
  validateEmail,
  validateSlug,
  // Pagination
  parsePagination,
  buildPaginatedResponse,
  // Retry
  withRetry,
  DEFAULT_RETRY_OPTIONS,
  // Timing
  withTiming,
  // Environment
  isProduction,
  isDevelopment,
  isStaging,
  // Types
  type RequestContext,
  type PlatformEnv,
  type WorkerConfig,
} from '../index';

// ── Helpers ────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: 'req_test_123',
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'editor',
    traceId: 'trace-abc',
    spanId: 'span-xyz',
    startTime: Date.now(),
    metadata: {},
    ...overrides,
  };
}

function makeConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    name: 'test-service',
    version: '1.0.0',
    ...overrides,
  };
}

// ── ID Generation ──────────────────────────────────────────────────────

describe('ID Generation', () => {
  describe('generateRequestId', () => {
    it('returns string starting with req_', () => {
      expect(generateRequestId()).toMatch(/^req_/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('generateId', () => {
    it('uses custom prefix', () => {
      expect(generateId('trace')).toMatch(/^trace_/);
      expect(generateId('span')).toMatch(/^span_/);
    });

    it('uses default prefix', () => {
      expect(generateId()).toMatch(/^id_/);
    });
  });
});

// ── Request Context ────────────────────────────────────────────────────

describe('buildRequestContext', () => {
  it('extracts headers into context', () => {
    const request = new Request('https://api.test.com/v1/data', {
      headers: {
        'X-Request-Id': 'custom-req-id',
        'X-Tenant-Id': 'tenant-42',
        'X-User-Id': 'user-99',
        'X-User-Role': 'admin',
        'X-Trace-Id': 'trace-custom',
      },
    });

    const ctx = buildRequestContext(request);
    expect(ctx.requestId).toBe('custom-req-id');
    expect(ctx.tenantId).toBe('tenant-42');
    expect(ctx.userId).toBe('user-99');
    expect(ctx.role).toBe('admin');
    expect(ctx.traceId).toBe('trace-custom');
    expect(ctx.startTime).toBeLessThanOrEqual(Date.now());
    expect(ctx.metadata).toEqual({});
  });

  it('generates defaults when headers are missing', () => {
    const request = new Request('https://api.test.com/v1/data');
    const ctx = buildRequestContext(request);

    expect(ctx.requestId).toMatch(/^req_/);
    expect(ctx.tenantId).toBeUndefined();
    expect(ctx.userId).toBeUndefined();
    expect(ctx.traceId).toMatch(/^trace_/);
    expect(ctx.spanId).toMatch(/^span_/);
  });
});

// ── Error Classes ──────────────────────────────────────────────────────

describe('Error Classes', () => {
  describe('PlatformError', () => {
    it('has code, message, and statusCode', () => {
      const err = new PlatformError('CUSTOM', 'Something failed', 422);
      expect(err.code).toBe('CUSTOM');
      expect(err.message).toBe('Something failed');
      expect(err.statusCode).toBe(422);
      expect(err.name).toBe('PlatformError');
    });

    it('defaults to 500 status', () => {
      const err = new PlatformError('ERR', 'fail');
      expect(err.statusCode).toBe(500);
    });

    it('includes details', () => {
      const err = new PlatformError('ERR', 'fail', 400, { field: 'name' });
      expect(err.details).toEqual({ field: 'name' });
    });
  });

  describe('NotFoundError', () => {
    it('has 404 status', () => {
      const err = new NotFoundError('User', 'u123');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toContain('User');
      expect(err.message).toContain('u123');
    });

    it('works without ID', () => {
      const err = new NotFoundError('Resource');
      expect(err.message).toBe('Resource not found');
    });
  });

  describe('UnauthorizedError', () => {
    it('has 401 status', () => {
      const err = new UnauthorizedError();
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });
  });

  describe('ForbiddenError', () => {
    it('has 403 status', () => {
      const err = new ForbiddenError();
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    });
  });

  describe('BadRequestError', () => {
    it('has 400 status with details', () => {
      const err = new BadRequestError('Invalid input', { fields: ['name'] });
      expect(err.statusCode).toBe(400);
      expect(err.details).toEqual({ fields: ['name'] });
    });
  });

  describe('ConflictError', () => {
    it('has 409 status', () => {
      const err = new ConflictError('Already exists');
      expect(err.statusCode).toBe(409);
    });
  });

  describe('RateLimitError', () => {
    it('has 429 status with retry info', () => {
      const err = new RateLimitError(30);
      expect(err.statusCode).toBe(429);
      expect(err.details).toEqual({ retryAfter: 30 });
    });
  });
});

describe('errorToResponse', () => {
  it('converts PlatformError to JSON response', async () => {
    const err = new NotFoundError('User', 'u1');
    const resp = errorToResponse(err, 'req-123');

    expect(resp.status).toBe(404);
    const body = await resp.json() as any;
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe('req-123');
  });

  it('converts generic Error to 500 response', async () => {
    const err = new Error('Oops');
    const resp = errorToResponse(err, 'req-456');

    expect(resp.status).toBe(500);
    const body = await resp.json() as any;
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Oops');
  });

  it('handles non-Error objects', async () => {
    const resp = errorToResponse('string error', 'req-789');
    expect(resp.status).toBe(500);
    const body = await resp.json() as any;
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});

// ── CORS ───────────────────────────────────────────────────────────────

describe('CORS', () => {
  describe('buildCorsHeaders', () => {
    it('returns empty for no allowed origins', () => {
      const request = new Request('https://api.test.com', {
        headers: { Origin: 'https://app.test.com' },
      });
      const headers = buildCorsHeaders(request, []);
      expect(Object.keys(headers)).toHaveLength(0);
    });

    it('allows wildcard origin', () => {
      const request = new Request('https://api.test.com', {
        headers: { Origin: 'https://any-site.com' },
      });
      const headers = buildCorsHeaders(request, ['*']);
      expect(headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('allows specific origin', () => {
      const request = new Request('https://api.test.com', {
        headers: { Origin: 'https://app.test.com' },
      });
      const headers = buildCorsHeaders(request, ['https://app.test.com']);
      expect(headers['Access-Control-Allow-Origin']).toBe('https://app.test.com');
    });

    it('denies non-matching origin', () => {
      const request = new Request('https://api.test.com', {
        headers: { Origin: 'https://evil.com' },
      });
      const headers = buildCorsHeaders(request, ['https://app.test.com']);
      expect(Object.keys(headers)).toHaveLength(0);
    });
  });

  describe('handleCorsPrelight', () => {
    it('returns null for non-OPTIONS requests', () => {
      const request = new Request('https://api.test.com', { method: 'GET' });
      expect(handleCorsPrelight(request, ['*'])).toBeNull();
    });

    it('returns 204 for OPTIONS request', () => {
      const request = new Request('https://api.test.com', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.test.com' },
      });
      const resp = handleCorsPrelight(request, ['*']);
      expect(resp).not.toBeNull();
      expect(resp!.status).toBe(204);
    });
  });
});

// ── Security Headers ───────────────────────────────────────────────────

describe('Security Headers', () => {
  it('SECURITY_HEADERS has required headers', () => {
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toContain('max-age');
  });

  describe('applySecurityHeaders', () => {
    it('adds security headers to response', () => {
      const original = new Response('test', { status: 200 });
      const secured = applySecurityHeaders(original);

      expect(secured.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(secured.headers.get('X-Frame-Options')).toBe('DENY');
      expect(secured.status).toBe(200);
    });

    it('preserves original headers', () => {
      const original = new Response('test', {
        headers: { 'X-Custom': 'value' },
      });
      const secured = applySecurityHeaders(original);
      expect(secured.headers.get('X-Custom')).toBe('value');
    });
  });
});

// ── Health Check ───────────────────────────────────────────────────────

describe('buildHealthResponse', () => {
  const config = makeConfig();

  it('returns healthy status with no checks', async () => {
    const resp = buildHealthResponse(config);
    expect(resp.status).toBe(200);

    const body = await resp.json() as any;
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('test-service');
    expect(body.version).toBe('1.0.0');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns degraded when a check is degraded', async () => {
    const resp = buildHealthResponse(config, {
      db: { status: 'healthy', latencyMs: 5 },
      cache: { status: 'degraded', latencyMs: 500 },
    });
    const body = await resp.json() as any;
    expect(body.status).toBe('degraded');
    expect(resp.status).toBe(200);
  });

  it('returns unhealthy with 503 when check is unhealthy', async () => {
    const resp = buildHealthResponse(config, {
      db: { status: 'unhealthy' },
    });
    expect(resp.status).toBe(503);
    const body = await resp.json() as any;
    expect(body.status).toBe('unhealthy');
  });
});

// ── JSON Helpers ───────────────────────────────────────────────────────

describe('JSON Helpers', () => {
  describe('jsonResponse', () => {
    it('creates JSON response with default 200 status', async () => {
      const resp = jsonResponse({ name: 'test' });
      expect(resp.status).toBe(200);
      expect(resp.headers.get('Content-Type')).toBe('application/json');
      const body = await resp.json();
      expect(body).toEqual({ name: 'test' });
    });

    it('creates JSON response with custom status', () => {
      const resp = jsonResponse({ created: true }, 201);
      expect(resp.status).toBe(201);
    });

    it('includes custom headers', () => {
      const resp = jsonResponse({}, 200, { 'X-Custom': 'val' });
      expect(resp.headers.get('X-Custom')).toBe('val');
    });
  });

  describe('parseJsonBody', () => {
    it('parses valid JSON', async () => {
      const request = new Request('https://test.com', {
        method: 'POST',
        body: JSON.stringify({ name: 'Alice' }),
      });
      const result = await parseJsonBody<{ name: string }>(request);
      expect(result.name).toBe('Alice');
    });

    it('throws BadRequestError for invalid JSON', async () => {
      const request = new Request('https://test.com', {
        method: 'POST',
        body: 'not json',
      });
      await expect(parseJsonBody(request)).rejects.toThrow('Invalid JSON body');
    });
  });
});

// ── Validation ─────────────────────────────────────────────────────────

describe('Validation', () => {
  describe('requireTenantId', () => {
    it('returns tenant ID when present', () => {
      expect(requireTenantId(makeCtx({ tenantId: 't1' }))).toBe('t1');
    });

    it('throws when missing', () => {
      expect(() => requireTenantId(makeCtx({ tenantId: undefined }))).toThrow('X-Tenant-Id');
    });
  });

  describe('requireUserId', () => {
    it('returns user ID when present', () => {
      expect(requireUserId(makeCtx({ userId: 'u1' }))).toBe('u1');
    });

    it('throws when missing', () => {
      expect(() => requireUserId(makeCtx({ userId: undefined }))).toThrow('Authentication');
    });
  });

  describe('validateRequired', () => {
    it('passes when all fields present', () => {
      expect(() => validateRequired({ a: 1, b: 'x' }, ['a', 'b'])).not.toThrow();
    });

    it('throws when field missing', () => {
      expect(() => validateRequired({ a: 1 }, ['a', 'b'])).toThrow('Missing required fields: b');
    });

    it('throws for empty string', () => {
      expect(() => validateRequired({ a: '' }, ['a'])).toThrow('Missing required fields: a');
    });
  });

  describe('validateStringLength', () => {
    it('passes within range', () => {
      expect(() => validateStringLength('hello', 'name', 1, 10)).not.toThrow();
    });

    it('throws when too short', () => {
      expect(() => validateStringLength('', 'name', 1, 10)).toThrow('name must be between');
    });

    it('throws when too long', () => {
      expect(() => validateStringLength('a'.repeat(101), 'name', 1, 100)).toThrow();
    });
  });

  describe('validateEmail', () => {
    it('accepts valid emails', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user+tag@domain.co')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(validateEmail('not-an-email')).toBe(false);
      expect(validateEmail('@missing.com')).toBe(false);
      expect(validateEmail('no-domain@')).toBe(false);
    });
  });

  describe('validateSlug', () => {
    it('accepts valid slugs', () => {
      expect(validateSlug('my-app')).toBe(true);
      expect(validateSlug('app123')).toBe(true);
      expect(validateSlug('a')).toBe(true);
    });

    it('rejects invalid slugs', () => {
      expect(validateSlug('My-App')).toBe(false);
      expect(validateSlug('-starts-with-dash')).toBe(false);
      expect(validateSlug('has spaces')).toBe(false);
      expect(validateSlug('')).toBe(false);
    });
  });
});

// ── Pagination ─────────────────────────────────────────────────────────

describe('Pagination', () => {
  describe('parsePagination', () => {
    it('parses page and limit from URL', () => {
      const url = new URL('https://api.test.com/items?page=3&limit=50');
      const params = parsePagination(url);
      expect(params.page).toBe(3);
      expect(params.limit).toBe(50);
      expect(params.offset).toBe(100);
    });

    it('uses defaults when params missing', () => {
      const url = new URL('https://api.test.com/items');
      const params = parsePagination(url);
      expect(params.page).toBe(1);
      expect(params.limit).toBe(20);
      expect(params.offset).toBe(0);
    });

    it('clamps page to minimum 1', () => {
      const url = new URL('https://api.test.com/items?page=-5');
      expect(parsePagination(url).page).toBe(1);
    });

    it('clamps limit to max 100', () => {
      const url = new URL('https://api.test.com/items?limit=500');
      expect(parsePagination(url).limit).toBe(100);
    });

    it('clamps limit to minimum 1', () => {
      const url = new URL('https://api.test.com/items?limit=0');
      expect(parsePagination(url).limit).toBe(1);
    });

    it('accepts custom defaults', () => {
      const url = new URL('https://api.test.com/items');
      const params = parsePagination(url, { page: 2, limit: 50 });
      expect(params.page).toBe(2);
      expect(params.limit).toBe(50);
    });
  });

  describe('buildPaginatedResponse', () => {
    it('builds correct pagination metadata', () => {
      const data = ['a', 'b', 'c'];
      const result = buildPaginatedResponse(data, 10, { page: 2, limit: 3, offset: 3 });

      expect(result.data).toEqual(['a', 'b', 'c']);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(3);
      expect(result.pagination.total).toBe(10);
      expect(result.pagination.totalPages).toBe(4);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it('hasNext is false on last page', () => {
      const result = buildPaginatedResponse(['x'], 3, { page: 3, limit: 1, offset: 2 });
      expect(result.pagination.hasNext).toBe(false);
    });

    it('hasPrev is false on first page', () => {
      const result = buildPaginatedResponse(['x'], 3, { page: 1, limit: 1, offset: 0 });
      expect(result.pagination.hasPrev).toBe(false);
    });
  });
});

// ── Retry ──────────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { baseDelayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 10 }))
      .rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses default options', () => {
    expect(DEFAULT_RETRY_OPTIONS.maxAttempts).toBe(3);
    expect(DEFAULT_RETRY_OPTIONS.baseDelayMs).toBe(100);
    expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBe(2);
  });
});

// ── Timing ─────────────────────────────────────────────────────────────

describe('withTiming', () => {
  it('returns result and duration', async () => {
    const { result, durationMs } = await withTiming(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'done';
    });

    expect(result).toBe('done');
    expect(durationMs).toBeGreaterThanOrEqual(40);
    expect(durationMs).toBeLessThan(500);
  });
});

// ── Environment Helpers ────────────────────────────────────────────────

describe('Environment Helpers', () => {
  it('isProduction', () => {
    expect(isProduction({ ENVIRONMENT: 'production' })).toBe(true);
    expect(isProduction({ ENVIRONMENT: 'development' })).toBe(false);
  });

  it('isDevelopment', () => {
    expect(isDevelopment({ ENVIRONMENT: 'development' })).toBe(true);
    expect(isDevelopment({ ENVIRONMENT: 'dev' })).toBe(true);
    expect(isDevelopment({ ENVIRONMENT: 'production' })).toBe(false);
  });

  it('isStaging', () => {
    expect(isStaging({ ENVIRONMENT: 'staging' })).toBe(true);
    expect(isStaging({ ENVIRONMENT: 'production' })).toBe(false);
  });
});