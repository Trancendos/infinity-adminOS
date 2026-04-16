// ============================================================
// Infinity OS — The Spark MCP Skills Matrix Worker
// ============================================================
// VAI Imfy — AI Agent Skills Matrix and Capability Tracking
// Routes:
//   GET  /health
//   GET  /api/v1/skills/matrix        — Get full skills matrix
//   GET  /api/v1/skills/agent/:id     — Get agent skills
//   POST /api/v1/skills/register      — Register agent skills
//   GET  /api/v1/capabilities         — Get capability tracking
//   POST /api/v1/capabilities/track   — Track capability usage
//   GET  /api/v1/imfy/assist          — VAI Imfy assistance
// ============================================================

export interface Env {
  SKILLS_MATRIX: KVNamespace;
  AI: Ai;
  AUTH_API_URL: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
}

interface AgentSkill {
  agentId: string;
  skillName: string;
  category: string;
  proficiency: "beginner" | "intermediate" | "advanced" | "expert";
  description: string;
  lastUpdated: string;
  usageCount: number;
}

interface CapabilityTracking {
  capabilityId: string;
  agentId: string;
  skillName: string;
  success: boolean;
  timestamp: string;
  context?: string;
}

interface SkillsMatrix {
  [agentId: string]: {
    skills: AgentSkill[];
    lastActive: string;
    totalCapabilities: number;
  };
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = [
    "https://infinity-portal.pages.dev",
    "https://infinity-portal.com",
    "http://localhost:5173",
    "http://localhost:3000",
    ...(env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()),
  ];
  if (allowed.includes(origin) || origin.endsWith(".infinity-portal.pages.dev"))
    return origin;
  return null;
}

function jsonResponse(
  data: unknown,
  status = 200,
  request?: Request,
  env?: Env,
): Response {
  const origin = request && env ? getAllowedOrigin(request, env) : null;
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SECURITY_HEADERS,
      ...(origin
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Credentials": "true",
          }
        : {}),
    },
  });
}

async function verifyToken(
  request: Request,
  env: Env,
): Promise<{ userId: string; role: string } | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const authApiUrl =
      env.AUTH_API_URL ||
      "https://infinity-auth-api.luminous-aimastermind.workers.dev";
    const res = await fetch(`${authApiUrl}/api/v1/auth/me`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id: string; role: string };
    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}

async function getSkillsMatrix(env: Env): Promise<SkillsMatrix> {
  const matrixData = await env.SKILLS_MATRIX.get("skills_matrix");
  return matrixData ? JSON.parse(matrixData) : {};
}

async function saveSkillsMatrix(matrix: SkillsMatrix, env: Env): Promise<void> {
  await env.SKILLS_MATRIX.put("skills_matrix", JSON.stringify(matrix));
}

async function getCapabilityTracking(env: Env): Promise<CapabilityTracking[]> {
  const trackingData = await env.SKILLS_MATRIX.get("capability_tracking");
  return trackingData ? JSON.parse(trackingData) : [];
}

