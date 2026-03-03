/**
 * Arcadia Financial Types
 * Shared TypeScript types for Royal Bank of Arcadia & Arcadian Exchange
 */

// ─── COST MANAGEMENT ────────────────────────────────────────────────────────

export type CostDimension =
  | 'development'
  | 'delivery'
  | 'discovery'
  | 'design'
  | 'maintenance'
  | 'strategy'
  | 'functions'
  | 'hosting'
  | 'provisioning'
  | 'upkeep'
  | 'licensing'
  | 'compliance';

export interface CostEntry {
  amount: number;
  currency: 'USD' | 'EUR' | 'GBP';
  justification: string;
  alternativeFound: boolean;
  alternativeDescription?: string;
  approvedBy?: string;
  approvedAt?: Date;
  flaggedAt: Date;
  serviceId: string;
}

export interface CostProfile {
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  dimensions: Record<CostDimension, CostEntry>;
  totalMonthlyCost: number;
  approvalStatus: 'approved' | 'pending' | 'rejected' | 'zero_cost';
  lastAuditDate: Date;
  nextAuditDate: Date;
  zeroAlternativeUrl?: string;
}

export interface CostAlert {
  id: string;
  serviceId: string;
  serviceName: string;
  dimension: CostDimension;
  amount: number;
  currency: string;
  detectedAt: Date;
  status: 'open' | 'under_review' | 'approved' | 'rejected' | 'resolved';
  assignedTo?: string;
  resolutionNotes?: string;
  resolvedAt?: Date;
  alternativesResearched: ZeroCostAlternative[];
}

export interface ZeroCostAlternative {
  name: string;
  description: string;
  url: string;
  estimatedSavings: number;
  implementationEffort: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  recommended: boolean;
}

export interface FreeTierUsage {
  serviceId: string;
  serviceName: string;
  provider: string;
  metric: string;
  limit: number;
  current: number;
  unit: string;
  percentUsed: number;
  alertThreshold: number;
  resetDate?: Date;
  projectedExceedDate?: Date;
}

// ─── REVENUE MANAGEMENT ─────────────────────────────────────────────────────

export type RevenueStreamType =
  | 'marketplace_commission'
  | 'api_access'
  | 'white_label'
  | 'saas_subscription'
  | 'enterprise_contract'
  | 'data_insights'
  | 'defi_yield'
  | 'staking'
  | 'affiliate'
  | 'advertising'
  | 'donation'
  | 'trading_fees'
  | 'listing_fees'
  | 'token_economics'
  | 'arbitrage'
  | 'market_making';

export interface RevenueStream {
  id: string;
  name: string;
  type: RevenueStreamType;
  status: 'active' | 'paused' | 'researching' | 'pending_approval' | 'deprecated';
  monthlyRevenue: number;
  monthlyTarget: number;
  monthlyGrowthRate: number;
  riskScore: number;
  automationLevel: 'full' | 'semi' | 'manual';
  currency: string;
  lastReviewDate: Date;
  nextOptimisationDate: Date;
  approvedBy: string;
  approvedAt: Date;
  notes: string;
  metrics: RevenueMetrics;
}

export interface RevenueMetrics {
  totalRevenue: number;
  totalTransactions: number;
  averageTransactionValue: number;
  conversionRate: number;
  churnRate: number;
  ltv: number;
  cac: number;
  paybackPeriod: number;
  mrr: number;
  arr: number;
  growthRate: number;
}

export interface ProfitMargin {
  serviceId: string;
  period: 'monthly' | 'quarterly' | 'annual';
  grossRevenue: number;
  transactionCosts: number;
  infrastructureCosts: number;
  supportCosts: number;
  complianceCosts: number;
  marketingCosts: number;
  developmentCosts: number;
  legalCosts: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPercent: number;
  netMarginPercent: number;
  industryBenchmarkGross: number;
  industryBenchmarkNet: number;
  performanceVsBenchmark: 'above' | 'at' | 'below';
}

