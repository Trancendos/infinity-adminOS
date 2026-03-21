/**
 * Knowledge Graph Service Worker
 * DPID: DPID-KNW-GRP-001
 * Port: 3085
 * Ecosystem: SENTIENT
 *
 * Semantic knowledge graph for the Trancendos Universe ontology.
 * Stores and traverses relationships between all entities:
 * Locations, Personas, Services, Pockets, Dimensionals, DPIDs.
 *
 * Graph model: Property Graph (nodes + typed edges + properties)
 * Query language: Simplified Gremlin-style traversal API
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeType = 'LOCATION' | 'PERSONA' | 'SERVICE' | 'POCKET' | 'DIMENSIONAL' | 'ECOSYSTEM' | 'PILLAR' | 'DPID' | 'CONCEPT';
type EdgeType = 'LOCATED_IN' | 'BELONGS_TO' | 'DEPENDS_ON' | 'GOVERNS' | 'COMMUNICATES_WITH' | 'CREATED_BY' | 'PART_OF' | 'ENABLES' | 'ROUTES_TO' | 'EMBODIES';

interface KGNode {
  nodeId: string;
  type: NodeType;
  label: string;
  properties: Record<string, unknown>;
  dpid?: string;
  createdAt: string;
}

interface KGEdge {
  edgeId: string;
  from: string;
  to: string;
  type: EdgeType;
  properties: Record<string, unknown>;
  weight: number;
}

interface KGQueryResult {
  queryId: string;
  query: string;
  nodes: KGNode[];
  edges: KGEdge[];
  pathLength: number;
  executionMs: number;
}

// ── Knowledge Graph ────────────────────────────────────────────────────────────

const nodes = new Map<string, KGNode>();
const edges: KGEdge[] = [];

function addNode(nodeId: string, type: NodeType, label: string, properties: Record<string,unknown> = {}, dpid?: string): KGNode {
  const node: KGNode = { nodeId, type, label, properties, dpid, createdAt: new Date().toISOString() };
  nodes.set(nodeId, node);
  return node;
}

function addEdge(from: string, to: string, type: EdgeType, properties: Record<string,unknown> = {}, weight = 1): KGEdge {
  const edge: KGEdge = { edgeId: `${from}-${type}-${to}`, from, to, type, properties, weight };
  edges.push(edge);
  return edge;
}

// ── Seed Universe Ontology ─────────────────────────────────────────────────────

// Pillars
['PIL1','PIL2','PIL3','PIL4','PIL5','PIL6'].forEach((p, i) => {
  const names = ['Blueprint','Commerce','Forge','Guardian','Sentient','Wellness'];
  addNode(p, 'PILLAR', `Pillar ${i+1}: ${names[i]}`, { pillarNumber: i+1, name: names[i] });
});

// Ecosystems
const ecosystems = [
  { id: 'NEXUS', label: 'Nexus Hub', color: '#6366F1' },
  { id: 'PULSE', label: 'Pulse Media', color: '#EC4899' },
  { id: 'FORGE', label: 'The Forge', color: '#F59E0B' },
  { id: 'GUARDIAN', label: 'Guardian Gate', color: '#10B981' },
  { id: 'SENTIENT', label: 'Sentient AI', color: '#8B5CF6' },
  { id: 'SOVEREIGN', label: 'Sovereign Finance', color: '#3B82F6' },
  { id: 'TRANSIT', label: 'Transit/Sentinel', color: '#7B68EE' },
];
ecosystems.forEach(e => addNode(e.id, 'ECOSYSTEM', e.label, { color: e.color }));

// Locations L01-L23
for (let i = 1; i <= 23; i++) {
  const locId = `L${String(i).padStart(2,'0')}`;
  const ecosystem = i <= 4 ? 'NEXUS' : i <= 9 ? 'PULSE' : i <= 13 ? 'FORGE' : i <= 17 ? 'GUARDIAN' : i <= 20 ? 'SENTIENT' : i <= 22 ? 'SOVEREIGN' : 'TRANSIT';
  const pillar = `PIL${Math.min(6, Math.ceil(i / 4))}`;
  addNode(locId, 'LOCATION', `Location ${locId}`, { locationIndex: i, ecosystem }, `DPID-LOC-${pillar}-${String(i).padStart(3,'0')}`);
  addEdge(locId, ecosystem, 'PART_OF', {}, 1);
  addEdge(locId, pillar, 'BELONGS_TO', {}, 1);
}

// Key Services
const services = [
  { id: 'SVC-SENTINEL', label: 'Sentinel Station', dpid: 'DPID-SEN-CORE-001', eco: 'TRANSIT' },
  { id: 'SVC-BER', label: 'BER Engine', dpid: 'DPID-PCK-PIL6-002', eco: 'SENTIENT' },
  { id: 'SVC-ORACLE', label: 'Oracle Foresight Suite', dpid: 'DPID-ORC-SUITE-001', eco: 'SENTIENT' },
  { id: 'SVC-CHRONO', label: 'Chrono Intelligence', dpid: 'DPID-ORC-CHR-001', eco: 'SENTIENT' },
  { id: 'SVC-CORNELIUS', label: 'Cornelius Strategy Oracle', dpid: 'DPID-ORC-COR-001', eco: 'SOVEREIGN' },
  { id: 'SVC-UPIF', label: 'Universal UPIF', dpid: 'DPID-ORC-UPF-001', eco: 'NEXUS' },
  { id: 'SVC-PQC', label: 'PQC Service', dpid: 'DPID-DIM-SEC-PQC-001', eco: 'GUARDIAN' },
  { id: 'SVC-PENUMBRA', label: 'COVERT Penumbra', dpid: 'DPID-COV-SYN-001', eco: 'GUARDIAN' },
  { id: 'SVC-DEPIN', label: 'DePIN Broker', dpid: 'DPID-ECO-DEP-001', eco: 'PULSE' },
  { id: 'SVC-CARBON', label: 'Carbon Router', dpid: 'DPID-ECO-CAR-001', eco: 'PULSE' },
  { id: 'SVC-L402', label: 'L402 Gateway', dpid: 'DPID-ECO-L402-001', eco: 'SOVEREIGN' },
  { id: 'SVC-DPID-REG', label: 'DPID Registry', dpid: 'DPID-REG-CORE-001', eco: 'NEXUS' },
  { id: 'SVC-TIGA', label: 'TIGA Middleware', dpid: 'DPID-DIM-GOV-003', eco: 'NEXUS' },
  { id: 'SVC-FABRIC', label: 'Dimensional Fabric', dpid: 'DPID-DIM-FABRIC-001', eco: 'NEXUS' },
];
services.forEach(s => {
  addNode(s.id, 'SERVICE', s.label, { dpid: s.dpid }, s.dpid);
  addEdge(s.id, s.eco, 'PART_OF', {}, 1);
});

// Key service relationships
addEdge('SVC-SENTINEL', 'SVC-BER', 'COMMUNICATES_WITH', { tunnelClass: 'C' }, 3);
addEdge('SVC-SENTINEL', 'SVC-ORACLE', 'COMMUNICATES_WITH', { tunnelClass: 'B' }, 2);
addEdge('SVC-SENTINEL', 'SVC-PQC', 'DEPENDS_ON', { reason: 'tunnel-encryption' }, 4);
addEdge('SVC-TIGA', 'SVC-SENTINEL', 'GOVERNS', {}, 5);
addEdge('SVC-TIGA', 'SVC-ORACLE', 'GOVERNS', {}, 5);
addEdge('SVC-FABRIC', 'SVC-SENTINEL', 'ROUTES_TO', {}, 3);
addEdge('SVC-CORNELIUS', 'SVC-ORACLE', 'DEPENDS_ON', {}, 2);
addEdge('SVC-CORNELIUS', 'SVC-CHRONO', 'DEPENDS_ON', {}, 2);
addEdge('SVC-PENUMBRA', 'SVC-PQC', 'DEPENDS_ON', { reason: 'threat-encryption' }, 3);
addEdge('SVC-L402', 'SVC-SENTINEL', 'ROUTES_TO', {}, 2);
addEdge('SVC-UPIF', 'SVC-BER', 'COMMUNICATES_WITH', { reason: 'biometric-identity' }, 2);

// Key Personas
const personas = [
  { id: 'PER-MADAM-K', label: 'Madam Krystal', role: 'BER Oracle', eco: 'SENTIENT' },
  { id: 'PER-CORNELIUS', label: 'Cornelius', role: 'Strategy Elder', eco: 'SOVEREIGN' },
  { id: 'PER-PENUMBRA', label: 'Penumbra', role: 'Shadow Guardian', eco: 'GUARDIAN' },
  { id: 'PER-LUMI', label: 'Lumi', role: 'HPC Legacy Navigator', eco: 'NEXUS' },
  { id: 'PER-DORIS', label: 'Doris', role: 'Financial Oracle', eco: 'SOVEREIGN' },
  { id: 'PER-ATLAS', label: 'Atlas Prime', role: 'Tactical Commander', eco: 'SOVEREIGN' },
];
personas.forEach(p => {
  addNode(p.id, 'PERSONA', p.label, { role: p.role }, undefined);
  addEdge(p.id, p.eco, 'PART_OF', {}, 1);
});
addEdge('PER-MADAM-K', 'SVC-BER', 'EMBODIES', {}, 5);
addEdge('PER-CORNELIUS', 'SVC-CORNELIUS', 'EMBODIES', {}, 5);
addEdge('PER-PENUMBRA', 'SVC-PENUMBRA', 'EMBODIES', {}, 5);
addEdge('PER-DORIS', 'SVC-CORNELIUS', 'PART_OF', { role: 'ECONOMIST' }, 3);

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());
app.use('*', logger());

app.use('*', async (c, next) => {
  c.header('X-DPID', 'DPID-KNW-GRP-001');
  c.header('X-Service', 'Knowledge Graph Service');
  c.header('X-Graph-Version', '3.0');
  await next();
});

app.get('/health', (c) => c.json({
  dpid: 'DPID-KNW-GRP-001',
  service: 'Knowledge Graph Service',
  status: 'HEALTHY',
  graphStats: { nodes: nodes.size, edges: edges.length },
  ontology: 'TRANCENDOS_UNIVERSE_V3',
  uptime: 99.95,
}));

// ── Node Operations ───────────────────────────────────────────────────────────

app.get('/node/:nodeId', (c) => {
  const node = nodes.get(c.req.param('nodeId'));
  if (!node) return c.json({ error: 'Node not found' }, 404);
  const nodeEdges = edges.filter(e => e.from === node.nodeId || e.to === node.nodeId);
  return c.json({ node, edges: nodeEdges, degree: nodeEdges.length });
});

app.get('/nodes', (c) => {
  const type = c.req.query('type') as NodeType | undefined;
  const eco = c.req.query('ecosystem');
  let result = Array.from(nodes.values());
  if (type) result = result.filter(n => n.type === type);
  if (eco) result = result.filter(n => (n.properties.ecosystem as string) === eco || n.nodeId === eco);
  return c.json({ total: result.length, nodes: result });
});

const AddNodeSchema = z.object({
  nodeId: z.string(),
  type: z.enum(['LOCATION','PERSONA','SERVICE','POCKET','DIMENSIONAL','ECOSYSTEM','PILLAR','DPID','CONCEPT']),
  label: z.string(),
  properties: z.record(z.unknown()).optional().default({}),
  dpid: z.string().optional(),
});

app.post('/node', async (c) => {
  const body = await c.req.json();
  const parsed = AddNodeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid node', details: parsed.error.issues }, 400);
  if (nodes.has(parsed.data.nodeId)) return c.json({ error: 'Node already exists' }, 409);
  const node = addNode(parsed.data.nodeId, parsed.data.type, parsed.data.label, parsed.data.properties, parsed.data.dpid);
  return c.json({ added: true, node }, 201);
});

// ── Edge Operations ───────────────────────────────────────────────────────────

const AddEdgeSchema = z.object({
  from: z.string(), to: z.string(),
  type: z.enum(['LOCATED_IN','BELONGS_TO','DEPENDS_ON','GOVERNS','COMMUNICATES_WITH','CREATED_BY','PART_OF','ENABLES','ROUTES_TO','EMBODIES']),
  properties: z.record(z.unknown()).optional().default({}),
  weight: z.number().default(1),
});

app.post('/edge', async (c) => {
  const body = await c.req.json();
  const parsed = AddEdgeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid edge', details: parsed.error.issues }, 400);
  if (!nodes.has(parsed.data.from)) return c.json({ error: `Source node '${parsed.data.from}' not found` }, 404);
  if (!nodes.has(parsed.data.to)) return c.json({ error: `Target node '${parsed.data.to}' not found` }, 404);
  const edge = addEdge(parsed.data.from, parsed.data.to, parsed.data.type, parsed.data.properties, parsed.data.weight);
  return c.json({ added: true, edge }, 201);
});

// ── Traversal ─────────────────────────────────────────────────────────────────

app.get('/traverse/:startNodeId', (c) => {
  const startId = c.req.param('startNodeId');
  const depth = Math.min(5, parseInt(c.req.query('depth') ?? '2'));
  const edgeType = c.req.query('edgeType') as EdgeType | undefined;

  const start = nodes.get(startId);
  if (!start) return c.json({ error: 'Start node not found' }, 404);

  const visitedNodes = new Set<string>([startId]);
  const resultNodes: KGNode[] = [start];
  const resultEdges: KGEdge[] = [];
  const queue: Array<{ nodeId: string; currentDepth: number }> = [{ nodeId: startId, currentDepth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.currentDepth >= depth) continue;

    const outEdges = edges.filter(e => e.from === item.nodeId && (!edgeType || e.type === edgeType));
    outEdges.forEach(edge => {
      resultEdges.push(edge);
      if (!visitedNodes.has(edge.to)) {
        visitedNodes.add(edge.to);
        const targetNode = nodes.get(edge.to);
        if (targetNode) {
          resultNodes.push(targetNode);
          queue.push({ nodeId: edge.to, currentDepth: item.currentDepth + 1 });
        }
      }
    });
  }

  return c.json({
    queryId: `TRV-${Date.now()}`,
    startNode: startId,
    depth,
    nodes: resultNodes,
    edges: resultEdges,
    nodesReached: resultNodes.length,
  });
});

// ── Shortest Path ─────────────────────────────────────────────────────────────

app.get('/path/:from/:to', (c) => {
  const fromId = c.req.param('from'), toId = c.req.param('to');
  if (!nodes.has(fromId)) return c.json({ error: `Node '${fromId}' not found` }, 404);
  if (!nodes.has(toId)) return c.json({ error: `Node '${toId}' not found` }, 404);

  // BFS shortest path
  const visited = new Set<string>([fromId]);
  const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: fromId, path: [fromId] }];

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    if (nodeId === toId) {
      const pathNodes = path.map(id => nodes.get(id)).filter(Boolean) as KGNode[];
      const pathEdges = path.slice(0, -1).map((id, i) =>
        edges.find(e => e.from === id && e.to === path[i+1])
      ).filter(Boolean) as KGEdge[];
      return c.json({ found: true, pathLength: path.length - 1, path, nodes: pathNodes, edges: pathEdges });
    }
    const nexts = edges.filter(e => e.from === nodeId);
    nexts.forEach(edge => {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({ nodeId: edge.to, path: [...path, edge.to] });
      }
    });
  }

  return c.json({ found: false, message: `No path from '${fromId}' to '${toId}'` }, 404);
});

// ── Search ────────────────────────────────────────────────────────────────────

app.get('/search', (c) => {
  const q = (c.req.query('q') ?? '').toLowerCase();
  if (!q) return c.json({ error: 'q parameter required' }, 400);
  const results = Array.from(nodes.values()).filter(n =>
    n.label.toLowerCase().includes(q) || n.nodeId.toLowerCase().includes(q) ||
    (n.dpid?.toLowerCase().includes(q) ?? false)
  );
  return c.json({ query: q, total: results.length, nodes: results.slice(0, 20) });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

app.get('/stats', (c) => {
  const allNodes = Array.from(nodes.values());
  const byType = allNodes.reduce((acc, n) => { acc[n.type] = (acc[n.type] ?? 0) + 1; return acc; }, {} as Record<string,number>);
  const byEdgeType = edges.reduce((acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc; }, {} as Record<string,number>);
  return c.json({ totalNodes: nodes.size, totalEdges: edges.length, byNodeType: byType, byEdgeType, avgDegree: Math.round((edges.length * 2 / nodes.size) * 10) / 10 });
});

app.get('/', (c) => c.json({
  service: 'Knowledge Graph Service', dpid: 'DPID-KNW-GRP-001', version: '3.0',
  description: 'Semantic knowledge graph for the Trancendos Universe ontology',
  stats: { nodes: nodes.size, edges: edges.length },
  endpoints: ['GET /health','GET /node/:nodeId','GET /nodes','POST /node','POST /edge','GET /traverse/:nodeId','GET /path/:from/:to','GET /search','GET /stats'],
}));

export interface Env { DPID: string; SERVICE_NAME: string; SENTINEL_STATION: Fetcher; }
export default app;
