import React, { useState } from 'react';

/* ─────────────────────────────────────────────
   Infinity OS — Git Integration Hub
   Multi-provider Git management: GitHub, GitLab,
   BitBucket. Repo browser, commits, PRs, issues,
   pipelines, and file viewer.
   ───────────────────────────────────────────── */

interface GitConnection {
  id: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  username: string;
  avatar: string;
  connectedAt: string;
  repoCount: number;
  status: 'active' | 'expired' | 'error';
}

interface Repository {
  id: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  name: string;
  fullName: string;
  description: string;
  language: string;
  languageColor: string;
  stars: number;
  forks: number;
  openIssues: number;
  openPRs: number;
  visibility: 'public' | 'private' | 'internal';
  defaultBranch: string;
  lastPush: string;
  size: string;
  topics: string[];
  ciStatus: 'passing' | 'failing' | 'pending' | 'none';
}

interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
  additions: number;
  deletions: number;
}

interface PullRequest {
  id: number;
  title: string;
  author: string;
  state: 'open' | 'merged' | 'closed';
  createdAt: string;
  labels: string[];
  reviewers: string[];
  checks: 'passing' | 'failing' | 'pending';
  comments: number;
  additions: number;
  deletions: number;
  branch: string;
}

interface Issue {
  id: number;
  title: string;
  author: string;
  state: 'open' | 'closed';
  createdAt: string;
  labels: { name: string; color: string }[];
  assignees: string[];
  comments: number;
  milestone?: string;
}

interface Pipeline {
  id: string;
  name: string;
  status: 'success' | 'failure' | 'running' | 'pending' | 'cancelled';
  branch: string;
  commit: string;
  duration: string;
  triggeredBy: string;
  startedAt: string;
}

const CONNECTIONS: GitConnection[] = [
  { id: 'gh-1', provider: 'github', username: 'infinity-os', avatar: '🐙', connectedAt: '2025-01-05T08:00:00Z', repoCount: 12, status: 'active' },
  { id: 'gl-1', provider: 'gitlab', username: 'infinity-os', avatar: '🦊', connectedAt: '2025-01-10T10:00:00Z', repoCount: 5, status: 'active' },
  { id: 'bb-1', provider: 'bitbucket', username: 'infinity-team', avatar: '🪣', connectedAt: '2025-02-01T14:00:00Z', repoCount: 3, status: 'expired' },
];

