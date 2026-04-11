import React, { useState } from 'react';

interface TableInfo {
  name: string;
  schema: string;
  rows: number;
  size: string;
  lastVacuum: string;
  rlsEnabled: boolean;
}

interface QueryResult {
  columns: string[];
  rows: string[][];
  rowCount: number;
  executionTime: number;
  error?: string;
}

const TABLES: TableInfo[] = [
  { name: 'users', schema: 'public', rows: 1247, size: '2.4 MB', lastVacuum: '2 hours ago', rlsEnabled: true },
  { name: 'organisations', schema: 'public', rows: 89, size: '128 KB', lastVacuum: '2 hours ago', rlsEnabled: true },
  { name: 'file_nodes', schema: 'public', rows: 15832, size: '18.7 MB', lastVacuum: '1 hour ago', rlsEnabled: true },
  { name: 'file_versions', schema: 'public', rows: 42156, size: '8.2 MB', lastVacuum: '1 hour ago', rlsEnabled: true },
  { name: 'module_manifests', schema: 'public', rows: 234, size: '512 KB', lastVacuum: '3 hours ago', rlsEnabled: true },
  { name: 'module_installations', schema: 'public', rows: 3891, size: '1.1 MB', lastVacuum: '3 hours ago', rlsEnabled: true },
  { name: 'app_store_listings', schema: 'public', rows: 178, size: '384 KB', lastVacuum: '4 hours ago', rlsEnabled: true },
  { name: 'notifications', schema: 'public', rows: 28456, size: '12.3 MB', lastVacuum: '30 min ago', rlsEnabled: true },
  { name: 'audit_logs', schema: 'public', rows: 156789, size: '89.4 MB', lastVacuum: '15 min ago', rlsEnabled: true },
  { name: 'consent_records', schema: 'public', rows: 2494, size: '768 KB', lastVacuum: '2 hours ago', rlsEnabled: true },
];

const SAMPLE_QUERIES: Array<{ label: string; query: string }> = [
  { label: 'Active Users (24h)', query: 'SELECT count(*) FROM users WHERE last_login_at > now() - interval \'24 hours\';' },
  { label: 'Top Modules', query: 'SELECT m.name, count(i.id) as installs\nFROM module_manifests m\nJOIN module_installations i ON m.id = i.module_id\nGROUP BY m.name\nORDER BY installs DESC\nLIMIT 10;' },
  { label: 'Storage Usage', query: 'SELECT\n  pg_size_pretty(pg_database_size(current_database())) as db_size,\n  pg_size_pretty(sum(pg_total_relation_size(quote_ident(tablename)))) as total_tables\nFROM pg_tables\nWHERE schemaname = \'public\';' },
  { label: 'Recent Audit Logs', query: 'SELECT action, actor_id, target_type, created_at\nFROM audit_logs\nORDER BY created_at DESC\nLIMIT 20;' },
  { label: 'RLS Policies', query: 'SELECT tablename, policyname, cmd, qual\nFROM pg_policies\nWHERE schemaname = \'public\'\nORDER BY tablename;' },
];

