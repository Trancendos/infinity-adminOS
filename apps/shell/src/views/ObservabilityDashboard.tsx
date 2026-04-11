import React, { useState, useEffect, useCallback } from 'react';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency: number;
  uptime: number;
  lastCheck: string;
  errorRate: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  message: string;
  traceId?: string;
}

interface MetricSummary {
  totalRequests: number;
  avgLatency: number;
  errorRate: number;
  activeConnections: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
}

const SERVICES: ServiceHealth[] = [
  { name: 'Identity', status: 'healthy', latency: 12, uptime: 99.99, lastCheck: new Date().toISOString(), errorRate: 0.01 },
  { name: 'Filesystem', status: 'healthy', latency: 24, uptime: 99.97, lastCheck: new Date().toISOString(), errorRate: 0.02 },
  { name: 'Registry', status: 'healthy', latency: 18, uptime: 99.98, lastCheck: new Date().toISOString(), errorRate: 0.01 },
  { name: 'Search', status: 'healthy', latency: 45, uptime: 99.95, lastCheck: new Date().toISOString(), errorRate: 0.03 },
  { name: 'AI', status: 'degraded', latency: 230, uptime: 99.80, lastCheck: new Date().toISOString(), errorRate: 0.15 },
  { name: 'Notifications', status: 'healthy', latency: 15, uptime: 99.99, lastCheck: new Date().toISOString(), errorRate: 0.005 },
];

const statusIcon = (status: string) => {
  switch (status) {
    case 'healthy': return '🟢';
    case 'degraded': return '🟡';
    case 'down': return '🔴';
    default: return '⚪';
  }
};

const levelColor = (level: string) => {
  switch (level) {
    case 'error': return 'var(--color-error)';
    case 'warn': return 'var(--color-warning)';
    case 'info': return 'var(--color-primary)';
    default: return 'var(--color-text-secondary)';
  }
};

