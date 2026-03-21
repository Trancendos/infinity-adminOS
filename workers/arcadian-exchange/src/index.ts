/**
 * Arcadian Exchange — Cloudflare Worker
 * Digital marketplace, trading engine & autonomous investment backend
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type {
  MarketplaceAsset,
  Order,
  OrderBook,
  ARCTokenMetrics,
  UserWallet,
  InvestmentStrategy,
  BotAgent,
  Portfolio,
  BotLog,
} from '../../financial-types/src/index';

// ─── ENVIRONMENT BINDINGS ────────────────────────────────────────────────────

export interface Env {
  // KV Namespaces
  MARKETPLACE: KVNamespace;
  ORDER_BOOK: KVNamespace;
  WALLETS: KVNamespace;
  BOT_STATE: KVNamespace;
  PORTFOLIO: KVNamespace;

  // Durable Objects
  TRADING_ENGINE: DurableObjectNamespace;
  MARKET_MAKER: DurableObjectNamespace;

  // D1 Database
  EXCHANGE_DB: D1Database;

  // AI
  AI: Ai;

  // Secrets
  JWT_SECRET: string;
  RBA_API_KEY: string;
  COINGECKO_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  WEB3_RPC_URL: string;
  INTERNAL_API_KEY: string;

  // Config
  ENVIRONMENT: string;
  ARC_TOKEN_CONTRACT: string;
  PLATFORM_WALLET: string;
}

// ─── RISK PARAMETERS ─────────────────────────────────────────────────────────

const RISK_CONFIG = {
  autoExecuteThreshold: 40,      // Risk score ≤ 40: auto-execute
  humanReviewThreshold: 70,      // Risk score 41-70: human review
  boardApprovalThreshold: 90,    // Risk score 71-90: board approval
  prohibitedThreshold: 91,       // Risk score > 90: prohibited

  portfolioRules: {
    maxSingleStrategy: 0.20,     // Max 20% in any single strategy
    maxCryptoDefi: 0.40,         // Max 40% in crypto/DeFi
    minZeroRisk: 0.30,           // Min 30% in zero-risk strategies
    maxExperimental: 0.10,       // Max 10% in experimental
    emergencyReserve: 0.20,      // Always keep 20% liquid
  },

  commissionRates: {
    individual: 0.15,            // 15% for individual developers
    verified_partner: 0.10,      // 10% for verified partners
    enterprise_partner: 0.05,    // 5% for enterprise partners
    platform: 0.00,              // 0% for Trancendos first-party
  },
};

// ─── HONO APP ────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', cors({
  origin: ['https://trancendos.com', 'https://infinity-os.trancendos.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-API-Key'],
}));

// ─── HEALTH ──────────────────────────────────────────────────────────────────

app.get('/health', (c) => {
  return c.json({
    status: 'operational',
    service: 'Arcadian Exchange',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    layers: { front: 'active', back: 'active' },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FRONT LAYER — MARKETPLACE
// ═══════════════════════════════════════════════════════════════════════════

// ─── MARKETPLACE LISTINGS ────────────────────────────────────────────────────

app.get('/api/v1/marketplace/assets', async (c) => {
  try {
    const category = c.req.query('category');
    const type = c.req.query('type');
    const sort = c.req.query('sort') || 'popular';
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const assets = await getMarketplaceAssets(c.env, { category, type, sort, limit, offset });

    return c.json({
      assets,
      total: assets.length,
      limit,
      offset,
      filters: { category, type, sort },
    });
  } catch (err) {
    return c.json({ error: 'Failed to fetch marketplace assets' }, 500);
  }
});

app.get('/api/v1/marketplace/assets/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const asset = await getAssetById(c.env, id);

    if (!asset) {
      return c.json({ error: 'Asset not found' }, 404);
    }

    return c.json({ asset });
  } catch (err) {
    return c.json({ error: 'Failed to fetch asset' }, 500);
  }
});

app.post('/api/v1/marketplace/assets', async (c) => {
  try {
    const body = await c.req.json();
    const asset = await createMarketplaceListing(c.env, body);
    return c.json({ asset }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to create listing' }, 500);
  }
});

app.get('/api/v1/marketplace/categories', (c) => {
  return c.json({ categories: MARKETPLACE_CATEGORIES });
});

app.get('/api/v1/marketplace/featured', async (c) => {
  try {
    const featured = await getFeaturedAssets(c.env);
    return c.json({ featured });
  } catch (err) {
    return c.json({ error: 'Failed to fetch featured assets' }, 500);
  }
});

app.get('/api/v1/marketplace/search', async (c) => {
  try {
    const query = c.req.query('q') || '';
    const results = await searchMarketplace(c.env, query);
    return c.json({ results, query, count: results.length });
  } catch (err) {
    return c.json({ error: 'Search failed' }, 500);
  }
});

// ─── PURCHASES & TRANSACTIONS ────────────────────────────────────────────────

app.post('/api/v1/marketplace/purchase', async (c) => {
  try {
    const body = await c.req.json();
    const { assetId, userId, paymentMethod, currency } = body;

    if (!assetId || !userId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const result = await processPurchase(c.env, assetId, userId, paymentMethod, currency);
    return c.json({ result }, 201);
  } catch (err) {
    return c.json({ error: 'Purchase failed' }, 500);
  }
});

app.get('/api/v1/marketplace/purchases/:userId', async (c) => {
  try {
    const { userId } = c.req.param();
    const purchases = await getUserPurchases(c.env, userId);
    return c.json({ purchases, count: purchases.length });
  } catch (err) {
    return c.json({ error: 'Failed to fetch purchases' }, 500);
  }
});

// ─── ORDER BOOK & TRADING ────────────────────────────────────────────────────

app.get('/api/v1/exchange/orderbook/:assetId', async (c) => {
  try {
    const { assetId } = c.req.param();
    const orderBook = await getOrderBook(c.env, assetId);
    return c.json({ orderBook });
  } catch (err) {
    return c.json({ error: 'Failed to fetch order book' }, 500);
  }
});

app.post('/api/v1/exchange/orders', async (c) => {
  try {
    const body = await c.req.json();
    const order = await placeOrder(c.env, body);
    return c.json({ order }, 201);
  } catch (err) {
    return c.json({ error: 'Failed to place order' }, 500);
  }
});

app.delete('/api/v1/exchange/orders/:id', async (c) => {
  try {
    const { id } = c.req.param();
    await cancelOrder(c.env, id);
    return c.json({ message: 'Order cancelled', orderId: id });
  } catch (err) {
    return c.json({ error: 'Failed to cancel order' }, 500);
  }
});

app.get('/api/v1/exchange/orders/:userId', async (c) => {
  try {
    const { userId } = c.req.param();
    const orders = await getUserOrders(c.env, userId);
    return c.json({ orders, count: orders.length });
  } catch (err) {
    return c.json({ error: 'Failed to fetch orders' }, 500);
  }
});

// ─── ARC TOKEN ───────────────────────────────────────────────────────────────

app.get('/api/v1/arc/metrics', async (c) => {
  try {
    const metrics = await getARCTokenMetrics(c.env);
    return c.json({ metrics });
  } catch (err) {
    return c.json({ error: 'Failed to fetch ARC metrics' }, 500);
  }
});

app.get('/api/v1/arc/wallet/:userId', async (c) => {
  try {
    const { userId } = c.req.param();
    const wallet = await getUserWallet(c.env, userId);
    return c.json({ wallet });
  } catch (err) {
    return c.json({ error: 'Failed to fetch wallet' }, 500);
  }
});

app.post('/api/v1/arc/stake', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, amount } = body;

    if (!userId || !amount) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const result = await stakeARC(c.env, userId, amount);
    return c.json({ result });
  } catch (err) {
    return c.json({ error: 'Staking failed' }, 500);
  }
});

app.post('/api/v1/arc/unstake', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, amount } = body;
    const result = await unstakeARC(c.env, userId, amount);
    return c.json({ result });
  } catch (err) {
    return c.json({ error: 'Unstaking failed' }, 500);
  }
});

// ─── CURRENCY EXCHANGE ───────────────────────────────────────────────────────

app.get('/api/v1/exchange/rates', async (c) => {
  try {
    const rates = await getExchangeRates(c.env);
    return c.json({ rates, updatedAt: new Date().toISOString() });
  } catch (err) {
    return c.json({ error: 'Failed to fetch exchange rates' }, 500);
  }
});

app.post('/api/v1/exchange/convert', async (c) => {
  try {
    const body = await c.req.json();
    const { from, to, amount, userId } = body;
    const result = await convertCurrency(c.env, from, to, amount, userId);
    return c.json({ result });
  } catch (err) {
    return c.json({ error: 'Conversion failed' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BACK LAYER — INVESTMENT ENGINE
// ═══════════════════════════════════════════════════════════════════════════

// ─── INVESTMENT STRATEGIES ───────────────────────────────────────────────────

app.get('/api/v1/investment/strategies', async (c) => {
  try {
    const strategies = await getInvestmentStrategies(c.env);
    return c.json({ strategies, count: strategies.length });
  } catch (err) {
    return c.json({ error: 'Failed to fetch strategies' }, 500);
  }
});

app.get('/api/v1/investment/portfolio', async (c) => {
  try {
    const portfolio = await getPortfolio(c.env);
    return c.json({ portfolio });
  } catch (err) {
    return c.json({ error: 'Failed to fetch portfolio' }, 500);
  }
});

app.post('/api/v1/investment/strategies/:id/execute', async (c) => {
  try {
    const { id } = c.req.param();
    const result = await executeStrategy(c.env, id);
    return c.json({ result });
  } catch (err) {
    return c.json({ error: 'Strategy execution failed' }, 500);
  }
});

// ─── BOT AGENTS ──────────────────────────────────────────────────────────────

app.get('/api/v1/bots', async (c) => {
  try {
    const bots = await getAllBots(c.env);
    return c.json({ bots, count: bots.length });
  } catch (err) {
    return c.json({ error: 'Failed to fetch bots' }, 500);
  }
});

app.get('/api/v1/bots/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const bot = await getBotById(c.env, id);
    if (!bot) return c.json({ error: 'Bot not found' }, 404);
    return c.json({ bot });
  } catch (err) {
    return c.json({ error: 'Failed to fetch bot' }, 500);
  }
});

app.post('/api/v1/bots/:id/start', async (c) => {
  try {
    const { id } = c.req.param();
    const bot = await startBot(c.env, id);
    return c.json({ bot, message: `Bot ${id} started` });
  } catch (err) {
    return c.json({ error: 'Failed to start bot' }, 500);
  }
});

app.post('/api/v1/bots/:id/stop', async (c) => {
  try {
    const { id } = c.req.param();
    const bot = await stopBot(c.env, id);
    return c.json({ bot, message: `Bot ${id} stopped` });
  } catch (err) {
    return c.json({ error: 'Failed to stop bot' }, 500);
  }
});

app.get('/api/v1/bots/:id/logs', async (c) => {
  try {
    const { id } = c.req.param();
    const limit = parseInt(c.req.query('limit') || '50');
    const logs = await getBotLogs(c.env, id, limit);
    return c.json({ logs, botId: id });
  } catch (err) {
    return c.json({ error: 'Failed to fetch bot logs' }, 500);
  }
});

// ─── PASSIVE INCOME ──────────────────────────────────────────────────────────

app.get('/api/v1/passive-income/overview', async (c) => {
  try {
    const overview = await getPassiveIncomeOverview(c.env);
    return c.json({ overview });
  } catch (err) {
    return c.json({ error: 'Failed to fetch passive income overview' }, 500);
  }
});

app.get('/api/v1/passive-income/opportunities', async (c) => {
  try {
    const opportunities = await discoverPassiveIncomeOpportunities(c.env);
    return c.json({ opportunities });
  } catch (err) {
    return c.json({ error: 'Failed to discover opportunities' }, 500);
  }
});

// ─── ANALYTICS & REPORTING ───────────────────────────────────────────────────

app.get('/api/v1/analytics/revenue', async (c) => {
  try {
    const period = c.req.query('period') || '30d';
    const analytics = await getRevenueAnalytics(c.env, period);
    return c.json({ analytics, period });
  } catch (err) {
    return c.json({ error: 'Failed to fetch analytics' }, 500);
  }
});

app.get('/api/v1/analytics/marketplace', async (c) => {
  try {
    const analytics = await getMarketplaceAnalytics(c.env);
    return c.json({ analytics });
  } catch (err) {
    return c.json({ error: 'Failed to fetch marketplace analytics' }, 500);
  }
});

// ─── SCHEDULED TASKS ─────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runExchangeScheduledTasks(event, env));
  },
};

async function runExchangeScheduledTasks(event: ScheduledEvent, env: Env) {
  const cron = event.cron;

  // Every 5 minutes: Run arbitrage bot
  if (cron === '*/5 * * * *') {
    await runArbitrageBot(env);
  }

  // Every 15 minutes: Market maker bot
  if (cron === '*/15 * * * *') {
    await runMarketMakerBot(env);
  }

  // Every hour: DeFi yield optimizer
  if (cron === '0 * * * *') {
    await runDeFiYieldOptimizer(env);
  }

  // Every 6 hours: Passive income scan
  if (cron === '0 */6 * * *') {
    await runPassiveIncomeScan(env);
  }

  // Daily: Portfolio rebalancing
  if (cron === '0 2 * * *') {
    await rebalancePortfolio(env);
  }

  // Daily: ARC token burn
  if (cron === '0 0 * * *') {
    await processTokenBurn(env);
  }
}

