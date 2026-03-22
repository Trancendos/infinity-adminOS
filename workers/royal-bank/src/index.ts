/**
 * Royal Bank of Arcadia — Cloudflare Worker
 * Financial intelligence, cost monitoring, revenue engine & tax compliance
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bearerAuth } from 'hono/bearer-auth';
import type {
  CostAlert,
  CostProfile,
  FreeTierUsage,
  RevenueStream,
  ProfitMargin,
  TaxCalculation,
  ApprovalRequest,
  ResearchReport,
  FinancialAuditEntry,
  ZeroCostAlternative,
} from '@arcadia/financial-types';

// ─── ENVIRONMENT BINDINGS ────────────────────────────────────────────────────

export interface Env {
  // KV Namespaces
  COST_PROFILES: KVNamespace;
  REVENUE_STREAMS: KVNamespace;
  APPROVAL_QUEUE: KVNamespace;
  RESEARCH_CACHE: KVNamespace;
  FREE_TIER_USAGE: KVNamespace;

  // D1 Database
  FINANCIAL_DB: D1Database;

  // AI Binding
  AI: Ai;

  // Secrets
  JWT_SECRET: string;
  VAULT_TOKEN: string;
  STRIPE_SECRET_KEY: string;
  COINgecko_API_KEY: string;
  ALPHA_VANTAGE_KEY: string;
  NEWS_API_KEY: string;
  INTERNAL_API_KEY: string;

  // Config
  ENVIRONMENT: string;
  PLATFORM_NAME: string;
}

// ─── ZERO-COST MANDATE CONFIG ────────────────────────────────────────────────

const ZERO_COST_MANDATE = {
  targetCost: 0.00,
  alertThreshold: 0.01, // Alert on any cost > $0.01
  dimensions: [
    'development', 'delivery', 'discovery', 'design', 'maintenance',
    'strategy', 'functions', 'hosting', 'provisioning', 'upkeep',
    'licensing', 'compliance'
  ],
  freeTierLimits: {
    cloudflare_workers: { limit: 100000, unit: 'requests/day', alertAt: 0.80 },
    cloudflare_kv_reads: { limit: 100000, unit: 'reads/day', alertAt: 0.80 },
    cloudflare_kv_writes: { limit: 1000, unit: 'writes/day', alertAt: 0.80 },
    cloudflare_r2: { limit: 10737418240, unit: 'bytes', alertAt: 0.80 },
    cloudflare_ai: { limit: 10000, unit: 'neurons/day', alertAt: 0.80 },
    supabase_db: { limit: 524288000, unit: 'bytes', alertAt: 0.80 },
    supabase_auth: { limit: 50000, unit: 'MAU', alertAt: 0.80 },
    github_actions: { limit: 2000, unit: 'minutes/month', alertAt: 0.80 },
    resend_email: { limit: 3000, unit: 'emails/month', alertAt: 0.80 },
  }
};

// ─── REVENUE STRATEGIES ──────────────────────────────────────────────────────

const APPROVED_REVENUE_STRATEGIES = [
  {
    id: 'marketplace_commission',
    name: 'Marketplace Commission',
    riskScore: 5,
    autoExecute: true,
    description: '5-15% commission on all marketplace sales',
  },
  {
    id: 'api_access_tiers',
    name: 'API Access Tiers',
    riskScore: 5,
    autoExecute: true,
    description: 'Freemium API with paid tiers for higher usage',
  },
  {
    id: 'affiliate_program',
    name: 'Affiliate Program',
    riskScore: 5,
    autoExecute: true,
    description: 'Referral commissions from partner services',
  },
  {
    id: 'arc_token_staking',
    name: 'ARC Token Staking Rewards',
    riskScore: 20,
    autoExecute: true,
    description: 'Platform earns 10% of staking yield pool',
  },
  {
    id: 'data_insights',
    name: 'Anonymised Data Insights',
    riskScore: 10,
    autoExecute: true,
    description: 'GDPR-compliant aggregate data licensing',
  },
  {
    id: 'white_label',
    name: 'White-Label Licensing',
    riskScore: 5,
    autoExecute: false, // Requires human negotiation
    description: 'License Infinity OS to other organisations',
  },
  {
    id: 'defi_yield',
    name: 'DeFi Yield Farming',
    riskScore: 40,
    autoExecute: false, // Requires human approval
    description: 'Deploy treasury to approved DeFi protocols',
  },
];

// ─── HONO APP ────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', cors({
  origin: ['https://trancendos.com', 'https://infinity-os.trancendos.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-API-Key'],
}));

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────

app.get('/health', (c) => {
  return c.json({
    status: 'operational',
    service: 'Royal Bank of Arcadia',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    mandate: 'zero_cost',
    environment: c.env.ENVIRONMENT,
  });
});

// ─── COST MONITORING ─────────────────────────────────────────────────────────

app.get('/api/v1/costs/overview', async (c) => {
  try {
    const profiles = await getCostProfiles(c.env);
    const totalCost = profiles.reduce((sum, p) => sum + p.totalMonthlyCost, 0);
    const violations = profiles.filter(p => p.totalMonthlyCost > 0);
    const freeTierUsage = await getFreeTierUsage(c.env);
    const criticalUsage = freeTierUsage.filter(u => u.percentUsed >= u.alertThreshold * 100);

    return c.json({
      totalMonthlyCost: totalCost,
      mandateStatus: totalCost === 0 ? 'COMPLIANT' : 'VIOLATION',
      servicesTracked: profiles.length,
      violations: violations.length,
      violationDetails: violations,
      freeTierUsage,
      criticalUsage,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch cost overview' }, 500);
  }
});

app.get('/api/v1/costs/alerts', async (c) => {
  try {
    const alerts = await getOpenCostAlerts(c.env);
    return c.json({ alerts, count: alerts.length });
  } catch (err) {
    return c.json({ error: 'Failed to fetch cost alerts' }, 500);
  }
});

app.post('/api/v1/costs/report', async (c) => {
  try {
    const body = await c.req.json();
    const { serviceId, serviceName, dimension, amount, currency, justification } = body;

    if (!serviceId || !dimension || amount === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Research zero-cost alternatives using AI
    const alternatives = await researchZeroCostAlternatives(
      c.env, serviceName, dimension, amount
    );

    // Create cost alert
    const alert: CostAlert = {
      id: crypto.randomUUID(),
      serviceId,
      serviceName,
      dimension,
      amount,
      currency: currency || 'USD',
      detectedAt: new Date(),
      status: 'open',
      alternativesResearched: alternatives,
    };

    // Store alert
    await c.env.COST_PROFILES.put(
      `alert:${alert.id}`,
      JSON.stringify(alert),
      { expirationTtl: 86400 * 90 } // 90 days
    );

    // Write to audit ledger
    await writeAuditEntry(c.env, {
      eventType: 'COST_ALERT_CREATED',
      description: `Cost alert: ${serviceName} - ${dimension} - $${amount}`,
      metadata: { alert },
    });

    // Notify approvers (via notification service)
    await notifyApprovers(c.env, alert);

    return c.json({
      alertId: alert.id,
      status: 'alert_created',
      alternatives,
      message: `Cost of $${amount} detected for ${serviceName}. ${alternatives.length} zero-cost alternatives found.`,
    }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to report cost' }, 500);
  }
});

app.get('/api/v1/costs/free-tier', async (c) => {
  try {
    const usage = await getFreeTierUsage(c.env);
    return c.json({ usage, lastUpdated: new Date().toISOString() });
  } catch (err) {
    return c.json({ error: 'Failed to fetch free tier usage' }, 500);
  }
});

// ─── REVENUE ENGINE ──────────────────────────────────────────────────────────

app.get('/api/v1/revenue/overview', async (c) => {
  try {
    const streams = await getRevenueStreams(c.env);
    const totalMonthly = streams
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + s.monthlyRevenue, 0);
    const totalTarget = streams
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + s.monthlyTarget, 0);

    return c.json({
      totalMonthlyRevenue: totalMonthly,
      totalMonthlyTarget: totalTarget,
      achievementRate: totalTarget > 0 ? (totalMonthly / totalTarget) * 100 : 0,
      activeStreams: streams.filter(s => s.status === 'active').length,
      totalStreams: streams.length,
      streams,
      projectedAnnualRevenue: totalMonthly * 12,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch revenue overview' }, 500);
  }
});

app.get('/api/v1/revenue/strategies', (c) => {
  return c.json({
    strategies: APPROVED_REVENUE_STRATEGIES,
    totalStrategies: APPROVED_REVENUE_STRATEGIES.length,
    autoExecutable: APPROVED_REVENUE_STRATEGIES.filter(s => s.autoExecute).length,
  });
});

app.post('/api/v1/revenue/research', async (c) => {
  try {
    const report = await runRevenueResearch(c.env);
    return c.json({ report });
  } catch (err) {
    return c.json({ error: 'Failed to run revenue research' }, 500);
  }
});

app.get('/api/v1/revenue/profit-margins', async (c) => {
  try {
    const margins = await getProfitMargins(c.env);
    return c.json({ margins });
  } catch (err) {
    return c.json({ error: 'Failed to fetch profit margins' }, 500);
  }
});

// ─── TAX ENGINE ──────────────────────────────────────────────────────────────

app.post('/api/v1/tax/calculate', async (c) => {
  try {
    const body = await c.req.json();
    const { transactionId, userId, userJurisdiction, amount, currency } = body;

    if (!transactionId || !userJurisdiction || !amount) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const calculation = await calculateTax(
      c.env, transactionId, userId, userJurisdiction, amount, currency
    );

    return c.json({ calculation });
  } catch (err) {
    return c.json({ error: 'Failed to calculate tax' }, 500);
  }
});

app.get('/api/v1/tax/jurisdictions', (c) => {
  return c.json({ jurisdictions: TAX_JURISDICTIONS });
});

app.get('/api/v1/tax/liability', async (c) => {
  try {
    const period = c.req.query('period') || 'monthly';
    const liability = await getTaxLiability(c.env, period);
    return c.json({ liability, period });
  } catch (err) {
    return c.json({ error: 'Failed to fetch tax liability' }, 500);
  }
});

// ─── APPROVAL WORKFLOW ───────────────────────────────────────────────────────

app.get('/api/v1/approvals/pending', async (c) => {
  try {
    const approvals = await getPendingApprovals(c.env);
    return c.json({ approvals, count: approvals.length });
  } catch (err) {
    return c.json({ error: 'Failed to fetch pending approvals' }, 500);
  }
});

app.post('/api/v1/approvals/:id/decide', async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();
    const { decision, reviewedBy, conditions, notes } = body;

    if (!decision || !reviewedBy) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const approval = await processApprovalDecision(
      c.env, id, decision, reviewedBy, conditions, notes
    );

    return c.json({ approval });
  } catch (err) {
    return c.json({ error: 'Failed to process approval' }, 500);
  }
});

// ─── RESEARCH ENGINE ─────────────────────────────────────────────────────────

app.get('/api/v1/research/reports', async (c) => {
  try {
    const category = c.req.query('category');
    const reports = await getResearchReports(c.env, category);
    return c.json({ reports, count: reports.length });
  } catch (err) {
    return c.json({ error: 'Failed to fetch research reports' }, 500);
  }
});

app.post('/api/v1/research/trigger', async (c) => {
  try {
    const body = await c.req.json();
    const { category, topic } = body;

    const report = await runAIResearch(c.env, category, topic);
    return c.json({ report });
  } catch (err) {
    return c.json({ error: 'Failed to trigger research' }, 500);
  }
});

// ─── AUDIT LEDGER ────────────────────────────────────────────────────────────

app.get('/api/v1/audit/entries', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const entries = await getAuditEntries(c.env, limit, offset);
    return c.json({ entries, limit, offset });
  } catch (err) {
    return c.json({ error: 'Failed to fetch audit entries' }, 500);
  }
});

// ─── EXCHANGE FEED ───────────────────────────────────────────────────────────

app.get('/api/v1/exchange/feed', async (c) => {
  try {
    const feed = await generateExchangeFeed(c.env);
    return c.json({ feed, generatedAt: new Date().toISOString() });
  } catch (err) {
    return c.json({ error: 'Failed to generate exchange feed' }, 500);
  }
});

// ─── SCHEDULED TASKS (Cron Triggers) ────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledTasks(event, env));
  },
};

async function runScheduledTasks(event: ScheduledEvent, env: Env) {
  const cron = event.cron;

  // Every hour: Monitor free tier usage
  if (cron === '0 * * * *') {
    await monitorFreeTierUsage(env);
  }

  // Every 6 hours: Run revenue research
  if (cron === '0 */6 * * *') {
    await runRevenueResearch(env);
  }

  // Daily: Generate profit margin report
  if (cron === '0 9 * * *') {
    await generateDailyFinancialReport(env);
  }

  // Weekly: Full financial audit
  if (cron === '0 9 * * 1') {
    await runWeeklyAudit(env);
  }

  // Monthly: Tax liability calculation
  if (cron === '0 9 1 * *') {
    await calculateMonthlyTaxLiability(env);
  }
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

