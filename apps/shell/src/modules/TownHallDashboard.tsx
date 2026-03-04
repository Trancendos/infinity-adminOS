/**
 * TownHallDashboard — Governance Hub (Platform 21)
 * The central governance hub for the entire Infinity OS / Arcadia ecosystem
 *
 * 11 Components:
 * 1. Policy Hub          6. PRINCE2 Management
 * 2. Procedures Library  7. Governance Boardroom
 * 3. The Foundation      8. Gate Review System
 * 4. Trancendos Framework 9. IP Analysis & Review
 * 5. ITSM & ITIL         10. Legal & Paralegal
 *                        11. Compliance Engine
 *
 * Zero-Cost | 2060 Standard | Quantum-Safe | On-Chain Audit
 */
import React, { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardStats {
  policies: { total: number; active: number; pending_review: number };
  procedures: { total: number };
  boardroom: { upcoming_meetings: number; recent_resolutions: Resolution[] };
  ip_registry: { total: number };
  legal: { active_contracts: number; expiring_soon: number };
  compliance: { frameworks_tracked: number; zero_cost_certified: boolean; quantum_safe: boolean };
}

interface Policy {
  id: string; policy_id: string; title: string; category: string;
  version: string; status: string; has_rego: boolean; tags: string[];
  created_at: string;
}

interface Procedure {
  id: string; procedure_id: string; title: string; category: string;
  version: string; status: string; created_at: string;
}

interface Meeting {
  id: string; title: string; meeting_type: string; scheduled_at: string;
  status: string; location: string; quorum_met: boolean; has_minutes: boolean;
}

interface Resolution {
  id: string; resolution_number: string; title: string; status: string;
  votes_for: number; votes_against: number; votes_abstain: number;
  total_votes: number; created_at: string;
}

interface IPRecord {
  id: string; title: string; ip_type: string; classification: string;
  status: string; creators: string[]; related_platforms: string[];
  created_at: string;
}

interface Contract {
  id: string; title: string; contract_type: string; status: string;
  parties: { name: string; role: string }[]; effective_date: string | null;
  expiry_date: string | null; has_ai_analysis: boolean; created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'policies' | 'procedures' | 'foundation' | 'boardroom' | 'ip' | 'legal';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview',    label: 'Overview',    icon: '🏛️' },
  { id: 'policies',    label: 'Policies',    icon: '📋' },
  { id: 'procedures',  label: 'Procedures',  icon: '📖' },
  { id: 'foundation',  label: 'Foundation',  icon: '⚖️' },
  { id: 'boardroom',   label: 'Boardroom',   icon: '🎭' },
  { id: 'ip',          label: 'IP Registry', icon: '💡' },
  { id: 'legal',       label: 'Legal',       icon: '⚖️' },
];

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', draft: '#f59e0b', review: '#3b82f6',
  approved: '#8b5cf6', deprecated: '#6b7280', archived: '#374151',
  passed: '#22c55e', failed: '#ef4444', open: '#f59e0b',
  scheduled: '#3b82f6', completed: '#22c55e', cancelled: '#6b7280',
};

const POLICY_CATEGORY_ICONS: Record<string, string> = {
  financial: '💰', ai_governance: '🤖', security: '🔒',
  project_management: '📊', itsm: '🎫', legal_regulatory: '⚖️',
  legal: '📜', operational: '⚙️', hr: '👥', environmental: '🌱',
};

