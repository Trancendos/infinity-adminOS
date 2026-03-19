/**
 * Dispatch Worker — Type Definitions
 * ═══════════════════════════════════════════════════════════════
 * Central types for the OS kernel request routing layer.
 */

// ─── Tenant Resolution ──────────────────────────────────────────

export interface TenantIdentity {
  tenantId: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'provisioning';
  domain?: string;
}

export interface ResolvedRoute {
  tenantId: string;
  targetWorker: string;
  pathPattern: string;
  auth: boolean;
  rateLimit?: number;
  metadata?: Record<string, string>;
}

// ─── Rate Limiting ──────────────────────────────────────────────

export interface RateLimitConfig {
  /** Requests per window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/** Default rate limits per plan */
export const PLAN_RATE_LIMITS: Record<TenantIdentity['plan'], RateLimitConfig> = {
  free:       { limit: 100,   windowSec: 60 },
  starter:    { limit: 500,   windowSec: 60 },
  pro:        { limit: 2000,  windowSec: 60 },
  enterprise: { limit: 10000, windowSec: 60 },
};

// ─── Auth ───────────────────────────────────────────────────────

export interface AuthResult {
  authenticated: boolean;
  tenantId?: string;
  userId?: string;
  scopes?: string[];
  error?: string;
}

export interface JWTPayload {
  sub: string;        // userId
  tid: string;        // tenantId
  scopes: string[];
  iat: number;
  exp: number;
}

// ─── CORS ───────────────────────────────────────────────────────

export interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  maxAge: number;
  credentials: boolean;
}

/** Default CORS per plan */
export const PLAN_CORS_DEFAULTS: Record<TenantIdentity['plan'], CORSConfig> = {
  free: {
    allowedOrigins: ['*'],
    allowedMethods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
    credentials: false,
  },
  starter: {
    allowedOrigins: ['*'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    maxAge: 3600,
    credentials: true,
  },
  pro: {
    allowedOrigins: ['*'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Tenant-ID'],
    maxAge: 86400,
    credentials: true,
  },
  enterprise: {
    allowedOrigins: ['*'], // Overridden per-tenant via TenantDO config
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['*'],
    maxAge: 86400,
    credentials: true,
  },
};

// ─── Environment Bindings ───────────────────────────────────────

export interface Env {
  /** Workers for Platforms dispatcher */
  DISPATCHER: {
    get(name: string): { fetch(req: Request): Promise<Response> };
  };

  /** TenantDO Durable Object namespace */
  TENANT_DO: DurableObjectNamespace;

  /** D1 database for tenant registry */
  DB: D1Database;

  /** KV namespace for rate-limit counters & session cache */
  CACHE: KVNamespace;

  /** JWT signing secret (should be per-tenant in production) */
  JWT_SECRET: string;

  /** Environment identifier */
  ENVIRONMENT: string;
}

// ─── Request Context ────────────────────────────────────────────

export interface RequestContext {
  requestId: string;
  startTime: number;
  tenant?: TenantIdentity;
  route?: ResolvedRoute;
  auth?: AuthResult;
  rateLimit?: RateLimitResult;
}

// ─── Dispatch Result ────────────────────────────────────────────

export interface DispatchResult {
  response: Response;
  context: RequestContext;
  durationMs: number;
}

// ─── Error Codes ────────────────────────────────────────────────

export enum DispatchError {
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  TENANT_SUSPENDED = 'TENANT_SUSPENDED',
  TENANT_PROVISIONING = 'TENANT_PROVISIONING',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_INVALID = 'AUTH_INVALID',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  RATE_LIMITED = 'RATE_LIMITED',
  WORKER_NOT_FOUND = 'WORKER_NOT_FOUND',
  WORKER_ERROR = 'WORKER_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export function errorResponse(
  error: DispatchError,
  message: string,
  status: number,
  requestId?: string,
): Response {
  return new Response(
    JSON.stringify({
      error,
      message,
      requestId: requestId ?? 'unknown',
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId ?? 'unknown',
      },
    },
  );
}