async function getCostProfiles(env: Env): Promise<CostProfile[]> {
  // In production, fetch from D1 database
  // For now, return mock data structure
  return [];
}

async function getOpenCostAlerts(env: Env): Promise<CostAlert[]> {
  const keys = await env.COST_PROFILES.list({ prefix: 'alert:' });
  const alerts: CostAlert[] = [];

  for (const key of keys.keys) {
    const data = await env.COST_PROFILES.get(key.name);
    if (data) {
      const alert = JSON.parse(data) as CostAlert;
      if (alert.status === 'open') {
        alerts.push(alert);
      }
    }
  }

  return alerts;
}

async function getFreeTierUsage(env: Env): Promise<FreeTierUsage[]> {
  const usage: FreeTierUsage[] = [];

  for (const [serviceId, config] of Object.entries(ZERO_COST_MANDATE.freeTierLimits)) {
    const currentData = await env.FREE_TIER_USAGE.get(serviceId);
    const current = currentData ? parseInt(currentData) : 0;
    const percentUsed = (current / config.limit) * 100;

    usage.push({
      serviceId,
      serviceName: serviceId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      provider: serviceId.split('_')[0],
      metric: serviceId,
      limit: config.limit,
      current,
      unit: config.unit,
      percentUsed,
      alertThreshold: config.alertAt * 100,
    });
  }

  return usage;
}

