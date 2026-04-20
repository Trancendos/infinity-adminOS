import React, { useState } from 'react';

type AgentType = 'task' | 'monitor' | 'trading' | 'content' | 'support' | 'research';
type AgentStatus = 'active' | 'paused' | 'draft' | 'error';

interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  description: string;
  directives: string[];
  capabilities: string[];
  earnings: number;
  tasksCompleted: number;
  uptime: number;
  createdAt: string;
  lastActive: string;
}

const AGENTS: Agent[] = [
  { id: 'agent-001', name: 'Content Writer Alpha', type: 'content', status: 'active', description: 'Generates SEO-optimized blog posts and social media content', directives: ['Write engaging content', 'Optimize for SEO', 'Maintain brand voice', 'Include CTAs'], capabilities: ['text-generation', 'seo-analysis', 'social-media'], earnings: 127.50, tasksCompleted: 342, uptime: 99.2, createdAt: '2024-01-15', lastActive: '2 min ago' },
  { id: 'agent-002', name: 'Market Analyst', type: 'trading', status: 'active', description: 'Monitors market trends and generates trading signals', directives: ['Analyze market data', 'Generate buy/sell signals', 'Risk assessment', 'Daily reports'], capabilities: ['data-analysis', 'market-data', 'report-generation'], earnings: 89.30, tasksCompleted: 156, uptime: 98.8, createdAt: '2024-02-01', lastActive: '5 min ago' },
  { id: 'agent-003', name: 'Support Bot', type: 'support', status: 'active', description: 'Handles customer inquiries and routes complex issues', directives: ['Respond within 30s', 'Escalate complex issues', 'Maintain knowledge base', 'Track satisfaction'], capabilities: ['text-generation', 'classification', 'knowledge-base'], earnings: 45.00, tasksCompleted: 1247, uptime: 99.9, createdAt: '2024-01-20', lastActive: '1 min ago' },
  { id: 'agent-004', name: 'Data Scraper', type: 'research', status: 'paused', description: 'Collects and structures data from public sources', directives: ['Respect robots.txt', 'Rate limit requests', 'Structure data as JSON', 'Deduplicate entries'], capabilities: ['web-scraping', 'data-processing', 'storage'], earnings: 23.10, tasksCompleted: 89, uptime: 95.5, createdAt: '2024-02-10', lastActive: '2 hours ago' },
  { id: 'agent-005', name: 'Infra Monitor', type: 'monitor', status: 'active', description: 'Monitors infrastructure health and triggers self-healing', directives: ['Check every 30s', 'Alert on anomalies', 'Auto-restart failed services', 'Log all events'], capabilities: ['monitoring', 'alerting', 'self-healing'], earnings: 0, tasksCompleted: 5678, uptime: 99.99, createdAt: '2024-01-10', lastActive: 'now' },
  { id: 'agent-006', name: 'Newsletter Bot', type: 'content', status: 'draft', description: 'Curates and sends weekly newsletter digests', directives: ['Curate top stories', 'Personalize per subscriber', 'A/B test subjects', 'Track open rates'], capabilities: ['text-generation', 'email', 'analytics'], earnings: 0, tasksCompleted: 0, uptime: 0, createdAt: '2024-03-01', lastActive: 'never' },
];

const typeIcon = (type: AgentType) => {
  const icons: Record<AgentType, string> = { task: '⚡', monitor: '👁️', trading: '📈', content: '✍️', support: '🎧', research: '🔬' };
  return icons[type];
};

const statusBadge = (status: AgentStatus) => {
  const config: Record<AgentStatus, { bg: string; color: string; label: string }> = {
    active: { bg: 'rgba(34,197,94,0.15)', color: 'var(--color-success)', label: '● Active' },
    paused: { bg: 'rgba(234,179,8,0.15)', color: 'var(--color-warning)', label: '⏸ Paused' },
    draft: { bg: 'rgba(148,163,184,0.15)', color: 'var(--color-text-secondary)', label: '○ Draft' },
    error: { bg: 'rgba(239,68,68,0.15)', color: 'var(--color-error)', label: '✗ Error' },
  };
  const c = config[status];
  return <span style={{ padding: '0.125rem 0.625rem', borderRadius: '1rem', background: c.bg, color: c.color, fontSize: '0.6875rem', fontWeight: 600 }}>{c.label}</span>;
};

