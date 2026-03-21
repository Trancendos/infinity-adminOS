/**
 * @trancendos/ipc — Inter-Process Communication
 * ===============================================
 * Typed message passing between workers via service bindings.
 * Provides request/response patterns, fire-and-forget messaging,
 * and broadcast capabilities for the Trancendos platform.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface IPCMessage<T = unknown> {
  /** Unique message ID */
  id: string;
  /** Message type/action */
  type: string;
  /** Source service name */
  source: string;
  /** Target service name */
  target: string;
  /** Message payload */
  payload: T;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Tenant ID for multi-tenant isolation */
  tenantId?: string;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** TTL in milliseconds (0 = no expiry) */
  ttl?: number;
  /** Reply-to channel for request/response pattern */
  replyTo?: string;
}

export interface IPCResponse<T = unknown> {
  /** Original message ID */
  messageId: string;
  /** Whether the call succeeded */
  success: boolean;
  /** Response data (if success) */
  data?: T;
  /** Error info (if failed) */
  error?: IPCError;
  /** Response latency in ms */
  latencyMs: number;
}

export interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}

export type MessageHandler<TReq = unknown, TRes = unknown> = (
  message: IPCMessage<TReq>,
) => Promise<TRes>;

export interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

export interface IPCClientConfig {
  /** This service's name */
  serviceName: string;
  /** Default timeout for requests (ms) */
  defaultTimeoutMs: number;
  /** Default tenant ID */
  defaultTenantId?: string;
  /** Enable message logging */
  enableLogging: boolean;
}

export const DEFAULT_IPC_CONFIG: IPCClientConfig = {
  serviceName: 'unknown',
  defaultTimeoutMs: 10_000,
  enableLogging: false,
};

// ── ID Generation ──────────────────────────────────────────────────────────

export function generateMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── IPC Client ─────────────────────────────────────────────────────────────

export class IPCClient {
  private config: IPCClientConfig;
  private bindings: Map<string, ServiceBinding> = new Map();
  private handlers: Map<string, MessageHandler> = new Map();
  private messageLog: IPCMessage[] = [];
  private stats = { sent: 0, received: 0, errors: 0, timeouts: 0 };

  constructor(config: Partial<IPCClientConfig> = {}) {
    this.config = { ...DEFAULT_IPC_CONFIG, ...config };
  }

  /** Register a service binding for outbound communication */
  registerBinding(serviceName: string, binding: ServiceBinding): void {
    this.bindings.set(serviceName, binding);
  }

  /** Unregister a service binding */
  unregisterBinding(serviceName: string): void {
    this.bindings.delete(serviceName);
  }

  /** Register a handler for incoming message types */
  registerHandler<TReq = unknown, TRes = unknown>(
    messageType: string,
    handler: MessageHandler<TReq, TRes>,
  ): void {
    this.handlers.set(messageType, handler as MessageHandler);
  }

  /** Unregister a message handler */
  unregisterHandler(messageType: string): void {
    this.handlers.delete(messageType);
  }

