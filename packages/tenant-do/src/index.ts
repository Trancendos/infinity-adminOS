/**
 * TenantDO — Per-Tenant Stateful Kernel (Durable Object)
 * ═══════════════════════════════════════════════════════
 * Each tenant gets exactly one TenantDO instance, globally distributed.
 * Uses SQLite for persistent state (routing, modules, provider config).
 * Uses RPC methods (typed, awaitable) instead of raw fetch.
 * Supports parent-child pattern for per-module child DOs.
 *
 * Sharding: idFromName(`tenant:${tenantId}`) — deterministic, never a global singleton.
 * Alarms: Scheduled health checks for adaptive failover.
 *
 * 2026 Best Practices ("Rules of Durable Objects"):
 * - SQLite + RPC methods
 * - blockConcurrencyWhile only for init/migrations
 * - Parent-child for parallelism
 * - No global singletons
 */

import { DurableObject } from 'cloudflare:workers';

// ════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════

export interface TenantConfig {
  tenantId: string;
  name: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'provisioning';
  domain?: string;
  createdAt: string;
  metadata: Record<string, string>;
}

export interface RouteConfig {
  pathPattern: string;
  targetWorker: string;
  method: string;
  middleware: string[];
}

export interface ModuleRecord {
  id: string;
  name: string;
  version: string;
  status: 'active' | 'disabled' | 'installing' | 'error';
  config: Record<string, unknown>;
  installedAt: string;
}

export interface ProviderConfig {
  capability: string;
  provider: string;
  priority: number;
  config: Record<string, unknown>;
  healthStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  lastCheck: string | null;
}

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  capabilities: {
    requires: string[];
    provides: string[];
  };
  endpoints: Array<{ path: string; method: string; handler: string }>;
  config?: Record<string, unknown>;
}

export interface FailoverReport {
  timestamp: string;
  checks: Array<{
    capability: string;
    provider: string;
    healthy: boolean;
    failedOver: boolean;
    newProvider?: string;
  }>;
}

export interface Env {
  PLATFORM_DB: D1Database;
  MODULE_DO?: DurableObjectNamespace;
  FAILOVER_QUEUE?: Queue;
  HEALTH_CHECK_INTERVAL_MS?: number;
}

// ════════════════════════════════════════════════════════════
// TenantDO Class
// ════════════════════════════════════════════════════════════

export class TenantDO extends DurableObject<Env> {
  private initialized = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    
    // Initialize schema once — blockConcurrencyWhile only in constructor
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS modules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          version TEXT NOT NULL,
          status TEXT DEFAULT 'active' CHECK(status IN ('active','disabled','installing','error')),
          config TEXT DEFAULT '{}',
          installed_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS providers (
          capability TEXT NOT NULL,
          provider TEXT NOT NULL,
          priority INTEGER DEFAULT 0,
          config TEXT DEFAULT '{}',
          health_status TEXT DEFAULT 'unknown',
          last_check TEXT,
          PRIMARY KEY (capability, provider)
        );

        CREATE TABLE IF NOT EXISTS routing (
          path_pattern TEXT PRIMARY KEY,
          target_worker TEXT NOT NULL,
          method TEXT DEFAULT '*',
          middleware TEXT DEFAULT '[]'
        );

