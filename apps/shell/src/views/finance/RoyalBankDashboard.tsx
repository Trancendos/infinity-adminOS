/**
 * Royal Bank of Arcadia — Dashboard UI
 * Financial intelligence, cost monitoring & revenue management
 */

import React, { useState, useEffect, useCallback } from 'react';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface CostAlert {
  id: string;
  serviceName: string;
  dimension: string;
  amount: number;
  currency: string;
  detectedAt: string;
  status: string;
  alternativesResearched: Array<{ name: string; description: string; recommended: boolean }>;
}

interface RevenueStream {
  id: string;
  name: string;
  type: string;
  status: string;
  monthlyRevenue: number;
  monthlyTarget: number;
  riskScore: number;
  automationLevel: string;
}

interface FreeTierUsage {
  serviceId: string;
  serviceName: string;
  percentUsed: number;
  alertThreshold: number;
  current: number;
  limit: number;
  unit: string;
}

interface FinancialOverview {
  totalMonthlyCost: number;
  mandateStatus: string;
  violations: number;
  totalMonthlyRevenue: number;
  totalMonthlyTarget: number;
  achievementRate: number;
  activeStreams: number;
  openAlerts: number;
  pendingApprovals: number;
}

// ─── MOCK DATA (replace with API calls in production) ────────────────────────

const MOCK_OVERVIEW: FinancialOverview = {
  totalMonthlyCost: 0.00,
  mandateStatus: 'COMPLIANT',
  violations: 0,
  totalMonthlyRevenue: 0,
  totalMonthlyTarget: 4900,
  achievementRate: 0,
  activeStreams: 4,
  openAlerts: 0,
  pendingApprovals: 1,
};

const MOCK_STREAMS: RevenueStream[] = [
  { id: '1', name: 'Marketplace Commission', type: 'marketplace_commission', status: 'active', monthlyRevenue: 0, monthlyTarget: 1000, riskScore: 5, automationLevel: 'full' },
  { id: '2', name: 'ARC Token Staking', type: 'staking', status: 'active', monthlyRevenue: 0, monthlyTarget: 300, riskScore: 20, automationLevel: 'full' },
  { id: '3', name: 'Affiliate Program', type: 'affiliate', status: 'active', monthlyRevenue: 0, monthlyTarget: 200, riskScore: 5, automationLevel: 'full' },
  { id: '4', name: 'Exchange Trading Fees', type: 'trading_fees', status: 'active', monthlyRevenue: 0, monthlyTarget: 500, riskScore: 5, automationLevel: 'full' },
  { id: '5', name: 'DeFi Yield Farming', type: 'defi_yield', status: 'pending_approval', monthlyRevenue: 0, monthlyTarget: 500, riskScore: 40, automationLevel: 'semi' },
  { id: '6', name: 'White-Label Licensing', type: 'white_label', status: 'researching', monthlyRevenue: 0, monthlyTarget: 2000, riskScore: 5, automationLevel: 'semi' },
  { id: '7', name: 'API Access Tiers', type: 'api_access', status: 'researching', monthlyRevenue: 0, monthlyTarget: 500, riskScore: 5, automationLevel: 'full' },
  { id: '8', name: 'Data Insights Licensing', type: 'data_insights', status: 'researching', monthlyRevenue: 0, monthlyTarget: 200, riskScore: 10, automationLevel: 'full' },
];

const MOCK_FREE_TIER: FreeTierUsage[] = [
  { serviceId: 'cloudflare_workers', serviceName: 'Cloudflare Workers', percentUsed: 12, alertThreshold: 80, current: 12000, limit: 100000, unit: 'req/day' },
  { serviceId: 'cloudflare_kv', serviceName: 'Cloudflare KV', percentUsed: 8, alertThreshold: 80, current: 8000, limit: 100000, unit: 'reads/day' },
  { serviceId: 'cloudflare_r2', serviceName: 'Cloudflare R2', percentUsed: 3, alertThreshold: 80, current: 322122547, limit: 10737418240, unit: 'bytes' },
  { serviceId: 'supabase_db', serviceName: 'Supabase DB', percentUsed: 5, alertThreshold: 80, current: 26214400, limit: 524288000, unit: 'bytes' },
  { serviceId: 'supabase_auth', serviceName: 'Supabase Auth', percentUsed: 2, alertThreshold: 80, current: 1000, limit: 50000, unit: 'MAU' },
  { serviceId: 'github_actions', serviceName: 'GitHub Actions', percentUsed: 15, alertThreshold: 80, current: 300, limit: 2000, unit: 'min/month' },
];

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    researching: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    pending_approval: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    paused: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
    deprecated: 'bg-red-500/20 text-red-400 border border-red-500/30',
    COMPLIANT: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    VIOLATION: 'bg-red-500/20 text-red-400 border border-red-500/30',
    open: 'bg-red-500/20 text-red-400 border border-red-500/30',
    resolved: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-slate-500/20 text-slate-400'}`}>
      {status.replace(/_/g, ' ').toUpperCase()}
    </span>
  );
};

