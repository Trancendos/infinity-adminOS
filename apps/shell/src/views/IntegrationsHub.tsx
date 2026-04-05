import React, { useState } from 'react';

/* ─────────────────────────────────────────────
   Infinity OS — Integrations Hub
   Connect, manage, and monitor external service
   integrations with OAuth2 PKCE, webhooks,
   rate-limit awareness, and credential vault.
   ───────────────────────────────────────────── */

interface Integration {
  id: string;
  name: string;
  icon: string;
  category: 'communication' | 'project-management' | 'devops' | 'monitoring' | 'cloud' | 'database' | 'ai';
  description: string;
  status: 'connected' | 'disconnected' | 'error' | 'rate-limited';
  connectedAt?: string;
  lastSync?: string;
  webhooksActive: number;
  rateLimitRemaining?: number;
  rateLimitTotal?: number;
  scopes: string[];
  version: string;
  docs: string;
}

interface WebhookEvent {
  id: string;
  integrationId: string;
  event: string;
  timestamp: string;
  status: 'delivered' | 'failed' | 'pending' | 'retrying';
  payload: string;
  responseCode?: number;
  retryCount: number;
}

interface OAuthFlow {
  integrationId: string;
  step: 'idle' | 'authorizing' | 'exchanging' | 'complete' | 'error';
  error?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'slack', name: 'Slack', icon: '💬', category: 'communication',
    description: 'Real-time messaging, notifications, and slash commands for team collaboration.',
    status: 'connected', connectedAt: '2025-01-15T10:30:00Z', lastSync: '2025-03-04T12:00:00Z',
    webhooksActive: 3, rateLimitRemaining: 85, rateLimitTotal: 100,
    scopes: ['chat:write', 'channels:read', 'commands', 'webhooks:write'],
    version: '2.1.0', docs: 'https://api.slack.com/docs'
  },
  {
    id: 'discord', name: 'Discord', icon: '🎮', category: 'communication',
    description: 'Bot integration for Discord servers with rich embeds and interaction handlers.',
    status: 'connected', connectedAt: '2025-02-01T08:00:00Z', lastSync: '2025-03-04T11:45:00Z',
    webhooksActive: 2, rateLimitRemaining: 45, rateLimitTotal: 50,
    scopes: ['bot', 'applications.commands', 'messages.read'],
    version: '1.3.0', docs: 'https://discord.com/developers/docs'
  },
  {
    id: 'jira', name: 'Jira', icon: '📋', category: 'project-management',
    description: 'Issue tracking, sprint management, and automated workflow triggers.',
    status: 'connected', connectedAt: '2025-01-20T14:00:00Z', lastSync: '2025-03-04T10:30:00Z',
    webhooksActive: 4, rateLimitRemaining: 190, rateLimitTotal: 200,
    scopes: ['read:jira-work', 'write:jira-work', 'manage:jira-webhook'],
    version: '3.0.1', docs: 'https://developer.atlassian.com/cloud/jira/'
  },
  {
    id: 'linear', name: 'Linear', icon: '📐', category: 'project-management',
    description: 'Modern issue tracking with cycle automation and roadmap sync.',
    status: 'disconnected', webhooksActive: 0,
    scopes: ['read', 'write', 'issues:create', 'admin'],
    version: '1.0.0', docs: 'https://developers.linear.app/'
  },
  {
    id: 'github-actions', name: 'GitHub Actions', icon: '⚡', category: 'devops',
    description: 'CI/CD pipeline triggers, workflow dispatch, and status reporting.',
    status: 'connected', connectedAt: '2025-01-10T09:00:00Z', lastSync: '2025-03-04T12:15:00Z',
    webhooksActive: 6, rateLimitRemaining: 4800, rateLimitTotal: 5000,
    scopes: ['repo', 'workflow', 'actions:read', 'actions:write'],
    version: '2.5.0', docs: 'https://docs.github.com/en/actions'
  },
  {
    id: 'pagerduty', name: 'PagerDuty', icon: '🚨', category: 'monitoring',
    description: 'Incident management, on-call scheduling, and alert escalation.',
    status: 'connected', connectedAt: '2025-02-10T16:00:00Z', lastSync: '2025-03-04T11:00:00Z',
    webhooksActive: 2, rateLimitRemaining: 950, rateLimitTotal: 1000,
    scopes: ['incidents:read', 'incidents:write', 'services:read', 'escalation_policies:read'],
    version: '2.0.0', docs: 'https://developer.pagerduty.com/'
  },
  {
    id: 'cloudflare', name: 'Cloudflare', icon: '☁️', category: 'cloud',
    description: 'Workers deployment, R2 management, KV operations, and DNS configuration.',
    status: 'connected', connectedAt: '2025-01-05T07:00:00Z', lastSync: '2025-03-04T12:30:00Z',
    webhooksActive: 1, rateLimitRemaining: 1150, rateLimitTotal: 1200,
    scopes: ['workers:write', 'r2:write', 'kv:write', 'dns:edit', 'zone:read'],
    version: '4.0.0', docs: 'https://developers.cloudflare.com/'
  },
  {
    id: 'supabase', name: 'Supabase', icon: '🗄️', category: 'database',
    description: 'PostgreSQL management, real-time subscriptions, and auth sync.',
    status: 'connected', connectedAt: '2025-01-05T07:30:00Z', lastSync: '2025-03-04T12:25:00Z',
    webhooksActive: 3, rateLimitRemaining: 480, rateLimitTotal: 500,
    scopes: ['database:read', 'database:write', 'auth:admin', 'realtime:subscribe'],
    version: '2.2.0', docs: 'https://supabase.com/docs'
  },
  {
    id: 'openai', name: 'OpenAI', icon: '🧠', category: 'ai',
    description: 'GPT model access, embeddings, function calling, and fine-tuning management.',
    status: 'connected', connectedAt: '2025-02-15T12:00:00Z', lastSync: '2025-03-04T12:10:00Z',
    webhooksActive: 0, rateLimitRemaining: 58, rateLimitTotal: 60,
    scopes: ['model:read', 'model:write', 'files:read', 'fine-tuning:write'],
    version: '1.5.0', docs: 'https://platform.openai.com/docs'
  },
  {
    id: 'anthropic', name: 'Anthropic', icon: '🔮', category: 'ai',
    description: 'Claude model access, tool use, and constitutional AI integration.',
    status: 'disconnected', webhooksActive: 0,
    scopes: ['messages:create', 'models:read'],
    version: '1.0.0', docs: 'https://docs.anthropic.com/'
  },
  {
    id: 'grafana', name: 'Grafana', icon: '📊', category: 'monitoring',
    description: 'Dashboard provisioning, alert rule management, and annotation sync.',
    status: 'connected', connectedAt: '2025-01-08T11:00:00Z', lastSync: '2025-03-04T11:50:00Z',
    webhooksActive: 1, rateLimitRemaining: 290, rateLimitTotal: 300,
    scopes: ['dashboards:read', 'dashboards:write', 'alerts:read', 'annotations:write'],
    version: '1.8.0', docs: 'https://grafana.com/docs/'
  },
  {
    id: 'vault', name: 'HashiCorp Vault', icon: '🔐', category: 'devops',
    description: 'Secrets management, dynamic credentials, and crypto-shredding for GDPR.',
    status: 'connected', connectedAt: '2025-01-05T06:00:00Z', lastSync: '2025-03-04T12:35:00Z',
    webhooksActive: 0, rateLimitRemaining: 990, rateLimitTotal: 1000,
    scopes: ['secret:read', 'secret:write', 'transit:encrypt', 'transit:decrypt', 'auth:manage'],
    version: '3.1.0', docs: 'https://developer.hashicorp.com/vault/docs'
  },
];

