/**
 * Arcadian Exchange — Full UI
 * Digital marketplace + Investment engine dashboard
 */

import React, { useState, useEffect, useCallback } from 'react';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface Asset {
  id: string;
  name: string;
  description: string;
  type: string;
  sellerName: string;
  sellerVerified: boolean;
  price: number;
  currency: string;
  pricingModel: string;
  category: string;
  tags: string[];
  downloads: number;
  rating: number;
  reviewCount: number;
  licenseType: string;
  status: string;
  commissionRate: number;
}

interface BotStrategy {
  id: string;
  name: string;
  type: string;
  status: string;
  riskScore: number;
  targetMonthlyReturn: number;
  actualMonthlyReturn: number;
  winRate: number;
  totalProfit: number;
  totalTrades: number;
  description: string;
}

interface ARCMetrics {
  totalSupply: number;
  circulatingSupply: number;
  burnedSupply: number;
  stakedSupply: number;
  price: number;
  marketCap: number;
  apy: number;
  holders: number;
}

interface PassiveStream {
  id: string;
  name: string;
  type: string;
  monthlyTarget: number;
  riskScore: number;
  status: string;
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const MOCK_ASSETS: Asset[] = [
  {
    id: 'asset-001', name: 'Infinity Dashboard Pro', description: 'Advanced analytics dashboard with real-time metrics, customisable widgets, and AI-powered insights.',
    type: 'ui_component', sellerName: 'Trancendos', sellerVerified: true, price: 0, currency: 'ARC',
    pricingModel: 'freemium', category: 'Productivity', tags: ['dashboard', 'analytics', 'ai'],
    downloads: 1247, rating: 4.8, reviewCount: 89, licenseType: 'MIT', status: 'active', commissionRate: 0,
  },
  {
    id: 'asset-002', name: 'AI Agent Builder', description: 'Visual drag-and-drop interface for building, training, and deploying AI agents.',
    type: 'ai_agent', sellerName: 'Trancendos', sellerVerified: true, price: 500, currency: 'ARC',
    pricingModel: 'one_time', category: 'AI & Automation', tags: ['ai', 'agents', 'no-code'],
    downloads: 432, rating: 4.6, reviewCount: 34, licenseType: 'Commercial', status: 'active', commissionRate: 0,
  },
  {
    id: 'asset-003', name: 'GDPR Compliance Pack', description: 'Complete GDPR toolkit: consent management, data subject requests, audit trails.',
    type: 'compliance_pack', sellerName: 'Trancendos', sellerVerified: true, price: 200, currency: 'ARC',
    pricingModel: 'annual', category: 'Compliance', tags: ['gdpr', 'compliance', 'privacy'],
    downloads: 891, rating: 4.9, reviewCount: 156, licenseType: 'Commercial', status: 'active', commissionRate: 0,
  },
  {
    id: 'asset-004', name: 'Crypto Portfolio Tracker', description: 'Real-time crypto portfolio tracking with DeFi yield monitoring and tax reporting.',
    type: 'full_application', sellerName: 'DeFi Labs', sellerVerified: true, price: 150, currency: 'ARC',
    pricingModel: 'monthly', category: 'Finance', tags: ['crypto', 'defi', 'portfolio'],
    downloads: 2103, rating: 4.4, reviewCount: 201, licenseType: 'Commercial', status: 'active', commissionRate: 0.10,
  },
  {
    id: 'asset-005', name: 'Zero-Trust Security Module', description: 'Enterprise-grade zero-trust security with continuous verification and threat detection.',
    type: 'security_plugin', sellerName: 'SecureNet', sellerVerified: true, price: 1000, currency: 'ARC',
    pricingModel: 'annual', category: 'Security', tags: ['security', 'zero-trust', 'enterprise'],
    downloads: 567, rating: 4.7, reviewCount: 78, licenseType: 'Commercial', status: 'active', commissionRate: 0.10,
  },
  {
    id: 'asset-006', name: 'K3s Deployment Wizard', description: 'One-click K3s cluster deployment with ARM64 support, monitoring, and auto-scaling.',
    type: 'workflow_template', sellerName: 'CloudOps', sellerVerified: false, price: 75, currency: 'ARC',
    pricingModel: 'one_time', category: 'Developer Tools', tags: ['k3s', 'kubernetes', 'devops'],
    downloads: 334, rating: 4.3, reviewCount: 45, licenseType: 'MIT', status: 'active', commissionRate: 0.15,
  },
];

const MOCK_BOTS: BotStrategy[] = [
  { id: 'arbitrage', name: 'Arbitrage Agent', type: 'arbitrage', status: 'running', riskScore: 20, targetMonthlyReturn: 0.5, actualMonthlyReturn: 0, winRate: 0.94, totalProfit: 0, totalTrades: 0, description: 'Monitors price differences and executes risk-free arbitrage opportunities' },
  { id: 'market_making', name: 'Market Maker', type: 'market_making', status: 'running', riskScore: 25, targetMonthlyReturn: 1.0, actualMonthlyReturn: 0, winRate: 0.87, totalProfit: 0, totalTrades: 0, description: 'Provides liquidity on the AEX order book and earns bid-ask spread' },
  { id: 'defi_yield', name: 'DeFi Yield Optimizer', type: 'defi_yield', status: 'paused', riskScore: 40, targetMonthlyReturn: 8.0, actualMonthlyReturn: 0, winRate: 0.78, totalProfit: 0, totalTrades: 0, description: 'Automatically moves funds to highest-yield DeFi protocols' },
  { id: 'affiliate', name: 'Affiliate Agent', type: 'affiliate', status: 'running', riskScore: 5, targetMonthlyReturn: 3.0, actualMonthlyReturn: 0, winRate: 0.99, totalProfit: 0, totalTrades: 0, description: 'Manages affiliate registrations and optimises referral conversions' },
  { id: 'sentiment', name: 'Sentiment Trader', type: 'sentiment_trading', status: 'paused', riskScore: 55, targetMonthlyReturn: 5.0, actualMonthlyReturn: 0, winRate: 0.65, totalProfit: 0, totalTrades: 0, description: 'Trades based on news and social media sentiment analysis' },
];

const MOCK_ARC: ARCMetrics = {
  totalSupply: 1_000_000_000,
  circulatingSupply: 250_000_000,
  burnedSupply: 0,
  stakedSupply: 50_000_000,
  price: 0.001,
  marketCap: 250_000,
  apy: 12.5,
  holders: 0,
};

const MOCK_PASSIVE: PassiveStream[] = [
  { id: 'marketplace_commission', name: 'Marketplace Commission', type: 'marketplace_commission', monthlyTarget: 1000, riskScore: 5, status: 'active' },
  { id: 'api_access', name: 'API Access Tiers', type: 'api_access', monthlyTarget: 500, riskScore: 5, status: 'researching' },
  { id: 'arc_staking', name: 'ARC Token Staking', type: 'staking', monthlyTarget: 300, riskScore: 20, status: 'active' },
  { id: 'affiliate', name: 'Affiliate Commissions', type: 'affiliate', monthlyTarget: 200, riskScore: 5, status: 'active' },
  { id: 'data_insights', name: 'Data Insights Licensing', type: 'data_insights', monthlyTarget: 200, riskScore: 10, status: 'researching' },
  { id: 'defi_yield', name: 'DeFi Yield Farming', type: 'defi_yield', monthlyTarget: 500, riskScore: 40, status: 'pending_approval' },
];

// ─── HELPER COMPONENTS ────────────────────────────────────────────────────────

const StarRating: React.FC<{ rating: number }> = ({ rating }) => {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <span key={star} className={`text-xs ${star <= Math.round(rating) ? 'text-amber-400' : 'text-slate-600'}`}>★</span>
      ))}
      <span className="text-xs text-slate-400 ml-1">{rating.toFixed(1)}</span>
    </div>
  );
};

