/**
 * @trancendos/observability — Core Implementation
 * 
 * Production-grade observability for the Trancendos platform:
 * - Structured JSON logging with level filtering
 * - Analytics Engine metrics (counters, gauges, histograms, timers)
 * - W3C Trace Context propagation
 * - Span management and timing
 * - Health check aggregation
 * - Request telemetry middleware
 */

import {
  LogLevel,
  LOG_LEVEL_NAMES,
  parseLogLevel,
  type LogEntry,
  type ErrorDetail,
  type TraceContext,
  type Span,
  SpanStatus,
  SpanKind,
  type SpanEvent,
  MetricType,
  type MetricPoint,
  type AnalyticsEngineDataset,
  type AnalyticsEngineDataPoint,
  HealthStatus,
  type HealthCheckResult,
  type PlatformHealthReport,
  type ObservabilityConfig,
  DEFAULT_OBSERVABILITY_CONFIG,
  type LogTransport,
  type MetricsTransport,
  type RequestTelemetry,
  toErrorDetail,
} from './types.js';

// Re-export everything from types
export * from './types.js';

// ─── ID Generation ─────────────────────────────────────────────────────────

/** Generate a 32-character hex trace ID (W3C compatible) */
export function generateTraceId(): string {
  return generateHexId(32);
}

/** Generate a 16-character hex span ID */
export function generateSpanId(): string {
  return generateHexId(16);
}