const REPOSITORIES: Repository[] = [
  { id: 'r1', provider: 'github', name: 'infinity-portal', fullName: 'infinity-os/infinity-portal', description: 'Core Infinity OS shell, kernel, and microservices monorepo', language: 'TypeScript', languageColor: '#3178c6', stars: 342, forks: 28, openIssues: 15, openPRs: 4, visibility: 'public', defaultBranch: 'main', lastPush: '2025-03-04T12:00:00Z', size: '24.8 MB', topics: ['os', 'wasm', 'cloudflare', 'react'], ciStatus: 'passing' },
  { id: 'r2', provider: 'github', name: 'infinity-workers', fullName: 'infinity-os/infinity-workers', description: 'Cloudflare Workers for identity, filesystem, registry, search, AI, and notifications', language: 'TypeScript', languageColor: '#3178c6', stars: 89, forks: 12, openIssues: 7, openPRs: 2, visibility: 'public', defaultBranch: 'main', lastPush: '2025-03-04T10:30:00Z', size: '8.2 MB', topics: ['cloudflare-workers', 'hono', 'edge'], ciStatus: 'passing' },
  { id: 'r3', provider: 'github', name: 'wasm-policy-engine', fullName: 'infinity-os/wasm-policy-engine', description: 'Rust/WASM deterministic policy engine for AI action gating and security', language: 'Rust', languageColor: '#dea584', stars: 156, forks: 19, openIssues: 3, openPRs: 1, visibility: 'public', defaultBranch: 'main', lastPush: '2025-03-03T16:00:00Z', size: '5.1 MB', topics: ['rust', 'wasm', 'security', 'policy'], ciStatus: 'passing' },
  { id: 'r4', provider: 'github', name: 'infinity-docs', fullName: 'infinity-os/infinity-docs', description: 'Documentation, architecture decisions, and API references', language: 'MDX', languageColor: '#fcb32c', stars: 45, forks: 8, openIssues: 2, openPRs: 0, visibility: 'public', defaultBranch: 'main', lastPush: '2025-03-02T09:00:00Z', size: '3.4 MB', topics: ['docs', 'architecture'], ciStatus: 'none' },
  { id: 'r5', provider: 'github', name: 'self-healing', fullName: 'infinity-os/self-healing', description: 'CVE scanner, dependency catalog, SBOM generator, and auto-remediation engine', language: 'TypeScript', languageColor: '#3178c6', stars: 78, forks: 6, openIssues: 4, openPRs: 1, visibility: 'public', defaultBranch: 'main', lastPush: '2025-03-04T08:00:00Z', size: '2.9 MB', topics: ['security', 'cve', 'sbom'], ciStatus: 'passing' },
  { id: 'r6', provider: 'gitlab', name: 'infrastructure', fullName: 'infinity-os/infrastructure', description: 'K3s manifests, Traefik configs, monitoring stack, and Terraform modules', language: 'HCL', languageColor: '#844fba', stars: 23, forks: 4, openIssues: 1, openPRs: 0, visibility: 'private', defaultBranch: 'main', lastPush: '2025-03-03T14:00:00Z', size: '1.8 MB', topics: ['k3s', 'terraform', 'monitoring'], ciStatus: 'passing' },
  { id: 'r7', provider: 'gitlab', name: 'vault-config', fullName: 'infinity-os/vault-config', description: 'HashiCorp Vault policies, secret engines, and transit encryption configuration', language: 'HCL', languageColor: '#844fba', stars: 12, forks: 2, openIssues: 0, openPRs: 0, visibility: 'private', defaultBranch: 'main', lastPush: '2025-02-28T11:00:00Z', size: '0.6 MB', topics: ['vault', 'secrets', 'encryption'], ciStatus: 'passing' },
  { id: 'r8', provider: 'github', name: 'marketplace-modules', fullName: 'infinity-os/marketplace-modules', description: 'Official marketplace modules: F-Droid, Flatpak, Snap, and WASM packages', language: 'TypeScript', languageColor: '#3178c6', stars: 67, forks: 15, openIssues: 9, openPRs: 3, visibility: 'public', defaultBranch: 'main', lastPush: '2025-03-04T11:00:00Z', size: '12.1 MB', topics: ['marketplace', 'modules', 'wasm'], ciStatus: 'failing' },
];

const COMMITS: Commit[] = [
  { sha: 'a1b2c3d', message: 'feat(kernel): implement quantum-safe key exchange for DID bootstrap', author: 'drew', date: '2025-03-04T12:00:00Z', additions: 342, deletions: 28 },
  { sha: 'e4f5g6h', message: 'fix(self-healing): resolve CVE-2025-1234 in dependency chain', author: 'drew', date: '2025-03-04T10:30:00Z', additions: 15, deletions: 8 },
  { sha: 'i7j8k9l', message: 'feat(shell): add FinOps dashboard with zero-cost tracking', author: 'drew', date: '2025-03-04T09:00:00Z', additions: 580, deletions: 12 },
  { sha: 'm0n1o2p', message: 'chore(deps): bump @cloudflare/workers-types to 4.20250301.0', author: 'dependabot', date: '2025-03-03T22:00:00Z', additions: 4, deletions: 4 },
  { sha: 'q3r4s5t', message: 'feat(integrations): add PagerDuty and Grafana integration manifests', author: 'drew', date: '2025-03-03T16:00:00Z', additions: 245, deletions: 0 },
  { sha: 'u6v7w8x', message: 'fix(auth): WebAuthn attestation verification for Firefox', author: 'drew', date: '2025-03-03T14:00:00Z', additions: 67, deletions: 23 },
  { sha: 'y9z0a1b', message: 'feat(sandbox): WASM sandbox with resource monitoring and snapshots', author: 'drew', date: '2025-03-03T11:00:00Z', additions: 890, deletions: 45 },
  { sha: 'c2d3e4f', message: 'docs: update architecture decision records for microkernel', author: 'drew', date: '2025-03-02T09:00:00Z', additions: 156, deletions: 32 },
];

