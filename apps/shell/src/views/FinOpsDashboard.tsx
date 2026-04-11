import React, { useState } from 'react';

interface ServiceCost {
  name: string;
  provider: string;
  tier: string;
  currentUsage: number;
  freeLimit: number;
  unit: string;
  costIfExceeded: string;
  status: 'safe' | 'warning' | 'danger';
}

interface CostProjection {
  month: string;
  projected: number;
  actual: number;
  budget: number;
}

const SERVICES: ServiceCost[] = [
  { name: 'Cloudflare Workers', provider: 'Cloudflare', tier: 'Free', currentUsage: 42000, freeLimit: 100000, unit: 'requests/day', costIfExceeded: '$0.30/M requests', status: 'safe' },
  { name: 'Cloudflare R2', provider: 'Cloudflare', tier: 'Free', currentUsage: 3.2, freeLimit: 10, unit: 'GB storage', costIfExceeded: '$0.015/GB/month', status: 'safe' },
  { name: 'Cloudflare KV', provider: 'Cloudflare', tier: 'Free', currentUsage: 45000, freeLimit: 100000, unit: 'reads/day', costIfExceeded: '$0.50/M reads', status: 'safe' },
  { name: 'Cloudflare D1', provider: 'Cloudflare', tier: 'Free', currentUsage: 2.8, freeLimit: 5, unit: 'M rows read/day', costIfExceeded: '$0.001/M rows', status: 'warning' },
  { name: 'Cloudflare Pages', provider: 'Cloudflare', tier: 'Free', currentUsage: 120, freeLimit: 500, unit: 'builds/month', costIfExceeded: '$0 (soft limit)', status: 'safe' },
  { name: 'Supabase Database', provider: 'Supabase', tier: 'Free', currentUsage: 134, freeLimit: 500, unit: 'MB storage', costIfExceeded: '$25/month (Pro)', status: 'safe' },
  { name: 'Supabase Auth', provider: 'Supabase', tier: 'Free', currentUsage: 1247, freeLimit: 50000, unit: 'MAU', costIfExceeded: '$25/month (Pro)', status: 'safe' },
  { name: 'Supabase Edge Functions', provider: 'Supabase', tier: 'Free', currentUsage: 250000, freeLimit: 500000, unit: 'invocations/month', costIfExceeded: '$2/M invocations', status: 'safe' },
  { name: 'Oracle Cloud Compute', provider: 'Oracle', tier: 'Always Free', currentUsage: 2, freeLimit: 4, unit: 'ARM OCPUs', costIfExceeded: '$0.01/OCPU/hr', status: 'safe' },
  { name: 'Oracle Cloud Storage', provider: 'Oracle', tier: 'Always Free', currentUsage: 85, freeLimit: 200, unit: 'GB block storage', costIfExceeded: '$0.0255/GB/month', status: 'safe' },
  { name: 'Workers AI', provider: 'Cloudflare', tier: 'Free', currentUsage: 5200, freeLimit: 10000, unit: 'neurons/day', costIfExceeded: '$0.011/1K neurons', status: 'warning' },
  { name: 'Let\'s Encrypt TLS', provider: 'Let\'s Encrypt', tier: 'Free', currentUsage: 3, freeLimit: 50, unit: 'certificates', costIfExceeded: 'N/A (always free)', status: 'safe' },
];

const PROJECTIONS: CostProjection[] = [
  { month: 'Jan', projected: 0, actual: 0, budget: 0 },
  { month: 'Feb', projected: 0, actual: 0, budget: 0 },
  { month: 'Mar', projected: 0, actual: 0, budget: 0 },
  { month: 'Apr', projected: 0, actual: 0, budget: 0 },
  { month: 'May', projected: 0, actual: 0, budget: 0 },
  { month: 'Jun', projected: 0, actual: 0, budget: 0 },
];

