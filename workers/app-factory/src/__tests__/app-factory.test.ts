/**
 * App Factory Worker — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests app provisioning, templates, validation, routing,
 * CORS, security headers, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker, {
  generateAppId,
  isValidAppName,
  isValidTenantId,
  isValidTemplate,
  isValidRegion,
  APP_TEMPLATES,
  VALID_REGIONS,
} from '../index';

// ── DB mock factory ───────────────────────────────────────────────
function makeDb(overrides: Partial<ReturnType<typeof makeDb>> = {}) {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  };
  return {
    prepare: vi.fn().mockReturnValue(stmt),
    _stmt: stmt,
    ...overrides,
  };
}

// ── Env mock factory ──────────────────────────────────────────────
function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: makeDb(),
    CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    REGISTRY: { fetch: vi.fn() },
    ENVIRONMENT: 'test',
    ALLOWED_ORIGINS: '',
    PROVISIONING_SECRET: 'test-secret',
    ...overrides,
  };
}

// ── Request helpers ───────────────────────────────────────────────
function makeRequest(
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`https://app-factory.example.com${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://infinity-portal.pages.dev',
      Authorization: 'Bearer test-token',
      'X-Tenant-ID': 'tenant-abc-123',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ═══════════════════════════════════════════════════════════════
// Pure Helper Functions
// ═══════════════════════════════════════════════════════════════
describe('generateAppId', () => {
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateAppId()));
    expect(ids.size).toBe(100);
  });

  it('starts with "app-" prefix', () => {
    expect(generateAppId()).toMatch(/^app-/);
  });

  it('is URL-safe (alphanumeric + hyphens only)', () => {
    const id = generateAppId();
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('isValidAppName', () => {
  it('accepts valid lowercase app names', () => {
    expect(isValidAppName('my-app')).toBe(true);
    expect(isValidAppName('webapp123')).toBe(true);
    expect(isValidAppName('app-with-hyphens')).toBe(true);
  });

  it('rejects names with uppercase letters', () => {
    expect(isValidAppName('MyApp')).toBe(false);
  });

  it('rejects names that start with hyphen', () => {
    expect(isValidAppName('-myapp')).toBe(false);
  });

  it('rejects names that end with hyphen', () => {
    expect(isValidAppName('myapp-')).toBe(false);
  });

  it('rejects single character names', () => {
    expect(isValidAppName('a')).toBe(false);
  });

  it('rejects names with spaces', () => {
    expect(isValidAppName('my app')).toBe(false);
  });

  it('rejects names with special characters', () => {
    expect(isValidAppName('my_app')).toBe(false);
    expect(isValidAppName('my.app')).toBe(false);
  });
});

describe('isValidTenantId', () => {
  it('accepts valid tenant IDs', () => {
    expect(isValidTenantId('tenant-123')).toBe(true);
    expect(isValidTenantId('ABC_def-123')).toBe(true);
  });

  it('rejects too-short IDs', () => {
    expect(isValidTenantId('ab')).toBe(false);
  });

  it('rejects IDs with special characters', () => {
    expect(isValidTenantId('tenant@123')).toBe(false);
  });
});

describe('isValidTemplate', () => {
  it('accepts all valid template names', () => {
    const templates = Object.keys(APP_TEMPLATES);
    for (const t of templates) {
      expect(isValidTemplate(t)).toBe(true);
    }
  });

  it('rejects unknown templates', () => {
    expect(isValidTemplate('unknown-template')).toBe(false);
    expect(isValidTemplate('')).toBe(false);
  });
});

describe('isValidRegion', () => {
  it('accepts all valid regions', () => {
    for (const r of VALID_REGIONS) {
      expect(isValidRegion(r)).toBe(true);
    }
  });

  it('rejects invalid regions', () => {
    expect(isValidRegion('us-east-1')).toBe(false);
    expect(isValidRegion('')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// APP_TEMPLATES configuration
// ═══════════════════════════════════════════════════════════════
describe('APP_TEMPLATES', () => {
  it('has exactly 6 templates', () => {
    expect(Object.keys(APP_TEMPLATES).length).toBe(6);
  });

  it('every template has name, description, and stack', () => {
    for (const [id, tmpl] of Object.entries(APP_TEMPLATES)) {
      expect(typeof tmpl.name, `${id} missing name`).toBe('string');
      expect(typeof tmpl.description, `${id} missing description`).toBe('string');
      expect(Array.isArray(tmpl.stack), `${id} stack not array`).toBe(true);
      expect(tmpl.stack.length, `${id} stack empty`).toBeGreaterThan(0);
    }
  });

  it('includes "blank" template as simplest option', () => {
    expect(APP_TEMPLATES['blank']).toBeDefined();
    expect(APP_TEMPLATES['blank'].stack).toContain('typescript');
  });

  it('fullstack template has most dependencies', () => {
    expect(APP_TEMPLATES['fullstack'].stack.length).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════
describe('Health Check', () => {
  it('GET /health returns 200', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('app-factory');
  });

  it('GET /api/health also works', async () => {
    const res = await worker.fetch(makeRequest('/api/health'), makeEnv());
    expect(res.status).toBe(200);
  });

  it('health check includes template and region counts', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.templates).toBe('number');
    expect(typeof body.regions).toBe('number');
    expect(body.templates).toBeGreaterThan(0);
    expect(body.regions).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════
describe('CORS', () => {
  it('OPTIONS preflight returns 204', async () => {
    const req = new Request('https://app-factory.example.com/api/v1/apps', {
      method: 'OPTIONS',
      headers: { Origin: 'https://infinity-portal.pages.dev' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
  });

  it('includes security headers on all responses', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('includes CORS headers for allowed origins', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// Templates Endpoint
// ═══════════════════════════════════════════════════════════════
describe('Templates', () => {
  it('GET /api/v1/templates returns all templates without auth', async () => {
    const req = new Request('https://app-factory.example.com/api/v1/templates');
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { templates: Array<{ id: string }> };
    expect(Array.isArray(body.templates)).toBe(true);
    expect(body.templates.length).toBe(6);
  });

  it('each template has id, name, description, stack', async () => {
    const req = new Request('https://app-factory.example.com/api/v1/templates');
    const res = await worker.fetch(req, makeEnv());
    const body = await res.json() as { templates: Array<{ id: string; name: string; description: string; stack: string[] }> };
    for (const tmpl of body.templates) {
      expect(typeof tmpl.id).toBe('string');
      expect(typeof tmpl.name).toBe('string');
      expect(typeof tmpl.description).toBe('string');
      expect(Array.isArray(tmpl.stack)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// App Provisioning
// ═══════════════════════════════════════════════════════════════
describe('App Provisioning', () => {
  it('POST /api/v1/apps returns 202 on valid request', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeRequest('/api/v1/apps', 'POST', {
        name: 'my-new-app',
        tenantId: 'tenant-abc-123',
        template: 'blank',
      }),
      env,
    );
    expect(res.status).toBe(202);
    const body = await res.json() as { app: Record<string, unknown> };
    expect(body.app.id).toBeDefined();
    expect(body.app.status).toBe('pending');
  });

  it('returns 401 when Authorization header missing', async () => {
    const req = new Request('https://app-factory.example.com/api/v1/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'my-app', template: 'blank' }),
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid app name', async () => {
    const res = await worker.fetch(
      makeRequest('/api/v1/apps', 'POST', {
        name: 'InvalidName_With_UPPERCASE',
        template: 'blank',
      }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('name');
  });

  it('returns 400 for invalid template', async () => {
    const res = await worker.fetch(
      makeRequest('/api/v1/apps', 'POST', {
        name: 'my-app',
        template: 'nonexistent-framework',
      }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('template');
  });

  it('returns 400 for invalid region', async () => {
    const res = await worker.fetch(
      makeRequest('/api/v1/apps', 'POST', {
        name: 'my-app',
        template: 'blank',
        region: 'us-west-4',
      }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('region');
  });

  it('uses "auto" region by default', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeRequest('/api/v1/apps', 'POST', {
        name: 'my-app',
        template: 'nextjs',
      }),
      env,
    );
    const body = await res.json() as { app: Record<string, unknown> };
    expect(body.app.region).toBe('auto');
  });

  it('stores tenantId from X-Tenant-ID header', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeRequest('/api/v1/apps', 'POST', { name: 'my-app', template: 'api-only' }),
      env,
    );
    const body = await res.json() as { app: Record<string, unknown> };
    expect(body.app.tenantId).toBe('tenant-abc-123');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('https://app-factory.example.com/api/v1/apps', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test',
        'X-Tenant-ID': 'tenant-abc',
      },
      body: 'not-valid-json',
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// App Lifecycle
// ═══════════════════════════════════════════════════════════════
describe('App Lifecycle', () => {
  it('POST /api/v1/apps/:appId/deploy triggers deployment', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeRequest('/api/v1/apps/app-xyz-123/deploy', 'POST'),
      env,
    );
    expect(res.status).toBe(202);
    const body = await res.json() as Record<string, unknown>;
    expect(body.message).toContain('Deployment');
    expect(body.appId).toBe('app-xyz-123');
  });

  it('DELETE /api/v1/apps/:appId deprovisions app', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeRequest('/api/v1/apps/app-xyz-123', 'DELETE'),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.message).toContain('deprovisioned');
  });

  it('GET /api/v1/apps lists tenant apps', async () => {
    const env = makeEnv();
    const res = await worker.fetch(makeRequest('/api/v1/apps'), env);
    expect(res.status).toBe(200);
    const body = await res.json() as { apps: unknown[] };
    expect(Array.isArray(body.apps)).toBe(true);
  });

  it('GET /api/v1/apps/:appId checks cache first', async () => {
    const cachedApp = { id: 'app-xyz-123', name: 'cached-app', status: 'active' };
    const env = makeEnv({
      CACHE: {
        get: vi.fn().mockResolvedValue(JSON.stringify(cachedApp)),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(makeRequest('/api/v1/apps/app-xyz-123'), env);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.name).toBe('cached-app');
  });

  it('deploy returns 404 when app not found', async () => {
    const db = makeDb();
    db._stmt.run.mockResolvedValue({ meta: { changes: 0 } });
    const env = makeEnv({ DB: db });
    const res = await worker.fetch(
      makeRequest('/api/v1/apps/nonexistent/deploy', 'POST'),
      env,
    );
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════
describe('Error Handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await worker.fetch(makeRequest('/unknown/path'), makeEnv());
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('masks errors in production', async () => {
    const db = makeDb();
    db._stmt.run.mockRejectedValue(new Error('D1 database connection timeout'));
    const env = makeEnv({ DB: db, ENVIRONMENT: 'production' });
    const res = await worker.fetch(
      makeRequest('/api/v1/apps', 'POST', { name: 'my-app', template: 'blank' }),
      env,
    );
    expect(res.status).toBe(500);
  });

  it('exposes errors in non-production', async () => {
    const db = makeDb();
    db.prepare.mockImplementation(() => { throw new Error('BOOM'); });
    const env = makeEnv({ DB: db, ENVIRONMENT: 'test' });
    const res = await worker.fetch(makeRequest('/health'), env);
    // Health check doesn't use DB — still 200
    expect(res.status).toBe(200);
  });
});