function generateHexId(length: number): string {
  const bytes = new Uint8Array(length / 2);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for test environments
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Console Transport ─────────────────────────────────────────────────────

export class ConsoleTransport implements LogTransport {
  name = 'console';

  write(entry: LogEntry): void {
    const output = JSON.stringify(entry);
    if (entry.level >= LogLevel.ERROR) {
      console.error(output);
    } else if (entry.level >= LogLevel.WARN) {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  async flush(): Promise<void> {
    // Console is synchronous, no-op
  }
}

// ─── Buffer Transport (for testing and batching) ───────────────────────────

export class BufferTransport implements LogTransport {
  name = 'buffer';
  readonly entries: LogEntry[] = [];

  write(entry: LogEntry): void {
    this.entries.push(entry);
  }

  async flush(): Promise<void> {
    // No-op — entries stay in buffer for inspection
  }

  clear(): void {
    this.entries.length = 0;
  }
}

// ─── Analytics Engine Metrics Transport ────────────────────────────────────

export class AnalyticsEngineTransport implements MetricsTransport {
  name = 'analytics-engine';
  private dataset: AnalyticsEngineDataset;
  private buffer: MetricPoint[] = [];
  private maxBufferSize: number;

  constructor(dataset: AnalyticsEngineDataset, maxBufferSize = 50) {
    this.dataset = dataset;
    this.maxBufferSize = maxBufferSize;
  }

  write(point: MetricPoint): void {
    this.buffer.push(point);

    // Write to Analytics Engine immediately
    const dataPoint = this.toDataPoint(point);
    this.dataset.writeDataPoint(dataPoint);

    // Auto-flush buffer when full
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.length = 0;
    }
  }

  async flush(): Promise<void> {
    this.buffer.length = 0;
  }

  getBuffer(): readonly MetricPoint[] {
    return this.buffer;
  }

  /**
   * Convert a MetricPoint to an Analytics Engine data point.
   * Layout:
   *   blobs[0] = metric name
   *   blobs[1] = metric type
   *   blobs[2..] = tag values (sorted by key)
   *   doubles[0] = metric value
   *   indexes[0] = metric name (for SQL queries)
   *   indexes[1..] = tag keys (sorted)
   */
  private toDataPoint(point: MetricPoint): AnalyticsEngineDataPoint {
    const sortedTagKeys = Object.keys(point.tags).sort();
    const tagValues = sortedTagKeys.map((k) => point.tags[k]);

    return {
      blobs: [point.name, point.type, ...tagValues],
      doubles: [point.value],
      indexes: [point.name, ...sortedTagKeys],
    };
  }
}

// ─── In-Memory Metrics Transport (for testing) ─────────────────────────────

export class InMemoryMetricsTransport implements MetricsTransport {
  name = 'in-memory';
  readonly points: MetricPoint[] = [];

  write(point: MetricPoint): void {
    this.points.push(point);
  }

  async flush(): Promise<void> {
    // No-op
  }

  clear(): void {
    this.points.length = 0;
  }
}

// ─── Logger ────────────────────────────────────────────────────────────────

export class Logger {
  private config: ObservabilityConfig;
  private transports: LogTransport[];
  private defaultContext: Partial<LogEntry>;

  constructor(
    config: Partial<ObservabilityConfig> = {},
    transports?: LogTransport[],
  ) {
    this.config = { ...DEFAULT_OBSERVABILITY_CONFIG, ...config };
    this.transports = transports || (this.config.enableConsole ? [new ConsoleTransport()] : []);
    this.defaultContext = {
      service: this.config.serviceName,
      environment: this.config.environment,
      version: this.config.version,
    };
  }

  /** Create a child logger with additional default context */
  child(context: Partial<LogEntry>): Logger {
    const child = new Logger(this.config, this.transports);
    child.defaultContext = { ...this.defaultContext, ...context };
    return child;
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    const errorDetail = error ? toErrorDetail(error) : undefined;
    this.log(LogLevel.ERROR, message, data, errorDetail);
  }

  fatal(message: string, error?: unknown, data?: Record<string, unknown>): void {
    const errorDetail = error ? toErrorDetail(error) : undefined;
    this.log(LogLevel.FATAL, message, data, errorDetail);
  }

  /** Log with explicit level */
  log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: ErrorDetail,
  ): void {
    if (level < this.config.logLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: LOG_LEVEL_NAMES[level] || 'UNKNOWN',
      message,
      service: this.defaultContext.service || this.config.serviceName,
      environment: this.defaultContext.environment || this.config.environment,
      version: this.defaultContext.version || this.config.version,
      ...(this.defaultContext.trace && { trace: this.defaultContext.trace }),
      ...(this.defaultContext.tenantId && { tenantId: this.defaultContext.tenantId }),
      ...(this.defaultContext.userId && { userId: this.defaultContext.userId }),
      ...(data && { data }),
      ...(error && { error }),
    };

    for (const transport of this.transports) {
      try {
        transport.write(entry);
      } catch {
        // Swallow transport errors — observability should never crash the app
      }
    }
  }

  /** Flush all transports */
  async flush(): Promise<void> {
    await Promise.allSettled(this.transports.map((t) => t.flush()));
  }

  /** Add a transport */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  /** Get current log level */
  getLevel(): LogLevel {
    return this.config.logLevel;
  }

  /** Set log level dynamically */
  setLevel(level: LogLevel): void {
    this.config.logLevel = level;
  }

  /** Get config (read-only copy) */
  getConfig(): Readonly<ObservabilityConfig> {
    return { ...this.config };
  }
}

// ─── Metrics Collector ─────────────────────────────────────────────────────

export class MetricsCollector {
  private config: ObservabilityConfig;
  private transports: MetricsTransport[];
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private defaultTags: Record<string, string>;

  constructor(
    config: Partial<ObservabilityConfig> = {},
    transports?: MetricsTransport[],
  ) {
    this.config = { ...DEFAULT_OBSERVABILITY_CONFIG, ...config };
    this.transports = transports || [];
    this.defaultTags = {
      service: this.config.serviceName,
      environment: this.config.environment,
      ...(this.config.defaultMetadata || {}),
    };
  }

  /** Increment a counter */
  increment(name: string, value = 1, tags: Record<string, string> = {}): void {
    const key = this.metricKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    this.emit({
      name,
      type: MetricType.COUNTER,
      value: current + value,
      tags: { ...this.defaultTags, ...tags },
      timestamp: new Date().toISOString(),
    });
  }

  /** Set a gauge value */
  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    const key = this.metricKey(name, tags);
    this.gauges.set(key, value);

    this.emit({
      name,
      type: MetricType.GAUGE,
      value,
      tags: { ...this.defaultTags, ...tags },
      timestamp: new Date().toISOString(),
    });
  }

  /** Record a histogram value */
  histogram(name: string, value: number, tags: Record<string, string> = {}): void {
    const key = this.metricKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);

    this.emit({
      name,
      type: MetricType.HISTOGRAM,
      value,
      tags: { ...this.defaultTags, ...tags },
      timestamp: new Date().toISOString(),
    });
  }

  /** Time an async operation and record as histogram + counter */
  async timer<T>(
    name: string,
    fn: () => Promise<T>,
    tags: Record<string, string> = {},
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - start;
      this.emit({
        name,
        type: MetricType.TIMER,
        value: durationMs,
        tags: { ...this.defaultTags, ...tags, status: 'success' },
        timestamp: new Date().toISOString(),
        unit: 'ms',
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      this.emit({
        name,
        type: MetricType.TIMER,
        value: durationMs,
        tags: { ...this.defaultTags, ...tags, status: 'error' },
        timestamp: new Date().toISOString(),
        unit: 'ms',
      });
      throw err;
    }
  }

  /** Get current counter value */
  getCounter(name: string, tags: Record<string, string> = {}): number {
    return this.counters.get(this.metricKey(name, tags)) || 0;
  }

  /** Get current gauge value */
  getGauge(name: string, tags: Record<string, string> = {}): number | undefined {
    return this.gauges.get(this.metricKey(name, tags));
  }

  /** Get histogram values */
  getHistogram(name: string, tags: Record<string, string> = {}): readonly number[] {
    return this.histograms.get(this.metricKey(name, tags)) || [];
  }

  /** Get histogram stats */
  getHistogramStats(name: string, tags: Record<string, string> = {}): HistogramStats | null {
    const values = this.histograms.get(this.metricKey(name, tags));
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / sorted.length,
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      sum,
    };
  }

  /** Add a metrics transport */
  addTransport(transport: MetricsTransport): void {
    this.transports.push(transport);
  }

  /** Flush all transports */
  async flush(): Promise<void> {
    await Promise.allSettled(this.transports.map((t) => t.flush()));
  }

  /** Reset all in-memory metrics */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private emit(point: MetricPoint): void {
    if (!this.config.enableMetrics) return;
    for (const transport of this.transports) {
      try {
        transport.write(point);
      } catch {
        // Swallow transport errors
      }
    }
  }

  private metricKey(name: string, tags: Record<string, string>): string {
    const sortedTags = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return sortedTags ? `${name}|${sortedTags}` : name;
  }
}

