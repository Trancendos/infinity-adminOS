/**
 * API Gateway Worker — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests CORS handling, rate limiting, caching, proxy behavior,
 * security headers, and error handling without CF runtime.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Env mock factory ──────────────────────────────────────────────
function makeEnv(overrides: Record<string, unknown> = {}) {
  const cache: Record<string, string> = {};
  return {
    BACKEND_ORIGIN: 'https://backend.example.com',
    ENVIRONMENT: 'test',
    RATE_LIMIT_RPM: '60',
    CACHE_TTL: '60',
    RATE_LIMIT: {
      get: vi.fn().mockImplementation((key: string) =>
        Promise.resolve(cache[`rl:${key}`] ?? null),
      ),
      put: vi.fn().mockImplementation((key: string, value: string) => {
        cache[`rl:${key}`] = value;
        return Promise.resolve();
      }),
    },
    CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

// ── Request helpers ───────────────────────────────────────────────
function makeRequest(
  path: string,
  method = 'GET',
  headers: Record<string, string> = {},
  body?: string,
) {
  return new Request(`https://gateway.example.com${path}`, {
    method,
    headers: {
      'CF-Connecting-IP': '1.2.3.4',
      ...headers,
    },
    body: body,
  });
}

// ── Import worker ─────────────────────────────────────────────────
import worker from '../index';

// ═══════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════
describe('Health Check', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    ));
  });

  it('GET /health returns 200 without proxying', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('healthy');
  });

  it('health check includes service name', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(body.service).toBeDefined();
  });

  it('health check includes timestamp', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.timestamp).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════
// CORS Preflight
// ═══════════════════════════════════════════════════════════════
describe('CORS Preflight', () => {
  it('responds to OPTIONS with 204', async () => {
    const req = new Request('https://gateway.example.com/api/data', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://infinity-portal.pages.dev',
        'Access-Control-Request-Method': 'POST',
        'CF-Connecting-IP': '1.2.3.4',
      },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
  });

  it('preflight includes CORS max-age header', async () => {
    const req = new Request('https://gateway.example.com/api/data', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://infinity-portal.pages.dev',
        'CF-Connecting-IP': '1.2.3.4',
      },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Max-Age')).toBeTruthy();
  });

  it('returns CORS headers for allowed origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    ));
    const req = makeRequest('/api/data', 'GET', {
      Origin: 'https://infinity-portal.pages.dev',
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('does not include CORS headers for disallowed origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    ));
    const req = makeRequest('/api/data', 'GET', {
      Origin: 'https://malicious.com',
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Security Headers
// ═══════════════════════════════════════════════════════════════
describe('Security Headers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 'test' }), { status: 200 }),
    ));
  });

  it('includes X-Content-Type-Options on proxied response', async () => {
    const res = await worker.fetch(makeRequest('/api/data'), makeEnv());
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('includes X-Frame-Options on proxied response', async () => {
    const res = await worker.fetch(makeRequest('/api/data'), makeEnv());
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('includes Strict-Transport-Security header', async () => {
    const res = await worker.fetch(makeRequest('/api/data'), makeEnv());
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });
});

// ═══════════════════════════════════════════════════════════════
// Rate Limiting
// ═══════════════════════════════════════════════════════════════
describe('Rate Limiting', () => {
  it('allows request under rate limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    ));
    const env = makeEnv();
    const res = await worker.fetch(makeRequest('/api/data'), env);
    expect(res.status).not.toBe(429);
  });

  it('adds rate limit remaining header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    ));
    const env = makeEnv();
    const res = await worker.fetch(makeRequest('/api/data'), env);
    expect(res.headers.get('X-RateLimit-Remaining')).toBeTruthy();
  });

  it('returns 429 when rate limit exceeded', async () => {
    // Implementation uses parseInt(kvValue || '0') >= rpm (default 120)
    // So return a numeric string >= 120 to trigger rate limiting
    const env = makeEnv({
      RATE_LIMIT: {
        get: vi.fn().mockResolvedValue('9999'),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(makeRequest('/api/data'), env);
    expect(res.status).toBe(429);
  });

  it('rate limit 429 response includes Retry-After header', async () => {
    const env = makeEnv({
      RATE_LIMIT: {
        get: vi.fn().mockResolvedValue('9999'),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(makeRequest('/api/data'), env);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// Proxy Behavior
// ═══════════════════════════════════════════════════════════════
describe('Proxy Behavior', () => {
  it('proxies GET request to backend', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 'from backend' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const res = await worker.fetch(makeRequest('/api/users'), makeEnv());
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('proxies POST request to backend', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'new-1' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const res = await worker.fetch(
      makeRequest('/api/users', 'POST', {}, JSON.stringify({ name: 'test' })),
      makeEnv(),
    );
    expect(mockFetch).toHaveBeenCalled();
    // Status should be proxied through
    expect([200, 201].includes(res.status)).toBe(true);
  });

  it('adds X-Forwarded-For header to upstream request', async () => {
    let capturedHeaders: Headers | null = null;
    const mockFetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      capturedHeaders = new Headers(init.headers as HeadersInit);
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    vi.stubGlobal('fetch', mockFetch);

    await worker.fetch(makeRequest('/api/data'), makeEnv());
    expect(capturedHeaders?.get('X-Forwarded-For')).toBeTruthy();
  });

  it('adds X-Request-ID header to upstream request', async () => {
    let capturedHeaders: Headers | null = null;
    const mockFetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      capturedHeaders = new Headers(init.headers as HeadersInit);
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    vi.stubGlobal('fetch', mockFetch);

    await worker.fetch(makeRequest('/api/data'), makeEnv());
    expect(capturedHeaders?.get('X-Request-ID')).toBeTruthy();
  });

  it('removes CF-specific headers from upstream request', async () => {
    let capturedHeaders: Headers | null = null;
    const mockFetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      capturedHeaders = new Headers(init.headers as HeadersInit);
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    vi.stubGlobal('fetch', mockFetch);

    await worker.fetch(
      makeRequest('/api/data', 'GET', {
        'cf-ray': 'abc123',
        'cf-visitor': '{"scheme":"https"}',
      }),
      makeEnv(),
    );
    expect(capturedHeaders?.get('cf-ray')).toBeNull();
    expect(capturedHeaders?.get('cf-visitor')).toBeNull();
  });

  it('adds X-Cache: MISS header on non-cached response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    ));
    const res = await worker.fetch(makeRequest('/api/data'), makeEnv());
    expect(res.headers.get('X-Cache')).toBe('MISS');
  });
});

// ═══════════════════════════════════════════════════════════════
// Backend Failure
// ═══════════════════════════════════════════════════════════════
describe('Backend Failure', () => {
  it('returns 502 when backend is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const res = await worker.fetch(makeRequest('/api/data'), makeEnv());
    expect(res.status).toBe(502);
  });

  it('502 response body has error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const res = await worker.fetch(makeRequest('/api/data'), makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('obscures error detail in production', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const env = makeEnv({ ENVIRONMENT: 'production' });
    const res = await worker.fetch(makeRequest('/api/data'), env);
    const body = await res.json() as Record<string, unknown>;
    expect(body.message).toBe('Service temporarily unavailable');
  });

  it('exposes error detail in non-production', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));
    const env = makeEnv({ ENVIRONMENT: 'test' });
    const res = await worker.fetch(makeRequest('/api/data'), env);
    const body = await res.json() as Record<string, unknown>;
    expect(body.message).toContain('Connection refused');
  });
});

// ═══════════════════════════════════════════════════════════════
// Cache Behavior
// ═══════════════════════════════════════════════════════════════
describe('Cache Behavior', () => {
  it('does not cache auth endpoints', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetch);
    const env = makeEnv();
    await worker.fetch(makeRequest('/api/auth/me'), env);
    // Cache put should not be called for /api/auth/* paths
    expect(env.CACHE.put).not.toHaveBeenCalled();
  });

  it('does not cache POST requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetch);
    const env = makeEnv();
    await worker.fetch(makeRequest('/api/data', 'POST'), env);
    expect(env.CACHE.put).not.toHaveBeenCalled();
  });
});