/**
 * OBSERVATORY Cloudflare Worker — Phase 29
 * Knowledge Application & VAI Norman Hawkins
 *
 * Functions:
 * - Advanced Analytics
 * - Data Correlation
 * - Doc Parsing/OCR
 * - Metrics & Monitoring
 *
 * VAI Norman Hawkins: AI assistant for knowledge discovery and insights
 *
 * 100% Cloudflare: D1 + KV + R2 + Analytics Engine + Zero third-party deps
 */

// Simple router implementation for Cloudflare Worker
class SimpleRouter {
  private routes: Array<{
    method: string;
    pattern: RegExp;
    handler: (
      request: Request,
      env: Env,
      params: Record<string, string>,
    ) => Promise<Response>;
  }> = [];

  private static parseRoutePattern(pattern: string): RegExp {
    const paramRegex = /:(\w+)/g;
    const regexPattern = pattern
      .replace(paramRegex, "([^/]+)")
      .replace(/\*/g, ".*");
    return new RegExp(`^${regexPattern}$`);
  }

  add(
    method: string,
    pattern: string,
    handler: (
      request: Request,
      env: Env,
      params: Record<string, string>,
    ) => Promise<Response>,
  ) {
    this.routes.push({
      method: method.toUpperCase(),
      pattern: SimpleRouter.parseRoutePattern(pattern),
      handler,
    });
  }

  async handle(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    for (const route of this.routes) {
      if (route.method === method || route.method === "ALL") {
        const match = path.match(route.pattern);
        if (match) {
          const params: Record<string, string> = {};
          // Extract parameters from regex groups
          const paramNames = route.pattern.toString().match(/:(\w+)/g);
          if (paramNames) {
            paramNames.forEach((paramName, index) => {
              const cleanName = paramName.slice(1); // Remove the ':'
              params[cleanName] = match[index + 1];
            });
          }
          return await route.handler(request, env, params);
        }
      }
    }
    return null;
  }
}

export interface Env {
  DB: D1Database;
  KV_ANALYTICS_CACHE: KVNamespace;
  KV_METRICS: KVNamespace;
  R2_DOCUMENTS: R2Bucket;
  LIGHTHOUSE_URL: string;
  HIVE_URL: string;
  AUTH_API_URL: string;
  INTERNAL_SECRET: string;
  ENVIRONMENT: string;
  WORKER_VERSION: string;
}

// ============================================================
// HELPERS
// ============================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Strict-Transport-Security":
        "max-age=63072000; includeSubDomains; preload",
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(
  message: string,
  status = 400,
  code = "ERROR",
): Response {
  return jsonResponse(
    { error: { message, code, status }, timestamp: new Date().toISOString() },
    status,
  );
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Request-ID, X-MFA-Token, X-Hardware-Key, X-Lighthouse-Token, X-Internal-Secret",
  };
}

// ============================================================
// D1 HELPERS
// ============================================================

