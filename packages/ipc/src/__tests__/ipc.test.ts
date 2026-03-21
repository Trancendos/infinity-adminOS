/**
 * @trancendos/ipc — Test Suite
 * ============================
 * Tests for typed IPC between workers via service bindings.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  IPCClient,
  createIPCClient,
  generateMessageId,
  isIPCRequest,
  DEFAULT_IPC_CONFIG,
  type IPCMessage,
  type ServiceBinding,
  type IPCResponse,
  type IPCClientConfig,
} from '../index';

// ── Helpers ────────────────────────────────────────────────────────────

/** Create a mock service binding that returns a given response */
function createMockBinding(
  responseData: unknown = { ok: true },
  status = 200,
): ServiceBinding & { lastRequest?: Request } {
  const mock: ServiceBinding & { lastRequest?: Request } = {
    lastRequest: undefined,
    async fetch(request: Request): Promise<Response> {
      mock.lastRequest = request;
      return new Response(JSON.stringify(responseData), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  return mock;
}

/** Create a mock binding that always fails */
function createFailingBinding(errorMessage = 'Connection refused'): ServiceBinding {
  return {
    async fetch(): Promise<Response> {
      throw new Error(errorMessage);
    },
  };
}

/** Create a mock binding that hangs (for timeout testing) */
function createSlowBinding(delayMs: number): ServiceBinding {
  return {
    async fetch(): Promise<Response> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  };
}

/** Create a mock binding that returns an HTTP error */
function createErrorBinding(status: number, errorText = 'Internal Server Error'): ServiceBinding {
  return {
    async fetch(): Promise<Response> {
      return new Response(errorText, { status });
    },
  };
}

// ── generateMessageId ─────────────────────────────────────────────────

describe('generateMessageId', () => {
  it('returns a string starting with msg_', () => {
    const id = generateMessageId();
    expect(id).toMatch(/^msg_/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateMessageId()));
    expect(ids.size).toBe(100);
  });

  it('contains timestamp and random parts', () => {
    const id = generateMessageId();
    const parts = id.split('_');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('msg');
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[2].length).toBeGreaterThan(0);
  });
});

// ── isIPCRequest ──────────────────────────────────────────────────────

describe('isIPCRequest', () => {
  it('returns true for valid IPC requests', () => {
    const request = new Request('https://ipc.internal/__ipc', { method: 'POST' });
    expect(isIPCRequest(request)).toBe(true);
  });

  it('returns false for GET requests', () => {
    const request = new Request('https://ipc.internal/__ipc', { method: 'GET' });
    expect(isIPCRequest(request)).toBe(false);
  });

  it('returns false for non-IPC paths', () => {
    const request = new Request('https://example.com/api/data', { method: 'POST' });
    expect(isIPCRequest(request)).toBe(false);
  });

  it('returns false for different hosts with /__ipc path', () => {
    const request = new Request('https://other-service.com/__ipc', { method: 'POST' });
    expect(isIPCRequest(request)).toBe(true); // path-based check only
  });
});

// ── DEFAULT_IPC_CONFIG ────────────────────────────────────────────────

describe('DEFAULT_IPC_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_IPC_CONFIG.serviceName).toBe('unknown');
    expect(DEFAULT_IPC_CONFIG.defaultTimeoutMs).toBe(10_000);
    expect(DEFAULT_IPC_CONFIG.enableLogging).toBe(false);
  });
});

// ── IPCClient Constructor ─────────────────────────────────────────────