export interface HistogramStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  sum: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

// ─── Tracer ────────────────────────────────────────────────────────────────

export class Tracer {
  private config: ObservabilityConfig;
  private activeSpans: Map<string, Span> = new Map();
  private completedSpans: Span[] = [];
  private logger?: Logger;

  constructor(config: Partial<ObservabilityConfig> = {}, logger?: Logger) {
    this.config = { ...DEFAULT_OBSERVABILITY_CONFIG, ...config };
    this.logger = logger;
  }

  /** Start a new trace (root span) */
  startTrace(name: string, kind: SpanKind = SpanKind.SERVER): Span {
    const traceId = generateTraceId();
    const spanId = generateSpanId();

    // Check sampling
    if (!this.shouldSample()) {
      const span: Span = {
        name,
        trace: { traceId, spanId, traceFlags: 0 },
        startTime: new Date().toISOString(),
        status: SpanStatus.UNSET,
        kind,
        attributes: {},
        events: [],
      };
      return span;
    }

    const span: Span = {
      name,
      trace: { traceId, spanId, traceFlags: 1 },
      startTime: new Date().toISOString(),
      status: SpanStatus.UNSET,
      kind,
      attributes: {},
      events: [],
    };

    this.activeSpans.set(spanId, span);
    return span;
  }

  /** Start a child span within an existing trace */
  startSpan(
    name: string,
    parentTrace: TraceContext,
    kind: SpanKind = SpanKind.INTERNAL,
  ): Span {
    // Check sampling
    if (!this.shouldSample()) {
      // Return a no-op span that still has valid IDs
      const span: Span = {
        name,
        trace: {
          traceId: parentTrace.traceId,
          spanId: generateSpanId(),
          parentSpanId: parentTrace.spanId,
          traceFlags: 0, // Not sampled
          baggage: parentTrace.baggage,
        },
        startTime: new Date().toISOString(),
        status: SpanStatus.UNSET,
        kind,
        attributes: {},
        events: [],
      };
      return span;
    }

    const span: Span = {
      name,
      trace: {
        traceId: parentTrace.traceId,
        spanId: generateSpanId(),
        parentSpanId: parentTrace.spanId,
        traceFlags: 1,
        baggage: parentTrace.baggage ? { ...parentTrace.baggage } : undefined,
      },
      startTime: new Date().toISOString(),
      status: SpanStatus.UNSET,
      kind,
      attributes: {},
      events: [],
    };

    this.activeSpans.set(span.trace.spanId, span);
    return span;
  }

  /** End a span and record its duration */
  endSpan(span: Span, status: SpanStatus = SpanStatus.OK): void {
    span.endTime = new Date().toISOString();
    span.status = status;
    span.durationMs = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();

    this.activeSpans.delete(span.trace.spanId);

    if (span.trace.traceFlags === 1) {
      this.completedSpans.push(span);
    }

    if (this.logger && span.durationMs !== undefined) {
      this.logger.debug(`Span completed: ${span.name}`, {
        spanId: span.trace.spanId,
        traceId: span.trace.traceId,
        durationMs: span.durationMs,
        status: span.status,
      });
    }
  }

  /** Add an attribute to a span */
  setAttribute(span: Span, key: string, value: string | number | boolean): void {
    span.attributes[key] = value;
  }

  /** Add an event to a span */
  addEvent(span: Span, name: string, attributes?: Record<string, string | number | boolean>): void {
    span.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes,
    });
  }

  /** Extract trace context from incoming request headers (W3C traceparent) */
  extractFromHeaders(headers: Headers): TraceContext | null {
    const traceparent = headers.get('traceparent');
    if (!traceparent) return null;

    // W3C format: version-traceId-spanId-traceFlags
    const parts = traceparent.split('-');
    if (parts.length !== 4) return null;

    const [version, traceId, spanId, flags] = parts;
    if (version !== '00' || traceId.length !== 32 || spanId.length !== 16) return null;

    const traceFlags = parseInt(flags, 16);

    // Extract baggage header
    const baggageHeader = headers.get('baggage');
    const baggage = baggageHeader ? parseBaggage(baggageHeader) : undefined;

    return { traceId, spanId, traceFlags, baggage };
  }

  /** Inject trace context into outgoing request headers */
  injectIntoHeaders(trace: TraceContext, headers: Headers): void {
    const flags = (trace.traceFlags || 0).toString(16).padStart(2, '0');
    headers.set('traceparent', `00-${trace.traceId}-${trace.spanId}-${flags}`);

    if (trace.baggage && Object.keys(trace.baggage).length > 0) {
      headers.set('baggage', serializeBaggage(trace.baggage));
    }
  }

  /** Get all completed spans */
  getCompletedSpans(): readonly Span[] {
    return this.completedSpans;
  }

  /** Get active span count */
  getActiveSpanCount(): number {
    return this.activeSpans.size;
  }

  /** Clear completed spans */
  clearCompleted(): void {
    this.completedSpans.length = 0;
  }

  private shouldSample(): boolean {
    if (!this.config.enableTracing) return false;
    if (this.config.traceSampleRate >= 1.0) return true;
    if (this.config.traceSampleRate <= 0.0) return false;
    return Math.random() < this.config.traceSampleRate;
  }
}

// ─── Baggage Parsing (W3C Baggage) ─────────────────────────────────────────

function parseBaggage(header: string): Record<string, string> {
  const baggage: Record<string, string> = {};
  const items = header.split(',');
  for (const item of items) {
    const [key, ...valueParts] = item.trim().split('=');
    if (key && valueParts.length > 0) {
      baggage[key.trim()] = valueParts.join('=').trim();
    }
  }
  return baggage;
}