const PULL_REQUESTS: PullRequest[] = [
  { id: 142, title: 'feat: Quantum-safe CRYSTALS-Kyber key exchange', author: 'drew', state: 'open', createdAt: '2025-03-04T08:00:00Z', labels: ['enhancement', 'security', '2060-ready'], reviewers: ['security-bot'], checks: 'passing', comments: 3, additions: 342, deletions: 28, branch: 'feat/quantum-safe-kex' },
  { id: 141, title: 'fix: Self-healing CVE auto-remediation race condition', author: 'drew', state: 'open', createdAt: '2025-03-03T15:00:00Z', labels: ['bug', 'self-healing'], reviewers: [], checks: 'passing', comments: 1, additions: 45, deletions: 12, branch: 'fix/self-heal-race' },
  { id: 140, title: 'feat: Marketplace module verification pipeline', author: 'drew', state: 'merged', createdAt: '2025-03-02T10:00:00Z', labels: ['enhancement', 'marketplace'], reviewers: ['security-bot'], checks: 'passing', comments: 5, additions: 234, deletions: 18, branch: 'feat/module-verify' },
  { id: 139, title: 'chore: Upgrade Vite to 5.4 and React to 18.3', author: 'dependabot', state: 'open', createdAt: '2025-03-01T22:00:00Z', labels: ['dependencies'], reviewers: [], checks: 'pending', comments: 0, additions: 12, deletions: 12, branch: 'deps/vite-react-upgrade' },
  { id: 138, title: 'feat: GDPR crypto-shredding via Vault transit engine', author: 'drew', state: 'merged', createdAt: '2025-02-28T14:00:00Z', labels: ['enhancement', 'compliance', 'gdpr'], reviewers: ['security-bot'], checks: 'passing', comments: 8, additions: 567, deletions: 89, branch: 'feat/crypto-shred' },
  { id: 137, title: 'fix: Traefik circuit breaker threshold tuning', author: 'drew', state: 'closed', createdAt: '2025-02-27T09:00:00Z', labels: ['bug', 'infrastructure'], reviewers: [], checks: 'failing', comments: 2, additions: 8, deletions: 4, branch: 'fix/traefik-cb' },
];

const ISSUES: Issue[] = [
  { id: 201, title: 'Implement decentralized identity (DID) resolver', author: 'drew', state: 'open', createdAt: '2025-03-04T07:00:00Z', labels: [{ name: 'enhancement', color: '#a2eeef' }, { name: '2060-ready', color: '#d4c5f9' }], assignees: ['drew'], comments: 2, milestone: 'v1.0' },
  { id: 200, title: 'WCAG 2.2 AA audit for all shell views', author: 'drew', state: 'open', createdAt: '2025-03-03T10:00:00Z', labels: [{ name: 'accessibility', color: '#0075ca' }], assignees: ['drew'], comments: 0, milestone: 'v1.0' },
  { id: 199, title: 'Add BitBucket adapter to Git Integration Hub', author: 'drew', state: 'open', createdAt: '2025-03-02T14:00:00Z', labels: [{ name: 'enhancement', color: '#a2eeef' }], assignees: [], comments: 1 },
  { id: 198, title: 'Marketplace: F-Droid source adapter', author: 'drew', state: 'open', createdAt: '2025-03-01T09:00:00Z', labels: [{ name: 'enhancement', color: '#a2eeef' }, { name: 'marketplace', color: '#e4e669' }], assignees: ['drew'], comments: 3, milestone: 'v1.0' },
  { id: 197, title: 'Self-healing: false positive CVE suppression', author: 'drew', state: 'closed', createdAt: '2025-02-28T11:00:00Z', labels: [{ name: 'bug', color: '#d73a4a' }], assignees: ['drew'], comments: 4, milestone: 'v0.9' },
  { id: 196, title: 'Oracle Always Free ARM instance provisioning script', author: 'drew', state: 'closed', createdAt: '2025-02-27T08:00:00Z', labels: [{ name: 'infrastructure', color: '#c5def5' }, { name: 'finops', color: '#bfd4f2' }], assignees: ['drew'], comments: 6, milestone: 'v0.9' },
];

