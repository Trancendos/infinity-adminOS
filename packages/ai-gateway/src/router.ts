/**
 * AI Gateway — Router & Failover Engine
 * ═══════════════════════════════════════════════════════════════
 * Per-tenant conditional routing with automatic failover.
 *
 * Features:
 * - Priority-based provider chain (failover)
 * - Condition-based routing (plan, tags, time)
 * - Token budget enforcement
 * - Response caching (via KV)
 * - Latency-based failover
 * - Per-provider health tracking
 */

import type {
  AIProvider,
  AIRequest,
  AIResponse,
  TenantAIConfig,
  RouteRule,
  GatewayMetrics,
  ProviderHealth,
} from './types';

export interface AIGatewayConfig {
  /** Registered providers */
  providers: Map<string, AIProvider>;
  /** KV namespace for caching (optional) */
  cache?: KVNamespace;
  /** Enable detailed logging */
  verbose?: boolean;
}

export class AIGateway {
  private providers: Map<string, AIProvider>;
  private cache?: KVNamespace;
  private verbose: boolean;
  private healthStatus: Map<string, ProviderHealth> = new Map();
  private metrics: GatewayMetrics = {
    totalRequests: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
    failoverCount: 0,
    cacheHits: 0,
    errors: 0,
    byProvider: {},
  };

  constructor(config: AIGatewayConfig) {
    this.providers = config.providers;
    this.cache = config.cache;
    this.verbose = config.verbose ?? false;
  }

  /**
   * Route an AI request through the tenant's provider chain.
   * Automatically fails over to the next provider on error.
   */
  async route(
    request: AIRequest,
    tenantConfig: TenantAIConfig,
  ): Promise<AIResponse> {
    this.metrics.totalRequests++;

    // 1. Check token budget
    if (tenantConfig.dailyTokenBudget) {
      const used = tenantConfig.tokensUsedToday ?? 0;
      if (used >= tenantConfig.dailyTokenBudget) {
        throw new AIGatewayError(
          'TOKEN_BUDGET_EXCEEDED',
          `Daily token budget exceeded: ${used}/${tenantConfig.dailyTokenBudget}`,
        );
      }
    }

    // 2. Check cache
    if (tenantConfig.cacheEnabled && this.cache) {
      const cached = await this.checkCache(request, tenantConfig);
      if (cached) {
        this.metrics.cacheHits++;
        return cached;
      }
    }

    // 3. Resolve applicable routes
    const routes = this.resolveRoutes(tenantConfig.routes, request);
    if (routes.length === 0) {
      throw new AIGatewayError(
        'NO_ROUTES',
        'No applicable routes found for this request',
      );
    }

    // 4. Try each route in priority order
    const errors: Array<{ provider: string; error: Error }> = [];

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const provider = this.providers.get(route.provider);

      if (!provider) {
        errors.push({
          provider: route.provider,
          error: new Error(`Provider '${route.provider}' not registered`),
        });
        continue;
      }

      // Skip unhealthy providers
      const health = this.healthStatus.get(route.provider);
      if (health && !health.healthy) {
        if (this.verbose) {
          console.log(`[ai-gateway] Skipping unhealthy provider: ${route.provider}`);
        }
        continue;
      }

      try {
        // Apply route-specific model
        const routedRequest: AIRequest = {
          ...request,
          model: route.model ?? request.model,
        };

        // Execute with optional timeout
        const response = await this.executeWithTimeout(
          provider,
          routedRequest,
          route.maxLatency,
        );

        // Track failover
        if (i > 0) {
          this.metrics.failoverCount++;
          response.failoverIndex = i;
        }

        // Update metrics
        this.trackSuccess(route.provider, response);

        // Cache response
        if (tenantConfig.cacheEnabled && this.cache) {
          await this.cacheResponse(request, tenantConfig, response);
        }

        return response;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ provider: route.provider, error: err });

        if (this.verbose) {
          console.warn(
            `[ai-gateway] ${route.provider} failed:`,
            err.message,
          );
        }

        // Update health status
        this.healthStatus.set(route.provider, {
          healthy: false,
          latencyMs: 0,
          provider: route.provider,
          error: err.message,
        });

