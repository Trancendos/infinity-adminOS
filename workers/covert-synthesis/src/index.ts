/**
 * COVERT Synthesis — Penumbra Worker
 * DPID: DPID-COV-SYN-001
 * Port: 3080
 * Ecosystem: GUARDIAN
 * Classification: RESTRICTED
 *
 * The Penumbra sub-system: covert intelligence synthesis and autonomous
 * threat neutralisation for the Trancendos Universe. Operates in the
 * shadow layer — invisible to public traffic, monitoring all ecosystem
 * activity for adversarial patterns, insider threats, and dark patterns.
 *
 * COVERT = Covert Operations, Vigilance, Evasion, Reconnaissance, Tracking
 *
 * Core capabilities:
 * - Dark pattern detection (adversarial UX, manipulation, deception)
 * - Adversarial ML detection (model poisoning, evasion attacks)
 * - Insider threat scoring (anomalous behaviour analytics)
 * - Autonomous neutralisation (quarantine, rate-limit, revoke)
 * - Covert intelligence fusion (OSINT + internal telemetry)
 * - Penumbra Shadow Protocol (silent observation mode)
 * - Threat actor profiling
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';

// ── Types ────────────────────────────────────────────────────────────────────

type ThreatClass = 'ADVERSARIAL_ML' | 'DARK_PATTERN' | 'INSIDER_THREAT' | 'APT' | 'SYNTHETIC_IDENTITY' | 'SUPPLY_CHAIN' | 'QUANTUM_HARVEST';
type ThreatSeverity = 'TRACE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'EXISTENTIAL';
type NeutralisationStatus = 'MONITORING' | 'CONTAINED' | 'NEUTRALISED' | 'ESCALATED' | 'FALSE_POSITIVE';
type PenumbraMode = 'PASSIVE' | 'ACTIVE' | 'AGGRESSIVE' | 'LOCKDOWN';

interface ThreatSignal {
  signalId: string;
  dpid: string;
  threatClass: ThreatClass;
  severity: ThreatSeverity;
  confidence: number;        // 0-1
  detectedAt: string;
  sourceEntity: string;      // UPIF ID or IP/pattern
  affectedLocations: string[];
  indicators: string[];      // IOCs
  ttps: string[];            // MITRE ATT&CK TTPs
  neutralisationStatus: NeutralisationStatus;
  autoNeutralised: boolean;
  penumbraTag: string;       // internal classification tag
}

interface ThreatActor {
  actorId: string;
  threatClass: ThreatClass;
  sophistication: 'LOW' | 'MEDIUM' | 'HIGH' | 'NATION_STATE';
  knownTTPs: string[];
  firstSeen: string;
  lastActive: string;
  attributionConfidence: number;
  activeSignals: number;
  containmentStatus: NeutralisationStatus;
}

interface PenumbraIntelligence {
  intelId: string;
  dpid: string;
  classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'RESTRICTED' | 'SOVEREIGN';
  generatedAt: string;
  penumbraMode: PenumbraMode;
  activeThreatSignals: number;
  criticalSignals: number;
  neutralisedToday: number;
  falsePositiveRate: number;
  ecosystemThreatScore: number;  // 0-100 (100 = most hostile)
  topThreats: ThreatSignal[];
  threatActors: ThreatActor[];
  darkPatternScanResults: DarkPatternScan;
  recommendations: string[];
}

interface DarkPatternScan {
  scanId: string;
  scannedAt: string;
  locationsScanned: number;
  darkPatternsDetected: number;
  patterns: Array<{
    type: string;
    location: string;
    severity: ThreatSeverity;
    description: string;
    autoRemediated: boolean;
  }>;
}

interface NeutralisationAction {
  actionId: string;
  signalId: string;
  actionType: 'QUARANTINE' | 'RATE_LIMIT' | 'REVOKE_PASSPORT' | 'IP_BLOCK' | 'SHADOW_BAN' | 'ESCALATE' | 'ALERT_ONLY';
  targetEntity: string;
  executedAt: string;
  executedBy: 'AUTONOMOUS' | 'HUMAN_OPERATOR';
  success: boolean;
  reversible: boolean;
  ttl?: number;              // seconds until auto-reversal (if applicable)
  approvalRequired: boolean;
}

// ── Threat Intelligence Engine ────────────────────────────────────────────────

class PenumbraEngine {
  private mode: PenumbraMode = 'ACTIVE';
  private threatSignals: ThreatSignal[] = [];
  private threatActors: ThreatActor[] = [];
  private neutralisations: NeutralisationAction[] = [];

  constructor() {
    this.seedThreatData();
  }

  private seedThreatData() {
    // Seed with realistic but synthetic threat data
    this.threatSignals = [
      {
        signalId: 'SIG-2060-001',
        dpid: 'DPID-COV-SYN-001',
        threatClass: 'ADVERSARIAL_ML',
        severity: 'HIGH',
        confidence: 0.87,
        detectedAt: new Date(Date.now() - 3600000).toISOString(),
        sourceEntity: 'UPIF-X7K9M2P1-V3',
        affectedLocations: ['L07', 'L08'],
        indicators: ['anomalous_model_query_pattern', 'high_confidence_adversarial_inputs', 'probe_sequence_detected'],
        ttps: ['T1059.001', 'T1190', 'T1203'],
        neutralisationStatus: 'CONTAINED',
        autoNeutralised: true,
        penumbraTag: 'ML-PROBE-ALPHA',
      },
      {
        signalId: 'SIG-2060-002',
        dpid: 'DPID-COV-SYN-001',
        threatClass: 'DARK_PATTERN',
        severity: 'MEDIUM',
        confidence: 0.73,
        detectedAt: new Date(Date.now() - 7200000).toISOString(),
        sourceEntity: 'COMPONENT-UNKNOWN',
        affectedLocations: ['L03'],
        indicators: ['forced_continuity_pattern', 'disguised_ads', 'confirmshaming_text'],
        ttps: ['T1204', 'T1566'],
        neutralisationStatus: 'MONITORING',
        autoNeutralised: false,
        penumbraTag: 'DARK-PAT-BETA',
      },
    ];

    this.threatActors = [
      {
        actorId: 'ACTOR-VOID-001',
        threatClass: 'ADVERSARIAL_ML',
        sophistication: 'HIGH',
        knownTTPs: ['T1059.001', 'T1190', 'T1203', 'T1027'],
        firstSeen: new Date(Date.now() - 30 * 86400000).toISOString(),
        lastActive: new Date(Date.now() - 3600000).toISOString(),
        attributionConfidence: 0.64,
        activeSignals: 3,
        containmentStatus: 'CONTAINED',
      },
    ];
  }

  getMode(): PenumbraMode { return this.mode; }
  setMode(mode: PenumbraMode) { this.mode = mode; }

  getSignals(severity?: ThreatSeverity, threatClass?: ThreatClass): ThreatSignal[] {
    let signals = [...this.threatSignals];
    if (severity) signals = signals.filter(s => s.severity === severity);
    if (threatClass) signals = signals.filter(s => s.threatClass === threatClass);
    return signals;
  }

  getActors(): ThreatActor[] { return [...this.threatActors]; }

  ingestSignal(signal: Omit<ThreatSignal, 'signalId' | 'dpid' | 'penumbraTag'>): ThreatSignal {
    const newSignal: ThreatSignal = {
      ...signal,
      signalId: `SIG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      dpid: 'DPID-COV-SYN-001',
      penumbraTag: `PENUMBRA-${signal.threatClass.slice(0, 4)}-${Date.now().toString(36).toUpperCase()}`,
    };
    this.threatSignals.push(newSignal);
    return newSignal;
  }

  neutralise(signalId: string, actionType: NeutralisationAction['actionType'], autonomous = true): NeutralisationAction {
    const signal = this.threatSignals.find(s => s.signalId === signalId);

    const action: NeutralisationAction = {
      actionId: `ACT-${Date.now()}`,
      signalId,
      actionType,
      targetEntity: signal?.sourceEntity ?? 'UNKNOWN',
      executedAt: new Date().toISOString(),
      executedBy: autonomous ? 'AUTONOMOUS' : 'HUMAN_OPERATOR',
      success: true,
      reversible: actionType !== 'REVOKE_PASSPORT',
      ttl: actionType === 'RATE_LIMIT' ? 3600 : actionType === 'IP_BLOCK' ? 86400 : undefined,
      approvalRequired: actionType === 'REVOKE_PASSPORT' || actionType === 'ESCALATE',
    };

    if (signal) {
      signal.neutralisationStatus = 'NEUTRALISED';
      signal.autoNeutralised = autonomous;
    }

    this.neutralisations.push(action);
    return action;
  }

  scanDarkPatterns(): DarkPatternScan {
    return {
      scanId: `DPS-${Date.now()}`,
      scannedAt: new Date().toISOString(),
      locationsScanned: 23,
      darkPatternsDetected: 2,
      patterns: [
        {
          type: 'CONFIRMSHAMING',
          location: 'L03',
          severity: 'MEDIUM',
          description: 'Opt-out button uses shame language to discourage user from declining',
          autoRemediated: false,
        },
        {
          type: 'HIDDEN_COST',
          location: 'L08',
          severity: 'LOW',
          description: 'Service fee revealed only at final checkout step',
          autoRemediated: true,
        },
      ],
    };
  }

  getIntelligenceSummary(): PenumbraIntelligence {
    const critical = this.threatSignals.filter(s => s.severity === 'CRITICAL' || s.severity === 'EXISTENTIAL').length;
    const neutralised = this.neutralisations.filter(n => {
      return new Date(n.executedAt) > new Date(Date.now() - 86400000);
    }).length;

    return {
      intelId: `INTEL-${Date.now()}`,
      dpid: 'DPID-COV-SYN-001',
      classification: 'RESTRICTED',
      generatedAt: new Date().toISOString(),
      penumbraMode: this.mode,
      activeThreatSignals: this.threatSignals.filter(s => s.neutralisationStatus === 'MONITORING' || s.neutralisationStatus === 'CONTAINED').length,
      criticalSignals: critical,
      neutralisedToday: neutralised,
      falsePositiveRate: 0.034,
      ecosystemThreatScore: 23,
      topThreats: this.threatSignals.slice(0, 5),
      threatActors: this.threatActors,
      darkPatternScanResults: this.scanDarkPatterns(),
      recommendations: [
        'Upgrade ML probe detection to v4 model — current evasion rate 3.4%',
        'Schedule dark pattern audit for L03 component library',
        'Enable autonomous neutralisation for QUANTUM_HARVEST class signals',
        'Review ACTOR-VOID-001 containment status — 3 active signals',
      ],
    };
  }
}

const penumbra = new PenumbraEngine();

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// COVERT: No public CORS — only allow internal Slipstream traffic
app.use('*', async (c, next) => {
  const origin = c.req.header('origin') ?? '';
  const slipstreamToken = c.req.header('x-slipstream-token');
  const dpidHeader = c.req.header('x-dpid');

  // Allow health check without auth
  if (c.req.path === '/health' || c.req.path === '/') {
    await next();
    return;
  }

  // All other endpoints require slipstream token or internal origin
  if (!slipstreamToken && !origin.includes('trancendos')) {
    return c.json({ error: 'COVERT endpoint: Slipstream authentication required', dpid: 'DPID-COV-SYN-001' }, 401);
  }

  await next();
});

app.use('*', logger());

app.use('*', async (c, next) => {
  c.header('X-DPID', 'DPID-COV-SYN-001');
  c.header('X-Service', 'COVERT Synthesis Penumbra');
  c.header('X-Classification', 'RESTRICTED');
  c.header('X-Penumbra-Mode', penumbra.getMode());
  await next();
});

// ── Health (public) ───────────────────────────────────────────────────────────

app.get('/health', (c) => {
  return c.json({
    dpid: 'DPID-COV-SYN-001',
    service: 'COVERT Synthesis — Penumbra',
    status: 'ACTIVE',
    penumbraMode: penumbra.getMode(),
    classification: 'RESTRICTED',
    note: 'Full intelligence access requires Slipstream authentication',
  });
});

// ── Intelligence Summary ──────────────────────────────────────────────────────

app.get('/intelligence/summary', (c) => {
  return c.json(penumbra.getIntelligenceSummary());
});

// ── Threat Signals ────────────────────────────────────────────────────────────

app.get('/threats', (c) => {
  const severity = c.req.query('severity') as ThreatSeverity | undefined;
  const threatClass = c.req.query('class') as ThreatClass | undefined;
  const signals = penumbra.getSignals(severity, threatClass);

  return c.json({
    dpid: 'DPID-COV-SYN-001',
    retrievedAt: new Date().toISOString(),
    totalSignals: signals.length,
    signals,
  });
});

const IngestSchema = z.object({
  threatClass: z.enum(['ADVERSARIAL_ML', 'DARK_PATTERN', 'INSIDER_THREAT', 'APT', 'SYNTHETIC_IDENTITY', 'SUPPLY_CHAIN', 'QUANTUM_HARVEST']),
  severity: z.enum(['TRACE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'EXISTENTIAL']),
  confidence: z.number().min(0).max(1),
  sourceEntity: z.string(),
  affectedLocations: z.array(z.string()),
  indicators: z.array(z.string()),
  ttps: z.array(z.string()).optional().default([]),
  detectedAt: z.string().optional(),
  neutralisationStatus: z.enum(['MONITORING', 'CONTAINED', 'NEUTRALISED', 'ESCALATED', 'FALSE_POSITIVE']).default('MONITORING'),
  autoNeutralised: z.boolean().default(false),
});

app.post('/threats/ingest', async (c) => {
  const body = await c.req.json();
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid signal', details: parsed.error.issues }, 400);

  const signal = penumbra.ingestSignal({
    ...parsed.data,
    detectedAt: parsed.data.detectedAt ?? new Date().toISOString(),
  });

  return c.json({ ingested: true, signal }, 201);
});

// ── Neutralisation ────────────────────────────────────────────────────────────

app.post('/neutralise/:signalId', async (c) => {
  const signalId = c.req.param('signalId');
  const body = await c.req.json();
  const actionType = (body.actionType ?? 'QUARANTINE') as NeutralisationAction['actionType'];
  const autonomous = body.autonomous !== false;

  const action = penumbra.neutralise(signalId, actionType, autonomous);
  return c.json({ neutralised: true, action });
});

// ── Dark Pattern Scan ─────────────────────────────────────────────────────────

app.get('/scan/dark-patterns', (c) => {
  return c.json(penumbra.scanDarkPatterns());
});

// ── Threat Actors ─────────────────────────────────────────────────────────────

app.get('/actors', (c) => {
  return c.json({
    dpid: 'DPID-COV-SYN-001',
    retrievedAt: new Date().toISOString(),
    actors: penumbra.getActors(),
  });
});

// ── Penumbra Mode Control ─────────────────────────────────────────────────────

app.post('/mode', async (c) => {
  const body = await c.req.json();
  const mode = body.mode as PenumbraMode;
  if (!['PASSIVE', 'ACTIVE', 'AGGRESSIVE', 'LOCKDOWN'].includes(mode)) {
    return c.json({ error: 'Invalid mode. Use: PASSIVE | ACTIVE | AGGRESSIVE | LOCKDOWN' }, 400);
  }

  penumbra.setMode(mode);
  return c.json({
    modeChanged: true,
    newMode: mode,
    changedAt: new Date().toISOString(),
    warning: mode === 'LOCKDOWN' ? 'LOCKDOWN mode will block all unauthenticated traffic universe-wide' : undefined,
  });
});

// ── Default ───────────────────────────────────────────────────────────────────

app.get('/', (c) => {
  return c.json({
    service: 'COVERT Synthesis — Penumbra',
    dpid: 'DPID-COV-SYN-001',
    version: '1.0.0',
    classification: 'RESTRICTED',
    description: 'Covert intelligence synthesis and autonomous threat neutralisation',
    endpoints: [
      'GET  /health (public)',
      'GET  /intelligence/summary (slipstream-auth)',
      'GET  /threats (slipstream-auth)',
      'POST /threats/ingest (slipstream-auth)',
      'POST /neutralise/:signalId (slipstream-auth)',
      'GET  /scan/dark-patterns (slipstream-auth)',
      'GET  /actors (slipstream-auth)',
      'POST /mode (slipstream-auth)',
    ],
  });
});

export interface Env {
  DPID: string;
  SERVICE_NAME: string;
  SENTINEL_STATION: Fetcher;
  PQC_SERVICE: Fetcher;
}

export default app;