async function getRevenueStreams(env: Env): Promise<RevenueStream[]> {
  const keys = await env.REVENUE_STREAMS.list({ prefix: 'stream:' });
  const streams: RevenueStream[] = [];

  for (const key of keys.keys) {
    const data = await env.REVENUE_STREAMS.get(key.name);
    if (data) {
      streams.push(JSON.parse(data) as RevenueStream);
    }
  }

  // Seed with default streams if empty
  if (streams.length === 0) {
    return getDefaultRevenueStreams();
  }

  return streams;
}

function getDefaultRevenueStreams(): RevenueStream[] {
  const now = new Date();
  return APPROVED_REVENUE_STRATEGIES.map(strategy => ({
    id: strategy.id,
    name: strategy.name,
    type: strategy.id as any,
    status: 'researching' as const,
    monthlyRevenue: 0,
    monthlyTarget: 500,
    monthlyGrowthRate: 0,
    riskScore: strategy.riskScore,
    automationLevel: strategy.autoExecute ? 'full' : 'semi' as const,
    currency: 'USD',
    lastReviewDate: now,
    nextOptimisationDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    approvedBy: 'system',
    approvedAt: now,
    notes: strategy.description,
    metrics: {
      totalRevenue: 0,
      totalTransactions: 0,
      averageTransactionValue: 0,
      conversionRate: 0,
      churnRate: 0,
      ltv: 0,
      cac: 0,
      paybackPeriod: 0,
      mrr: 0,
      arr: 0,
      growthRate: 0,
    },
  }));
}