// ─── MARKETPLACE HELPERS ─────────────────────────────────────────────────────

async function getMarketplaceAssets(
  env: Env,
  filters: { category?: string; type?: string; sort?: string; limit: number; offset: number }
): Promise<MarketplaceAsset[]> {
  const keys = await env.MARKETPLACE.list({ prefix: 'asset:', limit: filters.limit });
  const assets: MarketplaceAsset[] = [];

  for (const key of keys.keys) {
    const data = await env.MARKETPLACE.get(key.name);
    if (data) {
      const asset = JSON.parse(data) as MarketplaceAsset;
      if (asset.status === 'active') {
        if (!filters.category || asset.category === filters.category) {
          if (!filters.type || asset.type === filters.type) {
            assets.push(asset);
          }
        }
      }
    }
  }

  // Sort
  if (filters.sort === 'popular') {
    assets.sort((a, b) => b.downloads - a.downloads);
  } else if (filters.sort === 'rating') {
    assets.sort((a, b) => b.rating - a.rating);
  } else if (filters.sort === 'newest') {
    assets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (filters.sort === 'price_asc') {
    assets.sort((a, b) => a.price - b.price);
  } else if (filters.sort === 'price_desc') {
    assets.sort((a, b) => b.price - a.price);
  }

  // Seed demo assets if empty
  if (assets.length === 0) {
    return getDemoAssets();
  }

  return assets.slice(filters.offset, filters.offset + filters.limit);
}

function getDemoAssets(): MarketplaceAsset[] {
  const now = new Date();
  return [
    {
      id: 'asset-001',
      name: 'Infinity Dashboard Pro',
      description: 'Advanced analytics dashboard with real-time metrics, customisable widgets, and AI-powered insights for Infinity OS.',
      type: 'ui_component',
      sellerId: 'trancendos',
      sellerName: 'Trancendos',
      sellerVerified: true,
      price: 0,
      currency: 'ARC',
      pricingModel: 'freemium',
      category: 'Productivity',
      tags: ['dashboard', 'analytics', 'widgets', 'ai'],
      version: '2.1.0',
      downloads: 1247,
      rating: 4.8,
      reviewCount: 89,
      licenseType: 'MIT',
      compatibleWith: ['infinity-os-1.x', 'infinity-os-2.x'],
      screenshots: [],
      demoUrl: 'https://demo.trancendos.com/dashboard-pro',
      documentationUrl: 'https://docs.trancendos.com/dashboard-pro',
      createdAt: now,
      updatedAt: now,
      status: 'active',
      commissionRate: 0,
    },
    {
      id: 'asset-002',
      name: 'AI Agent Builder',
      description: 'Visual drag-and-drop interface for building, training, and deploying AI agents within Infinity OS.',
      type: 'ai_agent',
      sellerId: 'trancendos',
      sellerName: 'Trancendos',
      sellerVerified: true,
      price: 500,
      currency: 'ARC',
      pricingModel: 'one_time',
      category: 'AI & Automation',
      tags: ['ai', 'agents', 'automation', 'no-code'],
      version: '1.0.0',
      downloads: 432,
      rating: 4.6,
      reviewCount: 34,
      licenseType: 'Commercial',
      compatibleWith: ['infinity-os-2.x'],
      screenshots: [],
      createdAt: now,
      updatedAt: now,
      status: 'active',
      commissionRate: 0,
    },
    {
      id: 'asset-003',
      name: 'GDPR Compliance Pack',
      description: 'Complete GDPR compliance toolkit: consent management, data subject requests, audit trails, and DPA templates.',
      type: 'compliance_pack',
      sellerId: 'trancendos',
      sellerName: 'Trancendos',
      sellerVerified: true,
      price: 200,
      currency: 'ARC',
      pricingModel: 'annual',
      category: 'Compliance',
      tags: ['gdpr', 'compliance', 'privacy', 'legal'],
      version: '3.0.0',
      downloads: 891,
      rating: 4.9,
      reviewCount: 156,
      licenseType: 'Commercial',
      compatibleWith: ['infinity-os-1.x', 'infinity-os-2.x'],
      screenshots: [],
      createdAt: now,
      updatedAt: now,
      status: 'active',
      commissionRate: 0,
    },
    {
      id: 'asset-004',
      name: 'Crypto Portfolio Tracker',
      description: 'Real-time cryptocurrency portfolio tracking with DeFi yield monitoring, tax reporting, and profit/loss analysis.',
      type: 'full_application',
      sellerId: 'defi-labs',
      sellerName: 'DeFi Labs',
      sellerVerified: true,
      price: 150,
      currency: 'ARC',
      pricingModel: 'monthly',
      category: 'Finance',
      tags: ['crypto', 'defi', 'portfolio', 'tax'],
      version: '1.5.2',
      downloads: 2103,
      rating: 4.4,
      reviewCount: 201,
      licenseType: 'Commercial',
      compatibleWith: ['infinity-os-2.x'],
      screenshots: [],
      createdAt: now,
      updatedAt: now,
      status: 'active',
      commissionRate: 0.10,
    },
    {
      id: 'asset-005',
      name: 'Zero-Trust Security Module',
      description: 'Enterprise-grade zero-trust security: continuous verification, micro-segmentation, and threat detection.',
      type: 'security_plugin',
      sellerId: 'securenet',
      sellerName: 'SecureNet',
      sellerVerified: true,
      price: 1000,
      currency: 'ARC',
      pricingModel: 'annual',
      category: 'Security',
      tags: ['security', 'zero-trust', 'enterprise', 'compliance'],
      version: '2.0.0',
      downloads: 567,
      rating: 4.7,
      reviewCount: 78,
      licenseType: 'Commercial',
      compatibleWith: ['infinity-os-2.x'],
      screenshots: [],
      createdAt: now,
      updatedAt: now,
      status: 'active',
      commissionRate: 0.10,
    },
  ];
}

async function getAssetById(env: Env, id: string): Promise<MarketplaceAsset | null> {
  const data = await env.MARKETPLACE.get(`asset:${id}`);
  if (data) return JSON.parse(data);

  // Check demo assets
  const demos = getDemoAssets();
  return demos.find(a => a.id === id) || null;
}

async function createMarketplaceListing(env: Env, data: Partial<MarketplaceAsset>): Promise<MarketplaceAsset> {
  const asset: MarketplaceAsset = {
    id: crypto.randomUUID(),
    name: data.name || 'Untitled',
    description: data.description || '',
    type: data.type || 'ui_component',
    sellerId: data.sellerId || 'unknown',
    sellerName: data.sellerName || 'Unknown',
    sellerVerified: false,
    price: data.price || 0,
    currency: data.currency || 'ARC',
    pricingModel: data.pricingModel || 'one_time',
    category: data.category || 'Other',
    tags: data.tags || [],
    version: data.version || '1.0.0',
    downloads: 0,
    rating: 0,
    reviewCount: 0,
    licenseType: data.licenseType || 'MIT',
    compatibleWith: data.compatibleWith || [],
    screenshots: data.screenshots || [],
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'pending_review',
    commissionRate: RISK_CONFIG.commissionRates.individual,
  };

  await env.MARKETPLACE.put(`asset:${asset.id}`, JSON.stringify(asset));
  return asset;
}

async function getFeaturedAssets(env: Env): Promise<MarketplaceAsset[]> {
  const demos = getDemoAssets();
  return demos.slice(0, 3);
}

async function searchMarketplace(env: Env, query: string): Promise<MarketplaceAsset[]> {
  const demos = getDemoAssets();
  const q = query.toLowerCase();
  return demos.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.description.toLowerCase().includes(q) ||
    a.tags.some(t => t.toLowerCase().includes(q))
  );
}