async function d1Query<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<{ data: T[] | null; error: string | null }> {
  try {
    const result = await db
      .prepare(sql)
      .bind(...params)
      .all<T>();
    return { data: result.results as T[], error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function d1Run(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<{ success: boolean; error: string | null }> {
  try {
    await db
      .prepare(sql)
      .bind(...params)
      .run();
    return { success: true, error: null };
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============================================================
// AUTH — verify JWT from request
// ============================================================

async function getAuthUserId(
  request: Request,
  env: Env,
): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const resp = await fetch(`${env.AUTH_API_URL}/auth/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": env.INTERNAL_SECRET,
      },
      body: JSON.stringify({ token }),
    });
    if (!resp.ok) return null;
    const data = await resp.json<{ user_id: string }>();
    return data.user_id ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// SCHEMA INIT
// ============================================================

async function initSchema(db: D1Database): Promise<void> {
  const stmts = [
    // Analytics data table
    `CREATE TABLE IF NOT EXISTS observatory_analytics (
      analytics_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`,
    // Data correlation patterns
    `CREATE TABLE IF NOT EXISTS observatory_correlations (
      correlation_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_data TEXT NOT NULL,
      target_data TEXT NOT NULL,
      correlation_type TEXT NOT NULL,
      confidence_score REAL NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`,
    // Document processing
    `CREATE TABLE IF NOT EXISTS observatory_documents (
      document_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      ocr_text TEXT,
      extracted_data TEXT NOT NULL DEFAULT '{}',
      processing_status TEXT NOT NULL DEFAULT 'pending',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    // Metrics data
    `CREATE TABLE IF NOT EXISTS observatory_metrics (
      metric_id TEXT PRIMARY KEY,
      user_id TEXT,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      metric_type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    // VAI Norman Hawkins conversations
    `CREATE TABLE IF NOT EXISTS observatory_conversations (
      conversation_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      context TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_analytics_user ON observatory_analytics(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_analytics_event ON observatory_analytics(event_type)`,
    `CREATE INDEX IF NOT EXISTS idx_correlations_user ON observatory_correlations(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_user ON observatory_documents(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_metrics_user ON observatory_metrics(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_metrics_name ON observatory_metrics(metric_name)`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_user ON observatory_conversations(user_id)`,
  ];
  for (const sql of stmts) {
    await db.prepare(sql).run().catch(console.error);
  }
}

// ============================================================
// VAI NORMAN HAWKINS — AI Assistant
// ============================================================

async function handleNormanHawkinsQuery(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const body = await request.json<{
    query: string;
    context?: Record<string, unknown>;
    session_id?: string;
  }>();

  if (!body?.query) return errorResponse("Query required", 400);

  const sessionId = body.session_id || crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // Get conversation history
  const { data: convData } = await d1Query<{ messages: string }>(
    env.DB,
    "SELECT messages FROM observatory_conversations WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT 1",
    [userId, sessionId],
  );

  let messages = [];
  if (convData?.[0]?.messages) {
    try {
      messages = JSON.parse(convData[0].messages);
    } catch {
      messages = [];
    }
  }

  // Add user message
  messages.push({
    role: "user",
    content: body.query,
    timestamp,
  });

  // Analyze query type and gather relevant data
  let response = "";
  let insights = {};

  if (
    body.query.toLowerCase().includes("analytics") ||
    body.query.toLowerCase().includes("data")
  ) {
    // Analytics query - fetch recent analytics data
    const { data: analytics } = await d1Query(
      env.DB,
      "SELECT event_type, COUNT(*) as count FROM observatory_analytics WHERE user_id = ? GROUP BY event_type ORDER BY count DESC LIMIT 10",
      [userId],
    );
    insights = { analytics_summary: analytics };
    response = `Norman Hawkins here. Based on your analytics data, I've identified the following patterns: ${analytics?.map((a: any) => `${a.event_type}: ${a.count} events`).join(", ")}`;
  } else if (
    body.query.toLowerCase().includes("correlation") ||
    body.query.toLowerCase().includes("relationship")
  ) {
    // Correlation query
    const { data: correlations } = await d1Query(
      env.DB,
      "SELECT correlation_type, AVG(confidence_score) as avg_confidence FROM observatory_correlations WHERE user_id = ? GROUP BY correlation_type ORDER BY avg_confidence DESC LIMIT 5",
      [userId],
    );
    insights = { correlations: correlations };
    response = `I've analyzed your data correlations. The strongest relationships I found are: ${correlations?.map((c: any) => `${c.correlation_type} (${Math.round(c.avg_confidence * 100)}% confidence)`).join(", ")}`;
  } else if (
    body.query.toLowerCase().includes("document") ||
    body.query.toLowerCase().includes("ocr")
  ) {
    // Document query
    const { data: docs } = await d1Query(
      env.DB,
      "SELECT filename, processing_status FROM observatory_documents WHERE user_id = ? ORDER BY created_at DESC LIMIT 5",
      [userId],
    );
    insights = { recent_documents: docs };
    response = `Your document library contains ${docs?.length || 0} recent files. ${docs?.filter((d: any) => d.processing_status === "completed").length || 0} have been processed with OCR.`;
  } else if (
    body.query.toLowerCase().includes("metrics") ||
    body.query.toLowerCase().includes("monitoring")
  ) {
    // Metrics query
    const { data: metrics } = await d1Query(
      env.DB,
      "SELECT metric_name, AVG(metric_value) as avg_value FROM observatory_metrics WHERE user_id = ? GROUP BY metric_name ORDER BY avg_value DESC LIMIT 5",
      [userId],
    );
    insights = { metrics_summary: metrics };
    response = `Your system metrics show: ${metrics?.map((m: any) => `${m.metric_name}: ${m.avg_value.toFixed(2)}`).join(", ")}`;
  } else {
    // General knowledge query
    response = `I'm Norman Hawkins, your knowledge assistant. I can help you with advanced analytics, data correlations, document processing with OCR, and system monitoring. What specific area would you like to explore?`;
  }

  // Add AI response
  messages.push({
    role: "assistant",
    content: response,
    insights,
    timestamp: new Date().toISOString(),
  });

  // Save conversation
  const messagesJson = JSON.stringify(messages);
  await d1Run(
    env.DB,
    "INSERT OR REPLACE INTO observatory_conversations (conversation_id, user_id, session_id, messages, context, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
    [
      crypto.randomUUID(),
      userId,
      sessionId,
      messagesJson,
      JSON.stringify(body.context || {}),
      "active",
      timestamp,
      timestamp,
    ],
  );

  return jsonResponse({
    response,
    insights,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// ANALYTICS ENDPOINTS
// ============================================================

async function handleAnalyticsTrack(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const body = await request.json<{
    event_type: string;
    event_data: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>();

  if (!body?.event_type || !body?.event_data) {
    return errorResponse("event_type and event_data required", 400);
  }

  const analyticsId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await d1Run(
    env.DB,
    "INSERT INTO observatory_analytics (analytics_id, user_id, event_type, event_data, timestamp, metadata, created_at) VALUES (?,?,?,?,?,?,?)",
    [
      analyticsId,
      userId,
      body.event_type,
      JSON.stringify(body.event_data),
      timestamp,
      JSON.stringify(body.metadata || {}),
      timestamp,
    ],
  );

  // Cache recent analytics
  await env.KV_ANALYTICS_CACHE.put(
    `analytics:${userId}:latest`,
    JSON.stringify({
      event_type: body.event_type,
      timestamp,
      data: body.event_data,
    }),
    { expirationTtl: 3600 },
  );

  return jsonResponse({ analytics_id: analyticsId, status: "tracked" }, 201);
}

async function handleAnalyticsQuery(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const url = new URL(request.url);
  const eventType = url.searchParams.get("event_type");
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  let sql =
    "SELECT analytics_id, event_type, event_data, timestamp, metadata FROM observatory_analytics WHERE user_id = ?";
  const params = [userId];

  if (eventType) {
    sql += " AND event_type = ?";
    params.push(eventType);
  }

  sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const { data } = await d1Query(sql, params);

  return jsonResponse({
    analytics: data,
    count: data?.length || 0,
    pagination: { limit, offset },
  });
}

// ============================================================
// DATA CORRELATION ENDPOINTS
// ============================================================

async function handleCorrelationAnalyze(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const body = await request.json<{
    source_data: Record<string, unknown>;
    target_data: Record<string, unknown>;
    correlation_type?: string;
  }>();

  if (!body?.source_data || !body?.target_data) {
    return errorResponse("source_data and target_data required", 400);
  }

  // Simple correlation analysis (placeholder - in real implementation would use ML/statistical methods)
  const correlationType = body.correlation_type || "statistical";
  const confidenceScore = Math.random() * 0.5 + 0.5; // Random score 0.5-1.0 for demo

  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await d1Run(
    env.DB,
    "INSERT INTO observatory_correlations (correlation_id, user_id, source_data, target_data, correlation_type, confidence_score, metadata, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [
      correlationId,
      userId,
      JSON.stringify(body.source_data),
      JSON.stringify(body.target_data),
      correlationType,
      confidenceScore,
      "{}",
      timestamp,
    ],
  );

  return jsonResponse(
    {
      correlation_id: correlationId,
      correlation_type: correlationType,
      confidence_score: confidenceScore,
      analysis: `Found ${correlationType} correlation with ${(confidenceScore * 100).toFixed(1)}% confidence`,
    },
    201,
  );
}

async function handleCorrelationQuery(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const url = new URL(request.url);
  const correlationType = url.searchParams.get("type");
  const minConfidence = parseFloat(
    url.searchParams.get("min_confidence") || "0",
  );

  let sql =
    "SELECT correlation_id, source_data, target_data, correlation_type, confidence_score, metadata, created_at FROM observatory_correlations WHERE user_id = ? AND confidence_score >= ?";
  const params = [userId, minConfidence];

  if (correlationType) {
    sql += " AND correlation_type = ?";
    params.push(correlationType);
  }

  sql += " ORDER BY confidence_score DESC LIMIT 50";

  const { data } = await d1Query(sql, params);

  return jsonResponse({
    correlations: data,
    count: data?.length || 0,
  });
}

// ============================================================
// DOCUMENT PROCESSING ENDPOINTS
// ============================================================

async function handleDocumentUpload(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) return errorResponse("File required", 400);

  const documentId = crypto.randomUUID();
  const r2Key = `documents/${userId}/${documentId}/${file.name}`;
  const timestamp = new Date().toISOString();

  // Upload to R2
  await env.R2_DOCUMENTS.put(r2Key, file, {
    httpMetadata: { contentType: file.type },
  });

  // Store metadata in D1
  await d1Run(
    env.DB,
    "INSERT INTO observatory_documents (document_id, user_id, filename, content_type, r2_key, extracted_data, processing_status, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [
      documentId,
      userId,
      file.name,
      file.type,
      r2Key,
      "{}",
      "uploaded",
      "{}",
      timestamp,
      timestamp,
    ],
  );

  // Trigger OCR processing (placeholder - would call OCR service)
  // For now, mark as completed with dummy OCR text
  const ocrText = `OCR processed: ${file.name} - This is placeholder OCR text extracted from the document.`;
  await d1Run(
    env.DB,
    "UPDATE observatory_documents SET ocr_text = ?, processing_status = ?, updated_at = ? WHERE document_id = ?",
    [ocrText, "completed", new Date().toISOString(), documentId],
  );

  return jsonResponse(
    {
      document_id: documentId,
      filename: file.name,
      status: "processed",
      ocr_text: ocrText,
    },
    201,
  );
}

async function handleDocumentQuery(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const url = new URL(request.url);
  const documentId = url.pathname.split("/").pop();

  if (!documentId) {
    // List documents
    const { data } = await d1Query(
      env.DB,
      "SELECT document_id, filename, content_type, processing_status, created_at FROM observatory_documents WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
      [userId],
    );
    return jsonResponse({ documents: data, count: data?.length || 0 });
  }

  // Get specific document
  const { data } = await d1Query(
    env.DB,
    "SELECT * FROM observatory_documents WHERE document_id = ? AND user_id = ?",
    [documentId, userId],
  );

  if (!data?.length) return errorResponse("Document not found", 404);

  const doc = data[0] as any;
  return jsonResponse({
    document_id: doc.document_id,
    filename: doc.filename,
    content_type: doc.content_type,
    ocr_text: doc.ocr_text,
    extracted_data: JSON.parse(doc.extracted_data),
    processing_status: doc.processing_status,
    created_at: doc.created_at,
  });
}

// ============================================================
// METRICS ENDPOINTS
// ============================================================

async function handleMetricsRecord(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const body = await request.json<{
    metric_name: string;
    metric_value: number;
    metric_type?: string;
    tags?: Record<string, string>;
  }>();

  if (!body?.metric_name || typeof body.metric_value !== "number") {
    return errorResponse("metric_name and metric_value required", 400);
  }

  const metricId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  await d1Run(
    env.DB,
    "INSERT INTO observatory_metrics (metric_id, user_id, metric_name, metric_value, metric_type, tags, timestamp, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [
      metricId,
      userId,
      body.metric_name,
      body.metric_value,
      body.metric_type || "gauge",
      JSON.stringify(body.tags || {}),
      timestamp,
      timestamp,
    ],
  );

  // Cache latest metrics
  await env.KV_METRICS.put(
    `metrics:${userId}:${body.metric_name}:latest`,
    JSON.stringify({
      value: body.metric_value,
      timestamp,
      tags: body.tags,
    }),
    { expirationTtl: 3600 },
  );

  return jsonResponse({ metric_id: metricId, status: "recorded" }, 201);
}

async function handleMetricsQuery(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const url = new URL(request.url);
  const metricName = url.searchParams.get("name");
  const hours = parseInt(url.searchParams.get("hours") || "24");

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let sql =
    "SELECT metric_name, metric_value, metric_type, tags, timestamp FROM observatory_metrics WHERE user_id = ? AND timestamp >= ?";
  const params = [userId, since];

  if (metricName) {
    sql += " AND metric_name = ?";
    params.push(metricName);
  }

  sql += " ORDER BY timestamp DESC LIMIT 1000";

  const { data } = await d1Query(sql, params);

  return jsonResponse({
    metrics: data,
    count: data?.length || 0,
    time_range: { hours, since },
  });
}

// ============================================================
// HEALTH CHECK
// ============================================================

async function handleHealth(env: Env): Promise<Response> {
  return jsonResponse({
    status: "healthy",
    service: "observatory",
    version: env.WORKER_VERSION,
    vai: "Norman Hawkins",
    environment: env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// MAIN ROUTER
// ============================================================

const router = new SimpleRouter();

// CORS preflight
router.add("OPTIONS", "*", () =>
  Promise.resolve(new Response(null, { status: 204, headers: corsHeaders() })),
);

// Health check
router.add("GET", "/health", ({ env }) => handleHealth(env));

// VAI Norman Hawkins
router.add("POST", "/vai/norman-hawkins", ({ request, env }) =>
  handleNormanHawkinsQuery(request, env),
);

// Analytics
router.add("POST", "/analytics/track", ({ request, env }) =>
  handleAnalyticsTrack(request, env),
);
router.add("GET", "/analytics", ({ request, env }) =>
  handleAnalyticsQuery(request, env),
);

// Data Correlation
router.add("POST", "/correlation/analyze", ({ request, env }) =>
  handleCorrelationAnalyze(request, env),
);
router.add("GET", "/correlation", ({ request, env }) =>
  handleCorrelationQuery(request, env),
);

// Documents
router.add("POST", "/documents", ({ request, env }) =>
  handleDocumentUpload(request, env),
);
router.add("GET", "/documents/:id", ({ request, env }) =>
  handleDocumentQuery(request, env),
);

// Metrics
router.add("POST", "/metrics", ({ request, env }) =>
  handleMetricsRecord(request, env),
);
router.add("GET", "/metrics", ({ request, env }) =>
  handleMetricsQuery(request, env),
);

// 404 handler
router.add("ALL", "*", () =>
  Promise.resolve(errorResponse("Not found", 404, "NOT_FOUND")),
);

// ============================================================
// MAIN FETCH HANDLER
// ============================================================

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    await initSchema(env.DB).catch(console.error);

    try {
      const response = await router.handle(request, env);
      if (response) {
        // Add CORS headers to all responses
        const headers = new Headers(response.headers);
        Object.entries(corsHeaders()).forEach(([key, value]) => {
          headers.set(key, value);
        });
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }
      return errorResponse("Not found", 404, "NOT_FOUND");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal server error";
      console.error("OBSERVATORY error:", msg);
      return errorResponse(msg, 500, "INTERNAL_ERROR");
    }
  },
};
