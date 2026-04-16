/**
 * THE LIBRARY Cloudflare Worker — Phase 29 Cloudflare-Native Refactor
 * Knowledge Base & Wiki Consolidation
 * VAI Zimik: AI-Powered Knowledge Management
 *
 * 100% Cloudflare: D1 (knowledge) + KV (cache) + R2 (documents) + Zero third-party deps
 */

export interface Env {
  DB: D1Database;
  KV_KNOWLEDGE_CACHE: KVNamespace;
  KV_RATE_LIMIT: KVNamespace;
  R2_DOCUMENTS: R2Bucket;
  LIGHTHOUSE_URL: string;
  HIVE_URL: string;
  INFINITY_ONE_URL: string;
  ZIMIK_API_KEY: string;
  ENVIRONMENT: string;
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
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
// RATE LIMITING
// ============================================================

async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  max: number,
  window: number,
): Promise<boolean> {
  const k = `rl:${key}`;
  const cur = parseInt((await kv.get(k)) ?? "0", 10);
  if (cur >= max) return false;
  await kv.put(k, String(cur + 1), { expirationTtl: window });
  return true;
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
    // Verify with auth-api
    const resp = await fetch(`${env.INFINITY_ONE_URL}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    `CREATE TABLE IF NOT EXISTS library_knowledge (
      knowledge_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'article',
      category TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      owner_id TEXT,
      r2_key TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS library_wiki_pages (
      page_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'main',
      links TEXT NOT NULL DEFAULT '[]',
      owner_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS library_consolidations (
      consolidation_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sources TEXT NOT NULL DEFAULT '[]',
      result TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      owner_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS library_refinery_jobs (
      job_id TEXT PRIMARY KEY,
      input TEXT NOT NULL,
      operation TEXT NOT NULL,
      result TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      owner_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_library_knowledge_owner ON library_knowledge(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_library_wiki_owner ON library_wiki_pages(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_library_consolidations_owner ON library_consolidations(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_library_refinery_owner ON library_refinery_jobs(owner_id)`,
  ];
  for (const sql of stmts) {
    await db.prepare(sql).run().catch(console.error);
  }
}

// ============================================================
// ZIMIK AI — Mock for now
// ============================================================

async function callZimikAI(prompt: string, env: Env): Promise<string> {
  // Mock AI response for refinery
  // In real implementation, call external AI API with ZIMIK_API_KEY
  const responses = [
    "Consolidated knowledge: This combines multiple sources into a coherent article.",
    "Refined summary: Key points extracted and organized.",
    "AI analysis: Identified patterns and relationships in the data.",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// ============================================================
// KNOWLEDGE BASE HANDLERS
// ============================================================

async function handleCreateKnowledge(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const rl = await checkRateLimit(
    env.KV_RATE_LIMIT,
    `create:${userId}`,
    50,
    3600,
  );
  if (!rl) return errorResponse("Rate limit exceeded", 429, "RATE_LIMIT");

  const body = await request.json<{
    title: string;
    content: string;
    type?: string;
    category?: string;
    tags?: string[];
    metadata?: unknown;
  }>();

  if (!body?.title || !body?.content)
    return errorResponse("title and content required", 400);

  const knowledgeId = crypto.randomUUID();
  const now = new Date().toISOString();
  let r2Key: string | undefined;

  // If content is large, store in R2
  if (body.content.length > 10000) {
    r2Key = `knowledge/${userId}/${knowledgeId}`;
    await env.R2_DOCUMENTS.put(r2Key, body.content, {
      httpMetadata: { contentType: "text/plain" },
    });
  }

  await d1Run(
    env.DB,
    "INSERT INTO library_knowledge (knowledge_id, title, content, type, category, tags, owner_id, r2_key, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [
      knowledgeId,
      body.title,
      r2Key ? "" : body.content,
      body.type ?? "article",
      body.category ?? null,
      JSON.stringify(body.tags ?? []),
      userId,
      r2Key ?? null,
      JSON.stringify(body.metadata ?? {}),
      now,
      now,
    ],
  );

  return jsonResponse(
    {
      knowledge_id: knowledgeId,
      title: body.title,
      status: "active",
      created_at: now,
    },
    201,
  );
}

async function handleGetKnowledge(
  knowledgeId: string,
  userId: string,
  env: Env,
): Promise<Response> {
  const { data } = await d1Query(
    env.DB,
    "SELECT * FROM library_knowledge WHERE knowledge_id = ?",
    [knowledgeId],
  );
  if (!data?.length)
    return errorResponse("Knowledge not found", 404, "NOT_FOUND");
  const item = data[0] as {
    owner_id: string;
    r2_key: string | null;
    content: string;
  };
  if (item.owner_id !== userId)
    return errorResponse("Forbidden", 403, "FORBIDDEN");

  let content = item.content;
  if (item.r2_key) {
    const obj = await env.R2_DOCUMENTS.get(item.r2_key);
    content = obj ? await obj.text() : "";
  }

  return jsonResponse({ ...item, content });
}

async function handleListKnowledge(
  userId: string,
  env: Env,
): Promise<Response> {
  const { data } = await d1Query(
    env.DB,
    "SELECT knowledge_id, title, type, category, tags, created_at, updated_at FROM library_knowledge WHERE owner_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 100",
    [userId],
  );
  return jsonResponse({ knowledge: data ?? [], count: data?.length ?? 0 });
}

// ============================================================
// WIKI CONSOLIDATION HANDLERS
// ============================================================

async function handleCreateWikiPage(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const body = await request.json<{
    title: string;
    content: string;
    namespace?: string;
    links?: string[];
    metadata?: unknown;
  }>();

  if (!body?.title || !body?.content)
    return errorResponse("title and content required", 400);

  const pageId = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1Run(
    env.DB,
    "INSERT INTO library_wiki_pages (page_id, title, content, namespace, links, owner_id, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      pageId,
      body.title,
      body.content,
      body.namespace ?? "main",
      JSON.stringify(body.links ?? []),
      userId,
      JSON.stringify(body.metadata ?? {}),
      now,
      now,
    ],
  );

  return jsonResponse(
    { page_id: pageId, title: body.title, created_at: now },
    201,
  );
}

async function handleConsolidateWiki(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const body = await request.json<{
    name: string;
    description?: string;
    source_page_ids: string[];
  }>();

  if (!body?.name || !body?.source_page_ids?.length)
    return errorResponse("name and source_page_ids required", 400);

  // Fetch source pages
  const placeholders = body.source_page_ids.map(() => "?").join(",");
  const { data: sources } = await d1Query<{ title: string; content: string }>(
    env.DB,
    `SELECT title, content FROM library_wiki_pages WHERE page_id IN (${placeholders}) AND owner_id = ?`,
    [...body.source_page_ids, userId],
  );

  if (!sources?.length)
    return errorResponse("No valid source pages found", 400);

  // Consolidate content
  const consolidated = sources
    .map((s) => `# ${s.title}\n\n${s.content}`)
    .join("\n\n---\n\n");

  const consolidationId = crypto.randomUUID();
  const now = new Date().toISOString();

  await d1Run(
    env.DB,
    "INSERT INTO library_consolidations (consolidation_id, name, description, sources, result, status, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      consolidationId,
      body.name,
      body.description ?? null,
      JSON.stringify(body.source_page_ids),
      consolidated,
      "completed",
      userId,
      now,
      now,
    ],
  );

  return jsonResponse(
    {
      consolidation_id: consolidationId,
      name: body.name,
      status: "completed",
      created_at: now,
    },
    201,
  );
}

// ============================================================
// REFINERY HANDLERS
// ============================================================

async function handleRefineContent(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await getAuthUserId(request, env);
  if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

  const body = await request.json<{
    input: string;
    operation: string; // e.g., 'summarize', 'categorize', 'extract'
  }>();

  if (!body?.input || !body?.operation)
    return errorResponse("input and operation required", 400);

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Call Zimik AI
  const result = await callZimikAI(
    `Operation: ${body.operation}\nInput: ${body.input}`,
    env,
  );

  await d1Run(
    env.DB,
    "INSERT INTO library_refinery_jobs (job_id, input, operation, result, status, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [jobId, body.input, body.operation, result, "completed", userId, now, now],
  );

  return jsonResponse(
    {
      job_id: jobId,
      operation: body.operation,
      result,
      status: "completed",
      created_at: now,
    },
    201,
  );
}

async function handleGetRefineryJob(
  jobId: string,
  userId: string,
  env: Env,
): Promise<Response> {
  const { data } = await d1Query(
    env.DB,
    "SELECT * FROM library_refinery_jobs WHERE job_id = ?",
    [jobId],
  );
  if (!data?.length) return errorResponse("Job not found", 404, "NOT_FOUND");
  const job = data[0] as { owner_id: string };
  if (job.owner_id !== userId)
    return errorResponse("Forbidden", 403, "FORBIDDEN");
  return jsonResponse(data[0]);
}

// ============================================================
// MAIN FETCH HANDLER
// ============================================================

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    await initSchema(env.DB).catch(console.error);

    try {
      // Health check
      if (method === "GET" && path === "/health") {
        return jsonResponse({
          status: "healthy",
          service: "library",
          version: "1.0.0",
          environment: env.ENVIRONMENT,
          timestamp: new Date().toISOString(),
        });
      }

      // Auth required for all other routes
      const userId = await getAuthUserId(request, env);
      if (!userId) return errorResponse("Unauthorized", 401, "UNAUTHORIZED");

      // Knowledge base
      if (method === "POST" && path === "/knowledge")
        return handleCreateKnowledge(request, env);
      if (method === "GET" && path === "/knowledge")
        return handleListKnowledge(userId, env);

      const knowledgeMatch = path.match(/^\/knowledge\/([\w-]+)$/);
      if (knowledgeMatch && method === "GET")
        return handleGetKnowledge(knowledgeMatch[1], userId, env);

      // Wiki
      if (method === "POST" && path === "/wiki/pages")
        return handleCreateWikiPage(request, env);
      if (method === "POST" && path === "/wiki/consolidate")
        return handleConsolidateWiki(request, env);

      // Refinery
      if (method === "POST" && path === "/refinery")
        return handleRefineContent(request, env);

      const refineryMatch = path.match(/^\/refinery\/([\w-]+)$/);
      if (refineryMatch && method === "GET")
        return handleGetRefineryJob(refineryMatch[1], userId, env);

      return errorResponse("Not found", 404, "NOT_FOUND");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal server error";
      console.error("LIBRARY error:", msg);
      return errorResponse(msg, 500, "INTERNAL_ERROR");
    }
  },
};