const PIPELINES: Pipeline[] = [
  { id: 'pl-1', name: 'CI / Build & Test', status: 'success', branch: 'main', commit: 'a1b2c3d', duration: '3m 42s', triggeredBy: 'push', startedAt: '2025-03-04T12:01:00Z' },
  { id: 'pl-2', name: 'Security Scan', status: 'success', branch: 'main', commit: 'a1b2c3d', duration: '1m 18s', triggeredBy: 'push', startedAt: '2025-03-04T12:01:00Z' },
  { id: 'pl-3', name: 'CI / Build & Test', status: 'running', branch: 'feat/quantum-safe-kex', commit: 'a1b2c3d', duration: '2m 10s', triggeredBy: 'pull_request', startedAt: '2025-03-04T12:05:00Z' },
  { id: 'pl-4', name: 'Deploy to Staging', status: 'success', branch: 'main', commit: 'e4f5g6h', duration: '5m 03s', triggeredBy: 'push', startedAt: '2025-03-04T10:35:00Z' },
  { id: 'pl-5', name: 'CI / Build & Test', status: 'failure', branch: 'feat/module-verify', commit: 'm0n1o2p', duration: '2m 55s', triggeredBy: 'pull_request', startedAt: '2025-03-03T22:05:00Z' },
  { id: 'pl-6', name: 'Nightly E2E', status: 'success', branch: 'main', commit: 'q3r4s5t', duration: '12m 30s', triggeredBy: 'schedule', startedAt: '2025-03-04T02:00:00Z' },
];

const providerIcon = (p: string) => p === 'github' ? '🐙' : p === 'gitlab' ? '🦊' : '🪣';
const providerName = (p: string) => p === 'github' ? 'GitHub' : p === 'gitlab' ? 'GitLab' : 'BitBucket';
const ciColor = (s: string) => s === 'passing' || s === 'success' ? '#2ea043' : s === 'failing' || s === 'failure' ? '#f85149' : s === 'running' || s === 'pending' ? '#d29922' : '#8b949e';
const prStateColor = (s: string) => s === 'open' ? '#2ea043' : s === 'merged' ? '#a371f7' : '#f85149';
const prStateIcon = (s: string) => s === 'open' ? '🟢' : s === 'merged' ? '🟣' : '🔴';

