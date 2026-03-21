/**
 * L402 Gateway Worker
 * DPID: DPID-ECO-L402-001
 * Port: 3083
 * Ecosystem: SOVEREIGN
 *
 * Lightning Network L402 (LSAT) machine-to-machine micropayment gateway.
 * Enables AI agents, IoT devices, and services in the Trancendos Universe
 * to pay for API access autonomously using Bitcoin Lightning micropayments.
 *
 * L402 Protocol:
 * 1. Client requests resource
 * 2. Server returns 402 Payment Required with Lightning invoice + macaroon
 * 3. Client pays invoice via Lightning
 * 4. Client presents preimage + macaroon to access resource
 * 5. Server validates and grants access
 *
 * Also supports TRAN token payments as an alternative to Lightning.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';

// ── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = 'LIGHTNING' | 'TRAN_TOKEN' | 'HYBRID';
type InvoiceStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
type MacaroonCaveat = 'time' | 'service' | 'method' | 'rate_limit' | 'location';

interface LightningInvoice {
  invoiceId: string;
  dpid: string;
  paymentRequest: string;   // BOLT-11 invoice (lnbc...)
  paymentHash: string;
  amountSats: number;
  amountTran: number;       // equivalent in TRAN tokens
  description: string;
  service: string;
  method: string;
  expiresAt: string;
  status: InvoiceStatus;
  createdAt: string;
  paidAt?: string;
  preimage?: string;        // revealed on payment
}

interface Macaroon {
  macaroonId: string;
  rootKey: string;          // hex (simulated)
  identifier: string;
  paymentHash: string;
  caveats: Array<{
    type: MacaroonCaveat;
    condition: string;
    value: string;
  }>;
  signature: string;        // HMAC-SHA256 (simulated)
  issuedAt: string;
  expiresAt: string;
  service: string;
  upifId?: string;          // who this macaroon was issued to
}

interface PaymentSession {
  sessionId: string;
  dpid: string;
  invoice: LightningInvoice;
  macaroon: Macaroon;
  paymentMethod: PaymentMethod;
  accessGranted: boolean;
  accessGrantedAt?: string;
  requestsUsed: number;
  requestsAllowed: number;
  expiresAt: string;
}

interface L402Challenge {
  // The 402 Payment Required response
  statusCode: 402;
  www_authenticate: string;  // "L402 macaroon=..., invoice=..."
  invoice: LightningInvoice;
  macaroon: Macaroon;
  paymentInstructions: {
    lightning: string;
    tranToken: string;
    webhookUrl: string;
  };
}

// ── Invoice & Macaroon Factory ─────────────────────────────────────────────────

const invoiceRegistry = new Map<string, LightningInvoice>();
const macaroonRegistry = new Map<string, Macaroon>();
const sessionRegistry = new Map<string, PaymentSession>();

let totalRevenueSats = 0;
let totalRevenueTran = 0;
let totalInvoicesIssued = 0;
let totalPaid = 0;

function generateBolt11(amountSats: number, description: string): string {
  // Simulated BOLT-11 invoice
  const hash = Math.random().toString(36).slice(2, 12);
  return `lnbc${amountSats}n1pjhash${hash}xyz0000000000000000000000000000000000000000000000000description${btoa(description).slice(0, 20)}`;
}

function generatePaymentHash(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}

function createInvoice(
  amountSats: number,
  service: string,
  method: string,
  ttlSeconds = 3600
): LightningInvoice {
  const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const paymentHash = generatePaymentHash();

  const invoice: LightningInvoice = {
    invoiceId,
    dpid: 'DPID-ECO-L402-001',
    paymentRequest: generateBolt11(amountSats, `${service}:${method}`),
    paymentHash,
    amountSats,
    amountTran: amountSats * 1000,  // 1 sat = 1000 TRAN
    description: `L402 access: ${service} ${method}`,
    service,
    method,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  invoiceRegistry.set(invoiceId, invoice);
  totalInvoicesIssued++;
  return invoice;
}

function issueMacaroon(paymentHash: string, service: string, ttlSeconds: number, upifId?: string): Macaroon {
  const macaroonId = `MAC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const macaroon: Macaroon = {
    macaroonId,
    rootKey: generatePaymentHash(),
    identifier: `${service}:${macaroonId}`,
    paymentHash,
    caveats: [
      { type: 'time', condition: 'expiry', value: new Date(Date.now() + ttlSeconds * 1000).toISOString() },
      { type: 'service', condition: 'equals', value: service },
      { type: 'rate_limit', condition: 'max_requests_per_hour', value: '100' },
    ],
    signature: generatePaymentHash().slice(0, 32),
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    service,
    upifId,
  };

  macaroonRegistry.set(macaroonId, macaroon);
  return macaroon;
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());
app.use('*', logger());

app.use('*', async (c, next) => {
  c.header('X-DPID', 'DPID-ECO-L402-001');
  c.header('X-Service', 'L402 Gateway');
  c.header('X-Payment-Methods', 'lightning,tran-token');
  await next();
});

app.get('/health', (c) => c.json({
  dpid: 'DPID-ECO-L402-001',
  service: 'L402 Gateway',
  status: 'HEALTHY',
  lightningNetwork: 'mainnet',
  totalInvoicesIssued,
  totalPaid,
  totalRevenueSats,
  uptime: 99.9,
}));

// ── Challenge (issue 402) ─────────────────────────────────────────────────────

const ChallengeSchema = z.object({
  service: z.string(),
  method: z.string().optional().default('GET'),
  amountSats: z.number().min(1).default(10),
  ttlSeconds: z.number().min(60).max(86400).default(3600),
  upifId: z.string().optional(),
  paymentMethod: z.enum(['LIGHTNING', 'TRAN_TOKEN', 'HYBRID']).default('HYBRID'),
});

app.post('/challenge', async (c) => {
  const body = await c.req.json();
  const parsed = ChallengeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);

  const { service, method, amountSats, ttlSeconds, upifId, paymentMethod } = parsed.data;

  const invoice = createInvoice(amountSats, service, method!, ttlSeconds);
  const macaroon = issueMacaroon(invoice.paymentHash, service, ttlSeconds, upifId);

  const challenge: L402Challenge = {
    statusCode: 402,
    www_authenticate: `L402 macaroon="${macaroon.signature}", invoice="${invoice.paymentRequest}"`,
    invoice,
    macaroon,
    paymentInstructions: {
      lightning: `Pay ${amountSats} sats to invoice: ${invoice.paymentRequest}`,
      tranToken: `Transfer ${invoice.amountTran} TRAN to L402 Gateway (UPIF: ${upifId ?? 'anonymous'})`,
      webhookUrl: `POST /payment/confirm with { invoiceId, preimage }`,
    },
  };

  return c.json(challenge, 402);
});

// ── Payment Confirmation ──────────────────────────────────────────────────────

app.post('/payment/confirm', async (c) => {
  const body = await c.req.json();
  const { invoiceId, preimage, tranAmount, paymentMethod } = body;

  const invoice = invoiceRegistry.get(invoiceId);
  if (!invoice) return c.json({ error: 'Invoice not found', invoiceId }, 404);
  if (invoice.status === 'EXPIRED') return c.json({ error: 'Invoice expired' }, 410);
  if (invoice.status === 'PAID') return c.json({ error: 'Invoice already paid' }, 409);

  // Simulate payment validation
  if (paymentMethod === 'TRAN_TOKEN' && tranAmount >= invoice.amountTran) {
    invoice.status = 'PAID';
    invoice.paidAt = new Date().toISOString();
    invoiceRegistry.set(invoiceId, invoice);
    totalPaid++;
    totalRevenueTran += tranAmount;
  } else if (preimage) {
    // In production, validate preimage against paymentHash
    invoice.status = 'PAID';
    invoice.paidAt = new Date().toISOString();
    invoice.preimage = preimage;
    invoiceRegistry.set(invoiceId, invoice);
    totalPaid++;
    totalRevenueSats += invoice.amountSats;
  } else {
    return c.json({ error: 'Payment validation failed: provide preimage or tranAmount' }, 400);
  }

  // Create access session
  const macaroon = Array.from(macaroonRegistry.values()).find(m => m.paymentHash === invoice.paymentHash);
  const session: PaymentSession = {
    sessionId: `SES-${Date.now()}`,
    dpid: 'DPID-ECO-L402-001',
    invoice,
    macaroon: macaroon!,
    paymentMethod: paymentMethod ?? 'LIGHTNING',
    accessGranted: true,
    accessGrantedAt: new Date().toISOString(),
    requestsUsed: 0,
    requestsAllowed: 100,
    expiresAt: macaroon?.expiresAt ?? new Date(Date.now() + 3600000).toISOString(),
  };
  sessionRegistry.set(session.sessionId, session);

  return c.json({
    confirmed: true,
    sessionId: session.sessionId,
    accessToken: `${macaroon?.macaroonId}:${preimage ?? 'tran'}`,
    expiresAt: session.expiresAt,
    requestsAllowed: session.requestsAllowed,
  });
});

// ── Invoice Status ────────────────────────────────────────────────────────────

app.get('/invoice/:invoiceId', (c) => {
  const invoice = invoiceRegistry.get(c.req.param('invoiceId'));
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);
  return c.json(invoice);
});

// ── Revenue Stats ─────────────────────────────────────────────────────────────

app.get('/revenue', (c) => c.json({
  dpid: 'DPID-ECO-L402-001',
  generatedAt: new Date().toISOString(),
  totalInvoicesIssued,
  totalPaid,
  conversionRate: totalInvoicesIssued > 0 ? Math.round((totalPaid / totalInvoicesIssued) * 10000) / 100 : 0,
  totalRevenueSats,
  totalRevenueTran,
  activeSessions: sessionRegistry.size,
}));

// ── Pricing ───────────────────────────────────────────────────────────────────

app.get('/pricing', (c) => c.json({
  dpid: 'DPID-ECO-L402-001',
  currency: 'sats (Bitcoin Lightning)',
  services: {
    'oracle-foresight': { pricePerCall: 5, unit: 'sats' },
    'chrono-intelligence': { pricePerCall: 10, unit: 'sats' },
    'cornelius-strategy': { pricePerCall: 50, unit: 'sats' },
    'pqc-service': { pricePerCall: 2, unit: 'sats' },
    'depin-broker': { pricePerCall: 1, unit: 'sats' },
    'covert-synthesis': { pricePerCall: 100, unit: 'sats', note: 'Restricted access' },
  },
  tranEquivalents: { rateSatsPerTran: 0.001, note: '1000 TRAN = 1 sat' },
}));

app.get('/', (c) => c.json({
  service: 'L402 Gateway', dpid: 'DPID-ECO-L402-001', version: '1.0.0',
  description: 'Lightning Network L402 machine-to-machine micropayment gateway',
  endpoints: ['GET /health','POST /challenge','POST /payment/confirm','GET /invoice/:invoiceId','GET /revenue','GET /pricing'],
}));

export interface Env {
  DPID: string; SERVICE_NAME: string; SENTINEL_STATION: Fetcher;
}

export default app;