const RiskBadge: React.FC<{ score: number }> = ({ score }) => {
  const color = score <= 20 ? 'text-emerald-400' : score <= 40 ? 'text-amber-400' : score <= 70 ? 'text-orange-400' : 'text-red-400';
  const label = score <= 20 ? 'LOW' : score <= 40 ? 'MEDIUM' : score <= 70 ? 'HIGH' : 'CRITICAL';
  return <span className={`text-xs font-bold ${color}`}>{label} ({score})</span>;
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color: string;
  trend?: string;
}> = ({ title, value, subtitle, icon, color, trend }) => (
  <div className={`bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm`}>
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-xl`}>
        {icon}
      </div>
      {trend && (
        <span className={`text-xs font-medium ${trend.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend}
        </span>
      )}
    </div>
    <div className="text-2xl font-bold text-white mb-1">{value}</div>
    <div className="text-sm text-slate-400">{title}</div>
    {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
  </div>
);

const FreeTierBar: React.FC<{ usage: FreeTierUsage }> = ({ usage }) => {
  const isWarning = usage.percentUsed >= usage.alertThreshold;
  const barColor = isWarning ? 'bg-amber-500' : usage.percentUsed > 60 ? 'bg-blue-500' : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-36 text-sm text-slate-300 truncate">{usage.serviceName}</div>
      <div className="flex-1 bg-slate-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
        />
      </div>
      <div className={`w-12 text-right text-xs font-medium ${isWarning ? 'text-amber-400' : 'text-slate-400'}`}>
        {usage.percentUsed.toFixed(1)}%
      </div>
      {isWarning && <span className="text-amber-400 text-xs">⚠️</span>}
    </div>
  );
};

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────

const RoyalBankDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'costs' | 'revenue' | 'tax' | 'research' | 'approvals'>('overview');
  const [overview] = useState<FinancialOverview>(MOCK_OVERVIEW);
  const [streams] = useState<RevenueStream[]>(MOCK_STREAMS);
  const [freeTier] = useState<FreeTierUsage[]>(MOCK_FREE_TIER);
  const [alerts] = useState<CostAlert[]>([]);
  const [isResearching, setIsResearching] = useState(false);

  const totalTarget = streams.reduce((s, r) => s + r.monthlyTarget, 0);
  const activeStreams = streams.filter(s => s.status === 'active');

  const handleRunResearch = useCallback(async () => {
    setIsResearching(true);
    await new Promise(r => setTimeout(r, 2000));
    setIsResearching(false);
  }, []);

  const tabs = [
    { id: 'overview', label: '📊 Overview', icon: '📊' },
    { id: 'costs', label: '💰 Zero-Cost Monitor', icon: '💰' },
    { id: 'revenue', label: '📈 Revenue Engine', icon: '📈' },
    { id: 'tax', label: '🧾 Tax Engine', icon: '🧾' },
    { id: 'research', label: '🔬 Research', icon: '🔬' },
    { id: 'approvals', label: '✅ Approvals', icon: '✅' },
  ];

  return (
    <div className="h-full bg-slate-900 text-white overflow-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-900/40 via-yellow-900/30 to-amber-900/40 border-b border-amber-700/30 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-xl flex items-center justify-center text-xl shadow-lg">
              🏦
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Royal Bank of Arcadia</h1>
              <p className="text-xs text-amber-300/70">Financial Intelligence & Zero-Cost Mandate Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
              overview.mandateStatus === 'COMPLIANT'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {overview.mandateStatus === 'COMPLIANT' ? '✅' : '🚨'}
              Zero-Cost Mandate: {overview.mandateStatus}
            </div>
            <button
              onClick={handleRunResearch}
              disabled={isResearching}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {isResearching ? '🔄 Researching...' : '🔬 Run Research'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                title="Monthly Infrastructure Cost"
                value={`$${overview.totalMonthlyCost.toFixed(2)}`}
                subtitle="Zero-Cost Mandate Target: $0.00"
                icon="💸"
                color="bg-emerald-500/20"
                trend={overview.totalMonthlyCost === 0 ? '✅ ZERO' : '🚨 VIOLATION'}
              />
              <MetricCard
                title="Monthly Revenue"
                value={`$${overview.totalMonthlyRevenue.toFixed(2)}`}
                subtitle={`Target: $${totalTarget.toLocaleString()}/mo`}
                icon="💰"
                color="bg-blue-500/20"
              />
              <MetricCard
                title="Active Revenue Streams"
                value={activeStreams.length}
                subtitle={`${streams.length} total streams`}
                icon="📈"
                color="bg-purple-500/20"
              />
              <MetricCard
                title="Pending Approvals"
                value={overview.pendingApprovals}
                subtitle="Requires human review"
                icon="⏳"
                color="bg-amber-500/20"
              />
            </div>

            {/* Revenue Pipeline */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">💰 Revenue Pipeline</h3>
              <div className="space-y-3">
                {streams.map(stream => (
                  <div key={stream.id} className="flex items-center gap-4">
                    <div className="w-48 text-sm text-slate-300 truncate">{stream.name}</div>
                    <div className="flex-1 bg-slate-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all"
                        style={{ width: `${stream.monthlyTarget > 0 ? (stream.monthlyRevenue / stream.monthlyTarget) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="w-20 text-right text-xs text-slate-400">
                      ${stream.monthlyRevenue} / ${stream.monthlyTarget}
                    </div>
                    <div className="w-28">
                      <StatusBadge status={stream.status} />
                    </div>
                    <div className="w-24">
                      <RiskBadge score={stream.riskScore} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
                <span className="text-sm text-slate-400">Total Monthly Target</span>
                <span className="text-lg font-bold text-amber-400">${totalTarget.toLocaleString()}/month</span>
              </div>
            </div>

            {/* Free Tier Monitor */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">🆓 Free Tier Usage Monitor</h3>
              <div className="space-y-1">
                {freeTier.map(usage => (
                  <FreeTierBar key={usage.serviceId} usage={usage} />
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">
                ✅ All services within free tier limits. Zero infrastructure cost maintained.
              </p>
            </div>
          </div>
        )}

        {/* COSTS TAB */}
        {activeTab === 'costs' && (
          <div className="space-y-6">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">✅</span>
                <div>
                  <h3 className="text-lg font-bold text-emerald-400">Zero-Cost Mandate: COMPLIANT</h3>
                  <p className="text-sm text-slate-400">All 12 cost dimensions are at $0.00. No violations detected.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                'Development', 'Delivery', 'Discovery', 'Design', 'Maintenance',
                'Strategy', 'Functions', 'Hosting', 'Provisioning', 'Upkeep',
                'Licensing', 'Compliance'
              ].map(dim => (
                <div key={dim} className="bg-slate-800/60 border border-emerald-700/30 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm text-slate-300">{dim}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold text-sm">$0.00</span>
                    <span className="text-emerald-400">✅</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">🔍 Zero-Cost Stack</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {[
                  { service: 'Cloudflare Pages', replaces: 'Vercel/Netlify Pro', saving: '$20/mo' },
                  { service: 'Cloudflare Workers', replaces: 'AWS Lambda', saving: '$50/mo' },
                  { service: 'Cloudflare KV', replaces: 'Redis Cloud', saving: '$30/mo' },
                  { service: 'Supabase Free', replaces: 'AWS RDS', saving: '$100/mo' },
                  { service: 'K3s on Oracle Free', replaces: 'EKS/GKE', saving: '$200/mo' },
                  { service: 'HashiCorp Vault OSS', replaces: 'AWS Secrets Manager', saving: '$50/mo' },
                  { service: 'Prometheus/Grafana OSS', replaces: 'Datadog', saving: '$300/mo' },
                  { service: 'GitHub Actions Free', replaces: 'CircleCI Pro', saving: '$30/mo' },
                ].map(item => (
                  <div key={item.service} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-3">
                    <div>
                      <div className="text-white font-medium">{item.service}</div>
                      <div className="text-slate-500 text-xs">Replaces: {item.replaces}</div>
                    </div>
                    <div className="text-emerald-400 font-bold">{item.saving}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
                <span className="text-slate-400">Total Monthly Savings vs Paid Alternatives</span>
                <span className="text-2xl font-bold text-emerald-400">$780+/month</span>
              </div>
            </div>
          </div>
        )}

        {/* REVENUE TAB */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard title="Total Monthly Target" value={`$${totalTarget.toLocaleString()}`} icon="🎯" color="bg-amber-500/20" />
              <MetricCard title="Projected Annual Revenue" value={`$${(totalTarget * 12).toLocaleString()}`} icon="📅" color="bg-blue-500/20" />
              <MetricCard title="Revenue Streams" value={streams.length} subtitle={`${activeStreams.length} active`} icon="🌊" color="bg-purple-500/20" />
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">Revenue Streams</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="text-left p-3">Stream</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-right p-3">Current</th>
                      <th className="text-right p-3">Target</th>
                      <th className="text-left p-3">Risk</th>
                      <th className="text-left p-3">Automation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streams.map(stream => (
                      <tr key={stream.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                        <td className="p-3 text-white font-medium">{stream.name}</td>
                        <td className="p-3"><StatusBadge status={stream.status} /></td>
                        <td className="p-3 text-right text-slate-300">${stream.monthlyRevenue}</td>
                        <td className="p-3 text-right text-amber-400 font-medium">${stream.monthlyTarget}</td>
                        <td className="p-3"><RiskBadge score={stream.riskScore} /></td>
                        <td className="p-3">
                          <span className={`text-xs ${stream.automationLevel === 'full' ? 'text-emerald-400' : stream.automationLevel === 'semi' ? 'text-amber-400' : 'text-slate-400'}`}>
                            {stream.automationLevel.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Monetisation Framework */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">💡 Monetisation Framework</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { tier: 'Tier 1 — Immediate (Month 1-3)', items: ['Component Marketplace (5-15% commission)', 'API Access Tiers (freemium)', 'Premium Support subscriptions'], color: 'border-emerald-500/30 bg-emerald-500/5' },
                  { tier: 'Tier 2 — Growth (Month 3-12)', items: ['SaaS Subscriptions (per-seat)', 'Enterprise Contracts (annual)', 'Data Insights API (usage-based)'], color: 'border-blue-500/30 bg-blue-500/5' },
                  { tier: 'Tier 3 — Passive (Ongoing)', items: ['DeFi Yield (approved protocols)', 'Affiliate Commissions (zero effort)', 'Ad Revenue (opt-in users only)'], color: 'border-purple-500/30 bg-purple-500/5' },
                  { tier: 'Tier 4 — Strategic (Year 2+)', items: ['DAO Token Economics', 'AI Model Licensing', 'Platform Franchise / White-label'], color: 'border-amber-500/30 bg-amber-500/5' },
                ].map(tier => (
                  <div key={tier.tier} className={`border rounded-lg p-4 ${tier.color}`}>
                    <h4 className="text-sm font-semibold text-white mb-2">{tier.tier}</h4>
                    <ul className="space-y-1">
                      {tier.items.map(item => (
                        <li key={item} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">→</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAX TAB */}
        {activeTab === 'tax' && (
          <div className="space-y-6">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">🌍 Tax Jurisdiction Coverage</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="text-left p-3">Jurisdiction</th>
                      <th className="text-left p-3">Tax Type</th>
                      <th className="text-right p-3">Rate</th>
                      <th className="text-right p-3">Threshold</th>
                      <th className="text-left p-3">Filing</th>
                      <th className="text-left p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { code: '🇬🇧', name: 'United Kingdom', type: 'VAT', rate: '20%', threshold: '£85,000', filing: 'Quarterly', status: 'not_required' },
                      { code: '🇪🇺', name: 'EU (VAT MOSS)', type: 'VAT', rate: '17-27%', threshold: '€0 (digital)', filing: 'Quarterly', status: 'not_required' },
                      { code: '🇺🇸', name: 'United States', type: 'Sales Tax', rate: 'Varies', threshold: '$100,000', filing: 'Quarterly', status: 'not_required' },
                      { code: '🇦🇺', name: 'Australia', type: 'GST', rate: '10%', threshold: 'A$75,000', filing: 'Quarterly', status: 'not_required' },
                      { code: '🇨🇦', name: 'Canada', type: 'GST/HST', rate: '5-15%', threshold: 'C$30,000', filing: 'Quarterly', status: 'not_required' },
                      { code: '🇸🇬', name: 'Singapore', type: 'GST', rate: '9%', threshold: 'S$1M', filing: 'Quarterly', status: 'not_required' },
                    ].map(j => (
                      <tr key={j.name} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                        <td className="p-3 text-white">{j.code} {j.name}</td>
                        <td className="p-3 text-slate-300">{j.type}</td>
                        <td className="p-3 text-right text-amber-400">{j.rate}</td>
                        <td className="p-3 text-right text-slate-400">{j.threshold}</td>
                        <td className="p-3 text-slate-400">{j.filing}</td>
                        <td className="p-3"><StatusBadge status={j.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5">
              <h4 className="text-blue-400 font-semibold mb-2">ℹ️ Tax Registration Status</h4>
              <p className="text-sm text-slate-400">
                No tax registration is currently required as revenue is below all jurisdiction thresholds.
                The tax engine will automatically alert when approaching registration thresholds and
                generate filing reminders. All transactions are tracked for future compliance.
              </p>
            </div>
          </div>
        )}

        {/* RESEARCH TAB */}
        {activeTab === 'research' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: '🔍 Cost Reduction Research', desc: 'AI-powered search for zero-cost alternatives to any detected costs', action: 'Run Cost Scan', color: 'border-emerald-500/30' },
                { title: '💡 Revenue Opportunity Research', desc: 'Discover new passive income and monetisation opportunities', action: 'Find Opportunities', color: 'border-amber-500/30' },
                { title: '📊 Market Intelligence', desc: 'Competitor analysis, pricing benchmarks, market trends', action: 'Analyse Market', color: 'border-blue-500/30' },
                { title: '⚠️ Risk Assessment', desc: 'Evaluate risk profiles of proposed strategies and investments', action: 'Assess Risks', color: 'border-red-500/30' },
              ].map(card => (
                <div key={card.title} className={`bg-slate-800/60 border ${card.color} rounded-xl p-5`}>
                  <h3 className="text-white font-semibold mb-2">{card.title}</h3>
                  <p className="text-sm text-slate-400 mb-4">{card.desc}</p>
                  <button
                    onClick={handleRunResearch}
                    disabled={isResearching}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
                  >
                    {isResearching ? '🔄 Running...' : card.action}
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">🤖 AI Research Engine</h3>
              <p className="text-sm text-slate-400 mb-4">
                The Research Engine uses Cloudflare Workers AI (Llama 3.1) to continuously analyse:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {[
                  '📉 Cloud pricing changes', '🆓 New free tier offerings', '💰 DeFi yield rates',
                  '🤝 Partnership opportunities', '📰 Financial news & trends', '🏆 Competitor pricing',
                  '📋 Regulatory changes', '🔧 OSS alternatives', '💡 Monetisation innovations',
                ].map(item => (
                  <div key={item} className="bg-slate-700/30 rounded-lg p-2 text-slate-300">{item}</div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4">
                Research runs automatically every 6 hours. All findings are stored and available for review.
                Actions requiring spend &gt; $0 are automatically queued for human approval.
              </p>
            </div>
          </div>
        )}

        {/* APPROVALS TAB */}
        {activeTab === 'approvals' && (
          <div className="space-y-6">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
              <h3 className="text-amber-400 font-semibold mb-2">⏳ Pending Approvals</h3>
              <div className="space-y-3">
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-white font-medium">DeFi Yield Farming Strategy</h4>
                      <p className="text-sm text-slate-400">Deploy 20% of treasury to Aave USDC pool (8.5% APY)</p>
                    </div>
                    <StatusBadge status="pending_approval" />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                    <span>Risk Score: <span className="text-amber-400">40/100</span></span>
                    <span>Estimated Monthly Return: <span className="text-emerald-400">$500</span></span>
                    <span>Tier: <span className="text-white">Platform Admin</span></span>
                    <span>SLA: <span className="text-white">24 hours</span></span>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs text-white transition-colors">
                      ✅ Approve
                    </button>
                    <button className="px-3 py-1.5 bg-red-600/50 hover:bg-red-600 rounded-lg text-xs text-white transition-colors">
                      ❌ Reject
                    </button>
                    <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-white transition-colors">
                      ⏸️ Defer 30 days
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-white mb-4">📋 Approval Tiers</h3>
              <div className="space-y-3">
                {[
                  { tier: 'Platform Admin', range: '$0.01 - $10/month', sla: '24 hours', color: 'text-blue-400' },
                  { tier: 'Org Admin', range: '$10 - $100/month', sla: '48 hours', color: 'text-purple-400' },
                  { tier: 'Super Admin', range: '$100 - $1,000/month', sla: '72 hours', color: 'text-amber-400' },
                  { tier: 'Board Review', range: '$1,000+/month', sla: '1 week', color: 'text-red-400' },
                ].map(t => (
                  <div key={t.tier} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-3">
                    <span className={`font-medium ${t.color}`}>{t.tier}</span>
                    <span className="text-slate-400 text-sm">{t.range}</span>
                    <span className="text-slate-500 text-sm">SLA: {t.sla}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoyalBankDashboard;