/**
 * @trancendos/observability — Type Definitions
 * 
 * Structured logging, Analytics Engine metrics, distributed trace propagation,
 * and health check aggregation for the Trancendos platform.
 */

// ─── Log Levels ────────────────────────────────────────────────────────────

export enum LogLevel {
  TRACE = 0,
  DEBUG = 10,
  INFO = 20,
  WARN = 30,
  ERROR = 40,
  FATAL = 50,
  SILENT = 100,
}

export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.TRACE]: 'TRACE',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
  [LogLevel.SILENT]: 'SILENT',
};

export function parseLogLevel(level: string): LogLevel {
  const upper = level.toUpperCase();
  const entry = Object.entries(LOG_LEVEL_NAMES).find(([, name]) => name === upper);
  return entry ? (Number(entry[0]) as LogLevel) : LogLevel.INFO;
}

// ─── Structured Log Entry ──────────────────────────────────────────────────

export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Numeric log level */
  level: LogLevel;
  /** Human-readable level name */
  levelName: string;
  /** Log message */
  message: string;
  /** Service/worker name */
  service: string;
  /** Distributed trace context */
  trace?: TraceContext;
  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
  /** User ID for audit trail */
  userId?: string;
  /** Structured key-value data */
  data?: Record<string, unknown>;
  /** Error details if applicable */
  error?: ErrorDetail;
  /** Duration in milliseconds (for timed operations) */
  durationMs?: number;
  /** Environment tag */
  environment?: string;
  /** Worker/package version */
  version?: string;
}

export interface ErrorDetail {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: string;
}

// ─── Trace Context (W3C Trace Context compatible) ──────────────────────────

export interface TraceContext {
  /** Unique trace ID (32 hex chars, W3C compatible) */
  traceId: string;
  /** Unique span ID (16 hex chars) */
  spanId: string;
  /** Parent span ID for tree construction */
  parentSpanId?: string;
  /** Trace flags (sampled, etc.) */
  traceFlags?: number;
  /** Baggage items propagated across services */
  baggage?: Record<string, string>;
}

export interface Span {
  /** Span name/operation */
  name: string;
  /** Trace context for this span */
  trace: TraceContext;
  /** Start time (ISO 8601) */
  startTime: string;
  /** End time (ISO 8601) — undefined if still active */
  endTime?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Span status */
  status: SpanStatus;
  /** Span kind */
  kind: SpanKind;
  /** Attributes/tags */
  attributes: Record<string, string | number | boolean>;
  /** Events recorded during the span */
  events: SpanEvent[];
}

export enum SpanStatus {
  UNSET = 'UNSET',
  OK = 'OK',
  ERROR = 'ERROR',
}

export enum SpanKind {
  INTERNAL = 'INTERNAL',
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  PRODUCER = 'PRODUCER',
  CONSUMER = 'CONSUMER',
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: Record<string, string | number | boolean>;
}

// ─── Metrics (Analytics Engine compatible) ──────────────────────────────────

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer',
}

export interface MetricPoint {
  /** Metric name (dot-delimited namespace) */
  name: string;
  /** Metric type */
  type: MetricType;
  /** Numeric value */
  value: number;
  /** Metric tags/labels */
  tags: Record<string, string>;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Unit of measurement */
  unit?: string;
}

/**
 * Analytics Engine data point format.
 * Cloudflare Analytics Engine supports:
 * - 1 "blob" field (index1-20 for strings)
 * - Up to 20 double fields (double1-20)
 */
export interface AnalyticsEngineDataPoint {
  /** Blobs: up to 20 string fields for indexing */
  blobs?: string[];
  /** Doubles: up to 20 numeric fields */
  doubles?: number[];
  /** Indexes: up to 20 string fields for filtering */
  indexes?: string[];
}

/**
 * Analytics Engine dataset binding interface
 * (matches Cloudflare Workers runtime)
 */
export interface AnalyticsEngineDataset {
  writeDataPoint(data: AnalyticsEngineDataPoint): void;
}

// ─── Health Check Types ────────────────────────────────────────────────────

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

export interface HealthCheckResult {
  /** Service/component name */
  name: string;
  /** Current health status */
  status: HealthStatus;
  /** Human-readable message */
  message?: string;
  /** Response latency in milliseconds */
  latencyMs?: number;
  /** ISO 8601 timestamp of check */
  checkedAt: string;
  /** Additional health details */
  details?: Record<string, unknown>;
}

export interface PlatformHealthReport {
  /** Overall platform status (worst of all components) */
  status: HealthStatus;
  /** Platform version */
  version: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Individual component health checks */
  components: HealthCheckResult[];
  /** Environment */
  environment: string;
}

// ─── Configuration ─────────────────────────────────────────────────────────

export interface ObservabilityConfig {
  /** Service/worker name */
  serviceName: string;
  /** Environment (production, staging, development) */
  environment: string;
  /** Minimum log level to emit */
  logLevel: LogLevel;
  /** Service version string */
  version: string;
  /** Enable structured JSON logging */
  enableJsonLogs: boolean;
  /** Enable metrics collection */
  enableMetrics: boolean;
  /** Enable trace propagation */
  enableTracing: boolean;
  /** Enable console output (disable in production for perf) */
  enableConsole: boolean;
  /** Sample rate for traces (0.0 - 1.0) */
  traceSampleRate: number;
  /** Maximum log buffer size before flush */
  maxBufferSize: number;
  /** Custom metadata added to every log entry */
  defaultMetadata?: Record<string, string>;
}

export const DEFAULT_OBSERVABILITY_CONFIG: ObservabilityConfig = {
  serviceName: 'unknown',
  environment: 'development',
  logLevel: LogLevel.INFO,
  version: '0.0.0',
  enableJsonLogs: true,
  enableMetrics: true,
  enableTracing: true,
  enableConsole: true,
  traceSampleRate: 1.0,
  maxBufferSize: 100,
};

// ─── Transport Interface ───────────────────────────────────────────────────

export interface LogTransport {
  /** Transport name */
  name: string;
  /** Write a log entry */
  write(entry: LogEntry): void;
  /** Flush buffered entries */
  flush(): Promise<void>;
}

export interface MetricsTransport {
  /** Transport name */
  name: string;
  /** Write a metric data point */
  write(point: MetricPoint): void;
  /** Flush buffered metrics */
  flush(): Promise<void>;
}

// ─── Request Context ───────────────────────────────────────────────────────

export interface RequestTelemetry {
  /** HTTP method */
  method: string;
  /** Request URL/path */
  url: string;
  /** Response status code */
  statusCode?: number;
  /** Request duration in ms */
  durationMs?: number;
  /** Request content length */
  requestSize?: number;
  /** Response content length */
  responseSize?: number;
  /** Client IP (if available) */
  clientIp?: string;
  /** User agent */
  userAgent?: string;
  /** Cloudflare ray ID */
  cfRayId?: string;
  /** Cloudflare colo */
  cfColo?: string;
  /** Country code */
  country?: string;
}

// ─── Error Helpers ─────────────────────────────────────────────────────────

export function toErrorDetail(err: unknown): ErrorDetail {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: (err as Error & { code?: string }).code,
      cause: err.cause ? String(err.cause) : undefined,
    };
  }
  return {
    name: 'UnknownError',
    message: String(err),
  };
}