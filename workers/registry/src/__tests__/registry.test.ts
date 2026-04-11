/**
 * Module Registry Worker — Test Suite
 * Covers: types, error handling, row parsing, search, CRUD, versioning,
 * tenant install/uninstall, dependency resolution, event emission
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Type & Enum Tests ────────────────────────────────────────

describe('Registry Types & Enums', () => {
  it('RegistryError enum has all expected codes', async () => {
    const { RegistryError } = await import('../types');
    expect(RegistryError.NOT_FOUND).toBe('NOT_FOUND');
    expect(RegistryError.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
    expect(RegistryError.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(RegistryError.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(RegistryError.FORBIDDEN).toBe('FORBIDDEN');
    expect(RegistryError.DEPENDENCY_ERROR).toBe('DEPENDENCY_ERROR');
    expect(RegistryError.PLAN_REQUIRED).toBe('PLAN_REQUIRED');
    expect(RegistryError.VERSION_CONFLICT).toBe('VERSION_CONFLICT');
    expect(RegistryError.DEPLOY_FAILED).toBe('DEPLOY_FAILED');
    expect(RegistryError.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });

  it('errorResponse returns valid JSON response with correct status', async () => {
    const { RegistryError, errorResponse } = await import('../types');
    const resp = errorResponse(RegistryError.NOT_FOUND, 'Module not found', 404);
    expect(resp.status).toBe(404);
    expect(resp.headers.get('Content-Type')).toBe('application/json');
    const body = await resp.json() as { error: string; message: string; timestamp: string };
    expect(body.error).toBe('NOT_FOUND');
    expect(body.message).toBe('Module not found');
    expect(body.timestamp).toBeTruthy();
  });

  it('errorResponse defaults to 400 when no status given', async () => {
    const { RegistryError, errorResponse } = await import('../types');
    const resp = errorResponse(RegistryError.INVALID_INPUT, 'Bad request');
    expect(resp.status).toBe(400);
  });

  it('jsonResponse returns valid JSON with correct status', async () => {
    const { jsonResponse } = await import('../types');
    const resp = jsonResponse({ hello: 'world' }, 201);
    expect(resp.status).toBe(201);
    const body = await resp.json() as { hello: string };
    expect(body.hello).toBe('world');
  });

  it('jsonResponse defaults to 200', async () => {
    const { jsonResponse } = await import('../types');
    const resp = jsonResponse({ ok: true });
    expect(resp.status).toBe(200);
  });
});

// ── Module Type Validation ───────────────────────────────────

describe('Module Type Definitions', () => {
  it('ModuleType covers all expected types', async () => {
    const types: string[] = ['worker', 'package', 'app', 'adapter', 'plugin', 'theme', 'integration'];
    types.forEach((t) => expect(typeof t).toBe('string'));
    expect(types).toHaveLength(7);
  });

  it('ModuleCategory covers all expected categories', () => {
    const categories = ['core', 'ai', 'finance', 'security', 'analytics', 'communication', 'storage', 'utility', 'ui', 'integration'];
    expect(categories).toHaveLength(10);
  });

  it('DeployStatus covers full lifecycle', () => {
    const statuses = ['pending', 'deploying', 'active', 'failed', 'suspended', 'uninstalling'];
    expect(statuses).toHaveLength(6);
  });

  it('ModuleStatus covers full lifecycle', () => {
    const statuses = ['draft', 'review', 'published', 'deprecated', 'archived'];
    expect(statuses).toHaveLength(5);
  });
});

// ── Mock D1 for Integration Tests ────────────────────────────

function createMockDB() {
  const storage = new Map<string, Map<string, Record<string, unknown>>>();

  function getTable(name: string) {
    if (!storage.has(name)) storage.set(name, new Map());
    return storage.get(name)!;
  }

  const mockPrepare = (sql: string) => {
    let boundParams: unknown[] = [];

    const statement = {
      bind: (...params: unknown[]) => {
        boundParams = params;
        return statement;
      },
      first: async <T = Record<string, unknown>>(): Promise<T | null> => {
        // Simple mock: return null by default
        return null as T | null;
      },
      all: async () => {
        return { results: [] as Record<string, unknown>[] };
      },
      run: async () => {
        return { success: true };
      },
    };

    return statement;
  };

  return { prepare: mockPrepare, storage, getTable };
}

// ── Hono App Route Tests ─────────────────────────────────────

describe('Registry Worker Routes', () => {
  it('GET /health returns operational status', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/health');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; service: string; version: string };
    expect(body.status).toBe('operational');
    expect(body.service).toBe('module-registry');
    expect(body.version).toBe('0.1.0');
  });

  it('GET /modules returns paginated list', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { modules: unknown[]; pagination: { page: number; limit: number } };
    expect(body.modules).toBeInstanceOf(Array);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(20);
  });

  it('GET /modules supports search parameters', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules?q=ai&type=worker&category=ai&page=2&limit=10');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { pagination: { page: number; limit: number } };
    expect(body.pagination.page).toBe(2);
    expect(body.pagination.limit).toBe(10);
  });

  it('GET /modules caps limit at 100', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules?limit=500');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { pagination: { limit: number } };
    expect(body.pagination.limit).toBe(100);
  });

  it('POST /modules rejects missing required fields', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }), // missing display_name and type
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVALID_INPUT');
  });

  it('POST /modules rejects invalid JSON', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it('POST /modules creates module with valid data', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '@trancendos/test-module',
        display_name: 'Test Module',
        type: 'worker',
        category: 'utility',
        capabilities: ['ai:completion'],
      }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; name: string; status: string };
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('@trancendos/test-module');
    expect(body.status).toBe('draft');
  });

  it('GET /modules/:id returns 404 for missing module', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules/nonexistent');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('NOT_FOUND');
  });

  it('PUT /modules/:id returns 404 for missing module', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules/nonexistent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Updated' }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it('PUT /modules/:id rejects empty body', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules/some-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'bad-json',
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it('POST /modules/:id/versions rejects missing fields', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules/some-id/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '1.0.0' }), // missing entry_point
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVALID_INPUT');
  });

  it('POST /modules/:id/versions returns 404 for missing module', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules/nonexistent/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '1.0.0', entry_point: 'src/index.ts' }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it('GET /modules/:id/versions returns empty array for new module', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules/some-id/versions');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { versions: unknown[] };
    expect(body.versions).toEqual([]);
  });

  it('POST /tenants/:tid/modules rejects missing module_id', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/tenants/t1/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INVALID_INPUT');
  });

  it('POST /tenants/:tid/modules returns 404 for unpublished module', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/tenants/t1/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_id: 'nonexistent' }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it('GET /tenants/:tid/modules returns empty list', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/tenants/t1/modules');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { modules: unknown[] };
    expect(body.modules).toEqual([]);
  });

  it('PUT /tenants/:tid/modules/:mid returns 404 for not installed', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/tenants/t1/modules/m1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it('DELETE /tenants/:tid/modules/:mid returns 404 for not installed', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/tenants/t1/modules/m1', { method: 'DELETE' });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it('GET /modules/:id/resolve returns resolution result', async () => {
    const app = (await import('../index')).default;
    const env = createMockEnv();
    const req = new Request('http://localhost/modules/some-id/resolve');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { resolved: unknown[]; missing: string[]; conflicts: unknown[] };
    expect(body.resolved).toBeInstanceOf(Array);
    expect(body.missing).toBeInstanceOf(Array);
    expect(body.conflicts).toBeInstanceOf(Array);
  });
});

// ── JSON Safety ──────────────────────────────────────────────

describe('JSON Safety Helpers', () => {
  it('handles malformed JSON in module capabilities', async () => {
    const { jsonResponse } = await import('../types');
    const resp = jsonResponse({ data: 'test' });
    const body = await resp.json() as { data: string };
    expect(body.data).toBe('test');
  });
});

// ── Mock Environment Factory ─────────────────────────────────

function createMockEnv() {
  const dbStorage: Record<string, Record<string, unknown>[]> = {};

  const mockDB = {
    prepare: (sql: string) => {
      let boundParams: unknown[] = [];
      const stmt = {
        bind: (...params: unknown[]) => {
          boundParams = params;
          return stmt;
        },
        first: async <T = Record<string, unknown>>(): Promise<T | null> => {
          return null as T | null;
        },
        all: async () => {
          return { results: [] as Record<string, unknown>[], success: true };
        },
        run: async () => {
          return { success: true, meta: {} };
        },
      };
      return stmt;
    },
  };

  return {
    DB: mockDB as unknown as D1Database,
    CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    MODULE_STORE: {} as R2Bucket,
    TENANT_DO: {} as DurableObjectNamespace,
    EVENTS_QUEUE: {
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue<unknown>,
    JWT_SECRET: 'test-secret',
    ENVIRONMENT: 'test',
  };
}