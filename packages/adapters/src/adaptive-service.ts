/**
 * AdaptiveService — Automatic Failover Across Adapters
 * ═══════════════════════════════════════════════════════════════
 * Wraps multiple adapter implementations for a single port.
 * Automatically fails over to the next adapter when one fails.
 *
 * Usage:
 *   const storage = new AdaptiveService<StoragePort>([
 *     { adapter: new R2StorageAdapter(env.R2), priority: 1 },
 *     { adapter: new MemoryStorageAdapter(), priority: 99 },
 *   ]);
 *
 *   // Automatically uses R2, falls back to memory on failure
 *   const result = await storage.execute('put', key, value);
 */

export interface AdapterEntry<T> {
  adapter: T;
  priority: number;
  name?: string;
  /** Current health status */
  healthy?: boolean;
  /** Last health check timestamp */
  lastCheck?: number;
  /** Consecutive failure count */
  failures?: number;
}

export interface AdaptiveServiceConfig {
  /** Max consecutive failures before marking unhealthy */
  maxFailures: number;
  /** How long to wait before retrying a failed adapter (ms) */
  recoveryInterval: number;
  /** Enable circuit breaker pattern */
  circuitBreaker: boolean;
  /** Log failures */
  verbose: boolean;
}

const DEFAULT_CONFIG: AdaptiveServiceConfig = {
  maxFailures: 3,
  recoveryInterval: 30_000, // 30 seconds
  circuitBreaker: true,
  verbose: true,
};

export class AdaptiveService<T extends object> {
  private adapters: AdapterEntry<T>[];
  private config: AdaptiveServiceConfig;

  constructor(
    adapters: AdapterEntry<T>[],
    config?: Partial<AdaptiveServiceConfig>,
  ) {
    this.adapters = adapters
      .map((a) => ({
        ...a,
        healthy: a.healthy ?? true,
        lastCheck: a.lastCheck ?? 0,
        failures: a.failures ?? 0,
      }))
      .sort((a, b) => a.priority - b.priority);

    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a method on the highest-priority healthy adapter.
   * Automatically fails over to the next adapter on error.
   */
  async execute<K extends keyof T>(
    method: K,
    ...args: T[K] extends (...args: infer A) => any ? A : never[]
  ): Promise<T[K] extends (...args: any[]) => infer R ? Awaited<R> : never> {
    const now = Date.now();
    const errors: Array<{ adapter: string; error: Error }> = [];

    for (const entry of this.adapters) {
      // Skip unhealthy adapters (unless recovery interval has elapsed)
      if (!entry.healthy && this.config.circuitBreaker) {
        if (now - (entry.lastCheck ?? 0) < this.config.recoveryInterval) {
          continue;
        }
        // Recovery attempt
        if (this.config.verbose) {
          console.log(`[adaptive] Attempting recovery for ${entry.name ?? entry.adapter.constructor.name}`);
        }
      }

      try {
        const fn = (entry.adapter as any)[method];
        if (typeof fn !== 'function') {
          throw new Error(`Method '${String(method)}' not found on adapter`);
        }

        const result = await fn.apply(entry.adapter, args);

        // Success — reset failure count
        if (entry.failures && entry.failures > 0) {
          if (this.config.verbose) {
            console.log(`[adaptive] ${entry.name ?? entry.adapter.constructor.name} recovered`);
          }
        }
        entry.healthy = true;
        entry.failures = 0;
        entry.lastCheck = now;

        return result;
      } catch (error) {
        entry.failures = (entry.failures ?? 0) + 1;
        entry.lastCheck = now;

        const adapterName = entry.name ?? entry.adapter.constructor.name;
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ adapter: adapterName, error: err });

        if (this.config.verbose) {
          console.warn(
            `[adaptive] ${adapterName}.${String(method)} failed (${entry.failures}/${this.config.maxFailures}):`,
            err.message,
          );
        }

        // Mark unhealthy after max failures
        if (entry.failures >= this.config.maxFailures) {
          entry.healthy = false;
          if (this.config.verbose) {
            console.error(`[adaptive] ${adapterName} marked UNHEALTHY`);
          }
        }

        // Continue to next adapter
      }
    }

    // All adapters failed
    const errorSummary = errors
      .map((e) => `${e.adapter}: ${e.error.message}`)
      .join('; ');
    throw new Error(
      `[adaptive] All adapters failed for '${String(method)}': ${errorSummary}`,
    );
  }

  /**
   * Get the current primary (highest-priority healthy) adapter.
   */
  getPrimary(): T | null {
    const healthy = this.adapters.find((a) => a.healthy);
    return healthy ? healthy.adapter : null;
  }

  /**
   * Get health status of all adapters.
   */
  getHealthStatus(): Array<{
    name: string;
    provider: string;
    priority: number;
    healthy: boolean;
    failures: number;
    lastCheck: number;
  }> {
    return this.adapters.map((a) => ({
      name: a.name ?? a.adapter.constructor.name,
      provider: (a.adapter as any).provider ?? 'unknown',
      priority: a.priority,
      healthy: a.healthy ?? true,
      failures: a.failures ?? 0,
      lastCheck: a.lastCheck ?? 0,
    }));
  }

  /**
   * Run health checks on all adapters.
   */
  async healthCheckAll(): Promise<Array<{
    name: string;
    healthy: boolean;
    latencyMs: number;
    error?: string;
  }>> {
    const results = [];

    for (const entry of this.adapters) {
      const adapter = entry.adapter as any;
      if (typeof adapter.healthCheck === 'function') {
        try {
          const result = await adapter.healthCheck();
          entry.healthy = result.healthy;
          entry.lastCheck = Date.now();
          if (result.healthy) entry.failures = 0;
          results.push({
            name: entry.name ?? adapter.constructor.name,
            ...result,
          });
        } catch (error) {
          entry.healthy = false;
          entry.lastCheck = Date.now();
          results.push({
            name: entry.name ?? adapter.constructor.name,
            healthy: false,
            latencyMs: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return results;
  }

  /**
   * Reset all adapters to healthy state.
   */
  resetAll(): void {
    for (const entry of this.adapters) {
      entry.healthy = true;
      entry.failures = 0;
      entry.lastCheck = 0;
    }
  }

  /**
   * Get the number of registered adapters.
   */
  get adapterCount(): number {
    return this.adapters.length;
  }

  /**
   * Get the number of healthy adapters.
   */
  get healthyCount(): number {
    return this.adapters.filter((a) => a.healthy).length;
  }
}