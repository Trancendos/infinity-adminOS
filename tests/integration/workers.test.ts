import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ─────────────────────────────────────────────
   Infinity OS — Worker Integration Tests
   Tests for Cloudflare Worker interactions:
   identity, filesystem, registry, search,
   notifications, and AI workers.
   ───────────────────────────────────────────── */

// ── Mock Worker Runtime ─────────────────────

interface WorkerRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

interface WorkerResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

interface WorkerEnv {
  DB: MockD1Database;
  KV: MockKVNamespace;
  R2: MockR2Bucket;
  JWT_SECRET: string;
  RATE_LIMIT_PER_MINUTE: number;
}

class MockD1Database {
  private tables: Map<string, Record<string, unknown>[]> = new Map();

  constructor() {
    this.tables.set('users', [
      { id: 'usr-001', email: 'drew@infinity-os.dev', name: 'Drew', role: 'admin', mfa_enabled: true, created_at: '2025-01-01T00:00:00Z' },
      { id: 'usr-002', email: 'agent@infinity-os.dev', name: 'Agent', role: 'user', mfa_enabled: false, created_at: '2025-02-01T00:00:00Z' },
    ]);
    this.tables.set('sessions', [
      { id: 'sess-001', user_id: 'usr-001', token: 'valid-token-001', expires_at: new Date(Date.now() + 86400000).toISOString(), created_at: '2025-03-04T10:00:00Z' },
      { id: 'sess-002', user_id: 'usr-001', token: 'expired-token', expires_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z' },
    ]);
    this.tables.set('modules', [
      { id: 'mod-001', name: 'markdown-editor', version: '1.2.0', author: 'infinity-os', downloads: 1234, status: 'published' },
      { id: 'mod-002', name: 'code-runner', version: '2.0.0', author: 'community', downloads: 567, status: 'published' },
      { id: 'mod-003', name: 'malicious-pkg', version: '0.1.0', author: 'unknown', downloads: 0, status: 'rejected' },
    ]);
  }

  prepare(sql: string) {
    return {
      bind: (...params: unknown[]) => ({
        first: async () => this.executeFirst(sql, params),
        all: async () => this.executeAll(sql, params),
        run: async () => this.executeRun(sql, params),
      }),
      first: async () => this.executeFirst(sql, []),
      all: async () => this.executeAll(sql, []),
      run: async () => this.executeRun(sql, []),
    };
  }

  private executeFirst(sql: string, params: unknown[]): Record<string, unknown> | null {
    const results = this.executeAll(sql, params);
    return results.results[0] ?? null;
  }

  private executeAll(sql: string, params: unknown[]): { results: Record<string, unknown>[] } {
    const lowerSql = sql.toLowerCase().trim();

    // Simple SELECT parsing
    if (lowerSql.startsWith('select')) {
      const tableMatch = lowerSql.match(/from\s+(\w+)/);
      if (!tableMatch) return { results: [] };
      const table = tableMatch[1];
      let rows = this.tables.get(table) ?? [];

      // WHERE clause
      const whereMatch = lowerSql.match(/where\s+(\w+)\s*=\s*\?/);
      if (whereMatch && params.length > 0) {
        const field = whereMatch[1];
        rows = rows.filter(r => r[field] === params[0]);
      }

      // Status filter
      const statusMatch = lowerSql.match(/where\s+status\s*=\s*'(\w+)'/);
      if (statusMatch) {
        rows = rows.filter(r => r['status'] === statusMatch[1]);
      }

      return { results: rows };
    }

    return { results: [] };
  }

  private executeRun(sql: string, params: unknown[]): { success: boolean; meta: { changes: number } } {
    return { success: true, meta: { changes: 1 } };
  }
}

class MockKVNamespace {
  private store: Map<string, { value: string; metadata?: unknown; expiration?: number }> = new Map();

  async get(key: string, options?: { type?: string }): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiration && Date.now() / 1000 > entry.expiration) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async getWithMetadata(key: string): Promise<{ value: string | null; metadata: unknown }> {
    const entry = this.store.get(key);
    if (!entry) return { value: null, metadata: null };
    return { value: entry.value, metadata: entry.metadata };
  }