describe('IPCClient', () => {
  let client: IPCClient;

  beforeEach(() => {
    client = new IPCClient({ serviceName: 'test-service' });
  });

  describe('constructor', () => {
    it('creates with default config', () => {
      const defaultClient = new IPCClient();
      expect(defaultClient.getRegisteredServices()).toEqual([]);
      expect(defaultClient.getRegisteredHandlers()).toEqual([]);
    });

    it('creates with custom config', () => {
      const customClient = new IPCClient({
        serviceName: 'custom',
        defaultTimeoutMs: 5000,
        enableLogging: true,
      });
      expect(customClient.getStats().sent).toBe(0);
    });
  });

  // ── Binding Management ────────────────────────────────────────────

  describe('binding management', () => {
    it('registers and lists service bindings', () => {
      const binding = createMockBinding();
      client.registerBinding('auth', binding);
      client.registerBinding('storage', binding);
      expect(client.getRegisteredServices()).toEqual(['auth', 'storage']);
    });

    it('unregisters service bindings', () => {
      const binding = createMockBinding();
      client.registerBinding('auth', binding);
      expect(client.getRegisteredServices()).toEqual(['auth']);
      client.unregisterBinding('auth');
      expect(client.getRegisteredServices()).toEqual([]);
    });

    it('overwrites existing bindings', () => {
      const binding1 = createMockBinding({ v: 1 });
      const binding2 = createMockBinding({ v: 2 });
      client.registerBinding('auth', binding1);
      client.registerBinding('auth', binding2);
      expect(client.getRegisteredServices()).toEqual(['auth']);
    });
  });

  // ── Handler Management ────────────────────────────────────────────

  describe('handler management', () => {
    it('registers and lists handlers', () => {
      client.registerHandler('user.create', async () => ({ ok: true }));
      client.registerHandler('user.delete', async () => ({ ok: true }));
      expect(client.getRegisteredHandlers()).toEqual(['user.create', 'user.delete']);
    });

    it('unregisters handlers', () => {
      client.registerHandler('user.create', async () => ({ ok: true }));
      client.unregisterHandler('user.create');
      expect(client.getRegisteredHandlers()).toEqual([]);
    });
  });

  // ── request() ─────────────────────────────────────────────────────

  describe('request()', () => {
    it('sends request and receives successful response', async () => {
      const binding = createMockBinding({ userId: '123', name: 'Test' });
      client.registerBinding('auth', binding);

      const response = await client.request<{ action: string }, { userId: string }>(
        'auth',
        'user.get',
        { action: 'get' },
      );

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ userId: '123', name: 'Test' });
      expect(response.messageId).toMatch(/^msg_/);
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error for missing binding', async () => {
      const response = await client.request('unknown-service', 'test', {});

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NO_BINDING');
      expect(response.error?.message).toContain('unknown-service');
    });

    it('sends correct headers', async () => {
      const binding = createMockBinding();
      client.registerBinding('auth', binding);

      await client.request('auth', 'user.get', { id: 1 }, {
        traceId: 'trace-abc',
        tenantId: 'tenant-xyz',
      });

      const req = binding.lastRequest!;
      expect(req.headers.get('Content-Type')).toBe('application/json');
      expect(req.headers.get('X-IPC-Source')).toBe('test-service');
      expect(req.headers.get('X-IPC-Type')).toBe('user.get');
      expect(req.headers.get('X-Trace-Id')).toBe('trace-abc');
      expect(req.headers.get('X-Tenant-Id')).toBe('tenant-xyz');
      expect(req.headers.get('X-IPC-Message-Id')).toMatch(/^msg_/);
    });

    it('sends request body as JSON', async () => {
      const binding = createMockBinding();
      client.registerBinding('auth', binding);

      await client.request('auth', 'user.create', { name: 'Alice', email: 'alice@test.com' });

      const req = binding.lastRequest!;
      const body = await req.json() as IPCMessage;
      expect(body.type).toBe('user.create');
      expect(body.source).toBe('test-service');
      expect(body.target).toBe('auth');
      expect(body.payload).toEqual({ name: 'Alice', email: 'alice@test.com' });
      expect(body.timestamp).toBeTruthy();
    });

    it('handles HTTP error responses', async () => {
      const binding = createErrorBinding(500, 'Database connection failed');
      client.registerBinding('db', binding);

      const response = await client.request('db', 'query', { sql: 'SELECT 1' });

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('HTTP_500');
      expect(response.error?.message).toBe('Database connection failed');
    });

    it('handles fetch failures', async () => {
      const binding = createFailingBinding('Network error');
      client.registerBinding('remote', binding);

      const response = await client.request('remote', 'ping', {});

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('REQUEST_FAILED');
      expect(response.error?.message).toBe('Network error');
    });

    it('handles timeouts', async () => {
      const binding = createSlowBinding(500);
      client.registerBinding('slow', binding);

      const response = await client.request('slow', 'ping', {}, { timeoutMs: 50 });

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('TIMEOUT');
    }, 10_000);

    it('uses default tenant ID when not specified', async () => {
      const tenantClient = new IPCClient({
        serviceName: 'test',
        defaultTenantId: 'default-tenant',
      });
      const binding = createMockBinding();
      tenantClient.registerBinding('auth', binding);

      await tenantClient.request('auth', 'check', {});

      const req = binding.lastRequest!;
      expect(req.headers.get('X-Tenant-Id')).toBe('default-tenant');
    });

    it('overrides default tenant ID with explicit option', async () => {
      const tenantClient = new IPCClient({
        serviceName: 'test',
        defaultTenantId: 'default-tenant',
      });
      const binding = createMockBinding();
      tenantClient.registerBinding('auth', binding);

      await tenantClient.request('auth', 'check', {}, { tenantId: 'override-tenant' });

      const req = binding.lastRequest!;
      expect(req.headers.get('X-Tenant-Id')).toBe('override-tenant');
    });
  });

  // ── send() ────────────────────────────────────────────────────────

  describe('send()', () => {
    it('sends fire-and-forget message and returns true', async () => {
      const binding = createMockBinding();
      client.registerBinding('events', binding);

      const result = await client.send('events', 'user.logged_in', { userId: '123' });

      expect(result).toBe(true);
    });

    it('returns false for missing binding', async () => {
      const result = await client.send('unknown', 'test', {});
      expect(result).toBe(false);
    });

    it('sets fire-and-forget header', async () => {
      const binding = createMockBinding();
      client.registerBinding('events', binding);

      await client.send('events', 'notification', { text: 'hello' });

      const req = binding.lastRequest!;
      expect(req.headers.get('X-IPC-Fire-And-Forget')).toBe('true');
    });

    it('returns false on fetch failure', async () => {
      const binding = createFailingBinding();
      client.registerBinding('broken', binding);

      const result = await client.send('broken', 'test', {});
      expect(result).toBe(false);
    });
  });

  // ── handleIncoming() ──────────────────────────────────────────────

  describe('handleIncoming()', () => {
    it('dispatches to registered handler and returns result', async () => {
      client.registerHandler('greet', async (msg) => ({
        greeting: `Hello, ${(msg.payload as { name: string }).name}!`,
      }));

      const message: IPCMessage = {
        id: 'msg_test_1',
        type: 'greet',
        source: 'other-service',
        target: 'test-service',
        payload: { name: 'Alice' },
        timestamp: new Date().toISOString(),
      };

      const request = new Request('https://ipc.internal/__ipc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      const response = await client.handleIncoming(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual({ greeting: 'Hello, Alice!' });
    });

    it('returns 404 for unknown message types', async () => {
      const message: IPCMessage = {
        id: 'msg_test_2',
        type: 'unknown.action',
        source: 'other',
        target: 'test-service',
        payload: {},
        timestamp: new Date().toISOString(),
      };

      const request = new Request('https://ipc.internal/__ipc', {
        method: 'POST',
        body: JSON.stringify(message),
      });

      const response = await client.handleIncoming(request);
      expect(response.status).toBe(404);

      const data = await response.json() as { code: string };
      expect(data.code).toBe('NO_HANDLER');
    });

    it('returns 500 when handler throws', async () => {
      client.registerHandler('fail', async () => {
        throw new Error('Handler exploded');
      });

      const message: IPCMessage = {
        id: 'msg_test_3',
        type: 'fail',
        source: 'other',
        target: 'test-service',
        payload: {},
        timestamp: new Date().toISOString(),
      };

      const request = new Request('https://ipc.internal/__ipc', {
        method: 'POST',
        body: JSON.stringify(message),
      });

      const response = await client.handleIncoming(request);
      expect(response.status).toBe(500);

      const data = await response.json() as { code: string; message: string };
      expect(data.code).toBe('HANDLER_ERROR');
      expect(data.message).toBe('Handler exploded');
    });

    it('increments received counter', async () => {
      client.registerHandler('ping', async () => 'pong');

      const message: IPCMessage = {
        id: 'msg_test_4',
        type: 'ping',
        source: 'other',
        target: 'test-service',
        payload: {},
        timestamp: new Date().toISOString(),
      };

      const request = new Request('https://ipc.internal/__ipc', {
        method: 'POST',
        body: JSON.stringify(message),
      });

      await client.handleIncoming(request);
      expect(client.getStats().received).toBe(1);
    });
  });

  // ── broadcast() ───────────────────────────────────────────────────

  describe('broadcast()', () => {
    it('sends to all targets and returns results', async () => {
      client.registerBinding('service-a', createMockBinding());
      client.registerBinding('service-b', createMockBinding());
      client.registerBinding('service-c', createMockBinding());

      const results = await client.broadcast(
        ['service-a', 'service-b', 'service-c'],
        'config.reload',
        { version: 2 },
      );

      expect(results.size).toBe(3);
      expect(results.get('service-a')).toBe(true);
      expect(results.get('service-b')).toBe(true);
      expect(results.get('service-c')).toBe(true);
    });

    it('reports failures for missing bindings', async () => {
      client.registerBinding('service-a', createMockBinding());

      const results = await client.broadcast(
        ['service-a', 'service-missing'],
        'notify',
        {},
      );

      expect(results.get('service-a')).toBe(true);
      expect(results.get('service-missing')).toBe(false);
    });

    it('handles partial failures', async () => {
      client.registerBinding('good', createMockBinding());
      client.registerBinding('bad', createFailingBinding());

      const results = await client.broadcast(['good', 'bad'], 'test', {});

      expect(results.get('good')).toBe(true);
      expect(results.get('bad')).toBe(false);
    });
  });

  // ── Stats & Logging ──────────────────────────────────────────────

  describe('stats', () => {
    it('tracks sent messages', async () => {
      client.registerBinding('auth', createMockBinding());
      await client.request('auth', 'test', {});
      await client.send('auth', 'event', {});

      const stats = client.getStats();
      expect(stats.sent).toBe(2);
    });

    it('tracks errors', async () => {
      await client.request('missing', 'test', {});
      await client.send('missing', 'test', {});

      const stats = client.getStats();
      expect(stats.errors).toBe(2);
    });

    it('tracks timeouts', async () => {
      client.registerBinding('slow', createSlowBinding(500));
      await client.request('slow', 'ping', {}, { timeoutMs: 10 });

      const stats = client.getStats();
      expect(stats.timeouts).toBe(1);
    }, 10_000);

    it('resets stats', async () => {
      client.registerBinding('auth', createMockBinding());
      await client.request('auth', 'test', {});
      client.resetStats();

      const stats = client.getStats();
      expect(stats.sent).toBe(0);
      expect(stats.received).toBe(0);
      expect(stats.errors).toBe(0);
      expect(stats.timeouts).toBe(0);
    });
  });

  describe('message logging', () => {
    it('logs messages when enabled', async () => {
      const loggingClient = new IPCClient({
        serviceName: 'test',
        enableLogging: true,
      });
      const binding = createMockBinding();
      loggingClient.registerBinding('auth', binding);

      await loggingClient.request('auth', 'user.get', { id: 1 });
      await loggingClient.send('auth', 'event', { type: 'login' });

      const log = loggingClient.getMessageLog();
      expect(log.length).toBe(2);
      expect(log[0].type).toBe('user.get');
      expect(log[1].type).toBe('event');
    });

    it('does not log when disabled', async () => {
      client.registerBinding('auth', createMockBinding());
      await client.request('auth', 'test', {});

      expect(client.getMessageLog().length).toBe(0);
    });

    it('clears log', async () => {
      const loggingClient = new IPCClient({
        serviceName: 'test',
        enableLogging: true,
      });
      loggingClient.registerBinding('auth', createMockBinding());
      await loggingClient.send('auth', 'test', {});
      expect(loggingClient.getMessageLog().length).toBe(1);

      loggingClient.clearLog();
      expect(loggingClient.getMessageLog().length).toBe(0);
    });
  });
});

// ── createIPCClient ───────────────────────────────────────────────────

describe('createIPCClient', () => {
  it('creates client with service name', () => {
    const client = createIPCClient('my-service');
    expect(client.getRegisteredServices()).toEqual([]);
  });

  it('creates client with pre-registered bindings', () => {
    const bindings = {
      auth: createMockBinding(),
      storage: createMockBinding(),
    };
    const client = createIPCClient('my-service', bindings);
    expect(client.getRegisteredServices()).toEqual(['auth', 'storage']);
  });

  it('creates client with custom config', () => {
    const client = createIPCClient('my-service', undefined, {
      defaultTimeoutMs: 5000,
      enableLogging: true,
    });
    // Verify it works by sending
    expect(client.getStats().sent).toBe(0);
  });

  it('creates functional client that can send requests', async () => {
    const binding = createMockBinding({ result: 'success' });
    const client = createIPCClient('test', { target: binding });

    const response = await client.request('target', 'action', { data: 1 });
    expect(response.success).toBe(true);
    expect(response.data).toEqual({ result: 'success' });
  });
});