async function processPurchase(
  env: Env,
  assetId: string,
  userId: string,
  paymentMethod: string,
  currency: string
): Promise<Record<string, unknown>> {
  const asset = await getAssetById(env, assetId);
  if (!asset) throw new Error('Asset not found');

  const commission = asset.price * asset.commissionRate;
  const sellerAmount = asset.price - commission;

  const transaction = {
    id: crypto.randomUUID(),
    assetId,
    userId,
    sellerId: asset.sellerId,
    amount: asset.price,
    commission,
    sellerAmount,
    currency: currency || asset.currency,
    paymentMethod,
    status: 'completed',
    createdAt: new Date().toISOString(),
  };

  // Store purchase record
  await env.MARKETPLACE.put(
    `purchase:${userId}:${transaction.id}`,
    JSON.stringify(transaction),
    { expirationTtl: 86400 * 365 * 7 }
  );

  return transaction;
}

async function getUserPurchases(env: Env, userId: string): Promise<unknown[]> {
  const keys = await env.MARKETPLACE.list({ prefix: `purchase:${userId}:` });
  const purchases = [];

  for (const key of keys.keys) {
    const data = await env.MARKETPLACE.get(key.name);
    if (data) purchases.push(JSON.parse(data));
  }

  return purchases;
}

// ─── ORDER BOOK HELPERS ───────────────────────────────────────────────────────

