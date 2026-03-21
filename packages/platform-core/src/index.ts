/**
 * @trancendos/platform-core — Unified Worker Bootstrap
 * =====================================================
 * Provides standardized worker initialization, middleware chains,
 * error handling, and platform-wide utilities. Every Trancendos
 * worker imports this as its foundation.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface PlatformEnv {
  ENVIRONMENT: string;
  DB?: D1Database;
  CACHE?: KVNamespace;
  [key: string]: unknown;
}

export interface RequestContext {
  /** Unique request ID */
  requestId: string;
  /** Tenant ID from header or path */
  tenantId?: string;
  /** Authenticated user ID */
  userId?: string;
  /** User's role */
  role?: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Span ID */
  spanId?: string;
  /** Request start time (ms) */
  startTime: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  checks?: Record<string, { status: string; latencyMs?: number }>;
}

export type Middleware<E extends PlatformEnv = PlatformEnv> = (
  request: Request,
  env: E,
  ctx: RequestContext,
) => Promise<Response | void>;

export interface WorkerConfig<E extends PlatformEnv = PlatformEnv> {
  /** Service name for identification */
  name: string;
  /** Service version */
  version: string;
  /** CORS allowed origins (empty = no CORS) */
  corsOrigins?: string[];
  /** Middleware chain to run before route handling */
  middleware?: Middleware<E>[];
  /** Rate limit per minute per IP (0 = disabled) */
  rateLimitPerMinute?: number;
  /** Whether to add security headers */
  securityHeaders?: boolean;
}

// ── ID Generation ──────────────────────────────────────────────────────

export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Request Context Builder ────────────────────────────────────────────

export function buildRequestContext(request: Request): RequestContext {
  return {
    requestId: request.headers.get('X-Request-Id') || generateRequestId(),
    tenantId: request.headers.get('X-Tenant-Id') || undefined,
    userId: request.headers.get('X-User-Id') || undefined,
    role: request.headers.get('X-User-Role') || undefined,
    traceId: request.headers.get('X-Trace-Id') || generateId('trace'),
    spanId: generateId('span'),
    startTime: Date.now(),
    metadata: {},
  };
}

// ── Error Handling ─────────────────────────────────────────────────────

export class PlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export class NotFoundError extends PlatformError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${resource} "${id}" not found` : `${resource} not found`,
      404,
    );
  }
}

export class UnauthorizedError extends PlatformError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends PlatformError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403);
  }
}

export class BadRequestError extends PlatformError {
  constructor(message: string, details?: unknown) {
    super('BAD_REQUEST', message, 400, details);
  }
}

export class ConflictError extends PlatformError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class RateLimitError extends PlatformError {
  constructor(retryAfterSeconds = 60) {
    super('RATE_LIMITED', `Rate limit exceeded. Retry after ${retryAfterSeconds}s`, 429, {
      retryAfter: retryAfterSeconds,
    });
  }
}

export function errorToResponse(error: unknown, requestId: string): Response {
  if (error instanceof PlatformError) {
    const body: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        details: error.details,
      },
    };
    return new Response(JSON.stringify(body), {
      status: error.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId,
    },
  };
  return new Response(JSON.stringify(body), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── CORS ───────────────────────────────────────────────────────────────

export function buildCorsHeaders(
  request: Request,
  allowedOrigins: string[],
): Record<string, string> {
  if (allowedOrigins.length === 0) return {};

  const origin = request.headers.get('Origin') || '';
  const isAllowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin);

  if (!isAllowed) return {};

  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes('*') ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id, X-Request-Id, X-Trace-Id, X-User-Id',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'X-Request-Id, X-Trace-Id',
  };
}

export function handleCorsPrelight(
  request: Request,
  allowedOrigins: string[],
): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const headers = buildCorsHeaders(request, allowedOrigins);
  if (Object.keys(headers).length === 0) {
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204, headers });
}

// ── Security Headers ───────────────────────────────────────────────────

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

export function applySecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ── Health Check Builder ───────────────────────────────────────────────

const startupTime = Date.now();

export function buildHealthResponse(
  config: WorkerConfig,
  checks?: Record<string, { status: string; latencyMs?: number }>,
): Response {
  const hasUnhealthyCheck = checks
    ? Object.values(checks).some((c) => c.status === 'unhealthy')
    : false;
  const hasDegradedCheck = checks
    ? Object.values(checks).some((c) => c.status === 'degraded')
    : false;

  const status: HealthCheckResponse['status'] = hasUnhealthyCheck
    ? 'unhealthy'
    : hasDegradedCheck
      ? 'degraded'
      : 'healthy';

  const body: HealthCheckResponse = {
    status,
    service: config.name,
    version: config.version,
    uptime: Date.now() - startupTime,
    timestamp: new Date().toISOString(),
    ...(checks && { checks }),
  };

  return new Response(JSON.stringify(body), {
    status: status === 'unhealthy' ? 503 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── JSON Helpers ───────────────────────────────────────────────────────

export function jsonResponse<T>(data: T, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new BadRequestError('Invalid JSON body');
  }
}

// ── Validation Helpers ─────────────────────────────────────────────────

export function requireTenantId(ctx: RequestContext): string {
  if (!ctx.tenantId) {
    throw new BadRequestError('X-Tenant-Id header is required');
  }
  return ctx.tenantId;
}

export function requireUserId(ctx: RequestContext): string {
  if (!ctx.userId) {
    throw new UnauthorizedError('Authentication required');
  }
  return ctx.userId;
}

export function validateRequired(obj: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length > 0) {
    throw new BadRequestError(`Missing required fields: ${missing.join(', ')}`);
  }
}

export function validateStringLength(value: string, field: string, min: number, max: number): void {
  if (value.length < min || value.length > max) {
    throw new BadRequestError(`${field} must be between ${min} and ${max} characters`);
  }
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug);
}

// ── Pagination ─────────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function parsePagination(url: URL, defaults: { page?: number; limit?: number } = {}): PaginationParams {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || String(defaults.page || 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || String(defaults.limit || 20), 10)));
  return { page, limit, offset: (page - 1) * limit };
}

export function buildPaginatedResponse<T>(data: T[], total: number, params: PaginationParams): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit);
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

// ── Retry Utility ──────────────────────────────────────────────────────

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === opts.maxAttempts) break;

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ── Timing Utility ─────────────────────────────────────────────────────

export async function withTiming<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

// ── Cache Helpers ──────────────────────────────────────────────────────

export async function cacheGet<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  const cached = await kv.get(key, 'text');
  if (!cached) return null;
  try {
    return JSON.parse(cached) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(
  kv: KVNamespace,
  key: string,
  value: unknown,
  ttlSeconds: number = 300,
): Promise<void> {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

export async function cacheDelete(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

export async function cacheGetOrSet<T>(
  kv: KVNamespace,
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300,
): Promise<T> {
  const cached = await cacheGet<T>(kv, key);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  await cacheSet(kv, key, fresh, ttlSeconds);
  return fresh;
}

// ── Environment Helpers ────────────────────────────────────────────────

export function isProduction(env: PlatformEnv): boolean {
  return env.ENVIRONMENT === 'production';
}

export function isDevelopment(env: PlatformEnv): boolean {
  return env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'dev';
}

export function isStaging(env: PlatformEnv): boolean {
  return env.ENVIRONMENT === 'staging';
}