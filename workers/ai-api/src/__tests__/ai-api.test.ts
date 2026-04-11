/**
 * AI API Worker — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests CORS, auth, model listing, chat, embeddings,
 * health check, and error handling without CF runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Minimal Env mock ─────────────────────────────────────────────
function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    AI: {
      run: vi.fn().mockResolvedValue({
        response: 'Hello from mock AI',
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
    },
    CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    AUTH_API_URL: 'https://mock-auth.example.com',
    ENVIRONMENT: 'test',
    ALLOWED_ORIGINS: 'https://app.example.com',
    ...overrides,
  };
}

// ── Request helpers ──────────────────────────────────────────────
function makeRequest(
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`https://ai-api.example.com${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://infinity-portal.pages.dev',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeAuthRequest(path: string, method = 'GET', body?: unknown) {
  return makeRequest(path, method, body, {
    Authorization: 'Bearer valid-token-123',
  });
}

// ── Import worker ────────────────────────────────────────────────
import worker from '../index';

// ═══════════════════════════════════════════════════════════════
// CORS & Security Headers
// ═══════════════════════════════════════════════════════════════
describe('CORS & Security Headers', () => {
  it('responds to OPTIONS preflight with 204', async () => {
    const req = new Request('https://ai-api.example.com/api/v1/ai/chat', {
      method: 'OPTIONS',
      headers: { Origin: 'https://infinity-portal.pages.dev' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
  });

  it('includes security headers in all responses', async () => {
    const req = makeRequest('/health');
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  it('allows infinity-portal.pages.dev origin', async () => {
    const req = makeRequest('/health');
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://infinity-portal.pages.dev',
    );
  });

  it('rejects disallowed origins without CORS headers', async () => {
    const req = new Request('https://ai-api.example.com/health', {
      headers: { Origin: 'https://evil.com' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════
describe('Health Check', () => {
  it('GET /health returns healthy status', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('ai-api');
  });

  it('GET /api/health also returns healthy status', async () => {
    const res = await worker.fetch(makeRequest('/api/health'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('healthy');
  });

  it('health check includes timestamp', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.timestamp).toBe('string');
    expect(new Date(body.timestamp as string).getTime()).toBeGreaterThan(0);
  });

  it('health check reflects environment', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv({ ENVIRONMENT: 'staging' }));
    const body = await res.json() as Record<string, unknown>;
    expect(body.environment).toBe('staging');
  });
});

// ═══════════════════════════════════════════════════════════════
// Models Endpoint
// ═══════════════════════════════════════════════════════════════
describe('Models Endpoint', () => {
  it('GET /api/v1/ai/models returns model list without auth', async () => {
    const res = await worker.fetch(makeRequest('/api/v1/ai/models'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { models: Array<{ id: string; name: string; type: string }> };
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);
  });

  it('models have required fields (id, name, type)', async () => {
    const res = await worker.fetch(makeRequest('/api/v1/ai/models'), makeEnv());
    const body = await res.json() as { models: Array<{ id: string; name: string; type: string }> };
    for (const model of body.models) {
      expect(typeof model.id).toBe('string');
      expect(typeof model.name).toBe('string');
      expect(typeof model.type).toBe('string');
    }
  });

  it('includes at least one chat model', async () => {
    const res = await worker.fetch(makeRequest('/api/v1/ai/models'), makeEnv());
    const body = await res.json() as { models: Array<{ id: string; name: string; type: string }> };
    const chatModels = body.models.filter((m) => m.type === 'chat');
    expect(chatModels.length).toBeGreaterThan(0);
  });

  it('includes at least one embedding model', async () => {
    const res = await worker.fetch(makeRequest('/api/v1/ai/models'), makeEnv());
    const body = await res.json() as { models: Array<{ id: string; name: string; type: string }> };
    const embedModels = body.models.filter((m) => m.type === 'embedding');
    expect(embedModels.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth Guard
// ═══════════════════════════════════════════════════════════════
describe('Auth Guard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'usr-1', role: 'user' }), { status: 200 }),
    ));
  });

  it('returns 401 when no auth token provided for chat', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    ));
    const res = await worker.fetch(
      makeRequest('/api/v1/ai/chat', 'POST', { messages: [{ role: 'user', content: 'hello' }] }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when no Authorization header for embeddings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    ));
    const res = await worker.fetch(
      makeRequest('/api/v1/ai/embeddings', 'POST', { text: 'hello' }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it('allows request through when auth succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'usr-1', role: 'user' }), { status: 200 }),
    ));
    const res = await worker.fetch(
      makeAuthRequest('/api/v1/ai/chat', 'POST', {
        messages: [{ role: 'user', content: 'hello' }],
      }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Chat Completions
// ═══════════════════════════════════════════════════════════════
describe('Chat Completions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'usr-1', role: 'user' }), { status: 200 }),
    ));
  });

  it('POST /api/v1/ai/chat returns chat result', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeAuthRequest('/api/v1/ai/chat', 'POST', {
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.result).toBeDefined();
    expect(body.model).toBeDefined();
  });

  it('uses default model when none specified', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeAuthRequest('/api/v1/ai/chat', 'POST', {
        messages: [{ role: 'user', content: 'hello' }],
      }),
      env,
    );
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.model).toBe('string');
    expect((body.model as string).length).toBeGreaterThan(0);
  });

  it('passes custom model to AI binding', async () => {
    const env = makeEnv();
    await worker.fetch(
      makeAuthRequest('/api/v1/ai/chat', 'POST', {
        messages: [{ role: 'user', content: 'hello' }],
        model: '@cf/mistral/mistral-7b-instruct-v0.1',
      }),
      env,
    );
    expect(env.AI.run).toHaveBeenCalledWith(
      '@cf/mistral/mistral-7b-instruct-v0.1',
      expect.objectContaining({ messages: expect.any(Array) }),
    );
  });

  it('respects max_tokens parameter', async () => {
    const env = makeEnv();
    await worker.fetch(
      makeAuthRequest('/api/v1/ai/chat', 'POST', {
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 256,
      }),
      env,
    );
    expect(env.AI.run).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ max_tokens: 256 }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Embeddings
// ═══════════════════════════════════════════════════════════════
describe('Embeddings', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'usr-1', role: 'user' }), { status: 200 }),
    ));
  });

  it('POST /api/v1/ai/embeddings returns embedding result', async () => {
    const env = makeEnv({
      AI: {
        run: vi.fn().mockResolvedValue({
          data: [[0.1, 0.2, 0.3]],
          shape: [1, 384],
        }),
      },
    });
    const res = await worker.fetch(
      makeAuthRequest('/api/v1/ai/embeddings', 'POST', { text: 'embed this' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.result).toBeDefined();
    expect(body.model).toBeDefined();
  });

  it('accepts array of strings for batch embeddings', async () => {
    const env = makeEnv({
      AI: {
        run: vi.fn().mockResolvedValue({
          data: [[0.1, 0.2], [0.3, 0.4]],
          shape: [2, 2],
        }),
      },
    });
    const res = await worker.fetch(
      makeAuthRequest('/api/v1/ai/embeddings', 'POST', {
        text: ['embed this', 'and this too'],
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(env.AI.run).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text: ['embed this', 'and this too'] }),
    );
  });

  it('wraps single string in array', async () => {
    const env = makeEnv({
      AI: { run: vi.fn().mockResolvedValue({ data: [[0.1, 0.2]], shape: [1, 2] }) },
    });
    await worker.fetch(
      makeAuthRequest('/api/v1/ai/embeddings', 'POST', { text: 'single string' }),
      env,
    );
    expect(env.AI.run).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text: ['single string'] }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════
describe('Error Handling', () => {
  it('returns 404 for unknown routes (with valid auth)', async () => {
    // Auth check runs before routing, so we need a valid token to reach the 404 handler
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'usr-1', role: 'user' }), { status: 200 }),
    ));
    const res = await worker.fetch(makeAuthRequest('/unknown/route', 'GET'), makeEnv());
    vi.unstubAllGlobals();
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('returns 500 with obscured error in production', async () => {
    const env = makeEnv({
      ENVIRONMENT: 'production',
      AI: { run: vi.fn().mockRejectedValue(new Error('AI binding crashed')) },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'usr-1', role: 'user' }), { status: 200 }),
    ));
    const res = await worker.fetch(
      makeAuthRequest('/api/v1/ai/chat', 'POST', {
        messages: [{ role: 'user', content: 'hello' }],
      }),
      env,
    );
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Internal server error');
  });

  it('returns 500 with real error in non-production', async () => {
    const env = makeEnv({
      ENVIRONMENT: 'test',
      AI: { run: vi.fn().mockRejectedValue(new Error('AI binding crashed')) },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'usr-1', role: 'user' }), { status: 200 }),
    ));
    const res = await worker.fetch(
      makeAuthRequest('/api/v1/ai/chat', 'POST', {
        messages: [{ role: 'user', content: 'hello' }],
      }),
      env,
    );
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('AI binding crashed');
  });
});

// ═══════════════════════════════════════════════════════════════
// Custom Allowed Origins
// ═══════════════════════════════════════════════════════════════
describe('Custom Allowed Origins', () => {
  it('allows custom origin from ALLOWED_ORIGINS env var', async () => {
    const env = makeEnv({ ALLOWED_ORIGINS: 'https://custom-app.example.com' });
    const req = new Request('https://ai-api.example.com/health', {
      headers: { Origin: 'https://custom-app.example.com' },
    });
    const res = await worker.fetch(req, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://custom-app.example.com');
  });

  it('allows localhost origins for development', async () => {
    const req = new Request('https://ai-api.example.com/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });
});