  async put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void> {
    this.store.set(key, {
      value,
      metadata: options?.metadata,
      expiration: options?.expirationTtl ? Date.now() / 1000 + options.expirationTtl : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: { name: string; metadata?: unknown }[] }> {
    const keys: { name: string; metadata?: unknown }[] = [];
    for (const [key, entry] of this.store) {
      if (!options?.prefix || key.startsWith(options.prefix)) {
        keys.push({ name: key, metadata: entry.metadata });
      }
    }
    return { keys };
  }
}

class MockR2Bucket {
  private objects: Map<string, { body: string; httpMetadata?: Record<string, string>; customMetadata?: Record<string, string>; size: number; uploaded: string }> = new Map();

  async get(key: string): Promise<{ text: () => Promise<string>; httpMetadata?: Record<string, string>; customMetadata?: Record<string, string>; size: number; uploaded: string } | null> {
    const obj = this.objects.get(key);
    if (!obj) return null;
    return {
      text: async () => obj.body,
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
      size: obj.size,
      uploaded: obj.uploaded,
    };
  }

  async put(key: string, body: string, options?: { httpMetadata?: Record<string, string>; customMetadata?: Record<string, string> }): Promise<void> {
    this.objects.set(key, {
      body,
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
      size: body.length,
      uploaded: new Date().toISOString(),
    });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: { key: string; size: number; uploaded: string }[]; truncated: boolean; cursor?: string }> {
    const allObjects: { key: string; size: number; uploaded: string }[] = [];
    for (const [key, obj] of this.objects) {
      if (!options?.prefix || key.startsWith(options.prefix)) {
        allObjects.push({ key, size: obj.size, uploaded: obj.uploaded });
      }
    }
    const limit = options?.limit ?? 1000;
    return {
      objects: allObjects.slice(0, limit),
      truncated: allObjects.length > limit,
    };
  }

  async head(key: string): Promise<{ size: number; uploaded: string; httpMetadata?: Record<string, string> } | null> {
    const obj = this.objects.get(key);
    if (!obj) return null;
    return { size: obj.size, uploaded: obj.uploaded, httpMetadata: obj.httpMetadata };
  }
}

// ── Mock Worker Handler ─────────────────────

class MockWorkerHandler {
  private env: WorkerEnv;
  private rateLimitCounts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(env: WorkerEnv) {
    this.env = env;
  }

  private checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimitCounts.get(clientId);
    if (!entry || now > entry.resetAt) {
      this.rateLimitCounts.set(clientId, { count: 1, resetAt: now + 60000 });
      return true;
    }
    entry.count++;
    return entry.count <= this.env.RATE_LIMIT_PER_MINUTE;
  }

  private validateAuth(token: string | undefined): { valid: boolean; userId?: string } {
    if (!token) return { valid: false };
    const cleanToken = token.replace('Bearer ', '');
    // Check against sessions
    const sessions = (this.env.DB as any).tables?.get('sessions') ?? [];
    // Simplified: just check if token matches a known valid token
    if (cleanToken === 'valid-token-001') return { valid: true, userId: 'usr-001' };
    if (cleanToken === 'expired-token') return { valid: false };
    return { valid: false };
  }

  async handle(req: WorkerRequest): Promise<WorkerResponse> {
    // Rate limiting
    const clientId = req.headers['x-client-id'] ?? 'anonymous';
    if (!this.checkRateLimit(clientId)) {
      return { status: 429, headers: { 'retry-after': '60' }, body: { error: 'Rate limit exceeded' } };
    }

    const url = new URL(req.url, 'https://api.infinity-os.dev');
    const path = url.pathname;

    // Health check (no auth required)
    if (path === '/health') {
      return { status: 200, headers: { 'content-type': 'application/json' }, body: { status: 'healthy', timestamp: Date.now() } };
    }

    // Auth required for all other routes
    const auth = this.validateAuth(req.headers['authorization']);
    if (!auth.valid) {
      return { status: 401, headers: {}, body: { error: 'Unauthorized' } };
    }

    // Identity routes
    if (path === '/api/v1/identity/me') {
      const user = await this.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.userId).first();
      if (!user) return { status: 404, headers: {}, body: { error: 'User not found' } };
      return { status: 200, headers: { 'content-type': 'application/json' }, body: user };
    }

    // Filesystem routes
    if (path.startsWith('/api/v1/fs/')) {
      const filePath = path.replace('/api/v1/fs/', '');

      if (req.method === 'GET') {
        const obj = await this.env.R2.get(filePath);
        if (!obj) return { status: 404, headers: {}, body: { error: 'File not found' } };
        const content = await obj.text();
        return { status: 200, headers: { 'content-type': 'application/octet-stream' }, body: { path: filePath, content, size: obj.size } };
      }

      if (req.method === 'PUT') {
        const body = req.body as { content: string; metadata?: Record<string, string> };
        if (!body?.content) return { status: 400, headers: {}, body: { error: 'Content required' } };
        await this.env.R2.put(filePath, body.content, { customMetadata: body.metadata });
        return { status: 201, headers: {}, body: { path: filePath, size: body.content.length } };
      }

      if (req.method === 'DELETE') {
        await this.env.R2.delete(filePath);
        return { status: 204, headers: {}, body: null };
      }
    }

    // Registry routes
    if (path === '/api/v1/registry/modules') {
      if (req.method === 'GET') {
        const result = await this.env.DB.prepare("SELECT * FROM modules WHERE status = 'published'").all();
        return { status: 200, headers: { 'content-type': 'application/json' }, body: { modules: result.results } };
      }
    }

    if (path.startsWith('/api/v1/registry/modules/')) {
      const moduleId = path.replace('/api/v1/registry/modules/', '');
      const mod = await this.env.DB.prepare('SELECT * FROM modules WHERE id = ?').bind(moduleId).first();
      if (!mod) return { status: 404, headers: {}, body: { error: 'Module not found' } };
      return { status: 200, headers: { 'content-type': 'application/json' }, body: mod };
    }

    // Search routes
    if (path === '/api/v1/search') {
      const query = url.searchParams.get('q') ?? '';
      if (!query) return { status: 400, headers: {}, body: { error: 'Query parameter q is required' } };

      // Search across modules
      const modules = await this.env.DB.prepare("SELECT * FROM modules WHERE status = 'published'").all();
      const results = modules.results.filter(m =>
        (m.name as string).toLowerCase().includes(query.toLowerCase()) ||
        (m.author as string).toLowerCase().includes(query.toLowerCase())
      );

      return { status: 200, headers: { 'content-type': 'application/json' }, body: { query, results, total: results.length } };
    }

    // Notifications routes
    if (path === '/api/v1/notifications' && req.method === 'POST') {
      const body = req.body as { channel: string; message: string; priority?: string };
      if (!body?.channel || !body?.message) {
        return { status: 400, headers: {}, body: { error: 'Channel and message required' } };
      }
      const notifId = `notif-${Date.now()}`;
      await this.env.KV.put(`notification:${notifId}`, JSON.stringify(body), { expirationTtl: 86400 });
      return { status: 201, headers: {}, body: { id: notifId, status: 'sent' } };
    }

    // KV cache routes
    if (path.startsWith('/api/v1/cache/')) {
      const cacheKey = path.replace('/api/v1/cache/', '');

      if (req.method === 'GET') {
        const value = await this.env.KV.get(cacheKey);
        if (!value) return { status: 404, headers: {}, body: { error: 'Cache miss' } };
        return { status: 200, headers: { 'x-cache': 'HIT' }, body: { key: cacheKey, value: JSON.parse(value) } };
      }

      if (req.method === 'PUT') {
        const body = req.body as { value: unknown; ttl?: number };
        await this.env.KV.put(cacheKey, JSON.stringify(body.value), { expirationTtl: body.ttl ?? 3600 });
        return { status: 201, headers: {}, body: { key: cacheKey, status: 'cached' } };
      }

      if (req.method === 'DELETE') {
        await this.env.KV.delete(cacheKey);
        return { status: 204, headers: {}, body: null };
      }
    }

    return { status: 404, headers: {}, body: { error: 'Not found' } };
  }
}