export default function FinOpsDashboard() {
  const [activeView, setActiveView] = useState<'overview' | 'services' | 'projections' | 'optimization'>('overview');

  const totalServices = SERVICES.length;
  const safeServices = SERVICES.filter(s => s.status === 'safe').length;
  const warningServices = SERVICES.filter(s => s.status === 'warning').length;
  const dangerServices = SERVICES.filter(s => s.status === 'danger').length;
  const currentMonthlyCost = 0;
  const providers = [...new Set(SERVICES.map(s => s.provider))];

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>💰 FinOps Dashboard</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Zero-cost infrastructure monitoring — Free tier usage tracking
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success)' }}>$0.00</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginLeft: '0.5rem' }}>/ month</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Monthly Cost', value: `$${currentMonthlyCost.toFixed(2)}`, icon: '💵', color: 'var(--color-success)' },
          { label: 'Services Tracked', value: totalServices.toString(), icon: '📡', color: 'var(--color-primary)' },
          { label: 'Within Free Tier', value: safeServices.toString(), icon: '✅', color: 'var(--color-success)' },
          { label: 'Approaching Limit', value: warningServices.toString(), icon: '⚠️', color: 'var(--color-warning)' },
          { label: 'Over Limit', value: dangerServices.toString(), icon: '🚨', color: dangerServices > 0 ? 'var(--color-error)' : 'var(--color-success)' },
          { label: 'Providers', value: providers.length.toString(), icon: '☁️', color: 'var(--color-primary)' },
        ].map(card => (
          <div key={card.label} style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{card.icon}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        {(['overview', 'services', 'projections', 'optimization'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveView(tab)}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.5rem 0.5rem 0 0', border: 'none', cursor: 'pointer',
              background: activeView === tab ? 'var(--color-primary)' : 'transparent',
              color: activeView === tab ? '#fff' : 'var(--color-text-secondary)',
              fontWeight: activeView === tab ? 600 : 400, fontSize: '0.875rem', textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeView === 'overview' && (
        <div>
          {/* Provider Breakdown */}
          {providers.map(provider => (
            <div key={provider} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>
                {provider === 'Cloudflare' ? '☁️' : provider === 'Supabase' ? '⚡' : provider === 'Oracle' ? '🔶' : '🔒'} {provider}
              </h3>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {SERVICES.filter(s => s.provider === provider).map(service => {
                  const pct = (service.currentUsage / service.freeLimit) * 100;
                  return (
                    <div key={service.name} style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{service.name}</span>
                        <span style={{
                          padding: '0.125rem 0.5rem', borderRadius: '1rem', fontSize: '0.6875rem', fontWeight: 600,
                          background: service.status === 'safe' ? 'rgba(34,197,94,0.15)' : service.status === 'warning' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                          color: service.status === 'safe' ? 'var(--color-success)' : service.status === 'warning' ? 'var(--color-warning)' : 'var(--color-error)',
                        }}>
                          {service.tier}
                        </span>
                      </div>
                      <div style={{ position: 'relative', height: '8px', borderRadius: '4px', background: 'var(--color-border)', overflow: 'hidden', marginBottom: '0.5rem' }}>
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: '4px',
                          width: `${Math.min(100, pct)}%`,
                          background: pct > 90 ? 'var(--color-error)' : pct > 70 ? 'var(--color-warning)' : 'var(--color-success)',
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        <span>{typeof service.currentUsage === 'number' && service.currentUsage % 1 !== 0 ? service.currentUsage.toFixed(1) : service.currentUsage.toLocaleString()} / {typeof service.freeLimit === 'number' && service.freeLimit % 1 !== 0 ? service.freeLimit.toFixed(1) : service.freeLimit.toLocaleString()} {service.unit}</span>
                        <span style={{ fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Services Table */}
      {activeView === 'services' && (
        <div style={{ borderRadius: '0.75rem', border: '1px solid var(--color-border)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                {['Service', 'Provider', 'Tier', 'Usage', 'Free Limit', 'Usage %', 'Cost if Exceeded', 'Status'].map(h => (
                  <th key={h} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SERVICES.map(s => {
                const pct = (s.currentUsage / s.freeLimit) * 100;
                return (
                  <tr key={s.name}>
                    <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>{s.provider}</td>
                    <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ padding: '0.125rem 0.5rem', borderRadius: '1rem', background: 'rgba(34,197,94,0.15)', color: 'var(--color-success)', fontSize: '0.6875rem' }}>{s.tier}</span>
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>{s.currentUsage.toLocaleString()}</td>
                    <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>{s.freeLimit.toLocaleString()} {s.unit}</td>
                    <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', color: pct > 80 ? 'var(--color-warning)' : 'var(--color-text)' }}>{pct.toFixed(1)}%</td>
                    <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>{s.costIfExceeded}</td>
                    <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                      {s.status === 'safe' ? '🟢' : s.status === 'warning' ? '🟡' : '🔴'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Projections */}
      {activeView === 'projections' && (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>📈 6-Month Cost Projection</h3>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', height: '200px', padding: '1rem 0' }}>
              {PROJECTIONS.map(p => (
                <div key={p.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '100%', height: '160px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ width: '60%', height: '4px', borderRadius: '2px', background: 'var(--color-success)' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{p.month}</span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-success)', fontWeight: 700 }}>$0</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(34,197,94,0.1)', borderRadius: '0.5rem', marginTop: '1rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success)' }}>🎉 Projected Annual Cost: $0.00</span>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                All services operating within free tier limits
              </p>
            </div>
          </div>

          {/* Scaling Thresholds */}
          <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>🎯 Scaling Thresholds</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              Estimated user counts before exceeding free tiers:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem' }}>
              {[
                { service: 'Cloudflare Workers', threshold: '~2,500 DAU', detail: '100K requests/day ÷ ~40 req/user' },
                { service: 'Supabase Auth', threshold: '~50,000 MAU', detail: 'Direct free tier limit' },
                { service: 'Supabase Database', threshold: '~10,000 users', detail: '500MB ÷ ~50KB/user' },
                { service: 'R2 Storage', threshold: '~5,000 users', detail: '10GB ÷ ~2MB/user files' },
                { service: 'Workers AI', threshold: '~500 DAU', detail: '10K neurons/day ÷ ~20/query' },
                { service: 'Oracle Compute', threshold: '~1,000 concurrent', detail: '4 ARM OCPUs capacity' },
              ].map(t => (
                <div key={t.service} style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.service}</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-primary)', margin: '0.25rem 0' }}>{t.threshold}</div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{t.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Optimization */}
      {activeView === 'optimization' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {[
            { title: 'Edge Caching Strategy', status: 'active', savings: 'Saves ~60% of origin requests', description: 'Cloudflare CDN caches static assets at 300+ edge locations. KV stores session data at the edge, reducing database queries by 80%.', icon: '⚡' },
            { title: 'Database Query Optimization', status: 'active', savings: 'Cache hit ratio: 99.2%', description: 'pgvector indexes for semantic search, pg_trgm for fuzzy matching. Materialized views for dashboard aggregations. Connection pooling via Supavisor.', icon: '🗄️' },
            { title: 'R2 Storage Tiering', status: 'active', savings: 'Saves ~40% storage costs', description: 'Hot files in R2 (free 10GB), cold files compressed and archived. Automatic lifecycle policies move inactive files after 30 days.', icon: '📦' },
            { title: 'Workers AI Batching', status: 'active', savings: 'Reduces neuron usage by ~50%', description: 'AI requests are batched and deduplicated. Response caching for identical prompts. Fallback to smaller models for simple queries.', icon: '🤖' },
            { title: 'Zero-Egress Architecture', status: 'active', savings: 'Eliminates bandwidth costs', description: 'All services communicate within Cloudflare network (free egress). R2 has zero egress fees. Oracle Cloud provides 10TB/month free egress.', icon: '🌐' },
            { title: 'Vendor Lock-in Prevention', status: 'active', savings: 'Enables instant migration', description: 'All services abstracted behind interfaces. Database uses standard PostgreSQL. Storage uses S3-compatible API. Can migrate to any provider in hours.', icon: '🔓' },
          ].map(opt => (
            <div key={opt.title} style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', display: 'flex', gap: '1rem' }}>
              <div style={{ fontSize: '2rem', lineHeight: 1 }}>{opt.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{opt.title}</span>
                  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '1rem', background: 'rgba(34,197,94,0.15)', color: 'var(--color-success)', fontSize: '0.6875rem', fontWeight: 600 }}>
                    ✓ {opt.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-primary)', fontWeight: 600, marginBottom: '0.25rem' }}>{opt.savings}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{opt.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}