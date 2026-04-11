/**
 * Trancendos Module SDK — Test Suite
 * Covers: TranceModule, defineModule, route matching, lifecycle hooks,
 * event handling, capability queries, plan checking, logger, helpers
 */
import { describe, it, expect, vi } from 'vitest';
import {
  TranceModule,
  defineModule,
  createModuleLogger,
  moduleJsonResponse,
  moduleErrorResponse,
} from '../index';
import type {
  ModuleManifest,
  ModuleDefinition,
  ModuleRequestContext,
  LifecycleContext,
  PlatformEventEnvelope,
} from '../index';

// ── Test Fixtures ────────────────────────────────────────────

function createTestManifest(overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    name: '@test/my-module',
    version: '1.0.0',
    displayName: 'Test Module',
    type: 'plugin',
    category: 'utility',
    capabilities: [
      { id: 'greeting:hello', description: 'Say hello' },
      { id: 'data:read', description: 'Read data', optional: true },
    ],
    requiredBindings: [
      { type: 'KV', name: 'CACHE', description: 'Cache store' },
    ],
    requiredPlan: 'free',
    dependencies: [],
    routes: [
      { pattern: '/hello', methods: ['GET'], authRequired: false },
      { pattern: '/api/*', methods: ['GET', 'POST'], authRequired: true },
    ],
    emittedEvents: ['test.greeted'],
    consumedEvents: ['user.created'],
    ...overrides,
  };
}

function createTestContext(overrides: Partial<ModuleRequestContext> = {}): ModuleRequestContext {
  return {
    request: new Request('http://localhost/hello'),
    tenant: { id: 'tenant-1', slug: 'acme', plan: 'pro' },
    user: { id: 'user-1', email: 'test@test.com', role: 'admin', scopes: ['*'] },
    config: {},
    env: {},
    traceId: 'trace-123',
    emit: vi.fn().mockResolvedValue(undefined),
    log: createModuleLogger('@test/my-module', 'tenant-1'),
    getModule: vi.fn().mockResolvedValue(null),
    waitUntil: vi.fn(),
    ...overrides,
  };
}

function createLifecycleContext(overrides: Partial<LifecycleContext> = {}): LifecycleContext {
  return {
    tenantId: 'tenant-1',
    moduleId: 'mod-1',
    config: {},
    env: {},
    emit: vi.fn().mockResolvedValue(undefined),
    getModule: vi.fn().mockResolvedValue(null),
    log: createModuleLogger('@test/my-module', 'tenant-1'),
    ...overrides,
  };
}

// ── TranceModule Construction ────────────────────────────────

describe('TranceModule Construction', () => {
  it('creates a module with valid manifest', () => {
    const mod = new TranceModule({ manifest: createTestManifest() });
    expect(mod.manifest.name).toBe('@test/my-module');
    expect(mod.manifest.version).toBe('1.0.0');
  });

  it('throws if manifest is missing name', () => {
    expect(() => new TranceModule({
      manifest: createTestManifest({ name: '' }),
    })).toThrow('Module manifest must have a name');
  });

  it('throws if manifest is missing version', () => {
    expect(() => new TranceModule({
      manifest: createTestManifest({ version: '' }),
    })).toThrow('Module manifest must have a version');
  });

  it('throws if manifest is missing displayName', () => {
    expect(() => new TranceModule({
      manifest: createTestManifest({ displayName: '' }),
    })).toThrow('Module manifest must have a displayName');
  });

  it('throws if manifest is missing type', () => {
    expect(() => new TranceModule({
      manifest: createTestManifest({ type: '' as any }),
    })).toThrow('Module manifest must have a type');
  });
});

// ── defineModule Factory ─────────────────────────────────────

