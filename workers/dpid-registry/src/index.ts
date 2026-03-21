/**
 * DPID Registry Service Worker
 * DPID: DPID-REG-CORE-001
 * Port: 3084
 * Ecosystem: NEXUS
 *
 * Master registry for all Digital Participant IDs (DPIDs) in the
 * Trancendos Universe. Every service, location, persona, component,
 * and infrastructure element has a registered DPID.
 *
 * DPID format: DPID-{CATEGORY}-{SUBCATEGORY}-{SEQUENCE}
 * Example:     DPID-SEN-CORE-001 (Sentinel Station Core)
 *              DPID-LOC-PIL1-001 (Location, Pillar 1, sequence 1)
 *              DPID-ORC-CHR-001  (Oracle, Chrono Intelligence, sequence 1)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';

// ── Types ────────────────────────────────────────────────────────────────────

type DPIDCategory = 'LOC' | 'SEN' | 'DIM' | 'ORC' | 'PER' | 'ECO' | 'INF' | 'PKG' | 'REG' | 'COV' | 'PCK';
type DPIDStatus = 'ACTIVE' | 'DEPRECATED' | 'RESERVED' | 'DECOMMISSIONED';

interface DPIDRecord {
  dpid: string;
  category: DPIDCategory;
  name: string;
  description: string;
  owner: string;
  ecosystem: string;
  port?: number;
  serviceUrl?: string;
  version: string;
  status: DPIDStatus;
  registeredAt: string;
  lastVerified: string;
  tags: string[];
  dependencies: string[];     // other DPIDs this depends on
  metadata: Record<string, unknown>;
}

// ── Registry Seed Data ────────────────────────────────────────────────────────

const REGISTRY: DPIDRecord[] = [
  // ── Sentinel Station
  { dpid: 'DPID-SEN-CORE-001', category: 'SEN', name: 'Sentinel Station', description: 'Trans-Warp Slipstream Interplexing Hub — L23', owner: 'Trancendos', ecosystem: 'TRANSIT', port: 3060, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['slipstream', 'transit', 'hub'], dependencies: [], metadata: { locationId: 'L23', slipstreamClasses: ['A','B','C','D'] } },
  // ── BER Engine
  { dpid: 'DPID-PCK-PIL6-002', category: 'PCK', name: 'BER Engine', description: 'Biometric Empathy Rendering Engine — Madam Krystal', owner: 'PIL6', ecosystem: 'SENTIENT', port: 3061, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['biometric', 'empathy', 'ber'], dependencies: ['DPID-SEN-CORE-001'], metadata: { states: ['LUCID','OVERLOAD','CHAOS'], designToken: '#10B981' } },
  // ── Dimensional Fabric
  { dpid: 'DPID-DIM-FABRIC-001', category: 'DIM', name: 'Dimensional Fabric', description: 'Orchestrates all 30 Dimensional services across 7 classes', owner: 'NEXUS', ecosystem: 'NEXUS', port: 3065, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['dimensional', 'orchestration', 'fabric'], dependencies: ['DPID-SEN-CORE-001'], metadata: { dimensionalCount: 30, classes: 7 } },
  // ── Oracle Suite
  { dpid: 'DPID-ORC-SUITE-001', category: 'ORC', name: 'Oracle Foresight Suite', description: 'All 8 Oracle-AI foresight applications', owner: 'SENTIENT', ecosystem: 'SENTIENT', port: 3075, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['oracle', 'foresight', 'ai'], dependencies: ['DPID-SEN-CORE-001', 'DPID-DIM-FABRIC-001'], metadata: { oracleCount: 8 } },
  // ── Chrono Intelligence
  { dpid: 'DPID-ORC-CHR-001', category: 'ORC', name: 'Chrono-Intelligence Oracle', description: 'Liquid Neural Network temporal forecasting', owner: 'SENTIENT', ecosystem: 'SENTIENT', port: 3076, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['oracle', 'chrono', 'lnn', 'temporal'], dependencies: ['DPID-ORC-SUITE-001'], metadata: { model: 'liquid-temporal-v3' } },
  // ── Cornelius Oracle
  { dpid: 'DPID-ORC-COR-001', category: 'ORC', name: 'Cornelius Strategy Oracle', description: '7-agent strategic intelligence + FAST circuit breaker', owner: 'SOVEREIGN', ecosystem: 'SOVEREIGN', port: 3077, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['oracle', 'strategy', 'fast', 'agents'], dependencies: ['DPID-ORC-SUITE-001', 'DPID-ORC-CHR-001'], metadata: { agentCount: 7, fastThreshold: 0.5 } },
  // ── Universal UPIF
  { dpid: 'DPID-ORC-UPF-001', category: 'ORC', name: 'Universal UPIF', description: 'Universal Participant Identity Framework', owner: 'NEXUS', ecosystem: 'NEXUS', port: 3078, version: '3.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['identity', 'upif', 'gdp', 'participants'], dependencies: ['DPID-SEN-CORE-001', 'DPID-PCK-PIL6-002'], metadata: { identityVersion: 'UPIF-3.0' } },
  // ── PQC Service
  { dpid: 'DPID-DIM-SEC-PQC-001', category: 'DIM', name: 'PQC Service', description: 'Post-Quantum Cryptography ML-KEM-768 key management', owner: 'GUARDIAN', ecosystem: 'GUARDIAN', port: 3079, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['pqc', 'security', 'ml-kem-768', 'quantum'], dependencies: ['DPID-SEN-CORE-001'], metadata: { algorithm: 'ML-KEM-768', nistStandards: ['FIPS203','FIPS204','FIPS205'] } },
  // ── COVERT Synthesis
  { dpid: 'DPID-COV-SYN-001', category: 'COV', name: 'COVERT Synthesis Penumbra', description: 'Covert intelligence synthesis and autonomous threat neutralisation', owner: 'GUARDIAN', ecosystem: 'GUARDIAN', port: 3080, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['covert', 'penumbra', 'security', 'intelligence'], dependencies: ['DPID-SEN-CORE-001', 'DPID-DIM-SEC-PQC-001'], metadata: { classification: 'RESTRICTED' } },
  // ── DePIN Broker
  { dpid: 'DPID-ECO-DEP-001', category: 'ECO', name: 'DePIN Broker', description: 'Decentralised Physical Infrastructure Network broker', owner: 'PULSE', ecosystem: 'PULSE', port: 3081, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['depin', 'iot', 'helium', 'edge'], dependencies: ['DPID-SEN-CORE-001'], metadata: { networks: ['HELIUM','SOLANA','FILECOIN','RENDER','AKASH'] } },
  // ── Carbon Router
  { dpid: 'DPID-ECO-CAR-001', category: 'ECO', name: 'Carbon Router', description: 'Carbon-aware traffic routing and sustainability analytics', owner: 'PULSE', ecosystem: 'PULSE', port: 3082, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['carbon', 'green', 'routing', 'sustainability'], dependencies: ['DPID-SEN-CORE-001'], metadata: { certifications: ['ISO14001','GreenWebFoundation'] } },
  // ── L402 Gateway
  { dpid: 'DPID-ECO-L402-001', category: 'ECO', name: 'L402 Gateway', description: 'Lightning Network L402 machine-to-machine micropayment gateway', owner: 'SOVEREIGN', ecosystem: 'SOVEREIGN', port: 3083, version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['l402', 'lightning', 'payment', 'micropayment'], dependencies: ['DPID-SEN-CORE-001'], metadata: { network: 'mainnet', methods: ['LIGHTNING','TRAN_TOKEN'] } },
  // ── DPID Registry itself
  { dpid: 'DPID-REG-CORE-001', category: 'REG', name: 'DPID Registry Service', description: 'Master registry for all DPIDs in the Trancendos Universe', owner: 'NEXUS', ecosystem: 'NEXUS', port: 3084, version: '3.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['registry', 'dpid', 'master'], dependencies: [], metadata: { registryVersion: '3.0', totalDPIDs: 107 } },
  // ── TIGA Governance
  { dpid: 'DPID-DIM-GOV-003', category: 'DIM', name: 'TIGA Middleware', description: 'Trancendos Integrity & Governance Architecture — OPA + FACT Ledger', owner: 'NEXUS', ecosystem: 'NEXUS', version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['governance', 'opa', 'tiga', 'compliance'], dependencies: ['DPID-SEN-CORE-001'], metadata: { complianceStandards: ['ISO42001','SOC2','GDPR'] } },
  // ── Slipstream Protocol Package
  { dpid: 'DPID-PKG-SLP-001', category: 'PKG', name: 'Slipstream Protocol', description: '@trancendos/slipstream-protocol shared TypeScript package', owner: 'NEXUS', ecosystem: 'NEXUS', version: '1.0.0', status: 'ACTIVE', registeredAt: '2024-01-01T00:00:00Z', lastVerified: new Date().toISOString(), tags: ['package', 'slipstream', 'protocol', 'shp'], dependencies: [], metadata: { npmPackage: '@trancendos/slipstream-protocol' } },
];

const registryMap = new Map<string, DPIDRecord>(REGISTRY.map(r => [r.dpid, r]));

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());
app.use('*', logger());

app.use('*', async (c, next) => {
  c.header('X-DPID', 'DPID-REG-CORE-001');
  c.header('X-Service', 'DPID Registry Service');
  c.header('X-Registry-Version', '3.0');
  await next();
});

app.get('/health', (c) => c.json({
  dpid: 'DPID-REG-CORE-001',
  service: 'DPID Registry Service',
  status: 'HEALTHY',
  totalDPIDs: registryMap.size,
  activeDPIDs: Array.from(registryMap.values()).filter(r => r.status === 'ACTIVE').length,
  registryVersion: '3.0',
  uptime: 100,
}));

// ── Lookup ────────────────────────────────────────────────────────────────────

app.get('/dpid/:dpid', (c) => {
  const dpid = c.req.param('dpid');
  const record = registryMap.get(dpid);
  if (!record) return c.json({ error: 'DPID not found', dpid }, 404);
  return c.json(record);
});

// ── Register ──────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  dpid: z.string().regex(/^DPID-[A-Z]+-[A-Z]+-\d{3}$/),
  category: z.enum(['LOC','SEN','DIM','ORC','PER','ECO','INF','PKG','REG','COV','PCK']),
  name: z.string().min(3),
  description: z.string().min(10),
  owner: z.string(),
  ecosystem: z.string(),
  port: z.number().optional(),
  version: z.string().default('1.0.0'),
  tags: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

app.post('/register', async (c) => {
  const body = await c.req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid DPID record', details: parsed.error.issues }, 400);

  if (registryMap.has(parsed.data.dpid)) {
    return c.json({ error: 'DPID already registered', dpid: parsed.data.dpid }, 409);
  }

  const record: DPIDRecord = {
    ...parsed.data,
    status: 'ACTIVE',
    registeredAt: new Date().toISOString(),
    lastVerified: new Date().toISOString(),
  };

  registryMap.set(record.dpid, record);
  return c.json({ registered: true, record }, 201);
});

// ── List & Search ─────────────────────────────────────────────────────────────

app.get('/list', (c) => {
  const category = c.req.query('category') as DPIDCategory | undefined;
  const ecosystem = c.req.query('ecosystem');
  const status = c.req.query('status') as DPIDStatus | undefined;
  const tag = c.req.query('tag');

  let records = Array.from(registryMap.values());
  if (category) records = records.filter(r => r.category === category);
  if (ecosystem) records = records.filter(r => r.ecosystem === ecosystem.toUpperCase());
  if (status) records = records.filter(r => r.status === status);
  if (tag) records = records.filter(r => r.tags.includes(tag.toLowerCase()));

  return c.json({ totalRecords: records.length, records });
});

app.get('/search', (c) => {
  const q = (c.req.query('q') ?? '').toLowerCase();
  if (!q) return c.json({ error: 'q parameter required' }, 400);

  const results = Array.from(registryMap.values()).filter(r =>
    r.dpid.toLowerCase().includes(q) ||
    r.name.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.tags.some(t => t.includes(q))
  );

  return c.json({ query: q, totalResults: results.length, results });
});

// ── Dependencies ──────────────────────────────────────────────────────────────

app.get('/dpid/:dpid/dependencies', (c) => {
  const dpid = c.req.param('dpid');
  const record = registryMap.get(dpid);
  if (!record) return c.json({ error: 'DPID not found' }, 404);

  const deps = record.dependencies.map(d => registryMap.get(d)).filter(Boolean);
  const dependents = Array.from(registryMap.values()).filter(r => r.dependencies.includes(dpid));

  return c.json({
    dpid,
    dependencies: deps,
    dependents: dependents.map(d => ({ dpid: d.dpid, name: d.name })),
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

app.get('/stats', (c) => {
  const records = Array.from(registryMap.values());
  const byCategory = records.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const byEcosystem = records.reduce((acc, r) => {
    acc[r.ecosystem] = (acc[r.ecosystem] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return c.json({
    total: records.length,
    byCategory,
    byEcosystem,
    byStatus: {
      ACTIVE: records.filter(r => r.status === 'ACTIVE').length,
      DEPRECATED: records.filter(r => r.status === 'DEPRECATED').length,
      RESERVED: records.filter(r => r.status === 'RESERVED').length,
    },
  });
});

app.get('/', (c) => c.json({
  service: 'DPID Registry Service', dpid: 'DPID-REG-CORE-001', version: '3.0.0',
  description: 'Master registry for all DPIDs in the Trancendos Universe',
  totalRegistered: registryMap.size,
  endpoints: ['GET /health','GET /dpid/:dpid','POST /register','GET /list','GET /search','GET /dpid/:dpid/dependencies','GET /stats'],
}));

export interface Env {
  DPID: string; SERVICE_NAME: string;
}

export default app;