        CREATE INDEX IF NOT EXISTS idx_providers_capability ON providers(capability);
        CREATE INDEX IF NOT EXISTS idx_modules_status ON modules(status);
      `);
      this.initialized = true;
    });
  }

  // ════════════════════════════════════════════════════════════
  // Configuration RPC Methods
  // ════════════════════════════════════════════════════════════

  async getConfig(key: string): Promise<string | null> {
    const row = this.ctx.storage.sql
      .exec(`SELECT value FROM config WHERE key = ?`, key)
      .one();
    return row ? (row.value as string) : null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      key, value
    );
  }

  async getTenantConfig(): Promise<TenantConfig | null> {
    const raw = await this.getConfig('tenant');
    return raw ? JSON.parse(raw) : null;
  }

  async setTenantConfig(config: TenantConfig): Promise<void> {
    await this.setConfig('tenant', JSON.stringify(config));
  }

  // ════════════════════════════════════════════════════════════
  // Routing RPC Methods
  // ════════════════════════════════════════════════════════════

  async getRoutingConfig(): Promise<RouteConfig[]> {
    const rows = this.ctx.storage.sql
      .exec(`SELECT path_pattern, target_worker, method, middleware FROM routing ORDER BY path_pattern`)
      .toArray();
    return rows.map(r => ({
      pathPattern: r.path_pattern as string,
      targetWorker: r.target_worker as string,
      method: r.method as string,
      middleware: JSON.parse(r.middleware as string),
    }));
  }

  async setRoute(pathPattern: string, targetWorker: string, method = '*', middleware: string[] = []): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO routing (path_pattern, target_worker, method, middleware) VALUES (?, ?, ?, ?)`,
      pathPattern, targetWorker, method, JSON.stringify(middleware)
    );
  }

  async removeRoute(pathPattern: string): Promise<void> {
    this.ctx.storage.sql.exec(`DELETE FROM routing WHERE path_pattern = ?`, pathPattern);
  }

  async resolveRoute(path: string, method: string): Promise<RouteConfig | null> {
    // Exact match first
    const exact = this.ctx.storage.sql
      .exec(`SELECT * FROM routing WHERE path_pattern = ? AND (method = ? OR method = '*')`, path, method)
      .one();
    if (exact) {
      return {
        pathPattern: exact.path_pattern as string,
        targetWorker: exact.target_worker as string,
        method: exact.method as string,
        middleware: JSON.parse(exact.middleware as string),
      };
    }

    // Prefix match (longest match wins)
    const routes = await this.getRoutingConfig();
    const matching = routes
      .filter(r => path.startsWith(r.pathPattern) && (r.method === '*' || r.method === method))
      .sort((a, b) => b.pathPattern.length - a.pathPattern.length);
    
    return matching[0] || null;
  }

  // ════════════════════════════════════════════════════════════
  // Module Management RPC Methods
  // ════════════════════════════════════════════════════════════

  async getActiveModules(): Promise<ModuleRecord[]> {
    const rows = this.ctx.storage.sql
      .exec(`SELECT * FROM modules WHERE status = 'active' ORDER BY name`)
      .toArray();
    return rows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      version: r.version as string,
      status: r.status as ModuleRecord['status'],
      config: JSON.parse(r.config as string),
      installedAt: r.installed_at as string,
    }));
  }

  async getAllModules(): Promise<ModuleRecord[]> {
    const rows = this.ctx.storage.sql
      .exec(`SELECT * FROM modules ORDER BY name`)
      .toArray();
    return rows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      version: r.version as string,
      status: r.status as ModuleRecord['status'],
      config: JSON.parse(r.config as string),
      installedAt: r.installed_at as string,
    }));
  }

  async installModule(manifest: ModuleManifest): Promise<void> {
    // Register module
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO modules (id, name, version, status, config) VALUES (?, ?, ?, 'installing', ?)`,
      manifest.id, manifest.name, manifest.version, JSON.stringify(manifest.config || {})
    );

    // Register routes
    for (const endpoint of manifest.endpoints) {
      await this.setRoute(
        endpoint.path,
        endpoint.handler,
        endpoint.method,
        []
      );
    }

    // Mark as active
    this.ctx.storage.sql.exec(
      `UPDATE modules SET status = 'active' WHERE id = ?`,
      manifest.id
    );
  }

  async uninstallModule(moduleId: string): Promise<void> {
    // Remove routes for this module's endpoints
    const module = this.ctx.storage.sql
      .exec(`SELECT * FROM modules WHERE id = ?`, moduleId)
      .one();
    if (!module) return;

    // Remove routes pointing to this module
    this.ctx.storage.sql.exec(
      `DELETE FROM routing WHERE target_worker LIKE ?`,
      `%${moduleId}%`
    );

    // Remove module record
    this.ctx.storage.sql.exec(`DELETE FROM modules WHERE id = ?`, moduleId);
  }

  async enableModule(moduleId: string): Promise<void> {
    this.ctx.storage.sql.exec(`UPDATE modules SET status = 'active' WHERE id = ?`, moduleId);
  }

  async disableModule(moduleId: string): Promise<void> {
    this.ctx.storage.sql.exec(`UPDATE modules SET status = 'disabled' WHERE id = ?`, moduleId);
  }

  // ════════════════════════════════════════════════════════════
  // Provider / Adaptive Connectivity RPC Methods
  // ════════════════════════════════════════════════════════════

  async getProvider(capability: string): Promise<ProviderConfig | null> {
    const row = this.ctx.storage.sql
      .exec(
        `SELECT * FROM providers WHERE capability = ? AND health_status != 'down' ORDER BY priority DESC LIMIT 1`,
        capability
      )
      .one();
    if (!row) return null;
    return {
      capability: row.capability as string,
      provider: row.provider as string,
      priority: row.priority as number,
      config: JSON.parse(row.config as string),
      healthStatus: row.health_status as ProviderConfig['healthStatus'],
      lastCheck: row.last_check as string | null,
    };
  }

  async getAllProviders(capability?: string): Promise<ProviderConfig[]> {
    const sql = capability
      ? `SELECT * FROM providers WHERE capability = ? ORDER BY priority DESC`
      : `SELECT * FROM providers ORDER BY capability, priority DESC`;
    const rows = capability
      ? this.ctx.storage.sql.exec(sql, capability).toArray()
      : this.ctx.storage.sql.exec(sql).toArray();
    return rows.map(r => ({
      capability: r.capability as string,
      provider: r.provider as string,
      priority: r.priority as number,
      config: JSON.parse(r.config as string),
      healthStatus: r.health_status as ProviderConfig['healthStatus'],
      lastCheck: r.last_check as string | null,
    }));
  }

  async registerProvider(
    capability: string,
    provider: string,
    priority: number,
    config: Record<string, unknown> = {}
  ): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO providers (capability, provider, priority, config, health_status, last_check) 
       VALUES (?, ?, ?, ?, 'unknown', datetime('now'))`,
      capability, provider, priority, JSON.stringify(config)
    );
  }

  async updateProviderHealth(
    capability: string,
    provider: string,
    healthy: boolean
  ): Promise<void> {
    const status = healthy ? 'healthy' : 'down';
    this.ctx.storage.sql.exec(
      `UPDATE providers SET health_status = ?, last_check = datetime('now') WHERE capability = ? AND provider = ?`,
      status, capability, provider
    );
  }

  // ════════════════════════════════════════════════════════════
  // Health Check & Failover (Alarm-driven)
  // ════════════════════════════════════════════════════════════

  async healthCheckAndFailover(): Promise<FailoverReport> {
    const providers = await this.getAllProviders();
    const report: FailoverReport = {
      timestamp: new Date().toISOString(),
      checks: [],
    };

    // Group by capability
    const byCap = new Map<string, ProviderConfig[]>();
    for (const p of providers) {
      const list = byCap.get(p.capability) || [];
      list.push(p);
      byCap.set(p.capability, list);
    }

    for (const [capability, providerList] of byCap) {
      const primary = providerList[0]; // highest priority
      if (!primary) continue;

      // In a real implementation, we'd actually ping the provider
      // For now, we check the stored health status
      const isHealthy = primary.healthStatus !== 'down';

      if (!isHealthy && providerList.length > 1) {
        // Failover: promote next healthy provider
        const fallback = providerList.find(p => p.provider !== primary.provider && p.healthStatus !== 'down');
        if (fallback) {
          // Swap priorities
          this.ctx.storage.sql.exec(
            `UPDATE providers SET priority = ? WHERE capability = ? AND provider = ?`,
            primary.priority, capability, fallback.provider
          );
          this.ctx.storage.sql.exec(
            `UPDATE providers SET priority = ? WHERE capability = ? AND provider = ?`,
            fallback.priority, capability, primary.provider
          );

          report.checks.push({
            capability,
            provider: primary.provider,
            healthy: false,
            failedOver: true,
            newProvider: fallback.provider,
          });

          // Queue notification if available
          if (this.env.FAILOVER_QUEUE) {
            await this.env.FAILOVER_QUEUE.send({
              type: 'failover',
              capability,
              from: primary.provider,
              to: fallback.provider,
              timestamp: report.timestamp,
            });
          }
          continue;
        }
      }

      report.checks.push({
        capability,
        provider: primary.provider,
        healthy: isHealthy,
        failedOver: false,
      });
    }

    return report;
  }

  /** Alarm handler — scheduled health checks */
  async alarm(): Promise<void> {
    await this.healthCheckAndFailover();
    // Re-schedule next check
    const interval = this.env.HEALTH_CHECK_INTERVAL_MS || 60_000;
    this.ctx.storage.setAlarm(Date.now() + interval);
  }

  /** Start periodic health checks */
  async startHealthMonitoring(intervalMs = 60_000): Promise<void> {
    this.ctx.storage.setAlarm(Date.now() + intervalMs);
  }

  /** Stop periodic health checks */
  async stopHealthMonitoring(): Promise<void> {
    this.ctx.storage.deleteAlarm();
  }

  // ════════════════════════════════════════════════════════════
  // Tenant Stats / Info
  // ════════════════════════════════════════════════════════════

  async getStats(): Promise<{
    moduleCount: number;
    activeModules: number;
    providerCount: number;
    routeCount: number;
    healthyProviders: number;
  }> {
    const moduleCount = (this.ctx.storage.sql.exec(`SELECT COUNT(*) as c FROM modules`).one()?.c as number) || 0;
    const activeModules = (this.ctx.storage.sql.exec(`SELECT COUNT(*) as c FROM modules WHERE status = 'active'`).one()?.c as number) || 0;
    const providerCount = (this.ctx.storage.sql.exec(`SELECT COUNT(*) as c FROM providers`).one()?.c as number) || 0;
    const routeCount = (this.ctx.storage.sql.exec(`SELECT COUNT(*) as c FROM routing`).one()?.c as number) || 0;
    const healthyProviders = (this.ctx.storage.sql.exec(`SELECT COUNT(*) as c FROM providers WHERE health_status = 'healthy'`).one()?.c as number) || 0;

    return { moduleCount, activeModules, providerCount, routeCount, healthyProviders };
  }
}

export default TenantDO;