  /**
   * Send a request to another service and wait for a response.
   * Uses service bindings for zero-latency in-datacenter communication.
   */
  async request<TReq = unknown, TRes = unknown>(
    target: string,
    type: string,
    payload: TReq,
    options: Partial<{ timeoutMs: number; tenantId: string; traceId: string }> = {},
  ): Promise<IPCResponse<TRes>> {
    const binding = this.bindings.get(target);
    if (!binding) {
      this.stats.errors++;
      return {
        messageId: generateMessageId(),
        success: false,
        error: { code: 'NO_BINDING', message: `No binding registered for service: ${target}` },
        latencyMs: 0,
      };
    }

    const message: IPCMessage<TReq> = {
      id: generateMessageId(),
      type,
      source: this.config.serviceName,
      target,
      payload,
      traceId: options.traceId,
      tenantId: options.tenantId || this.config.defaultTenantId,
      timestamp: new Date().toISOString(),
      ttl: options.timeoutMs || this.config.defaultTimeoutMs,
    };

    if (this.config.enableLogging) {
      this.messageLog.push(message);
    }

    const startTime = Date.now();
    this.stats.sent++;

    try {
      const timeoutMs = options.timeoutMs || this.config.defaultTimeoutMs;

      const response = await Promise.race([
        binding.fetch(
          new Request('https://ipc.internal/__ipc', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-IPC-Source': this.config.serviceName,
              'X-IPC-Type': type,
              'X-IPC-Message-Id': message.id,
              ...(message.traceId && { 'X-Trace-Id': message.traceId }),
              ...(message.tenantId && { 'X-Tenant-Id': message.tenantId }),
            },
            body: JSON.stringify(message),
          }),
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('IPC_TIMEOUT')), timeoutMs),
        ),
      ]);

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        this.stats.errors++;
        const errorText = await response.text();
        return {
          messageId: message.id,
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: errorText || response.statusText,
          },
          latencyMs,
        };
      }

      const data = await response.json() as TRes;
      return {
        messageId: message.id,
        success: true,
        data,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err instanceof Error && err.message === 'IPC_TIMEOUT';

      if (isTimeout) {
        this.stats.timeouts++;
      }
      this.stats.errors++;

      return {
        messageId: message.id,
        success: false,
        error: {
          code: isTimeout ? 'TIMEOUT' : 'REQUEST_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
        latencyMs,
      };
    }
  }

  /**
   * Send a fire-and-forget message (no response expected).
   */
  async send<T = unknown>(
    target: string,
    type: string,
    payload: T,
    options: Partial<{ tenantId: string; traceId: string }> = {},
  ): Promise<boolean> {
    const binding = this.bindings.get(target);
    if (!binding) {
      this.stats.errors++;
      return false;
    }

    const message: IPCMessage<T> = {
      id: generateMessageId(),
      type,
      source: this.config.serviceName,
      target,
      payload,
      traceId: options.traceId,
      tenantId: options.tenantId || this.config.defaultTenantId,
      timestamp: new Date().toISOString(),
    };

    if (this.config.enableLogging) {
      this.messageLog.push(message);
    }

    this.stats.sent++;

    try {
      await binding.fetch(
        new Request('https://ipc.internal/__ipc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-IPC-Source': this.config.serviceName,
            'X-IPC-Type': type,
            'X-IPC-Message-Id': message.id,
            'X-IPC-Fire-And-Forget': 'true',
          },
          body: JSON.stringify(message),
        }),
      );
      return true;
    } catch {
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Handle an incoming IPC request.
   * Call this from your worker's fetch handler when the path is /__ipc.
   */
  async handleIncoming(request: Request): Promise<Response> {
    this.stats.received++;

    try {
      const message = await request.json() as IPCMessage;
      const handler = this.handlers.get(message.type);

      if (!handler) {
        return new Response(
          JSON.stringify({ code: 'NO_HANDLER', message: `No handler for type: ${message.type}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const result = await handler(message);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      this.stats.errors++;
      return new Response(
        JSON.stringify({
          code: 'HANDLER_ERROR',
          message: err instanceof Error ? err.message : String(err),
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  /**
   * Broadcast a message to multiple services.
   */
  async broadcast<T = unknown>(
    targets: string[],
    type: string,
    payload: T,
    options: Partial<{ tenantId: string; traceId: string }> = {},
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    await Promise.allSettled(
      targets.map(async (target) => {
        const success = await this.send(target, type, payload, options);
        results.set(target, success);
      }),
    );
    return results;
  }

  /** Get registered service names */
  getRegisteredServices(): string[] {
    return Array.from(this.bindings.keys());
  }

  /** Get registered handler types */
  getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }

  /** Get message stats */
  getStats(): Readonly<typeof this.stats> {
    return { ...this.stats };
  }

  /** Get message log (if logging enabled) */
  getMessageLog(): readonly IPCMessage[] {
    return this.messageLog;
  }

  /** Clear message log */
  clearLog(): void {
    this.messageLog.length = 0;
  }

  /** Reset stats */
  resetStats(): void {
    this.stats = { sent: 0, received: 0, errors: 0, timeouts: 0 };
  }
}

/**
 * Check if a request is an IPC request.
 */
export function isIPCRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname === '/__ipc' && request.method === 'POST';
}

/**
 * Create a typed IPC client for a specific service.
 */
export function createIPCClient(
  serviceName: string,
  bindings?: Record<string, ServiceBinding>,
  config?: Partial<IPCClientConfig>,
): IPCClient {
  const client = new IPCClient({ ...config, serviceName });
  if (bindings) {
    for (const [name, binding] of Object.entries(bindings)) {
      client.registerBinding(name, binding);
    }
  }
  return client;
}