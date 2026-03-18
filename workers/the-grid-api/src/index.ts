import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

interface Env {
  DPID: string;
  SERVICE_VERSION: string;
  COVERT_SYNTHESIS_URL: string;
  SLIPSTREAM_CLASS: string;
  HIVE_AGENT_COUNT: string;
}

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({ origin: "*" }));
app.use("*", logger());

// ── Queen's Hive ─────────────────────────────────────────────────────────────
type AgentRole = "QUEEN" | "ORACLE" | "GUARDIAN" | "ECONOMIST" | "ETHICIST" | "ARCHITECT" | "NAVIGATOR";
type AgentStatus = "ACTIVE" | "DELIBERATING" | "STANDBY" | "SYNCING";

interface HiveAgent {
  id: string;
  role: AgentRole;
  name: string;
  status: AgentStatus;
  intelligence_score: number;
  tasks_completed: number;
  consensus_votes: number;
  last_signal: string;
  specialisation: string;
  connected_to: string[];
}

interface HiveConsensus {
  topic: string;
  votes: Record<AgentRole, "APPROVE" | "REJECT" | "ABSTAIN">;
  outcome: "APPROVED" | "REJECTED" | "PENDING";
  quorum: number;
  timestamp: string;
}

const HIVE_AGENTS: HiveAgent[] = [
  { id: "QH-001", role: "QUEEN",     name: "Sovereign",  status: "ACTIVE",       intelligence_score: 98.7, tasks_completed: 4821, consensus_votes: 892, last_signal: new Date().toISOString(),            specialisation: "Meta-coordination + emergent strategy synthesis", connected_to: ["QH-002","QH-003","QH-004","QH-005","QH-006","QH-007"] },
  { id: "QH-002", role: "ORACLE",    name: "Foresight",  status: "DELIBERATING", intelligence_score: 94.2, tasks_completed: 3210, consensus_votes: 756, last_signal: new Date(Date.now()-2000).toISOString(), specialisation: "Temporal pattern recognition + predictive modelling",  connected_to: ["QH-001","QH-003"] },
  { id: "QH-003", role: "GUARDIAN",  name: "Sentinel",   status: "ACTIVE",       intelligence_score: 96.1, tasks_completed: 2987, consensus_votes: 801, last_signal: new Date(Date.now()-500).toISOString(),  specialisation: "Threat neutralisation + TIGA policy enforcement",  connected_to: ["QH-001","QH-002","QH-004"] },
  { id: "QH-004", role: "ECONOMIST", name: "Cornelius",  status: "ACTIVE",       intelligence_score: 92.8, tasks_completed: 3654, consensus_votes: 712, last_signal: new Date(Date.now()-1000).toISOString(), specialisation: "TRAN economics + FAST circuit breaker arbitration", connected_to: ["QH-001","QH-003","QH-005"] },
  { id: "QH-005", role: "ETHICIST",  name: "Axiom",      status: "SYNCING",      intelligence_score: 95.3, tasks_completed: 1892, consensus_votes: 634, last_signal: new Date(Date.now()-3000).toISOString(), specialisation: "ISO 42001 alignment + value drift detection",       connected_to: ["QH-001","QH-004","QH-006"] },
  { id: "QH-006", role: "ARCHITECT", name: "Blueprint",  status: "ACTIVE",       intelligence_score: 91.5, tasks_completed: 2341, consensus_votes: 589, last_signal: new Date(Date.now()-800).toISOString(),  specialisation: "Infrastructure topology + DePIN orchestration",   connected_to: ["QH-001","QH-005","QH-007"] },
  { id: "QH-007", role: "NAVIGATOR", name: "Meridian",   status: "STANDBY",      intelligence_score: 89.4, tasks_completed: 1674, consensus_votes: 521, last_signal: new Date(Date.now()-5000).toISOString(), specialisation: "Carbon-aware routing + Slipstream path optimisation", connected_to: ["QH-001","QH-006"] },
];

app.get("/health", (c) => c.json({
  status: "operational",
  service: "the-grid-api",
  dpid: c.env.DPID,
  version: c.env.SERVICE_VERSION,
  hive_agents: parseInt(c.env.HIVE_AGENT_COUNT),
  timestamp: new Date().toISOString(),
}));

