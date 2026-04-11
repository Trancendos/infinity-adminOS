/**
 * @module @trancendos/service-mesh/types
 * Service Mesh — Type Definitions
 * ============================================================
 * Defines the service descriptor, health state, circuit breaker,
 * and discovery contracts for inter-worker communication.
 * ============================================================
 */

// ── Service Descriptor ──────────────────────────────────────

export interface ServiceDescriptor {
  /** Unique service name (matches worker name), e.g., 'auth-api' */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Service version */
  version: string;
  /** Service category for grouping */
  category: ServiceCategory;
  /** Capabilities this service exposes */
  capabilities: string[];
  /** Health endpoint path */
  healthEndpoint: string;
  /** RPC methods available via service binding */
  rpcMethods: RPCMethodDescriptor[];
  /** Dependencies on other services */
  dependencies: string[];
  /** Whether the service is critical (affects circuit breaker behavior) */
  critical: boolean;
  /** Service-level metadata */
  metadata: Record<string, unknown>;
}

export type ServiceCategory =
  | 'core'
  | 'auth'
  | 'ai'
  | 'data'
  | 'finance'
  | 'security'
  | 'communication'
  | 'infrastructure'
  | 'gateway';

export interface RPCMethodDescriptor {
  /** Method name */
  name: string;
  /** Description */
  description?: string;
  /** Whether authentication is required */
  authRequired: boolean;
  /** Required permission scopes */
  requiredScopes?: string[];
  /** Timeout in milliseconds */
  timeoutMs: number;
}

// ── Service Health ──────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  lastCheckedAt: string;
  consecutiveFailures: number;
  details?: Record<string, unknown>;
  error?: string;
}

// ── Circuit Breaker ─────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before attempting half-open */
  resetTimeoutMs: number;
  /** Number of successes in half-open before closing */
  halfOpenSuccessThreshold: number;
  /** Request timeout in ms */
  requestTimeoutMs: number;
  /** Percentage of requests to allow in half-open */
  halfOpenRequestPercentage: number;
}

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  openedAt: string | null;
  halfOpenAttempts: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenSuccessThreshold: 3,
  requestTimeoutMs: 10000,
  halfOpenRequestPercentage: 25,
};

// ── Service Call ────────────────────────────────────────────

export interface ServiceCallOptions {
  /** Override the default timeout */
  timeoutMs?: number;
  /** Retry count (0 = no retry) */
  retries?: number;
  /** Delay between retries (ms) */
  retryDelayMs?: number;
  /** Headers to forward */
  headers?: Record<string, string>;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Whether to bypass circuit breaker */
  bypassCircuitBreaker?: boolean;
}

export interface ServiceCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  latencyMs: number;
  service: string;
  method: string;
  attempt: number;
  circuitState: CircuitState;
}

// ── Mesh Configuration ──────────────────────────────────────

export interface ServiceMeshConfig {
  /** Default circuit breaker config for all services */
  defaultCircuitBreaker: CircuitBreakerConfig;
  /** Health check interval in ms */
  healthCheckIntervalMs: number;
  /** Default request timeout in ms */
  defaultTimeoutMs: number;
  /** Default retry count */
  defaultRetries: number;
  /** Default retry delay in ms */
  defaultRetryDelayMs: number;
  /** Whether to enable distributed tracing */
  tracingEnabled: boolean;
  /** Maximum concurrent requests per service */
  maxConcurrentRequests: number;
}

export const DEFAULT_MESH_CONFIG: ServiceMeshConfig = {
  defaultCircuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
  healthCheckIntervalMs: 30000,
  defaultTimeoutMs: 10000,
  defaultRetries: 2,
  defaultRetryDelayMs: 500,
  tracingEnabled: true,
  maxConcurrentRequests: 100,
};