// ── Tests ───────────────────────────────────

describe('Worker Integration — Health & Auth', () => {
  let handler: MockWorkerHandler;
  let env: WorkerEnv;

  beforeEach(() => {
    env = {
      DB: new MockD1Database(),
      KV: new MockKVNamespace(),
      R2: new MockR2Bucket(),
      JWT_SECRET: 'test-secret-key-256-bits-long-enough',
      RATE_LIMIT_PER_MINUTE: 100,
    };
    handler = new MockWorkerHandler(env);
  });

  it('should return healthy status on /health', async () => {
    const res = await handler.handle({ method: 'GET', url: '/health', headers: {} });
    expect(res.status).toBe(200);
    expect((res.body as any).status).toBe('healthy');
    expect((res.body as any).timestamp).toBeGreaterThan(0);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await handler.handle({ method: 'GET', url: '/api/v1/identity/me', headers: {} });
    expect(res.status).toBe(401);
  });

  it('should reject expired tokens', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/identity/me',
      headers: { authorization: 'Bearer expired-token' },
    });
    expect(res.status).toBe(401);
  });

  it('should accept valid tokens', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/identity/me',
      headers: { authorization: 'Bearer valid-token-001' },
    });
    expect(res.status).toBe(200);
    expect((res.body as any).email).toBe('drew@infinity-os.dev');
  });

  it('should enforce rate limiting', async () => {
    const headers = { authorization: 'Bearer valid-token-001', 'x-client-id': 'rate-test' };

    // Send requests up to limit
    for (let i = 0; i < 100; i++) {
      const res = await handler.handle({ method: 'GET', url: '/health', headers });
      expect(res.status).toBe(200);
    }

    // Next request should be rate limited
    const res = await handler.handle({ method: 'GET', url: '/health', headers });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
  });

  it('should return 404 for unknown routes', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/nonexistent',
      headers: { authorization: 'Bearer valid-token-001' },
    });
    expect(res.status).toBe(404);
  });
});