export default function GitHub() {
  const [tab, setTab] = useState<'repos' | 'commits' | 'prs' | 'issues' | 'pipelines' | 'connections'>('repos');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<'all' | 'github' | 'gitlab' | 'bitbucket'>('all');
  const [search, setSearch] = useState('');
  const [prFilter, setPrFilter] = useState<'all' | 'open' | 'merged' | 'closed'>('all');
  const [issueFilter, setIssueFilter] = useState<'all' | 'open' | 'closed'>('all');

  const filteredRepos = REPOSITORIES.filter(r => {
    if (providerFilter !== 'all' && r.provider !== providerFilter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredPRs = PULL_REQUESTS.filter(pr => prFilter === 'all' ? true : pr.state === prFilter);
  const filteredIssues = ISSUES.filter(i => issueFilter === 'all' ? true : i.state === issueFilter);

  const totalStars = REPOSITORIES.reduce((s, r) => s + r.stars, 0);
  const totalForks = REPOSITORIES.reduce((s, r) => s + r.forks, 0);
  const openPRCount = PULL_REQUESTS.filter(p => p.state === 'open').length;
  const openIssueCount = ISSUES.filter(i => i.state === 'open').length;

  const st: Record<string, React.CSSProperties> = {
    container: { padding: '24px', maxWidth: 1400, margin: '0 auto', fontFamily: 'var(--font-family, "Inter", system-ui, sans-serif)', color: 'var(--text-primary, #e6edf3)' },
    header: { marginBottom: 24 },
    title: { fontSize: 28, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 },
    subtitle: { color: 'var(--text-secondary, #8b949e)', marginTop: 4, fontSize: 14 },
    summaryRow: { display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' as const },
    summaryCard: { flex: '1 1 160px', background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, padding: '14px 18px' },
    summaryLabel: { fontSize: 11, color: 'var(--text-secondary, #8b949e)', textTransform: 'uppercase' as const, letterSpacing: 1 },
    summaryValue: { fontSize: 26, fontWeight: 700, marginTop: 2 },
    tabs: { display: 'flex', gap: 0, borderBottom: '1px solid var(--border-primary, #30363d)', marginBottom: 20 },
    tab: { padding: '10px 18px', cursor: 'pointer', border: 'none', background: 'none', color: 'var(--text-secondary, #8b949e)', fontSize: 13, fontWeight: 500, borderBottom: '2px solid transparent', transition: 'all 0.2s' },
    tabActive: { color: 'var(--accent-primary, #58a6ff)', borderBottomColor: 'var(--accent-primary, #58a6ff)' },
    toolbar: { display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' as const, alignItems: 'center' },
    searchInput: { flex: '1 1 220px', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-primary, #30363d)', background: 'var(--surface-secondary, #0d1117)', color: 'var(--text-primary, #e6edf3)', fontSize: 13, outline: 'none' },
    pill: { padding: '5px 12px', borderRadius: 16, border: '1px solid var(--border-primary, #30363d)', background: 'none', color: 'var(--text-secondary, #8b949e)', fontSize: 12, cursor: 'pointer', transition: 'all 0.2s' },
    pillActive: { background: 'var(--accent-primary, #58a6ff)', color: '#fff', borderColor: 'var(--accent-primary, #58a6ff)' },
    repoCard: { background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, padding: '18px 20px', marginBottom: 10, cursor: 'pointer', transition: 'border-color 0.2s' },
    repoName: { fontSize: 16, fontWeight: 600, color: 'var(--accent-primary, #58a6ff)', margin: 0 },
    repoDesc: { fontSize: 13, color: 'var(--text-secondary, #8b949e)', marginTop: 4, lineHeight: 1.5 },
    repoMeta: { display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--text-secondary, #8b949e)', flexWrap: 'wrap' as const, alignItems: 'center' },
    langDot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block', marginRight: 4 },
    topicTag: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: '#388bfd26', color: '#58a6ff', fontSize: 11, marginRight: 4, marginTop: 4 },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
    th: { textAlign: 'left' as const, padding: '10px 14px', borderBottom: '1px solid var(--border-primary, #30363d)', color: 'var(--text-secondary, #8b949e)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    td: { padding: '10px 14px', borderBottom: '1px solid var(--border-primary, #30363d)' },
    badge: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
    connCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, marginBottom: 10 },
    btn: { padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s' },
    btnPrimary: { background: 'var(--accent-primary, #58a6ff)', color: '#fff' },
    btnSecondary: { background: 'var(--surface-secondary, #0d1117)', color: 'var(--text-primary, #e6edf3)', border: '1px solid var(--border-primary, #30363d)' },
    btnDanger: { background: '#f8514922', color: '#f85149', border: '1px solid #f8514944' },
    diffAdd: { color: '#2ea043', fontFamily: 'monospace', fontSize: 12 },
    diffDel: { color: '#f85149', fontFamily: 'monospace', fontSize: 12 },
  };

  const renderRepos = () => (
    <>
      <div style={st.toolbar}>
        <input style={st.searchInput} placeholder="Search repositories..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Search repositories" />
        {(['all', 'github', 'gitlab', 'bitbucket'] as const).map(p => (
          <button key={p} style={{ ...st.pill, ...(providerFilter === p ? st.pillActive : {}) }} onClick={() => setProviderFilter(p)}>
            {p === 'all' ? '🌐 All' : `${providerIcon(p)} ${providerName(p)}`}
          </button>
        ))}
      </div>
      {filteredRepos.map(repo => (
        <div
          key={repo.id}
          style={{ ...st.repoCard, borderColor: selectedRepo === repo.id ? 'var(--accent-primary, #58a6ff)' : undefined }}
          onClick={() => setSelectedRepo(selectedRepo === repo.id ? null : repo.id)}
          role="button" tabIndex={0}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{providerIcon(repo.provider)}</span>
                <h3 style={st.repoName}>{repo.fullName}</h3>
                <span style={{ ...st.badge, background: repo.visibility === 'public' ? '#2ea04318' : '#d2992218', color: repo.visibility === 'public' ? '#2ea043' : '#d29922', fontSize: 10 }}>
                  {repo.visibility === 'public' ? '🌐' : '🔒'} {repo.visibility}
                </span>
              </div>
              <p style={st.repoDesc}>{repo.description}</p>
            </div>
            {repo.ciStatus !== 'none' && (
              <span style={{ ...st.badge, background: ciColor(repo.ciStatus) + '18', color: ciColor(repo.ciStatus) }}>
                {repo.ciStatus === 'passing' ? '✓' : repo.ciStatus === 'failing' ? '✗' : '◌'} CI {repo.ciStatus}
              </span>
            )}
          </div>

          <div style={st.repoMeta}>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ ...st.langDot, background: repo.languageColor }} />
              {repo.language}
            </span>
            <span>⭐ {repo.stars}</span>
            <span>🍴 {repo.forks}</span>
            <span>🐛 {repo.openIssues} issues</span>
            <span>🔀 {repo.openPRs} PRs</span>
            <span>📦 {repo.size}</span>
            <span>🕐 {new Date(repo.lastPush).toLocaleDateString()}</span>
          </div>

          <div style={{ marginTop: 8 }}>
            {repo.topics.map(t => <span key={t} style={st.topicTag}>{t}</span>)}
          </div>

          {selectedRepo === repo.id && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-primary, #30363d)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button style={{ ...st.btn, ...st.btnPrimary }}>📂 Browse Files</button>
              <button style={{ ...st.btn, ...st.btnSecondary }}>🔀 Branches ({repo.defaultBranch})</button>
              <button style={{ ...st.btn, ...st.btnSecondary }}>📊 Insights</button>
              <button style={{ ...st.btn, ...st.btnSecondary }}>⚙️ Settings</button>
              <button style={{ ...st.btn, ...st.btnSecondary }}>🔗 Clone</button>
              <button style={{ ...st.btn, ...st.btnSecondary }}>🚀 Deploy</button>
            </div>
          )}
        </div>
      ))}
      {filteredRepos.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary, #8b949e)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <p>No repositories found.</p>
        </div>
      )}
    </>
  );

  const renderCommits = () => (
    <div style={{ background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={st.table}>
        <thead>
          <tr>
            <th style={st.th}>SHA</th>
            <th style={st.th}>Message</th>
            <th style={st.th}>Author</th>
            <th style={st.th}>Date</th>
            <th style={st.th}>Changes</th>
          </tr>
        </thead>
        <tbody>
          {COMMITS.map(c => (
            <tr key={c.sha}>
              <td style={{ ...st.td, fontFamily: 'monospace', fontSize: 12, color: 'var(--accent-primary, #58a6ff)' }}>{c.sha}</td>
              <td style={{ ...st.td, maxWidth: 400 }}>
                <span style={{ fontWeight: 500 }}>{c.message}</span>
              </td>
              <td style={{ ...st.td, color: 'var(--text-secondary, #8b949e)' }}>{c.author}</td>
              <td style={{ ...st.td, fontSize: 12, color: 'var(--text-secondary, #8b949e)', whiteSpace: 'nowrap' }}>
                {new Date(c.date).toLocaleString()}
              </td>
              <td style={st.td}>
                <span style={st.diffAdd}>+{c.additions}</span>{' '}
                <span style={st.diffDel}>-{c.deletions}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderPRs = () => (
    <>
      <div style={{ ...st.toolbar, marginBottom: 14 }}>
        {(['all', 'open', 'merged', 'closed'] as const).map(f => (
          <button key={f} style={{ ...st.pill, ...(prFilter === f ? st.pillActive : {}) }} onClick={() => setPrFilter(f)}>
            {f === 'all' ? '🌐 All' : f === 'open' ? '🟢 Open' : f === 'merged' ? '🟣 Merged' : '🔴 Closed'} ({f === 'all' ? PULL_REQUESTS.length : PULL_REQUESTS.filter(p => p.state === f).length})
          </button>
        ))}
      </div>
      {filteredPRs.map(pr => (
        <div key={pr.id} style={{ ...st.repoCard, cursor: 'default' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 18, marginTop: 2 }}>{prStateIcon(pr.state)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{pr.title}</span>
                {pr.labels.map(l => (
                  <span key={l} style={{ ...st.topicTag, fontSize: 10 }}>{l}</span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span>#{pr.id} by {pr.author}</span>
                <span>📅 {new Date(pr.createdAt).toLocaleDateString()}</span>
                <span>🌿 {pr.branch}</span>
                <span>💬 {pr.comments}</span>
                <span style={st.diffAdd}>+{pr.additions}</span>
                <span style={st.diffDel}>-{pr.deletions}</span>
                {pr.checks !== 'pending' && (
                  <span style={{ color: ciColor(pr.checks) }}>
                    {pr.checks === 'passing' ? '✓' : '✗'} checks {pr.checks}
                  </span>
                )}
              </div>
            </div>
            <span style={{
              ...st.badge,
              background: prStateColor(pr.state) + '18',
              color: prStateColor(pr.state),
            }}>
              {pr.state}
            </span>
          </div>
        </div>
      ))}
    </>
  );

  const renderIssues = () => (
    <>
      <div style={{ ...st.toolbar, marginBottom: 14 }}>
        {(['all', 'open', 'closed'] as const).map(f => (
          <button key={f} style={{ ...st.pill, ...(issueFilter === f ? st.pillActive : {}) }} onClick={() => setIssueFilter(f)}>
            {f === 'all' ? '🌐 All' : f === 'open' ? '🟢 Open' : '🔴 Closed'} ({f === 'all' ? ISSUES.length : ISSUES.filter(i => i.state === f).length})
          </button>
        ))}
      </div>
      {filteredIssues.map(issue => (
        <div key={issue.id} style={{ ...st.repoCard, cursor: 'default' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 18, marginTop: 2 }}>{issue.state === 'open' ? '🟢' : '🔴'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{issue.title}</span>
                {issue.labels.map(l => (
                  <span key={l.name} style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: l.color + '33', color: l.color, border: `1px solid ${l.color}55` }}>
                    {l.name}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span>#{issue.id} by {issue.author}</span>
                <span>📅 {new Date(issue.createdAt).toLocaleDateString()}</span>
                <span>💬 {issue.comments}</span>
                {issue.assignees.length > 0 && <span>👤 {issue.assignees.join(', ')}</span>}
                {issue.milestone && <span>🎯 {issue.milestone}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );

  const renderPipelines = () => (
    <div style={{ background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={st.table}>
        <thead>
          <tr>
            <th style={st.th}>Status</th>
            <th style={st.th}>Pipeline</th>
            <th style={st.th}>Branch</th>
            <th style={st.th}>Commit</th>
            <th style={st.th}>Duration</th>
            <th style={st.th}>Trigger</th>
            <th style={st.th}>Started</th>
          </tr>
        </thead>
        <tbody>
          {PIPELINES.map(pl => (
            <tr key={pl.id}>
              <td style={st.td}>
                <span style={{
                  ...st.badge,
                  background: ciColor(pl.status) + '18',
                  color: ciColor(pl.status),
                }}>
                  {pl.status === 'success' ? '✓' : pl.status === 'failure' ? '✗' : pl.status === 'running' ? '◌' : pl.status === 'pending' ? '⏳' : '⊘'}
                  {' '}{pl.status}
                </span>
              </td>
              <td style={{ ...st.td, fontWeight: 500 }}>{pl.name}</td>
              <td style={{ ...st.td, fontFamily: 'monospace', fontSize: 12, color: 'var(--accent-primary, #58a6ff)' }}>
                🌿 {pl.branch}
              </td>
              <td style={{ ...st.td, fontFamily: 'monospace', fontSize: 12 }}>{pl.commit}</td>
              <td style={{ ...st.td, fontSize: 12 }}>{pl.duration}</td>
              <td style={{ ...st.td, fontSize: 12 }}>
                <span style={{ ...st.badge, background: 'var(--surface-secondary, #0d1117)', fontSize: 10 }}>
                  {pl.triggeredBy}
                </span>
              </td>
              <td style={{ ...st.td, fontSize: 12, color: 'var(--text-secondary, #8b949e)' }}>
                {new Date(pl.startedAt).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderConnections = () => (
    <div>
      <div style={{ marginBottom: 20 }}>
        <button style={{ ...st.btn, ...st.btnPrimary }}>+ Add Git Provider</button>
      </div>
      {CONNECTIONS.map(conn => (
        <div key={conn.id} style={st.connCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 32 }}>{conn.avatar}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{providerName(conn.provider)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #8b949e)' }}>
                @{conn.username} · {conn.repoCount} repos · Connected {new Date(conn.connectedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              ...st.badge,
              background: (conn.status === 'active' ? '#2ea043' : conn.status === 'expired' ? '#d29922' : '#f85149') + '18',
              color: conn.status === 'active' ? '#2ea043' : conn.status === 'expired' ? '#d29922' : '#f85149',
            }}>
              {conn.status}
            </span>
            {conn.status === 'expired' && (
              <button style={{ ...st.btn, ...st.btnPrimary, padding: '5px 12px' }}>🔄 Re-auth</button>
            )}
            <button style={{ ...st.btn, ...st.btnSecondary, padding: '5px 12px' }}>⚙️ Settings</button>
            <button style={{ ...st.btn, ...st.btnDanger, padding: '5px 12px' }}>Disconnect</button>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 24, background: 'var(--surface-primary, #161b22)', border: '1px solid var(--border-primary, #30363d)', borderRadius: 10, padding: 20 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Supported Providers</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {[
            { icon: '🐙', name: 'GitHub', desc: 'Full REST API v3 + GraphQL', status: 'Supported' },
            { icon: '🦊', name: 'GitLab', desc: 'Full REST API v4', status: 'Supported' },
            { icon: '🪣', name: 'BitBucket', desc: 'REST API v2', status: 'Coming Soon' },
            { icon: '🏠', name: 'Gitea / Forgejo', desc: 'Self-hosted Git', status: 'Planned' },
          ].map(p => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface-secondary, #0d1117)', borderRadius: 8 }}>
              <span style={{ fontSize: 24 }}>{p.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary, #8b949e)' }}>{p.desc}</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: p.status === 'Supported' ? '#2ea043' : '#d29922' }}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={st.container}>
      <div style={st.header}>
        <h1 style={st.title}>🐙 Git Integration Hub</h1>
        <p style={st.subtitle}>Multi-provider Git management — repositories, commits, pull requests, issues, and CI/CD pipelines</p>
      </div>

      <div style={st.summaryRow}>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Repositories</div>
          <div style={st.summaryValue}>{REPOSITORIES.length}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Total Stars</div>
          <div style={{ ...st.summaryValue, color: '#d29922' }}>⭐ {totalStars}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Total Forks</div>
          <div style={st.summaryValue}>🍴 {totalForks}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Open PRs</div>
          <div style={{ ...st.summaryValue, color: '#2ea043' }}>{openPRCount}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Open Issues</div>
          <div style={{ ...st.summaryValue, color: '#d29922' }}>{openIssueCount}</div>
        </div>
        <div style={st.summaryCard}>
          <div style={st.summaryLabel}>Providers</div>
          <div style={st.summaryValue}>{CONNECTIONS.length}</div>
        </div>
      </div>

      <div style={st.tabs} role="tablist">
        {([
          { id: 'repos', label: '📂 Repos', count: REPOSITORIES.length },
          { id: 'commits', label: '📝 Commits', count: COMMITS.length },
          { id: 'prs', label: '🔀 Pull Requests', count: PULL_REQUESTS.length },
          { id: 'issues', label: '🐛 Issues', count: ISSUES.length },
          { id: 'pipelines', label: '🚀 Pipelines', count: PIPELINES.length },
          { id: 'connections', label: '🔗 Connections', count: CONNECTIONS.length },
        ] as const).map(t => (
          <button
            key={t.id}
            style={{ ...st.tab, ...(tab === t.id ? st.tabActive : {}) }}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {tab === 'repos' && renderRepos()}
      {tab === 'commits' && renderCommits()}
      {tab === 'prs' && renderPRs()}
      {tab === 'issues' && renderIssues()}
      {tab === 'pipelines' && renderPipelines()}
      {tab === 'connections' && renderConnections()}
    </div>
  );
}