async function getProfitMargins(env: Env): Promise<ProfitMargin[]> {
  // Fetch from D1 in production
  return [];
}

async function researchZeroCostAlternatives(
  env: Env,
  serviceName: string,
  dimension: string,
  amount: number
): Promise<ZeroCostAlternative[]> {
  try {
    // Use Cloudflare Workers AI to research alternatives
    const prompt = `You are a cost optimisation expert for a cloud-native platform.
    
Service: ${serviceName}
Cost Dimension: ${dimension}
Current Cost: $${amount}/month

Research and provide 3 zero-cost alternatives to eliminate this cost.
For each alternative, provide:
1. Name of the alternative
2. Brief description
3. URL/link
4. Implementation effort (low/medium/high)
5. Risk level (low/medium/high)

Focus on: open-source tools, free tiers, self-hosted solutions, and community alternatives.
Return as JSON array.`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    });

    // Parse AI response
    const text = (response as any).response || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('AI research failed:', err);
  }

  // Fallback alternatives
  return [
    {
      name: 'Self-hosted OSS Alternative',
      description: `Open-source alternative to ${serviceName}`,
      url: 'https://github.com/topics/open-source',
      estimatedSavings: amount,
      implementationEffort: 'medium',
      riskLevel: 'low',
      recommended: true,
    },
    {
      name: 'Cloudflare Free Tier',
      description: 'Migrate to Cloudflare free tier equivalent',
      url: 'https://cloudflare.com/plans',
      estimatedSavings: amount,
      implementationEffort: 'low',
      riskLevel: 'low',
      recommended: true,
    },
  ];
}

