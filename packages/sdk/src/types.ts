/**
 * @module @trancendos/sdk/types
 * Trancendos Module SDK — Type Definitions
 * ============================================================
 * Defines the contract every plug-and-play module must satisfy.
 * Modules declare capabilities, required bindings, lifecycle hooks,
 * and route handlers to integrate into the Trancendos ecosystem.
 * ============================================================
 */

// ── Module Manifest ─────────────────────────────────────────

export interface ModuleManifest {
  /** Unique scoped name, e.g., '@trancendos/ai-gateway' */
  name: string;
  /** Semver version */
  version: string;
  /** Human-readable display name */
  displayName: string;
  /** Short description */
  description?: string;
  /** Module classification */
  type: ModuleType;
  /** Functional category */
  category: ModuleCategory;
  /** Author information */
  author?: ModuleAuthor;
  /** Icon URL for marketplace display */
  iconUrl?: string;
  /** Capabilities this module provides to the platform */
  capabilities: Capability[];
  /** Platform bindings this module requires */
  requiredBindings: BindingRequirement[];
  /** Minimum tenant plan required */
  requiredPlan: PlanTier;
  /** Other modules this depends on */
  dependencies: ModuleDependency[];
  /** Route patterns this module handles */
  routes: RouteDeclaration[];
  /** Events this module emits */
  emittedEvents: string[];
  /** Events this module consumes */
  consumedEvents: string[];
  /** Configuration schema (JSON Schema) */
  configSchema?: Record<string, unknown>;
  /** Default configuration values */
  defaultConfig?: Record<string, unknown>;
  /** Module-level metadata */
  metadata?: Record<string, unknown>;
}

export type ModuleType = 'worker' | 'package' | 'app' | 'adapter' | 'plugin' | 'theme' | 'integration';
export type ModuleCategory = 'core' | 'ai' | 'finance' | 'security' | 'analytics' | 'communication' | 'storage' | 'utility' | 'ui' | 'integration';
export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface ModuleAuthor {
  name: string;
  email?: string;
  url?: string;
}

// ── Capabilities ────────────────────────────────────────────

export interface Capability {
  /** Capability namespace:action, e.g., 'ai:completion', 'storage:read' */
  id: string;
  /** Human description */
  description?: string;
  /** Whether this capability is optional */
  optional?: boolean;
}

// ── Binding Requirements ────────────────────────────────────

export interface BindingRequirement {
  /** Binding type: D1, KV, R2, AI, DO, Queue, Vectorize, Hyperdrive */
  type: BindingType;
  /** Binding name in wrangler config */
  name: string;
  /** Description of what this binding is used for */
  description?: string;
  /** Whether this binding is optional */
  optional?: boolean;
}

export type BindingType =
  | 'D1'
  | 'KV'
  | 'R2'
  | 'AI'
  | 'DurableObject'
  | 'Queue'
  | 'Vectorize'
  | 'Hyperdrive'
  | 'ServiceBinding'
  | 'Secret'
  | 'Variable';

// ── Dependencies ────────────────────────────────────────────

export interface ModuleDependency {
  /** Module name */
  name: string;
  /** Semver version range */
  versionRange: string;
  /** Dependency type */
  type: 'required' | 'optional' | 'peer';
}

// ── Route Declarations ──────────────────────────────────────

export interface RouteDeclaration {
  /** URL pattern, e.g., '/api/v1/completions' */
  pattern: string;
  /** HTTP methods */
  methods: HttpMethod[];
  /** Whether authentication is required */
  authRequired: boolean;
  /** Required permission scopes */
  requiredScopes?: string[];
  /** Rate limit override (requests per minute) */
  rateLimit?: number;
  /** Description */
  description?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

// ── Lifecycle Hooks ─────────────────────────────────────────

export interface ModuleLifecycle {
  /** Called when module is installed for a tenant */
  onInstall?(context: LifecycleContext): Promise<void>;
  /** Called when module is uninstalled */
  onUninstall?(context: LifecycleContext): Promise<void>;
  /** Called when module is enabled */
  onEnable?(context: LifecycleContext): Promise<void>;
  /** Called when module is disabled */
  onDisable?(context: LifecycleContext): Promise<void>;
  /** Called when module config is updated */
  onConfigUpdate?(context: LifecycleContext, oldConfig: Record<string, unknown>): Promise<void>;
  /** Called when module version is upgraded */
  onUpgrade?(context: LifecycleContext, fromVersion: string): Promise<void>;
  /** Health check — called periodically */
  onHealthCheck?(context: LifecycleContext): Promise<HealthCheckResult>;
}

export interface LifecycleContext {
  tenantId: string;
  moduleId: string;
  config: Record<string, unknown>;
  env: Record<string, unknown>;
  /** Emit a platform event */
  emit(eventType: string, data: Record<string, unknown>): Promise<void>;
  /** Get another installed module's API */
  getModule<T = unknown>(name: string): Promise<T | null>;
  /** Access structured logging */
  log: ModuleLogger;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, unknown>;
  latencyMs?: number;
}

// ── Module Logger ───────────────────────────────────────────

export interface ModuleLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

// ── Module Request Context ──────────────────────────────────

export interface ModuleRequestContext {
  /** Original request */
  request: Request;
  /** Resolved tenant identity */
  tenant: {
    id: string;
    slug: string;
    plan: PlanTier;
  };
  /** Authenticated user (if auth required) */
  user?: {
    id: string;
    email: string;
    role: string;
    scopes: string[];
  };
  /** Module-specific configuration */
  config: Record<string, unknown>;
  /** Platform environment bindings */
  env: Record<string, unknown>;
  /** Correlation/trace ID */
  traceId: string;
  /** Emit a platform event */
  emit(eventType: string, data: Record<string, unknown>): Promise<void>;
  /** Access structured logging */
  log: ModuleLogger;
  /** Get another module's client */
  getModule<T = unknown>(name: string): Promise<T | null>;
  /** Wait until (for background work) */
  waitUntil(promise: Promise<unknown>): void;
}

// ── Module Handler ──────────────────────────────────────────

export type ModuleHandler = (ctx: ModuleRequestContext) => Promise<Response>;

export interface ModuleRouteMap {
  [pattern: string]: {
    [method: string]: ModuleHandler;
  };
}

// ── Platform Events ─────────────────────────────────────────

export interface PlatformEventEnvelope<T = Record<string, unknown>> {
  id: string;
  tenantId: string;
  eventType: string;
  source: string;
  subject?: string;
  data: T;
  metadata: {
    traceId: string;
    correlationId?: string;
    causationId?: string;
    timestamp: string;
    version: string;
  };
}

export type EventHandler<T = Record<string, unknown>> = (
  event: PlatformEventEnvelope<T>,
  context: LifecycleContext,
) => Promise<void>;