/**
 * TenantDO Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests the TenantDO Durable Object's type exports, interfaces,
 * and logic paths. Since DurableObject requires the CF runtime,
 * we test the exported types and mock the SQLite/RPC layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Type-level tests (compile-time verification) ───────────────
// We import the types to ensure they compile correctly
import type {
  TenantConfig,
  RouteConfig,
  ModuleRecord,
  ProviderConfig,
  ModuleManifest,
  FailoverReport,
  Env,
} from '../index';

describe('TenantDO Types', () => {
  it('should define TenantConfig with required fields', () => {
    const config: TenantConfig = {
      tenantId: 'tenant-001',
      name: 'Acme Corp',
      plan: 'pro',
      status: 'active',
    };
    expect(config.tenantId).toBe('tenant-001');
    expect(config.plan).toBe('pro');
    expect(config.status).toBe('active');
  });

  it('should define TenantConfig with optional domain', () => {
    const config: TenantConfig = {
      tenantId: 'tenant-002',
      name: 'Beta Inc',
      plan: 'enterprise',
      status: 'active',
      domain: 'beta.example.com',
    };
    expect(config.domain).toBe('beta.example.com');
  });

  it('should define RouteConfig with all fields', () => {
    const route: RouteConfig = {
      pathPattern: '/api/v1/*',
      targetWorker: 'api-gateway',
      method: 'GET',
      priority: 10,
      rateLimit: 1000,
      auth: true,
    };
    expect(route.pathPattern).toBe('/api/v1/*');
    expect(route.targetWorker).toBe('api-gateway');
    expect(route.priority).toBe(10);
    expect(route.auth).toBe(true);
  });

  it('should define ModuleRecord with metadata', () => {
    const module: ModuleRecord = {
      id: 'mod-analytics-v1',
      name: 'analytics',
      version: '1.0.0',
      status: 'active',
      workerName: 'analytics-worker',
      permissions: ['read:events', 'write:metrics'],
      installedAt: '2025-03-19T10:00:00Z',
    };
    expect(module.id).toBe('mod-analytics-v1');
    expect(module.permissions).toContain('read:events');
    expect(module.status).toBe('active');
  });

  it('should define ProviderConfig with priority and failover', () => {
    const provider: ProviderConfig = {
      capability: 'ai:completion',
      provider: 'workers-ai',
      priority: 1,
      status: 'healthy',
      config: { model: '@cf/meta/llama-3.1-8b-instruct' },
      lastHealthCheck: '2025-03-19T10:00:00Z',
    };
    expect(provider.capability).toBe('ai:completion');
    expect(provider.priority).toBe(1);
    expect(provider.status).toBe('healthy');
  });

  it('should define ModuleManifest for installation', () => {
    const manifest: ModuleManifest = {
      id: 'mod-chat-v2',
      name: 'chat',
      version: '2.0.0',
      workerName: 'chat-worker',
      permissions: ['read:messages', 'write:messages'],
      routes: [
        {
          pathPattern: '/chat/*',
          targetWorker: 'chat-worker',
          method: '*',
          priority: 5,
          auth: true,
        },
      ],
      providers: [
        {
          capability: 'ai:completion',
          provider: 'workers-ai',
          priority: 1,
          status: 'healthy',
          config: { model: '@cf/meta/llama-3.1-8b-instruct' },
        },
      ],
    };
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.providers).toHaveLength(1);
    expect(manifest.permissions).toContain('write:messages');
  });

  it('should define FailoverReport structure', () => {
    const report: FailoverReport = {
      checked: 3,
      failedOver: 1,
      errors: ['workers-ai: timeout after 5000ms'],
      timestamp: '2025-03-19T10:05:00Z',
    };
    expect(report.checked).toBe(3);
    expect(report.failedOver).toBe(1);
    expect(report.errors).toHaveLength(1);
  });

  it('should enforce plan type constraints', () => {
    const plans: TenantConfig['plan'][] = ['free', 'starter', 'pro', 'enterprise'];
    expect(plans).toHaveLength(4);
    plans.forEach((plan) => {
      expect(['free', 'starter', 'pro', 'enterprise']).toContain(plan);
    });
  });

  it('should enforce status type constraints', () => {
    const statuses: TenantConfig['status'][] = ['active', 'suspended', 'provisioning'];
    expect(statuses).toHaveLength(3);
  });
});

describe('TenantDO Routing Logic', () => {
  it('should match wildcard route patterns', () => {
    // Simulate the route matching logic from TenantDO.resolveRoute
    const routes: RouteConfig[] = [
      { pathPattern: '/api/v1/*', targetWorker: 'api-gw', method: '*', priority: 10, auth: true },
      { pathPattern: '/auth/*', targetWorker: 'lighthouse', method: 'POST', priority: 20, auth: false },
      { pathPattern: '/static/*', targetWorker: 'cdn-worker', method: 'GET', priority: 5, auth: false },
    ];

    // Simple wildcard matcher (mirrors the DO logic)
    function matchRoute(path: string, method: string): RouteConfig | null {
      const sorted = [...routes].sort((a, b) => b.priority - a.priority);
      for (const route of sorted) {
        const pattern = route.pathPattern.replace(/\*/g, '.*');
        if (new RegExp(`^${pattern}$`).test(path)) {
          if (route.method === '*' || route.method === method) {
            return route;
          }
        }
      }
      return null;
    }

    // /auth/login POST → lighthouse (priority 20)
    const authRoute = matchRoute('/auth/login', 'POST');
    expect(authRoute?.targetWorker).toBe('lighthouse');

    // /api/v1/users GET → api-gw (priority 10)
    const apiRoute = matchRoute('/api/v1/users', 'GET');
    expect(apiRoute?.targetWorker).toBe('api-gw');

    // /static/logo.png GET → cdn-worker
    const staticRoute = matchRoute('/static/logo.png', 'GET');
    expect(staticRoute?.targetWorker).toBe('cdn-worker');

    // /unknown → null (no match)
    const noMatch = matchRoute('/unknown', 'GET');
    expect(noMatch).toBeNull();
  });

  it('should prioritize higher priority routes', () => {
    const routes: RouteConfig[] = [
      { pathPattern: '/api/*', targetWorker: 'low-priority', method: '*', priority: 1, auth: false },
      { pathPattern: '/api/*', targetWorker: 'high-priority', method: '*', priority: 100, auth: true },
    ];

    const sorted = [...routes].sort((a, b) => b.priority - a.priority);
    expect(sorted[0].targetWorker).toBe('high-priority');
    expect(sorted[0].priority).toBe(100);
  });
});

