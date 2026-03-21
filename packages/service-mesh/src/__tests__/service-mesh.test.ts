/**
 * Service Mesh — Test Suite
 * Covers: circuit breaker, service registration, service calls,
 * health checks, discovery, retries, timeout, dependency graph
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  ServiceMesh,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_MESH_CONFIG,
} from '../index';
import type { ServiceDescriptor, CircuitBreakerConfig } from '../index';

// ── Fixtures ─────────────────────────────────────────────────

function createService(overrides: Partial<ServiceDescriptor> = {}): ServiceDescriptor {
  return {
    name: 'test-service',
    displayName: 'Test Service',
    version: '1.0.0',
    category: 'core',
    capabilities: ['test:read', 'test:write'],
    healthEndpoint: '/health',
    rpcMethods: [
      { name: 'getData', authRequired: false, timeoutMs: 5000 },
      { name: 'setData', authRequired: true, requiredScopes: ['write'], timeoutMs: 10000 },
    ],
    dependencies: [],
    critical: false,
    metadata: {},
    ...overrides,
  };
}

// ── Circuit Breaker ──────────────────────────────────────────

describe('CircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = new CircuitBreaker('test-svc');
    expect(cb.getState().state).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('stays closed under failure threshold', () => {
    const cb = new CircuitBreaker('test-svc', { failureThreshold: 5 });
    for (let i = 0; i < 4; i++) cb.recordFailure();
    expect(cb.getState().state).toBe('closed');
    expect(cb.canExecute()).toBe(true);
  });

  it('opens after reaching failure threshold', () => {
    const cb = new CircuitBreaker('test-svc', { failureThreshold: 3 });
    for (let i = 0; i < 3; i++) cb.recordFailure();
    expect(cb.getState().state).toBe('open');
    expect(cb.canExecute()).toBe(false);
  });

  it('transitions to half-open after reset timeout', () => {
    const cb = new CircuitBreaker('test-svc', {
      failureThreshold: 1,
      resetTimeoutMs: 10, // Very short for testing
    });
    cb.recordFailure();
    expect(cb.getState().state).toBe('open');

    // Wait for reset timeout
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const state = cb.getState();
        expect(state.state).toBe('half-open');
        resolve();
      }, 20);
    });
  });

  it('closes from half-open after success threshold', () => {
    const cb = new CircuitBreaker('test-svc', {
      failureThreshold: 1,
      resetTimeoutMs: 1,
      halfOpenSuccessThreshold: 2,
      halfOpenRequestPercentage: 100, // Allow all requests in half-open
    });
    cb.recordFailure(); // Opens

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        cb.getState(); // Trigger half-open check
        cb.recordSuccess();
        cb.recordSuccess();
        expect(cb.getState().state).toBe('closed');
        resolve();
      }, 10);
    });
  });

  it('re-opens from half-open on failure', () => {
    const cb = new CircuitBreaker('test-svc', {
      failureThreshold: 1,
      resetTimeoutMs: 1,
      halfOpenRequestPercentage: 100,
    });
    cb.recordFailure(); // Opens

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        cb.getState(); // Trigger half-open
        cb.recordFailure(); // Should re-open
        expect(cb.getState().state).toBe('open');
        resolve();
      }, 10);
    });
  });

  it('resets failure count on success in closed state', () => {
    const cb = new CircuitBreaker('test-svc', { failureThreshold: 5 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.getState().failureCount).toBe(0);
  });

  it('reset() forces closed state', () => {
    const cb = new CircuitBreaker('test-svc', { failureThreshold: 1 });
    cb.recordFailure();
    expect(cb.getState().state).toBe('open');
    cb.reset();
    expect(cb.getState().state).toBe('closed');
    expect(cb.getState().failureCount).toBe(0);
  });

  it('tracks last failure and success timestamps', () => {
    const cb = new CircuitBreaker('test-svc');
    expect(cb.getState().lastFailureAt).toBeNull();
    expect(cb.getState().lastSuccessAt).toBeNull();
    cb.recordFailure();
    expect(cb.getState().lastFailureAt).toBeTruthy();
    cb.recordSuccess();
    expect(cb.getState().lastSuccessAt).toBeTruthy();
  });
});

// ── Service Registration ─────────────────────────────────────

describe('ServiceMesh Registration', () => {
  let mesh: ServiceMesh;

  beforeEach(() => {
    mesh = new ServiceMesh();
  });

  it('registers a service', () => {
    mesh.register(createService());
    expect(mesh.getServices()).toHaveLength(1);
    expect(mesh.getService('test-service')).toBeDefined();
  });

  it('unregisters a service', () => {
    mesh.register(createService());
    expect(mesh.unregister('test-service')).toBe(true);
    expect(mesh.getServices()).toHaveLength(0);
  });

  it('returns false for unregistering unknown service', () => {
    expect(mesh.unregister('unknown')).toBe(false);
  });

  it('registers multiple services', () => {
    mesh.register(createService({ name: 'svc-a' }));
    mesh.register(createService({ name: 'svc-b' }));
    mesh.register(createService({ name: 'svc-c' }));
    expect(mesh.getServices()).toHaveLength(3);
  });
});

// ── Service Calls ────────────────────────────────────────────

describe('ServiceMesh.call', () => {
  let mesh: ServiceMesh;

  beforeEach(() => {
    mesh = new ServiceMesh({ defaultRetries: 0 });
    mesh.register(createService({ name: 'auth-api' }));
  });

  it('returns error for unknown service', async () => {
    const result = await mesh.call('unknown', 'method');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('calls handler and returns result', async () => {
    mesh.registerHandler('auth-api', async (method, params) => {
      if (method === 'verifyToken') return { valid: true, userId: 'u1' };
      return null;
    });

    const result = await mesh.call<{ valid: boolean; userId: string }>(
      'auth-api',
      'verifyToken',
      { token: 'abc' },
    );

    expect(result.success).toBe(true);
    expect(result.data?.valid).toBe(true);
    expect(result.data?.userId).toBe('u1');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns error when handler throws', async () => {
    mesh.registerHandler('auth-api', async () => {
      throw new Error('auth service down');
    });

    const result = await mesh.call('auth-api', 'verify');
    expect(result.success).toBe(false);
    expect(result.error).toContain('auth service down');
  });

  it('retries on failure', async () => {
    let attempts = 0;
    mesh.registerHandler('auth-api', async () => {
      attempts++;
      if (attempts < 3) throw new Error('temporarily unavailable');
      return { ok: true };
    });

    const result = await mesh.call('auth-api', 'getData', null, {
      retries: 3,
      retryDelayMs: 10,
    });

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });

  it('fails after max retries exhausted', async () => {
    mesh.registerHandler('auth-api', async () => {
      throw new Error('permanently broken');
    });

    const result = await mesh.call('auth-api', 'getData', null, {
      retries: 2,
      retryDelayMs: 10,
    });

    expect(result.success).toBe(false);
    expect(result.attempt).toBe(3); // 1 initial + 2 retries
  });

  it('respects circuit breaker open state', async () => {
    mesh.registerHandler('auth-api', async () => {
      throw new Error('failing');
    });

    // Trigger enough failures to open circuit
    const config = DEFAULT_CIRCUIT_BREAKER_CONFIG;
    for (let i = 0; i < config.failureThreshold + 1; i++) {
      await mesh.call('auth-api', 'method', null, { retries: 0 });
    }

    const result = await mesh.call('auth-api', 'method', null, { retries: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Circuit breaker open');
  });

  it('bypasses circuit breaker when option set', async () => {
    mesh.registerHandler('auth-api', async () => ({ ok: true }));

    // Open the circuit breaker manually
    const cbState = mesh.getCircuitBreakerState('auth-api');
    // Force failures to open it
    for (let i = 0; i < 10; i++) {
      mesh.registerHandler('auth-api', async () => { throw new Error('fail'); });
      await mesh.call('auth-api', 'method', null, { retries: 0 });
    }

    // Now bypass it
    mesh.registerHandler('auth-api', async () => ({ bypassed: true }));
    const result = await mesh.call('auth-api', 'method', null, {
      bypassCircuitBreaker: true,
      retries: 0,
    });
    expect(result.success).toBe(true);
  });
});

// ── Health Checks ────────────────────────────────────────────

describe('ServiceMesh Health', () => {
  let mesh: ServiceMesh;

  beforeEach(() => {
    mesh = new ServiceMesh();
    mesh.register(createService({ name: 'svc-a' }));
    mesh.register(createService({ name: 'svc-b' }));
  });

  it('returns unknown for unregistered service', async () => {
    const health = await mesh.checkHealth('unknown');
    expect(health.status).toBe('unknown');
  });

  it('returns healthy when handler succeeds', async () => {
    mesh.registerHandler('svc-a', async () => ({ ok: true }));
    const health = await mesh.checkHealth('svc-a');
    expect(health.status).toBe('healthy');
    expect(health.consecutiveFailures).toBe(0);
  });

  it('returns degraded after first failure', async () => {
    mesh.registerHandler('svc-a', async () => { throw new Error('down'); });
    const health = await mesh.checkHealth('svc-a');
    expect(health.status).toBe('degraded');
    expect(health.consecutiveFailures).toBe(1);
  });

  it('returns unhealthy after 3 consecutive failures', async () => {
    mesh.registerHandler('svc-a', async () => { throw new Error('down'); });
    await mesh.checkHealth('svc-a');
    await mesh.checkHealth('svc-a');
    const health = await mesh.checkHealth('svc-a');
    expect(health.status).toBe('unhealthy');
    expect(health.consecutiveFailures).toBe(3);
  });

  it('checks all services', async () => {
    mesh.registerHandler('svc-a', async () => ({ ok: true }));
    mesh.registerHandler('svc-b', async () => ({ ok: true }));
    const results = await mesh.checkAllHealth();
    expect(results.size).toBe(2);
    expect(results.get('svc-a')?.status).toBe('healthy');
    expect(results.get('svc-b')?.status).toBe('healthy');
  });

  it('caches health results', async () => {
    mesh.registerHandler('svc-a', async () => ({ ok: true }));
    await mesh.checkHealth('svc-a');
    const cached = mesh.getCachedHealth('svc-a');
    expect(cached).toBeDefined();
    expect(cached?.status).toBe('healthy');
  });
});

// ── Discovery ────────────────────────────────────────────────

describe('ServiceMesh Discovery', () => {
  let mesh: ServiceMesh;

  beforeEach(() => {
    mesh = new ServiceMesh();
    mesh.register(createService({ name: 'auth-api', category: 'auth', capabilities: ['auth:verify'] }));
    mesh.register(createService({ name: 'ai-gateway', category: 'ai', capabilities: ['ai:completion'] }));
    mesh.register(createService({ name: 'data-api', category: 'data', capabilities: ['data:query', 'data:mutate'] }));
  });

  it('finds services by category', () => {
    expect(mesh.findByCategory('auth')).toHaveLength(1);
    expect(mesh.findByCategory('ai')).toHaveLength(1);
    expect(mesh.findByCategory('security')).toHaveLength(0);
  });

  it('finds services by capability', () => {
    expect(mesh.findByCapability('auth:verify')).toHaveLength(1);
    expect(mesh.findByCapability('ai:completion')).toHaveLength(1);
    expect(mesh.findByCapability('nonexistent')).toHaveLength(0);
  });

  it('builds dependency graph', () => {
    mesh.register(createService({
      name: 'gateway',
      dependencies: ['auth-api', 'ai-gateway'],
    }));

    const graph = mesh.getDependencyGraph('gateway');
    expect(graph.get('gateway')).toEqual(['auth-api', 'ai-gateway']);
    expect(graph.has('auth-api')).toBe(true);
    expect(graph.has('ai-gateway')).toBe(true);
  });

  it('handles circular dependencies gracefully', () => {
    mesh.register(createService({ name: 'svc-x', dependencies: ['svc-y'] }));
    mesh.register(createService({ name: 'svc-y', dependencies: ['svc-x'] }));

    const graph = mesh.getDependencyGraph('svc-x');
    expect(graph.size).toBe(2);
  });
});

// ── Stats ────────────────────────────────────────────────────

describe('ServiceMesh Stats', () => {
  it('returns mesh statistics', async () => {
    const mesh = new ServiceMesh();
    mesh.register(createService({ name: 'svc-a', category: 'auth' }));
    mesh.register(createService({ name: 'svc-b', category: 'ai' }));

    mesh.registerHandler('svc-a', async () => ({ ok: true }));
    mesh.registerHandler('svc-b', async () => { throw new Error('down'); });

    await mesh.checkHealth('svc-a');
    await mesh.checkHealth('svc-b');
    await mesh.checkHealth('svc-b');
    await mesh.checkHealth('svc-b');

    const stats = mesh.getStats();
    expect(stats.totalServices).toBe(2);
    expect(stats.healthyServices).toBe(1);
    expect(stats.unhealthyServices).toBe(1);
    expect(stats.categories).toContain('auth');
    expect(stats.categories).toContain('ai');
  });

  it('circuit breaker state accessible', () => {
    const mesh = new ServiceMesh();
    mesh.register(createService({ name: 'svc-a' }));
    const state = mesh.getCircuitBreakerState('svc-a');
    expect(state?.state).toBe('closed');
  });

  it('can reset circuit breaker', () => {
    const mesh = new ServiceMesh();
    mesh.register(createService({ name: 'svc-a' }));
    expect(mesh.resetCircuitBreaker('svc-a')).toBe(true);
    expect(mesh.resetCircuitBreaker('unknown')).toBe(false);
  });
});

// ── Default Configs ──────────────────────────────────────────

describe('Default Configurations', () => {
  it('DEFAULT_CIRCUIT_BREAKER_CONFIG has expected values', () => {
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold).toBe(5);
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs).toBe(30000);
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenSuccessThreshold).toBe(3);
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.requestTimeoutMs).toBe(10000);
  });

  it('DEFAULT_MESH_CONFIG has expected values', () => {
    expect(DEFAULT_MESH_CONFIG.defaultTimeoutMs).toBe(10000);
    expect(DEFAULT_MESH_CONFIG.defaultRetries).toBe(2);
    expect(DEFAULT_MESH_CONFIG.tracingEnabled).toBe(true);
    expect(DEFAULT_MESH_CONFIG.maxConcurrentRequests).toBe(100);
  });
});