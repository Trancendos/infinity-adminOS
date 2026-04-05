import React, { useState } from 'react';

type PipelineStatus = 'success' | 'failed' | 'running' | 'pending' | 'cancelled';

interface PipelineRun {
  id: string;
  name: string;
  branch: string;
  commit: string;
  commitMessage: string;
  author: string;
  status: PipelineStatus;
  duration: string;
  startedAt: string;
  jobs: PipelineJob[];
}

interface PipelineJob {
  name: string;
  status: PipelineStatus;
  duration: string;
}

interface DeploymentRecord {
  id: string;
  environment: string;
  service: string;
  version: string;
  status: 'deployed' | 'rolling-back' | 'failed';
  deployedAt: string;
  deployedBy: string;
}

const statusIcon = (status: PipelineStatus) => {
  switch (status) {
    case 'success': return '✅';
    case 'failed': return '❌';
    case 'running': return '🔄';
    case 'pending': return '⏳';
    case 'cancelled': return '⛔';
  }
};

const statusColor = (status: PipelineStatus) => {
  switch (status) {
    case 'success': return 'var(--color-success)';
    case 'failed': return 'var(--color-error)';
    case 'running': return 'var(--color-primary)';
    case 'pending': return 'var(--color-warning)';
    case 'cancelled': return 'var(--color-text-secondary)';
  }
};

const PIPELINES: PipelineRun[] = [
  {
    id: 'run-001', name: 'CI/CD Pipeline', branch: 'main', commit: 'a3f8c21', commitMessage: 'feat: add AI agent factory with directive system',
    author: 'drew', status: 'success', duration: '4m 32s', startedAt: '10 min ago',
    jobs: [
      { name: 'quality', status: 'success', duration: '45s' },
      { name: 'test', status: 'success', duration: '1m 12s' },
      { name: 'security', status: 'success', duration: '2m 05s' },
      { name: 'compliance', status: 'success', duration: '38s' },
      { name: 'build', status: 'success', duration: '1m 20s' },
      { name: 'deploy-pages', status: 'success', duration: '32s' },
      { name: 'deploy-workers', status: 'success', duration: '48s' },
    ],
  },
  {
    id: 'run-002', name: 'CI/CD Pipeline', branch: 'feat/marketplace', commit: 'b7e2d45', commitMessage: 'feat: marketplace multi-source module browser',
    author: 'drew', status: 'running', duration: '2m 15s', startedAt: '3 min ago',
    jobs: [
      { name: 'quality', status: 'success', duration: '42s' },
      { name: 'test', status: 'success', duration: '1m 08s' },
      { name: 'security', status: 'running', duration: '25s' },
      { name: 'compliance', status: 'pending', duration: '-' },
      { name: 'build', status: 'pending', duration: '-' },
      { name: 'deploy-pages', status: 'pending', duration: '-' },
      { name: 'deploy-workers', status: 'pending', duration: '-' },
    ],
  },
  {
    id: 'run-003', name: 'Security Audit', branch: 'main', commit: 'c9d1f67', commitMessage: 'chore: update dependencies and run security scan',
    author: 'dependabot', status: 'success', duration: '3m 48s', startedAt: '1 hour ago',
    jobs: [
      { name: 'trivy-scan', status: 'success', duration: '1m 30s' },
      { name: 'gitleaks', status: 'success', duration: '22s' },
      { name: 'owasp-zap', status: 'success', duration: '2m 45s' },
      { name: 'openscap', status: 'success', duration: '1m 10s' },
    ],
  },
  {
    id: 'run-004', name: 'CI/CD Pipeline', branch: 'fix/auth-refresh', commit: 'e4a8b12', commitMessage: 'fix: token refresh race condition on concurrent requests',
    author: 'drew', status: 'failed', duration: '2m 55s', startedAt: '2 hours ago',
    jobs: [
      { name: 'quality', status: 'success', duration: '40s' },
      { name: 'test', status: 'failed', duration: '1m 45s' },
      { name: 'security', status: 'cancelled', duration: '-' },
      { name: 'compliance', status: 'cancelled', duration: '-' },
      { name: 'build', status: 'cancelled', duration: '-' },
    ],
  },
  {
    id: 'run-005', name: 'CI/CD Pipeline', branch: 'main', commit: 'f2c3d89', commitMessage: 'feat: self-healing engine with CVE scanning',
    author: 'drew', status: 'success', duration: '5m 10s', startedAt: '5 hours ago',
    jobs: [
      { name: 'quality', status: 'success', duration: '48s' },
      { name: 'test', status: 'success', duration: '1m 22s' },
      { name: 'security', status: 'success', duration: '2m 15s' },
      { name: 'compliance', status: 'success', duration: '42s' },
      { name: 'build', status: 'success', duration: '1m 35s' },
      { name: 'deploy-pages', status: 'success', duration: '28s' },
      { name: 'deploy-workers', status: 'success', duration: '52s' },
    ],
  },
];

