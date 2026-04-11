/**
 * MONITORING DASHBOARD Cloudflare Worker — Phase 29
 * Unified observability hub for all Infinity OS workers
 * 
 * 100% Cloudflare: D1 + KV + Analytics Engine + Zero third-party deps
 */

export interface Env {
  DB: D1Database;
  KV_METRICS: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  AUTH_API_URL: string;
  HIVE_URL: string;
  LIGHTHOUSE_URL: string;
  VOID_URL: string;
  INFINITY_ONE_URL: string;
  AI_API_URL: string;
  FILES_API_URL: string;
  WS_API_URL: string;
  INTERNAL_SECRET: string;
  ENVIRONMENT: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    },
  });
}

function errorResponse(message: string, status = 400, code = 'ERROR'): Response {
  return jsonResponse({ error: { message, code, status }, timestamp: new Date().toISOString() }, status);
}

async function d1Query<T = Record<string, unknown>>(db: D1Database, sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const result = await db.prepare(sql).bind(...params).all<T>();
    return result.results as T[];
  } catch {
    return [];
  }
}

async function d1Run(db: D1Database, sql: string, params: unknown[] = []): Promise<void> {
  await db.prepare(sql).bind(...params).run().catch(console.error);
}

async function initSchema(db: D1Database): Promise<void> {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS monitoring_health_log (
      log_id TEXT PRIMARY KEY,
      service TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      http_status INTEGER,
      error TEXT,
      checked_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring_metrics (
      metric_id TEXT PRIMARY KEY,
      service TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      labels TEXT NOT NULL DEFAULT '{}',
      recorded_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS monitoring_alerts (
      alert_id TEXT PRIMARY KEY,
      service TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'firing',
      fired_at TEXT NOT NULL,
      resolved_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_health_service ON monitoring_health_log(service, checked_at)`,
    `CREATE INDEX IF NOT EXISTS idx_metrics_service ON monitoring_metrics(service, recorded_at)`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_status ON monitoring_alerts(status)`,
  ];
  for (const sql of stmts) {
    await db.prepare(sql).run().catch(console.error);
  }
}

interface ServiceConfig { name: string; url: string; }

async function checkService(service: ServiceConfig): Promise<{ service: string; status: 'healthy' | 'degraded' | 'down'; latency_ms: number; http_status: number; error?: string }> {
  const start = Date.now();
  try {
    const response = await fetch(`${service.url}/health`, { signal: AbortSignal.timeout(5000) });
    return { service: service.name, status: response.ok ? 'healthy' : 'degraded', latency_ms: Date.now() - start, http_status: response.status };
  } catch (e: unknown) {
    return { service: service.name, status: 'down', latency_ms: Date.now() - start, http_status: 0, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function handleHealthCheck(env: Env): Promise<Response> {
  const services: ServiceConfig[] = [
    { name: 'auth-api', url: env.AUTH_API_URL },
    { name: 'ai-api', url: env.AI_API_URL },
    { name: 'files-api', url: env.FILES_API_URL },
    { name: 'ws-api', url: env.WS_API_URL },
    { name: 'hive', url: env.HIVE_URL },
    { name: 'lighthouse', url: env.LIGHTHOUSE_URL },
    { name: 'void', url: env.VOID_URL },
    { name: 'infinity-one', url: env.INFINITY_ONE_URL },
  ];

  const results = await Promise.all(services.map(checkService));
  const now = new Date().toISOString();

  for (const result of results) {
    await d1Run(env.DB,
      'INSERT INTO monitoring_health_log (log_id, service, status, latency_ms, http_status, error, checked_at) VALUES (?,?,?,?,?,?,?)',
      [crypto.randomUUID(), result.service, result.status, result.latency_ms, result.http_status, result.error ?? null, now],
    );
    if (result.status === 'down') {
      const existing = await d1Query<{ alert_id: string }>(env.DB, "SELECT alert_id FROM monitoring_alerts WHERE service = ? AND status = 'firing'", [result.service]);
      if (!existing.length) {
        await d1Run(env.DB, 'INSERT INTO monitoring_alerts (alert_id, service, severity, title, description, status, fired_at) VALUES (?,?,?,?,?,?,?)',
          [crypto.randomUUID(), result.service, 'critical', `${result.service} is DOWN`, `Service failed health check: ${result.error ?? 'no response'}`, 'firing', now]);
      }
    } else {
      await d1Run(env.DB, "UPDATE monitoring_alerts SET status = 'resolved', resolved_at = ? WHERE service = ? AND status = 'firing'", [now, result.service]);
    }
  }

  const healthy = results.filter(r => r.status === 'healthy').length;
  const degraded = results.filter(r => r.status === 'degraded').length;
  const down = results.filter(r => r.status === 'down').length;

  return jsonResponse({
    status: down > 0 ? 'degraded' : degraded > 0 ? 'degraded' : 'healthy',
    summary: { healthy, degraded, down, total: results.length },
    services: results,
    timestamp: now,
  });
}

async function handleDashboard(env: Env): Promise<Response> {
  const cacheKey = 'dashboard:latest';
  const cached = await env.KV_METRICS.get(cacheKey);
  if (cached) return jsonResponse(JSON.parse(cached));

  const [firingAlerts, recentMetrics] = await Promise.all([
    d1Query(env.DB, "SELECT * FROM monitoring_alerts WHERE status = 'firing' ORDER BY fired_at DESC"),
    d1Query(env.DB, 'SELECT service, metric_name, AVG(metric_value) as avg_value FROM monitoring_metrics WHERE recorded_at > ? GROUP BY service, metric_name', [new Date(Date.now() - 3600000).toISOString()]),
  ]);

  const dashboard = { alerts: { firing: firingAlerts, count: firingAlerts.length }, metrics_1h: recentMetrics, timestamp: new Date().toISOString() };
  await env.KV_METRICS.put(cacheKey, JSON.stringify(dashboard), { expirationTtl: 60 });
  return jsonResponse(dashboard);
}

async function handleMetrics(env: Env): Promise<Response> {
  const services = await d1Query<{ service: string; status: string }>(
    env.DB, 'SELECT service, status FROM monitoring_health_log WHERE checked_at = (SELECT MAX(checked_at) FROM monitoring_health_log m2 WHERE m2.service = monitoring_health_log.service) GROUP BY service',
  );
  const lines = ['# HELP infinity_service_up Service health (1=up, 0=down)', '# TYPE infinity_service_up gauge'];
  for (const s of services) {
    lines.push(`infinity_service_up{service="${s.service}"} ${s.status === 'healthy' ? 1 : 0}`);
  }
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; version=0.0.4' } });
}

async function handleIngestMetric(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Internal-Secret');
  if (secret !== env.INTERNAL_SECRET) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED');

  const body = await request.json<{ service: string; metrics: Array<{ name: string; value: number; labels?: Record<string, string> }> }>();
  if (!body?.service || !body?.metrics?.length) return errorResponse('service and metrics required', 400);

  const now = new Date().toISOString();
  for (const m of body.metrics) {
    await d1Run(env.DB, 'INSERT INTO monitoring_metrics (metric_id, service, metric_name, metric_value, labels, recorded_at) VALUES (?,?,?,?,?,?)',
      [crypto.randomUUID(), body.service, m.name, m.value, JSON.stringify(m.labels ?? {}), now]);
  }
  // Prune old records
  await d1Run(env.DB, 'DELETE FROM monitoring_metrics WHERE recorded_at < ?', [new Date(Date.now() - 86400000).toISOString()]);
  await d1Run(env.DB, 'DELETE FROM monitoring_health_log WHERE checked_at < ?', [new Date(Date.now() - 86400000).toISOString()]);

  return jsonResponse({ ingested: body.metrics.length, service: body.service });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-Secret' } });
    }

    await initSchema(env.DB).catch(console.error);

    try {
      if (method === 'GET' && path === '/health') return jsonResponse({ status: 'healthy', service: 'monitoring-dashboard', version: '2.0.0', environment: env.ENVIRONMENT, timestamp: new Date().toISOString() });
      if (method === 'GET' && path === '/dashboard') return handleDashboard(env);
      if (method === 'GET' && path === '/check') return handleHealthCheck(env);
      if (method === 'GET' && path === '/metrics') return handleMetrics(env);
      if (method === 'GET' && path === '/alerts') {
        const alerts = await d1Query(env.DB, 'SELECT * FROM monitoring_alerts ORDER BY fired_at DESC LIMIT 50');
        return jsonResponse({ alerts, count: alerts.length });
      }
      if (method === 'POST' && path === '/ingest') return handleIngestMetric(request, env);
      return errorResponse('Not found', 404, 'NOT_FOUND');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Internal server error';
      console.error('MONITORING error:', msg);
      return errorResponse(msg, 500, 'INTERNAL_ERROR');
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleHealthCheck(env));
  },
};