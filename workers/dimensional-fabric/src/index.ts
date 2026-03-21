/**
 * Dimensional Fabric — Orchestration Layer
 * DPID: DPID-DIM-FABRIC-001
 * Standard: Trancendos 2060 / Industry 6.0
 *
 * The Dimensional Fabric manages all 30 Dimensional supporting services
 * across 7 classes — the middleware layer connecting all 23 Locations.
 *
 * 7 Dimensional Classes:
 *   Data        (7): TimeSeries-D, Relational-D, Vector-D, Graph-D, Edge-D, Document-D, Cache-D
 *   Messaging   (4): StreamBus-D, EventBus-D, Queue-D, Realtime-D
 *   Security    (5): Auth-D, Vault-D, PQC-D, WAF-D, ZKP-D
 *   AI          (4): Inference-D, Swarm-D, Graph-AI-D, FL-D
 *   Infra       (4): Wasm-D, Container-D, CDN-D, DePIN-D
 *   API         (3): Gateway-D, GraphQL-D, L402-D
 *   Governance  (3): OPA-D, Audit-D, Compliance-D
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';

interface Env { DIM_REGISTRY: KVNamespace; }

// ─── Dimensional Registry ────────────────────────────────────────────────────
const DIMENSIONALS = [
  // Data
  { id:'DPID-DIM-DAT-001', name:'TimeSeries-D',  class:'Data',        tech:'InfluxDB 3.0',       port:8086, status:'active' },
  { id:'DPID-DIM-DAT-002', name:'Relational-D',  class:'Data',        tech:'PostgreSQL 16',      port:5432, status:'active' },
  { id:'DPID-DIM-DAT-003', name:'Vector-D',      class:'Data',        tech:'Milvus',             port:19530,status:'active' },
  { id:'DPID-DIM-DAT-004', name:'Graph-D',       class:'Data',        tech:'Neo4j',              port:7474, status:'active' },
  { id:'DPID-DIM-DAT-005', name:'Edge-D',        class:'Data',        tech:'Turso (libSQL)',      port:8080, status:'active' },
  { id:'DPID-DIM-DAT-006', name:'Document-D',    class:'Data',        tech:'MongoDB',            port:27017,status:'active' },
  { id:'DPID-DIM-DAT-007', name:'Cache-D',       class:'Data',        tech:'Redis 7',            port:6379, status:'active' },
  // Messaging
  { id:'DPID-DIM-MSG-001', name:'StreamBus-D',   class:'Messaging',   tech:'Apache Kafka',       port:9092, status:'active' },
  { id:'DPID-DIM-MSG-002', name:'EventBus-D',    class:'Messaging',   tech:'MQTT 5.0',           port:1883, status:'active' },
  { id:'DPID-DIM-MSG-003', name:'Queue-D',       class:'Messaging',   tech:'RabbitMQ',           port:5672, status:'active' },
  { id:'DPID-DIM-MSG-004', name:'Realtime-D',    class:'Messaging',   tech:'Socket.io',          port:3099, status:'active' },
  // Security
  { id:'DPID-DIM-SEC-001', name:'Auth-D',        class:'Security',    tech:'Keycloak + OIDC',    port:8081, status:'active' },
  { id:'DPID-DIM-SEC-002', name:'Vault-D',       class:'Security',    tech:'HashiCorp Vault',    port:8200, status:'active' },
  { id:'DPID-DIM-SEC-003', name:'PQC-D',         class:'Security',    tech:'ML-KEM-768',         port:8443, status:'active' },
  { id:'DPID-DIM-SEC-004', name:'WAF-D',         class:'Security',    tech:'Cloudflare WAF',     port:443,  status:'active' },
  { id:'DPID-DIM-SEC-005', name:'ZKP-D',         class:'Security',    tech:'Zero-Knowledge Proofs',port:9000,status:'pending'},
  // AI
  { id:'DPID-DIM-AI-001',  name:'Inference-D',   class:'AI',          tech:'NVIDIA NIM / Triton',port:8000, status:'active' },
  { id:'DPID-DIM-AI-002',  name:'Swarm-D',       class:'AI',          tech:'CrewAI + AutoGen',   port:8100, status:'active' },
  { id:'DPID-DIM-AI-003',  name:'Graph-AI-D',    class:'AI',          tech:'LangGraph',          port:8101, status:'active' },
  { id:'DPID-DIM-AI-004',  name:'FL-D',          class:'AI',          tech:'Flower FL',          port:8102, status:'pending'},
  // Infrastructure
  { id:'DPID-DIM-INF-001', name:'Wasm-D',        class:'Infrastructure',tech:'WasmEdge',         port:2080, status:'pending'},
  { id:'DPID-DIM-INF-002', name:'Container-D',   class:'Infrastructure',tech:'Docker + K8s',     port:2376, status:'active' },
  { id:'DPID-DIM-INF-003', name:'CDN-D',         class:'Infrastructure',tech:'Cloudflare Workers',port:443, status:'active' },
  { id:'DPID-DIM-INF-004', name:'DePIN-D',       class:'Infrastructure',tech:'Vast.ai DePIN',    port:8200, status:'pending'},
  // API
  { id:'DPID-DIM-API-001', name:'Gateway-D',     class:'API',         tech:'Kong API Gateway',   port:8000, status:'active' },
  { id:'DPID-DIM-API-002', name:'GraphQL-D',     class:'API',         tech:'Apollo Federation',  port:4000, status:'active' },
  { id:'DPID-DIM-API-003', name:'L402-D',        class:'API',         tech:'Lightning + Macaroons',port:9735,status:'pending'},
  // Governance
  { id:'DPID-DIM-GOV-001', name:'OPA-D',         class:'Governance',  tech:'Open Policy Agent',  port:8181, status:'active' },
  { id:'DPID-DIM-GOV-002', name:'Audit-D',       class:'Governance',  tech:'FACT Ledger',        port:8182, status:'active' },
  { id:'DPID-DIM-GOV-003', name:'Compliance-D',  class:'Governance',  tech:'TIGA Framework',     port:8183, status:'active' },
];

const CLASS_COLORS: Record<string, string> = {
  Data: '#06B6D4', Messaging: '#F59E0B', Security: '#F43F5E',
  AI: '#10B981', Infrastructure: '#8B5CF6', API: '#EC4899', Governance: '#F5A623',
};

// ─── App ─────────────────────────────────────────────────────────────────────
const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());
app.use('*', logger());

// Health
app.get('/health', c => c.json({
  status: 'operational',
  service: 'dimensional-fabric',
  dpid: 'DPID-DIM-FABRIC-001',
  totalDimensionals: DIMENSIONALS.length,
  classes: Object.keys(CLASS_COLORS),
  active: DIMENSIONALS.filter(d => d.status === 'active').length,
  pending: DIMENSIONALS.filter(d => d.status === 'pending').length,
  timestamp: new Date().toISOString(),
}));

// Get all Dimensionals
app.get('/dimensionals', c => {
  const cls = c.req.query('class');
  const status = c.req.query('status');
  let dims = DIMENSIONALS;
  if (cls) dims = dims.filter(d => d.class.toLowerCase() === cls.toLowerCase());
  if (status) dims = dims.filter(d => d.status === status);
  return c.json({ total: dims.length, dimensionals: dims });
});

// Get Dimensional by DPID
app.get('/dimensionals/:dpid', c => {
  const dim = DIMENSIONALS.find(d => d.id === c.req.param('dpid'));
  if (!dim) return c.json({ error: 'Dimensional not found' }, 404);
  return c.json(dim);
});

// Get classes summary
app.get('/classes', c => {
  const summary = Object.keys(CLASS_COLORS).map(cls => ({
    class: cls,
    color: CLASS_COLORS[cls],
    count: DIMENSIONALS.filter(d => d.class === cls).length,
    active: DIMENSIONALS.filter(d => d.class === cls && d.status === 'active').length,
    dimensionals: DIMENSIONALS.filter(d => d.class === cls).map(d => d.name),
  }));
  return c.json({ total: DIMENSIONALS.length, classes: summary });
});

// Check which Dimensionals a Location needs
const LOCATION_DIMS: Record<string, string[]> = {
  L01: ['DPID-DIM-DAT-002','DPID-DIM-DAT-007','DPID-DIM-MSG-001','DPID-DIM-SEC-001','DPID-DIM-AI-001','DPID-DIM-GOV-001'],
  L05: ['DPID-DIM-DAT-002','DPID-DIM-DAT-005','DPID-DIM-SEC-001','DPID-DIM-SEC-002','DPID-DIM-GOV-002'],
  L07: ['DPID-DIM-SEC-001','DPID-DIM-SEC-002','DPID-DIM-GOV-001','DPID-DIM-GOV-002','DPID-DIM-GOV-003'],
  L11: ['DPID-DIM-MSG-001','DPID-DIM-MSG-002','DPID-DIM-MSG-004','DPID-DIM-API-001','DPID-DIM-INF-002'],
  L18: ['DPID-DIM-DAT-005','DPID-DIM-MSG-004','DPID-DIM-SEC-001'],
  L23: ['DPID-DIM-SEC-003','DPID-DIM-SEC-001','DPID-DIM-MSG-002','DPID-DIM-GOV-001','DPID-DIM-API-001'],
};

app.get('/locations/:locationId/dimensionals', c => {
  const locId = c.req.param('locationId').toUpperCase();
  const dpids = LOCATION_DIMS[locId] ?? [];
  if (!dpids.length) return c.json({ locationId: locId, dimensionals: [], note: 'No Dimensional mappings found for this location' });
  const dims = DIMENSIONALS.filter(d => dpids.includes(d.id));
  return c.json({ locationId: locId, count: dims.length, dimensionals: dims });
});

// Status overview
app.get('/status', c => c.json({
  fabric: 'DIMENSIONAL_FABRIC',
  dpid: 'DPID-DIM-FABRIC-001',
  status: 'OPERATIONAL',
  totalDimensionals: DIMENSIONALS.length,
  byStatus: {
    active: DIMENSIONALS.filter(d => d.status === 'active').length,
    pending: DIMENSIONALS.filter(d => d.status === 'pending').length,
  },
  byClass: Object.fromEntries(Object.keys(CLASS_COLORS).map(cls => [cls, {
    count: DIMENSIONALS.filter(d => d.class === cls).length,
    color: CLASS_COLORS[cls],
  }])),
}));

export default app;
