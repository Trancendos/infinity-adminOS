/**
 * WebSocket API Worker — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests health check, auth, WebSocket upgrade guard,
 * broadcast, room listing, CORS, and error handling.
 * Note: Full WS upgrade requires CF runtime; tests use HTTP endpoints
 * and verify guard logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Durable Object mock ───────────────────────────────────────────
function makeRoomDO() {
  return {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sent: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  };
}

function makeRoomsNamespace(roomDO = makeRoomDO()) {
  return {
    idFromName: vi.fn().mockReturnValue({ toString: () => 'room-id-abc' }),
    get: vi.fn().mockReturnValue(roomDO),
  };
}

// ── Auth helpers ──────────────────────────────────────────────────
function stubAuthSuccess(userId = 'usr-1', role = 'user') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: userId, role }), { status: 200 }),
  ));
}

function stubAuthFailure() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  ));
}

// ── Env mock factory ──────────────────────────────────────────────
function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    ROOMS: makeRoomsNamespace(),
    AUTH_API_URL: 'https://mock-auth.example.com',
    ENVIRONMENT: 'test',
    ALLOWED_ORIGINS: '',
    ...overrides,
  };
}

// ── Request helpers ───────────────────────────────────────────────
function makeRequest(
  path: string,
  method = 'GET',
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return new Request(`https://ws-api.example.com${path}`, {
    method,
    headers: {
      Origin: 'https://infinity-portal.pages.dev',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Import worker ─────────────────────────────────────────────────
import worker from '../index';

// ═══════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════
describe('Health Check', () => {
  it('GET /health returns 200', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('ws-api');
  });

  it('health check includes timestamp', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.timestamp).toBe('string');
  });

  it('health check reflects environment', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv({ ENVIRONMENT: 'staging' }));
    const body = await res.json() as Record<string, unknown>;
    expect(body.environment).toBe('staging');
  });
});

// ═══════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════
describe('CORS', () => {
  it('OPTIONS preflight returns 204', async () => {
    const req = new Request('https://ws-api.example.com/ws', {
      method: 'OPTIONS',
      headers: { Origin: 'https://infinity-portal.pages.dev' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
  });

  it('preflight includes CORS headers', async () => {
    const req = new Request('https://ws-api.example.com/ws', {
      method: 'OPTIONS',
      headers: { Origin: 'https://infinity-portal.pages.dev' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('non-allowed origin gets no CORS header', async () => {
    const req = new Request('https://ws-api.example.com/health', {
      headers: { Origin: 'https://malicious-site.com' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// WebSocket Upgrade Guard
// ═══════════════════════════════════════════════════════════════
describe('WebSocket Upgrade Guard', () => {
  it('returns 401 when no token in WS upgrade request', async () => {
    const req = new Request('https://ws-api.example.com/ws', {
      headers: {
        Upgrade: 'websocket',
        Origin: 'https://infinity-portal.pages.dev',
      },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token for WS upgrade', async () => {
    stubAuthFailure();
    const req = new Request('https://ws-api.example.com/ws?token=bad-token', {
      headers: {
        Upgrade: 'websocket',
        Origin: 'https://infinity-portal.pages.dev',
      },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it('WS upgrade without Upgrade header returns error', async () => {
    // Without Upgrade: websocket header, should not be treated as WS
    // The route still needs token
    const req = new Request('https://ws-api.example.com/ws', {
      headers: { Origin: 'https://infinity-portal.pages.dev' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// Broadcast Endpoint
// ═══════════════════════════════════════════════════════════════
describe('Broadcast', () => {
  it('POST /api/v1/ws/broadcast returns 401 without auth', async () => {
    const res = await worker.fetch(
      makeRequest('/api/v1/ws/broadcast', 'POST', {}, { type: 'notification', data: {} }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/ws/broadcast with auth forwards to room DO', async () => {
    const roomDO = makeRoomDO();
    const env = makeEnv({ ROOMS: makeRoomsNamespace(roomDO) });
    const res = await worker.fetch(
      makeRequest(
        '/api/v1/ws/broadcast',
        'POST',
        { Authorization: 'Bearer valid-token' },
        { type: 'notification', data: { message: 'hello' } },
      ),
      env,
    );
    // The DO fetch is called to broadcast
    expect(roomDO.fetch).toHaveBeenCalled();
  });

  it('broadcast uses specified room', async () => {
    const roomDO = makeRoomDO();
    const roomsNs = makeRoomsNamespace(roomDO);
    const env = makeEnv({ ROOMS: roomsNs });
    await worker.fetch(
      makeRequest(
        '/api/v1/ws/broadcast',
        'POST',
        { Authorization: 'Bearer valid-token' },
        { room: 'my-special-room', type: 'alert', data: {} },
      ),
      env,
    );
    expect(roomsNs.idFromName).toHaveBeenCalledWith('my-special-room');
  });

  it('broadcast uses "default" room when not specified', async () => {
    const roomDO = makeRoomDO();
    const roomsNs = makeRoomsNamespace(roomDO);
    const env = makeEnv({ ROOMS: roomsNs });
    await worker.fetch(
      makeRequest(
        '/api/v1/ws/broadcast',
        'POST',
        { Authorization: 'Bearer valid-token' },
        { type: 'ping', data: {} },
      ),
      env,
    );
    expect(roomsNs.idFromName).toHaveBeenCalledWith('default');
  });
});

// ═══════════════════════════════════════════════════════════════
// Rooms Listing
// ═══════════════════════════════════════════════════════════════
describe('Rooms', () => {
  it('GET /api/v1/ws/rooms returns rooms list', async () => {
    const res = await worker.fetch(makeRequest('/api/v1/ws/rooms'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { rooms: unknown[] };
    expect(Array.isArray(body.rooms)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════
describe('Error Handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await worker.fetch(makeRequest('/api/v1/unknown'), makeEnv());
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('404 response has Content-Type application/json', async () => {
    const res = await worker.fetch(makeRequest('/totally/unknown'), makeEnv());
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});

// ═══════════════════════════════════════════════════════════════
// Room Durable Object Logic (isolated)
// ═══════════════════════════════════════════════════════════════
describe('Room Durable Object', () => {
  it('Room class can be imported', async () => {
    const mod = await import('../index');
    expect(mod.Room).toBeDefined();
  });

  it('Room class is a constructor', async () => {
    const mod = await import('../index');
    expect(typeof mod.Room).toBe('function');
  });

  it('Room instance has fetch method', async () => {
    const mod = await import('../index');
    const state = {
      acceptWebSocket: vi.fn(),
      getWebSockets: vi.fn().mockReturnValue([]),
    } as unknown;
    const room = new mod.Room(state as Parameters<typeof mod.Room>[0]);
    expect(typeof room.fetch).toBe('function');
  });

  it('Room broadcast route returns count of sessions', async () => {
    const mod = await import('../index');
    const state = {
      acceptWebSocket: vi.fn(),
      getWebSockets: vi.fn().mockReturnValue([]),
    } as unknown;
    const room = new mod.Room(state as Parameters<typeof mod.Room>[0]);
    const req = new Request('https://room.internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'ping', data: {} }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await room.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { sent: number };
    expect(typeof body.sent).toBe('number');
  });

  it('Room fetch returns 426 for non-WS /websocket request', async () => {
    const mod = await import('../index');
    const state = {
      acceptWebSocket: vi.fn(),
      getWebSockets: vi.fn().mockReturnValue([]),
    } as unknown;
    const room = new mod.Room(state as Parameters<typeof mod.Room>[0]);
    const req = new Request('https://room.internal/websocket', {
      method: 'GET',
      // no Upgrade: websocket header
    });
    const res = await room.fetch(req);
    expect(res.status).toBe(426);
  });
});