/**
 * @module @trancendos/event-bus/types
 * Platform Event Bus — Type Definitions
 * ============================================================
 * Type-safe event system for inter-service communication.
 * Supports Queue-based async delivery, webhook dispatch,
 * service binding RPC, and Durable Object routing.
 * ============================================================
 */

// ── Event Envelope ──────────────────────────────────────────

export interface EventEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique event ID */
  id: string;
  /** Tenant scope (empty string for platform-wide events) */
  tenantId: string;
  /** Dot-notation event type, e.g., 'module.installed' */
  eventType: string;
  /** Originating service/worker name */
  source: string;
  /** Resource identifier (optional) */
  subject?: string;
  /** Event payload */
  data: T;
  /** Event metadata */
  metadata: EventMetadata;
}

export interface EventMetadata {
  /** Distributed trace ID */
  traceId: string;
  /** Correlation ID for request chains */
  correlationId?: string;
  /** ID of the event that caused this one */
  causationId?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event schema version */
  version: string;
  /** Retry attempt number (0 = first delivery) */
  attempt?: number;
}

// ── Event Catalog ───────────────────────────────────────────

export type EventCategory =
  | 'tenant'
  | 'user'
  | 'module'
  | 'ai'
  | 'security'
  | 'billing'
  | 'system'
  | 'custom';

/** Well-known platform event types */
export type PlatformEventType =
  // Tenant lifecycle
  | 'tenant.created'
  | 'tenant.updated'
  | 'tenant.suspended'
  | 'tenant.activated'
  | 'tenant.deleted'
  // User lifecycle
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.login'
  | 'user.logout'
  | 'user.mfa_enabled'
  | 'user.password_changed'
  // Module lifecycle
  | 'module.published'
  | 'module.installed'
  | 'module.uninstalled'
  | 'module.updated'
  | 'module.enabled'
  | 'module.disabled'
  | 'module.deploy_started'
  | 'module.deploy_completed'
  | 'module.deploy_failed'
  | 'module.health_check'
  // AI events
  | 'ai.request'
  | 'ai.response'
  | 'ai.error'
  | 'ai.budget_warning'
  | 'ai.budget_exceeded'
  // Security events
  | 'security.auth_failure'
  | 'security.rate_limited'
  | 'security.suspicious_activity'
  | 'security.key_rotated'
  | 'security.permission_denied'
  // Billing events
  | 'billing.plan_changed'
  | 'billing.usage_warning'
  | 'billing.quota_exceeded'
  | 'billing.payment_received'
  // System events
  | 'system.health_check'
  | 'system.config_changed'
  | 'system.maintenance_started'
  | 'system.maintenance_completed'
  | 'system.error';

// ── Subscription ────────────────────────────────────────────

export type DeliveryType = 'queue' | 'webhook' | 'service_binding' | 'durable_object' | 'callback';

export interface EventSubscription {
  /** Unique subscription ID */
  id: string;
  /** Tenant scope (null = platform-wide) */
  tenantId?: string;
  /** Subscriber name (worker/module) */
  subscriber: string;
  /** Event pattern with glob support: 'module.*', 'tenant.created' */
  eventPattern: string;
  /** Additional filter conditions (JSON) */
  filter?: EventFilter;
  /** How to deliver the event */
  deliveryType: DeliveryType;
  /** Delivery target: queue name, URL, binding name, etc. */
  deliveryTarget: string;
  /** Max delivery retries */
  maxRetries: number;
  /** Delay between retries (ms) */
  retryDelayMs: number;
  /** Whether this subscription is active */
  enabled: boolean;
}

export interface EventFilter {
  /** Only match events with these subjects */
  subjects?: string[];
  /** Only match events with data matching these conditions */
  dataMatches?: Record<string, unknown>;
  /** Only match events from these sources */
  sources?: string[];
}

// ── Delivery ────────────────────────────────────────────────

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export interface DeliveryResult {
  subscriptionId: string;
  status: DeliveryStatus;
  attempt: number;
  error?: string;
  latencyMs?: number;
}

// ── Bus Configuration ───────────────────────────────────────

export interface EventBusConfig {
  /** Maximum events to buffer before flushing */
  batchSize: number;
  /** Maximum time to wait before flushing (ms) */
  flushIntervalMs: number;
  /** Default max retries for failed deliveries */
  defaultMaxRetries: number;
  /** Default retry delay (ms) */
  defaultRetryDelayMs: number;
  /** Whether to persist events to D1 */
  persistEvents: boolean;
  /** Maximum event payload size (bytes) */
  maxPayloadSize: number;
  /** Dead-letter queue name */
  deadLetterQueue?: string;
}

export const DEFAULT_EVENT_BUS_CONFIG: EventBusConfig = {
  batchSize: 100,
  flushIntervalMs: 5000,
  defaultMaxRetries: 3,
  defaultRetryDelayMs: 1000,
  persistEvents: true,
  maxPayloadSize: 256 * 1024, // 256KB
  deadLetterQueue: 'platform-events-dlq',
};

// ── Callback Handler ────────────────────────────────────────

export type EventCallback<T extends Record<string, unknown> = Record<string, unknown>> = (
  event: EventEnvelope<T>,
) => Promise<void> | void;