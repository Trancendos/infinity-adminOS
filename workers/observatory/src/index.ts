import { Ai } from "@cloudflare/ai";

export interface Env {
  AI: any; // Cloudflare AI binding
  DB: D1Database; // D1 for analytics data
  KV_KNOWLEDGE: KVNamespace; // KV for knowledge storage
}

async function initSchema(db: D1Database): Promise<void> {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS analytics_queries (
      query_id TEXT PRIMARY KEY,
      user_id TEXT,
      query TEXT NOT NULL,
      response TEXT,
      timestamp TEXT NOT NULL,
      latency_ms INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS analytics_documents (
      doc_id TEXT PRIMARY KEY,
      filename TEXT,
      extracted_text TEXT,
      processed_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS analytics_metrics (
      metric_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_queries_timestamp ON analytics_queries(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_docs_processed ON analytics_documents(processed_at)`,
  ];
  for (const sql of stmts) {
    await db.prepare(sql).run().catch(console.error);
  }
}

async function d1Query<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const result = await db
      .prepare(sql)
      .bind(...params)
      .all<T>();
    return result.results as T[];
  } catch {
    return [];
  }
}

async function d1Run(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await db
    .prepare(sql)
    .bind(...params)
    .run()
    .catch(console.error);
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    await initSchema(env.DB);

    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/analytics")) {
      return handleAnalytics(request, env);
    } else if (path.startsWith("/correlate")) {
      return handleCorrelate(request, env);
    } else if (path.startsWith("/parse")) {
      return handleParse(request, env);
    } else if (path.startsWith("/metrics")) {
      return handleMetrics(request, env);
    } else if (path.startsWith("/vai")) {
      return handleVAI(request, env);
    } else {
      return new Response("Welcome to The Observatory", { status: 200 });
    }
  },
};

async function handleAnalytics(request: Request, env: Env): Promise<Response> {
  // Advanced Analytics endpoint
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "overview";

  if (type === "queries") {
    const queries = await d1Query(
      env.DB,
      "SELECT COUNT(*) as total_queries, AVG(latency_ms) as avg_latency FROM analytics_queries WHERE timestamp > ?",
      [new Date(Date.now() - 86400000).toISOString()],
    );
    const topQueries = await d1Query(
      env.DB,
      "SELECT query, COUNT(*) as count FROM analytics_queries GROUP BY query ORDER BY count DESC LIMIT 10",
    );
    return new Response(
      JSON.stringify({
        total_queries: queries[0]?.total_queries || 0,
        avg_latency: queries[0]?.avg_latency || 0,
        top_queries: topQueries,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } else if (type === "documents") {
    const docs = await d1Query(
      env.DB,
      "SELECT COUNT(*) as total_docs FROM analytics_documents WHERE processed_at > ?",
      [new Date(Date.now() - 86400000).toISOString()],
    );
    return new Response(
      JSON.stringify({ total_documents: docs[0]?.total_docs || 0 }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } else {
    // Overview
    const [queryStats, docStats, metricStats] = await Promise.all([
      d1Query(env.DB, "SELECT COUNT(*) as count FROM analytics_queries"),
      d1Query(env.DB, "SELECT COUNT(*) as count FROM analytics_documents"),
      d1Query(
        env.DB,
        "SELECT name, AVG(value) as avg_value FROM analytics_metrics WHERE timestamp > ? GROUP BY name",
        [new Date(Date.now() - 3600000).toISOString()],
      ),
    ]);
    return new Response(
      JSON.stringify({
        queries_total: queryStats[0]?.count || 0,
        documents_total: docStats[0]?.count || 0,
        metrics: metricStats,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

async function handleCorrelate(request: Request, env: Env): Promise<Response> {
  // Data Correlation endpoint - correlate queries with documents or metrics
  const { data1, data2 } = await request.json();

  // Simple correlation: find related queries and documents
  const correlations = [];

  if (data1 === "queries" && data2 === "documents") {
    // Correlate recent queries with processed documents
    const recentQueries = await d1Query(
      env.DB,
      "SELECT query FROM analytics_queries WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 10",
      [new Date(Date.now() - 3600000).toISOString()],
    );
    const recentDocs = await d1Query(
      env.DB,
      "SELECT filename, extracted_text FROM analytics_documents WHERE processed_at > ? ORDER BY processed_at DESC LIMIT 10",
      [new Date(Date.now() - 3600000).toISOString()],
    );

    // Simple keyword matching
    for (const query of recentQueries) {
      const relatedDocs = recentDocs.filter((doc) =>
        doc.extracted_text?.toLowerCase().includes(query.query.toLowerCase()),
      );
      if (relatedDocs.length > 0) {
        correlations.push({
          query: query.query,
          related_documents: relatedDocs.map((d) => d.filename),
        });
      }
    }
  }

  return new Response(JSON.stringify({ correlations }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleParse(request: Request, env: Env): Promise<Response> {
  // Doc Parsing/OCR endpoint
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return new Response("Expected multipart/form-data", { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return new Response("No file provided", { status: 400 });
  }

  // Use Cloudflare AI for OCR
  const ai = env.AI;
  const input = {
    image: [...new Uint8Array(await file.arrayBuffer())],
    prompt: "Extract text from this image",
  };

  const response = await ai.run("@cf/llava-hf/llava-1.5-7b-hf", input);
  const text = response.description || "No text extracted";

  // Store in DB
  const docId = crypto.randomUUID();
  await d1Run(
    env.DB,
    "INSERT INTO analytics_documents (doc_id, filename, extracted_text, processed_at) VALUES (?, ?, ?, ?)",
    [docId, file.name, text, new Date().toISOString()],
  );

  return new Response(JSON.stringify({ extractedText: text, docId }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleMetrics(request: Request, env: Env): Promise<Response> {
  // Metrics & monitoring endpoint
  if (request.method === "GET") {
    // Get current metrics
    const metrics = await d1Query(
      env.DB,
      "SELECT name, value, timestamp FROM analytics_metrics ORDER BY timestamp DESC LIMIT 100",
    );
    return new Response(JSON.stringify({ metrics }), {
      headers: { "Content-Type": "application/json" },
    });
  } else if (request.method === "POST") {
    // Ingest metrics
    const { name, value } = await request.json();
    if (!name || typeof value !== "number") {
      return new Response("Invalid metric data", { status: 400 });
    }
    await d1Run(
      env.DB,
      "INSERT INTO analytics_metrics (metric_id, name, value, timestamp) VALUES (?, ?, ?, ?)",
      [crypto.randomUUID(), name, value, new Date().toISOString()],
    );
    return new Response(JSON.stringify({ status: "metric ingested" }), {
      headers: { "Content-Type": "application/json" },
    });
  } else {
    return new Response("Method not allowed", { status: 405 });
  }
}

async function handleVAI(request: Request, env: Env): Promise<Response> {
  // VAI Norman Hawkins endpoint
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { query } = await request.json();

  if (!query) {
    return new Response("Query required", { status: 400 });
  }

  const startTime = Date.now();

  // Retrieve relevant knowledge from KV
  const knowledgeKey = `knowledge:${query.toLowerCase().replace(/\s+/g, "_")}`;
  const storedKnowledge = await env.KV_KNOWLEDGE.get(knowledgeKey);

  // Use Cloudflare AI for response
  const messages = [
    {
      role: "system",
      content: `You are Norman Hawkins, an advanced AI assistant for The Observatory knowledge application. Provide helpful, accurate information based on available knowledge. ${storedKnowledge ? `Relevant knowledge: ${storedKnowledge}` : ""}`,
    },
    { role: "user", content: query },
  ];

  const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages,
  });
  const answer = response.response || "I cannot answer that at this time.";

  const latency = Date.now() - startTime;

  // Log the query
  await d1Run(
    env.DB,
    "INSERT INTO analytics_queries (query_id, query, response, timestamp, latency_ms) VALUES (?, ?, ?, ?, ?)",
    [crypto.randomUUID(), query, answer, new Date().toISOString(), latency],
  );

  return new Response(JSON.stringify({ answer, latency }), {
    headers: { "Content-Type": "application/json" },
  });
}