async function calculateTax(
  env: Env,
  transactionId: string,
  userId: string,
  userJurisdiction: string,
  amount: number,
  currency: string
): Promise<TaxCalculation> {
  const jurisdiction = TAX_JURISDICTIONS.find(j => j.code === userJurisdiction);
  const taxRate = jurisdiction?.rate || 0;
  const taxAmount = amount * (taxRate / 100);

  const calculation: TaxCalculation = {
    transactionId,
    userId,
    userJurisdiction,
    platformJurisdiction: 'GB',
    grossAmount: amount,
    taxableAmount: amount,
    taxRate,
    taxAmount,
    netAmount: amount + taxAmount,
    taxType: jurisdiction?.taxType || 'VAT',
    currency: currency || 'USD',
    calculatedAt: new Date(),
    filingPeriod: getCurrentFilingPeriod(),
  };

  return calculation;
}

function getCurrentFilingPeriod(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${quarter}`;
}

async function getTaxLiability(env: Env, period: string): Promise<Record<string, number>> {
  // Aggregate tax liability from D1 in production
  return {
    GB_VAT: 0,
    EU_VAT: 0,
    US_SALES: 0,
    TOTAL: 0,
  };
}

async function getPendingApprovals(env: Env): Promise<ApprovalRequest[]> {
  const keys = await env.APPROVAL_QUEUE.list({ prefix: 'approval:' });
  const approvals: ApprovalRequest[] = [];

  for (const key of keys.keys) {
    const data = await env.APPROVAL_QUEUE.get(key.name);
    if (data) {
      const approval = JSON.parse(data) as ApprovalRequest;
      if (approval.status === 'pending') {
        approvals.push(approval);
      }
    }
  }

  return approvals;
}

async function processApprovalDecision(
  env: Env,
  id: string,
  decision: string,
  reviewedBy: string,
  conditions?: string[],
  notes?: string
): Promise<ApprovalRequest> {
  const data = await env.APPROVAL_QUEUE.get(`approval:${id}`);
  if (!data) throw new Error('Approval not found');

  const approval = JSON.parse(data) as ApprovalRequest;
  approval.status = decision as any;
  approval.reviewedBy = reviewedBy;
  approval.reviewedAt = new Date();
  approval.conditions = conditions;
  approval.decision = notes;

  await env.APPROVAL_QUEUE.put(`approval:${id}`, JSON.stringify(approval));

  await writeAuditEntry(env, {
    eventType: 'APPROVAL_DECISION',
    description: `Approval ${id} ${decision} by ${reviewedBy}`,
    metadata: { approval },
  });

  return approval;
}

async function getResearchReports(env: Env, category?: string): Promise<ResearchReport[]> {
  const keys = await env.RESEARCH_CACHE.list({ prefix: 'report:' });
  const reports: ResearchReport[] = [];

  for (const key of keys.keys) {
    const data = await env.RESEARCH_CACHE.get(key.name);
    if (data) {
      const report = JSON.parse(data) as ResearchReport;
      if (!category || report.category === category) {
        reports.push(report);
      }
    }
  }

  return reports;
}

async function runAIResearch(
  env: Env,
  category: string,
  topic: string
): Promise<ResearchReport> {
  const prompt = `You are a financial research analyst for Arcadia, a zero-cost cloud platform.

Research Topic: ${topic}
Category: ${category}

Provide a structured research report with:
1. Key findings (3-5 findings)
2. Revenue opportunities identified
3. Cost reduction opportunities
4. Risk assessment
5. Specific actionable recommendations

Focus on zero-cost solutions, open-source tools, and passive income strategies.
Consider: DeFi yields, affiliate programs, API monetisation, white-labelling, marketplace commissions.`;

  let aiResponse = '';
  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
    });
    aiResponse = (response as any).response || '';
  } catch (err) {
    aiResponse = 'AI research unavailable - manual research required';
  }

  const report: ResearchReport = {
    id: crypto.randomUUID(),
    title: `${category} Research: ${topic}`,
    category: category as any,
    summary: aiResponse.substring(0, 500),
    findings: [
      {
        title: 'Research Completed',
        description: aiResponse,
        evidence: 'AI-generated analysis',
        impact: 'medium',
        confidence: 0.75,
      }
    ],
    recommendations: [
      {
        title: 'Review AI Findings',
        description: 'Human review of AI-generated research recommended',
        action: 'Schedule review meeting',
        estimatedBenefit: 0,
        implementationEffort: 'low',
        priority: 'medium',
        requiresApproval: false,
      }
    ],
    opportunityScore: 50,
    riskScore: 20,
    estimatedImpact: 0,
    generatedAt: new Date(),
    generatedBy: 'ai_engine',
    status: 'draft',
    sources: ['Cloudflare Workers AI', 'Internal data'],
  };

  // Cache the report
  await env.RESEARCH_CACHE.put(
    `report:${report.id}`,
    JSON.stringify(report),
    { expirationTtl: 86400 * 30 }
  );

  return report;
}

async function runRevenueResearch(env: Env): Promise<ResearchReport> {
  return runAIResearch(
    env,
    'revenue_opportunity',
    'New passive income and monetisation opportunities for Arcadia platform'
  );
}

async function writeAuditEntry(
  env: Env,
  entry: Partial<FinancialAuditEntry>
): Promise<void> {
  const id = crypto.randomUUID();
  const timestamp = new Date();

  const fullEntry: FinancialAuditEntry = {
    id,
    timestamp,
    eventType: entry.eventType || 'UNKNOWN',
    description: entry.description || '',
    metadata: entry.metadata || {},
    hash: await generateHash(`${id}${timestamp.toISOString()}${entry.description}`),
    previousHash: await getLastAuditHash(env),
    signature: 'pending', // In production, sign with Vault
    ...entry,
  };

  await env.COST_PROFILES.put(
    `audit:${timestamp.toISOString()}:${id}`,
    JSON.stringify(fullEntry),
    { expirationTtl: 86400 * 365 * 7 } // 7 years retention
  );
}

async function generateHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getLastAuditHash(env: Env): Promise<string> {
  const keys = await env.COST_PROFILES.list({ prefix: 'audit:', limit: 1 });
  if (keys.keys.length === 0) return '0'.repeat(64);

  const lastKey = keys.keys[keys.keys.length - 1];
  const data = await env.COST_PROFILES.get(lastKey.name);
  if (!data) return '0'.repeat(64);

  const entry = JSON.parse(data) as FinancialAuditEntry;
  return entry.hash;
}

async function notifyApprovers(env: Env, alert: CostAlert): Promise<void> {
  // In production, send to notification service
  console.log(`COST ALERT: ${alert.serviceName} - ${alert.dimension} - $${alert.amount}`);
}

async function monitorFreeTierUsage(env: Env): Promise<void> {
  const usage = await getFreeTierUsage(env);
  const critical = usage.filter(u => u.percentUsed >= u.alertThreshold);

  for (const item of critical) {
    await writeAuditEntry(env, {
      eventType: 'FREE_TIER_ALERT',
      description: `${item.serviceName} at ${item.percentUsed.toFixed(1)}% of free tier limit`,
      metadata: { item },
    });
  }
}

async function generateDailyFinancialReport(env: Env): Promise<void> {
  await runAIResearch(env, 'market_intelligence', 'Daily financial summary and opportunities');
}

async function runWeeklyAudit(env: Env): Promise<void> {
  await runAIResearch(env, 'cost_reduction', 'Weekly cost audit and optimisation opportunities');
}

async function calculateMonthlyTaxLiability(env: Env): Promise<void> {
  await writeAuditEntry(env, {
    eventType: 'MONTHLY_TAX_CALCULATION',
    description: 'Monthly tax liability calculation triggered',
    metadata: { period: getCurrentFilingPeriod() },
  });
}

async function getAuditEntries(
  env: Env,
  limit: number,
  offset: number
): Promise<FinancialAuditEntry[]> {
  const keys = await env.COST_PROFILES.list({ prefix: 'audit:', limit });
  const entries: FinancialAuditEntry[] = [];

  for (const key of keys.keys) {
    const data = await env.COST_PROFILES.get(key.name);
    if (data) {
      entries.push(JSON.parse(data) as FinancialAuditEntry);
    }
  }

  return entries;
}

async function generateExchangeFeed(env: Env): Promise<Record<string, unknown>> {
  const streams = await getRevenueStreams(env);
  const alerts = await getOpenCostAlerts(env);

  return {
    totalRevenue: streams.reduce((s, r) => s + r.monthlyRevenue, 0),
    activeStreams: streams.filter(s => s.status === 'active').length,
    openAlerts: alerts.length,
    mandateStatus: alerts.length === 0 ? 'COMPLIANT' : 'REVIEW_REQUIRED',
    topOpportunities: streams
      .filter(s => s.status === 'researching')
      .slice(0, 3)
      .map(s => ({ id: s.id, name: s.name, target: s.monthlyTarget })),
    timestamp: new Date().toISOString(),
  };
}

// ─── TAX JURISDICTIONS DATA ──────────────────────────────────────────────────

const TAX_JURISDICTIONS = [
  { code: 'GB', name: 'United Kingdom', country: 'UK', taxType: 'VAT' as const, rate: 20, threshold: 85000, registrationRequired: false, registrationStatus: 'not_required' as const, filingFrequency: 'quarterly' as const, nextFilingDate: new Date(), estimatedLiability: 0, currency: 'GBP' },
  { code: 'DE', name: 'Germany', country: 'Germany', taxType: 'VAT' as const, rate: 19, threshold: 0, registrationRequired: false, registrationStatus: 'not_required' as const, filingFrequency: 'quarterly' as const, nextFilingDate: new Date(), estimatedLiability: 0, currency: 'EUR' },
  { code: 'FR', name: 'France', country: 'France', taxType: 'VAT' as const, rate: 20, threshold: 0, registrationRequired: false, registrationStatus: 'not_required' as const, filingFrequency: 'quarterly' as const, nextFilingDate: new Date(), estimatedLiability: 0, currency: 'EUR' },
  { code: 'US', name: 'United States', country: 'USA', taxType: 'Sales' as const, rate: 0, threshold: 100000, registrationRequired: false, registrationStatus: 'not_required' as const, filingFrequency: 'quarterly' as const, nextFilingDate: new Date(), estimatedLiability: 0, currency: 'USD' },
  { code: 'AU', name: 'Australia', country: 'Australia', taxType: 'GST' as const, rate: 10, threshold: 75000, registrationRequired: false, registrationStatus: 'not_required' as const, filingFrequency: 'quarterly' as const, nextFilingDate: new Date(), estimatedLiability: 0, currency: 'AUD' },
  { code: 'CA', name: 'Canada', country: 'Canada', taxType: 'GST' as const, rate: 5, threshold: 30000, registrationRequired: false, registrationStatus: 'not_required' as const, filingFrequency: 'quarterly' as const, nextFilingDate: new Date(), estimatedLiability: 0, currency: 'CAD' },
];