/**
 * @trancendos/observability — Test Suite
 * 
 * Comprehensive tests for structured logging, metrics, tracing,
 * health aggregation, transports, and middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Logger
  Logger,
  BufferTransport,
  ConsoleTransport,
  // Metrics
  MetricsCollector,
  InMemoryMetricsTransport,
  AnalyticsEngineTransport,
  // Tracer
  Tracer,
  // Health
  HealthAggregator,
  // Factory
  createObservability,
  // Middleware
  withObservability,
  createRequestTelemetry,
  completeRequestTelemetry,
  // ID generators
  generateTraceId,
  generateSpanId,
  // Types & enums
  LogLevel,
  LOG_LEVEL_NAMES,
  parseLogLevel,
  SpanStatus,
  SpanKind,
  MetricType,
  HealthStatus,
  DEFAULT_OBSERVABILITY_CONFIG,
  toErrorDetail,
} from '../index.js';

// ─── ID Generation ─────────────────────────────────────────────────────────

describe('ID Generation', () => {
  it('should generate 32-char hex trace IDs', () => {
    const id = generateTraceId();
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate 16-char hex span IDs', () => {
    const id = generateSpanId();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateTraceId()));
    expect(ids.size).toBe(50);
  });
});

// ─── Log Level Parsing ─────────────────────────────────────────────────────

describe('Log Level Utilities', () => {
  it('should have names for all levels', () => {
    expect(LOG_LEVEL_NAMES[LogLevel.TRACE]).toBe('TRACE');
    expect(LOG_LEVEL_NAMES[LogLevel.DEBUG]).toBe('DEBUG');
    expect(LOG_LEVEL_NAMES[LogLevel.INFO]).toBe('INFO');
    expect(LOG_LEVEL_NAMES[LogLevel.WARN]).toBe('WARN');
    expect(LOG_LEVEL_NAMES[LogLevel.ERROR]).toBe('ERROR');
    expect(LOG_LEVEL_NAMES[LogLevel.FATAL]).toBe('FATAL');
  });

  it('should parse log level strings', () => {
    expect(parseLogLevel('info')).toBe(LogLevel.INFO);
    expect(parseLogLevel('ERROR')).toBe(LogLevel.ERROR);
    expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG);
  });

  it('should default to INFO for unknown levels', () => {
    expect(parseLogLevel('unknown')).toBe(LogLevel.INFO);
    expect(parseLogLevel('')).toBe(LogLevel.INFO);
  });
});

// ─── Error Detail ──────────────────────────────────────────────────────────

describe('toErrorDetail', () => {
  it('should convert Error instances', () => {
    const err = new Error('test error');
    err.name = 'TestError';
    const detail = toErrorDetail(err);
    expect(detail.name).toBe('TestError');
    expect(detail.message).toBe('test error');
    expect(detail.stack).toBeDefined();
  });

  it('should convert non-Error values', () => {
    const detail = toErrorDetail('string error');
    expect(detail.name).toBe('UnknownError');
    expect(detail.message).toBe('string error');
  });

  it('should capture error code if present', () => {
    const err = new Error('coded') as Error & { code: string };
    err.code = 'E_CUSTOM';
    const detail = toErrorDetail(err);
    expect(detail.code).toBe('E_CUSTOM');
  });

  it('should capture error cause', () => {
    const cause = new Error('root cause');
    const err = new Error('wrapper', { cause });
    const detail = toErrorDetail(err);
    expect(detail.cause).toContain('root cause');
  });
});

// ─── Buffer Transport ──────────────────────────────────────────────────────

describe('BufferTransport', () => {
  it('should store log entries', () => {
    const transport = new BufferTransport();
    expect(transport.name).toBe('buffer');
    transport.write({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'test',
      service: 'test-svc',
    });
    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0].message).toBe('test');
  });

  it('should clear entries', () => {
    const transport = new BufferTransport();
    transport.write({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'a',
      service: 'test',
    });
    transport.clear();
    expect(transport.entries).toHaveLength(0);
  });
});

// ─── Logger ────────────────────────────────────────────────────────────────

describe('Logger', () => {
  let buffer: BufferTransport;
  let logger: Logger;

  beforeEach(() => {
    buffer = new BufferTransport();
    logger = new Logger(
      { serviceName: 'test-service', logLevel: LogLevel.TRACE, enableConsole: false },
      [buffer],
    );
  });

  it('should log at all levels', () => {
    logger.trace('t');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e', new Error('err'));
    logger.fatal('f', new Error('fatal'));

    expect(buffer.entries).toHaveLength(6);
    expect(buffer.entries[0].levelName).toBe('TRACE');
    expect(buffer.entries[1].levelName).toBe('DEBUG');
    expect(buffer.entries[2].levelName).toBe('INFO');
    expect(buffer.entries[3].levelName).toBe('WARN');
    expect(buffer.entries[4].levelName).toBe('ERROR');
    expect(buffer.entries[5].levelName).toBe('FATAL');
  });

  it('should filter by log level', () => {
    logger.setLevel(LogLevel.WARN);
    logger.debug('ignored');
    logger.info('ignored');
    logger.warn('kept');
    logger.error('kept');

    expect(buffer.entries).toHaveLength(2);
    expect(buffer.entries[0].levelName).toBe('WARN');
    expect(buffer.entries[1].levelName).toBe('ERROR');
  });

  it('should include service metadata', () => {
    logger.info('hello');
    expect(buffer.entries[0].service).toBe('test-service');
  });

  it('should include structured data', () => {
    logger.info('with data', { userId: '123', action: 'login' });
    expect(buffer.entries[0].data).toEqual({ userId: '123', action: 'login' });
  });

  it('should include error details', () => {
    logger.error('failed', new Error('boom'));
    expect(buffer.entries[0].error).toBeDefined();
    expect(buffer.entries[0].error!.message).toBe('boom');
  });

  it('should create child loggers with inherited context', () => {
    const child = logger.child({ tenantId: 'tenant-1', userId: 'user-1' });
    child.info('child message');
    expect(buffer.entries[0].tenantId).toBe('tenant-1');
    expect(buffer.entries[0].userId).toBe('user-1');
  });

  it('should include trace context in child', () => {
    const child = logger.child({
      trace: { traceId: 'abc123', spanId: 'def456' },
    });
    child.info('traced');
    expect(buffer.entries[0].trace?.traceId).toBe('abc123');
  });

  it('should get and set log level', () => {
    expect(logger.getLevel()).toBe(LogLevel.TRACE);
    logger.setLevel(LogLevel.ERROR);
    expect(logger.getLevel()).toBe(LogLevel.ERROR);
  });

  it('should return config', () => {
    const config = logger.getConfig();
    expect(config.serviceName).toBe('test-service');
  });

  it('should handle transport errors gracefully', () => {
    const badTransport = {
      name: 'bad',
      write: () => { throw new Error('transport broken'); },
      flush: async () => {},
    };
    logger.addTransport(badTransport);
    // Should NOT throw
    expect(() => logger.info('test')).not.toThrow();
  });

  it('should flush all transports', async () => {
    const mockTransport = {
      name: 'mock',
      write: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    logger.addTransport(mockTransport);
    await logger.flush();
    expect(mockTransport.flush).toHaveBeenCalled();
  });
});

// ─── Console Transport ─────────────────────────────────────────────────────

describe('ConsoleTransport', () => {
  it('should route errors to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = new ConsoleTransport();
    transport.write({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      levelName: 'ERROR',
      message: 'err',
      service: 'test',
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should route warnings to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const transport = new ConsoleTransport();
    transport.write({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      levelName: 'WARN',
      message: 'warn',
      service: 'test',
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('should route info to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const transport = new ConsoleTransport();
    transport.write({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'info',
      service: 'test',
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ─── Metrics Collector ─────────────────────────────────────────────────────

describe('MetricsCollector', () => {
  let transport: InMemoryMetricsTransport;
  let metrics: MetricsCollector;

  beforeEach(() => {
    transport = new InMemoryMetricsTransport();
    metrics = new MetricsCollector(
      { serviceName: 'test-svc', enableMetrics: true },
      [transport],
    );
  });

  it('should increment counters', () => {
    metrics.increment('requests.total');
    metrics.increment('requests.total');
    metrics.increment('requests.total', 3);
    expect(metrics.getCounter('requests.total')).toBe(5);
    expect(transport.points).toHaveLength(3);
    expect(transport.points[0].type).toBe(MetricType.COUNTER);
  });

  it('should set gauge values', () => {
    metrics.gauge('connections.active', 42);
    expect(metrics.getGauge('connections.active')).toBe(42);
    metrics.gauge('connections.active', 10);
    expect(metrics.getGauge('connections.active')).toBe(10);
  });

  it('should record histogram values', () => {
    metrics.histogram('request.duration', 100);
    metrics.histogram('request.duration', 200);
    metrics.histogram('request.duration', 150);
    const values = metrics.getHistogram('request.duration');
    expect(values).toEqual([100, 200, 150]);
  });

  it('should compute histogram stats', () => {
    for (let i = 1; i <= 100; i++) {
      metrics.histogram('latency', i);
    }
    const stats = metrics.getHistogramStats('latency');
    expect(stats).not.toBeNull();
    expect(stats!.count).toBe(100);
    expect(stats!.min).toBe(1);
    expect(stats!.max).toBe(100);
    expect(stats!.mean).toBeCloseTo(50.5);
    expect(stats!.p50).toBeCloseTo(50.5, 0);
    expect(stats!.p99).toBeCloseTo(99.01, 0);
  });

  it('should return null stats for empty histogram', () => {
    expect(metrics.getHistogramStats('nonexistent')).toBeNull();
  });

  it('should support tags in counters', () => {
    metrics.increment('http.requests', 1, { method: 'GET' });
    metrics.increment('http.requests', 1, { method: 'POST' });
    metrics.increment('http.requests', 1, { method: 'GET' });
    expect(metrics.getCounter('http.requests', { method: 'GET' })).toBe(2);
    expect(metrics.getCounter('http.requests', { method: 'POST' })).toBe(1);
  });

  it('should time async operations', async () => {
    const result = await metrics.timer('db.query', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'data';
    });
    expect(result).toBe('data');
    expect(transport.points).toHaveLength(1);
    expect(transport.points[0].type).toBe(MetricType.TIMER);
    expect(transport.points[0].value).toBeGreaterThanOrEqual(5);
    expect(transport.points[0].tags.status).toBe('success');
  });

  it('should time failed operations', async () => {
    await expect(
      metrics.timer('db.query', async () => {
        throw new Error('timeout');
      }),
    ).rejects.toThrow('timeout');
    expect(transport.points[0].tags.status).toBe('error');
  });

  it('should include default tags', () => {
    metrics.increment('test');
    expect(transport.points[0].tags.service).toBe('test-svc');
  });

  it('should reset all metrics', () => {
    metrics.increment('a');
    metrics.gauge('b', 1);
    metrics.histogram('c', 1);
    metrics.reset();
    expect(metrics.getCounter('a')).toBe(0);
    expect(metrics.getGauge('b')).toBeUndefined();
    expect(metrics.getHistogram('c')).toEqual([]);
  });

  it('should handle transport errors gracefully', () => {
    const badTransport = {
      name: 'bad',
      write: () => { throw new Error('broken'); },
      flush: async () => {},
    };
    metrics.addTransport(badTransport);
    expect(() => metrics.increment('test')).not.toThrow();
  });
});

// ─── Analytics Engine Transport ────────────────────────────────────────────

describe('AnalyticsEngineTransport', () => {
  it('should write to Analytics Engine dataset', () => {
    const mockDataset = { writeDataPoint: vi.fn() };
    const transport = new AnalyticsEngineTransport(mockDataset);

    transport.write({
      name: 'http.requests',
      type: MetricType.COUNTER,
      value: 1,
      tags: { method: 'GET', status: '200' },
      timestamp: new Date().toISOString(),
    });

    expect(mockDataset.writeDataPoint).toHaveBeenCalledTimes(1);
    const call = mockDataset.writeDataPoint.mock.calls[0][0];
    expect(call.blobs[0]).toBe('http.requests');
    expect(call.blobs[1]).toBe('counter');
    expect(call.doubles[0]).toBe(1);
    expect(call.indexes[0]).toBe('http.requests');
  });

  it('should sort tags alphabetically', () => {
    const mockDataset = { writeDataPoint: vi.fn() };
    const transport = new AnalyticsEngineTransport(mockDataset);

    transport.write({
      name: 'test',
      type: MetricType.GAUGE,
      value: 42,
      tags: { zebra: 'z', alpha: 'a', middle: 'm' },
      timestamp: new Date().toISOString(),
    });

    const call = mockDataset.writeDataPoint.mock.calls[0][0];
    // Tags sorted: alpha, middle, zebra
    expect(call.blobs.slice(2)).toEqual(['a', 'm', 'z']);
    expect(call.indexes.slice(1)).toEqual(['alpha', 'middle', 'zebra']);
  });
});

// ─── Tracer ────────────────────────────────────────────────────────────────

describe('Tracer', () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer({ enableTracing: true, traceSampleRate: 1.0 });
  });

  it('should start a new trace', () => {
    const span = tracer.startTrace('GET /api');
    expect(span.name).toBe('GET /api');
    expect(span.trace.traceId).toHaveLength(32);
    expect(span.trace.spanId).toHaveLength(16);
    expect(span.trace.parentSpanId).toBeUndefined();
    expect(span.kind).toBe(SpanKind.SERVER);
    expect(span.status).toBe(SpanStatus.UNSET);
  });

  it('should start a child span', () => {
    const root = tracer.startTrace('root');
    const child = tracer.startSpan('child-op', root.trace, SpanKind.CLIENT);

    expect(child.trace.traceId).toBe(root.trace.traceId);
    expect(child.trace.parentSpanId).toBe(root.trace.spanId);
    expect(child.trace.spanId).not.toBe(root.trace.spanId);
    expect(child.kind).toBe(SpanKind.CLIENT);
  });

  it('should end a span with duration', () => {
    const span = tracer.startTrace('timed');
    // Simulate some work
    tracer.endSpan(span, SpanStatus.OK);

    expect(span.endTime).toBeDefined();
    expect(span.durationMs).toBeDefined();
    expect(span.durationMs).toBeGreaterThanOrEqual(0);
    expect(span.status).toBe(SpanStatus.OK);
  });

  it('should track active and completed spans', () => {
    const span1 = tracer.startTrace('s1');
    const span2 = tracer.startSpan('s2', span1.trace);

    expect(tracer.getActiveSpanCount()).toBe(2);

    tracer.endSpan(span1);
    expect(tracer.getActiveSpanCount()).toBe(1);
    expect(tracer.getCompletedSpans()).toHaveLength(1);

    tracer.endSpan(span2);
    expect(tracer.getActiveSpanCount()).toBe(0);
    expect(tracer.getCompletedSpans()).toHaveLength(2);
  });

  it('should set span attributes', () => {
    const span = tracer.startTrace('test');
    tracer.setAttribute(span, 'http.method', 'GET');
    tracer.setAttribute(span, 'http.status_code', 200);
    tracer.setAttribute(span, 'cache.hit', true);

    expect(span.attributes['http.method']).toBe('GET');
    expect(span.attributes['http.status_code']).toBe(200);
    expect(span.attributes['cache.hit']).toBe(true);
  });

  it('should add span events', () => {
    const span = tracer.startTrace('test');
    tracer.addEvent(span, 'cache.miss', { key: 'user:123' });
    tracer.addEvent(span, 'db.query');

    expect(span.events).toHaveLength(2);
    expect(span.events[0].name).toBe('cache.miss');
    expect(span.events[0].attributes?.key).toBe('user:123');
    expect(span.events[0].timestamp).toBeDefined();
  });

  it('should extract W3C traceparent from headers', () => {
    const headers = new Headers();
    headers.set('traceparent', '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');

    const trace = tracer.extractFromHeaders(headers);
    expect(trace).not.toBeNull();
    expect(trace!.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(trace!.spanId).toBe('b7ad6b7169203331');
    expect(trace!.traceFlags).toBe(1);
  });

  it('should return null for missing traceparent', () => {
    const headers = new Headers();
    expect(tracer.extractFromHeaders(headers)).toBeNull();
  });

  it('should return null for invalid traceparent', () => {
    const headers = new Headers();
    headers.set('traceparent', 'invalid');
    expect(tracer.extractFromHeaders(headers)).toBeNull();
  });

  it('should return null for wrong version traceparent', () => {
    const headers = new Headers();
    headers.set('traceparent', '01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    expect(tracer.extractFromHeaders(headers)).toBeNull();
  });

  it('should inject traceparent into headers', () => {
    const headers = new Headers();
    tracer.injectIntoHeaders(
      { traceId: 'aaaa1111bbbb2222cccc3333dddd4444', spanId: 'eeee5555ffff6666', traceFlags: 1 },
      headers,
    );

    expect(headers.get('traceparent')).toBe('00-aaaa1111bbbb2222cccc3333dddd4444-eeee5555ffff6666-01');
  });

  it('should propagate baggage', () => {
    const headers = new Headers();
    headers.set('traceparent', '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    headers.set('baggage', 'userId=123, tenantId=abc');

    const trace = tracer.extractFromHeaders(headers);
    expect(trace!.baggage).toEqual({ userId: '123', tenantId: 'abc' });

    // Inject back
    const outHeaders = new Headers();
    tracer.injectIntoHeaders(trace!, outHeaders);
    expect(outHeaders.get('baggage')).toContain('userId=123');
    expect(outHeaders.get('baggage')).toContain('tenantId=abc');
  });

  it('should respect sample rate of 0', () => {
    const noSampleTracer = new Tracer({ enableTracing: true, traceSampleRate: 0 });
    const span = noSampleTracer.startTrace('sampled-out');
    // Span is created but with traceFlags=0
    expect(span.trace.traceFlags).toBe(0);
    noSampleTracer.endSpan(span);
    // Not added to completed spans (not sampled)
    expect(noSampleTracer.getCompletedSpans()).toHaveLength(0);
  });

  it('should not trace when tracing disabled', () => {
    const disabledTracer = new Tracer({ enableTracing: false });
    const span = disabledTracer.startTrace('disabled');
    expect(span.trace.traceFlags).toBe(0);
  });

  it('should clear completed spans', () => {
    const span = tracer.startTrace('test');
    tracer.endSpan(span);
    expect(tracer.getCompletedSpans()).toHaveLength(1);
    tracer.clearCompleted();
    expect(tracer.getCompletedSpans()).toHaveLength(0);
  });

  it('should propagate baggage to child spans', () => {
    const root = tracer.startTrace('root');
    root.trace.baggage = { tenantId: 'tenant-1' };
    const child = tracer.startSpan('child', root.trace);
    expect(child.trace.baggage?.tenantId).toBe('tenant-1');
  });
});

// ─── Health Aggregator ─────────────────────────────────────────────────────

describe('HealthAggregator', () => {
  let health: HealthAggregator;

  beforeEach(() => {
    health = new HealthAggregator('1.0.0', 'test');
  });

  it('should report unknown with no checks', async () => {
    const report = await health.check();
    expect(report.status).toBe(HealthStatus.UNKNOWN);
    expect(report.components).toHaveLength(0);
    expect(report.version).toBe('1.0.0');
    expect(report.environment).toBe('test');
  });

  it('should report healthy when all checks pass', async () => {
    health.register('db', async () => ({
      name: 'db',
      status: HealthStatus.HEALTHY,
      checkedAt: new Date().toISOString(),
    }));
    health.register('cache', async () => ({
      name: 'cache',
      status: HealthStatus.HEALTHY,
      checkedAt: new Date().toISOString(),
    }));

    const report = await health.check();
    expect(report.status).toBe(HealthStatus.HEALTHY);
    expect(report.components).toHaveLength(2);
  });

  it('should report degraded when any check is degraded', async () => {
    health.register('db', async () => ({
      name: 'db',
      status: HealthStatus.HEALTHY,
      checkedAt: new Date().toISOString(),
    }));
    health.register('cache', async () => ({
      name: 'cache',
      status: HealthStatus.DEGRADED,
      message: 'High latency',
      checkedAt: new Date().toISOString(),
    }));

    const report = await health.check();
    expect(report.status).toBe(HealthStatus.DEGRADED);
  });

  it('should report unhealthy when any check is unhealthy', async () => {
    health.register('db', async () => ({
      name: 'db',
      status: HealthStatus.UNHEALTHY,
      message: 'Connection refused',
      checkedAt: new Date().toISOString(),
    }));
    health.register('cache', async () => ({
      name: 'cache',
      status: HealthStatus.HEALTHY,
      checkedAt: new Date().toISOString(),
    }));

    const report = await health.check();
    expect(report.status).toBe(HealthStatus.UNHEALTHY);
  });

  it('should handle check errors as unhealthy', async () => {
    health.register('broken', async () => {
      throw new Error('connection timeout');
    });

    const report = await health.check();
    expect(report.status).toBe(HealthStatus.UNHEALTHY);
    expect(report.components[0].message).toBe('connection timeout');
  });

  it('should cache check results', async () => {
    health.register('db', async () => ({
      name: 'db',
      status: HealthStatus.HEALTHY,
      checkedAt: new Date().toISOString(),
    }));

    await health.check();
    const cached = health.getCached();
    expect(cached.status).toBe(HealthStatus.HEALTHY);
    expect(cached.components).toHaveLength(1);
  });

  it('should unregister checks', async () => {
    health.register('db', async () => ({
      name: 'db',
      status: HealthStatus.HEALTHY,
      checkedAt: new Date().toISOString(),
    }));
    health.unregister('db');

    const report = await health.check();
    expect(report.components).toHaveLength(0);
  });

  it('should list registered checks', () => {
    health.register('db', async () => ({
      name: 'db',
      status: HealthStatus.HEALTHY,
      checkedAt: new Date().toISOString(),
    }));
    health.register('cache', async () => ({
      name: 'cache',
      status: HealthStatus.HEALTHY,
      checkedAt: new Date().toISOString(),
    }));
    expect(health.getRegisteredChecks()).toEqual(['db', 'cache']);
  });

  it('should track uptime', () => {
    expect(health.getUptimeSeconds()).toBeGreaterThanOrEqual(0);
  });

  it('should include latency in check results', async () => {
    health.register('slow', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return {
        name: 'slow',
        status: HealthStatus.HEALTHY,
        checkedAt: new Date().toISOString(),
      };
    });

    const report = await health.check();
    expect(report.components[0].latencyMs).toBeGreaterThanOrEqual(5);
  });

  it('should include uptime in report', async () => {
    const report = await health.check();
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(report.timestamp).toBeDefined();
  });
});

// ─── createObservability Factory ───────────────────────────────────────────

describe('createObservability', () => {
  it('should create a complete observability stack', () => {
    const obs = createObservability({
      serviceName: 'my-worker',
      environment: 'production',
      version: '2.0.0',
      enableConsole: false,
    });

    expect(obs.logger).toBeInstanceOf(Logger);
    expect(obs.metrics).toBeInstanceOf(MetricsCollector);
    expect(obs.tracer).toBeInstanceOf(Tracer);
    expect(obs.health).toBeInstanceOf(HealthAggregator);
  });

  it('should use defaults when no config provided', () => {
    const obs = createObservability({ enableConsole: false });
    const config = obs.logger.getConfig();
    expect(config.serviceName).toBe('unknown');
    expect(config.logLevel).toBe(LogLevel.INFO);
  });

  it('should wire analytics engine transport when dataset provided', () => {
    const mockDataset = { writeDataPoint: vi.fn() };
    const obs = createObservability(
      { serviceName: 'test', enableConsole: false },
      mockDataset,
    );
    obs.metrics.increment('test.metric');
    expect(mockDataset.writeDataPoint).toHaveBeenCalled();
  });
});

// ─── Request Telemetry Helpers ─────────────────────────────────────────────

describe('Request Telemetry', () => {
  it('should extract telemetry from request', () => {
    const request = new Request('https://example.com/api/users?page=1', {
      method: 'GET',
      headers: {
        'user-agent': 'test-agent',
        'cf-connecting-ip': '1.2.3.4',
        'cf-ray': 'abc123',
        'cf-ipcountry': 'GB',
      },
    });

    const telemetry = createRequestTelemetry(request);
    expect(telemetry.method).toBe('GET');
    expect(telemetry.url).toBe('/api/users?page=1');
    expect(telemetry.clientIp).toBe('1.2.3.4');
    expect(telemetry.userAgent).toBe('test-agent');
    expect(telemetry.cfRayId).toBe('abc123');
    expect(telemetry.country).toBe('GB');
  });

  it('should complete telemetry with response data', () => {
    const request = new Request('https://example.com/api', { method: 'POST' });
    const telemetry = createRequestTelemetry(request);
    const response = new Response('ok', { status: 201 });
    const startTime = Date.now() - 50;

    const completed = completeRequestTelemetry(telemetry, response, startTime);
    expect(completed.statusCode).toBe(201);
    expect(completed.durationMs).toBeGreaterThanOrEqual(40);
  });
});

// ─── withObservability Middleware ───────────────────────────────────────────

describe('withObservability Middleware', () => {
  it('should wrap handler with logging and metrics', async () => {
    const buffer = new BufferTransport();
    const metricsTransport = new InMemoryMetricsTransport();
    const obs = createObservability({ serviceName: 'test', enableConsole: false });
    obs.logger.addTransport(buffer);
    obs.metrics.addTransport(metricsTransport);

    const handler = async (req: Request) => new Response('ok', { status: 200 });
    const wrapped = withObservability(obs, handler);

    const request = new Request('https://example.com/api/test', { method: 'GET' });
    const response = await wrapped(request, {}, {});

    expect(response.status).toBe(200);
    // Should have request + response logs
    expect(buffer.entries.length).toBeGreaterThanOrEqual(2);
    // Should have metrics
    expect(metricsTransport.points.length).toBeGreaterThanOrEqual(1);
  });

  it('should propagate trace context', async () => {
    const obs = createObservability({ serviceName: 'test', enableConsole: false });
    const handler = async () => new Response('ok');
    const wrapped = withObservability(obs, handler);

    const request = new Request('https://example.com/api', {
      method: 'GET',
      headers: {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      },
    });

    const response = await wrapped(request, {}, {});
    // Response should have traceparent header
    expect(response.headers.get('traceparent')).toBeDefined();
  });

  it('should handle errors and record error metrics', async () => {
    const metricsTransport = new InMemoryMetricsTransport();
    const obs = createObservability({ serviceName: 'test', enableConsole: false });
    obs.metrics.addTransport(metricsTransport);

    const handler = async () => { throw new Error('handler crash'); };
    const wrapped = withObservability(obs, handler);

    const request = new Request('https://example.com/api', { method: 'GET' });
    await expect(wrapped(request, {}, {})).rejects.toThrow('handler crash');

    // Should have error metrics
    const errorMetrics = metricsTransport.points.filter((p) => p.name === 'http.requests.errors');
    expect(errorMetrics.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Default Config ────────────────────────────────────────────────────────

describe('DEFAULT_OBSERVABILITY_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_OBSERVABILITY_CONFIG.serviceName).toBe('unknown');
    expect(DEFAULT_OBSERVABILITY_CONFIG.environment).toBe('development');
    expect(DEFAULT_OBSERVABILITY_CONFIG.logLevel).toBe(LogLevel.INFO);
    expect(DEFAULT_OBSERVABILITY_CONFIG.enableJsonLogs).toBe(true);
    expect(DEFAULT_OBSERVABILITY_CONFIG.enableMetrics).toBe(true);
    expect(DEFAULT_OBSERVABILITY_CONFIG.enableTracing).toBe(true);
    expect(DEFAULT_OBSERVABILITY_CONFIG.enableConsole).toBe(true);
    expect(DEFAULT_OBSERVABILITY_CONFIG.traceSampleRate).toBe(1.0);
    expect(DEFAULT_OBSERVABILITY_CONFIG.maxBufferSize).toBe(100);
  });
});