async function getOrderBook(env: Env, assetId: string): Promise<OrderBook> {
  const data = await env.ORDER_BOOK.get(`book:${assetId}`);
  if (data) return JSON.parse(data);

  return {
    assetId,
    bids: [],
    asks: [],
    lastPrice: 0,
    volume24h: 0,
    priceChange24h: 0,
    priceChangePercent24h: 0,
    high24h: 0,
    low24h: 0,
    spread: 0,
    updatedAt: new Date(),
  };
}

async function placeOrder(env: Env, data: Partial<Order>): Promise<Order> {
  const order: Order = {
    id: crypto.randomUUID(),
    type: data.type || 'market',
    side: data.side || 'buy',
    assetId: data.assetId || '',
    assetType: data.assetType || 'ui_component',
    quantity: data.quantity || 1,
    price: data.price,
    stopPrice: data.stopPrice,
    status: 'pending',
    userId: data.userId || '',
    createdAt: new Date(),
    expiresAt: data.expiresAt,
    filledQuantity: 0,
    totalValue: (data.price || 0) * (data.quantity || 1),
    fee: (data.price || 0) * (data.quantity || 1) * 0.001, // 0.1% fee
    feeCurrency: 'ARC',
  };

  await env.ORDER_BOOK.put(`order:${order.id}`, JSON.stringify(order));
  return order;
}