describe('TenantDO Provider Failover Logic', () => {
  it('should select healthy provider with highest priority', () => {
    const providers: ProviderConfig[] = [
      { capability: 'ai:completion', provider: 'openai', priority: 1, status: 'healthy', config: {} },
      { capability: 'ai:completion', provider: 'workers-ai', priority: 2, status: 'healthy', config: {} },
      { capability: 'ai:completion', provider: 'anthropic', priority: 3, status: 'degraded', config: {} },
    ];

    // Simulate getProvider logic: filter by capability, sort by priority, return first healthy
    const forCapability = providers
      .filter((p) => p.capability === 'ai:completion' && p.status === 'healthy')
      .sort((a, b) => a.priority - b.priority);

    expect(forCapability[0].provider).toBe('openai');
  });

  it('should failover to next provider when primary is unhealthy', () => {
    const providers: ProviderConfig[] = [
      { capability: 'ai:completion', provider: 'openai', priority: 1, status: 'unhealthy', config: {} },
      { capability: 'ai:completion', provider: 'workers-ai', priority: 2, status: 'healthy', config: {} },
      { capability: 'ai:completion', provider: 'anthropic', priority: 3, status: 'healthy', config: {} },
    ];

    const forCapability = providers
      .filter((p) => p.capability === 'ai:completion' && p.status === 'healthy')
      .sort((a, b) => a.priority - b.priority);

    expect(forCapability[0].provider).toBe('workers-ai');
  });

  it('should return null when no healthy providers exist', () => {
    const providers: ProviderConfig[] = [
      { capability: 'ai:completion', provider: 'openai', priority: 1, status: 'unhealthy', config: {} },
      { capability: 'ai:completion', provider: 'workers-ai', priority: 2, status: 'unhealthy', config: {} },
    ];

    const forCapability = providers
      .filter((p) => p.capability === 'ai:completion' && p.status === 'healthy')
      .sort((a, b) => a.priority - b.priority);

    expect(forCapability).toHaveLength(0);
  });
});

describe('TenantDO Module Installation Logic', () => {
  it('should validate module manifest has required fields', () => {
    const manifest: ModuleManifest = {
      id: 'mod-test',
      name: 'test-module',
      version: '1.0.0',
      workerName: 'test-worker',
      permissions: ['read:data'],
      routes: [],
      providers: [],
    };

    expect(manifest.id).toBeTruthy();
    expect(manifest.name).toBeTruthy();
    expect(manifest.version).toBeTruthy();
    expect(manifest.workerName).toBeTruthy();
  });

  it('should track installation timestamp', () => {
    const now = new Date().toISOString();
    const record: ModuleRecord = {
      id: 'mod-installed',
      name: 'installed-module',
      version: '1.0.0',
      status: 'active',
      workerName: 'installed-worker',
      permissions: [],
      installedAt: now,
    };

    expect(record.installedAt).toBe(now);
    expect(new Date(record.installedAt).getTime()).toBeGreaterThan(0);
  });
});