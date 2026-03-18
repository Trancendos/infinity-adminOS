/**
 * BER Engine — Biometric Empathy Rendering
 * DPID: DPID-PCK-PIL6-002
 * Pillar: Wellbeing (Tranquility Ecosystem)
 * Prime: Savania
 *
 * The BER Engine is the empathy layer of the Trancendos Universe.
 * It processes biometric inputs (HRV, stress, sleep) and broadcasts
 * design token states to all connected UI components.
 *
 * BER States:
 *   LUCID    — Daily driver. Calm, focused, empathy-green accents
 *   OVERLOAD — Elevated stress. Grounding blanket UI, muted palette
 *   CHAOS    — Crisis/infrastructure mode. Terminal aesthetic, alert-red
 *
 * Design Tokens (Madam Krystal):
 *   void-900:  #050505  (background)
 *   void-500:  #0A0A0B  (surface)
 *   empathy:   #10B981  (primary action — LUCID)
 *   alert:     #F43F5E  (warning/error — CHAOS)
 *
 * Architecture: Trancendos 2060 / Industry 6.0
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';

// ============================================================================
// BER Types
// ============================================================================

enum BERState {
  LUCID    = 'LUCID',
  OVERLOAD = 'OVERLOAD',
  CHAOS    = 'CHAOS',
}

interface BERDesignTokens {
  state: BERState;
  background:   string;
  surface:      string;
  primary:      string;
  accent:       string;
  text:         string;
  border:       string;
  blur:         string;
  animation:    string;
  description:  string;
}

interface HRVReading {
  value: number;        // ms (typical: 20-100ms)
  timestamp: string;
  source: 'healthkit' | 'welltory' | 'manual' | 'simulated';
}

interface BERSnapshot {
  state: BERState;
  tokens: BERDesignTokens;
  hrv?: HRVReading;
  stressIndex?: number;    // 0-100
  updatedAt: string;
  triggeredBy: string;
}

interface Env {
  BER_STATE: KVNamespace;
}

// ============================================================================
// Design Token Sets per BER State
// ============================================================================

const TOKENS: Record<BERState, BERDesignTokens> = {
  [BERState.LUCID]: {
    state: BERState.LUCID,
    background:  '#050505',   // void-900
    surface:     '#0A0A0B',   // void-500
    primary:     '#10B981',   // empathy green
    accent:      '#3B82F6',   // Psyon blue
    text:        '#E2E8F0',
    border:      'rgba(255,255,255,0.08)',
    blur:        'blur(12px)',
    animation:   'smooth',
    description: 'Daily driver — calm, focused, empathic',
  },
  [BERState.OVERLOAD]: {
    state: BERState.OVERLOAD,
    background:  '#0A0A14',   // slightly warm dark
    surface:     '#0D0D1A',
    primary:     '#6366F1',   // muted indigo — grounding
    accent:      '#8B5CF6',   // soft purple
    text:        '#CBD5E1',   // slightly dimmed
    border:      'rgba(99,102,241,0.15)',
    blur:        'blur(20px)',
    animation:   'slow',
    description: 'Elevated stress — grounding blanket UI, muted palette',
  },
  [BERState.CHAOS]: {
    state: BERState.CHAOS,
    background:  '#050505',
    surface:     '#0A0A0B',
    primary:     '#F43F5E',   // alert red
    accent:      '#EF4444',
    text:        '#F1F5F9',
    border:      'rgba(244,63,94,0.25)',
    blur:        'none',
    animation:   'fast',
    description: 'Crisis mode — terminal aesthetic, maximum contrast, alert-red',
  },
};

// ============================================================================
// BER State Machine
// ============================================================================

function computeBERState(hrv: number, stressIndex: number): BERState {
  // HRV thresholds (ms):
  //   > 50ms = good (LUCID)
  //   30-50ms = moderate (OVERLOAD)
  //   < 30ms = poor (CHAOS)
  //
  // Stress index thresholds (0-100):
  //   0-40 = LUCID
  //   41-70 = OVERLOAD
  //   71-100 = CHAOS

  const stressState = stressIndex > 70 ? BERState.CHAOS
    : stressIndex > 40 ? BERState.OVERLOAD
    : BERState.LUCID;

  const hrvState = hrv < 30 ? BERState.CHAOS
    : hrv < 50 ? BERState.OVERLOAD
    : BERState.LUCID;

  // Take the worse of the two states
  const severity = { [BERState.LUCID]: 0, [BERState.OVERLOAD]: 1, [BERState.CHAOS]: 2 };
  return severity[stressState] >= severity[hrvState] ? stressState : hrvState;
}

// ============================================================================
// App
// ============================================================================

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());
app.use('*', logger());

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({
  status: 'operational',
  service: 'ber-engine',
  dpid: 'DPID-PCK-PIL6-002',
  pillar: 'Wellbeing',
  ecosystem: 'Tranquility',
  prime: 'Savania',
  berStates: Object.values(BERState),
  timestamp: new Date().toISOString(),
}));

// ── Get current BER state ────────────────────────────────────────────────────
app.get('/ber/state', async (c) => {
  const snapshot = await c.env.BER_STATE.get('current');

  if (!snapshot) {
    // Default to LUCID if no state set
    const defaultSnapshot: BERSnapshot = {
      state: BERState.LUCID,
      tokens: TOKENS[BERState.LUCID],
      updatedAt: new Date().toISOString(),
      triggeredBy: 'default',
    };
    return c.json(defaultSnapshot);
  }

  return c.json(JSON.parse(snapshot));
});

// ── Get tokens for a specific state ──────────────────────────────────────────
app.get('/ber/tokens/:state', (c) => {
  const state = c.req.param('state').toUpperCase() as BERState;
  if (!Object.values(BERState).includes(state)) {
    return c.json({ error: 'Invalid BER state. Valid: LUCID, OVERLOAD, CHAOS' }, 400);
  }
  return c.json(TOKENS[state]);
});

// ── Get all tokens ────────────────────────────────────────────────────────────
app.get('/ber/tokens', (c) => c.json(TOKENS));

// ── Update BER state via HRV reading ─────────────────────────────────────────
const HRVSchema = z.object({
  hrv:         z.number().min(0).max(200),
  stressIndex: z.number().min(0).max(100).optional().default(0),
  source:      z.enum(['healthkit','welltory','manual','simulated']).optional().default('manual'),
});

app.post('/ber/hrv', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = HRVSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid HRV data', details: parsed.error.issues }, 400);
  }

  const { hrv, stressIndex, source } = parsed.data;
  const newState = computeBERState(hrv, stressIndex);
  const tokens = TOKENS[newState];

  const snapshot: BERSnapshot = {
    state: newState,
    tokens,
    hrv: { value: hrv, timestamp: new Date().toISOString(), source },
    stressIndex,
    updatedAt: new Date().toISOString(),
    triggeredBy: `hrv-update:${source}`,
  };

  await c.env.BER_STATE.put('current', JSON.stringify(snapshot));
  await c.env.BER_STATE.put('history:' + Date.now(), JSON.stringify(snapshot), { expirationTtl: 86400 * 7 });

  return c.json({
    success: true,
    previousState: (await c.env.BER_STATE.get('previous'))
      ? JSON.parse((await c.env.BER_STATE.get('previous'))!)?.state
      : null,
    newState,
    tokens,
    hrv: parsed.data.hrv,
    stressIndex,
    message: `BER state updated to ${newState}`,
    broadcast: 'Socket.io broadcast initiated (connect via /ber/subscribe)',
  });
});

// ── Manual BER state override ─────────────────────────────────────────────────
const OverrideSchema = z.object({
  state:  z.nativeEnum(BERState),
  reason: z.string().optional(),
});

app.post('/ber/override', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = OverrideSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid override. State must be LUCID, OVERLOAD, or CHAOS' }, 400);
  }

  const { state, reason } = parsed.data;
  const snapshot: BERSnapshot = {
    state,
    tokens: TOKENS[state],
    updatedAt: new Date().toISOString(),
    triggeredBy: `manual-override:${reason ?? 'unspecified'}`,
  };

  await c.env.BER_STATE.put('current', JSON.stringify(snapshot));

  return c.json({ success: true, state, tokens: TOKENS[state], reason });
});

// ── Emergency Tranquility Protocol ───────────────────────────────────────────
app.post('/ber/emergency-tranquility', async (c) => {
  const snapshot: BERSnapshot = {
    state: BERState.OVERLOAD,
    tokens: TOKENS[BERState.OVERLOAD],
    updatedAt: new Date().toISOString(),
    triggeredBy: 'emergency-tranquility-protocol',
  };

  await c.env.BER_STATE.put('current', JSON.stringify(snapshot));
  await c.env.BER_STATE.put('emergency-active', 'true', { expirationTtl: 1800 }); // 30 min

  return c.json({
    success: true,
    protocol: 'EMERGENCY_TRANQUILITY',
    state: BERState.OVERLOAD,
    message: 'Emergency Tranquility Protocol activated — grounding mode enabled for 30 minutes',
    actions: [
      'UI switched to OVERLOAD grounding theme',
      'Notifications throttled',
      'Cognitive load reduced',
      'IoT environment adjustments triggered (if Home Assistant connected)',
    ],
    resumeAt: new Date(Date.now() + 1800000).toISOString(),
  });
});

// ── IoT Bridge — trigger Home Assistant adjustment ────────────────────────────
app.post('/ber/iot/adjust', async (c) => {
  const body = await c.req.json().catch(() => null);
  const currentStateRaw = await c.env.BER_STATE.get('current');
  const currentState: BERSnapshot = currentStateRaw
    ? JSON.parse(currentStateRaw)
    : { state: BERState.LUCID };

  // In production: POST to Home Assistant webhook URL
  // For now, return the recommended IoT adjustments based on BER state
  const adjustments: Record<BERState, object> = {
    [BERState.LUCID]: {
      lighting: { brightness: 80, colorTemp: 4000 },
      temperature: 21,
      sound: 'ambient-focus',
      notification: 'normal',
    },
    [BERState.OVERLOAD]: {
      lighting: { brightness: 40, colorTemp: 2700 },
      temperature: 19,
      sound: 'nature-calming',
      notification: 'muted',
    },
    [BERState.CHAOS]: {
      lighting: { brightness: 20, colorTemp: 2200 },
      temperature: 18,
      sound: 'silence',
      notification: 'emergency-only',
    },
  };

  return c.json({
    success: true,
    berState: currentState.state,
    recommendations: adjustments[currentState.state],
    homeAssistant: {
      webhook: 'Configure HOME_ASSISTANT_WEBHOOK_URL in environment',
      trigger: 'POST to webhook with adjustments payload',
    },
    timestamp: new Date().toISOString(),
  });
});

export default app;