function serializeBaggage(baggage: Record<string, string>): string {
  return Object.entries(baggage)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}

// ─── Health Aggregator ─────────────────────────────────────────────────────

export class HealthAggregator {
  private checks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  private cachedResults: Map<string, HealthCheckResult> = new Map();
  private cacheTtlMs: number;
  private startTime: number;
  private version: string;
  private environment: string;

  constructor(
    version = '0.0.0',
    environment = 'development',
    cacheTtlMs = 30_000,
  ) {
    this.version = version;
    this.environment = environment;
    this.cacheTtlMs = cacheTtlMs;
    this.startTime = Date.now();
  }

  /** Register a health check function */
  register(name: string, check: () => Promise<HealthCheckResult>): void {
    this.checks.set(name, check);
  }

  /** Unregister a health check */
  unregister(name: string): void {
    this.checks.delete(name);
    this.cachedResults.delete(name);
  }

  /** Run all health checks and aggregate results */
  async check(): Promise<PlatformHealthReport> {
    const results: HealthCheckResult[] = [];

    for (const [name, checkFn] of this.checks) {
      try {
        const start = Date.now();
        const result = await checkFn();
        result.latencyMs = Date.now() - start;
        result.checkedAt = new Date().toISOString();
        results.push(result);
        this.cachedResults.set(name, result);
      } catch (err) {
        const result: HealthCheckResult = {
          name,
          status: HealthStatus.UNHEALTHY,
          message: err instanceof Error ? err.message : String(err),
          checkedAt: new Date().toISOString(),
        };
        results.push(result);
        this.cachedResults.set(name, result);
      }
    }

    // Overall status = worst status across all components
    const overallStatus = this.aggregateStatus(results);

    return {
      status: overallStatus,
      version: this.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      components: results,
      environment: this.environment,
    };
  }

  /** Get cached results without running checks */
  getCached(): PlatformHealthReport {
    const results = Array.from(this.cachedResults.values());
    const overallStatus = results.length > 0 ? this.aggregateStatus(results) : HealthStatus.UNKNOWN;

    return {
      status: overallStatus,
      version: this.version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      components: results,
      environment: this.environment,
    };
  }

  /** Get registered check names */
  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }

  /** Get uptime in seconds */
  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  private aggregateStatus(results: HealthCheckResult[]): HealthStatus {
    if (results.length === 0) return HealthStatus.UNKNOWN;

    const statusPriority: Record<HealthStatus, number> = {
      [HealthStatus.UNHEALTHY]: 3,
      [HealthStatus.DEGRADED]: 2,
      [HealthStatus.UNKNOWN]: 1,
      [HealthStatus.HEALTHY]: 0,
    };

    let worstStatus = HealthStatus.HEALTHY;
    let worstPriority = 0;

    for (const result of results) {
      const priority = statusPriority[result.status] ?? 0;
      if (priority > worstPriority) {
        worstPriority = priority;
        worstStatus = result.status;
      }
    }

    return worstStatus;
  }
}

// ─── Request Telemetry Helper ──────────────────────────────────────────────

export function createRequestTelemetry(request: Request): RequestTelemetry {
  const url = new URL(request.url);
  const cf = (request as Request & { cf?: Record<string, string> }).cf;

  return {
    method: request.method,
    url: url.pathname + url.search,
    clientIp: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
    cfRayId: request.headers.get('cf-ray') || undefined,
    cfColo: cf?.colo || undefined,
    country: request.headers.get('cf-ipcountry') || cf?.country || undefined,
    requestSize: request.headers.get('content-length')
      ? parseInt(request.headers.get('content-length')!, 10)
      : undefined,
  };
}

/**
 * Complete request telemetry after response is generated.
 */
export function completeRequestTelemetry(
  telemetry: RequestTelemetry,
  response: Response,
  startTime: number,
): RequestTelemetry {
  return {
    ...telemetry,
    statusCode: response.status,
    durationMs: Date.now() - startTime,
    responseSize: response.headers.get('content-length')
      ? parseInt(response.headers.get('content-length')!, 10)
      : undefined,
  };
}

