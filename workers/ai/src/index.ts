/**
 * @trancendos/ai-worker — Unified AI Inference Proxy
 * ===================================================
 * Single entry point for all AI operations in the Trancendos platform.
 * Routes requests to Workers AI, OpenAI, Anthropic, or custom models
 * with tenant isolation, rate limiting, streaming, and usage tracking.
 */

import { Hono } from 'hono';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Env {
  AI: Ai;
  DB: D1Database;
  CACHE: KVNamespace;
  USAGE_ANALYTICS: AnalyticsEngineDataset;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ENVIRONMENT: string;
}

export type AIProvider = 'workers-ai' | 'openai' | 'anthropic';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceRequest {
  provider?: AIProvider;
  model: string;
  messages?: ChatMessage[];
  prompt?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  tenant_id?: string;
}

export interface InferenceResponse {
  id: string;
  provider: AIProvider;
  model: string;
  content: string;
  usage: TokenUsage;
  latency_ms: number;
  cached: boolean;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ModelInfo {
  id: string;
  provider: AIProvider;
  name: string;
  description: string;
  capabilities: string[];
  max_tokens: number;
  supports_streaming: boolean;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset_at: string;
}

// ── Model Registry ─────────────────────────────────────────────────────────

const MODEL_REGISTRY: Record<string, ModelInfo> = {
  '@cf/meta/llama-3.1-8b-instruct': {
    id: '@cf/meta/llama-3.1-8b-instruct',
    provider: 'workers-ai',
    name: 'Llama 3.1 8B Instruct',
    description: 'Meta Llama 3.1 8B — fast general-purpose chat',
    capabilities: ['chat', 'text-generation'],
    max_tokens: 4096,
    supports_streaming: true,
  },
  '@cf/meta/llama-3.1-70b-instruct': {
    id: '@cf/meta/llama-3.1-70b-instruct',
    provider: 'workers-ai',
    name: 'Llama 3.1 70B Instruct',
    description: 'Meta Llama 3.1 70B — high quality reasoning',
    capabilities: ['chat', 'text-generation', 'reasoning'],
    max_tokens: 4096,
    supports_streaming: true,
  },
  '@cf/mistral/mistral-7b-instruct-v0.2': {
    id: '@cf/mistral/mistral-7b-instruct-v0.2',
    provider: 'workers-ai',
    name: 'Mistral 7B Instruct',
    description: 'Mistral 7B — efficient and fast',
    capabilities: ['chat', 'text-generation'],
    max_tokens: 4096,
    supports_streaming: true,
  },
  '@cf/baai/bge-base-en-v1.5': {
    id: '@cf/baai/bge-base-en-v1.5',
    provider: 'workers-ai',
    name: 'BGE Base English',
    description: 'Text embeddings for semantic search',
    capabilities: ['embeddings'],
    max_tokens: 512,
    supports_streaming: false,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'GPT-4o',
    description: 'OpenAI GPT-4o — multimodal flagship',
    capabilities: ['chat', 'text-generation', 'reasoning', 'vision'],
    max_tokens: 16384,
    supports_streaming: true,
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'GPT-4o Mini',
    description: 'OpenAI GPT-4o Mini — cost effective',
    capabilities: ['chat', 'text-generation'],
    max_tokens: 16384,
    supports_streaming: true,
  },
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet',
    provider: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    description: 'Anthropic Claude 3.5 Sonnet — balanced',
    capabilities: ['chat', 'text-generation', 'reasoning'],
    max_tokens: 8192,
    supports_streaming: true,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `inf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveProvider(model: string, requestedProvider?: AIProvider): AIProvider {
  if (requestedProvider) return requestedProvider;
  const info = MODEL_REGISTRY[model];
  if (info) return info.provider;
  if (model.startsWith('@cf/')) return 'workers-ai';
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  return 'workers-ai';
}

// ── Rate Limiter ───────────────────────────────────────────────────────────

async function checkRateLimit(
  kv: KVNamespace,
  tenantId: string,
  limit = 100,
  windowSeconds = 60,
): Promise<RateLimitInfo> {
  const key = `rate:${tenantId}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const current = parseInt((await kv.get(key)) || '0', 10);
  const remaining = Math.max(0, limit - current);
  const resetAt = new Date(
    (Math.floor(Date.now() / (windowSeconds * 1000)) + 1) * windowSeconds * 1000,
  ).toISOString();

  if (current >= limit) {
    return { remaining: 0, limit, reset_at: resetAt };
  }

  await kv.put(key, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return { remaining: remaining - 1, limit, reset_at: resetAt };
}

// ── Cache Layer ────────────────────────────────────────────────────────────

function buildCacheKey(req: InferenceRequest): string {
  const payload = JSON.stringify({
    model: req.model,
    messages: req.messages,
    prompt: req.prompt,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
  });
  return `ai-cache:${hashString(payload)}`;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ── Provider Implementations ───────────────────────────────────────────────

async function inferWorkersAI(
  ai: Ai,
  request: InferenceRequest,
): Promise<{ content: string; usage: TokenUsage }> {
  const input = request.messages
    ? { messages: request.messages, max_tokens: request.max_tokens || 1024, temperature: request.temperature }
    : { prompt: request.prompt || '', max_tokens: request.max_tokens || 1024, temperature: request.temperature };

  const result = await ai.run(request.model as Parameters<Ai['run']>[0], input) as Record<string, unknown>;

  const content = typeof result === 'string'
    ? result
    : (result?.response as string) || JSON.stringify(result);

  return {
    content,
    usage: {
      prompt_tokens: (result?.usage as TokenUsage)?.prompt_tokens || 0,
      completion_tokens: (result?.usage as TokenUsage)?.completion_tokens || 0,
      total_tokens: (result?.usage as TokenUsage)?.total_tokens || 0,
    },
  };
}

async function inferOpenAI(
  apiKey: string,
  request: InferenceRequest,
): Promise<{ content: string; usage: TokenUsage }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages || [{ role: 'user', content: request.prompt || '' }],
      max_tokens: request.max_tokens || 1024,
      temperature: request.temperature ?? 0.7,
      top_p: request.top_p,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  const data = await response.json() as {
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    },
  };
}

async function inferAnthropic(
  apiKey: string,
  request: InferenceRequest,
): Promise<{ content: string; usage: TokenUsage }> {
  const messages = request.messages?.filter((m) => m.role !== 'system') || [
    { role: 'user' as const, content: request.prompt || '' },
  ];
  const systemMsg = request.messages?.find((m) => m.role === 'system')?.content;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: request.model,
      messages,
      max_tokens: request.max_tokens || 1024,
      temperature: request.temperature ?? 0.7,
      ...(systemMsg && { system: systemMsg }),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }

  const data = await response.json() as {
    content: { text: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    content: data.content?.[0]?.text || '',
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

// ── Hono App ───────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// Health check
app.get('/health', (c) =>
  c.json({
    status: 'healthy',
    service: 'ai-worker',
    timestamp: new Date().toISOString(),
    models: Object.keys(MODEL_REGISTRY).length,
  }),
);

// List available models
app.get('/v1/models', (c) => {
  const provider = c.req.query('provider') as AIProvider | undefined;
  const capability = c.req.query('capability');

  let models = Object.values(MODEL_REGISTRY);
  if (provider) models = models.filter((m) => m.provider === provider);
  if (capability) models = models.filter((m) => m.capabilities.includes(capability));

  return c.json({ models, total: models.length });
});

// Get model info
app.get('/v1/models/:id', (c) => {
  const id = c.req.param('id');
  // Handle @cf/ style model IDs with slashes
  const fullId = c.req.url.split('/v1/models/')[1]?.split('?')[0];
  const model = MODEL_REGISTRY[fullId || id] || MODEL_REGISTRY[id];

  if (!model) {
    return c.json({ error: 'MODEL_NOT_FOUND', message: `Model ${id} not found` }, 404);
  }
  return c.json(model);
});

// Chat/Inference endpoint
app.post('/v1/inference', async (c) => {
  const body = await c.req.json<InferenceRequest>();

  // Validate
  if (!body.model) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'model is required' }, 400);
  }
  if (!body.messages && !body.prompt) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'messages or prompt is required' }, 400);
  }

  const tenantId = body.tenant_id || c.req.header('x-tenant-id') || 'anonymous';
  const provider = resolveProvider(body.model, body.provider);

  // Rate limiting
  const rateLimit = await checkRateLimit(c.env.CACHE, tenantId);
  if (rateLimit.remaining <= 0) {
    return c.json(
      {
        error: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        rate_limit: rateLimit,
      },
      429,
    );
  }

  // Check cache (only for non-streaming, deterministic requests)
  const useCache = !body.stream && (body.temperature === 0 || body.temperature === undefined);
  let cached = false;

  if (useCache) {
    const cacheKey = buildCacheKey(body);
    const cachedResult = await c.env.CACHE.get(cacheKey);
    if (cachedResult) {
      const parsed = JSON.parse(cachedResult) as InferenceResponse;
      return c.json({ ...parsed, cached: true });
    }
  }

  // Invoke provider
  const startTime = Date.now();
  let content: string;
  let usage: TokenUsage;

  try {
    switch (provider) {
      case 'workers-ai': {
        const result = await inferWorkersAI(c.env.AI, body);
        content = result.content;
        usage = result.usage;
        break;
      }
      case 'openai': {
        if (!c.env.OPENAI_API_KEY) {
          return c.json({ error: 'PROVIDER_NOT_CONFIGURED', message: 'OpenAI API key not set' }, 503);
        }
        const result = await inferOpenAI(c.env.OPENAI_API_KEY, body);
        content = result.content;
        usage = result.usage;
        break;
      }
      case 'anthropic': {
        if (!c.env.ANTHROPIC_API_KEY) {
          return c.json({ error: 'PROVIDER_NOT_CONFIGURED', message: 'Anthropic API key not set' }, 503);
        }
        const result = await inferAnthropic(c.env.ANTHROPIC_API_KEY, body);
        content = result.content;
        usage = result.usage;
        break;
      }
      default:
        return c.json({ error: 'UNKNOWN_PROVIDER', message: `Unknown provider: ${provider}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json(
      { error: 'INFERENCE_ERROR', message, provider, model: body.model },
      502,
    );
  }

  const latencyMs = Date.now() - startTime;

  const response: InferenceResponse = {
    id: generateId(),
    provider,
    model: body.model,
    content,
    usage,
    latency_ms: latencyMs,
    cached,
  };

  // Cache the result
  if (useCache) {
    const cacheKey = buildCacheKey(body);
    await c.env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 3600 });
  }

  // Track usage
  if (c.env.USAGE_ANALYTICS) {
    c.env.USAGE_ANALYTICS.writeDataPoint({
      blobs: [tenantId, provider, body.model],
      doubles: [usage.total_tokens, latencyMs],
      indexes: [tenantId],
    });
  }

  return c.json(response);
});

// Embeddings endpoint
app.post('/v1/embeddings', async (c) => {
  const body = await c.req.json<{ model?: string; input: string | string[] }>();

  if (!body.input) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'input is required' }, 400);
  }

  const model = body.model || '@cf/baai/bge-base-en-v1.5';
  const inputs = Array.isArray(body.input) ? body.input : [body.input];

  try {
    const result = await c.env.AI.run(model as Parameters<Ai['run']>[0], {
      text: inputs,
    }) as { data: number[][] };

    return c.json({
      model,
      embeddings: result.data || [],
      dimensions: (result.data?.[0] || []).length,
      count: inputs.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'EMBEDDING_ERROR', message }, 502);
  }
});

// Usage stats endpoint
app.get('/v1/usage/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const windowKey = `rate:${tenantId}:${Math.floor(Date.now() / 60000)}`;
  const currentUsage = parseInt((await c.env.CACHE.get(windowKey)) || '0', 10);

  return c.json({
    tenant_id: tenantId,
    current_window: {
      requests: currentUsage,
      window_seconds: 60,
    },
  });
});

// 404 catch-all
app.all('*', (c) =>
  c.json({ error: 'NOT_FOUND', message: `Route not found: ${c.req.method} ${c.req.path}` }, 404),
);

export default app;

// Export for testing
export {
  MODEL_REGISTRY,
  resolveProvider,
  buildCacheKey,
  hashString,
  generateId,
  checkRateLimit,
  inferWorkersAI,
  inferOpenAI,
  inferAnthropic,
};