app.get("/hive/agents", (c) => {
  const role = c.req.query("role");
  const status = c.req.query("status");
  let agents = HIVE_AGENTS;
  if (role)   agents = agents.filter(a => a.role === role.toUpperCase());
  if (status) agents = agents.filter(a => a.status === status.toUpperCase());
  return c.json({
    agents,
    count: agents.length,
    avg_intelligence: Math.round(agents.reduce((s,a)=>s+a.intelligence_score,0)/agents.length*10)/10,
    active_count: HIVE_AGENTS.filter(a=>a.status==="ACTIVE").length,
  });
});

app.get("/hive/agents/:id", (c) => {
  const agent = HIVE_AGENTS.find(a => a.id === c.req.param("id"));
  if (!agent) return c.json({ error: "Agent not found" }, 404);
  return c.json(agent);
});

app.get("/hive/consensus", (c) => {
  const roles: AgentRole[] = ["QUEEN","ORACLE","GUARDIAN","ECONOMIST","ETHICIST","ARCHITECT","NAVIGATOR"];
  const topics = [
    "FAST Circuit Breaker Override — Revenue recovery protocol activation",
    "COVERT Threat Level Upgrade — Class-3 to Class-5 escalation",
    "Carbon Router Emergency — RED zone containment",
    "PQC Key Rotation — ML-KEM-768 emergency re-keying",
    "New Location Onboarding — L24-AetherCourt provisioning",
  ];
  const topic = topics[Math.floor(Math.random() * topics.length)];
  const votes: Record<AgentRole, "APPROVE" | "REJECT" | "ABSTAIN"> = {} as any;
  let approvals = 0;
  for (const role of roles) {
    const v = Math.random() > 0.35 ? "APPROVE" : Math.random() > 0.5 ? "REJECT" : "ABSTAIN";
    votes[role] = v;
    if (v === "APPROVE") approvals++;
  }
  return c.json({
    topic,
    votes,
    outcome: approvals >= 5 ? "APPROVED" : approvals >= 3 ? "PENDING" : "REJECTED",
    quorum: Math.round(approvals / roles.length * 100),
    timestamp: new Date().toISOString(),
  } as HiveConsensus);
});

// ── HAX Threat Matrix ────────────────────────────────────────────────────────
type ThreatClass = "CLASS_1" | "CLASS_2" | "CLASS_3" | "CLASS_4" | "CLASS_5" | "CLASS_6" | "CLASS_7";
type NeutralMode = "PASSIVE" | "ACTIVE" | "AGGRESSIVE" | "LOCKDOWN";

interface HAXSignal {
  id: string;
  threat_class: ThreatClass;
  source: string;
  target: string;
  description: string;
  confidence: number;
  severity: number;
  neutralisation_mode: NeutralMode;
  detected_at: string;
  resolved: boolean;
  vector: string;
}

const THREAT_SOURCES = ["external-probe","supply-chain","social-eng","insider","state-actor","ai-adversary","quantum-attack"];
const THREAT_VECTORS = ["network","endpoint","identity","data","application","physical","cognitive"];

function randomThreat(i: number): HAXSignal {
  const severity = Math.round(10 + Math.random() * 90);
  const tc: ThreatClass = (`CLASS_${Math.ceil(severity/14.3).toString().replace("8","7")}`) as ThreatClass;
  const mode: NeutralMode = severity > 75 ? "AGGRESSIVE" : severity > 50 ? "ACTIVE" : severity > 25 ? "PASSIVE" : "PASSIVE";
  return {
    id: `HAX-${(2000+i).toString()}`,
    threat_class: tc,
    source: THREAT_SOURCES[i % THREAT_SOURCES.length],
    target: `L${String(Math.ceil(Math.random()*23)).padStart(2,"0")}`,
    description: `Anomalous ${THREAT_VECTORS[i % THREAT_VECTORS.length]} pattern detected — confidence threshold exceeded`,
    confidence: Math.round(50 + Math.random() * 49),
    severity,
    neutralisation_mode: mode,
    detected_at: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    resolved: Math.random() > 0.65,
    vector: THREAT_VECTORS[i % THREAT_VECTORS.length],
  };
}

