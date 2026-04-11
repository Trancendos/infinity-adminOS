/**
 * HIVE Cloudflare Worker — Phase 29 Cloudflare-Native Refactor
 * Bio-Inspired Swarm Data Router
 * 
 * 100% Cloudflare: D1 (DB) + KV (cache/rate-limit) + Zero third-party deps
 */

export interface Env {
  DB: D1Database;
  KV_CACHE: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  LIGHTHOUSE_URL: string;
  VOID_URL: string;
  INTERNAL_SECRET: string;
  ENVIRONMENT: string;
}

// ============================================================
// SHARED HELPERS
// ============================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function errorResponse(message: string, status = 400, code = 'ERROR'): Response {
  return jsonResponse({ error: { message, code, status }, timestamp: new Date().toISOString() }, status);
}

function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================
// D1 ADAPTER — replaces Supabase REST client
// ============================================================

interface D1Result<T = Record<string, unknown>> {
  data: T[] | null;
  error: string | null;
}

async function d1Query<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<D1Result<T>> {
  try {
    const result = await db.prepare(sql).bind(...params).all<T>();
    return { data: result.results as T[], error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('D1 query error:', msg, 'SQL:', sql);
    return { data: null, error: msg };
  }
}

async function d1Run(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<{ success: boolean; error: string | null }> {
  try {
    await db.prepare(sql).bind(...params).run();
    return { success: true, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('D1 run error:', msg, 'SQL:', sql);
    return { success: false, error: msg };
  }
}

// ============================================================
// RATE LIMITING (KV-based)
// ============================================================

async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const kvKey = `rl:${key}`;
  const current = await kv.get(kvKey);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= maxRequests) return { allowed: false, remaining: 0 };
  await kv.put(kvKey, String(count + 1), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: maxRequests - count - 1 };
}

// ============================================================
// CORS
// ============================================================

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-Internal-Secret',
    'Access-Control-Max-Age': '86400',
  };
}

// ============================================================
// DB SCHEMA INIT (idempotent)
// ============================================================

async function initSchema(db: D1Database): Promise<void> {
  const schema = [
    `CREATE TABLE IF NOT EXISTS hive_nodes (
      node_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'worker',
      status TEXT NOT NULL DEFAULT 'active',
      capabilities TEXT NOT NULL DEFAULT '[]',
      load_score REAL NOT NULL DEFAULT 0.0,
      last_heartbeat TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS hive_channels (
      channel_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      classification TEXT NOT NULL DEFAULT 'internal',
      protocol TEXT NOT NULL DEFAULT 'event',
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS hive_message_log (
      message_id TEXT PRIMARY KEY,
      channel_id TEXT,
      payload_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      classification TEXT NOT NULL DEFAULT 'internal',
      latency_ms INTEGER,
      source_node TEXT,
      target_node TEXT,
      created_at TEXT NOT NULL,
      processed_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hive_nodes_status ON hive_nodes(status)`,
    `CREATE INDEX IF NOT EXISTS idx_hive_message_log_status ON hive_message_log(status)`,
    `CREATE INDEX IF NOT EXISTS idx_hive_message_log_created ON hive_message_log(created_at)`,
  ];
  for (const sql of schema) {
    await db.prepare(sql).run().catch(console.error);
  }
}

// ============================================================
// HANDLERS
// ============================================================

async function handleHealth(env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB, 'SELECT COUNT(*) as count FROM hive_nodes WHERE status = ?', ['active']);
  const activeNodes = (data?.[0] as { count: number })?.count ?? 0;
  return jsonResponse({
    status: 'healthy',
    service: 'hive',
    version: '2.0.0',
    environment: env.ENVIRONMENT,
    active_nodes: activeNodes,
    timestamp: new Date().toISOString(),
  });
}