// ─── Observability Factory ─────────────────────────────────────────────────

export interface Observability {
  logger: Logger;
  metrics: MetricsCollector;
  tracer: Tracer;
  health: HealthAggregator;
}

/**
 * Create a complete observability stack for a service.
 * This is the primary entry point for instrumenting any worker/package.
 */
export function createObservability(
  config: Partial<ObservabilityConfig> = {},
  analyticsDataset?: AnalyticsEngineDataset,
): Observability {
  const fullConfig = { ...DEFAULT_OBSERVABILITY_CONFIG, ...config };

  // Logger
  const logTransports: LogTransport[] = [];
  if (fullConfig.enableConsole) {
    logTransports.push(new ConsoleTransport());
  }
  const logger = new Logger(fullConfig, logTransports);

  // Metrics
  const metricsTransports: MetricsTransport[] = [];
  if (analyticsDataset && fullConfig.enableMetrics) {
    metricsTransports.push(new AnalyticsEngineTransport(analyticsDataset));
  }
  const metrics = new MetricsCollector(fullConfig, metricsTransports);

  // Tracer
  const tracer = new Tracer(fullConfig, logger);

  // Health
  const health = new HealthAggregator(
    fullConfig.version,
    fullConfig.environment,
  );

  return { logger, metrics, tracer, health };
}

// ─── Middleware Helper ─────────────────────────────────────────────────────

/**
 * Wrap a fetch handler with observability (logging, metrics, tracing).
 * Designed for use in Cloudflare Workers.
 */
export function withObservability(
  obs: Observability,
  handler: (request: Request, env: unknown, ctx: unknown) => Promise<Response>,
): (request: Request, env: unknown, ctx: unknown) => Promise<Response> {
  return async (request: Request, env: unknown, ctx: unknown): Promise<Response> => {
    const startTime = Date.now();
    const telemetry = createRequestTelemetry(request);

    // Extract or start trace
    const parentTrace = obs.tracer.extractFromHeaders(request.headers);
    const span = parentTrace
      ? obs.tracer.startSpan(`${request.method} ${telemetry.url}`, parentTrace, SpanKind.SERVER)
      : obs.tracer.startTrace(`${request.method} ${telemetry.url}`, SpanKind.SERVER);

    // Log request
    obs.logger.info(`→ ${request.method} ${telemetry.url}`, {
      ...telemetry,
      traceId: span.trace.traceId,
      spanId: span.trace.spanId,
    });

    try {
      const response = await handler(request, env, ctx);
      const completed = completeRequestTelemetry(telemetry, response, startTime);

      // Inject trace into response
      obs.tracer.injectIntoHeaders(span.trace, response.headers);

      // Log response
      obs.logger.info(`← ${completed.statusCode} ${telemetry.url}`, {
        ...completed,
        traceId: span.trace.traceId,
      });

      // Metrics
      obs.metrics.increment('http.requests.total', 1, {
        method: request.method,
        status: String(response.status),
        path: telemetry.url || '',
      });
      obs.metrics.histogram('http.request.duration_ms', completed.durationMs || 0, {
        method: request.method,
        path: telemetry.url || '',
      });

      // End span
      obs.tracer.endSpan(
        span,
        response.status >= 500 ? SpanStatus.ERROR : SpanStatus.OK,
      );

      return response;
    } catch (err) {
      const durationMs = Date.now() - startTime;

      obs.logger.error(`✗ ${request.method} ${telemetry.url}`, err, {
        durationMs,
        traceId: span.trace.traceId,
      });

      obs.metrics.increment('http.requests.total', 1, {
        method: request.method,
        status: '500',
        path: telemetry.url || '',
      });
      obs.metrics.increment('http.requests.errors', 1, {
        method: request.method,
        path: telemetry.url || '',
      });

      obs.tracer.endSpan(span, SpanStatus.ERROR);

      throw err;
    }
  };
}