async function saveCapabilityTracking(
  tracking: CapabilityTracking[],
  env: Env,
): Promise<void> {
  await env.SKILLS_MATRIX.put("capability_tracking", JSON.stringify(tracking));
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === "OPTIONS") {
      const origin = getAllowedOrigin(request, env);
      return new Response(null, {
        status: 204,
        headers: {
          ...(origin
            ? {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods":
                  "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Max-Age": "86400",
              }
            : {}),
          ...SECURITY_HEADERS,
        },
      });
    }

    try {
      // Health check — no auth required
      if (pathname === "/health" || pathname === "/api/health") {
        return jsonResponse(
          {
            status: "healthy",
            service: "the-spark",
            description: "MCP Skills Matrix and VAI Imfy",
            environment: env.ENVIRONMENT,
            timestamp: new Date().toISOString(),
          },
          200,
          request,
          env,
        );
      }

      // Auth required for all other endpoints
      const user = await verifyToken(request, env);
      if (!user) {
        return jsonResponse(
          { error: "Authentication required" },
          401,
          request,
          env,
        );
      }

      // Get full skills matrix
      if (pathname === "/api/v1/skills/matrix" && request.method === "GET") {
        const matrix = await getSkillsMatrix(env);
        return jsonResponse(
          {
            matrix,
            totalAgents: Object.keys(matrix).length,
            timestamp: new Date().toISOString(),
          },
          200,
          request,
          env,
        );
      }

      // Get agent skills
      if (
        pathname.startsWith("/api/v1/skills/agent/") &&
        request.method === "GET"
      ) {
        const agentId = pathname.split("/api/v1/skills/agent/")[1];
        const matrix = await getSkillsMatrix(env);
        const agentData = matrix[agentId];

        if (!agentData) {
          return jsonResponse({ error: "Agent not found" }, 404, request, env);
        }

        return jsonResponse(
          {
            agentId,
            skills: agentData.skills,
            lastActive: agentData.lastActive,
            totalCapabilities: agentData.totalCapabilities,
          },
          200,
          request,
          env,
        );
      }

      // Register/update agent skills
      if (pathname === "/api/v1/skills/register" && request.method === "POST") {
        const body = (await request.json()) as {
          agentId: string;
          skills: Omit<AgentSkill, "agentId" | "lastUpdated">[];
        };

        if (!body.agentId || !body.skills?.length) {
          return jsonResponse(
            { error: "agentId and skills array required" },
            400,
            request,
            env,
          );
        }

        const matrix = await getSkillsMatrix(env);
        const now = new Date().toISOString();

        // Initialize or update agent entry
        if (!matrix[body.agentId]) {
          matrix[body.agentId] = {
            skills: [],
            lastActive: now,
            totalCapabilities: 0,
          };
        }

        // Update skills
        body.skills.forEach((skillData) => {
          const existingSkillIndex = matrix[body.agentId].skills.findIndex(
            (s) => s.skillName === skillData.skillName,
          );

          const skill: AgentSkill = {
            ...skillData,
            agentId: body.agentId,
            lastUpdated: now,
            usageCount:
              existingSkillIndex >= 0
                ? matrix[body.agentId].skills[existingSkillIndex].usageCount
                : 0,
          };

          if (existingSkillIndex >= 0) {
            matrix[body.agentId].skills[existingSkillIndex] = skill;
          } else {
            matrix[body.agentId].skills.push(skill);
          }
        });

        matrix[body.agentId].lastActive = now;
        matrix[body.agentId].totalCapabilities =
          matrix[body.agentId].skills.length;

        await saveSkillsMatrix(matrix, env);

        return jsonResponse(
          {
            message: "Skills registered successfully",
            agentId: body.agentId,
            skillCount: matrix[body.agentId].skills.length,
          },
          200,
          request,
          env,
        );
      }

      // Get capability tracking
      if (pathname === "/api/v1/capabilities" && request.method === "GET") {
        const tracking = await getCapabilityTracking(env);
        return jsonResponse(
          {
            tracking,
            totalEntries: tracking.length,
            timestamp: new Date().toISOString(),
          },
          200,
          request,
          env,
        );
      }

      // Track capability usage
      if (
        pathname === "/api/v1/capabilities/track" &&
        request.method === "POST"
      ) {
        const body = (await request.json()) as CapabilityTracking;

        if (!body.capabilityId || !body.agentId || !body.skillName) {
          return jsonResponse(
            { error: "capabilityId, agentId, and skillName required" },
            400,
            request,
            env,
          );
        }

        const tracking = await getCapabilityTracking(env);
        const newEntry: CapabilityTracking = {
          ...body,
          timestamp: body.timestamp || new Date().toISOString(),
        };

        tracking.push(newEntry);

        // Keep only last 1000 entries to prevent unbounded growth
        if (tracking.length > 1000) {
          tracking.splice(0, tracking.length - 1000);
        }

        await saveCapabilityTracking(tracking, env);

        return jsonResponse(
          {
            message: "Capability tracked successfully",
            capabilityId: body.capabilityId,
          },
          200,
          request,
          env,
        );
      }

      // VAI Imfy assistance endpoint
      if (pathname === "/api/v1/imfy/assist" && request.method === "POST") {
        const body = (await request.json()) as {
          query: string;
          context?: string;
          agentId?: string;
        };

        if (!body.query) {
          return jsonResponse({ error: "query required" }, 400, request, env);
        }

        const matrix = await getSkillsMatrix(env);
        const tracking = await getCapabilityTracking(env);

        // Generate context for VAI Imfy
        const context = {
          availableAgents: Object.keys(matrix).length,
          totalSkills: Object.values(matrix).reduce(
            (sum, agent) => sum + agent.skills.length,
            0,
          ),
          recentActivity: tracking.slice(-10),
          query: body.query,
          userContext: body.context,
          requestingAgent: body.agentId,
        };

        // Use AI to generate intelligent assistance response
        const prompt = `You are VAI Imfy, an AI assistant for the MCP Skills Matrix system. Help with the following query using the available context:

Context: ${JSON.stringify(context, null, 2)}

User Query: ${body.query}

Provide helpful, actionable assistance based on the skills matrix and capability tracking data. Suggest relevant agents or skills that could help with this request.`;

        // @ts-ignore — CF AI binding
        const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [{ role: "user", content: prompt }],
          max_tokens: 512,
        });

        return jsonResponse(
          {
            assistance: aiResponse.response || aiResponse,
            context: {
              availableAgents: Object.keys(matrix).length,
              totalSkills: Object.values(matrix).reduce(
                (sum, agent) => sum + agent.skills.length,
                0,
              ),
            },
            timestamp: new Date().toISOString(),
          },
          200,
          request,
          env,
        );
      }

      return jsonResponse(
        { error: `Route not found: ${request.method} ${pathname}` },
        404,
        request,
        env,
      );
    } catch (err) {
      console.error("The Spark error:", err);
      return jsonResponse(
        {
          error:
            env.ENVIRONMENT === "production"
              ? "Internal server error"
              : String(err),
        },
        500,
        request,
        env,
      );
    }
  },
};