async function handleRoute(request: Request, env: Env): Promise<Response> {
  const rl = await checkRateLimit(env.KV_RATE_LIMIT, `route:${request.headers.get('CF-Connecting-IP')}`, 100, 60);
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMIT');

  const body = await request.json<{ payload: unknown; classification?: string; target_channel?: string }>();
  if (!body?.payload) return errorResponse('payload required', 400);

  const messageId = generateId();
  const now = new Date().toISOString();
  const payloadHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body.payload)))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));

  // Get least-loaded active node
  const { data: nodes } = await d1Query<{ node_id: string; load_score: number }>(
    env.DB,
    'SELECT node_id, load_score FROM hive_nodes WHERE status = ? ORDER BY load_score ASC LIMIT 1',
    ['active'],
  );
  const targetNode = nodes?.[0]?.node_id ?? 'hive-core';

  await d1Run(env.DB,
    'INSERT INTO hive_message_log (message_id, channel_id, payload_hash, status, classification, source_node, target_node, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [messageId, body.target_channel ?? null, payloadHash, 'routed', body.classification ?? 'internal', 'gateway', targetNode, now],
  );

  return jsonResponse({ message_id: messageId, status: 'routed', target_node: targetNode, timestamp: now }, 201);
}

async function handleGetMessage(messageId: string, env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB, 'SELECT * FROM hive_message_log WHERE message_id = ?', [messageId]);
  if (!data?.length) return errorResponse('Message not found', 404, 'NOT_FOUND');
  return jsonResponse(data[0]);
}

async function handleCreateChannel(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ name: string; classification?: string; protocol?: string; config?: unknown }>();
  if (!body?.name) return errorResponse('name required', 400);

  const channelId = generateId();
  const now = new Date().toISOString();
  await d1Run(env.DB,
    'INSERT INTO hive_channels (channel_id, name, status, classification, protocol, config, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    [channelId, body.name, 'active', body.classification ?? 'internal', body.protocol ?? 'event', JSON.stringify(body.config ?? {}), now, now],
  );

  return jsonResponse({ channel_id: channelId, name: body.name, status: 'active', created_at: now }, 201);
}

async function handleListChannels(env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB, 'SELECT * FROM hive_channels ORDER BY created_at DESC LIMIT 100');
  return jsonResponse({ channels: data ?? [], count: data?.length ?? 0 });
}

async function handleGetChannel(channelId: string, env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB, 'SELECT * FROM hive_channels WHERE channel_id = ?', [channelId]);
  if (!data?.length) return errorResponse('Channel not found', 404, 'NOT_FOUND');
  return jsonResponse(data[0]);
}

async function handleDeleteChannel(channelId: string, env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB, 'SELECT channel_id FROM hive_channels WHERE channel_id = ?', [channelId]);
  if (!data?.length) return errorResponse('Channel not found', 404, 'NOT_FOUND');
  await d1Run(env.DB, 'UPDATE hive_channels SET status = ?, updated_at = ? WHERE channel_id = ?', ['closed', new Date().toISOString(), channelId]);
  return jsonResponse({ channel_id: channelId, status: 'closed' });
}

async function handleListNodes(env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB, 'SELECT * FROM hive_nodes ORDER BY load_score ASC');
  return jsonResponse({ nodes: data ?? [], count: data?.length ?? 0 });
}

async function handleGetNode(nodeId: string, env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB, 'SELECT * FROM hive_nodes WHERE node_id = ?', [nodeId]);
  if (!data?.length) return errorResponse('Node not found', 404, 'NOT_FOUND');
  return jsonResponse(data[0]);
}

async function handleNodeHealth(nodeId: string, env: Env): Promise<Response> {
  const { data } = await d1Query<{ node_id: string; status: string; load_score: number; last_heartbeat: string }>(
    env.DB, 'SELECT node_id, status, load_score, last_heartbeat FROM hive_nodes WHERE node_id = ?', [nodeId],
  );
  if (!data?.length) return errorResponse('Node not found', 404, 'NOT_FOUND');
  const node = data[0];
  return jsonResponse({ node_id: nodeId, healthy: node.status === 'active', load_score: node.load_score, last_heartbeat: node.last_heartbeat });
}

