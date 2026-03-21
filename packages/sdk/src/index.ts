/**
 * @package @trancendos/sdk
 * Trancendos Module SDK — Base Classes & Utilities
 * ============================================================
 * Provides the base class and helpers for building plug-and-play
 * modules that integrate seamlessly into the Trancendos ecosystem.
 *
 * Usage:
 *   import { TranceModule, defineModule } from '@trancendos/sdk';
 *
 *   export default defineModule({
 *     manifest: { name: '@myorg/my-module', ... },
 *     routes: { '/api/hello': { GET: async (ctx) => new Response('Hello!') } },
 *     lifecycle: { onInstall: async (ctx) => { ... } },
 *     events: { 'user.created': async (event, ctx) => { ... } },
 *   });
 * ============================================================
 */

import type {
  ModuleManifest,
  ModuleLifecycle,
  ModuleRouteMap,
  ModuleHandler,
  ModuleRequestContext,
  ModuleLogger,
  LifecycleContext,
  HealthCheckResult,
  PlatformEventEnvelope,
  EventHandler,
  PlanTier,
  Capability,
  BindingRequirement,
  RouteDeclaration,
  HttpMethod,
} from './types';

// ── Re-exports ──────────────────────────────────────────────

export type {
  ModuleManifest,
  ModuleLifecycle,
  ModuleRouteMap,
  ModuleHandler,
  ModuleRequestContext,
  ModuleLogger,
  LifecycleContext,
  HealthCheckResult,
  PlatformEventEnvelope,
  EventHandler,
  PlanTier,
  Capability,
  BindingRequirement,
  RouteDeclaration,
  HttpMethod,
};

// ── Module Definition ───────────────────────────────────────

export interface ModuleDefinition {
  manifest: ModuleManifest;
  routes?: ModuleRouteMap;
  lifecycle?: ModuleLifecycle;
  events?: Record<string, EventHandler>;
}

/**
 * TranceModule — The base class for all Trancendos plug-and-play modules.
 * Encapsulates manifest, routes, lifecycle, and event handlers.
 */
export class TranceModule {
  readonly manifest: ModuleManifest;
  readonly routes: ModuleRouteMap;
  readonly lifecycle: ModuleLifecycle;
  readonly eventHandlers: Map<string, EventHandler>;

  constructor(definition: ModuleDefinition) {
    this.manifest = definition.manifest;
    this.routes = definition.routes || {};
    this.lifecycle = definition.lifecycle || {};
    this.eventHandlers = new Map();

    if (definition.events) {
      for (const [eventType, handler] of Object.entries(definition.events)) {
        this.eventHandlers.set(eventType, handler);
      }
    }

    // Validate manifest
    this.validateManifest();
  }

  // ── Request Handling ────────────────────────────────────────

  /**
   * Match an incoming request to a registered route handler.
   * Returns the handler function or null if no match.
   */
  matchRoute(path: string, method: string): ModuleHandler | null {
    // Exact match first
    const exactRoute = this.routes[path];
    if (exactRoute) {
      const handler = exactRoute[method] || exactRoute['*'];
      if (handler) return handler;
    }

    // Pattern match (simple glob: /api/* matches /api/foo/bar)
    for (const [pattern, methods] of Object.entries(this.routes)) {
      if (this.matchPattern(pattern, path)) {
        const handler = methods[method] || methods['*'];
        if (handler) return handler;
      }
    }

    return null;
  }

