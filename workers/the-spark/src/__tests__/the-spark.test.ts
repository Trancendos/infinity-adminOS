/**
 * The Spark MCP Skills Matrix Worker — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests skills matrix, capability tracking, VAI Imfy assistance,
 * CORS, auth, health check, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Minimal Env mock ─────────────────────────────────────────────
function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    SKILLS_MATRIX: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    AI: {
      run: vi.fn().mockResolvedValue({
        response: "Hello from mock AI",
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
    },
    AUTH_API_URL: "https://mock-auth.example.com",
    ENVIRONMENT: "test",
    ALLOWED_ORIGINS: "https://app.example.com",
    ...overrides,
  };
}

// ── Request helpers ──────────────────────────────────────────────
function makeRequest(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`https://the-spark.example.com${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://infinity-portal.pages.dev",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeAuthRequest(path: string, method = "GET", body?: unknown) {
  return makeRequest(path, method, body, {
    Authorization: "Bearer valid-token-123",
  });
}

// ── Import worker ────────────────────────────────────────────────
import worker from "../index";

// ═══════════════════════════════════════════════════════════════
// CORS & Security Headers
// ═══════════════════════════════════════════════════════════════
describe("CORS & Security Headers", () => {
  it("responds to OPTIONS preflight with 204", async () => {
    const req = new Request(
      "https://the-spark.example.com/api/v1/skills/matrix",
      {
        method: "OPTIONS",
        headers: { Origin: "https://infinity-portal.pages.dev" },
      },
    );
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
  });

  it("includes security headers in all responses", async () => {
    const req = makeRequest("/health");
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("allows infinity-portal.pages.dev origin", async () => {
    const req = makeRequest("/health");
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://infinity-portal.pages.dev",
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════
describe("Health Check", () => {
  it("GET /health returns healthy status", async () => {
    const res = await worker.fetch(makeRequest("/health"), makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("the-spark");
    expect(body.description).toContain("MCP Skills Matrix");
  });

  it("health check includes timestamp", async () => {
    const res = await worker.fetch(makeRequest("/health"), makeEnv());
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.timestamp).toBe("string");
    expect(new Date(body.timestamp as string).getTime()).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Skills Matrix
// ═══════════════════════════════════════════════════════════════
describe("Skills Matrix", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: "usr-1", role: "user" }), {
            status: 200,
          }),
        ),
    );
  });

  it("GET /api/v1/skills/matrix returns skills matrix", async () => {
    const env = makeEnv({
      SKILLS_MATRIX: {
        get: vi.fn().mockResolvedValue(
          JSON.stringify({
            "agent-1": {
              skills: [
                {
                  agentId: "agent-1",
                  skillName: "coding",
                  category: "technical",
                  proficiency: "expert",
                },
              ],
              lastActive: "2024-01-01T00:00:00.000Z",
              totalCapabilities: 1,
            },
          }),
        ),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/skills/matrix"),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.matrix).toBeDefined();
    expect(body.totalAgents).toBe(1);
  });

  it("GET /api/v1/skills/agent/:id returns agent skills", async () => {
    const env = makeEnv({
      SKILLS_MATRIX: {
        get: vi.fn().mockResolvedValue(
          JSON.stringify({
            "agent-123": {
              skills: [
                {
                  agentId: "agent-123",
                  skillName: "coding",
                  category: "technical",
                  proficiency: "expert",
                },
              ],
              lastActive: "2024-01-01T00:00:00.000Z",
              totalCapabilities: 1,
            },
          }),
        ),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/skills/agent/agent-123"),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.agentId).toBe("agent-123");
    expect(Array.isArray(body.skills)).toBe(true);
  });

  it("GET /api/v1/skills/agent/:id returns 404 for unknown agent", async () => {
    const env = makeEnv({
      SKILLS_MATRIX: {
        get: vi.fn().mockResolvedValue(JSON.stringify({})),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/skills/agent/unknown"),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/v1/skills/register updates agent skills", async () => {
    const env = makeEnv({
      SKILLS_MATRIX: {
        get: vi.fn().mockResolvedValue(JSON.stringify({})),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/skills/register", "POST", {
        agentId: "agent-1",
        skills: [
          {
            skillName: "coding",
            category: "technical",
            proficiency: "expert",
            description: "Expert coding skills",
          },
        ],
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.message).toContain("registered successfully");
    expect(body.agentId).toBe("agent-1");
  });
});

// ═══════════════════════════════════════════════════════════════
// Capability Tracking
// ═══════════════════════════════════════════════════════════════
describe("Capability Tracking", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: "usr-1", role: "user" }), {
            status: 200,
          }),
        ),
    );
  });

  it("GET /api/v1/capabilities returns tracking data", async () => {
    const env = makeEnv({
      SKILLS_MATRIX: {
        get: vi
          .fn()
          .mockResolvedValue(
            JSON.stringify([
              {
                capabilityId: "cap-1",
                agentId: "agent-1",
                skillName: "coding",
                success: true,
              },
            ]),
          ),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/capabilities"),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.tracking)).toBe(true);
    expect(body.totalEntries).toBe(1);
  });

  it("POST /api/v1/capabilities/track adds tracking entry", async () => {
    const env = makeEnv({
      SKILLS_MATRIX: {
        get: vi.fn().mockResolvedValue(JSON.stringify([])),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/capabilities/track", "POST", {
        capabilityId: "cap-1",
        agentId: "agent-1",
        skillName: "coding",
        success: true,
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.message).toContain("tracked successfully");
  });
});

// ═══════════════════════════════════════════════════════════════
// VAI Imfy Assistance
// ═══════════════════════════════════════════════════════════════
describe("VAI Imfy Assistance", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: "usr-1", role: "user" }), {
            status: 200,
          }),
        ),
    );
  });

  it("POST /api/v1/imfy/assist returns AI assistance", async () => {
    const env = makeEnv({
      SKILLS_MATRIX: {
        get: vi.fn().mockResolvedValue(JSON.stringify({})),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/imfy/assist", "POST", {
        query: "Help me with coding tasks",
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.assistance).toBeDefined();
    expect(body.context).toBeDefined();
  });

  it("VAI Imfy requires query parameter", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/imfy/assist", "POST", {}),
      env,
    );
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth Guard
// ═══════════════════════════════════════════════════════════════
describe("Auth Guard", () => {
  it("returns 401 when no auth token provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          }),
        ),
    );
    const res = await worker.fetch(
      makeRequest("/api/v1/skills/matrix"),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("allows request through when auth succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: "usr-1", role: "user" }), {
            status: 200,
          }),
        ),
    );
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/skills/matrix"),
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════
describe("Error Handling", () => {
  it("returns 404 for unknown routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: "usr-1", role: "user" }), {
            status: 200,
          }),
        ),
    );
    const res = await worker.fetch(
      makeAuthRequest("/unknown/route"),
      makeEnv(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 with obscured error in production", async () => {
    const env = makeEnv({ ENVIRONMENT: "production" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );
    const res = await worker.fetch(
      makeAuthRequest("/api/v1/skills/matrix"),
      env,
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Internal server error");
  });
});