const WEBHOOK_EVENTS: WebhookEvent[] = [
  { id: 'wh-001', integrationId: 'slack', event: 'message.posted', timestamp: '2025-03-04T12:00:15Z', status: 'delivered', payload: '{"channel":"#alerts","text":"Deploy complete"}', responseCode: 200, retryCount: 0 },
  { id: 'wh-002', integrationId: 'jira', event: 'issue.updated', timestamp: '2025-03-04T11:58:30Z', status: 'delivered', payload: '{"issue":"INF-342","status":"Done"}', responseCode: 200, retryCount: 0 },
  { id: 'wh-003', integrationId: 'github-actions', event: 'workflow_run.completed', timestamp: '2025-03-04T11:55:00Z', status: 'delivered', payload: '{"workflow":"ci","conclusion":"success"}', responseCode: 200, retryCount: 0 },
  { id: 'wh-004', integrationId: 'pagerduty', event: 'incident.triggered', timestamp: '2025-03-04T11:50:00Z', status: 'failed', payload: '{"incident":"P-1001","severity":"high"}', responseCode: 503, retryCount: 3 },
  { id: 'wh-005', integrationId: 'discord', event: 'interaction.create', timestamp: '2025-03-04T11:45:00Z', status: 'delivered', payload: '{"type":"slash_command","name":"/status"}', responseCode: 200, retryCount: 0 },
  { id: 'wh-006', integrationId: 'supabase', event: 'db.changes', timestamp: '2025-03-04T11:40:00Z', status: 'retrying', payload: '{"table":"users","operation":"INSERT"}', retryCount: 1 },
  { id: 'wh-007', integrationId: 'cloudflare', event: 'worker.deployed', timestamp: '2025-03-04T11:35:00Z', status: 'delivered', payload: '{"worker":"identity-worker","version":"1.4.2"}', responseCode: 200, retryCount: 0 },
  { id: 'wh-008', integrationId: 'slack', event: 'slash_command', timestamp: '2025-03-04T11:30:00Z', status: 'delivered', payload: '{"command":"/infinity","text":"health"}', responseCode: 200, retryCount: 0 },
  { id: 'wh-009', integrationId: 'github-actions', event: 'check_run.completed', timestamp: '2025-03-04T11:25:00Z', status: 'delivered', payload: '{"check":"security-scan","conclusion":"success"}', responseCode: 200, retryCount: 0 },
  { id: 'wh-010', integrationId: 'grafana', event: 'alert.firing', timestamp: '2025-03-04T11:20:00Z', status: 'pending', payload: '{"alert":"high-latency","value":"450ms"}', retryCount: 0 },
];

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '🌐' },
  { id: 'communication', label: 'Communication', icon: '💬' },
  { id: 'project-management', label: 'Project Management', icon: '📋' },
  { id: 'devops', label: 'DevOps', icon: '⚙️' },
  { id: 'monitoring', label: 'Monitoring', icon: '📊' },
  { id: 'cloud', label: 'Cloud', icon: '☁️' },
  { id: 'database', label: 'Database', icon: '🗄️' },
  { id: 'ai', label: 'AI / ML', icon: '🧠' },
];