// ─── TAX ENGINE ─────────────────────────────────────────────────────────────

export type TaxType = 'VAT' | 'GST' | 'Sales' | 'DigitalServices' | 'Corporate' | 'CapitalGains';

export interface TaxJurisdiction {
  code: string;
  name: string;
  country: string;
  taxType: TaxType;
  rate: number;
  reducedRate?: number;
  threshold: number;
  registrationRequired: boolean;
  registrationStatus: 'not_required' | 'pending' | 'registered' | 'exempt';
  filingFrequency: 'monthly' | 'quarterly' | 'annual';
  nextFilingDate: Date;
  estimatedLiability: number;
  currency: string;
}

export interface TaxCalculation {
  transactionId: string;
  userId: string;
  userJurisdiction: string;
  platformJurisdiction: string;
  grossAmount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  netAmount: number;
  taxType: TaxType;
  currency: string;
  calculatedAt: Date;
  filingPeriod: string;
}

// ─── APPROVAL WORKFLOW ───────────────────────────────────────────────────────

export type ApprovalTier = 'platform_admin' | 'org_admin' | 'super_admin' | 'board';

export interface ApprovalRequest {
  id: string;
  type: 'cost_approval' | 'investment_approval' | 'strategy_approval' | 'risk_approval';
  title: string;
  description: string;
  requestedBy: string;
  requestedAt: Date;
  tier: ApprovalTier;
  slaHours: number;
  dueBy: Date;
  status: 'pending' | 'approved' | 'rejected' | 'deferred' | 'expired';
  amount?: number;
  currency?: string;
  riskScore?: number;
  reviewedBy?: string;
  reviewedAt?: Date;
  decision?: string;
  conditions?: string[];
  attachments?: string[];
  relatedServiceId?: string;
  relatedStreamId?: string;
}

// ─── EXCHANGE TYPES ──────────────────────────────────────────────────────────

export type AssetType =
  | 'ui_component'
  | 'kernel_module'
  | 'ai_agent'
  | 'workflow_template'
  | 'data_connector'
  | 'security_plugin'
  | 'compliance_pack'
  | 'full_application'
  | 'dataset'
  | 'api_access'
  | 'arc_token'
  | 'nft_certificate';

export interface MarketplaceAsset {
  id: string;
  name: string;
  description: string;
  type: AssetType;
  sellerId: string;
  sellerName: string;
  sellerVerified: boolean;
  price: number;
  currency: 'ARC' | 'USD' | 'EUR' | 'GBP';
  pricingModel: 'one_time' | 'monthly' | 'annual' | 'per_seat' | 'usage_based' | 'freemium' | 'revenue_share';
  category: string;
  tags: string[];
  version: string;
  downloads: number;
  rating: number;
  reviewCount: number;
  licenseType: 'MIT' | 'Apache-2.0' | 'GPL-3.0' | 'Commercial' | 'Custom';
  compatibleWith: string[];
  screenshots: string[];
  demoUrl?: string;
  documentationUrl?: string;
  sourceUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'pending_review' | 'active' | 'suspended' | 'deprecated';
  commissionRate: number;
}

export type OrderType = 'market' | 'limit' | 'stop' | 'auction';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled' | 'expired';

export interface Order {
  id: string;
  type: OrderType;
  side: OrderSide;
  assetId: string;
  assetType: AssetType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  status: OrderStatus;
  userId: string;
  createdAt: Date;
  expiresAt?: Date;
  filledAt?: Date;
  filledQuantity: number;
  totalValue: number;
  fee: number;
  feeCurrency: string;
}

export interface OrderBook {
  assetId: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  lastPrice: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  spread: number;
  updatedAt: Date;
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
  orderCount: number;
}

// ─── ARC TOKEN ───────────────────────────────────────────────────────────────

export interface ARCTokenMetrics {
  totalSupply: number;
  circulatingSupply: number;
  burnedSupply: number;
  stakedSupply: number;
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  holders: number;
  transactions24h: number;
  apy: number;
  nextBurnDate: Date;
  nextBurnAmount: number;
}

export interface UserWallet {
  userId: string;
  arcBalance: number;
  stakedArc: number;
  pendingRewards: number;
  usdBalance: number;
  eurBalance: number;
  gbpBalance: number;
  totalValueUsd: number;
  lastUpdated: Date;
}

// ─── INVESTMENT ENGINE ───────────────────────────────────────────────────────

export type InvestmentStrategyType =
  | 'arbitrage'
  | 'market_making'
  | 'defi_yield'
  | 'staking'
  | 'sentiment_trading'
  | 'affiliate'
  | 'advertising'
  | 'content_monetisation';

export interface InvestmentStrategy {
  id: string;
  name: string;
  type: InvestmentStrategyType;
  description: string;
  status: 'active' | 'paused' | 'backtesting' | 'pending_approval' | 'deprecated';
  riskScore: number;
  maxAllocation: number;
  currentAllocation: number;
  targetMonthlyReturn: number;
  actualMonthlyReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  approvedBy: string;
  approvedAt: Date;
  lastExecutedAt: Date;
  nextExecutionAt: Date;
  totalProfit: number;
  totalTrades: number;
}

export interface BotAgent {
  id: string;
  name: string;
  type: InvestmentStrategyType;
  status: 'running' | 'stopped' | 'error' | 'paused';
  strategyId: string;
  lastHeartbeat: Date;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalRevenue: number;
  currentPosition?: number;
  logs: BotLog[];
}

export interface BotLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'trade';
  message: string;
  data?: Record<string, unknown>;
  revenue?: number;
}

export interface Portfolio {
  totalValue: number;
  totalCost: number;
  totalReturn: number;
  totalReturnPercent: number;
  positions: PortfolioPosition[];
  allocation: Record<InvestmentStrategyType, number>;
  riskScore: number;
  sharpeRatio: number;
  lastUpdated: Date;
}

export interface PortfolioPosition {
  strategyId: string;
  strategyName: string;
  type: InvestmentStrategyType;
  value: number;
  cost: number;
  return: number;
  returnPercent: number;
  allocationPercent: number;
  riskScore: number;
}

// ─── FINANCIAL RESEARCH ──────────────────────────────────────────────────────

export interface ResearchReport {
  id: string;
  title: string;
  category: 'cost_reduction' | 'revenue_opportunity' | 'market_intelligence' | 'risk_assessment' | 'compliance';
  summary: string;
  findings: ResearchFinding[];
  recommendations: ResearchRecommendation[];
  opportunityScore: number;
  riskScore: number;
  estimatedImpact: number;
  generatedAt: Date;
  generatedBy: 'ai_engine' | 'human_analyst';
  status: 'draft' | 'published' | 'actioned' | 'archived';
  sources: string[];
}

export interface ResearchFinding {
  title: string;
  description: string;
  evidence: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
}

export interface ResearchRecommendation {
  title: string;
  description: string;
  action: string;
  estimatedBenefit: number;
  implementationEffort: 'low' | 'medium' | 'high';
  priority: 'critical' | 'high' | 'medium' | 'low';
  requiresApproval: boolean;
  approvalTier?: ApprovalTier;
}

// ─── AUDIT & COMPLIANCE ──────────────────────────────────────────────────────

export interface FinancialAuditEntry {
  id: string;
  timestamp: Date;
  eventType: string;
  userId?: string;
  serviceId?: string;
  amount?: number;
  currency?: string;
  description: string;
  metadata: Record<string, unknown>;
  hash: string;
  previousHash: string;
  signature: string;
}

export interface ComplianceCheck {
  id: string;
  regulation: string;
  jurisdiction: string;
  checkType: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  details: string;
  checkedAt: Date;
  nextCheckDate: Date;
  remediation?: string;
}