const PriceBadge: React.FC<{ price: number; currency: string; model: string }> = ({ price, currency, model }) => {
  if (price === 0) return <span className="text-emerald-400 font-bold text-sm">FREE</span>;
  const suffix = model === 'monthly' ? '/mo' : model === 'annual' ? '/yr' : model === 'per_seat' ? '/seat' : '';
  return <span className="text-amber-400 font-bold text-sm">{price} {currency}{suffix}</span>;
};

const BotStatusDot: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    running: 'bg-emerald-400 animate-pulse',
    stopped: 'bg-slate-500',
    paused: 'bg-amber-400',
    error: 'bg-red-400 animate-pulse',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || 'bg-slate-500'}`} />;
};

const RiskMeter: React.FC<{ score: number }> = ({ score }) => {
  const color = score <= 20 ? 'bg-emerald-500' : score <= 40 ? 'bg-amber-500' : score <= 70 ? 'bg-orange-500' : 'bg-red-500';
  const label = score <= 20 ? 'LOW' : score <= 40 ? 'MEDIUM' : score <= 70 ? 'HIGH' : 'CRITICAL';
  const textColor = score <= 20 ? 'text-emerald-400' : score <= 40 ? 'text-amber-400' : score <= 70 ? 'text-orange-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-slate-700 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold ${textColor}`}>{label}</span>
    </div>
  );
};

const TypeIcon: Record<string, string> = {
  ui_component: '🎨', kernel_module: '⚙️', ai_agent: '🤖', workflow_template: '🔄',
  data_connector: '🔌', security_plugin: '🔒', compliance_pack: '📋',
  full_application: '📱', dataset: '📊', api_access: '🔑', arc_token: '🪙', nft_certificate: '🏆',
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const ArcadianExchange: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'marketplace' | 'trading' | 'arc_token' | 'investment' | 'passive_income' | 'analytics'>('marketplace');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [botStates, setBotStates] = useState<Record<string, string>>(
    Object.fromEntries(MOCK_BOTS.map(b => [b.id, b.status]))
  );

  const categories = ['All', 'Productivity', 'AI & Automation', 'Security', 'Finance', 'Compliance', 'Developer Tools'];

  const filteredAssets = MOCK_ASSETS.filter(a => {
    const matchesSearch = !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || a.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleBot = useCallback((botId: string) => {
    setBotStates(prev => ({
      ...prev,
      [botId]: prev[botId] === 'running' ? 'stopped' : 'running',
    }));
  }, []);

  const tabs = [
    { id: 'marketplace', label: '🏪 Marketplace' },
    { id: 'trading', label: '📊 Trading' },
    { id: 'arc_token', label: '🪙 ARC Token' },
    { id: 'investment', label: '🤖 Investment Bots' },
    { id: 'passive_income', label: '💤 Passive Income' },
    { id: 'analytics', label: '📈 Analytics' },
  ];

  return (
    <div className="h-full bg-slate-900 text-white overflow-auto flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-indigo-900/40 border-b border-indigo-700/30 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-600 rounded-xl flex items-center justify-center text-xl shadow-lg">
              🏛️
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Arcadian Exchange</h1>
              <p className="text-xs text-indigo-300/70">Digital Marketplace & Autonomous Investment Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm">
              <span className="text-slate-400">ARC Price: </span>
              <span className="text-amber-400 font-bold">$0.001</span>
              <span className="text-emerald-400 text-xs ml-2">+0.00%</span>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm">
              <span className="text-slate-400">Market Cap: </span>
              <span className="text-white font-bold">$250K</span>
            </div>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── MARKETPLACE TAB ── */}
        {activeTab === 'marketplace' && (
          <div className="space-y-4">
            {/* Search & Filter */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-48 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input
                  type="text"
                  placeholder="Search components, agents, apps..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Listings', value: MOCK_ASSETS.length },
                { label: 'Total Downloads', value: MOCK_ASSETS.reduce((s, a) => s + a.downloads, 0).toLocaleString() },
                { label: 'Avg Rating', value: (MOCK_ASSETS.reduce((s, a) => s + a.rating, 0) / MOCK_ASSETS.length).toFixed(1) + '★' },
                { label: 'Categories', value: categories.length - 1 },
              ].map(stat => (
                <div key={stat.label} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-white">{stat.value}</div>
                  <div className="text-xs text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Asset Grid */}
            {selectedAsset ? (
              /* Asset Detail View */
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-2"
                >
                  ← Back to Marketplace
                </button>
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">
                    {TypeIcon[selectedAsset.type] || '📦'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h2 className="text-2xl font-bold text-white">{selectedAsset.name}</h2>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-slate-400 text-sm">by {selectedAsset.sellerName}</span>
                          {selectedAsset.sellerVerified && <span className="text-blue-400 text-xs">✓ Verified</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <PriceBadge price={selectedAsset.price} currency={selectedAsset.currency} model={selectedAsset.pricingModel} />
                        <div className="text-xs text-slate-500 mt-1">{selectedAsset.pricingModel.replace(/_/g, ' ')}</div>
                      </div>
                    </div>
                    <p className="text-slate-300 mb-4">{selectedAsset.description}</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedAsset.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-slate-700 rounded-full text-xs text-slate-300">#{tag}</span>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-4 mb-6">
                      <div className="text-center"><div className="text-lg font-bold text-white">{selectedAsset.downloads.toLocaleString()}</div><div className="text-xs text-slate-400">Downloads</div></div>
                      <div className="text-center"><div className="text-lg font-bold text-amber-400">{selectedAsset.rating}★</div><div className="text-xs text-slate-400">{selectedAsset.reviewCount} reviews</div></div>
                      <div className="text-center"><div className="text-lg font-bold text-white">{selectedAsset.licenseType}</div><div className="text-xs text-slate-400">License</div></div>
                      <div className="text-center"><div className="text-lg font-bold text-white">{(selectedAsset.commissionRate * 100).toFixed(0)}%</div><div className="text-xs text-slate-400">Commission</div></div>
                    </div>
                    <div className="flex gap-3">
                      <button className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
                        {selectedAsset.price === 0 ? '⬇️ Install Free' : `🛒 Purchase — ${selectedAsset.price} ${selectedAsset.currency}`}
                      </button>
                      <button className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white transition-colors">
                        👁️ Preview
                      </button>
                      <button className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white transition-colors">
                        📚 Docs
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Asset Grid */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAssets.map(asset => (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className="bg-slate-800/60 border border-slate-700/50 hover:border-indigo-500/50 rounded-xl p-4 cursor-pointer transition-all hover:bg-slate-800/80 group"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500/30 to-purple-600/30 rounded-lg flex items-center justify-center text-xl flex-shrink-0 group-hover:from-indigo-500/50 group-hover:to-purple-600/50 transition-all">
                        {TypeIcon[asset.type] || '📦'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium text-sm truncate group-hover:text-indigo-300 transition-colors">{asset.name}</h3>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-slate-500 text-xs">{asset.sellerName}</span>
                          {asset.sellerVerified && <span className="text-blue-400 text-xs">✓</span>}
                        </div>
                      </div>
                      <PriceBadge price={asset.price} currency={asset.currency} model={asset.pricingModel} />
                    </div>
                    <p className="text-slate-400 text-xs mb-3 line-clamp-2">{asset.description}</p>
                    <div className="flex items-center justify-between">
                      <StarRating rating={asset.rating} />
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>⬇️ {asset.downloads.toLocaleString()}</span>
                        <span className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">{asset.category}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* List Your Component CTA */}
                <div className="bg-slate-800/30 border border-dashed border-slate-600 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-500/50 hover:bg-slate-800/50 transition-all group">
                  <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">➕</div>
                  <h3 className="text-white font-medium text-sm mb-1">List Your Component</h3>
                  <p className="text-slate-500 text-xs">Earn ARC tokens by selling your components, agents, and apps</p>
                  <div className="mt-3 text-xs text-indigo-400">Earn 85-95% of sale price →</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TRADING TAB ── */}
        {activeTab === 'trading' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: '24h Volume', value: '$0', change: '0%' },
                { label: 'Active Orders', value: '0', change: '' },
                { label: 'Completed Trades', value: '0', change: '' },
              ].map(stat => (
                <div key={stat.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-slate-400">{stat.label}</div>
                  {stat.change && <div className="text-xs text-emerald-400 mt-1">{stat.change}</div>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Order Form */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">📝 Place Order</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button className="py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium text-white transition-colors">BUY</button>
                    <button className="py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-slate-300 transition-colors">SELL</button>
                  </div>
                  <select className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                    <option>Select Asset...</option>
                    {MOCK_ASSETS.map(a => <option key={a.id}>{a.name}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                      <option>Market</option>
                      <option>Limit</option>
                      <option>Stop</option>
                    </select>
                    <input type="number" placeholder="Quantity" className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500" />
                  </div>
                  <input type="number" placeholder="Price (ARC) — for limit orders" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500" />
                  <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between"><span>Estimated Total</span><span className="text-white">0 ARC</span></div>
                    <div className="flex justify-between"><span>Trading Fee (0.1%)</span><span className="text-white">0 ARC</span></div>
                    <div className="flex justify-between font-medium"><span>You Pay</span><span className="text-amber-400">0 ARC</span></div>
                  </div>
                  <button className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium text-white transition-colors">
                    Place Buy Order
                  </button>
                </div>
              </div>

              {/* Order Book */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">📖 Order Book</h3>
                <div className="space-y-1 text-xs">
                  <div className="grid grid-cols-3 text-slate-500 pb-2 border-b border-slate-700">
                    <span>Price (ARC)</span>
                    <span className="text-center">Quantity</span>
                    <span className="text-right">Total</span>
                  </div>
                  {/* Asks (sell orders) */}
                  {[0.0015, 0.0014, 0.0013, 0.0012, 0.0011].map((price, i) => (
                    <div key={price} className="grid grid-cols-3 text-red-400/70 hover:bg-red-500/5 rounded px-1">
                      <span>{price.toFixed(4)}</span>
                      <span className="text-center text-slate-400">{(Math.random() * 1000 + 100).toFixed(0)}</span>
                      <span className="text-right text-slate-500">{(price * 500).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="py-2 text-center text-white font-bold border-y border-slate-700">
                    0.0010 ARC <span className="text-slate-500 text-xs font-normal">Last Price</span>
                  </div>
                  {/* Bids (buy orders) */}
                  {[0.0009, 0.0008, 0.0007, 0.0006, 0.0005].map((price) => (
                    <div key={price} className="grid grid-cols-3 text-emerald-400/70 hover:bg-emerald-500/5 rounded px-1">
                      <span>{price.toFixed(4)}</span>
                      <span className="text-center text-slate-400">{(Math.random() * 1000 + 100).toFixed(0)}</span>
                      <span className="text-right text-slate-500">{(price * 500).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ARC TOKEN TAB ── */}
        {activeTab === 'arc_token' && (
          <div className="space-y-4">
            {/* Token Metrics */}
            <div className="bg-gradient-to-r from-amber-900/30 to-yellow-900/20 border border-amber-700/30 rounded-xl p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-full flex items-center justify-center text-3xl shadow-lg">🪙</div>
                <div>
                  <h2 className="text-2xl font-bold text-white">ARC Token</h2>
                  <p className="text-amber-300/70">Arcadia Credit — Platform Utility Token</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-3xl font-bold text-amber-400">$0.001</span>
                    <span className="text-slate-400 text-sm">USD</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Supply', value: '1B ARC' },
                  { label: 'Circulating', value: '250M ARC' },
                  { label: 'Staked', value: '50M ARC' },
                  { label: 'Burned', value: '0 ARC' },
                  { label: 'Market Cap', value: '$250K' },
                  { label: 'Staking APY', value: '12.5%' },
                  { label: 'Holders', value: '0' },
                  { label: '24h Volume', value: '$0' },
                ].map(m => (
                  <div key={m.label} className="bg-slate-800/40 rounded-lg p-3">
                    <div className="text-white font-bold">{m.value}</div>
                    <div className="text-xs text-slate-400">{m.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Token Utility */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">🔧 Token Utility</h3>
                <div className="space-y-3">
                  {[
                    { icon: '🛒', title: 'Marketplace Currency', desc: 'Primary currency for all marketplace transactions' },
                    { icon: '🗳️', title: 'Governance Voting', desc: '1 ARC = 1 vote on platform decisions' },
                    { icon: '💰', title: 'Staking Rewards', desc: 'Earn 12.5% APY by staking ARC tokens' },
                    { icon: '💸', title: 'Fee Discounts', desc: 'Hold ARC to receive trading fee discounts' },
                    { icon: '⭐', title: 'Premium Features', desc: 'Stake ARC to unlock premium platform features' },
                    { icon: '👨‍💻', title: 'Developer Incentives', desc: 'Earn ARC for contributing to the ecosystem' },
                  ].map(u => (
                    <div key={u.title} className="flex items-start gap-3">
                      <span className="text-xl">{u.icon}</span>
                      <div>
                        <div className="text-white text-sm font-medium">{u.title}</div>
                        <div className="text-slate-400 text-xs">{u.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-4">🔥 Deflationary Mechanics</h3>
                <div className="space-y-4">
                  {[
                    { label: '1% Marketplace Burn', desc: '1% of every marketplace transaction is burned', progress: 0 },
                    { label: '0.5% Exchange Fee Burn', desc: '0.5% of every exchange fee is burned', progress: 0 },
                    { label: 'Quarterly Buyback & Burn', desc: 'Platform profits used to buy and burn ARC', progress: 0 },
                  ].map(m => (
                    <div key={m.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white">{m.label}</span>
                        <span className="text-amber-400">0 ARC burned</span>
                      </div>
                      <div className="text-xs text-slate-500 mb-2">{m.desc}</div>
                      <div className="bg-slate-700 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-red-500" style={{ width: `${m.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-700">
                  <h4 className="text-white text-sm font-medium mb-3">💎 Stake ARC</h4>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Amount to stake" className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500" />
                    <button className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium text-white transition-colors">
                      Stake
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Estimated monthly reward: 0 ARC at 12.5% APY</p>
                </div>
              </div>
            </div>

            {/* Token Distribution */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">📊 Token Distribution</h3>
              <div className="space-y-3">
                {[
                  { label: 'Platform Reserve', percent: 30, color: 'bg-indigo-500', locked: '4-year lock' },
                  { label: 'Community Rewards', percent: 25, color: 'bg-emerald-500', locked: 'Ongoing distribution' },
                  { label: 'Ecosystem Fund', percent: 20, color: 'bg-blue-500', locked: 'Grants & incentives' },
                  { label: 'Team', percent: 15, color: 'bg-purple-500', locked: '4yr vest, 1yr cliff' },
                  { label: 'Public Sale', percent: 10, color: 'bg-amber-500', locked: 'Future fundraising' },
                ].map(d => (
                  <div key={d.label} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${d.color} flex-shrink-0`} />
                    <div className="w-36 text-sm text-slate-300">{d.label}</div>
                    <div className="flex-1 bg-slate-700 rounded-full h-2">
                      <div className={`h-2 rounded-full ${d.color}`} style={{ width: `${d.percent}%` }} />
                    </div>
                    <div className="w-8 text-right text-sm text-white font-medium">{d.percent}%</div>
                    <div className="w-40 text-xs text-slate-500">{d.locked}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── INVESTMENT BOTS TAB ── */}
        {activeTab === 'investment' && (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-amber-300 text-sm">
                ⚠️ <strong>Investment Engine:</strong> All bots operate within pre-approved risk parameters.
                Strategies with risk score &gt; 40 require human approval before execution.
                All profits are reported to the Royal Bank of Arcadia.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Active Bots', value: Object.values(botStates).filter(s => s === 'running').length, color: 'text-emerald-400' },
                { label: 'Total Monthly Target', value: `$${MOCK_BOTS.reduce((s, b) => s + b.targetMonthlyReturn, 0).toFixed(1)}`, color: 'text-amber-400' },
                { label: 'Total Profit', value: '$0.00', color: 'text-blue-400' },
              ].map(stat => (
                <div key={stat.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-sm text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {MOCK_BOTS.map(bot => {
                const currentStatus = botStates[bot.id] || bot.status;
                const canAutoExecute = bot.riskScore <= 40;
                return (
                  <div key={bot.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <BotStatusDot status={currentStatus} />
                        <div>
                          <h3 className="text-white font-semibold">{bot.name}</h3>
                          <p className="text-slate-400 text-xs">{bot.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {!canAutoExecute && (
                          <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                            Requires Approval
                          </span>
                        )}
                        <button
                          onClick={() => canAutoExecute && toggleBot(bot.id)}
                          disabled={!canAutoExecute}
                          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            currentStatus === 'running'
                              ? 'bg-red-600/50 hover:bg-red-600 text-white'
                              : canAutoExecute
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {currentStatus === 'running' ? '⏹ Stop' : canAutoExecute ? '▶ Start' : '🔒 Locked'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-4 text-sm">
                      <div>
                        <div className="text-slate-500 text-xs mb-1">Risk Score</div>
                        <RiskMeter score={bot.riskScore} />
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs mb-1">Monthly Target</div>
                        <div className="text-amber-400 font-medium">{bot.targetMonthlyReturn}%</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs mb-1">Win Rate</div>
                        <div className="text-white font-medium">{(bot.winRate * 100).toFixed(0)}%</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs mb-1">Total Trades</div>
                        <div className="text-white font-medium">{bot.totalTrades}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-xs mb-1">Total Profit</div>
                        <div className="text-emerald-400 font-medium">${bot.totalProfit.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PASSIVE INCOME TAB ── */}
        {activeTab === 'passive_income' && (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
              <h3 className="text-emerald-400 font-semibold mb-2">💤 Passive Income Overview</h3>
              <p className="text-sm text-slate-400 mb-4">
                Zero-effort revenue streams that generate income automatically without human intervention.
                All streams are monitored by the Royal Bank of Arcadia and reported in real-time.
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center"><div className="text-2xl font-bold text-emerald-400">$0</div><div className="text-xs text-slate-400">Current Monthly</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-amber-400">${MOCK_PASSIVE.reduce((s, p) => s + p.monthlyTarget, 0).toLocaleString()}</div><div className="text-xs text-slate-400">Monthly Target</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-blue-400">${(MOCK_PASSIVE.reduce((s, p) => s + p.monthlyTarget, 0) * 12).toLocaleString()}</div><div className="text-xs text-slate-400">Annual Target</div></div>
              </div>
            </div>

            <div className="space-y-3">
              {MOCK_PASSIVE.map(stream => (
                <div key={stream.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {stream.type === 'marketplace_commission' ? '🏪' :
                         stream.type === 'api_access' ? '🔑' :
                         stream.type === 'staking' ? '🪙' :
                         stream.type === 'affiliate' ? '🤝' :
                         stream.type === 'data_insights' ? '📊' :
                         stream.type === 'defi_yield' ? '🌾' : '💰'}
                      </span>
                      <div>
                        <h3 className="text-white font-medium">{stream.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            stream.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                            stream.status === 'researching' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>
                            {stream.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <RiskMeter score={stream.riskScore} />
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-amber-400 font-bold">${stream.monthlyTarget}/mo</div>
                      <div className="text-xs text-slate-500">target</div>
                    </div>
                  </div>
                  <div className="bg-slate-700 rounded-full h-1.5 mt-2">
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{ width: '0%' }} />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>$0 current</span>
                    <span>${stream.monthlyTarget} target</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === 'analytics' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Marketplace Revenue', value: '$0', icon: '🏪' },
                { label: 'Total Trading Revenue', value: '$0', icon: '📊' },
                { label: 'Total Investment Returns', value: '$0', icon: '🤖' },
                { label: 'Total Passive Income', value: '$0', icon: '💤' },
              ].map(stat => (
                <div key={stat.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                  <div className="text-2xl mb-2">{stat.icon}</div>
                  <div className="text-xl font-bold text-white">{stat.value}</div>
                  <div className="text-xs text-slate-400">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">📈 Revenue Projection (Year 1)</h3>
              <div className="space-y-3">
                {[
                  { month: 'Month 1-3', label: 'Foundation', target: '$500-2K/mo', streams: 'Marketplace + Staking + Affiliate' },
                  { month: 'Month 3-6', label: 'Growth', target: '$2K-10K/mo', streams: '+ API Access + Trading Fees' },
                  { month: 'Month 6-12', label: 'Scale', target: '$10K-30K/mo', streams: '+ White-label + Enterprise' },
                  { month: 'Year 2', label: 'Expansion', target: '$30K-100K/mo', streams: '+ DeFi + DAO + AI Licensing' },
                ].map(phase => (
                  <div key={phase.month} className="flex items-center gap-4 bg-slate-700/30 rounded-lg p-3">
                    <div className="w-24 text-xs text-slate-500">{phase.month}</div>
                    <div className="w-24 text-sm font-medium text-white">{phase.label}</div>
                    <div className="flex-1 text-xs text-slate-400">{phase.streams}</div>
                    <div className="text-amber-400 font-bold text-sm">{phase.target}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">🔗 RBA Integration Status</h3>
              <div className="space-y-2 text-sm">
                {[
                  { check: 'Cost monitoring feed', status: true },
                  { check: 'Revenue reporting to RBA', status: true },
                  { check: 'Tax calculation integration', status: true },
                  { check: 'Approval workflow connected', status: true },
                  { check: 'Audit ledger synchronised', status: true },
                  { check: 'Research engine feed', status: true },
                ].map(item => (
                  <div key={item.check} className="flex items-center justify-between">
                    <span className="text-slate-300">{item.check}</span>
                    <span className={item.status ? 'text-emerald-400' : 'text-red-400'}>
                      {item.status ? '✅ Connected' : '❌ Disconnected'}
                    </span>
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

export default ArcadianExchange;