const DEPLOYMENTS: DeploymentRecord[] = [
  { id: 'dep-001', environment: 'Production', service: 'Shell (Pages)', version: 'v0.1.0-a3f8c21', status: 'deployed', deployedAt: '10 min ago', deployedBy: 'CI/CD' },
  { id: 'dep-002', environment: 'Production', service: 'Identity Worker', version: 'v0.1.0-a3f8c21', status: 'deployed', deployedAt: '10 min ago', deployedBy: 'CI/CD' },
  { id: 'dep-003', environment: 'Production', service: 'Filesystem Worker', version: 'v0.1.0-a3f8c21', status: 'deployed', deployedAt: '10 min ago', deployedBy: 'CI/CD' },
  { id: 'dep-004', environment: 'Production', service: 'AI Worker', version: 'v0.1.0-a3f8c21', status: 'deployed', deployedAt: '10 min ago', deployedBy: 'CI/CD' },
  { id: 'dep-005', environment: 'Production', service: 'Registry Worker', version: 'v0.1.0-a3f8c21', status: 'deployed', deployedAt: '10 min ago', deployedBy: 'CI/CD' },
  { id: 'dep-006', environment: 'Production', service: 'Search Worker', version: 'v0.1.0-a3f8c21', status: 'deployed', deployedAt: '10 min ago', deployedBy: 'CI/CD' },
];