  /**
   * Handle a fetch request by routing to the appropriate handler.
   */
  async handleRequest(ctx: ModuleRequestContext): Promise<Response> {
    const url = new URL(ctx.request.url);
    const method = ctx.request.method;
    const handler = this.matchRoute(url.pathname, method);

    if (!handler) {
      return new Response(
        JSON.stringify({
          error: 'NOT_FOUND',
          message: `No handler for ${method} ${url.pathname}`,
          module: this.manifest.name,
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    try {
      return await handler(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      ctx.log.error('Handler error', { path: url.pathname, method, error: message });
      return new Response(
        JSON.stringify({
          error: 'INTERNAL_ERROR',
          message: 'Module handler failed',
          module: this.manifest.name,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  // ── Event Handling ──────────────────────────────────────────

  /**
   * Process a platform event through registered event handlers.
   */
  async handleEvent(
    event: PlatformEventEnvelope,
    context: LifecycleContext,
  ): Promise<void> {
    // Check exact match
    const exactHandler = this.eventHandlers.get(event.eventType);
    if (exactHandler) {
      await exactHandler(event, context);
      return;
    }

    // Check wildcard matches
    for (const [pattern, handler] of this.eventHandlers) {
      if (this.matchEventPattern(pattern, event.eventType)) {
        await handler(event, context);
      }
    }
  }

  /**
   * Check if this module handles a given event type.
   */
  handlesEvent(eventType: string): boolean {
    if (this.eventHandlers.has(eventType)) return true;
    for (const pattern of this.eventHandlers.keys()) {
      if (this.matchEventPattern(pattern, eventType)) return true;
    }
    return false;
  }

  // ── Lifecycle ───────────────────────────────────────────────

  async install(ctx: LifecycleContext): Promise<void> {
    if (this.lifecycle.onInstall) await this.lifecycle.onInstall(ctx);
  }

  async uninstall(ctx: LifecycleContext): Promise<void> {
    if (this.lifecycle.onUninstall) await this.lifecycle.onUninstall(ctx);
  }

  async enable(ctx: LifecycleContext): Promise<void> {
    if (this.lifecycle.onEnable) await this.lifecycle.onEnable(ctx);
  }

  async disable(ctx: LifecycleContext): Promise<void> {
    if (this.lifecycle.onDisable) await this.lifecycle.onDisable(ctx);
  }

  async upgrade(ctx: LifecycleContext, fromVersion: string): Promise<void> {
    if (this.lifecycle.onUpgrade) await this.lifecycle.onUpgrade(ctx, fromVersion);
  }

  async healthCheck(ctx: LifecycleContext): Promise<HealthCheckResult> {
    if (this.lifecycle.onHealthCheck) return this.lifecycle.onHealthCheck(ctx);
    return { status: 'healthy', message: 'Default health check passed' };
  }

  // ── Capability Queries ──────────────────────────────────────

  hasCapability(capabilityId: string): boolean {
    return this.manifest.capabilities.some((c) => c.id === capabilityId);
  }

  getCapabilities(): Capability[] {
    return [...this.manifest.capabilities];
  }

  getRequiredBindings(): BindingRequirement[] {
    return [...this.manifest.requiredBindings];
  }

  getRouteDeclarations(): RouteDeclaration[] {
    return [...this.manifest.routes];
  }

  // ── Plan Checking ─────────────────────────────────────────

  static readonly PLAN_HIERARCHY: Record<PlanTier, number> = {
    free: 0,
    starter: 1,
    pro: 2,
    enterprise: 3,
  };

  meetsMinimumPlan(tenantPlan: PlanTier): boolean {
    const required = TranceModule.PLAN_HIERARCHY[this.manifest.requiredPlan] || 0;
    const actual = TranceModule.PLAN_HIERARCHY[tenantPlan] || 0;
    return actual >= required;
  }

  // ── Pattern Matching (Private) ────────────────────────────

  private matchPattern(pattern: string, path: string): boolean {
    if (pattern === path) return true;
    if (pattern === '*' || pattern === '/*') return true;

    // Convert glob to regex: /api/* → ^/api/.*$
    const regexStr = '^' + pattern.replace(/\*/g, '.*').replace(/\//g, '\\/') + '$';
    try {
      return new RegExp(regexStr).test(path);
    } catch {
      return false;
    }
  }

  private matchEventPattern(pattern: string, eventType: string): boolean {
    if (pattern === eventType) return true;
    if (pattern === '*') return true;

    // Support namespace wildcards: 'user.*' matches 'user.created'
    const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
    try {
      return new RegExp(regexStr).test(eventType);
    } catch {
      return false;
    }
  }

  // ── Validation ────────────────────────────────────────────

  private validateManifest(): void {
    if (!this.manifest.name) throw new Error('Module manifest must have a name');
    if (!this.manifest.version) throw new Error('Module manifest must have a version');
    if (!this.manifest.displayName) throw new Error('Module manifest must have a displayName');
    if (!this.manifest.type) throw new Error('Module manifest must have a type');
  }
}

// ── Factory Function ────────────────────────────────────────

/**
 * defineModule — Convenience factory for creating TranceModule instances.
 *
 * @example
 * export default defineModule({
 *   manifest: {
 *     name: '@myorg/hello-world',
 *     version: '1.0.0',
 *     displayName: 'Hello World',
 *     type: 'plugin',
 *     category: 'utility',
 *     capabilities: [{ id: 'greeting:hello' }],
 *     requiredBindings: [],
 *     requiredPlan: 'free',
 *     dependencies: [],
 *     routes: [{ pattern: '/hello', methods: ['GET'], authRequired: false }],
 *     emittedEvents: ['hello.greeted'],
 *     consumedEvents: [],
 *   },
 *   routes: {
 *     '/hello': {
 *       GET: async (ctx) => new Response('Hello from the module!'),
 *     },
 *   },
 * });
 */
export function defineModule(definition: ModuleDefinition): TranceModule {
  return new TranceModule(definition);
}

// ── Logger Factory ──────────────────────────────────────────

/**
 * createModuleLogger — Creates a structured logger scoped to a module.
 */
export function createModuleLogger(moduleName: string, tenantId?: string): ModuleLogger {
  const base = { module: moduleName, tenant: tenantId };

  return {
    info(message: string, data?: Record<string, unknown>) {
      console.log(JSON.stringify({ level: 'info', message, ...base, ...data }));
    },
    warn(message: string, data?: Record<string, unknown>) {
      console.warn(JSON.stringify({ level: 'warn', message, ...base, ...data }));
    },
    error(message: string, data?: Record<string, unknown>) {
      console.error(JSON.stringify({ level: 'error', message, ...base, ...data }));
    },
    debug(message: string, data?: Record<string, unknown>) {
      console.debug(JSON.stringify({ level: 'debug', message, ...base, ...data }));
    },
  };
}

// ── Response Helpers ────────────────────────────────────────

export function moduleJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function moduleErrorResponse(
  error: string,
  message: string,
  status = 400,
): Response {
  return new Response(
    JSON.stringify({ error, message, timestamp: new Date().toISOString() }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}