describe('defineModule Factory', () => {
  it('returns a TranceModule instance', () => {
    const mod = defineModule({ manifest: createTestManifest() });
    expect(mod).toBeInstanceOf(TranceModule);
  });

  it('registers routes from definition', () => {
    const handler = vi.fn().mockResolvedValue(new Response('ok'));
    const mod = defineModule({
      manifest: createTestManifest(),
      routes: { '/hello': { GET: handler } },
    });
    expect(mod.matchRoute('/hello', 'GET')).toBe(handler);
  });

  it('registers event handlers from definition', () => {
    const handler = vi.fn();
    const mod = defineModule({
      manifest: createTestManifest(),
      events: { 'user.created': handler },
    });
    expect(mod.handlesEvent('user.created')).toBe(true);
  });
});

// ── Route Matching ───────────────────────────────────────────

describe('Route Matching', () => {
  const handler = vi.fn().mockResolvedValue(new Response('ok'));
  const wildHandler = vi.fn().mockResolvedValue(new Response('wild'));

  const mod = defineModule({
    manifest: createTestManifest(),
    routes: {
      '/hello': { GET: handler },
      '/api/*': { GET: wildHandler, POST: wildHandler },
      '/catch-all': { '*': handler },
    },
  });

  it('matches exact route and method', () => {
    expect(mod.matchRoute('/hello', 'GET')).toBe(handler);
  });

  it('returns null for unmatched method', () => {
    expect(mod.matchRoute('/hello', 'POST')).toBeNull();
  });

  it('returns null for unmatched path', () => {
    expect(mod.matchRoute('/nonexistent', 'GET')).toBeNull();
  });

  it('matches wildcard routes', () => {
    expect(mod.matchRoute('/api/users', 'GET')).toBe(wildHandler);
    expect(mod.matchRoute('/api/users/123', 'POST')).toBe(wildHandler);
  });

  it('matches catch-all method with *', () => {
    expect(mod.matchRoute('/catch-all', 'DELETE')).toBe(handler);
  });
});

// ── Request Handling ─────────────────────────────────────────

