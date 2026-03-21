/**
 * @package @trancendos/service-mesh
 * Service Mesh — Inter-Worker Communication Layer
 * ============================================================
 * Provides service discovery, circuit breaking, health monitoring,
 * retries, and distributed tracing for the Trancendos worker mesh.
 *
 * Usage:
 *   import { ServiceMesh } from '@trancendos/service-mesh';
 *
 *   const mesh = new ServiceMesh();
 *   mesh.register({ name: 'auth-api', ... });
 *   const result = await mesh.call('auth-api', 'verifyToken', { token });
 * ============================================================
 */

import type {
  ServiceDescriptor,
  ServiceHealth,
  ServiceCallOptions,
  ServiceCallResult,
  ServiceMeshConfig,
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitState,
  HealthStatus,
  ServiceCategory,
  RPCMethodDescriptor,
} from './types';

import {
  DEFAULT_MESH_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './types';

// ── Re-exports ──────────────────────────────────────────────

export type {
  ServiceDescriptor,
  ServiceHealth,
  ServiceCallOptions,
  ServiceCallResult,
  ServiceMeshConfig,
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitState,
  HealthStatus,
  ServiceCategory,
  RPCMethodDescriptor,
};

export { DEFAULT_MESH_CONFIG, DEFAULT_CIRCUIT_BREAKER_CONFIG };

// ── Circuit Breaker ─────────────────────────────────────────

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;
  readonly serviceName: string;

  constructor(serviceName: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.serviceName = serviceName;
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.state = {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      openedAt: null,
      halfOpenAttempts: 0,
    };
  }

  /**
   * Check if a request is allowed through the circuit breaker.
   */
  canExecute(): boolean {
    switch (this.state.state) {
      case 'closed':
        return true;

      case 'open': {
        const now = Date.now();
        const openedAt = this.state.openedAt ? new Date(this.state.openedAt).getTime() : 0;
        if (now - openedAt >= this.config.resetTimeoutMs) {
          this.transitionTo('half-open');
          return true;
        }
        return false;
      }

      case 'half-open': {
        // Allow a percentage of requests through
        return Math.random() * 100 < this.config.halfOpenRequestPercentage;
      }

      default:
        return false;
    }
  }

  /**
   * Record a successful execution.
   */
  recordSuccess(): void {
    this.state.successCount++;
    this.state.lastSuccessAt = new Date().toISOString();

    if (this.state.state === 'half-open') {
      this.state.halfOpenAttempts++;
      if (this.state.halfOpenAttempts >= this.config.halfOpenSuccessThreshold) {
        this.transitionTo('closed');
      }
    } else if (this.state.state === 'closed') {
      // Reset failure count on success
      this.state.failureCount = 0;
    }
  }

  /**
   * Record a failed execution.
   */
  recordFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureAt = new Date().toISOString();

    if (this.state.state === 'half-open') {
      // Any failure in half-open goes back to open
      this.transitionTo('open');
    } else if (this.state.state === 'closed') {
      if (this.state.failureCount >= this.config.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitBreakerState {
    // Check if open circuit should transition to half-open
    if (this.state.state === 'open') {
      const now = Date.now();
      const openedAt = this.state.openedAt ? new Date(this.state.openedAt).getTime() : 0;
      if (now - openedAt >= this.config.resetTimeoutMs) {
        this.transitionTo('half-open');
      }
    }
    return { ...this.state };
  }

  /**
   * Force reset to closed state.
   */
  reset(): void {
    this.transitionTo('closed');
    this.state.failureCount = 0;
    this.state.successCount = 0;
    this.state.halfOpenAttempts = 0;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state.state;
    this.state.state = newState;

    if (newState === 'open') {
      this.state.openedAt = new Date().toISOString();
      this.state.halfOpenAttempts = 0;
    } else if (newState === 'closed') {
      this.state.failureCount = 0;
      this.state.halfOpenAttempts = 0;
      this.state.openedAt = null;
    } else if (newState === 'half-open') {
      this.state.halfOpenAttempts = 0;
    }

    console.log(JSON.stringify({
      level: 'info',
      message: 'Circuit breaker state transition',
      service: this.serviceName,
      from: oldState,
      to: newState,
    }));
  }
}

// ── Service Mesh ────────────────────────────────────────────

export class ServiceMesh {
  private config: ServiceMeshConfig;
  private services: Map<string, ServiceDescriptor> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private healthCache: Map<string, ServiceHealth> = new Map();
  private callHandlers: Map<string, ServiceCallHandler> = new Map();

  constructor(config: Partial<ServiceMeshConfig> = {}) {
    this.config = { ...DEFAULT_MESH_CONFIG, ...config };
  }

  // ── Registration ──────────────────────────────────────────

  /**
   * Register a service in the mesh.
   */
  register(descriptor: ServiceDescriptor): void {
    this.services.set(descriptor.name, descriptor);
    this.circuitBreakers.set(
      descriptor.name,
      new CircuitBreaker(descriptor.name, this.config.defaultCircuitBreaker),
    );
  }

  /**
   * Unregister a service from the mesh.
   */
  unregister(serviceName: string): boolean {
    this.circuitBreakers.delete(serviceName);
    this.healthCache.delete(serviceName);
    this.callHandlers.delete(serviceName);
    return this.services.delete(serviceName);
  }

  /**
   * Register a call handler for a service (for testing/local mode).
   */
  registerHandler(serviceName: string, handler: ServiceCallHandler): void {
    this.callHandlers.set(serviceName, handler);
  }

  // ── Service Call ──────────────────────────────────────────

  /**
   * Call a service method through the mesh.
   * Applies circuit breaking, retries, timeout, and tracing.
   */
  async call<T = unknown>(
    serviceName: string,
    method: string,
    params?: unknown,
    options: ServiceCallOptions = {},
  ): Promise<ServiceCallResult<T>> {
    const service = this.services.get(serviceName);
    if (!service) {
      return {
        success: false,
        error: `Service '${serviceName}' not found in mesh`,
        latencyMs: 0,
        service: serviceName,
        method,
        attempt: 0,
        circuitState: 'closed',
      };
    }

    const cb = this.circuitBreakers.get(serviceName)!;
    const maxAttempts = (options.retries ?? this.config.defaultRetries) + 1;
    const retryDelay = options.retryDelayMs ?? this.config.defaultRetryDelayMs;
    const timeout = options.timeoutMs ?? this.config.defaultTimeoutMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Check circuit breaker
      if (!options.bypassCircuitBreaker && !cb.canExecute()) {
        return {
          success: false,
          error: `Circuit breaker open for service '${serviceName}'`,
          latencyMs: 0,
          service: serviceName,
          method,
          attempt,
          circuitState: cb.getState().state,
        };
      }

      const startTime = Date.now();

      try {
        const handler = this.callHandlers.get(serviceName);
        let data: T;

        if (handler) {
          // Local/test handler
          data = await this.withTimeout(
            handler(method, params) as Promise<T>,
            timeout,
          );
        } else {
          // In production: use service binding RPC
          // env[serviceName].method(params)
          throw new Error(`No handler registered for service '${serviceName}'`);
        }

        const latencyMs = Date.now() - startTime;
        cb.recordSuccess();

        return {
          success: true,
          data,
          latencyMs,
          service: serviceName,
          method,
          attempt,
          circuitState: cb.getState().state,
        };
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        cb.recordFailure();

        const errorMessage = err instanceof Error ? err.message : String(err);

        // If last attempt, return failure
        if (attempt >= maxAttempts) {
          return {
            success: false,
            error: errorMessage,
            latencyMs,
            service: serviceName,
            method,
            attempt,
            circuitState: cb.getState().state,
          };
        }

        // Wait before retry
        await this.delay(retryDelay * attempt);
      }
    }

    // Should not reach here
    return {
      success: false,
      error: 'Max attempts exceeded',
      latencyMs: 0,
      service: serviceName,
      method,
      attempt: maxAttempts,
      circuitState: cb.getState().state,
    };
  }

  // ── Health ────────────────────────────────────────────────

  /**
   * Check health of a specific service.
   */
  async checkHealth(serviceName: string): Promise<ServiceHealth> {
    const service = this.services.get(serviceName);
    if (!service) {
      return {
        name: serviceName,
        status: 'unknown',
        latencyMs: 0,
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
        error: 'Service not registered',
      };
    }

    const startTime = Date.now();
    const handler = this.callHandlers.get(serviceName);

    try {
      if (handler) {
        await this.withTimeout(handler('healthCheck', null), 5000);
      }

      const health: ServiceHealth = {
        name: serviceName,
        status: 'healthy',
        latencyMs: Date.now() - startTime,
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
      };

      this.healthCache.set(serviceName, health);
      return health;
    } catch (err) {
      const cached = this.healthCache.get(serviceName);
      const failures = (cached?.consecutiveFailures || 0) + 1;

      const health: ServiceHealth = {
        name: serviceName,
        status: failures >= 3 ? 'unhealthy' : 'degraded',
        latencyMs: Date.now() - startTime,
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: failures,
        error: err instanceof Error ? err.message : String(err),
      };

      this.healthCache.set(serviceName, health);
      return health;
    }
  }

  /**
   * Check health of all registered services.
   */
  async checkAllHealth(): Promise<Map<string, ServiceHealth>> {
    const results = new Map<string, ServiceHealth>();
    for (const name of this.services.keys()) {
      results.set(name, await this.checkHealth(name));
    }
    return results;
  }

  /**
   * Get cached health for a service.
   */
  getCachedHealth(serviceName: string): ServiceHealth | undefined {
    return this.healthCache.get(serviceName);
  }

  // ── Discovery ─────────────────────────────────────────────

  /**
   * Get all registered services.
   */
  getServices(): ServiceDescriptor[] {
    return Array.from(this.services.values());
  }

  /**
   * Get a specific service descriptor.
   */
  getService(name: string): ServiceDescriptor | undefined {
    return this.services.get(name);
  }

  /**
   * Find services by category.
   */
  findByCategory(category: ServiceCategory): ServiceDescriptor[] {
    return this.getServices().filter((s) => s.category === category);
  }

  /**
   * Find services that provide a specific capability.
   */
  findByCapability(capability: string): ServiceDescriptor[] {
    return this.getServices().filter((s) => s.capabilities.includes(capability));
  }

  /**
   * Get the dependency graph for a service.
   */
  getDependencyGraph(serviceName: string): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    const visited = new Set<string>();

    const traverse = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      const service = this.services.get(name);
      if (!service) return;

      graph.set(name, service.dependencies);
      for (const dep of service.dependencies) {
        traverse(dep);
      }
    };

    traverse(serviceName);
    return graph;
  }

  /**
   * Get circuit breaker state for a service.
   */
  getCircuitBreakerState(serviceName: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(serviceName)?.getState();
  }

  /**
   * Reset circuit breaker for a service.
   */
  resetCircuitBreaker(serviceName: string): boolean {
    const cb = this.circuitBreakers.get(serviceName);
    if (cb) {
      cb.reset();
      return true;
    }
    return false;
  }

  /**
   * Get mesh statistics.
   */
  getStats(): MeshStats {
    const services = this.getServices();
    const healthStatuses = Array.from(this.healthCache.values());

    return {
      totalServices: services.length,
      healthyServices: healthStatuses.filter((h) => h.status === 'healthy').length,
      degradedServices: healthStatuses.filter((h) => h.status === 'degraded').length,
      unhealthyServices: healthStatuses.filter((h) => h.status === 'unhealthy').length,
      openCircuits: Array.from(this.circuitBreakers.values())
        .filter((cb) => cb.getState().state === 'open').length,
      categories: [...new Set(services.map((s) => s.category))],
    };
  }

  // ── Private Helpers ───────────────────────────────────────

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Service call timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ── Types ───────────────────────────────────────────────────

export type ServiceCallHandler = (method: string, params: unknown) => Promise<unknown>;

export interface MeshStats {
  totalServices: number;
  healthyServices: number;
  degradedServices: number;
  unhealthyServices: number;
  openCircuits: number;
  categories: ServiceCategory[];
}