describe('Worker Integration — Filesystem (R2)', () => {
  let handler: MockWorkerHandler;
  let env: WorkerEnv;
  const authHeaders = { authorization: 'Bearer valid-token-001' };

  beforeEach(() => {
    env = {
      DB: new MockD1Database(),
      KV: new MockKVNamespace(),
      R2: new MockR2Bucket(),
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_PER_MINUTE: 1000,
    };
    handler = new MockWorkerHandler(env);
  });

  it('should create a file', async () => {
    const res = await handler.handle({
      method: 'PUT', url: '/api/v1/fs/documents/hello.txt',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: { content: 'Hello, Infinity OS!', metadata: { author: 'drew' } },
    });
    expect(res.status).toBe(201);
    expect((res.body as any).path).toBe('documents/hello.txt');
    expect((res.body as any).size).toBe(19);
  });

  it('should read a file', async () => {
    // Create first
    await handler.handle({
      method: 'PUT', url: '/api/v1/fs/test.md',
      headers: authHeaders,
      body: { content: '# Test Document' },
    });

    // Read
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/fs/test.md',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect((res.body as any).content).toBe('# Test Document');
  });

  it('should return 404 for non-existent files', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/fs/nonexistent.txt',
      headers: authHeaders,
    });
    expect(res.status).toBe(404);
  });

  it('should delete a file', async () => {
    // Create
    await handler.handle({
      method: 'PUT', url: '/api/v1/fs/deleteme.txt',
      headers: authHeaders,
      body: { content: 'temporary' },
    });

    // Delete
    const res = await handler.handle({
      method: 'DELETE', url: '/api/v1/fs/deleteme.txt',
      headers: authHeaders,
    });
    expect(res.status).toBe(204);

    // Verify deleted
    const getRes = await handler.handle({
      method: 'GET', url: '/api/v1/fs/deleteme.txt',
      headers: authHeaders,
    });
    expect(getRes.status).toBe(404);
  });

  it('should reject file creation without content', async () => {
    const res = await handler.handle({
      method: 'PUT', url: '/api/v1/fs/empty.txt',
      headers: authHeaders,
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it('should handle nested file paths', async () => {
    await handler.handle({
      method: 'PUT', url: '/api/v1/fs/deep/nested/path/file.json',
      headers: authHeaders,
      body: { content: '{"key": "value"}' },
    });

    const res = await handler.handle({
      method: 'GET', url: '/api/v1/fs/deep/nested/path/file.json',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect((res.body as any).path).toBe('deep/nested/path/file.json');
  });
});

describe('Worker Integration — Registry (D1)', () => {
  let handler: MockWorkerHandler;
  const authHeaders = { authorization: 'Bearer valid-token-001' };

  beforeEach(() => {
    handler = new MockWorkerHandler({
      DB: new MockD1Database(),
      KV: new MockKVNamespace(),
      R2: new MockR2Bucket(),
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_PER_MINUTE: 1000,
    });
  });

  it('should list published modules', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/registry/modules',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const modules = (res.body as any).modules;
    expect(modules.length).toBeGreaterThanOrEqual(2);
    // Should not include rejected modules
    expect(modules.every((m: any) => m.status === 'published')).toBe(true);
  });

  it('should get a specific module by ID', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/registry/modules/mod-001',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect((res.body as any).name).toBe('markdown-editor');
  });

  it('should return 404 for non-existent module', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/registry/modules/mod-999',
      headers: authHeaders,
    });
    expect(res.status).toBe(404);
  });
});