export default function DatabaseConsole() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeView, setActiveView] = useState<'tables' | 'query' | 'stats'>('tables');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const executeQuery = async () => {
    if (!query.trim()) return;
    setIsExecuting(true);

    // Simulate query execution
    await new Promise(r => setTimeout(r, 300 + Math.random() * 500));

    if (query.toLowerCase().includes('drop') || query.toLowerCase().includes('truncate') || query.toLowerCase().includes('delete')) {
      setResults({
        columns: [],
        rows: [],
        rowCount: 0,
        executionTime: 0,
        error: '🛡️ Destructive operations are blocked in the console. Use migrations for schema changes.',
      });
    } else {
      setResults({
        columns: ['id', 'name', 'email', 'role', 'created_at'],
        rows: [
          ['1', 'admin', 'admin@infinity-os.dev', 'owner', '2024-01-15T10:00:00Z'],
          ['2', 'drew', 'drew@example.com', 'admin', '2024-01-16T14:30:00Z'],
          ['3', 'agent-alpha', 'agent@infinity-os.dev', 'member', '2024-02-01T09:15:00Z'],
        ],
        rowCount: 3,
        executionTime: Math.floor(Math.random() * 50) + 5,
      });
    }

    setIsExecuting(false);
  };

  const totalSize = '134.2 MB';
  const totalRows = TABLES.reduce((sum, t) => sum + t.rows, 0);

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>🗄️ Database Console</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            PostgreSQL 15 — Supabase (Free Tier) — RLS Enabled
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ padding: '0.375rem 0.75rem', borderRadius: '1rem', background: 'var(--color-success)', color: '#fff', fontSize: '0.75rem', fontWeight: 600 }}>
            🟢 Connected
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Tables', value: TABLES.length.toString(), icon: '📋' },
          { label: 'Total Rows', value: totalRows.toLocaleString(), icon: '📊' },
          { label: 'Database Size', value: totalSize, icon: '💾' },
          { label: 'RLS Policies', value: 'All Active', icon: '🛡️' },
          { label: 'Extensions', value: 'pgvector, pg_trgm', icon: '🧩' },
        ].map(card => (
          <div key={card.label} style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{card.icon}</div>
            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{card.value}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        {(['tables', 'query', 'stats'] as const).map(tab => (
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
            {tab === 'tables' ? '📋 Tables' : tab === 'query' ? '⚡ Query Editor' : '📈 Statistics'}
          </button>
        ))}
      </div>

      {/* Tables View */}
      {activeView === 'tables' && (
        <div style={{ borderRadius: '0.75rem', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                {['Table', 'Schema', 'Rows', 'Size', 'Last Vacuum', 'RLS'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', borderBottom: '2px solid var(--color-border)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TABLES.map(table => (
                <tr
                  key={table.name}
                  onClick={() => setSelectedTable(selectedTable === table.name ? null : table.name)}
                  style={{ cursor: 'pointer', background: selectedTable === table.name ? 'var(--color-primary-light, rgba(99,102,241,0.1))' : 'transparent' }}
                >
                  <td style={{ padding: '0.625rem 1rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-primary)' }}>
                    {table.name}
                  </td>
                  <td style={{ padding: '0.625rem 1rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>{table.schema}</td>
                  <td style={{ padding: '0.625rem 1rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>{table.rows.toLocaleString()}</td>
                  <td style={{ padding: '0.625rem 1rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>{table.size}</td>
                  <td style={{ padding: '0.625rem 1rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>{table.lastVacuum}</td>
                  <td style={{ padding: '0.625rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ padding: '0.125rem 0.5rem', borderRadius: '1rem', background: table.rlsEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: table.rlsEnabled ? 'var(--color-success)' : 'var(--color-error)', fontSize: '0.6875rem', fontWeight: 600 }}>
                      {table.rlsEnabled ? '✓ Enabled' : '✗ Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Query Editor */}
      {activeView === 'query' && (
        <div>
          {/* Quick Queries */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {SAMPLE_QUERIES.map(sq => (
              <button
                key={sq.label}
                onClick={() => setQuery(sq.query)}
                style={{ padding: '0.375rem 0.75rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-text)' }}
              >
                {sq.label}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div style={{ marginBottom: '1rem' }}>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Enter SQL query... (SELECT only — destructive operations are blocked)"
              style={{
                width: '100%', minHeight: '120px', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)',
                background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
                resize: 'vertical', outline: 'none',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) executeQuery(); }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Ctrl+Enter to execute</span>
              <button
                onClick={executeQuery}
                disabled={isExecuting || !query.trim()}
                style={{
                  padding: '0.5rem 1.5rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer',
                  background: 'var(--color-primary)', color: '#fff', fontWeight: 600, fontSize: '0.875rem',
                  opacity: isExecuting || !query.trim() ? 0.5 : 1,
                }}
              >
                {isExecuting ? '⏳ Executing...' : '▶ Execute'}
              </button>
            </div>
          </div>

          {/* Results */}
          {results && (
            <div style={{ borderRadius: '0.75rem', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              {results.error ? (
                <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', color: 'var(--color-error)' }}>
                  {results.error}
                </div>
              ) : (
                <>
                  <div style={{ padding: '0.5rem 1rem', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{results.rowCount} rows returned</span>
                    <span>{results.executionTime}ms</span>
                  </div>
                  <div style={{ overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
                      <thead>
                        <tr>
                          {results.columns.map(col => (
                            <th key={col} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', borderBottom: '2px solid var(--color-border)', background: 'var(--color-bg)', fontWeight: 600, fontSize: '0.75rem' }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.rows.map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td key={j} style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Statistics View */}
      {activeView === 'stats' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {/* Table Size Distribution */}
          <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600 }}>📊 Table Size Distribution</h3>
            {TABLES.sort((a, b) => parseFloat(b.size) - parseFloat(a.size)).map(t => {
              const sizeNum = parseFloat(t.size);
              const maxSize = 89.4;
              return (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ minWidth: '120px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{t.name}</span>
                  <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--color-border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(sizeNum / maxSize) * 100}%`, borderRadius: '3px', background: 'var(--color-primary)' }} />
                  </div>
                  <span style={{ minWidth: '60px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{t.size}</span>
                </div>
              );
            })}
          </div>

          {/* Connection Pool */}
          <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600 }}>🔗 Connection Pool</h3>
            {[
              { label: 'Active Connections', value: '12 / 60', pct: 20 },
              { label: 'Idle Connections', value: '8', pct: 13 },
              { label: 'Max Connections', value: '60 (Free Tier)', pct: 100 },
              { label: 'Avg Query Time', value: '8.3ms', pct: 8 },
              { label: 'Cache Hit Ratio', value: '99.2%', pct: 99 },
            ].map(stat => (
              <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.8125rem' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{stat.label}</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{stat.value}</span>
              </div>
            ))}
          </div>

          {/* GDPR Compliance */}
          <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', gridColumn: 'span 2' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600 }}>🛡️ Compliance Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {[
                { check: 'Row Level Security', status: 'pass', detail: 'All tables protected' },
                { check: 'Encryption at Rest', status: 'pass', detail: 'AES-256 via Supabase' },
                { check: 'Audit Logging', status: 'pass', detail: '156,789 entries' },
                { check: 'Consent Records', status: 'pass', detail: 'GDPR Art. 7 compliant' },
                { check: 'Data Retention', status: 'pass', detail: '90-day policy active' },
                { check: 'Crypto-Shredding', status: 'pass', detail: 'Vault integration ready' },
              ].map(c => (
                <div key={c.check} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span style={{ color: c.status === 'pass' ? 'var(--color-success)' : 'var(--color-error)', fontSize: '1rem' }}>
                    {c.status === 'pass' ? '✅' : '❌'}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{c.check}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>{c.detail}</div>
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