import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

interface Env {
  DPID: string;
  SERVICE_VERSION: string;
  BER_ENGINE_URL: string;
  DEPIN_BROKER_URL: string;
  SLIPSTREAM_CLASS: string;
}

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({ origin: "*" }));
app.use("*", logger());

// ── BER State Simulation ─────────────────────────────────────────────────────
type BERState = "LUCID" | "OVERLOAD" | "CHAOS";
interface BERReading {
  state: BERState;
  hrv: number;
  coherence: number;
  stressIndex: number;
  timestamp: string;
  sessionId: string;
  adaptiveMode: string;
  designToken: string;
}

function computeBERState(hrv: number, stressIndex: number): { state: BERState; token: string; mode: string } {
  if (hrv > 65 && stressIndex < 30) return { state: "LUCID",    token: "#10B981", mode: "FLOW" };
  if (hrv > 40 && stressIndex < 60) return { state: "OVERLOAD", token: "#F59E0B", mode: "GUIDED" };
  return                                    { state: "CHAOS",    token: "#F43F5E", mode: "RESTORE" };
}

app.get("/health", (c) => c.json({
  status: "operational",
  service: "cyber-physical-api",
  dpid: c.env.DPID,
  version: c.env.SERVICE_VERSION,
  timestamp: new Date().toISOString(),
}));

// GET /ber/stream — simulated live BER biometric stream
app.get("/ber/stream", (c) => {
  const hrv = 35 + Math.random() * 55;
  const stressIndex = Math.random() * 80;
  const coherence = 0.4 + Math.random() * 0.5;
  const { state, token, mode } = computeBERState(hrv, stressIndex);

  const reading: BERReading = {
    state,
    hrv: Math.round(hrv * 10) / 10,
    coherence: Math.round(coherence * 100) / 100,
    stressIndex: Math.round(stressIndex * 10) / 10,
    timestamp: new Date().toISOString(),
    sessionId: `BER-${Date.now().toString(36).toUpperCase()}`,
    adaptiveMode: mode,
    designToken: token,
  };
  return c.json(reading);
});

// GET /ber/history — last N readings (simulated)
app.get("/ber/history", (c) => {
  const n = parseInt(c.req.query("n") ?? "10");
  const readings: BERReading[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    const hrv = 35 + Math.random() * 55;
    const stressIndex = Math.random() * 80;
    const coherence = 0.4 + Math.random() * 0.5;
    const { state, token, mode } = computeBERState(hrv, stressIndex);
    readings.push({
      state, hrv: Math.round(hrv*10)/10,
      coherence: Math.round(coherence*100)/100,
      stressIndex: Math.round(stressIndex*10)/10,
      timestamp: new Date(now - i * 5000).toISOString(),
      sessionId: `BER-${(now - i*5000).toString(36).toUpperCase()}`,
      adaptiveMode: mode,
      designToken: token,
    });
  }
  return c.json({ readings, count: readings.length });
});

// ── IoT Device Registry ──────────────────────────────────────────────────────
interface IoTDevice {
  id: string;
  name: string;
  type: string;
  location: string;
  status: "online" | "offline" | "degraded";
  lastSeen: string;
  metrics: Record<string, number>;
  tran_staked: number;
  network: string;
}

const IOT_DEVICES: IoTDevice[] = [
  { id: "IOT-001", name: "Helium Node Alpha", type: "LORAWAN_GATEWAY", location: "L01-VoidCore",
    status: "online", lastSeen: new Date().toISOString(), tran_staked: 450,
    metrics: { signal_strength: -72, packets_forwarded: 12847, uptime_pct: 99.7 }, network: "Helium" },
  { id: "IOT-002", name: "Solana Validator Rig", type: "BLOCKCHAIN_NODE", location: "L05-QuantumVault",
    status: "online", lastSeen: new Date().toISOString(), tran_staked: 820,
    metrics: { tps: 1240, slot_latency_ms: 47, vote_accuracy: 99.9 }, network: "Solana" },
  { id: "IOT-003", name: "Filecoin Storage Node", type: "STORAGE_PROVIDER", location: "L08-DataStream",
    status: "online", lastSeen: new Date().toISOString(), tran_staked: 310,
    metrics: { storage_tb: 4.2, retrieval_success_pct: 98.1, deals_active: 23 }, network: "Filecoin" },
  { id: "IOT-004", name: "Render GPU Cluster", type: "COMPUTE_PROVIDER", location: "L12-NeuralForge",
    status: "degraded", lastSeen: new Date(Date.now()-120000).toISOString(), tran_staked: 680,
    metrics: { gpu_utilisation: 87.4, jobs_completed: 342, avg_render_ms: 2840 }, network: "Render" },
  { id: "IOT-005", name: "Akash Compute Node", type: "CLOUD_PROVIDER", location: "L16-ComputeNexus",
    status: "online", lastSeen: new Date().toISOString(), tran_staked: 525,
    metrics: { containers_running: 47, cpu_utilisation: 61.2, mem_utilisation: 73.8 }, network: "Akash" },
  { id: "IOT-006", name: "BioSensor Gateway", type: "BIOSENSOR_HUB", location: "L03-SerenityGarden",
    status: "online", lastSeen: new Date().toISOString(), tran_staked: 150,
    metrics: { hrv_readings_today: 2847, avg_hrv: 58.3, alerts_triggered: 2 }, network: "DePIN" },
];