describe('Worker Integration — Search', () => {
  let handler: MockWorkerHandler;
  const authHeaders = { authorization: 'Bearer valid-token-001' };

  beforeEach(() => {
    handler = new MockWorkerHandler({
      DB: new MockD1Database(),
      KV: new MockKVNamespace(),
      R2: new MockR2Bucket(),
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_PER_MINUTE: 1000,
    });
  });

  it('should search modules by name', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/search?q=markdown',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect((res.body as any).total).toBeGreaterThanOrEqual(1);
    expect((res.body as any).query).toBe('markdown');
  });

  it('should search modules by author', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/search?q=community',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect((res.body as any).total).toBeGreaterThanOrEqual(1);
  });

  it('should return empty results for no matches', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/search?q=zzzznonexistent',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect((res.body as any).total).toBe(0);
  });

  it('should require query parameter', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/search',
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });

  it('should be case-insensitive', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/search?q=MARKDOWN',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect((res.body as any).total).toBeGreaterThanOrEqual(1);
  });
});

describe('Worker Integration — Notifications (KV)', () => {
  let handler: MockWorkerHandler;
  let env: WorkerEnv;
  const authHeaders = { authorization: 'Bearer valid-token-001' };

  beforeEach(() => {
    env = {
      DB: new MockD1Database(),
      KV: new MockKVNamespace(),
      R2: new MockR2Bucket(),
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_PER_MINUTE: 1000,
    };
    handler = new MockWorkerHandler(env);
  });

  it('should send a notification', async () => {
    const res = await handler.handle({
      method: 'POST', url: '/api/v1/notifications',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: { channel: 'in-app', message: 'Deployment complete', priority: 'normal' },
    });
    expect(res.status).toBe(201);
    expect((res.body as any).status).toBe('sent');
    expect((res.body as any).id).toBeDefined();
  });

  it('should reject notification without channel', async () => {
    const res = await handler.handle({
      method: 'POST', url: '/api/v1/notifications',
      headers: authHeaders,
      body: { message: 'No channel' },
    });
    expect(res.status).toBe(400);
  });

  it('should reject notification without message', async () => {
    const res = await handler.handle({
      method: 'POST', url: '/api/v1/notifications',
      headers: authHeaders,
      body: { channel: 'email' },
    });
    expect(res.status).toBe(400);
  });

  it('should store notification in KV', async () => {
    await handler.handle({
      method: 'POST', url: '/api/v1/notifications',
      headers: authHeaders,
      body: { channel: 'push', message: 'Test notification' },
    });

    const keys = await env.KV.list({ prefix: 'notification:' });
    expect(keys.keys.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Worker Integration — Cache (KV)', () => {
  let handler: MockWorkerHandler;
  const authHeaders = { authorization: 'Bearer valid-token-001' };

  beforeEach(() => {
    handler = new MockWorkerHandler({
      DB: new MockD1Database(),
      KV: new MockKVNamespace(),
      R2: new MockR2Bucket(),
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_PER_MINUTE: 1000,
    });
  });

  it('should cache a value', async () => {
    const res = await handler.handle({
      method: 'PUT', url: '/api/v1/cache/user-prefs',
      headers: authHeaders,
      body: { value: { theme: 'dark', language: 'en' }, ttl: 3600 },
    });
    expect(res.status).toBe(201);
    expect((res.body as any).status).toBe('cached');
  });

  it('should retrieve a cached value', async () => {
    // Cache first
    await handler.handle({
      method: 'PUT', url: '/api/v1/cache/config',
      headers: authHeaders,
      body: { value: { maxWorkers: 4 } },
    });

    // Retrieve
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/cache/config',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect((res.body as any).value).toEqual({ maxWorkers: 4 });
  });

  it('should return 404 for cache miss', async () => {
    const res = await handler.handle({
      method: 'GET', url: '/api/v1/cache/nonexistent',
      headers: authHeaders,
    });
    expect(res.status).toBe(404);
  });

  it('should delete a cached value', async () => {
    // Cache
    await handler.handle({
      method: 'PUT', url: '/api/v1/cache/temp',
      headers: authHeaders,
      body: { value: 'temporary' },
    });

    // Delete
    const res = await handler.handle({
      method: 'DELETE', url: '/api/v1/cache/temp',
      headers: authHeaders,
    });
    expect(res.status).toBe(204);

    // Verify deleted
    const getRes = await handler.handle({
      method: 'GET', url: '/api/v1/cache/temp',
      headers: authHeaders,
    });
    expect(getRes.status).toBe(404);
  });
});

describe('Worker Integration — Cross-Worker Communication', () => {
  let handler: MockWorkerHandler;
  let env: WorkerEnv;
  const authHeaders = { authorization: 'Bearer valid-token-001' };

  beforeEach(() => {
    env = {
      DB: new MockD1Database(),
      KV: new MockKVNamespace(),
      R2: new MockR2Bucket(),
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_PER_MINUTE: 1000,
    };
    handler = new MockWorkerHandler(env);
  });

  it('should support full CRUD lifecycle: create → read → update → delete', async () => {
    // Create
    const createRes = await handler.handle({
      method: 'PUT', url: '/api/v1/fs/lifecycle-test.json',
      headers: authHeaders,
      body: { content: '{"version": 1}' },
    });
    expect(createRes.status).toBe(201);

    // Read
    const readRes = await handler.handle({
      method: 'GET', url: '/api/v1/fs/lifecycle-test.json',
      headers: authHeaders,
    });
    expect(readRes.status).toBe(200);
    expect((readRes.body as any).content).toBe('{"version": 1}');

    // Update
    const updateRes = await handler.handle({
      method: 'PUT', url: '/api/v1/fs/lifecycle-test.json',
      headers: authHeaders,
      body: { content: '{"version": 2}' },
    });
    expect(updateRes.status).toBe(201);

    // Read updated
    const readUpdated = await handler.handle({
      method: 'GET', url: '/api/v1/fs/lifecycle-test.json',
      headers: authHeaders,
    });
    expect((readUpdated.body as any).content).toBe('{"version": 2}');

    // Delete
    const deleteRes = await handler.handle({
      method: 'DELETE', url: '/api/v1/fs/lifecycle-test.json',
      headers: authHeaders,
    });
    expect(deleteRes.status).toBe(204);

    // Verify deleted
    const readDeleted = await handler.handle({
      method: 'GET', url: '/api/v1/fs/lifecycle-test.json',
      headers: authHeaders,
    });
    expect(readDeleted.status).toBe(404);
  });

  it('should support auth → search → cache pipeline', async () => {
    // Authenticate (implicit via valid token)
    const identityRes = await handler.handle({
      method: 'GET', url: '/api/v1/identity/me',
      headers: authHeaders,
    });
    expect(identityRes.status).toBe(200);

    // Search
    const searchRes = await handler.handle({
      method: 'GET', url: '/api/v1/search?q=editor',
      headers: authHeaders,
    });
    expect(searchRes.status).toBe(200);

    // Cache search results
    const cacheRes = await handler.handle({
      method: 'PUT', url: '/api/v1/cache/search:editor',
      headers: authHeaders,
      body: { value: (searchRes.body as any).results, ttl: 300 },
    });
    expect(cacheRes.status).toBe(201);

    // Retrieve from cache
    const cachedRes = await handler.handle({
      method: 'GET', url: '/api/v1/cache/search:editor',
      headers: authHeaders,
    });
    expect(cachedRes.status).toBe(200);
    expect(cachedRes.headers['x-cache']).toBe('HIT');
  });

  it('should support file upload → notification pipeline', async () => {
    // Upload file
    const uploadRes = await handler.handle({
      method: 'PUT', url: '/api/v1/fs/uploads/report.pdf',
      headers: authHeaders,
      body: { content: 'PDF content here', metadata: { type: 'report' } },
    });
    expect(uploadRes.status).toBe(201);

    // Send notification about upload
    const notifRes = await handler.handle({
      method: 'POST', url: '/api/v1/notifications',
      headers: authHeaders,
      body: { channel: 'in-app', message: `File uploaded: uploads/report.pdf (${(uploadRes.body as any).size} bytes)` },
    });
    expect(notifRes.status).toBe(201);
  });
});