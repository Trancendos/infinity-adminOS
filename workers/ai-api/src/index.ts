// ============================================================
// Infinity OS — AI API Worker
// ============================================================
// Routes:
//   GET  /health
//   POST /api/v1/ai/chat          — Chat completions (proxied)
//   POST /api/v1/ai/complete      — Text completion
//   GET  /api/v1/ai/models        — Available models
//   POST /api/v1/ai/embeddings    — Text embeddings
// ============================================================

export interface Env {
  AI: Ai;
  CACHE: KVNamespace;
  AUTH_API_URL: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = [
    'https://infinity-portal.pages.dev',
    'https://infinity-portal.com',
    'http://localhost:5173',
    'http://localhost:3000',
    ...(env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()),
  ];
  if (allowed.includes(origin) || origin.endsWith('.infinity-portal.pages.dev')) return origin;
  return null;
}

function jsonResponse(data: unknown, status = 200, request?: Request, env?: Env): Response {
  const origin = request && env ? getAllowedOrigin(request, env) : null;
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
      ...(origin ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      } : {}),
    },
  });
}

async function verifyToken(request: Request, env: Env): Promise<{ userId: string; role: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const authApiUrl = env.AUTH_API_URL || 'https://infinity-auth-api.luminous-aimastermind.workers.dev';
    const res = await fetch(`${authApiUrl}/api/v1/auth/me`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) return null;
    const user = await res.json() as { id: string; role: string };
    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      const origin = getAllowedOrigin(request, env);
      return new Response(null, {
        status: 204,
        headers: {
          ...(origin ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
          } : {}),
          ...SECURITY_HEADERS,
        },
      });
    }

    try {
      // Health check — no auth required
      if (pathname === '/health' || pathname === '/api/health') {
        return jsonResponse({
          status: 'healthy',
          service: 'ai-api',
          environment: env.ENVIRONMENT,
          timestamp: new Date().toISOString(),
        }, 200, request, env);
      }

      // Available models — no auth required
      if (pathname === '/api/v1/ai/models' && request.method === 'GET') {
        return jsonResponse({
          models: [
            { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', type: 'chat' },
            { id: '@cf/mistral/mistral-7b-instruct-v0.1', name: 'Mistral 7B', type: 'chat' },
            { id: '@cf/baai/bge-small-en-v1.5', name: 'BGE Small Embeddings', type: 'embedding' },
          ],
        }, 200, request, env);
      }

      // Auth required for AI endpoints
      const user = await verifyToken(request, env);
      if (!user) {
        return jsonResponse({ error: 'Authentication required' }, 401, request, env);
      }

      // Chat completions
      if (pathname === '/api/v1/ai/chat' && request.method === 'POST') {
        const body = await request.json() as {
          messages: Array<{ role: string; content: string }>;
          model?: string;
          max_tokens?: number;
          stream?: boolean;
        };

        const model = body.model || '@cf/meta/llama-3.1-8b-instruct';
        // @ts-ignore — CF AI binding
        const response = await env.AI.run(model, {
          messages: body.messages,
          max_tokens: body.max_tokens || 512,
          stream: body.stream || false,
        });

        if (body.stream) {
          const origin = getAllowedOrigin(request, env);
          return new Response(response as ReadableStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
            },
          });
        }

        return jsonResponse({ result: response, model }, 200, request, env);
      }

      // Text embeddings
      if (pathname === '/api/v1/ai/embeddings' && request.method === 'POST') {
        const body = await request.json() as { text: string | string[]; model?: string };
        const model = body.model || '@cf/baai/bge-small-en-v1.5';

        // @ts-ignore
        const response = await env.AI.run(model, {
          text: Array.isArray(body.text) ? body.text : [body.text],
        });

        return jsonResponse({ result: response, model }, 200, request, env);
      }

      return jsonResponse({ error: `Route not found: ${request.method} ${pathname}` }, 404, request, env);

    } catch (err) {
      console.error('AI API error:', err);
      return jsonResponse({
        error: env.ENVIRONMENT === 'production' ? 'Internal server error' : String(err),
      }, 500, request, env);
    }
  },
};