app.get("/iot/devices", (c) => {
  const network = c.req.query("network");
  const status  = c.req.query("status");
  let devices = IOT_DEVICES;
  if (network) devices = devices.filter(d => d.network.toLowerCase() === network.toLowerCase());
  if (status)  devices = devices.filter(d => d.status === status);
  return c.json({ devices, count: devices.length, total_tran_staked: devices.reduce((s,d)=>s+d.tran_staked,0) });
});

app.get("/iot/devices/:id", (c) => {
  const device = IOT_DEVICES.find(d => d.id === c.req.param("id"));
  if (!device) return c.json({ error: "Device not found" }, 404);
  return c.json(device);
});

// ── NIM Pipeline ─────────────────────────────────────────────────────────────
interface NIMTask {
  id: string;
  name: string;
  stage: "QUEUE" | "PARSE" | "EMBED" | "INDEX" | "COMPLETE" | "FAILED";
  progress: number;
  model: string;
  tokens_processed: number;
  latency_ms: number;
  started_at: string;
  completed_at: string | null;
}

app.get("/nim/pipeline", (c) => {
  const stages: NIMTask["stage"][] = ["QUEUE","PARSE","EMBED","INDEX","COMPLETE","COMPLETE","COMPLETE"];
  const models = ["llama-3.1-8b","mistral-7b-v0.3","phi-3-mini","gemma-2-9b"];
  const tasks: NIMTask[] = Array.from({ length: 8 }, (_, i) => {
    const stage = stages[Math.floor(Math.random() * stages.length)];
    const progress = stage === "COMPLETE" ? 100 : stage === "FAILED" ? Math.round(Math.random()*60) : Math.round(Math.random()*95);
    return {
      id: `NIM-${(1000+i).toString()}`,
      name: [`Universe Ontology Embed`, `BER Pattern Extract`, `Location Sync`, `DPID Vectorise`,
             `Persona Profile Build`, `Threat Model Update`, `Knowledge Graph Ingest`, `Policy Vector Calc`][i],
      stage, progress,
      model: models[i % models.length],
      tokens_processed: Math.round(1000 + Math.random() * 50000),
      latency_ms: Math.round(50 + Math.random() * 2000),
      started_at: new Date(Date.now() - Math.random() * 300000).toISOString(),
      completed_at: stage === "COMPLETE" ? new Date(Date.now() - Math.random() * 60000).toISOString() : null,
    };
  });
  return c.json({ tasks, pipeline_status: "RUNNING", throughput_tps: Math.round(Math.random() * 500 + 200) });
});

// ── Slipstream Status ────────────────────────────────────────────────────────
app.get("/slipstream/status", (c) => {
  const tunnels = [
    { id: "TUNNEL-A-001", class: "A", protocol: "gRPC", latency_ms: 12 + Math.random()*30, status: "ACTIVE", peers: 4 },
    { id: "TUNNEL-B-001", class: "B", protocol: "HTTPS", latency_ms: 80 + Math.random()*150, status: "ACTIVE", peers: 12 },
    { id: "TUNNEL-C-001", class: "C", protocol: "MQTT", latency_ms: 5 + Math.random()*20, status: "ACTIVE", peers: 28 },
    { id: "TUNNEL-D-001", class: "D", protocol: "Emergency", latency_ms: 2 + Math.random()*5, status: "STANDBY", peers: 2 },
  ];
  return c.json({
    handshake_stage: "STAGE_7_COMPLETE",
    tunnels,
    total_peers: tunnels.reduce((s,t)=>s+t.peers,0),
    uptime_seconds: Math.round(Date.now()/1000 - 1700000000),
  });
});

export default app;