export default function CICDOverview() {
  const [activeView, setActiveView] = useState<'pipelines' | 'deployments' | 'config'>('pipelines');
  const [expandedPipeline, setExpandedPipeline] = useState<string | null>('run-002');

  const successRate = (PIPELINES.filter(p => p.status === 'success').length / PIPELINES.length * 100).toFixed(0);
  const avgDuration = '3m 41s';

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>🚀 CI/CD Overview</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Pipeline runs, deployments, and build configuration
          </p>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Runs', value: PIPELINES.length.toString(), icon: '🔄' },
          { label: 'Success Rate', value: `${successRate}%`, icon: '✅' },
          { label: 'Avg Duration', value: avgDuration, icon: '⏱️' },
          { label: 'Active Deploys', value: DEPLOYMENTS.filter(d => d.status === 'deployed').length.toString(), icon: '🚀' },
          { label: 'Running Now', value: PIPELINES.filter(p => p.status === 'running').length.toString(), icon: '⚡' },
        ].map(card => (
          <div key={card.label} style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{card.icon}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{card.value}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        {(['pipelines', 'deployments', 'config'] as const).map(tab => (
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

      {/* Pipelines */}
      {activeView === 'pipelines' && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {PIPELINES.map(pipeline => (
            <div key={pipeline.id} style={{ borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden' }}>
              {/* Pipeline Header */}
              <div
                onClick={() => setExpandedPipeline(expandedPipeline === pipeline.id ? null : pipeline.id)}
                style={{ padding: '1rem 1.25rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{statusIcon(pipeline.status)}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                      {pipeline.name}
                      <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: '0.5rem' }}>#{pipeline.id.split('-')[1]}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.125rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{pipeline.branch}</span>
                      {' · '}
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{pipeline.commit}</span>
                      {' · '}
                      {pipeline.commitMessage}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  <span>👤 {pipeline.author}</span>
                  <span>⏱️ {pipeline.duration}</span>
                  <span>{pipeline.startedAt}</span>
                  <span style={{ transform: expandedPipeline === pipeline.id ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
                </div>
              </div>

              {/* Pipeline Jobs (Expanded) */}
              {expandedPipeline === pipeline.id && (
                <div style={{ padding: '0 1.25rem 1rem', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '1rem 0', overflowX: 'auto' }}>
                    {pipeline.jobs.map((job, i) => (
                      <React.Fragment key={job.name}>
                        <div style={{
                          padding: '0.75rem 1rem', borderRadius: '0.5rem', minWidth: '120px', textAlign: 'center',
                          border: `1px solid ${statusColor(job.status)}20`,
                          background: `${statusColor(job.status)}10`,
                        }}>
                          <div style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>{statusIcon(job.status)}</div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{job.name}</div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', marginTop: '0.125rem' }}>{job.duration}</div>
                        </div>
                        {i < pipeline.jobs.length - 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>→</div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Deployments */}
      {activeView === 'deployments' && (
        <div style={{ borderRadius: '0.75rem', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                {['Environment', 'Service', 'Version', 'Status', 'Deployed', 'By'].map(h => (
                  <th key={h} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEPLOYMENTS.map(dep => (
                <tr key={dep.id}>
                  <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ padding: '0.125rem 0.5rem', borderRadius: '1rem', background: 'rgba(99,102,241,0.15)', color: 'var(--color-primary)', fontSize: '0.6875rem', fontWeight: 600 }}>
                      {dep.environment}
                    </span>
                  </td>
                  <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>{dep.service}</td>
                  <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{dep.version}</td>
                  <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ padding: '0.125rem 0.5rem', borderRadius: '1rem', background: 'rgba(34,197,94,0.15)', color: 'var(--color-success)', fontSize: '0.6875rem', fontWeight: 600 }}>
                      ✓ {dep.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>{dep.deployedAt}</td>
                  <td style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>{dep.deployedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Config */}
      {activeView === 'config' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>⚙️ Pipeline Configuration</h3>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', background: 'var(--color-surface)', padding: '1rem', borderRadius: '0.5rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflow: 'auto' }}>
{`# .github/workflows/ci-compliance.yml
# 8-Job Pipeline: quality → test → security → compliance → build → deploy

Jobs:
  1. quality     — ESLint, Prettier, TypeScript strict
  2. test        — Vitest unit + integration tests
  3. security    — Trivy (containers), Gitleaks (secrets), OWASP ZAP
  4. compliance  — OpenSCAP ISO 27001 controls
  5. build       — Turborepo build (all packages)
  6. deploy-pages   — Cloudflare Pages (shell)
  7. deploy-workers — Cloudflare Workers (6 services)
  8. notify-failure — Slack/Discord on failure

Triggers:
  - Push to main (full pipeline)
  - Pull requests (quality + test + security)
  - Schedule: daily security audit at 03:00 UTC
  - Manual dispatch for emergency deploys

Environment:
  - Node.js 20.x
  - pnpm 8.x
  - Rust toolchain (for policy-engine WASM)
  - Wrangler CLI (Cloudflare deployments)`}
            </div>
          </div>

          <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>🛡️ Security Gates</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem' }}>
              {[
                { gate: 'Trivy Container Scan', threshold: 'No CRITICAL/HIGH CVEs', status: 'enforced' },
                { gate: 'Gitleaks Secret Detection', threshold: 'Zero secrets in code', status: 'enforced' },
                { gate: 'OWASP ZAP DAST', threshold: 'No high-risk findings', status: 'enforced' },
                { gate: 'OpenSCAP Compliance', threshold: 'ISO 27001 Annex A pass', status: 'enforced' },
                { gate: 'Dependency Audit', threshold: 'No known vulnerabilities', status: 'enforced' },
                { gate: 'Code Coverage', threshold: '≥80% line coverage', status: 'warning' },
              ].map(g => (
                <div key={g.gate} style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span style={{ color: g.status === 'enforced' ? 'var(--color-success)' : 'var(--color-warning)' }}>
                    {g.status === 'enforced' ? '🔒' : '⚠️'}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{g.gate}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{g.threshold}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}