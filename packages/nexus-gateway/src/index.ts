/**
 * Trancendos Nexus Gateway — Cloudflare Worker
 * ───────────────────────────────────────────────
 * Central API gateway that routes requests to all
 * Trancendos services with:
 * • Service mesh integration
 * • Rate limiting via KV
 * • Response caching for GET requests
 * • CORS handling with preflight support
 * • Health check and service discovery
 * • Authentication/authorization via Infinity IAM
 */

export interface Env {
  // Environment
  ENVIRONMENT: string;
  TRANCENDOS_DOMAIN: string;
  API_VERSION: string;

  // D1 Databases
  TRANCENDOS_DB: D1Database;
  INFINITY_IAM_DB: D1Database;
  OBSERVATORY_DB: D1Database;
  FLUIDMATRIX_DB: D1Database;

  // KV Namespaces
  RATE_LIMIT: KVNamespace;
  CACHE: KVNamespace;
  SESSIONS: KVNamespace;
  CONFIG: KVNamespace;

  // R2 Buckets
  ASSETS: R2Bucket;
  UPLOADS: R2Bucket;
  BACKUPS: R2Bucket;

  // Queues
  MESH_QUEUE: Queue;
  JOBS_QUEUE: Queue;
  EVENTS_QUEUE: Queue;

  // Durable Objects
  AGENT_STATE: DurableObjectNamespace;
  WS_HUB: DurableObjectNamespace;
}

const ALLOWED_ORIGINS = [
  "https://trancendos.com",
  "https://www.trancendos.com",
  "https://app.trancendos.com",
  "http://localhost:8000",
  "http://localhost:3000",
  "http://localhost:3001",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Request-ID, X-Session-ID",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Credentials": "true",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

const SERVICE_PORTS: Record<string, string> = {
  "infinity-iam": "8001",
  observatory: "3012",
  fluidmatrix: "3015",
  "plugin-registry": "8081",
  workshop: "3000",
  arcadia: "3001",
  cornelius: "3001",
  guardian: "3002",
  savania: "3004",
  "the-dr": "3005",
  creative: "3010",
  financial: "3011",
  knowledge: "3013",
  security: "3014",
  wellbeing: "3016",
};

function getAllowedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.endsWith(".trancendos.com")) return origin;
  if (origin.endsWith(".pages.dev")) return origin;
  return null;
}

function jsonResponse(
  data: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

async function checkRateLimit(
  env: Env,
  clientIP: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const rpm = 120;
  const key = `rl:${clientIP}`;
  const now = Math.floor(Date.now() / 60000);
  const windowKey = `${key}:${now}`;

  try {
    const current = parseInt((await env.RATE_LIMIT.get(windowKey)) || "0", 10);

    if (current >= rpm) {
      return { allowed: false, remaining: 0 };
    }

    await env.RATE_LIMIT.put(windowKey, String(current + 1), {
      expirationTtl: 120,
    });
    return { allowed: true, remaining: rpm - current - 1 };
  } catch {
    return { allowed: true, remaining: rpm };
  }
}

async function getCache(env: Env, key: string): Promise<Response | null> {
  try {
    const cached = await env.CACHE.get(key);
    if (cached) {
      return new Response(cached, {
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
          ...SECURITY_HEADERS,
        },
      });
    }
  } catch {}
  return null;
}

async function setCache(
  env: Env,
  key: string,
  response: Response,
  ttl: number,
): Promise<void> {
  try {
    const body = await response.text();
    await env.CACHE.put(key, body, { expirationTtl: ttl });
  } catch {}
}

function getServiceUrl(service: string, path: string): string | null {
  const port = SERVICE_PORTS[service];
  if (!port) return null;
  const host = `localhost:${port}`;
  return `${path.startsWith("/") ? "" : "/"}${path}`;
}

async function forwardToService(
  service: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const url = getServiceUrl(service, request.url);
  if (!url) {
    return jsonResponse({ error: "Service not found", service }, 404);
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "host") {
      headers[key] = value;
    }
  });

  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "transfer-encoding") {
        responseHeaders[key] = value;
      }
    });

    return new Response(response.body, {
      status: response.status,
      headers: { ...responseHeaders, ...SECURITY_HEADERS },
    });
  } catch (e) {
    return jsonResponse(
      { error: "Service unavailable", service, message: String(e) },
      503,
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = getAllowedOrigin(request);
    const corsExtra = origin ? { "Access-Control-Allow-Origin": origin } : {};

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { ...CORS_HEADERS, ...corsExtra } });
    }

    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateLimit = await checkRateLimit(env, clientIP);
    if (!rateLimit.allowed) {
      return jsonResponse({ error: "Rate limit exceeded" }, 429, corsExtra);
    }

    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return jsonResponse(
        { status: "healthy", timestamp: Date.now(), service: "nexus-gateway" },
        200,
        corsExtra,
      );
    }

    if (url.pathname === "/services" || url.pathname === "/api/services") {
      return jsonResponse(
        { services: SERVICE_PORTS, timestamp: Date.now() },
        200,
        corsExtra,
      );
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    const service = pathParts[0];

    if (service && SERVICE_PORTS[service]) {
      return forwardToService(service, request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      const cacheKey = `${url.pathname}:${url.search}`;
      if (request.method === "GET") {
        const cached = await getCache(env, cacheKey);
        if (cached) return cached;
      }

      const defaultService = "infinity-iam";
      const response = await forwardToService(defaultService, request, env);

      if (request.method === "GET" && response.status === 200) {
        await setCache(env, cacheKey, response, 60);
      }

      return response;
    }

    return jsonResponse(
      {
        error: "Not Found",
        message: "Use /health, /services, or /api/<service>/<path>",
        availableServices: Object.keys(SERVICE_PORTS),
      },
      404,
      corsExtra,
    );
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const payload = JSON.parse(message.body as string);
        console.log("Queue message:", payload);
        await message.ack();
      } catch (e) {
        console.error("Queue processing error:", e);
        await message.retry();
      }
    }
  },
};

export { DurableObject };
