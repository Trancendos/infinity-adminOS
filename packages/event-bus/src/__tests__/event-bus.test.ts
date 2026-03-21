/**
 * Platform Event Bus — Test Suite
 * Covers: emit, subscribe, callbacks, pattern matching, filtering,
 * buffering, persistence, stats, helpers, errors
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EventBus,
  EventBusError,
  createEventBuilder,
  getEventCategory,
  isPlatformEvent,
  DEFAULT_EVENT_BUS_CONFIG,
} from '../index';
import type { EventSubscription, EventEnvelope } from '../index';

// ── Helpers ──────────────────────────────────────────────────

function createSub(overrides: Partial<EventSubscription> = {}): EventSubscription {
  return {
    id: `sub-${crypto.randomUUID().slice(0, 8)}`,
    subscriber: 'test-worker',
    eventPattern: '*',
    deliveryType: 'queue',
    deliveryTarget: 'test-queue',
    maxRetries: 3,
    retryDelayMs: 1000,
    enabled: true,
    ...overrides,
  };
}

// ── Construction ─────────────────────────────────────────────

describe('EventBus Construction', () => {
  it('creates with default config', () => {
    const bus = new EventBus();
    const stats = bus.getStats();
    expect(stats.config.batchSize).toBe(DEFAULT_EVENT_BUS_CONFIG.batchSize);
    expect(stats.config.persistEvents).toBe(true);
  });

  it('accepts partial config overrides', () => {
    const bus = new EventBus({ batchSize: 50, persistEvents: false });
    const stats = bus.getStats();
    expect(stats.config.batchSize).toBe(50);
    expect(stats.config.persistEvents).toBe(false);
    expect(stats.config.defaultMaxRetries).toBe(DEFAULT_EVENT_BUS_CONFIG.defaultMaxRetries);
  });
});

// ── Emit ─────────────────────────────────────────────────────

describe('EventBus.emit', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus({ persistEvents: true });
  });

  it('emits an event and persists to log', async () => {
    await bus.emit({
      tenantId: 't1',
      eventType: 'user.created',
      source: 'auth',
      data: { userId: 'u1' },
    });
    const log = bus.getEventLog();
    expect(log).toHaveLength(1);
    expect(log[0].eventType).toBe('user.created');
    expect(log[0].tenantId).toBe('t1');
    expect(log[0].data).toEqual({ userId: 'u1' });
  });

  it('generates unique event IDs', async () => {
    await bus.emit({ tenantId: 't1', eventType: 'a', source: 's', data: {} });
    await bus.emit({ tenantId: 't1', eventType: 'b', source: 's', data: {} });
    const log = bus.getEventLog();
    expect(log[0].id).not.toBe(log[1].id);
  });

  it('uses provided event ID when given', async () => {
    await bus.emit({ id: 'custom-id', tenantId: 't1', eventType: 'a', source: 's', data: {} });
    expect(bus.getEventLog()[0].id).toBe('custom-id');
  });

  it('populates metadata correctly', async () => {
    await bus.emit({
      tenantId: 't1',
      eventType: 'test',
      source: 'unit-test',
      data: {},
      traceId: 'trace-1',
      correlationId: 'corr-1',
      causationId: 'cause-1',
      version: '2.0',
    });
    const meta = bus.getEventLog()[0].metadata;
    expect(meta.traceId).toBe('trace-1');
    expect(meta.correlationId).toBe('corr-1');
    expect(meta.causationId).toBe('cause-1');
    expect(meta.version).toBe('2.0');
    expect(meta.timestamp).toBeTruthy();
  });

  it('rejects oversized payloads', async () => {
    const bus = new EventBus({ maxPayloadSize: 100 });
    await expect(
      bus.emit({
        tenantId: 't1',
        eventType: 'large',
        source: 's',
        data: { huge: 'x'.repeat(200) },
      }),
    ).rejects.toThrow(/exceeds max/);
  });

  it('does not persist when persistEvents is false', async () => {
    const bus = new EventBus({ persistEvents: false });
    await bus.emit({ tenantId: 't1', eventType: 'a', source: 's', data: {} });
    expect(bus.getEventLog()).toHaveLength(0);
  });

  it('buffers events and flushes at batchSize', async () => {
    const bus = new EventBus({ batchSize: 3 });
    await bus.emit({ tenantId: 't1', eventType: 'a', source: 's', data: {} });
    await bus.emit({ tenantId: 't1', eventType: 'b', source: 's', data: {} });
    expect(bus.getBufferSize()).toBe(2);
    await bus.emit({ tenantId: 't1', eventType: 'c', source: 's', data: {} });
    expect(bus.getBufferSize()).toBe(0); // flushed
  });
});

// ── Subscribe ────────────────────────────────────────────────

describe('EventBus.subscribe / unsubscribe', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('registers a subscription', () => {
    bus.subscribe(createSub({ id: 'sub-1', eventPattern: 'user.*' }));
    expect(bus.getSubscriptions()).toHaveLength(1);
  });

  it('unsubscribes by ID', () => {
    bus.subscribe(createSub({ id: 'sub-1' }));
    expect(bus.unsubscribe('sub-1')).toBe(true);
    expect(bus.getSubscriptions()).toHaveLength(0);
  });

  it('returns false for unsubscribing unknown ID', () => {
    expect(bus.unsubscribe('nonexistent')).toBe(false);
  });

  it('delivers to matching subscriptions', async () => {
    bus.subscribe(createSub({ id: 'sub-1', eventPattern: 'user.*' }));
    bus.subscribe(createSub({ id: 'sub-2', eventPattern: 'module.*' }));

    const results = await bus.emit({
      tenantId: 't1',
      eventType: 'user.created',
      source: 'auth',
      data: {},
    });

    expect(results).toHaveLength(1);
    expect(results[0].subscriptionId).toBe('sub-1');
    expect(results[0].status).toBe('delivered');
  });

  it('skips disabled subscriptions', async () => {
    bus.subscribe(createSub({ id: 'sub-1', eventPattern: 'user.*', enabled: false }));

    const results = await bus.emit({
      tenantId: 't1',
      eventType: 'user.created',
      source: 'auth',
      data: {},
    });

    expect(results).toHaveLength(0);
  });

  it('filters by tenant ID', async () => {
    bus.subscribe(createSub({ id: 'sub-1', eventPattern: '*', tenantId: 't1' }));
    bus.subscribe(createSub({ id: 'sub-2', eventPattern: '*', tenantId: 't2' }));

    const results = await bus.emit({
      tenantId: 't1',
      eventType: 'user.created',
      source: 'auth',
      data: {},
    });

    expect(results).toHaveLength(1);
    expect(results[0].subscriptionId).toBe('sub-1');
  });

  it('platform-wide subscriptions match all tenants', async () => {
    bus.subscribe(createSub({ id: 'sub-global', eventPattern: '*' })); // no tenantId

    const results = await bus.emit({
      tenantId: 't1',
      eventType: 'user.created',
      source: 'auth',
      data: {},
    });

    expect(results).toHaveLength(1);
  });
});

// ── Callbacks ────────────────────────────────────────────────

describe('EventBus.on / once', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus({ persistEvents: false });
  });

  it('delivers events to callbacks', async () => {
    const received: string[] = [];
    bus.on('user.created', async (event) => {
      received.push(event.eventType);
    });

    await bus.emit({ tenantId: 't1', eventType: 'user.created', source: 's', data: {} });
    expect(received).toEqual(['user.created']);
  });

  it('delivers to wildcard callback patterns', async () => {
    const received: string[] = [];
    bus.on('user.*', async (event) => {
      received.push(event.eventType);
    });

    await bus.emit({ tenantId: 't1', eventType: 'user.created', source: 's', data: {} });
    await bus.emit({ tenantId: 't1', eventType: 'user.deleted', source: 's', data: {} });
    await bus.emit({ tenantId: 't1', eventType: 'module.installed', source: 's', data: {} });

    expect(received).toEqual(['user.created', 'user.deleted']);
  });

  it('once callback fires only once', async () => {
    const received: string[] = [];
    bus.once('test.event', async (event) => {
      received.push(event.eventType);
    });

    await bus.emit({ tenantId: 't1', eventType: 'test.event', source: 's', data: {} });
    await bus.emit({ tenantId: 't1', eventType: 'test.event', source: 's', data: {} });

    expect(received).toEqual(['test.event']);
  });

  it('unsubscribe function removes callback', async () => {
    const received: string[] = [];
    const unsub = bus.on('test.event', async (event) => {
      received.push(event.eventType);
    });

    await bus.emit({ tenantId: 't1', eventType: 'test.event', source: 's', data: {} });
    unsub();
    await bus.emit({ tenantId: 't1', eventType: 'test.event', source: 's', data: {} });

    expect(received).toEqual(['test.event']);
  });

  it('handles callback errors gracefully', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('error.event', async () => {
      throw new Error('callback boom');
    });

    // Should not throw
    await bus.emit({ tenantId: 't1', eventType: 'error.event', source: 's', data: {} });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Pattern Matching ─────────────────────────────────────────

describe('Pattern Matching', () => {
  const bus = new EventBus();

  it('matches exact event types', () => {
    expect(bus.matchesPattern('user.created', 'user.created')).toBe(true);
  });

  it('does not match different event types', () => {
    expect(bus.matchesPattern('user.created', 'user.deleted')).toBe(false);
  });

  it('matches catch-all pattern *', () => {
    expect(bus.matchesPattern('*', 'anything.here')).toBe(true);
  });

  it('matches namespace wildcard user.*', () => {
    expect(bus.matchesPattern('user.*', 'user.created')).toBe(true);
    expect(bus.matchesPattern('user.*', 'user.deleted')).toBe(true);
    expect(bus.matchesPattern('user.*', 'module.installed')).toBe(false);
  });

  it('matches multi-level wildcard module.**', () => {
    expect(bus.matchesPattern('module.**', 'module.deploy.started')).toBe(true);
    expect(bus.matchesPattern('module.**', 'module.installed')).toBe(true);
    expect(bus.matchesPattern('module.**', 'user.created')).toBe(false);
  });

  it('does not partially match', () => {
    expect(bus.matchesPattern('user', 'user.created')).toBe(false);
  });
});

// ── Filtering ────────────────────────────────────────────────

describe('Event Filtering', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus({ persistEvents: false });
  });

  it('filters by source', async () => {
    bus.subscribe(createSub({
      id: 'sub-1',
      eventPattern: '*',
      filter: { sources: ['auth'] },
    }));

    const r1 = await bus.emit({ tenantId: 't1', eventType: 'user.created', source: 'auth', data: {} });
    expect(r1).toHaveLength(1);

    const r2 = await bus.emit({ tenantId: 't1', eventType: 'user.created', source: 'registry', data: {} });
    expect(r2).toHaveLength(0);
  });

  it('filters by subject', async () => {
    bus.subscribe(createSub({
      id: 'sub-1',
      eventPattern: '*',
      filter: { subjects: ['mod-123'] },
    }));

    const r1 = await bus.emit({ tenantId: 't1', eventType: 'module.installed', source: 's', subject: 'mod-123', data: {} });
    expect(r1).toHaveLength(1);

    const r2 = await bus.emit({ tenantId: 't1', eventType: 'module.installed', source: 's', subject: 'mod-456', data: {} });
    expect(r2).toHaveLength(0);
  });

  it('filters by data matches', async () => {
    bus.subscribe(createSub({
      id: 'sub-1',
      eventPattern: '*',
      filter: { dataMatches: { priority: 'high' } },
    }));

    const r1 = await bus.emit({ tenantId: 't1', eventType: 'alert', source: 's', data: { priority: 'high' } });
    expect(r1).toHaveLength(1);

    const r2 = await bus.emit({ tenantId: 't1', eventType: 'alert', source: 's', data: { priority: 'low' } });
    expect(r2).toHaveLength(0);
  });
});

// ── Query Methods ────────────────────────────────────────────

describe('Query Methods', () => {
  it('getEventsByType returns filtered events', async () => {
    const bus = new EventBus({ persistEvents: true });
    await bus.emit({ tenantId: 't1', eventType: 'user.created', source: 's', data: {} });
    await bus.emit({ tenantId: 't1', eventType: 'user.deleted', source: 's', data: {} });
    await bus.emit({ tenantId: 't1', eventType: 'module.installed', source: 's', data: {} });

    expect(bus.getEventsByType('user.created')).toHaveLength(1);
    expect(bus.getEventsByType('module.installed')).toHaveLength(1);
  });

  it('getEventsByTenant returns filtered events', async () => {
    const bus = new EventBus({ persistEvents: true });
    await bus.emit({ tenantId: 't1', eventType: 'a', source: 's', data: {} });
    await bus.emit({ tenantId: 't2', eventType: 'b', source: 's', data: {} });
    await bus.emit({ tenantId: 't1', eventType: 'c', source: 's', data: {} });

    expect(bus.getEventsByTenant('t1')).toHaveLength(2);
    expect(bus.getEventsByTenant('t2')).toHaveLength(1);
  });

  it('getMatchingSubscriptions returns correct subs', () => {
    const bus = new EventBus();
    bus.subscribe(createSub({ id: 's1', eventPattern: 'user.*' }));
    bus.subscribe(createSub({ id: 's2', eventPattern: 'module.*' }));
    bus.subscribe(createSub({ id: 's3', eventPattern: '*' }));

    const matches = bus.getMatchingSubscriptions('user.created');
    expect(matches).toHaveLength(2); // user.* and *
  });
});

// ── Flush & Clear ────────────────────────────────────────────

describe('Flush & Clear', () => {
  it('flush returns and clears buffer', async () => {
    const bus = new EventBus({ batchSize: 100 }); // high batch size to prevent auto-flush
    await bus.emit({ tenantId: 't1', eventType: 'a', source: 's', data: {} });
    await bus.emit({ tenantId: 't1', eventType: 'b', source: 's', data: {} });

    const flushed = await bus.flush();
    expect(flushed).toHaveLength(2);
    expect(bus.getBufferSize()).toBe(0);
  });

  it('clear resets everything', async () => {
    const bus = new EventBus();
    bus.subscribe(createSub({ id: 's1' }));
    bus.on('test', vi.fn());
    await bus.emit({ tenantId: 't1', eventType: 'a', source: 's', data: {} });

    bus.clear();
    const stats = bus.getStats();
    expect(stats.subscriptionCount).toBe(0);
    expect(stats.callbackPatternCount).toBe(0);
    expect(stats.bufferSize).toBe(0);
    expect(stats.eventLogSize).toBe(0);
  });
});

// ── Helpers ──────────────────────────────────────────────────

describe('Helper Functions', () => {
  it('createEventBuilder produces correct emit params', () => {
    const buildUserCreated = createEventBuilder('auth', 'user.created');
    const params = buildUserCreated('t1', { userId: 'u1' });
    expect(params.tenantId).toBe('t1');
    expect(params.eventType).toBe('user.created');
    expect(params.source).toBe('auth');
    expect(params.data).toEqual({ userId: 'u1' });
  });

  it('getEventCategory extracts namespace', () => {
    expect(getEventCategory('user.created')).toBe('user');
    expect(getEventCategory('module.deploy.started')).toBe('module');
    expect(getEventCategory('standalone')).toBe('standalone');
  });

  it('isPlatformEvent detects known event types', () => {
    expect(isPlatformEvent('user.created')).toBe(true);
    expect(isPlatformEvent('module.installed')).toBe(true);
    expect(isPlatformEvent('ai.request')).toBe(true);
    expect(isPlatformEvent('security.auth_failure')).toBe(true);
    expect(isPlatformEvent('custom.something')).toBe(false);
    expect(isPlatformEvent('random')).toBe(false);
  });
});

// ── EventBusError ────────────────────────────────────────────

describe('EventBusError', () => {
  it('has correct name and code', () => {
    const err = new EventBusError('TEST_ERROR', 'Test message');
    expect(err.name).toBe('EventBusError');
    expect(err.code).toBe('TEST_ERROR');
    expect(err.message).toBe('Test message');
    expect(err).toBeInstanceOf(Error);
  });
});