        this.trackError(route.provider);
      }
    }

    // All providers failed
    this.metrics.errors++;
    const errorSummary = errors.map((e) => `${e.provider}: ${e.error.message}`).join('; ');
    throw new AIGatewayError(
      'ALL_PROVIDERS_FAILED',
      `All AI providers failed: ${errorSummary}`,
    );
  }

  /**
   * Register a new provider.
   */
  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Run health checks on all providers.
   */
  async healthCheckAll(): Promise<Map<string, ProviderHealth>> {
    const results = new Map<string, ProviderHealth>();

    for (const [name, provider] of this.providers) {
      try {
        const health = await provider.healthCheck();
        this.healthStatus.set(name, health);
        results.set(name, health);
      } catch (error) {
        const result: ProviderHealth = {
          healthy: false,
          latencyMs: 0,
          provider: name,
          error: error instanceof Error ? error.message : String(error),
        };
        this.healthStatus.set(name, result);
        results.set(name, result);
      }
    }

    return results;
  }

  /**
   * Get current gateway metrics.
   */
  getMetrics(): GatewayMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      totalLatencyMs: 0,
      failoverCount: 0,
      cacheHits: 0,
      errors: 0,
      byProvider: {},
    };
  }

  /**
   * Get registered provider names.
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  // ─── Internal Methods ─────────────────────────────────────────

  /**
   * Filter and sort routes based on conditions.
   */
  private resolveRoutes(routes: RouteRule[], request: AIRequest): RouteRule[] {
    return routes
      .filter((route) => this.matchConditions(route, request))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if a route's conditions match the request.
   */
  private matchConditions(route: RouteRule, request: AIRequest): boolean {
    if (!route.conditions) return true;

    const { conditions } = route;

    // Plan filter
    if (conditions.plans && request.tags?.plan) {
      if (!conditions.plans.includes(request.tags.plan)) return false;
    }

    // Tag filter
    if (conditions.tags && request.tags) {
      for (const [key, value] of Object.entries(conditions.tags)) {
        if (request.tags[key] !== value) return false;
      }
    }

    // Time-based routing
    if (conditions.schedule) {
      const hour = new Date().getUTCHours();
      const { startHour, endHour } = conditions.schedule;
      if (startHour <= endHour) {
        if (hour < startHour || hour >= endHour) return false;
      } else {
        // Wraps midnight (e.g., 22-06)
        if (hour < startHour && hour >= endHour) return false;
      }
    }

    return true;
  }

  /**
   * Execute a provider request with optional timeout.
   */
  private async executeWithTimeout(
    provider: AIProvider,
    request: AIRequest,
    maxLatencyMs?: number,
  ): Promise<AIResponse> {
    if (!maxLatencyMs) {
      return provider.complete(request);
    }

    return Promise.race([
      provider.complete(request),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${maxLatencyMs}ms`)),
          maxLatencyMs,
        ),
      ),
    ]);
  }

  /**
   * Check the response cache.
   */
  private async checkCache(
    request: AIRequest,
    config: TenantAIConfig,
  ): Promise<AIResponse | null> {
    if (!this.cache) return null;

    try {
      const key = this.cacheKey(request, config);
      const cached = await this.cache.get(key, 'json');
      if (cached) {
        return { ...(cached as AIResponse), cached: true };
      }
    } catch {
      // Cache miss or error
    }
    return null;
  }

  /**
   * Cache a response.
   */
  private async cacheResponse(
    request: AIRequest,
    config: TenantAIConfig,
    response: AIResponse,
  ): Promise<void> {
    if (!this.cache) return;

    try {
      const key = this.cacheKey(request, config);
      await this.cache.put(key, JSON.stringify(response), {
        expirationTtl: config.cacheTtl ?? 3600,
      });
    } catch {
      // Non-critical
    }
  }

  /**
   * Generate a cache key from the request.
   */
  private cacheKey(request: AIRequest, config: TenantAIConfig): string {
    const hash = simpleHash(JSON.stringify({
      messages: request.messages,
      model: request.model,
      temperature: request.temperature,
    }));
    return `ai-cache:${config.tenantId}:${hash}`;
  }

  /**
   * Track a successful request.
   */
  private trackSuccess(provider: string, response: AIResponse): void {
    this.metrics.totalTokens += response.usage.totalTokens;
    this.metrics.totalLatencyMs += response.latencyMs;

    if (!this.metrics.byProvider[provider]) {
      this.metrics.byProvider[provider] = {
        requests: 0,
        tokens: 0,
        avgLatencyMs: 0,
        errors: 0,
      };
    }

    const pm = this.metrics.byProvider[provider];
    pm.requests++;
    pm.tokens += response.usage.totalTokens;
    pm.avgLatencyMs = (pm.avgLatencyMs * (pm.requests - 1) + response.latencyMs) / pm.requests;
  }

  /**
   * Track a failed request.
   */
  private trackError(provider: string): void {
    if (!this.metrics.byProvider[provider]) {
      this.metrics.byProvider[provider] = {
        requests: 0,
        tokens: 0,
        avgLatencyMs: 0,
        errors: 0,
      };
    }
    this.metrics.byProvider[provider].errors++;
  }
}

// ─── Utilities ──────────────────────────────────────────────────

/**
 * Simple hash function for cache keys.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * AI Gateway error with error code.
 */
export class AIGatewayError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AIGatewayError';
  }
}