const IP_TYPE_ICONS: Record<string, string> = {
  software: '💻', algorithm: '🧮', brand: '™️', trade_secret: '🔐',
  patent: '📄', copyright: '©️', trademark: '™️',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const s = (css: React.CSSProperties) => css;
const token = () => localStorage.getItem('infinity_access_token') || localStorage.getItem('token') || '';
const headers = () => ({ 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' });

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={s({
      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
      background: (STATUS_COLORS[status] || '#6b7280') + '22',
      color: STATUS_COLORS[status] || '#6b7280',
      border: `1px solid ${STATUS_COLORS[status] || '#6b7280'}44`,
      textTransform: 'capitalize',
    })}>
      {status}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TownHallDashboard() {
  const [tab, setTab] = useState<TabId>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [ipRecords, setIPRecords] = useState<IPRecord[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Create modals
  const [showCreatePolicy, setShowCreatePolicy] = useState(false);
  const [showCreateMeeting, setShowCreateMeeting] = useState(false);
  const [showCreateIP, setShowCreateIP] = useState(false);
  const [showCreateContract, setShowCreateContract] = useState(false);

  // Form state
  const [newPolicy, setNewPolicy] = useState({ title: '', policy_id: '', category: 'security', content: '' });
  const [newMeeting, setNewMeeting] = useState({ title: '', meeting_type: 'board', scheduled_at: '' });
  const [newIP, setNewIP] = useState({ title: '', ip_type: 'software', description: '', classification: 'INTERNAL' });
  const [newContract, setNewContract] = useState({ title: '', contract_type: 'nda', description: '' });

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/townhall/dashboard`, { headers: headers() });
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  const fetchPolicies = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const r = await fetch(`${API}/api/v1/townhall/policies?${params}`, { headers: headers() });
      if (r.ok) { const d = await r.json(); setPolicies(d.items || []); }
    } catch {}
  }, [search]);

  const fetchProcedures = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/townhall/procedures`, { headers: headers() });
      if (r.ok) { const d = await r.json(); setProcedures(d.items || []); }
    } catch {}
  }, []);

  const fetchMeetings = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/townhall/boardroom/meetings`, { headers: headers() });
      if (r.ok) { const d = await r.json(); setMeetings(d.items || []); }
    } catch {}
  }, []);

  const fetchIPRecords = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/townhall/ip`, { headers: headers() });
      if (r.ok) { const d = await r.json(); setIPRecords(d.items || []); }
    } catch {}
  }, []);

  const fetchContracts = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/townhall/legal/contracts`, { headers: headers() });
      if (r.ok) { const d = await r.json(); setContracts(d.items || []); }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (tab === 'policies') fetchPolicies();
    if (tab === 'procedures') fetchProcedures();
    if (tab === 'boardroom') fetchMeetings();
    if (tab === 'ip') fetchIPRecords();
    if (tab === 'legal') fetchContracts();
  }, [tab, fetchPolicies, fetchProcedures, fetchMeetings, fetchIPRecords, fetchContracts]);

  const createPolicy = async () => {
    if (!newPolicy.title || !newPolicy.policy_id) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/v1/townhall/policies`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...newPolicy }),
      });
      setShowCreatePolicy(false);
      setNewPolicy({ title: '', policy_id: '', category: 'security', content: '' });
      fetchPolicies(); fetchStats();
    } catch {} finally { setLoading(false); }
  };

  const createMeeting = async () => {
    if (!newMeeting.title || !newMeeting.scheduled_at) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/v1/townhall/boardroom/meetings`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...newMeeting, scheduled_at: new Date(newMeeting.scheduled_at).toISOString() }),
      });
      setShowCreateMeeting(false);
      setNewMeeting({ title: '', meeting_type: 'board', scheduled_at: '' });
      fetchMeetings(); fetchStats();
    } catch {} finally { setLoading(false); }
  };

  const createIPRecord = async () => {
    if (!newIP.title || !newIP.description) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/v1/townhall/ip`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...newIP }),
      });
      setShowCreateIP(false);
      setNewIP({ title: '', ip_type: 'software', description: '', classification: 'INTERNAL' });
      fetchIPRecords(); fetchStats();
    } catch {} finally { setLoading(false); }
  };

  const createContract = async () => {
    if (!newContract.title) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/v1/townhall/legal/contracts`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...newContract, parties: [] }),
      });
      setShowCreateContract(false);
      setNewContract({ title: '', contract_type: 'nda', description: '' });
      fetchContracts(); fetchStats();
    } catch {} finally { setLoading(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={s({ height: '100%', background: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' })}>

      {/* Header */}
      <div style={s({ padding: '12px 16px', borderBottom: '1px solid #1e293b', flexShrink: 0, background: '#0f172a' })}>
        <div style={s({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' })}>
          <span style={s({ fontSize: '20px' })}>🏛️</span>
          <div>
            <div style={s({ fontSize: '15px', fontWeight: 700, color: '#f1f5f9' })}>The TownHall</div>
            <div style={s({ fontSize: '11px', color: '#64748b' })}>Governance Hub — Platform 21 | Zero-Cost | 2060 Standard | Quantum-Safe</div>
          </div>
          <div style={s({ marginLeft: 'auto', display: 'flex', gap: '6px' })}>
            <span style={s({ padding: '3px 8px', background: '#22c55e22', color: '#22c55e', borderRadius: '12px', fontSize: '10px', fontWeight: 600, border: '1px solid #22c55e44' })}>✅ $0/year</span>
            <span style={s({ padding: '3px 8px', background: '#8b5cf622', color: '#8b5cf6', borderRadius: '12px', fontSize: '10px', fontWeight: 600, border: '1px solid #8b5cf644' })}>🔐 Quantum-Safe</span>
            <span style={s({ padding: '3px 8px', background: '#3b82f622', color: '#3b82f6', borderRadius: '12px', fontSize: '10px', fontWeight: 600, border: '1px solid #3b82f644' })}>⛓️ On-Chain</span>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={s({ display: 'flex', gap: '2px', overflowX: 'auto' })}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={s({
              padding: '6px 12px', border: 'none', background: tab === t.id ? '#1e293b' : 'none',
              cursor: 'pointer', color: tab === t.id ? '#818cf8' : '#64748b',
              fontWeight: tab === t.id ? 700 : 400, borderRadius: '6px',
              fontSize: '12px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px',
            })}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={s({ flex: 1, overflow: 'auto', padding: '12px' })}>

        {/* ── Overview Tab ── */}
        {tab === 'overview' && (
          <div>
            {/* Stats Grid */}
            <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' })}>
              {[
                { label: 'Active Policies', value: stats?.policies.active ?? '—', icon: '📋', color: '#818cf8' },
                { label: 'Procedures', value: stats?.procedures.total ?? '—', icon: '📖', color: '#22c55e' },
                { label: 'Upcoming Meetings', value: stats?.boardroom.upcoming_meetings ?? '—', icon: '🎭', color: '#f59e0b' },
                { label: 'IP Assets', value: stats?.ip_registry.total ?? '—', icon: '💡', color: '#8b5cf6' },
                { label: 'Active Contracts', value: stats?.legal.active_contracts ?? '—', icon: '⚖️', color: '#3b82f6' },
                { label: 'Frameworks', value: stats?.compliance.frameworks_tracked ?? 9, icon: '✅', color: '#22c55e' },
              ].map(card => (
                <div key={card.label} style={s({ background: '#1e293b', borderRadius: '10px', padding: '12px', border: '1px solid #334155' })}>
                  <div style={s({ fontSize: '20px', marginBottom: '6px' })}>{card.icon}</div>
                  <div style={s({ fontSize: '22px', fontWeight: 700, color: card.color })}>{card.value}</div>
                  <div style={s({ fontSize: '11px', color: '#64748b', marginTop: '2px' })}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* 11 Components Grid */}
            <div style={s({ marginBottom: '16px' })}>
              <div style={s({ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '10px' })}>11 GOVERNANCE COMPONENTS</div>
              <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' })}>
                {[
                  { n: 1, title: 'Policy Hub', desc: 'Version-controlled, machine-readable policies', icon: '📋', tab: 'policies' as TabId, status: 'active' },
                  { n: 2, title: 'Procedures Library', desc: 'Step-by-step operational procedures', icon: '📖', tab: 'procedures' as TabId, status: 'active' },
                  { n: 3, title: 'The Foundation', desc: 'Magna Carta + Service Charter templates', icon: '⚖️', tab: 'foundation' as TabId, status: 'active' },
                  { n: 4, title: 'Trancendos Framework', desc: 'Core operating framework for all platforms', icon: '🌐', tab: 'foundation' as TabId, status: 'active' },
                  { n: 5, title: 'ITSM & ITIL', desc: 'Incident, change, problem management', icon: '🎫', tab: 'overview' as TabId, status: 'active', external: 'com.infinity-os.itsm' },
                  { n: 6, title: 'PRINCE2 Management', desc: 'Project governance, stage gates', icon: '📊', tab: 'overview' as TabId, status: 'active', external: 'com.infinity-os.gates' },
                  { n: 7, title: 'Governance Boardroom', desc: 'Board meetings, decisions, resolutions', icon: '🎭', tab: 'boardroom' as TabId, status: 'active' },
                  { n: 8, title: 'Gate Review System', desc: 'Quality gates across all 21 platforms', icon: '🚦', tab: 'overview' as TabId, status: 'active', external: 'com.infinity-os.gates' },
                  { n: 9, title: 'IP Analysis & Review', desc: 'Intellectual property management', icon: '💡', tab: 'ip' as TabId, status: 'active' },
                  { n: 10, title: 'Legal & Paralegal', desc: 'Contract management, legal documents', icon: '📜', tab: 'legal' as TabId, status: 'active' },
                  { n: 11, title: 'Compliance Engine', desc: 'Automated compliance checking', icon: '✅', tab: 'overview' as TabId, status: 'active', external: 'com.infinity-os.compliance' },
                ].map(comp => (
                  <div
                    key={comp.n}
                    onClick={() => setTab(comp.tab)}
                    style={s({
                      background: '#1e293b', borderRadius: '8px', padding: '10px',
                      border: '1px solid #334155', cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    })}
                  >
                    <div style={s({ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' })}>
                      <span style={s({ fontSize: '16px' })}>{comp.icon}</span>
                      <span style={s({ fontSize: '11px', color: '#64748b' })}>#{comp.n}</span>
                      <StatusBadge status={comp.status} />
                    </div>
                    <div style={s({ fontSize: '12px', fontWeight: 600, color: '#f1f5f9', marginBottom: '2px' })}>{comp.title}</div>
                    <div style={s({ fontSize: '11px', color: '#64748b' })}>{comp.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Resolutions */}
            {stats?.boardroom.recent_resolutions && stats.boardroom.recent_resolutions.length > 0 && (
              <div>
                <div style={s({ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' })}>RECENT RESOLUTIONS</div>
                {stats.boardroom.recent_resolutions.map(r => (
                  <div key={r.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '10px', marginBottom: '6px', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '10px' })}>
                    <span style={s({ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' })}>{r.resolution_number}</span>
                    <span style={s({ flex: 1, fontSize: '12px', color: '#e2e8f0' })}>{r.title}</span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}

            {/* Zero-Cost & 2060 Badges */}
            <div style={s({ marginTop: '16px', background: '#1e293b', borderRadius: '10px', padding: '12px', border: '1px solid #334155' })}>
              <div style={s({ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' })}>2060 STANDARD COMPLIANCE</div>
              <div style={s({ display: 'flex', flexWrap: 'wrap', gap: '6px' })}>
                {[
                  '✅ Zero-Cost Mandate ($0/year)',
                  '🔐 ML-DSA-65 Quantum-Safe Signing',
                  '⛓️ IPFS + Arbitrum L2 On-Chain Audit',
                  '🤖 AI-Assisted Legal Analysis (Groq)',
                  '📋 OPA/Rego Policy-as-Code',
                  '🌐 WebRTC Governance Boardroom',
                  '🏛️ DAO Governance Integration',
                  '📊 ITIL 4 + PRINCE2 7',
                  '⚖️ EU AI Act + GDPR Compliant',
                  '🔒 ISO/IEC 42001 AI Management',
                ].map(badge => (
                  <span key={badge} style={s({ padding: '4px 10px', background: '#0f172a', borderRadius: '12px', fontSize: '11px', color: '#94a3b8', border: '1px solid #334155' })}>
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Policies Tab ── */}
        {tab === 'policies' && (
          <div>
            <div style={s({ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' })}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchPolicies()}
                placeholder="Search policies..."
                style={s({ flex: 1, padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '13px' })}
              />
              <button onClick={fetchPolicies} style={s({ padding: '8px 14px', background: '#334155', border: 'none', borderRadius: '8px', color: '#e2e8f0', cursor: 'pointer', fontSize: '12px' })}>Search</button>
              <button onClick={() => setShowCreatePolicy(true)} style={s({ padding: '8px 14px', background: '#818cf8', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 })}>+ New Policy</button>
            </div>

            {policies.length === 0 ? (
              <EmptyState icon="📋" title="No policies yet" desc="Create your first governance policy" />
            ) : (
              <div style={s({ display: 'flex', flexDirection: 'column', gap: '6px' })}>
                {policies.map(p => (
                  <div key={p.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', border: '1px solid #334155' })}>
                    <div style={s({ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' })}>
                      <span style={s({ fontSize: '16px' })}>{POLICY_CATEGORY_ICONS[p.category] || '📋'}</span>
                      <span style={s({ fontFamily: 'monospace', fontSize: '11px', color: '#818cf8', fontWeight: 600 })}>{p.policy_id}</span>
                      <span style={s({ flex: 1, fontSize: '13px', fontWeight: 600, color: '#f1f5f9' })}>{p.title}</span>
                      <StatusBadge status={p.status} />
                      <span style={s({ fontSize: '11px', color: '#64748b' })}>v{p.version}</span>
                    </div>
                    <div style={s({ display: 'flex', gap: '6px', flexWrap: 'wrap' })}>
                      <span style={s({ fontSize: '11px', color: '#64748b', textTransform: 'capitalize' })}>{p.category.replace('_', ' ')}</span>
                      {p.has_rego && <span style={s({ padding: '1px 6px', background: '#22c55e22', color: '#22c55e', borderRadius: '8px', fontSize: '10px' })}>⚙️ Rego</span>}
                      {p.tags.map(t => <span key={t} style={s({ padding: '1px 6px', background: '#334155', color: '#94a3b8', borderRadius: '8px', fontSize: '10px' })}>{t}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create Policy Modal */}
            {showCreatePolicy && (
              <Modal title="New Governance Policy" onClose={() => setShowCreatePolicy(false)}>
                <FormField label="Policy ID (e.g. POL-011)">
                  <input value={newPolicy.policy_id} onChange={e => setNewPolicy(p => ({ ...p, policy_id: e.target.value }))}
                    placeholder="POL-011" style={inputStyle} />
                </FormField>
                <FormField label="Title">
                  <input value={newPolicy.title} onChange={e => setNewPolicy(p => ({ ...p, title: e.target.value }))}
                    placeholder="Policy title" style={inputStyle} />
                </FormField>
                <FormField label="Category">
                  <select value={newPolicy.category} onChange={e => setNewPolicy(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                    {['financial', 'ai_governance', 'security', 'project_management', 'itsm', 'legal_regulatory', 'legal', 'operational'].map(c => (
                      <option key={c} value={c}>{c.replace('_', ' ')}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Content (Markdown)">
                  <textarea value={newPolicy.content} onChange={e => setNewPolicy(p => ({ ...p, content: e.target.value }))}
                    placeholder="# Policy Title&#10;&#10;## Purpose&#10;..." rows={6} style={{ ...inputStyle, resize: 'vertical' }} />
                </FormField>
                <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' })}>
                  <button onClick={() => setShowCreatePolicy(false)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={createPolicy} disabled={loading} style={primaryBtnStyle}>
                    {loading ? 'Creating...' : 'Create Policy'}
                  </button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ── Procedures Tab ── */}
        {tab === 'procedures' && (
          <div>
            <div style={s({ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' })}>
              <button onClick={() => {}} style={s({ padding: '8px 14px', background: '#818cf8', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 })}>+ New Procedure</button>
            </div>
            {procedures.length === 0 ? (
              <EmptyState icon="📖" title="No procedures yet" desc="Create your first operational procedure" />
            ) : (
              <div style={s({ display: 'flex', flexDirection: 'column', gap: '6px' })}>
                {procedures.map(p => (
                  <div key={p.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', border: '1px solid #334155' })}>
                    <div style={s({ display: 'flex', alignItems: 'center', gap: '8px' })}>
                      <span style={s({ fontFamily: 'monospace', fontSize: '11px', color: '#f59e0b', fontWeight: 600 })}>{p.procedure_id}</span>
                      <span style={s({ flex: 1, fontSize: '13px', fontWeight: 600, color: '#f1f5f9' })}>{p.title}</span>
                      <StatusBadge status={p.status} />
                      <span style={s({ fontSize: '11px', color: '#64748b' })}>v{p.version}</span>
                    </div>
                    <div style={s({ fontSize: '11px', color: '#64748b', marginTop: '4px', textTransform: 'capitalize' })}>{p.category.replace('_', ' ')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Foundation Tab ── */}
        {tab === 'foundation' && (
          <div>
            <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' })}>
              {[
                {
                  title: 'AI Magna Carta',
                  icon: '⚖️',
                  desc: 'The constitutional foundation of the Infinity OS ecosystem. 5 articles governing all AI systems: Sovereignty, Transparency, Privacy, Security, Accountability.',
                  path: 'docs/townhall/foundation/magna-carta/00-magna-carta/AI-Magna-Carta.md',
                  badges: ['5 Articles', 'v1.0.0', 'ACTIVE'],
                  color: '#818cf8',
                },
                {
                  title: 'AI Canon',
                  icon: '📜',
                  desc: 'Complete governance constitution. Logic Levels L0-L5, HITL gates, Metric Canon, agent blueprints.',
                  path: 'docs/townhall/foundation/magna-carta/CANON.md',
                  badges: ['7 Sections', 'v1.0.0', 'ACTIVE'],
                  color: '#22c55e',
                },
                {
                  title: 'Service Charter Template',
                  icon: '📋',
                  desc: 'Standard template for all new platform service charters. Covers identity, zero-cost compliance, technical spec, governance, SLOs, security, and gate history.',
                  path: 'docs/townhall/foundation/service-charter/SERVICE_CHARTER_TEMPLATE.md',
                  badges: ['12 Sections', 'v1.0.0', 'ACTIVE'],
                  color: '#f59e0b',
                },
                {
                  title: 'Trancendos Framework',
                  icon: '🌐',
                  desc: 'The core operating framework for all 21 platforms. Defines architecture principles, microservices patterns, zero-cost mandate, and 2060 standards.',
                  path: 'docs/townhall/framework/',
                  badges: ['21 Platforms', 'v1.0.0', 'ACTIVE'],
                  color: '#3b82f6',
                },
                {
                  title: 'Finalia Documents',
                  icon: '📁',
                  desc: 'Governance PDFs: AI Code of Conduct, Crypto Key Management, Encrypted Data Handling, On-Chain Audit Trail, Zero-Net-Cost Policy.',
                  path: 'docs/townhall/foundation/finalia/',
                  badges: ['5 Documents', 'PDF', 'CLASSIFIED'],
                  color: '#ef4444',
                },
                {
                  title: 'Agent Blueprint Template',
                  icon: '🤖',
                  desc: 'Standard template for defining new AI agents. Covers identity, capabilities, HITL gates, autonomy levels, and integration points.',
                  path: 'docs/townhall/foundation/magna-carta/03-blueprints/agent-blueprint-template.md',
                  badges: ['27 Agents', 'v1.0.0', 'ACTIVE'],
                  color: '#8b5cf6',
                },
              ].map(item => (
                <div key={item.title} style={s({ background: '#1e293b', borderRadius: '10px', padding: '14px', border: `1px solid ${item.color}33` })}>
                  <div style={s({ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' })}>
                    <span style={s({ fontSize: '20px' })}>{item.icon}</span>
                    <span style={s({ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' })}>{item.title}</span>
                  </div>
                  <p style={s({ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', marginBottom: '10px' })}>{item.desc}</p>
                  <div style={s({ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' })}>
                    {item.badges.map(b => (
                      <span key={b} style={s({ padding: '2px 8px', background: item.color + '22', color: item.color, borderRadius: '10px', fontSize: '10px', fontWeight: 600 })}>{b}</span>
                    ))}
                  </div>
                  <div style={s({ fontSize: '10px', color: '#475569', fontFamily: 'monospace' })}>{item.path}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Boardroom Tab ── */}
        {tab === 'boardroom' && (
          <div>
            <div style={s({ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' })}>
              <button onClick={() => setShowCreateMeeting(true)} style={s({ padding: '8px 14px', background: '#818cf8', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 })}>+ Schedule Meeting</button>
            </div>

            {meetings.length === 0 ? (
              <EmptyState icon="🎭" title="No meetings scheduled" desc="Schedule your first governance board meeting" />
            ) : (
              <div style={s({ display: 'flex', flexDirection: 'column', gap: '8px' })}>
                {meetings.map(m => (
                  <div key={m.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', border: '1px solid #334155' })}>
                    <div style={s({ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' })}>
                      <span style={s({ fontSize: '16px' })}>🎭</span>
                      <span style={s({ flex: 1, fontSize: '13px', fontWeight: 600, color: '#f1f5f9' })}>{m.title}</span>
                      <StatusBadge status={m.status} />
                    </div>
                    <div style={s({ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b' })}>
                      <span>📅 {formatDate(m.scheduled_at)}</span>
                      <span>🏷️ {m.meeting_type}</span>
                      <span>📍 {m.location || 'Virtual'}</span>
                      {m.quorum_met && <span style={s({ color: '#22c55e' })}>✅ Quorum</span>}
                      {m.has_minutes && <span style={s({ color: '#818cf8' })}>📝 Minutes</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showCreateMeeting && (
              <Modal title="Schedule Board Meeting" onClose={() => setShowCreateMeeting(false)}>
                <FormField label="Title">
                  <input value={newMeeting.title} onChange={e => setNewMeeting(m => ({ ...m, title: e.target.value }))}
                    placeholder="Q1 2025 Board Meeting" style={inputStyle} />
                </FormField>
                <FormField label="Meeting Type">
                  <select value={newMeeting.meeting_type} onChange={e => setNewMeeting(m => ({ ...m, meeting_type: e.target.value }))} style={inputStyle}>
                    {['board', 'committee', 'emergency', 'agm', 'working_group'].map(t => (
                      <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Scheduled Date & Time">
                  <input type="datetime-local" value={newMeeting.scheduled_at} onChange={e => setNewMeeting(m => ({ ...m, scheduled_at: e.target.value }))} style={inputStyle} />
                </FormField>
                <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' })}>
                  <button onClick={() => setShowCreateMeeting(false)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={createMeeting} disabled={loading} style={primaryBtnStyle}>
                    {loading ? 'Scheduling...' : 'Schedule Meeting'}
                  </button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ── IP Registry Tab ── */}
        {tab === 'ip' && (
          <div>
            <div style={s({ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' })}>
              <button onClick={() => setShowCreateIP(true)} style={s({ padding: '8px 14px', background: '#818cf8', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 })}>+ Register IP</button>
            </div>

            {ipRecords.length === 0 ? (
              <EmptyState icon="💡" title="No IP assets registered" desc="Register your first intellectual property asset" />
            ) : (
              <div style={s({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' })}>
                {ipRecords.map(r => (
                  <div key={r.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', border: '1px solid #334155' })}>
                    <div style={s({ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' })}>
                      <span style={s({ fontSize: '18px' })}>{IP_TYPE_ICONS[r.ip_type] || '💡'}</span>
                      <span style={s({ flex: 1, fontSize: '12px', fontWeight: 600, color: '#f1f5f9' })}>{r.title}</span>
                    </div>
                    <div style={s({ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' })}>
                      <span style={s({ padding: '2px 8px', background: '#334155', color: '#94a3b8', borderRadius: '8px', fontSize: '10px', textTransform: 'capitalize' })}>{r.ip_type.replace('_', ' ')}</span>
                      <span style={s({ padding: '2px 8px', background: '#ef444422', color: '#ef4444', borderRadius: '8px', fontSize: '10px' })}>{r.classification}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div style={s({ fontSize: '11px', color: '#64748b' })}>📅 {formatDate(r.created_at)}</div>
                  </div>
                ))}
              </div>
            )}

            {showCreateIP && (
              <Modal title="Register IP Asset" onClose={() => setShowCreateIP(false)}>
                <FormField label="Title">
                  <input value={newIP.title} onChange={e => setNewIP(p => ({ ...p, title: e.target.value }))}
                    placeholder="IP asset name" style={inputStyle} />
                </FormField>
                <FormField label="IP Type">
                  <select value={newIP.ip_type} onChange={e => setNewIP(p => ({ ...p, ip_type: e.target.value }))} style={inputStyle}>
                    {['software', 'algorithm', 'brand', 'trade_secret', 'patent', 'copyright', 'trademark'].map(t => (
                      <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Classification">
                  <select value={newIP.classification} onChange={e => setNewIP(p => ({ ...p, classification: e.target.value }))} style={inputStyle}>
                    {['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'CLASSIFIED', 'VOID'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Description">
                  <textarea value={newIP.description} onChange={e => setNewIP(p => ({ ...p, description: e.target.value }))}
                    placeholder="Describe this IP asset..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
                </FormField>
                <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' })}>
                  <button onClick={() => setShowCreateIP(false)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={createIPRecord} disabled={loading} style={primaryBtnStyle}>
                    {loading ? 'Registering...' : 'Register IP'}
                  </button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ── Legal Tab ── */}
        {tab === 'legal' && (
          <div>
            <div style={s({ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' })}>
              <button onClick={() => setShowCreateContract(true)} style={s({ padding: '8px 14px', background: '#818cf8', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 })}>+ New Contract</button>
            </div>

            {contracts.length === 0 ? (
              <EmptyState icon="⚖️" title="No contracts yet" desc="Register your first legal contract" />
            ) : (
              <div style={s({ display: 'flex', flexDirection: 'column', gap: '6px' })}>
                {contracts.map(c => (
                  <div key={c.id} style={s({ background: '#1e293b', borderRadius: '8px', padding: '12px', border: '1px solid #334155' })}>
                    <div style={s({ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' })}>
                      <span style={s({ fontSize: '16px' })}>📜</span>
                      <span style={s({ flex: 1, fontSize: '13px', fontWeight: 600, color: '#f1f5f9' })}>{c.title}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div style={s({ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' })}>
                      <span>🏷️ {c.contract_type.replace('_', ' ')}</span>
                      {c.effective_date && <span>📅 Effective: {formatDate(c.effective_date)}</span>}
                      {c.expiry_date && <span>⏰ Expires: {formatDate(c.expiry_date)}</span>}
                      {c.has_ai_analysis && <span style={s({ color: '#22c55e' })}>🤖 AI Analysed</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showCreateContract && (
              <Modal title="New Legal Contract" onClose={() => setShowCreateContract(false)}>
                <FormField label="Title">
                  <input value={newContract.title} onChange={e => setNewContract(p => ({ ...p, title: e.target.value }))}
                    placeholder="Contract title" style={inputStyle} />
                </FormField>
                <FormField label="Contract Type">
                  <select value={newContract.contract_type} onChange={e => setNewContract(p => ({ ...p, contract_type: e.target.value }))} style={inputStyle}>
                    {['nda', 'service_agreement', 'employment', 'vendor', 'partnership', 'license', 'other'].map(t => (
                      <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Description">
                  <textarea value={newContract.description} onChange={e => setNewContract(p => ({ ...p, description: e.target.value }))}
                    placeholder="Contract description..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
                </FormField>
                <div style={s({ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' })}>
                  <button onClick={() => setShowCreateContract(false)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={createContract} disabled={loading} style={primaryBtnStyle}>
                    {loading ? 'Creating...' : 'Create Contract'}
                  </button>
                </div>
              </Modal>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: '#475569' }}>
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '12px' }}>{desc}</div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', width: '480px', maxWidth: '90vw', border: '1px solid #334155', maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid #334155',
  borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', background: '#818cf8', border: 'none', borderRadius: '8px',
  color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px', background: '#334155', border: 'none', borderRadius: '8px',
  color: '#e2e8f0', cursor: 'pointer', fontSize: '13px',
};