export default function AgentFactory() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', type: 'task' as AgentType, description: '', directives: '' });

  const totalEarnings = AGENTS.reduce((sum, a) => sum + a.earnings, 0);
  const activeAgents = AGENTS.filter(a => a.status === 'active').length;
  const selected = AGENTS.find(a => a.id === selectedAgent);

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>🤖 Agent Factory</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Create, manage, and deploy autonomous AI agents
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
          + New Agent
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Agents', value: AGENTS.length.toString(), icon: '🤖' },
          { label: 'Active', value: activeAgents.toString(), icon: '🟢' },
          { label: 'Total Earnings', value: `$${totalEarnings.toFixed(2)}`, icon: '💰' },
          { label: 'Tasks Completed', value: AGENTS.reduce((s, a) => s + a.tasksCompleted, 0).toLocaleString(), icon: '✅' },
        ].map(card => (
          <div key={card.label} style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem' }}>{card.icon}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{card.value}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Create Agent Form */}
      {showCreate && (
        <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '2px solid var(--color-primary)', background: 'var(--color-bg)', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>🆕 Create New Agent</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Agent Name</label>
              <input value={newAgent.name} onChange={e => setNewAgent({ ...newAgent, name: e.target.value })} placeholder="My Agent" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.875rem' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Type</label>
              <select value={newAgent.type} onChange={e => setNewAgent({ ...newAgent, type: e.target.value as AgentType })} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.875rem' }}>
                <option value="task">⚡ Task Automation</option>
                <option value="monitor">👁️ Monitoring</option>
                <option value="trading">📈 Trading/Analysis</option>
                <option value="content">✍️ Content Generation</option>
                <option value="support">🎧 Customer Support</option>
                <option value="research">🔬 Research</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Description</label>
              <input value={newAgent.description} onChange={e => setNewAgent({ ...newAgent, description: e.target.value })} placeholder="What does this agent do?" style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.875rem' }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Directives (one per line)</label>
              <textarea value={newAgent.directives} onChange={e => setNewAgent({ ...newAgent, directives: e.target.value })} placeholder="Follow these instructions..." rows={3} style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.875rem', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)} style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
            <button style={{ padding: '0.5rem 1.5rem', borderRadius: '0.375rem', border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>Create Agent</button>
          </div>
        </div>
      )}

      {/* Agent List */}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {AGENTS.map(agent => (
          <div
            key={agent.id}
            onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
            style={{ borderRadius: '0.75rem', border: `1px solid ${selectedAgent === agent.id ? 'var(--color-primary)' : 'var(--color-border)'}`, background: 'var(--color-bg)', overflow: 'hidden', cursor: 'pointer' }}
          >
            <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{typeIcon(agent.type)}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{agent.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{agent.description}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {agent.earnings > 0 && <span style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: '0.875rem' }}>${agent.earnings.toFixed(2)}</span>}
                {statusBadge(agent.status)}
              </div>
            </div>

            {selectedAgent === agent.id && (
              <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Directives</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem' }}>
                    {agent.directives.map((d, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{d}</li>)}
                  </ul>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Capabilities</h4>
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                    {agent.capabilities.map(c => (
                      <span key={c} style={{ padding: '0.125rem 0.5rem', borderRadius: '1rem', background: 'var(--color-surface)', fontSize: '0.6875rem' }}>{c}</span>
                    ))}
                  </div>
                  <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
                    <div><span style={{ color: 'var(--color-text-secondary)' }}>Tasks:</span> {agent.tasksCompleted.toLocaleString()}</div>
                    <div><span style={{ color: 'var(--color-text-secondary)' }}>Uptime:</span> {agent.uptime}%</div>
                    <div><span style={{ color: 'var(--color-text-secondary)' }}>Created:</span> {agent.createdAt}</div>
                    <div><span style={{ color: 'var(--color-text-secondary)' }}>Last Active:</span> {agent.lastActive}</div>
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                  {agent.status === 'active' && <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-warning)', background: 'transparent', color: 'var(--color-warning)', cursor: 'pointer', fontSize: '0.75rem' }}>⏸ Pause</button>}
                  {agent.status === 'paused' && <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-success)', background: 'transparent', color: 'var(--color-success)', cursor: 'pointer', fontSize: '0.75rem' }}>▶ Resume</button>}
                  {agent.status === 'draft' && <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>🚀 Deploy</button>}
                  <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.75rem' }}>✏️ Edit</button>
                  <button style={{ padding: '0.375rem 1rem', borderRadius: '0.375rem', border: '1px solid var(--color-error)', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️ Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}