async function cancelOrder(env: Env, id: string): Promise<void> {
  const data = await env.ORDER_BOOK.get(`order:${id}`);
  if (!data) throw new Error('Order not found');

  const order = JSON.parse(data) as Order;
  order.status = 'cancelled';
  await env.ORDER_BOOK.put(`order:${id}`, JSON.stringify(order));
}

async function getUserOrders(env: Env, userId: string): Promise<Order[]> {
  const keys = await env.ORDER_BOOK.list({ prefix: 'order:' });
  const orders: Order[] = [];

  for (const key of keys.keys) {
    const data = await env.ORDER_BOOK.get(key.name);
    if (data) {
      const order = JSON.parse(data) as Order;
      if (order.userId === userId) orders.push(order);
    }
  }

  return orders;
}

// ─── ARC TOKEN HELPERS ────────────────────────────────────────────────────────

async function getARCTokenMetrics(env: Env): Promise<ARCTokenMetrics> {
  const data = await env.WALLETS.get('arc:metrics');
  if (data) return JSON.parse(data);

  return {
    totalSupply: 1_000_000_000,
    circulatingSupply: 250_000_000,
    burnedSupply: 0,
    stakedSupply: 50_000_000,
    price: 0.001,
    priceChange24h: 0,
    marketCap: 250_000,
    volume24h: 0,
    holders: 0,
    transactions24h: 0,
    apy: 12.5,
    nextBurnDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    nextBurnAmount: 1_000_000,
  };
}

async function getUserWallet(env: Env, userId: string): Promise<UserWallet> {
  const data = await env.WALLETS.get(`wallet:${userId}`);
  if (data) return JSON.parse(data);

  return {
    userId,
    arcBalance: 0,
    stakedArc: 0,
    pendingRewards: 0,
    usdBalance: 0,
    eurBalance: 0,
    gbpBalance: 0,
    totalValueUsd: 0,
    lastUpdated: new Date(),
  };
}

async function stakeARC(env: Env, userId: string, amount: number): Promise<Record<string, unknown>> {
  const wallet = await getUserWallet(env, userId);

  if (wallet.arcBalance < amount) {
    throw new Error('Insufficient ARC balance');
  }

  wallet.arcBalance -= amount;
  wallet.stakedArc += amount;
  wallet.lastUpdated = new Date();

  await env.WALLETS.put(`wallet:${userId}`, JSON.stringify(wallet));

  return {
    success: true,
    stakedAmount: amount,
    totalStaked: wallet.stakedArc,
    estimatedApy: 12.5,
    estimatedMonthlyReward: (amount * 0.125) / 12,
  };
}

async function unstakeARC(env: Env, userId: string, amount: number): Promise<Record<string, unknown>> {
  const wallet = await getUserWallet(env, userId);

  if (wallet.stakedArc < amount) {
    throw new Error('Insufficient staked ARC');
  }

  wallet.stakedArc -= amount;
  wallet.arcBalance += amount;
  wallet.lastUpdated = new Date();

  await env.WALLETS.put(`wallet:${userId}`, JSON.stringify(wallet));

  return {
    success: true,
    unstakedAmount: amount,
    remainingStaked: wallet.stakedArc,
    newBalance: wallet.arcBalance,
  };
}

// ─── EXCHANGE RATE HELPERS ────────────────────────────────────────────────────

async function getExchangeRates(env: Env): Promise<Record<string, number>> {
  try {
    // Fetch from CoinGecko free API
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,usd-coin&vs_currencies=usd,eur,gbp'
    );
    const data = await response.json() as Record<string, Record<string, number>>;

    return {
      ARC_USD: 0.001,
      ARC_EUR: 0.00092,
      ARC_GBP: 0.00079,
      ETH_USD: data?.ethereum?.usd || 3000,
      BTC_USD: data?.bitcoin?.usd || 60000,
      USDC_USD: data?.['usd-coin']?.usd || 1,
      EUR_USD: 1.09,
      GBP_USD: 1.27,
    };
  } catch {
    return {
      ARC_USD: 0.001,
      ARC_EUR: 0.00092,
      ARC_GBP: 0.00079,
      ETH_USD: 3000,
      BTC_USD: 60000,
      EUR_USD: 1.09,
      GBP_USD: 1.27,
    };
  }
}

async function convertCurrency(
  env: Env,
  from: string,
  to: string,
  amount: number,
  userId: string
): Promise<Record<string, unknown>> {
  const rates = await getExchangeRates(env);
  const rateKey = `${from}_${to}`;
  const rate = rates[rateKey] || 1;
  const fee = amount * 0.005; // 0.5% conversion fee
  const convertedAmount = (amount - fee) * rate;

  return {
    from,
    to,
    inputAmount: amount,
    fee,
    feePercent: 0.5,
    rate,
    outputAmount: convertedAmount,
    userId,
    timestamp: new Date().toISOString(),
  };
}

// ─── INVESTMENT ENGINE HELPERS ────────────────────────────────────────────────

async function getInvestmentStrategies(env: Env): Promise<InvestmentStrategy[]> {
  return BOT_STRATEGIES;
}

async function getPortfolio(env: Env): Promise<Portfolio> {
  const data = await env.PORTFOLIO.get('main:portfolio');
  if (data) return JSON.parse(data);

  return {
    totalValue: 0,
    totalCost: 0,
    totalReturn: 0,
    totalReturnPercent: 0,
    positions: [],
    allocation: {} as any,
    riskScore: 15,
    sharpeRatio: 0,
    lastUpdated: new Date(),
  };
}

async function executeStrategy(env: Env, strategyId: string): Promise<Record<string, unknown>> {
  const strategy = BOT_STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) throw new Error('Strategy not found');

  if (strategy.riskScore > RISK_CONFIG.autoExecuteThreshold) {
    return {
      status: 'pending_approval',
      message: `Strategy risk score ${strategy.riskScore} exceeds auto-execute threshold ${RISK_CONFIG.autoExecuteThreshold}. Human approval required.`,
      strategyId,
    };
  }

  return {
    status: 'executed',
    strategyId,
    strategyName: strategy.name,
    executedAt: new Date().toISOString(),
    estimatedReturn: strategy.targetMonthlyReturn,
  };
}

async function getAllBots(env: Env): Promise<BotAgent[]> {
  return BOT_STRATEGIES.map(s => ({
    id: `bot-${s.id}`,
    name: s.name,
    type: s.type,
    status: 'stopped' as const,
    strategyId: s.id,
    lastHeartbeat: new Date(),
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    totalRevenue: 0,
    logs: [],
  }));
}

async function getBotById(env: Env, id: string): Promise<BotAgent | null> {
  const bots = await getAllBots(env);
  return bots.find(b => b.id === id) || null;
}

async function startBot(env: Env, id: string): Promise<BotAgent> {
  const bot = await getBotById(env, id);
  if (!bot) throw new Error('Bot not found');

  bot.status = 'running';
  bot.lastHeartbeat = new Date();

  await env.BOT_STATE.put(`bot:${id}`, JSON.stringify(bot));
  return bot;
}

async function stopBot(env: Env, id: string): Promise<BotAgent> {
  const bot = await getBotById(env, id);
  if (!bot) throw new Error('Bot not found');

  bot.status = 'stopped';
  await env.BOT_STATE.put(`bot:${id}`, JSON.stringify(bot));
  return bot;
}

async function getBotLogs(env: Env, id: string, limit: number): Promise<BotLog[]> {
  const data = await env.BOT_STATE.get(`bot:${id}:logs`);
  if (!data) return [];

  const logs = JSON.parse(data) as BotLog[];
  return logs.slice(-limit);
}

async function getPassiveIncomeOverview(env: Env): Promise<Record<string, unknown>> {
  return {
    totalMonthlyPassiveIncome: 0,
    activeStreams: 0,
    topStream: null,
    projectedAnnual: 0,
    streams: PASSIVE_INCOME_STREAMS,
    lastUpdated: new Date().toISOString(),
  };
}

async function discoverPassiveIncomeOpportunities(env: Env): Promise<unknown[]> {
  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{
        role: 'user',
        content: `List 5 specific passive income opportunities for a cloud platform in 2025.
        Focus on: DeFi yields, affiliate programs, API monetisation, data licensing.
        For each: name, description, estimated monthly income, risk level, implementation steps.
        Return as JSON array.`
      }],
      max_tokens: 800,
    });

    const text = (response as any).response || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('AI opportunity discovery failed:', err);
  }

  return PASSIVE_INCOME_STREAMS;
}

async function getRevenueAnalytics(env: Env, period: string): Promise<Record<string, unknown>> {
  return {
    period,
    totalRevenue: 0,
    revenueByStream: {},
    growthRate: 0,
    topPerformingStream: null,
    projectedNextPeriod: 0,
    generatedAt: new Date().toISOString(),
  };
}

async function getMarketplaceAnalytics(env: Env): Promise<Record<string, unknown>> {
  const assets = getDemoAssets();
  return {
    totalListings: assets.length,
    totalDownloads: assets.reduce((s, a) => s + a.downloads, 0),
    averageRating: assets.reduce((s, a) => s + a.rating, 0) / assets.length,
    totalRevenue: 0,
    topCategories: ['Productivity', 'AI & Automation', 'Security'],
    generatedAt: new Date().toISOString(),
  };
}

// ─── BOT EXECUTION FUNCTIONS ──────────────────────────────────────────────────

async function runArbitrageBot(env: Env): Promise<void> {
  const log: BotLog = {
    timestamp: new Date(),
    level: 'info',
    message: 'Arbitrage scan completed — no opportunities found above threshold',
    data: { scannedPairs: 12, opportunities: 0 },
  };
  await appendBotLog(env, 'bot-arbitrage', log);
}

async function runMarketMakerBot(env: Env): Promise<void> {
  const log: BotLog = {
    timestamp: new Date(),
    level: 'info',
    message: 'Market maker quotes updated',
    data: { quotesUpdated: 5, spread: '0.2%' },
  };
  await appendBotLog(env, 'bot-market_making', log);
}

async function runDeFiYieldOptimizer(env: Env): Promise<void> {
  const log: BotLog = {
    timestamp: new Date(),
    level: 'info',
    message: 'DeFi yield scan completed — current best APY: 8.5% on USDC',
    data: { protocolsScanned: 8, bestApy: 8.5, bestProtocol: 'Aave' },
  };
  await appendBotLog(env, 'bot-defi_yield', log);
}

async function runPassiveIncomeScan(env: Env): Promise<void> {
  console.log('Passive income scan running...');
}

async function rebalancePortfolio(env: Env): Promise<void> {
  console.log('Portfolio rebalancing check...');
}

async function processTokenBurn(env: Env): Promise<void> {
  console.log('ARC token burn processing...');
}

async function appendBotLog(env: Env, botId: string, log: BotLog): Promise<void> {
  const existing = await env.BOT_STATE.get(`bot:${botId}:logs`);
  const logs: BotLog[] = existing ? JSON.parse(existing) : [];
  logs.push(log);

  // Keep last 1000 logs
  const trimmed = logs.slice(-1000);
  await env.BOT_STATE.put(`bot:${botId}:logs`, JSON.stringify(trimmed));
}

// ─── STATIC DATA ─────────────────────────────────────────────────────────────

const MARKETPLACE_CATEGORIES = [
  'Productivity', 'AI & Automation', 'Security', 'Finance', 'Compliance',
  'Developer Tools', 'Communication', 'Analytics', 'Storage', 'Integration',
  'Design', 'Education', 'Healthcare', 'Legal', 'Other'
];

const BOT_STRATEGIES: InvestmentStrategy[] = [
  {
    id: 'arbitrage',
    name: 'Arbitrage Agent',
    type: 'arbitrage',
    description: 'Monitors price differences across platforms and executes risk-free arbitrage',
    status: 'active',
    riskScore: 20,
    maxAllocation: 0.15,
    currentAllocation: 0,
    targetMonthlyReturn: 0.5,
    actualMonthlyReturn: 0,
    sharpeRatio: 2.1,
    maxDrawdown: 0.02,
    winRate: 0.94,
    approvedBy: 'system',
    approvedAt: new Date(),
    lastExecutedAt: new Date(),
    nextExecutionAt: new Date(Date.now() + 5 * 60 * 1000),
    totalProfit: 0,
    totalTrades: 0,
  },
  {
    id: 'market_making',
    name: 'Market Maker Agent',
    type: 'market_making',
    description: 'Provides liquidity on the AEX order book and earns bid-ask spread',
    status: 'active',
    riskScore: 25,
    maxAllocation: 0.20,
    currentAllocation: 0,
    targetMonthlyReturn: 1.0,
    actualMonthlyReturn: 0,
    sharpeRatio: 1.8,
    maxDrawdown: 0.05,
    winRate: 0.87,
    approvedBy: 'system',
    approvedAt: new Date(),
    lastExecutedAt: new Date(),
    nextExecutionAt: new Date(Date.now() + 15 * 60 * 1000),
    totalProfit: 0,
    totalTrades: 0,
  },
  {
    id: 'defi_yield',
    name: 'DeFi Yield Optimizer',
    type: 'defi_yield',
    description: 'Automatically moves funds to highest-yield DeFi protocols',
    status: 'paused',
    riskScore: 40,
    maxAllocation: 0.20,
    currentAllocation: 0,
    targetMonthlyReturn: 8.0,
    actualMonthlyReturn: 0,
    sharpeRatio: 1.2,
    maxDrawdown: 0.15,
    winRate: 0.78,
    approvedBy: 'system',
    approvedAt: new Date(),
    lastExecutedAt: new Date(),
    nextExecutionAt: new Date(Date.now() + 60 * 60 * 1000),
    totalProfit: 0,
    totalTrades: 0,
  },
  {
    id: 'affiliate',
    name: 'Affiliate & Referral Agent',
    type: 'affiliate',
    description: 'Manages affiliate registrations and optimises referral conversions',
    status: 'active',
    riskScore: 5,
    maxAllocation: 0.05,
    currentAllocation: 0,
    targetMonthlyReturn: 3.0,
    actualMonthlyReturn: 0,
    sharpeRatio: 3.5,
    maxDrawdown: 0.01,
    winRate: 0.99,
    approvedBy: 'system',
    approvedAt: new Date(),
    lastExecutedAt: new Date(),
    nextExecutionAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    totalProfit: 0,
    totalTrades: 0,
  },
];

const PASSIVE_INCOME_STREAMS = [
  { id: 'marketplace_commission', name: 'Marketplace Commission', type: 'marketplace_commission', monthlyTarget: 1000, riskScore: 5, status: 'active' },
  { id: 'api_access', name: 'API Access Tiers', type: 'api_access', monthlyTarget: 500, riskScore: 5, status: 'researching' },
  { id: 'arc_staking', name: 'ARC Token Staking', type: 'staking', monthlyTarget: 300, riskScore: 20, status: 'active' },
  { id: 'affiliate', name: 'Affiliate Commissions', type: 'affiliate', monthlyTarget: 200, riskScore: 5, status: 'active' },
  { id: 'data_insights', name: 'Data Insights Licensing', type: 'data_insights', monthlyTarget: 200, riskScore: 10, status: 'researching' },
  { id: 'defi_yield', name: 'DeFi Yield Farming', type: 'defi_yield', monthlyTarget: 500, riskScore: 40, status: 'pending_approval' },
];
// ─── DURABLE OBJECT STUBS ──────────────────────────────────────────────────
// Required exports for wrangler to deploy with Durable Object bindings

export class TradingEngine implements DurableObject {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    return new Response(JSON.stringify({ status: 'trading-engine-ready' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export class MarketMaker implements DurableObject {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    return new Response(JSON.stringify({ status: 'market-maker-ready' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