const statusColor = (s: Integration['status']) =>
  s === 'connected' ? '#2ea043' : s === 'error' ? '#f85149' : s === 'rate-limited' ? '#d29922' : '#8b949e';

const webhookStatusColor = (s: WebhookEvent['status']) =>
  s === 'delivered' ? '#2ea043' : s === 'failed' ? '#f85149' : s === 'retrying' ? '#d29922' : '#8b949e';

export default function IntegrationsHub() {
  const [tab, setTab] = useState<'catalog' | 'connected' | 'webhooks' | 'credentials'>('catalog');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [oauthFlows, setOauthFlows] = useState<Record<string, OAuthFlow>>({});
  const [webhookFilter, setWebhookFilter] = useState<'all' | 'delivered' | 'failed' | 'pending' | 'retrying'>('all');

  const filtered = INTEGRATIONS.filter(i => {
    if (tab === 'connected' && i.status === 'disconnected') return false;
    if (category !== 'all' && i.category !== category) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredWebhooks = WEBHOOK_EVENTS.filter(w =>
    webhookFilter === 'all' ? true : w.status === webhookFilter
  );

  const connectedCount = INTEGRATIONS.filter(i => i.status !== 'disconnected').length;
  const errorCount = INTEGRATIONS.filter(i => i.status === 'error' || i.status === 'rate-limited').length;
  const totalWebhooks = INTEGRATIONS.reduce((sum, i) => sum + i.webhooksActive, 0);

  const handleConnect = (id: string) => {
    setOauthFlows(prev => ({ ...prev, [id]: { integrationId: id, step: 'authorizing' } }));
    setTimeout(() => {
      setOauthFlows(prev => ({ ...prev, [id]: { ...prev[id], step: 'exchanging' } }));
      setTimeout(() => {
        setOauthFlows(prev => ({ ...prev, [id]: { ...prev[id], step: 'complete' } }));
      }, 1500);
    }, 2000);
  };

  const handleDisconnect = (id: string) => {
    setOauthFlows(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const s: Record<string, React.CSSProperties> = {
    container: { padding: '24px', maxWidth: 1400, margin: '0 auto', fontFamily: 'var(--font-family, "Inter", system-ui, sans-serif)', color: 'var(--text-primary, #e6edf3)' },
    header: { marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
    subtitle: { color: 'var(--text-secondary, #8b949e)', marginTop: 4, fontSize: 14 },
    summaryRow: { display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' as const },
    summaryCard: { flex: '1 1 200px', background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, padding: '16px 20px' },
    summaryLabel: { fontSize: 12, color: 'var(--text-secondary, #8b949e)', textTransform: 'uppercase' as const, letterSpacing: 1 },
    summaryValue: { fontSize: 28, fontWeight: 700, marginTop: 4 },
    tabs: { display: 'flex', gap: 0, borderBottom: '1px solid var(--border-primary, #30363d)', marginBottom: 20 },
    tab: { padding: '10px 20px', cursor: 'pointer', border: 'none', background: 'none', color: 'var(--text-secondary, #8b949e)', fontSize: 14, fontWeight: 500, borderBottom: '2px solid transparent', transition: 'all 0.2s' },
    tabActive: { color: 'var(--accent-primary, #58a6ff)', borderBottomColor: 'var(--accent-primary, #58a6ff)' },
    toolbar: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const, alignItems: 'center' },
    searchInput: { flex: '1 1 250px', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-primary, #30363d)', background: 'var(--surface-secondary, #0d1117)', color: 'var(--text-primary, #e6edf3)', fontSize: 14, outline: 'none' },
    categoryPill: { padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border-primary, #30363d)', background: 'none', color: 'var(--text-secondary, #8b949e)', fontSize: 12, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' as const },
    categoryPillActive: { background: 'var(--accent-primary, #58a6ff)', color: '#fff', borderColor: 'var(--accent-primary, #58a6ff)' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 },
    card: { background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 12, padding: 20, transition: 'border-color 0.2s', cursor: 'pointer' },
    cardHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
    cardIcon: { fontSize: 28, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-secondary, #0d1117)', borderRadius: 10 },
    cardTitle: { fontSize: 16, fontWeight: 600, margin: 0 },
    cardCategory: { fontSize: 11, color: 'var(--text-secondary, #8b949e)', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    statusBadge: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, marginLeft: 'auto' },
    cardDesc: { fontSize: 13, color: 'var(--text-secondary, #8b949e)', lineHeight: 1.5, marginBottom: 14 },
    cardMeta: { display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary, #8b949e)', flexWrap: 'wrap' as const },
    expandedSection: { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-primary, #30363d)' },
    scopeTag: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: 'var(--surface-secondary, #0d1117)', fontSize: 11, marginRight: 6, marginBottom: 4, fontFamily: 'monospace' },
    btn: { padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s' },
    btnPrimary: { background: 'var(--accent-primary, #58a6ff)', color: '#fff' },
    btnDanger: { background: '#f8514922', color: '#f85149', border: '1px solid #f8514944' },
    btnSecondary: { background: 'var(--surface-secondary, #0d1117)', color: 'var(--text-primary, #e6edf3)', border: '1px solid var(--border-primary, #30363d)' },
    rateLimitBar: { height: 4, borderRadius: 2, background: 'var(--surface-secondary, #0d1117)', marginTop: 6, overflow: 'hidden' },
    webhookTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
    th: { textAlign: 'left' as const, padding: '10px 14px', borderBottom: '1px solid var(--border-primary, #30363d)', color: 'var(--text-secondary, #8b949e)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    td: { padding: '10px 14px', borderBottom: '1px solid var(--border-primary, #30363d)' },
    credentialRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, marginBottom: 10 },
    oauthOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    oauthModal: { background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 16, padding: 32, maxWidth: 420, width: '90%', textAlign: 'center' as const },
  };

  const renderOAuthModal = () => {
    const activeFlow = Object.values(oauthFlows).find(f => f.step !== 'idle' && f.step !== 'complete');
    if (!activeFlow) return null;
    const integration = INTEGRATIONS.find(i => i.id === activeFlow.integrationId);
    if (!integration) return null;

    return (
      <div style={s.oauthOverlay} onClick={() => setOauthFlows(prev => {
        const next = { ...prev };
        delete next[activeFlow.integrationId];
        return next;
      })}>
        <div style={s.oauthModal} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{integration.icon}</div>
          <h3 style={{ margin: '0 0 8px' }}>Connecting to {integration.name}</h3>
          <p style={{ color: 'var(--text-secondary, #8b949e)', fontSize: 14, marginBottom: 24 }}>
            {activeFlow.step === 'authorizing' && 'Redirecting to authorization endpoint...'}
            {activeFlow.step === 'exchanging' && 'Exchanging authorization code for tokens...'}
            {activeFlow.step === 'error' && `Error: ${activeFlow.error}`}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
            {(activeFlow.step === 'authorizing' || activeFlow.step === 'exchanging') && (
              <div style={{ width: 20, height: 20, border: '2px solid var(--accent-primary, #58a6ff)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            )}
            <span style={{ fontSize: 13, color: 'var(--text-secondary, #8b949e)' }}>
              {activeFlow.step === 'authorizing' ? 'OAuth2 + PKCE' : activeFlow.step === 'exchanging' ? 'Token Exchange' : ''}
            </span>
          </div>
          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginBottom: 8 }}>Requested Scopes</h4>
            <div>{integration.scopes.map(sc => <span key={sc} style={s.scopeTag}>{sc}</span>)}</div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary, #8b949e)', marginTop: 16 }}>
            🔐 Credentials stored in HashiCorp Vault · Encrypted at rest · Auto-rotated
          </p>
        </div>
      </div>
    );
  };

  const renderCatalog = () => (
    <>
      <div style={s.toolbar}>
        <input
          style={s.searchInput}
          placeholder="Search integrations..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search integrations"
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              style={{ ...s.categoryPill, ...(category === c.id ? s.categoryPillActive : {}) }}
              onClick={() => setCategory(c.id)}
              aria-pressed={category === c.id}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>
      <div style={s.grid}>
        {filtered.map(integration => {
          const expanded = expandedId === integration.id;
          const flow = oauthFlows[integration.id];
          const ratePct = integration.rateLimitRemaining && integration.rateLimitTotal
            ? (integration.rateLimitRemaining / integration.rateLimitTotal) * 100 : null;

          return (
            <div
              key={integration.id}
              style={{ ...s.card, borderColor: expanded ? 'var(--accent-primary, #58a6ff)' : undefined }}
              onClick={() => setExpandedId(expanded ? null : integration.id)}
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
            >
              <div style={s.cardHeader}>
                <div style={s.cardIcon}>{integration.icon}</div>
                <div>
                  <h3 style={s.cardTitle}>{integration.name}</h3>
                  <span style={s.cardCategory}>{integration.category.replace('-', ' ')}</span>
                </div>
                <span style={{
                  ...s.statusBadge,
                  background: statusColor(integration.status) + '18',
                  color: statusColor(integration.status),
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(integration.status) }} />
                  {integration.status}
                </span>
              </div>

              <p style={s.cardDesc}>{integration.description}</p>

              <div style={s.cardMeta}>
                <span>v{integration.version}</span>
                {integration.webhooksActive > 0 && <span>🔗 {integration.webhooksActive} webhooks</span>}
                {integration.lastSync && <span>🔄 {new Date(integration.lastSync).toLocaleTimeString()}</span>}
                {ratePct !== null && (
                  <span style={{ color: ratePct < 20 ? '#f85149' : ratePct < 50 ? '#d29922' : '#2ea043' }}>
                    ⚡ {integration.rateLimitRemaining}/{integration.rateLimitTotal} req
                  </span>
                )}
              </div>

              {ratePct !== null && (
                <div style={s.rateLimitBar}>
                  <div style={{
                    height: '100%', borderRadius: 2, width: `${ratePct}%`,
                    background: ratePct < 20 ? '#f85149' : ratePct < 50 ? '#d29922' : '#2ea043',
                    transition: 'width 0.3s'
                  }} />
                </div>
              )}

              {expanded && (
                <div style={s.expandedSection}>
                  <div style={{ marginBottom: 14 }}>
                    <h4 style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>OAuth2 Scopes</h4>
                    <div>{integration.scopes.map(sc => <span key={sc} style={s.scopeTag}>{sc}</span>)}</div>
                  </div>

                  {integration.connectedAt && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginBottom: 14 }}>
                      Connected since {new Date(integration.connectedAt).toLocaleDateString()} · Last sync {integration.lastSync ? new Date(integration.lastSync).toLocaleString() : 'never'}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }} onClick={e => e.stopPropagation()}>
                    {integration.status === 'disconnected' ? (
                      <button
                        style={{ ...s.btn, ...s.btnPrimary }}
                        onClick={() => handleConnect(integration.id)}
                        disabled={flow?.step === 'authorizing' || flow?.step === 'exchanging'}
                      >
                        {flow?.step === 'complete' ? '✓ Connected' : flow ? 'Connecting...' : '🔌 Connect'}
                      </button>
                    ) : (
                      <>
                        <button style={{ ...s.btn, ...s.btnSecondary }}>🔄 Re-sync</button>
                        <button style={{ ...s.btn, ...s.btnSecondary }}>⚙️ Configure</button>
                        <button
                          style={{ ...s.btn, ...s.btnDanger }}
                          onClick={() => handleDisconnect(integration.id)}
                        >
                          Disconnect
                        </button>
                      </>
                    )}
                    <a
                      href={integration.docs}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...s.btn, ...s.btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                      onClick={e => e.stopPropagation()}
                    >
                      📖 Docs
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary, #8b949e)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <p>No integrations found matching your criteria.</p>
        </div>
      )}
    </>
  );

  const renderWebhooks = () => (
    <>
      <div style={{ ...s.toolbar, marginBottom: 16 }}>
        {(['all', 'delivered', 'failed', 'pending', 'retrying'] as const).map(f => (
          <button
            key={f}
            style={{ ...s.categoryPill, ...(webhookFilter === f ? s.categoryPillActive : {}) }}
            onClick={() => setWebhookFilter(f)}
          >
            {f === 'all' ? '🌐 All' : f === 'delivered' ? '✅ Delivered' : f === 'failed' ? '❌ Failed' : f === 'pending' ? '⏳ Pending' : '🔄 Retrying'}
          </button>
        ))}
      </div>
      <div style={{ background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={s.webhookTable}>
          <thead>
            <tr>
              <th style={s.th}>Integration</th>
              <th style={s.th}>Event</th>
              <th style={s.th}>Timestamp</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Response</th>
              <th style={s.th}>Retries</th>
              <th style={s.th}>Payload</th>
            </tr>
          </thead>
          <tbody>
            {filteredWebhooks.map(wh => {
              const integration = INTEGRATIONS.find(i => i.id === wh.integrationId);
              return (
                <tr key={wh.id}>
                  <td style={s.td}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{integration?.icon}</span>
                      <span>{integration?.name}</span>
                    </span>
                  </td>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{wh.event}</td>
                  <td style={{ ...s.td, fontSize: 12, color: 'var(--text-secondary, #8b949e)' }}>
                    {new Date(wh.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={s.td}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: webhookStatusColor(wh.status) + '18',
                      color: webhookStatusColor(wh.status),
                    }}>
                      {wh.status}
                    </span>
                  </td>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>
                    {wh.responseCode ? (
                      <span style={{ color: wh.responseCode < 400 ? '#2ea043' : '#f85149' }}>{wh.responseCode}</span>
                    ) : '—'}
                  </td>
                  <td style={{ ...s.td, textAlign: 'center' }}>
                    {wh.retryCount > 0 ? (
                      <span style={{ color: '#d29922' }}>{wh.retryCount}</span>
                    ) : '—'}
                  </td>
                  <td style={{ ...s.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary, #8b949e)' }}>
                    {wh.payload}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );

  const renderCredentials = () => {
    const connected = INTEGRATIONS.filter(i => i.status !== 'disconnected');
    return (
      <div>
        <div style={{ background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>🔐 Credential Vault</h3>
          <p style={{ color: 'var(--text-secondary, #8b949e)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
            All integration credentials are stored in HashiCorp Vault with AES-256-GCM encryption at rest.
            OAuth2 tokens are automatically rotated before expiry. Revocation triggers crypto-shredding
            per GDPR Article 17 compliance. Access is gated through the Rust/WASM Policy Engine.
          </p>
        </div>

        {connected.map(integration => (
          <div key={integration.id} style={s.credentialRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>{integration.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{integration.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)' }}>
                  {integration.scopes.length} scopes · Connected {integration.connectedAt ? new Date(integration.connectedAt).toLocaleDateString() : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary, #8b949e)', fontFamily: 'monospace' }}>
                vault:secret/integrations/{integration.id}
              </span>
              <span style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: '#2ea04318', color: '#2ea043'
              }}>
                🔒 Encrypted
              </span>
              <button style={{ ...s.btn, ...s.btnSecondary, padding: '5px 12px', fontSize: 12 }}>
                🔄 Rotate
              </button>
              <button style={{ ...s.btn, ...s.btnDanger, padding: '5px 12px', fontSize: 12 }}>
                🗑️ Revoke
              </button>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 24, background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 12, padding: 20 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Vault Security Policies</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {[
              { label: 'Token Auto-Rotation', value: 'Every 24h', status: '✅' },
              { label: 'Encryption Algorithm', value: 'AES-256-GCM', status: '✅' },
              { label: 'Access Audit Logging', value: 'Enabled', status: '✅' },
              { label: 'Crypto-Shredding (GDPR)', value: 'Active', status: '✅' },
              { label: 'Policy Engine Gate', value: 'Rust/WASM', status: '✅' },
              { label: 'Backup Encryption', value: 'Sealed', status: '✅' },
            ].map(p => (
              <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-primary, #30363d)' }}>
                <span style={{ fontSize: 13 }}>{p.label}</span>
                <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{p.status} {p.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={s.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      {renderOAuthModal()}

      <div style={s.header}>
        <h1 style={s.title}>🔌 Integrations Hub</h1>
        <p style={s.subtitle}>Connect, manage, and monitor external service integrations with OAuth2 PKCE security</p>
      </div>

      <div style={s.summaryRow}>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>Total Integrations</div>
          <div style={s.summaryValue}>{INTEGRATIONS.length}</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>Connected</div>
          <div style={{ ...s.summaryValue, color: '#2ea043' }}>{connectedCount}</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>Issues</div>
          <div style={{ ...s.summaryValue, color: errorCount > 0 ? '#f85149' : '#2ea043' }}>{errorCount}</div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.summaryLabel}>Active Webhooks</div>
          <div style={s.summaryValue}>{totalWebhooks}</div>
        </div>
      </div>

      <div style={s.tabs} role="tablist">
        {([
          { id: 'catalog', label: '🌐 Catalog', count: INTEGRATIONS.length },
          { id: 'connected', label: '🔗 Connected', count: connectedCount },
          { id: 'webhooks', label: '🔔 Webhooks', count: WEBHOOK_EVENTS.length },
          { id: 'credentials', label: '🔐 Credentials', count: connectedCount },
        ] as const).map(t => (
          <button
            key={t.id}
            style={{ ...s.tab, ...(tab === t.id ? s.tabActive : {}) }}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {(tab === 'catalog' || tab === 'connected') && renderCatalog()}
      {tab === 'webhooks' && renderWebhooks()}
      {tab === 'credentials' && renderCredentials()}
    </div>
  );
}