app.get("/hax/signals", (c) => {
  const n = parseInt(c.req.query("n") ?? "12");
  const unresolved = c.req.query("unresolved") === "true";
  let signals = Array.from({ length: n }, (_, i) => randomThreat(i));
  if (unresolved) signals = signals.filter(s => !s.resolved);
  return c.json({
    signals,
    count: signals.length,
    active_threats: signals.filter(s=>!s.resolved).length,
    threat_level: signals.some(s=>s.severity>80) ? "CRITICAL" : signals.some(s=>s.severity>50) ? "HIGH" : "MODERATE",
  });
});

app.get("/hax/signals/:id", (c) => {
  const idx = parseInt(c.req.param("id").replace("HAX-","")) - 2000;
  return c.json(randomThreat(idx >= 0 ? idx : 0));
});

// ── Voxx Protocol ────────────────────────────────────────────────────────────
type VoxxMode = "DIRECT" | "BROADCAST" | "ENCRYPTED" | "SLIPSTREAM";

interface VoxxMessage {
  id: string;
  from: string;
  to: string | "BROADCAST";
  mode: VoxxMode;
  content: string;
  encrypted: boolean;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  timestamp: string;
  acknowledged: boolean;
  slipstream_tunnel?: string;
}

const AGENT_NAMES = ["Sovereign","Foresight","Sentinel","Cornelius","Axiom","Blueprint","Meridian"];
const VOXX_CONTENTS = [
  "Pattern anomaly detected in sector L07 — initiating PASSIVE response protocol",
  "TRAN velocity index: +12.4% — FAST circuit stable, no intervention required",
  "ML-KEM-768 key rotation scheduled T+4h — all nodes must acknowledge",
  "Carbon Router: GREEN→AMBER transition in EU-WEST-2 — traffic redistributing",
  "Queen's Hive consensus reached: 6/7 APPROVE — protocol activated",
  "New DePIN node registered: Helium Gateway IOT-024 at L19-SkyMesh",
  "BER anomaly flagged for Persona P-042 — Serenity-AI intervention scheduled",
  "Knowledge Graph update: 3 new edges added to L12-NeuralForge topology",
];

app.get("/voxx/stream", (c) => {
  const n = parseInt(c.req.query("n") ?? "8");
  const mode = c.req.query("mode") as VoxxMode | undefined;
  const modes: VoxxMode[] = ["DIRECT","BROADCAST","ENCRYPTED","SLIPSTREAM"];
  let messages: VoxxMessage[] = Array.from({ length: n }, (_, i) => {
    const m: VoxxMode = modes[i % modes.length];
    return {
      id: `VOXX-${(3000+i).toString()}`,
      from: AGENT_NAMES[i % AGENT_NAMES.length],
      to: m === "BROADCAST" ? "BROADCAST" : AGENT_NAMES[(i+1) % AGENT_NAMES.length],
      mode: m,
      content: VOXX_CONTENTS[i % VOXX_CONTENTS.length],
      encrypted: m === "ENCRYPTED" || m === "SLIPSTREAM",
      priority: (["LOW","NORMAL","HIGH","CRITICAL"] as const)[Math.floor(Math.random()*4)],
      timestamp: new Date(Date.now() - (n-i) * 8000).toISOString(),
      acknowledged: Math.random() > 0.3,
      slipstream_tunnel: m === "SLIPSTREAM" ? `TUNNEL-A-00${(i%3)+1}` : undefined,
    };
  });
  if (mode) messages = messages.filter(m => m.mode === mode.toUpperCase());
  return c.json({ messages, count: messages.length });
});

app.post("/voxx/send", async (c) => {
  const body = await c.req.json<{ from: string; to: string; content: string; mode?: VoxxMode; priority?: string }>();
  const msg: VoxxMessage = {
    id: `VOXX-${Date.now().toString(36).toUpperCase()}`,
    from: body.from || "SYSTEM",
    to: body.to || "BROADCAST",
    mode: (body.mode as VoxxMode) || "DIRECT",
    content: body.content || "",
    encrypted: ["ENCRYPTED","SLIPSTREAM"].includes(body.mode || ""),
    priority: (body.priority as VoxxMessage["priority"]) || "NORMAL",
    timestamp: new Date().toISOString(),
    acknowledged: false,
    slipstream_tunnel: body.mode === "SLIPSTREAM" ? "TUNNEL-A-001" : undefined,
  };
  return c.json({ message: msg, status: "TRANSMITTED" }, 201);
});

export default app;
