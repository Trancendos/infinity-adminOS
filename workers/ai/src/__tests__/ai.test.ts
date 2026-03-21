/**
 * @trancendos/ai-worker — Test Suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MODEL_REGISTRY,
  resolveProvider,
  buildCacheKey,
  hashString,
  generateId,
} from '../index.js';

// ── Mock Environment ───────────────────────────────────────────────────────

function createMockEnv() {
  return {
    AI: {
      run: vi.fn().mockResolvedValue({ response: 'AI response', usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }),
    },
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    },
    CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    USAGE_ANALYTICS: {
      writeDataPoint: vi.fn(),
    },
    OPENAI_API_KEY: 'test-openai-key',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    ENVIRONMENT: 'test',
  };
}

function createApp() {
  // Dynamic import would be ideal, but for unit testing we test exports directly
  // and test the Hono app via fetch-like calls
  return import('../index.js');
}

// ── Model Registry ─────────────────────────────────────────────────────────

describe('Model Registry', () => {
  it('should have Workers AI models', () => {
    const workersAI = Object.values(MODEL_REGISTRY).filter((m) => m.provider === 'workers-ai');
    expect(workersAI.length).toBeGreaterThanOrEqual(3);
  });

  it('should have OpenAI models', () => {
    const openai = Object.values(MODEL_REGISTRY).filter((m) => m.provider === 'openai');
    expect(openai.length).toBeGreaterThanOrEqual(2);
  });

  it('should have Anthropic models', () => {
    const anthropic = Object.values(MODEL_REGISTRY).filter((m) => m.provider === 'anthropic');
    expect(anthropic.length).toBeGreaterThanOrEqual(1);
  });

  it('should have required fields on all models', () => {
    for (const model of Object.values(MODEL_REGISTRY)) {
      expect(model.id).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.capabilities).toBeInstanceOf(Array);
      expect(model.max_tokens).toBeGreaterThan(0);
      expect(typeof model.supports_streaming).toBe('boolean');
    }
  });

  it('should have embedding models', () => {
    const embedders = Object.values(MODEL_REGISTRY).filter((m) =>
      m.capabilities.includes('embeddings'),
    );
    expect(embedders.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Provider Resolution ────────────────────────────────────────────────────

describe('resolveProvider', () => {
  it('should use explicit provider when given', () => {
    expect(resolveProvider('any-model', 'openai')).toBe('openai');
    expect(resolveProvider('any-model', 'anthropic')).toBe('anthropic');
    expect(resolveProvider('any-model', 'workers-ai')).toBe('workers-ai');
  });

  it('should resolve from model registry', () => {
    expect(resolveProvider('@cf/meta/llama-3.1-8b-instruct')).toBe('workers-ai');
    expect(resolveProvider('gpt-4o')).toBe('openai');
    expect(resolveProvider('claude-3-5-sonnet')).toBe('anthropic');
  });

  it('should resolve from model prefix patterns', () => {
    expect(resolveProvider('@cf/some/new-model')).toBe('workers-ai');
    expect(resolveProvider('gpt-5-turbo')).toBe('openai');
    expect(resolveProvider('claude-4-opus')).toBe('anthropic');
  });

  it('should default to workers-ai for unknown models', () => {
    expect(resolveProvider('some-unknown-model')).toBe('workers-ai');
  });
});

// ── Cache Key Generation ───────────────────────────────────────────────────

describe('buildCacheKey', () => {
  it('should generate consistent keys for same input', () => {
    const req = {
      model: 'gpt-4o',
      messages: [{ role: 'user' as const, content: 'hello' }],
      temperature: 0,
      max_tokens: 100,
    };
    const key1 = buildCacheKey(req);
    const key2 = buildCacheKey(req);
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different inputs', () => {
    const req1 = { model: 'gpt-4o', prompt: 'hello' };
    const req2 = { model: 'gpt-4o', prompt: 'world' };
    expect(buildCacheKey(req1)).not.toBe(buildCacheKey(req2));
  });

  it('should include ai-cache prefix', () => {
    const key = buildCacheKey({ model: 'test', prompt: 'hello' });
    expect(key).toMatch(/^ai-cache:/);
  });
});

// ── Hash Function ──────────────────────────────────────────────────────────

describe('hashString', () => {
  it('should produce consistent hashes', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('should produce different hashes for different strings', () => {
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('should return a base36 string', () => {
    const hash = hashString('test');
    expect(hash).toMatch(/^[0-9a-z]+$/);
  });
});

// ── ID Generation ──────────────────────────────────────────────────────────

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });

  it('should have inf_ prefix', () => {
    expect(generateId()).toMatch(/^inf_/);
  });
});

// ── Hono App Routes ────────────────────────────────────────────────────────

describe('AI Worker Routes', () => {
  let app: { default: { fetch: (req: Request, env: unknown) => Promise<Response> } };
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(async () => {
    app = await createApp() as typeof app;
    env = createMockEnv();
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/health'),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('ai-worker');
      expect(body.models).toBeGreaterThan(0);
    });
  });

  describe('GET /v1/models', () => {
    it('should list all models', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/models'),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { models: unknown[]; total: number };
      expect(body.models.length).toBeGreaterThan(0);
      expect(body.total).toBe(body.models.length);
    });

    it('should filter by provider', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/models?provider=openai'),
        env,
      );
      const body = await res.json() as { models: { provider: string }[] };
      for (const m of body.models) {
        expect(m.provider).toBe('openai');
      }
    });

    it('should filter by capability', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/models?capability=embeddings'),
        env,
      );
      const body = await res.json() as { models: { capabilities: string[] }[] };
      for (const m of body.models) {
        expect(m.capabilities).toContain('embeddings');
      }
    });
  });

  describe('POST /v1/inference', () => {
    it('should require model field', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'hello' }),
        }),
        env,
      );
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('should require messages or prompt', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o' }),
        }),
        env,
      );
      expect(res.status).toBe(400);
    });

    it('should call Workers AI for @cf/ models', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: '@cf/meta/llama-3.1-8b-instruct',
            prompt: 'Hello',
          }),
        }),
        env,
      );
      expect(res.status).toBe(200);
      expect(env.AI.run).toHaveBeenCalled();
      const body = await res.json() as { provider: string; content: string };
      expect(body.provider).toBe('workers-ai');
      expect(body.content).toBeTruthy();
    });

    it('should return rate limit error when exceeded', async () => {
      env.CACHE.get = vi.fn().mockResolvedValue('100'); // Already at limit
      const res = await app.default.fetch(
        new Request('http://localhost/v1/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: '@cf/meta/llama-3.1-8b-instruct',
            prompt: 'test',
          }),
        }),
        env,
      );
      expect(res.status).toBe(429);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('RATE_LIMITED');
    });

    it('should track usage analytics', async () => {
      await app.default.fetch(
        new Request('http://localhost/v1/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: '@cf/meta/llama-3.1-8b-instruct',
            prompt: 'Hello',
            tenant_id: 'tenant-1',
          }),
        }),
        env,
      );
      expect(env.USAGE_ANALYTICS.writeDataPoint).toHaveBeenCalled();
    });

    it('should return 503 for unconfigured OpenAI', async () => {
      env.OPENAI_API_KEY = undefined;
      const res = await app.default.fetch(
        new Request('http://localhost/v1/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o', prompt: 'test' }),
        }),
        env,
      );
      expect(res.status).toBe(503);
    });

    it('should return 503 for unconfigured Anthropic', async () => {
      env.ANTHROPIC_API_KEY = undefined;
      const res = await app.default.fetch(
        new Request('http://localhost/v1/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-3-5-sonnet', prompt: 'test' }),
        }),
        env,
      );
      expect(res.status).toBe(503);
    });

    it('should include latency_ms in response', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/inference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: '@cf/meta/llama-3.1-8b-instruct',
            prompt: 'test',
          }),
        }),
        env,
      );
      const body = await res.json() as { latency_ms: number };
      expect(body.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /v1/embeddings', () => {
    it('should require input', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        env,
      );
      expect(res.status).toBe(400);
    });

    it('should generate embeddings', async () => {
      env.AI.run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] });
      const res = await app.default.fetch(
        new Request('http://localhost/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: 'hello world' }),
        }),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { embeddings: number[][]; dimensions: number };
      expect(body.embeddings).toHaveLength(1);
      expect(body.dimensions).toBe(3);
    });

    it('should handle array input', async () => {
      env.AI.run = vi.fn().mockResolvedValue({ data: [[0.1], [0.2]] });
      const res = await app.default.fetch(
        new Request('http://localhost/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: ['hello', 'world'] }),
        }),
        env,
      );
      const body = await res.json() as { count: number };
      expect(body.count).toBe(2);
    });
  });

  describe('GET /v1/usage/:tenantId', () => {
    it('should return usage stats', async () => {
      env.CACHE.get = vi.fn().mockResolvedValue('5');
      const res = await app.default.fetch(
        new Request('http://localhost/v1/usage/tenant-1'),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { tenant_id: string; current_window: { requests: number } };
      expect(body.tenant_id).toBe('tenant-1');
      expect(body.current_window.requests).toBe(5);
    });
  });

  describe('404 catch-all', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/unknown'),
        env,
      );
      expect(res.status).toBe(404);
    });
  });
});