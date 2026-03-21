/**
 * Shared test utilities for Cloudflare Worker testing
 * Provides mock bindings, request builders, and assertion helpers
 */

// ============================================================
// Mock KV Namespace
// ============================================================
export class MockKVNamespace implements KVNamespace {
  private store = new Map<string, { value: string; metadata?: unknown }>();

  async get(key: string, options?: any): Promise<any> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (options?.type === 'json') return JSON.parse(entry.value);
    return entry.value;
  }

  async put(key: string, value: string, options?: any): Promise<void> {
    this.store.set(key, { value, metadata: options?.metadata });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: any): Promise<KVNamespaceListResult<unknown, string>> {
    const keys = Array.from(this.store.keys())
      .filter((k) => !options?.prefix || k.startsWith(options.prefix))
      .map((name) => ({ name, expiration: undefined, metadata: undefined }));
    return { keys, list_complete: true, cacheStatus: null } as any;
  }

  async getWithMetadata(key: string, options?: any): Promise<any> {
    const entry = this.store.get(key);
    if (!entry) return { value: null, metadata: null, cacheStatus: null };
    return { value: entry.value, metadata: entry.metadata, cacheStatus: null };
  }

  clear(): void {
    this.store.clear();
  }
}

// ============================================================
// Mock D1 Database
// ============================================================
export class MockD1Database {
  private tables = new Map<string, any[]>();

  prepare(sql: string) {
    return {
      bind: (...params: any[]) => ({
        all: async <T = any>(): Promise<{ results: T[] }> => {
          return { results: [] as T[] };
        },
        first: async <T = any>(): Promise<T | null> => {
          return null;
        },
        run: async () => {
          return { success: true, meta: {} };
        },
      }),
    };
  }

  async batch(statements: any[]): Promise<any[]> {
    return statements.map(() => ({ results: [], success: true }));
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }

  async exec(sql: string): Promise<any> {
    return { count: 0, duration: 0 };
  }
}

// ============================================================
// Request Builder
// ============================================================
export function buildRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Request {
  const { method = 'GET', body, headers = {} } = options;
  const url = `https://test-worker.example.com${path}`;

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '127.0.0.1',
      ...headers,
    },
  };

  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  return new Request(url, init);
}

// ============================================================
// Response Assertion Helpers
// ============================================================
export async function expectJsonResponse(
  response: Response,
  expectedStatus: number = 200,
): Promise<any> {
  expect(response.status).toBe(expectedStatus);
  expect(response.headers.get('Content-Type')).toContain('application/json');
  return response.json();
}

export async function expectHealthy(response: Response): Promise<void> {
  const body = await expectJsonResponse(response, 200);
  expect(body.status).toMatch(/healthy|ok|operational/i);
}

export async function expectError(
  response: Response,
  expectedStatus: number,
  expectedCode?: string,
): Promise<any> {
  const body = await expectJsonResponse(response, expectedStatus);
  if (expectedCode) {
    expect(body.error?.code || body.code).toBe(expectedCode);
  }
  return body;
}

// ============================================================
// Mock Env Builder
// ============================================================
export function createMockEnv(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    DB: new MockD1Database(),
    KV_CACHE: new MockKVNamespace(),
    KV_RATE_LIMIT: new MockKVNamespace(),
    LIGHTHOUSE_URL: 'https://lighthouse.test.com',
    VOID_URL: 'https://void.test.com',
    INTERNAL_SECRET: 'test-internal-secret',
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test-jwt-secret',
    API_KEY: 'test-api-key',
    ...overrides,
  };
}

// ============================================================
// Security Header Assertions
// ============================================================
export function expectSecurityHeaders(response: Response): void {
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=');
}

// ============================================================
// CORS Header Assertions
// ============================================================
export function expectCorsHeaders(response: Response): void {
  const acao = response.headers.get('Access-Control-Allow-Origin');
  expect(acao).toBeTruthy();
}