describe('Request Handling', () => {
  it('returns 404 for unmatched routes', async () => {
    const mod = defineModule({ manifest: createTestManifest(), routes: {} });
    const ctx = createTestContext({
      request: new Request('http://localhost/missing'),
    });
    const res = await mod.handleRequest(ctx);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('NOT_FOUND');
  });

  it('returns 500 when handler throws', async () => {
    const mod = defineModule({
      manifest: createTestManifest(),
      routes: {
        '/fail': {
          GET: async () => { throw new Error('boom'); },
        },
      },
    });
    const ctx = createTestContext({
      request: new Request('http://localhost/fail'),
    });
    const res = await mod.handleRequest(ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('calls matched handler and returns response', async () => {
    const mod = defineModule({
      manifest: createTestManifest(),
      routes: {
        '/hello': {
          GET: async (ctx) => new Response(JSON.stringify({ hello: ctx.tenant.slug })),
        },
      },
    });
    const ctx = createTestContext();
    const res = await mod.handleRequest(ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { hello: string };
    expect(body.hello).toBe('acme');
  });
});

// ── Lifecycle Hooks ──────────────────────────────────────────

describe('Lifecycle Hooks', () => {
  it('calls onInstall when install() invoked', async () => {
    const onInstall = vi.fn();
    const mod = defineModule({
      manifest: createTestManifest(),
      lifecycle: { onInstall },
    });
    const ctx = createLifecycleContext();
    await mod.install(ctx);
    expect(onInstall).toHaveBeenCalledWith(ctx);
  });

  it('calls onUninstall when uninstall() invoked', async () => {
    const onUninstall = vi.fn();
    const mod = defineModule({
      manifest: createTestManifest(),
      lifecycle: { onUninstall },
    });
    await mod.uninstall(createLifecycleContext());
    expect(onUninstall).toHaveBeenCalled();
  });

  it('calls onEnable when enable() invoked', async () => {
    const onEnable = vi.fn();
    const mod = defineModule({
      manifest: createTestManifest(),
      lifecycle: { onEnable },
    });
    await mod.enable(createLifecycleContext());
    expect(onEnable).toHaveBeenCalled();
  });

  it('calls onDisable when disable() invoked', async () => {
    const onDisable = vi.fn();
    const mod = defineModule({
      manifest: createTestManifest(),
      lifecycle: { onDisable },
    });
    await mod.disable(createLifecycleContext());
    expect(onDisable).toHaveBeenCalled();
  });

  it('calls onUpgrade with fromVersion', async () => {
    const onUpgrade = vi.fn();
    const mod = defineModule({
      manifest: createTestManifest(),
      lifecycle: { onUpgrade },
    });
    await mod.upgrade(createLifecycleContext(), '0.9.0');
    expect(onUpgrade).toHaveBeenCalledWith(expect.anything(), '0.9.0');
  });

  it('healthCheck returns healthy by default', async () => {
    const mod = defineModule({ manifest: createTestManifest() });
    const result = await mod.healthCheck(createLifecycleContext());
    expect(result.status).toBe('healthy');
  });

  it('healthCheck calls custom handler when provided', async () => {
    const mod = defineModule({
      manifest: createTestManifest(),
      lifecycle: {
        onHealthCheck: async () => ({ status: 'degraded', message: 'Slow' }),
      },
    });
    const result = await mod.healthCheck(createLifecycleContext());
    expect(result.status).toBe('degraded');
    expect(result.message).toBe('Slow');
  });

  it('no-ops gracefully when lifecycle hooks are not defined', async () => {
    const mod = defineModule({ manifest: createTestManifest() });
    await expect(mod.install(createLifecycleContext())).resolves.toBeUndefined();
    await expect(mod.uninstall(createLifecycleContext())).resolves.toBeUndefined();
    await expect(mod.enable(createLifecycleContext())).resolves.toBeUndefined();
    await expect(mod.disable(createLifecycleContext())).resolves.toBeUndefined();
    await expect(mod.upgrade(createLifecycleContext(), '0.1.0')).resolves.toBeUndefined();
  });
});

// ── Event Handling ───────────────────────────────────────────

describe('Event Handling', () => {
  it('handles exact event type match', async () => {
    const handler = vi.fn();
    const mod = defineModule({
      manifest: createTestManifest(),
      events: { 'user.created': handler },
    });
    const event: PlatformEventEnvelope = {
      id: 'evt-1',
      tenantId: 'tenant-1',
      eventType: 'user.created',
      source: 'auth',
      data: { userId: 'u1' },
      metadata: { traceId: 't1', timestamp: new Date().toISOString(), version: '1.0' },
    };
    await mod.handleEvent(event, createLifecycleContext());
    expect(handler).toHaveBeenCalledWith(event, expect.anything());
  });

  it('handles wildcard event pattern', async () => {
    const handler = vi.fn();
    const mod = defineModule({
      manifest: createTestManifest(),
      events: { 'user.*': handler },
    });
    const event: PlatformEventEnvelope = {
      id: 'evt-2',
      tenantId: 'tenant-1',
      eventType: 'user.deleted',
      source: 'auth',
      data: {},
      metadata: { traceId: 't2', timestamp: new Date().toISOString(), version: '1.0' },
    };
    await mod.handleEvent(event, createLifecycleContext());
    expect(handler).toHaveBeenCalled();
  });

  it('handlesEvent returns true for registered events', () => {
    const mod = defineModule({
      manifest: createTestManifest(),
      events: { 'module.installed': vi.fn() },
    });
    expect(mod.handlesEvent('module.installed')).toBe(true);
    expect(mod.handlesEvent('module.uninstalled')).toBe(false);
  });

  it('handlesEvent returns true for wildcard patterns', () => {
    const mod = defineModule({
      manifest: createTestManifest(),
      events: { 'module.*': vi.fn() },
    });
    expect(mod.handlesEvent('module.installed')).toBe(true);
    expect(mod.handlesEvent('module.updated')).toBe(true);
    expect(mod.handlesEvent('user.created')).toBe(false);
  });
});

// ── Capability Queries ───────────────────────────────────────

describe('Capability Queries', () => {
  const mod = defineModule({ manifest: createTestManifest() });

  it('hasCapability returns true for existing capability', () => {
    expect(mod.hasCapability('greeting:hello')).toBe(true);
  });

  it('hasCapability returns false for missing capability', () => {
    expect(mod.hasCapability('nonexistent')).toBe(false);
  });

  it('getCapabilities returns all capabilities', () => {
    const caps = mod.getCapabilities();
    expect(caps).toHaveLength(2);
    expect(caps[0].id).toBe('greeting:hello');
  });

  it('getRequiredBindings returns bindings', () => {
    const bindings = mod.getRequiredBindings();
    expect(bindings).toHaveLength(1);
    expect(bindings[0].type).toBe('KV');
  });

  it('getRouteDeclarations returns route declarations', () => {
    const routes = mod.getRouteDeclarations();
    expect(routes).toHaveLength(2);
  });
});

// ── Plan Checking ────────────────────────────────────────────

describe('Plan Checking', () => {
  it('free module meets all plans', () => {
    const mod = defineModule({ manifest: createTestManifest({ requiredPlan: 'free' }) });
    expect(mod.meetsMinimumPlan('free')).toBe(true);
    expect(mod.meetsMinimumPlan('starter')).toBe(true);
    expect(mod.meetsMinimumPlan('pro')).toBe(true);
    expect(mod.meetsMinimumPlan('enterprise')).toBe(true);
  });

  it('pro module rejects free and starter', () => {
    const mod = defineModule({ manifest: createTestManifest({ requiredPlan: 'pro' }) });
    expect(mod.meetsMinimumPlan('free')).toBe(false);
    expect(mod.meetsMinimumPlan('starter')).toBe(false);
    expect(mod.meetsMinimumPlan('pro')).toBe(true);
    expect(mod.meetsMinimumPlan('enterprise')).toBe(true);
  });

  it('enterprise module requires enterprise', () => {
    const mod = defineModule({ manifest: createTestManifest({ requiredPlan: 'enterprise' }) });
    expect(mod.meetsMinimumPlan('free')).toBe(false);
    expect(mod.meetsMinimumPlan('pro')).toBe(false);
    expect(mod.meetsMinimumPlan('enterprise')).toBe(true);
  });
});

// ── Logger ───────────────────────────────────────────────────

describe('Module Logger', () => {
  it('creates logger with module name', () => {
    const logger = createModuleLogger('@test/mod', 'tenant-1');
    expect(logger.info).toBeTypeOf('function');
    expect(logger.warn).toBeTypeOf('function');
    expect(logger.error).toBeTypeOf('function');
    expect(logger.debug).toBeTypeOf('function');
  });

  it('logs structured JSON to console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createModuleLogger('@test/mod', 'tenant-1');
    logger.info('hello', { key: 'value' });
    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.level).toBe('info');
    expect(logged.message).toBe('hello');
    expect(logged.module).toBe('@test/mod');
    expect(logged.tenant).toBe('tenant-1');
    expect(logged.key).toBe('value');
    spy.mockRestore();
  });
});

// ── Response Helpers ─────────────────────────────────────────

describe('Response Helpers', () => {
  it('moduleJsonResponse returns JSON with correct status', async () => {
    const res = moduleJsonResponse({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('moduleJsonResponse defaults to 200', async () => {
    const res = moduleJsonResponse({ data: 'test' });
    expect(res.status).toBe(200);
  });

  it('moduleErrorResponse returns error JSON', async () => {
    const res = moduleErrorResponse('FORBIDDEN', 'Access denied', 403);
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string; message: string; timestamp: string };
    expect(body.error).toBe('FORBIDDEN');
    expect(body.message).toBe('Access denied');
    expect(body.timestamp).toBeTruthy();
  });
});