export default function ObservabilityDashboard() {
  const [services, setServices] = useState<ServiceHealth[]>(SERVICES);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<MetricSummary>({
    totalRequests: 0, avgLatency: 0, errorRate: 0, activeConnections: 0,
    cpuUsage: 0, memoryUsage: 0, diskUsage: 0, networkIn: 0, networkOut: 0,
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'metrics' | 'alerts'>('overview');
  const [logFilter, setLogFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const generateMockData = useCallback(() => {
    setServices(prev => prev.map(s => ({
      ...s,
      latency: Math.max(5, s.latency + (Math.random() - 0.5) * 10),
      lastCheck: new Date().toISOString(),
    })));

    setMetrics({
      totalRequests: Math.floor(Math.random() * 50000) + 100000,
      avgLatency: Math.floor(Math.random() * 50) + 20,
      errorRate: Math.random() * 0.05,
      activeConnections: Math.floor(Math.random() * 200) + 50,
      cpuUsage: Math.random() * 40 + 10,
      memoryUsage: Math.random() * 30 + 40,
      diskUsage: Math.random() * 20 + 30,
      networkIn: Math.floor(Math.random() * 1000) + 500,
      networkOut: Math.floor(Math.random() * 500) + 200,
    });

    const newLog: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: ['info', 'info', 'info', 'warn', 'error'][Math.floor(Math.random() * 5)] as LogEntry['level'],
      service: SERVICES[Math.floor(Math.random() * SERVICES.length)].name.toLowerCase(),
      message: [
        'Request processed successfully',
        'Cache hit for user session',
        'Database query completed in 12ms',
        'Rate limit approaching threshold',
        'Connection timeout to upstream service',
        'JWT token refreshed',
        'File uploaded to R2 storage',
        'Search index updated',
        'AI inference completed',
        'Webhook delivered successfully',
      ][Math.floor(Math.random() * 10)],
    };

    setLogs(prev => [newLog, ...prev].slice(0, 200));
  }, []);

  useEffect(() => {
    generateMockData();
    if (!autoRefresh) return;
    const interval = setInterval(generateMockData, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, generateMockData]);

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.level === logFilter);

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflow: 'auto', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>🔭 Observation Centre</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Real-time system monitoring and log aggregation
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh
          </label>
          <button onClick={generateMockData} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: 'pointer', color: 'var(--color-text)' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        {(['overview', 'logs', 'metrics', 'alerts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.5rem 0.5rem 0 0', border: 'none', cursor: 'pointer',
              background: activeTab === tab ? 'var(--color-primary)' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--color-text-secondary)',
              fontWeight: activeTab === tab ? 600 : 400, fontSize: '0.875rem', textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Service Health Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {services.map(service => (
              <div key={service.name} style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{service.name}</span>
                  <span>{statusIcon(service.status)}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  <div>Latency: {Math.round(service.latency)}ms</div>
                  <div>Uptime: {service.uptime}%</div>
                  <div>Error Rate: {(service.errorRate * 100).toFixed(2)}%</div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Total Requests', value: metrics.totalRequests.toLocaleString(), icon: '📊' },
              { label: 'Avg Latency', value: `${metrics.avgLatency}ms`, icon: '⚡' },
              { label: 'Error Rate', value: `${(metrics.errorRate * 100).toFixed(2)}%`, icon: '❌' },
              { label: 'Active Connections', value: metrics.activeConnections.toString(), icon: '🔗' },
              { label: 'CPU Usage', value: `${metrics.cpuUsage.toFixed(1)}%`, icon: '🖥️' },
              { label: 'Memory Usage', value: `${metrics.memoryUsage.toFixed(1)}%`, icon: '🧠' },
            ].map(m => (
              <div key={m.label} style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{m.icon}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{m.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Recent Logs Preview */}
          <div style={{ borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: '0.875rem' }}>
              📝 Recent Logs
            </div>
            <div style={{ maxHeight: '300px', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              {logs.slice(0, 20).map(log => (
                <div key={log.id} style={{ padding: '0.375rem 1rem', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--color-text-secondary)', minWidth: '80px' }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span style={{ color: levelColor(log.level), minWidth: '50px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.625rem' }}>{log.level}</span>
                  <span style={{ color: 'var(--color-primary)', minWidth: '90px' }}>{log.service}</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {['all', 'error', 'warn', 'info', 'debug'].map(level => (
              <button
                key={level}
                onClick={() => setLogFilter(level)}
                style={{
                  padding: '0.375rem 0.75rem', borderRadius: '1rem', border: '1px solid var(--color-border)',
                  background: logFilter === level ? 'var(--color-primary)' : 'var(--color-bg)',
                  color: logFilter === level ? '#fff' : 'var(--color-text)', cursor: 'pointer', fontSize: '0.75rem', textTransform: 'uppercase',
                }}
              >
                {level} {level !== 'all' && `(${logs.filter(l => l.level === level).length})`}
              </button>
            ))}
          </div>
          <div style={{ borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            {filteredLogs.map(log => (
              <div key={log.id} style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--color-text-secondary)', minWidth: '160px' }}>{new Date(log.timestamp).toISOString()}</span>
                <span style={{ color: levelColor(log.level), minWidth: '50px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.625rem' }}>{log.level}</span>
                <span style={{ color: 'var(--color-primary)', minWidth: '100px' }}>[{log.service}]</span>
                <span style={{ flex: 1 }}>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {/* Resource Gauges */}
          {[
            { label: 'CPU Usage', value: metrics.cpuUsage, max: 100, unit: '%', color: metrics.cpuUsage > 80 ? 'var(--color-error)' : metrics.cpuUsage > 60 ? 'var(--color-warning)' : 'var(--color-success)' },
            { label: 'Memory Usage', value: metrics.memoryUsage, max: 100, unit: '%', color: metrics.memoryUsage > 80 ? 'var(--color-error)' : metrics.memoryUsage > 60 ? 'var(--color-warning)' : 'var(--color-success)' },
            { label: 'Disk Usage', value: metrics.diskUsage, max: 100, unit: '%', color: metrics.diskUsage > 80 ? 'var(--color-error)' : metrics.diskUsage > 60 ? 'var(--color-warning)' : 'var(--color-success)' },
          ].map(gauge => (
            <div key={gauge.label} style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
              <div style={{ fontWeight: 600, marginBottom: '1rem' }}>{gauge.label}</div>
              <div style={{ position: 'relative', height: '12px', borderRadius: '6px', background: 'var(--color-border)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${gauge.value}%`, borderRadius: '6px', background: gauge.color, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '1.5rem', fontWeight: 700 }}>{gauge.value.toFixed(1)}{gauge.unit}</div>
            </div>
          ))}

          {/* Network Stats */}
          <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <div style={{ fontWeight: 600, marginBottom: '1rem' }}>🌐 Network I/O</div>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>↓ Ingress</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success)' }}>{metrics.networkIn} KB/s</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>↑ Egress</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-primary)' }}>{metrics.networkOut} KB/s</div>
              </div>
            </div>
          </div>

          {/* Per-Service Latency */}
          <div style={{ padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)', gridColumn: 'span 2' }}>
            <div style={{ fontWeight: 600, marginBottom: '1rem' }}>⚡ Service Latency (ms)</div>
            {services.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <span style={{ minWidth: '100px', fontSize: '0.875rem' }}>{s.name}</span>
                <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--color-border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (s.latency / 300) * 100)}%`, borderRadius: '4px', background: s.latency > 200 ? 'var(--color-error)' : s.latency > 100 ? 'var(--color-warning)' : 'var(--color-success)', transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ minWidth: '60px', textAlign: 'right', fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{Math.round(s.latency)}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {[
              { severity: 'warning', title: 'AI Service Latency Elevated', message: 'p95 latency exceeded 200ms threshold for the past 5 minutes', time: '2 min ago', service: 'AI' },
              { severity: 'info', title: 'Scheduled Maintenance Window', message: 'Database maintenance scheduled for 03:00 UTC', time: '1 hour ago', service: 'System' },
              { severity: 'resolved', title: 'Search Index Rebuild Complete', message: 'Full reindex completed successfully in 12 minutes', time: '3 hours ago', service: 'Search' },
            ].map((alert, i) => (
              <div key={i} style={{
                padding: '1rem 1.25rem', borderRadius: '0.75rem', border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                borderLeft: `4px solid ${alert.severity === 'warning' ? 'var(--color-warning)' : alert.severity === 'info' ? 'var(--color-primary)' : 'var(--color-success)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    {alert.severity === 'warning' ? '⚠️' : alert.severity === 'info' ? 'ℹ️' : '✅'} {alert.title}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{alert.time}</span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{alert.message}</div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                  <span style={{ padding: '0.125rem 0.5rem', borderRadius: '1rem', background: 'var(--color-border)', fontSize: '0.6875rem' }}>{alert.service}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}