// ============================================================
// Infinity OS — WebSocket API Worker (Durable Objects)
// ============================================================
// Routes:
//   GET  /health
//   GET  /ws                  — WebSocket upgrade (auth via ?token=)
//   POST /api/v1/ws/broadcast — Broadcast message to room
//   GET  /api/v1/ws/rooms     — List active rooms
// ============================================================

export interface Env {
  ROOMS: DurableObjectNamespace;
  AUTH_API_URL: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
}

// ── Durable Object: Room ──────────────────────────────────

export class Room {
  private sessions: Map<WebSocket, { userId: string; role: string; joinedAt: number }> = new Map();
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const userId = url.searchParams.get('userId') ?? 'anonymous';
      const role = url.searchParams.get('role') ?? 'member';

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.state.acceptWebSocket(server);
      this.sessions.set(server, { userId, role, joinedAt: Date.now() });

      // Notify others someone joined
      this.broadcast({
        type: 'user.joined',
        userId,
        timestamp: new Date().toISOString(),
        onlineCount: this.sessions.size,
      }, server);

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const body = await request.json() as { type: string; data: unknown };
      this.broadcast(body);
      return new Response(JSON.stringify({ sent: this.sessions.size }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/count') {
      return new Response(JSON.stringify({ connections: this.sessions.size }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const session = this.sessions.get(ws);
    if (!session) return;

    try {
      const data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));

      // Echo back with metadata, broadcast to room
      const enriched = {
        ...data,
        userId: session.userId,
        timestamp: new Date().toISOString(),
      };

      // Broadcast to all except sender
      this.broadcast(enriched, ws);

      // Acknowledge to sender
      ws.send(JSON.stringify({ type: 'ack', id: data.id ?? null }));
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  }

  webSocketClose(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);

    if (session) {
      this.broadcast({
        type: 'user.left',
        userId: session.userId,
        timestamp: new Date().toISOString(),
        onlineCount: this.sessions.size,
      });
    }
  }

  webSocketError(ws: WebSocket): void {
    this.sessions.delete(ws);
  }

  private broadcast(message: unknown, exclude?: WebSocket): void {
    const payload = JSON.stringify(message);
    for (const [ws] of this.sessions) {
      if (ws !== exclude) {
        try {
          ws.send(payload);
        } catch {
          this.sessions.delete(ws);
        }
      }
    }
  }
}

// ── Main Worker ───────────────────────────────────────────

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = [
    'https://infinity-portal.pages.dev',
    'https://infinity-portal.com',
    'http://localhost:5173',
    ...(env.ALLOWED_ORIGINS || '').split(',').map((o: string) => o.trim()),
  ];
  return allowed.includes(origin) || origin.endsWith('.infinity-portal.pages.dev') ? origin : null;
}

async function verifyToken(token: string, env: Env): Promise<{ userId: string; role: string } | null> {
  try {
    const authApiUrl = env.AUTH_API_URL || 'https://infinity-auth-api.luminous-aimastermind.workers.dev';
    const res = await fetch(`${authApiUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json() as { id: string; role: string };
    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const origin = getAllowedOrigin(request, env);

    const corsHeaders: Record<string, string> = origin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    } : {};

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'ws-api',
        environment: env.ENVIRONMENT,
        timestamp: new Date().toISOString(),
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // WebSocket upgrade
    if (pathname === '/ws') {
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response(JSON.stringify({ error: 'token required' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }

      const user = await verifyToken(token, env);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }

      const roomId = url.searchParams.get('room') ?? 'default';
      const roomName = env.ROOMS.idFromName(roomId);
      const room = env.ROOMS.get(roomName);

      const roomUrl = new URL(request.url);
      roomUrl.pathname = '/websocket';
      roomUrl.searchParams.set('userId', user.userId);
      roomUrl.searchParams.set('role', user.role);

      return room.fetch(new Request(roomUrl.toString(), request));
    }

    // Broadcast to room
    if (pathname === '/api/v1/ws/broadcast' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }

      const body = await request.json() as { room?: string; type: string; data: unknown };
      const roomId = body.room ?? 'default';
      const roomName = env.ROOMS.idFromName(roomId);
      const room = env.ROOMS.get(roomName);

      const broadcastUrl = new URL(request.url);
      broadcastUrl.pathname = '/broadcast';
      return room.fetch(new Request(broadcastUrl.toString(), {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    // List active rooms (static list — Durable Objects don't have enumeration)
    if (pathname === '/api/v1/ws/rooms' && request.method === 'GET') {
      return new Response(JSON.stringify({ rooms: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  },
};