async function handleTopology(env: Env): Promise<Response> {
  const [nodesResult, channelsResult, msgResult] = await Promise.all([
    d1Query<{ role: string; status: string }>(env.DB, 'SELECT role, status FROM hive_nodes'),
    d1Query<{ status: string; classification: string }>(env.DB, 'SELECT status, classification FROM hive_channels'),
    d1Query<{ status: string; latency_ms: number }>(env.DB, 'SELECT status, latency_ms FROM hive_message_log WHERE created_at > ?', [new Date(Date.now() - 3600000).toISOString()]),
  ]);

  const nodes = nodesResult.data ?? [];
  const channels = channelsResult.data ?? [];
  const messages = msgResult.data ?? [];

  return jsonResponse({
    topology: {
      nodes: { total: nodes.length, by_role: nodes.reduce((acc: Record<string, number>, n) => { acc[n.role] = (acc[n.role] ?? 0) + 1; return acc; }, {}), active: nodes.filter(n => n.status === 'active').length },
      channels: { total: channels.length, active: channels.filter(c => c.status === 'active').length },
      messages_1h: { total: messages.length, routed: messages.filter(m => m.status === 'routed').length, avg_latency_ms: messages.length ? Math.round(messages.reduce((s, m) => s + (m.latency_ms ?? 0), 0) / messages.length) : 0 },
    },
    timestamp: new Date().toISOString(),
  });
}

async function handleDiscover(serviceType: string, env: Env): Promise<Response> {
  const { data } = await d1Query(env.DB,
    "SELECT node_id, role, status, capabilities, load_score FROM hive_nodes WHERE status = 'active' AND capabilities LIKE ?",
    [`%${serviceType}%`],
  );
  return jsonResponse({ service_type: serviceType, nodes: data ?? [], count: data?.length ?? 0 });
}

async function handleInternalHeartbeat(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_SECRET) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json<{ node_id: string; role?: string; load_score?: number; capabilities?: string[] }>();
  if (!body?.node_id) return errorResponse('node_id required', 400);

  const now = new Date().toISOString();
  const { data: existing } = await d1Query(env.DB, 'SELECT node_id FROM hive_nodes WHERE node_id = ?', [body.node_id]);

  if (existing?.length) {
    await d1Run(env.DB, 'UPDATE hive_nodes SET status = ?, load_score = ?, last_heartbeat = ?, updated_at = ? WHERE node_id = ?',
      ['active', body.load_score ?? 0, now, now, body.node_id]);
  } else {
    await d1Run(env.DB,
      'INSERT INTO hive_nodes (node_id, role, status, capabilities, load_score, last_heartbeat, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [body.node_id, body.role ?? 'worker', 'active', JSON.stringify(body.capabilities ?? []), body.load_score ?? 0, now, '{}', now, now]);
  }

  return jsonResponse({ node_id: body.node_id, status: 'active', timestamp: now });
}

// ============================================================
// MAIN FETCH HANDLER
// ============================================================

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin') ?? '*') });
    }

    // Init schema on cold start
    await initSchema(env.DB).catch(console.error);

    try {
      // Health
      if (method === 'GET' && path === '/health') return handleHealth(env);

      // Route messages
      if (method === 'POST' && path === '/route') return handleRoute(request, env);
      if (method === 'GET' && path.match(/^\/route\/[\w-]+$/)) return handleGetMessage(path.split('/')[2], env);

      // Channels
      if (method === 'POST' && path === '/channels') return handleCreateChannel(request, env);
      if (method === 'GET' && path === '/channels') return handleListChannels(env);
      if (method === 'GET' && path.match(/^\/channels\/[\w-]+$/)) return handleGetChannel(path.split('/')[2], env);
      if (method === 'DELETE' && path.match(/^\/channels\/[\w-]+$/)) return handleDeleteChannel(path.split('/')[2], env);

      // Nodes
      if (method === 'GET' && path === '/nodes') return handleListNodes(env);
      if (method === 'GET' && path.match(/^\/nodes\/[\w-]+\/health$/)) return handleNodeHealth(path.split('/')[2], env);
      if (method === 'GET' && path.match(/^\/nodes\/[\w-]+$/)) return handleGetNode(path.split('/')[2], env);

      // Topology & discovery
      if (method === 'GET' && path === '/topology') return handleTopology(env);
      if (method === 'GET' && path.match(/^\/discover\/[\w-]+$/)) return handleDiscover(path.split('/')[2], env);

      // Internal
      if (method === 'POST' && path === '/internal/heartbeat') return handleInternalHeartbeat(request, env);

      return errorResponse('Not found', 404, 'NOT_FOUND');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Internal server error';
      console.error('HIVE error:', msg);
      return errorResponse(msg, 500, 'INTERNAL_ERROR');
    }
  },
};