/**
 * AI Gateway — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests the routing engine, failover logic, token budgets,
 * and provider abstraction without real AI calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AIGateway, AIGatewayError } from '../router';
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  TenantAIConfig,
  RouteRule,
  ProviderHealth,
  GatewayMetrics,
} from '../types';

// ─── Mock Provider Factory ──────────────────────────────────────

function createMockProvider(
  name: string,
  response?: Partial<AIResponse>,
  shouldFail = false,
): AIProvider {
  return {
    name,
    displayName: `Mock ${name}`,
    complete: async (req: AIRequest): Promise<AIResponse> => {
      if (shouldFail) throw new Error(`${name} failed`);
      return {
        content: `Response from ${name}`,
        model: req.model ?? 'mock-model',
        provider: name,
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        latencyMs: 50,
        cached: false,
        ...response,
      };
    },
    healthCheck: async (): Promise<ProviderHealth> => ({
      healthy: !shouldFail,
      latencyMs: 10,
      provider: name,
      error: shouldFail ? `${name} unhealthy` : undefined,
    }),
  };
}

function createTenantConfig(overrides?: Partial<TenantAIConfig>): TenantAIConfig {
  return {
    tenantId: 'test-tenant',
    routes: [
      { provider: 'primary', priority: 1, model: 'fast-model' },
      { provider: 'secondary', priority: 2, model: 'fallback-model' },
    ],
    ...overrides,
  };
}

function createRequest(overrides?: Partial<AIRequest>): AIRequest {
  return {
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Gateway Initialization
// ═══════════════════════════════════════════════════════════════

describe('AIGateway Initialization', () => {
  it('should create gateway with providers', () => {
    const providers = new Map<string, AIProvider>();
    providers.set('primary', createMockProvider('primary'));

    const gateway = new AIGateway({ providers, verbose: false });
    expect(gateway.getProviders()).toContain('primary');
  });

  it('should register additional providers', () => {
    const gateway = new AIGateway({
      providers: new Map(),
      verbose: false,
    });

    gateway.registerProvider(createMockProvider('new-provider'));
    expect(gateway.getProviders()).toContain('new-provider');
  });
});

// ═══════════════════════════════════════════════════════════════
// Routing
// ═══════════════════════════════════════════════════════════════

describe('AIGateway Routing', () => {
  let gateway: AIGateway;

  beforeEach(() => {
    const providers = new Map<string, AIProvider>();
    providers.set('primary', createMockProvider('primary'));
    providers.set('secondary', createMockProvider('secondary'));
    gateway = new AIGateway({ providers, verbose: false });
  });

  it('should route to highest priority provider', async () => {
    const config = createTenantConfig();
    const response = await gateway.route(createRequest(), config);

    expect(response.provider).toBe('primary');
    expect(response.content).toBe('Response from primary');
  });

  it('should use route-specific model', async () => {
    const config = createTenantConfig({
      routes: [
        { provider: 'primary', priority: 1, model: 'custom-model' },
      ],
    });
    const response = await gateway.route(createRequest(), config);
    expect(response.model).toBe('custom-model');
  });

  it('should failover to secondary on primary failure', async () => {
    const providers = new Map<string, AIProvider>();
    providers.set('primary', createMockProvider('primary', {}, true));
    providers.set('secondary', createMockProvider('secondary'));

    const gw = new AIGateway({ providers, verbose: false });
    const config = createTenantConfig();
    const response = await gw.route(createRequest(), config);

    expect(response.provider).toBe('secondary');
    expect(response.failoverIndex).toBe(1);
  });

  it('should throw when all providers fail', async () => {
    const providers = new Map<string, AIProvider>();
    providers.set('primary', createMockProvider('primary', {}, true));
    providers.set('secondary', createMockProvider('secondary', {}, true));

    const gw = new AIGateway({ providers, verbose: false });
    const config = createTenantConfig();

    await expect(gw.route(createRequest(), config)).rejects.toThrow(
      /All AI providers failed/,
    );
  });

  it('should throw when no routes match', async () => {
    const config = createTenantConfig({ routes: [] });

    await expect(gateway.route(createRequest(), config)).rejects.toThrow(
      /No applicable routes/,
    );
  });

  it('should throw when provider is not registered', async () => {
    const config = createTenantConfig({
      routes: [{ provider: 'nonexistent', priority: 1 }],
    });

    await expect(gateway.route(createRequest(), config)).rejects.toThrow(
      /All AI providers failed/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Token Budget
// ═══════════════════════════════════════════════════════════════

describe('AIGateway Token Budget', () => {
  let gateway: AIGateway;

  beforeEach(() => {
    const providers = new Map<string, AIProvider>();
    providers.set('primary', createMockProvider('primary'));
    gateway = new AIGateway({ providers, verbose: false });
  });

  it('should allow requests within budget', async () => {
    const config = createTenantConfig({
      dailyTokenBudget: 10000,
      tokensUsedToday: 5000,
    });

    const response = await gateway.route(createRequest(), config);
    expect(response.content).toBeDefined();
  });

  it('should reject requests exceeding budget', async () => {
    const config = createTenantConfig({
      dailyTokenBudget: 1000,
      tokensUsedToday: 1000,
    });

    await expect(gateway.route(createRequest(), config)).rejects.toThrow(
      /Daily token budget exceeded/,
    );
  });

  it('should allow unlimited when no budget set', async () => {
    const config = createTenantConfig({
      dailyTokenBudget: undefined,
    });

    const response = await gateway.route(createRequest(), config);
    expect(response.content).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Conditional Routing
// ═══════════════════════════════════════════════════════════════

describe('AIGateway Conditional Routing', () => {
  let gateway: AIGateway;

  beforeEach(() => {
    const providers = new Map<string, AIProvider>();
    providers.set('premium', createMockProvider('premium'));
    providers.set('standard', createMockProvider('standard'));
    gateway = new AIGateway({ providers, verbose: false });
  });

  it('should filter routes by plan condition', async () => {
    const config = createTenantConfig({
      routes: [
        {
          provider: 'premium',
          priority: 1,
          conditions: { plans: ['enterprise', 'pro'] },
        },
        { provider: 'standard', priority: 2 },
      ],
    });

    // Request with pro plan tag
    const response = await gateway.route(
      createRequest({ tags: { plan: 'pro' } }),
      config,
    );
    expect(response.provider).toBe('premium');

    // Request with free plan — premium filtered out, falls to standard
    const response2 = await gateway.route(
      createRequest({ tags: { plan: 'free' } }),
      config,
    );
    expect(response2.provider).toBe('standard');
  });

  it('should filter routes by tag conditions', async () => {
    const config = createTenantConfig({
      routes: [
        {
          provider: 'premium',
          priority: 1,
          conditions: { tags: { feature: 'advanced' } },
        },
        { provider: 'standard', priority: 2 },
      ],
    });

    const response = await gateway.route(
      createRequest({ tags: { feature: 'basic' } }),
      config,
    );
    expect(response.provider).toBe('standard');
  });
});

// ═══════════════════════════════════════════════════════════════
// Metrics
// ═══════════════════════════════════════════════════════════════

describe('AIGateway Metrics', () => {
  it('should track request metrics', async () => {
    const providers = new Map<string, AIProvider>();
    providers.set('primary', createMockProvider('primary'));
    const gateway = new AIGateway({ providers, verbose: false });

    const config = createTenantConfig({
      routes: [{ provider: 'primary', priority: 1 }],
    });

    await gateway.route(createRequest(), config);
    await gateway.route(createRequest(), config);

    const metrics = gateway.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.totalTokens).toBe(60); // 30 tokens * 2 requests
    expect(metrics.errors).toBe(0);
  });

  it('should track failover count', async () => {
    const providers = new Map<string, AIProvider>();
    providers.set('primary', createMockProvider('primary', {}, true));
    providers.set('secondary', createMockProvider('secondary'));

    const gateway = new AIGateway({ providers, verbose: false });
    const config = createTenantConfig();

    await gateway.route(createRequest(), config);

    const metrics = gateway.getMetrics();
    expect(metrics.failoverCount).toBe(1);
  });

  it('should track per-provider metrics', async () => {
    const providers = new Map<string, AIProvider>();
    providers.set('primary', createMockProvider('primary'));
    const gateway = new AIGateway({ providers, verbose: false });

    const config = createTenantConfig({
      routes: [{ provider: 'primary', priority: 1 }],
    });

    await gateway.route(createRequest(), config);

    const metrics = gateway.getMetrics();
    expect(metrics.byProvider['primary']).toBeDefined();
    expect(metrics.byProvider['primary'].requests).toBe(1);
    expect(metrics.byProvider['primary'].tokens).toBe(30);
  });

  it('should reset metrics', async () => {
    const providers = new Map<string, AIProvider>();
    providers.set('primary', createMockProvider('primary'));
    const gateway = new AIGateway({ providers, verbose: false });

    const config = createTenantConfig({
      routes: [{ provider: 'primary', priority: 1 }],
    });

    await gateway.route(createRequest(), config);
    gateway.resetMetrics();

    const metrics = gateway.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalTokens).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Health Checks
// ═══════════════════════════════════════════════════════════════

describe('AIGateway Health Checks', () => {
  it('should check all provider health', async () => {
    const providers = new Map<string, AIProvider>();
    providers.set('healthy', createMockProvider('healthy'));
    providers.set('unhealthy', createMockProvider('unhealthy', {}, true));

    const gateway = new AIGateway({ providers, verbose: false });
    const results = await gateway.healthCheckAll();

    expect(results.get('healthy')?.healthy).toBe(true);
    expect(results.get('unhealthy')?.healthy).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// AIGatewayError
// ═══════════════════════════════════════════════════════════════

describe('AIGatewayError', () => {
  it('should have error code and message', () => {
    const error = new AIGatewayError('TEST_CODE', 'Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.name).toBe('AIGatewayError');
    expect(error instanceof Error).toBe(true);
  });
});