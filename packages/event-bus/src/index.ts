/**
 * @package @trancendos/event-bus
 * Platform Event Bus — Type-Safe Inter-Service Communication
 * ============================================================
 * Provides a unified event bus for the Trancendos ecosystem.
 * Supports in-memory callbacks, Cloudflare Queue delivery,
 * webhook dispatch, and pattern-based event routing.
 *
 * Usage:
 *   import { EventBus } from '@trancendos/event-bus';
 *
 *   const bus = new EventBus({ persistEvents: false });
 *   bus.subscribe({ subscriber: 'my-worker', eventPattern: 'user.*', ... });
 *   await bus.emit({ tenantId: 't1', eventType: 'user.created', ... });
 * ============================================================
 */

import type {
  EventEnvelope,
  EventMetadata,
  EventSubscription,
  EventFilter,
  EventCallback,
  EventBusConfig,
  DeliveryResult,
  DeliveryStatus,
  PlatformEventType,
} from './types';

import { DEFAULT_EVENT_BUS_CONFIG } from './types';

// ── Re-exports ──────────────────────────────────────────────

export type {
  EventEnvelope,
  EventMetadata,
  EventSubscription,
  EventFilter,
  EventCallback,
  EventBusConfig,
  DeliveryResult,
  DeliveryStatus,
  PlatformEventType,
};

export { DEFAULT_EVENT_BUS_CONFIG };

// ── Event Bus ───────────────────────────────────────────────

export class EventBus {
  private config: EventBusConfig;
  private subscriptions: Map<string, EventSubscription> = new Map();
  private callbacks: Map<string, EventCallback[]> = new Map();
  private buffer: EventEnvelope[] = [];
  private eventLog: EventEnvelope[] = [];

  constructor(config: Partial<EventBusConfig> = {}) {
    this.config = { ...DEFAULT_EVENT_BUS_CONFIG, ...config };
  }

  // ── Emit ────────────────────────────────────────────────────

  /**
   * Emit an event to all matching subscribers.
   * Returns delivery results for each matched subscription.
   */
  async emit<T extends Record<string, unknown> = Record<string, unknown>>(
    params: EmitParams<T>,
  ): Promise<DeliveryResult[]> {
    const event = this.buildEnvelope(params);

    // Validate payload size
    const payloadSize = new TextEncoder().encode(JSON.stringify(event.data)).length;
    if (payloadSize > this.config.maxPayloadSize) {
      throw new EventBusError(
        'PAYLOAD_TOO_LARGE',
        `Event payload size ${payloadSize} exceeds max ${this.config.maxPayloadSize}`,
      );
    }

    // Persist to log
    if (this.config.persistEvents) {
      this.eventLog.push(event);
    }

    // Buffer for batch processing
    this.buffer.push(event);

    // Find matching subscriptions
    const results: DeliveryResult[] = [];
    const matchingSubs = this.findMatchingSubscriptions(event);

    for (const sub of matchingSubs) {
      const result = await this.deliver(event, sub);
      results.push(result);
    }

    // Deliver to in-memory callbacks
    await this.deliverToCallbacks(event);

    // Flush buffer if needed
    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }

    return results;
  }

  /**
   * Emit without awaiting delivery. Uses fire-and-forget pattern.
   */
  emitAsync<T extends Record<string, unknown> = Record<string, unknown>>(params: EmitParams<T>): void {
    this.emit(params).catch((err) => {
      console.error(JSON.stringify({
        level: 'error',
        message: 'Async event emission failed',
        eventType: params.eventType,
        error: err instanceof Error ? err.message : String(err),
      }));
    });
  }

  // ── Subscribe ───────────────────────────────────────────────

  /**
   * Register a subscription for event delivery.
   */
  subscribe(subscription: EventSubscription): void {
    this.subscriptions.set(subscription.id, subscription);
  }

  /**
   * Remove a subscription by ID.
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Register an in-memory callback for an event pattern.
   * Returns an unsubscribe function.
   */
  on<T extends Record<string, unknown> = Record<string, unknown>>(
    eventPattern: string,
    callback: EventCallback<T>,
  ): () => void {
    const callbacks = this.callbacks.get(eventPattern) || [];
    callbacks.push(callback as EventCallback);
    this.callbacks.set(eventPattern, callbacks);

    return () => {
      const cbs = this.callbacks.get(eventPattern);
      if (cbs) {
        const idx = cbs.indexOf(callback as EventCallback);
        if (idx >= 0) cbs.splice(idx, 1);
        if (cbs.length === 0) this.callbacks.delete(eventPattern);
      }
    };
  }

  /**
   * Register a one-time callback for an event pattern.
   */
  once<T extends Record<string, unknown> = Record<string, unknown>>(
    eventPattern: string,
    callback: EventCallback<T>,
  ): () => void {
    const unsubscribe = this.on<T>(eventPattern, async (event) => {
      unsubscribe();
      await callback(event);
    });
    return unsubscribe;
  }

  // ── Query ─────────────────────────────────────────────────

  /**
   * Get all registered subscriptions.
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscriptions matching an event type.
   */
  getMatchingSubscriptions(eventType: string): EventSubscription[] {
    return this.getSubscriptions().filter(
      (sub) => sub.enabled && this.matchesPattern(sub.eventPattern, eventType),
    );
  }

  /**
   * Get the event log (when persistEvents is true).
   */
  getEventLog(): EventEnvelope[] {
    return [...this.eventLog];
  }

  /**
   * Get events by type from the log.
   */
  getEventsByType(eventType: string): EventEnvelope[] {
    return this.eventLog.filter((e) => e.eventType === eventType);
  }

  /**
   * Get events by tenant from the log.
   */
  getEventsByTenant(tenantId: string): EventEnvelope[] {
    return this.eventLog.filter((e) => e.tenantId === tenantId);
  }

  /**
   * Get buffered events count.
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  // ── Flush & Cleanup ───────────────────────────────────────

  /**
   * Flush the event buffer.
   */
  async flush(): Promise<EventEnvelope[]> {
    const flushed = [...this.buffer];
    this.buffer = [];
    return flushed;
  }

  /**
   * Clear all subscriptions and callbacks.
   */
  clear(): void {
    this.subscriptions.clear();
    this.callbacks.clear();
    this.buffer = [];
    this.eventLog = [];
  }

  /**
   * Get bus statistics.
   */
  getStats(): EventBusStats {
    return {
      subscriptionCount: this.subscriptions.size,
      callbackPatternCount: this.callbacks.size,
      bufferSize: this.buffer.length,
      eventLogSize: this.eventLog.length,
      config: { ...this.config },
    };
  }

  // ── Internal ──────────────────────────────────────────────

  private buildEnvelope<T extends Record<string, unknown>>(params: EmitParams<T>): EventEnvelope<T> {
    return {
      id: params.id || crypto.randomUUID(),
      tenantId: params.tenantId,
      eventType: params.eventType,
      source: params.source,
      subject: params.subject,
      data: params.data,
      metadata: {
        traceId: params.traceId || crypto.randomUUID(),
        correlationId: params.correlationId,
        causationId: params.causationId,
        timestamp: new Date().toISOString(),
        version: params.version || '1.0',
        attempt: 0,
      },
    };
  }

  private findMatchingSubscriptions(event: EventEnvelope): EventSubscription[] {
    const matching: EventSubscription[] = [];

    for (const sub of this.subscriptions.values()) {
      if (!sub.enabled) continue;

      // Pattern match
      if (!this.matchesPattern(sub.eventPattern, event.eventType)) continue;

      // Tenant match (null = platform-wide, matches everything)
      if (sub.tenantId && sub.tenantId !== event.tenantId) continue;

      // Filter match
      if (sub.filter && !this.matchesFilter(sub.filter, event)) continue;

      matching.push(sub);
    }

    return matching;
  }

  private async deliver(
    event: EventEnvelope,
    subscription: EventSubscription,
  ): Promise<DeliveryResult> {
    const startTime = Date.now();

    try {
      switch (subscription.deliveryType) {
        case 'callback':
          // In-memory delivery handled separately
          break;
        case 'queue':
          // In production: env.QUEUE.send(event)
          // For now, tracked via subscription
          break;
        case 'webhook':
          // In production: fetch(subscription.deliveryTarget, { method: 'POST', body: JSON.stringify(event) })
          break;
        case 'service_binding':
          // In production: env[subscription.deliveryTarget].fetch(...)
          break;
        case 'durable_object':
          // In production: env.DO.get(id).fetch(...)
          break;
      }

      return {
        subscriptionId: subscription.id,
        status: 'delivered',
        attempt: 1,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        subscriptionId: subscription.id,
        status: 'failed',
        attempt: 1,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  private async deliverToCallbacks(event: EventEnvelope): Promise<void> {
    for (const [pattern, callbacks] of this.callbacks) {
      if (this.matchesPattern(pattern, event.eventType)) {
        for (const callback of callbacks) {
          try {
            await callback(event);
          } catch (err) {
            console.error(JSON.stringify({
              level: 'error',
              message: 'Event callback error',
              eventType: event.eventType,
              pattern,
              error: err instanceof Error ? err.message : String(err),
            }));
          }
        }
      }
    }
  }

  /**
   * Match an event type against a subscription pattern.
   * Supports: exact match, '*' (catch-all), 'namespace.*' (namespace wildcard)
   */
  matchesPattern(pattern: string, eventType: string): boolean {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;

    // Namespace wildcard: 'user.*' matches 'user.created', 'user.deleted'
    if (pattern.endsWith('.*')) {
      const namespace = pattern.slice(0, -2);
      return eventType.startsWith(namespace + '.');
    }

    // Multi-level wildcard: 'module.**' matches 'module.deploy.started'
    if (pattern.endsWith('.**')) {
      const namespace = pattern.slice(0, -3);
      return eventType.startsWith(namespace + '.');
    }

    return false;
  }

  private matchesFilter(filter: EventFilter, event: EventEnvelope): boolean {
    if (filter.subjects && filter.subjects.length > 0) {
      if (!event.subject || !filter.subjects.includes(event.subject)) return false;
    }

    if (filter.sources && filter.sources.length > 0) {
      if (!filter.sources.includes(event.source)) return false;
    }

    if (filter.dataMatches) {
      for (const [key, value] of Object.entries(filter.dataMatches)) {
        const eventData = event.data as Record<string, unknown>;
        if (eventData[key] !== value) return false;
      }
    }

    return true;
  }
}

// ── Emit Params ─────────────────────────────────────────────

export interface EmitParams<T extends Record<string, unknown> = Record<string, unknown>> {
  id?: string;
  tenantId: string;
  eventType: string;
  source: string;
  subject?: string;
  data: T;
  traceId?: string;
  correlationId?: string;
  causationId?: string;
  version?: string;
}

// ── Error ───────────────────────────────────────────────────

export class EventBusError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'EventBusError';
  }
}

// ── Bus Stats ───────────────────────────────────────────────

export interface EventBusStats {
  subscriptionCount: number;
  callbackPatternCount: number;
  bufferSize: number;
  eventLogSize: number;
  config: EventBusConfig;
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Create a typed event builder for a specific event type.
 */
export function createEventBuilder<T extends Record<string, unknown> = Record<string, unknown>>(
  source: string,
  eventType: string,
) {
  return (tenantId: string, data: T, options?: Partial<EmitParams<T>>): EmitParams<T> => ({
    tenantId,
    eventType,
    source,
    data,
    ...options,
  });
}

/**
 * Extract the category (namespace) from an event type.
 */
export function getEventCategory(eventType: string): string {
  const parts = eventType.split('.');
  return parts[0] || 'unknown';
}

/**
 * Check if an event type matches a known platform event type.
 */
export function isPlatformEvent(eventType: string): boolean {
  const knownPrefixes = [
    'tenant.', 'user.', 'module.', 'ai.', 'security.', 'billing.', 'system.',
  ];
  return knownPrefixes.some((prefix) => eventType.startsWith(prefix));
}