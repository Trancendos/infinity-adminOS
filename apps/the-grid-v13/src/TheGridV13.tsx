/**
 * TheGridV13
 * 
 * Version 13 of The Grid — the most advanced iteration of the Trancendos 
 * intelligence network interface.
 *
 * Three core systems:
 * 1. Queen's Hive  — Distributed agent intelligence network (swarm AI)
 * 2. HAX           — Hostile Activity eXchange threat matrix
 * 3. Voxx          — Agent-to-agent communication protocol visualiser
 *
 * The Grid is the nerve centre where all intelligence converges.
 * It visualises the living, breathing intelligence of the Trancendos
 * Universe in real-time — every agent decision, every threat signal,
 * every inter-agent communication rendered as data in motion.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type HiveNodeStatus = 'ACTIVE' | 'PROCESSING' | 'IDLE' | 'COMPROMISED';
type ThreatLevel = 'TRACE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type VoxxProtocol = 'DIRECT' | 'BROADCAST' | 'ENCRYPTED' | 'SLIPSTREAM';

interface HiveNode {
  nodeId: string;
  name: string;
  role: string;
  status: HiveNodeStatus;
  intelligence: number;   // 0-100 IQ score
  connections: string[];  // other node IDs
  x: number; y: number;  // canvas position
  taskCount: number;
  decisionRate: number;   // decisions/sec
}

interface HAXSignal {
  signalId: string;
  threatClass: string;
  level: ThreatLevel;
  source: string;
  target: string;
  timestamp: number;
  contained: boolean;
  confidence: number;
}

interface VoxxMessage {
  msgId: string;
  from: string;
  to: string;
  protocol: VoxxProtocol;
  content: string;
  encrypted: boolean;
  timestamp: number;
  acknowledged: boolean;
}

interface GridMetrics {
  totalNodes: number;
  activeNodes: number;
  decisionsPerSec: number;
  threatSignals: number;
  messagesPerSec: number;
  networkIQ: number;
  gridVersion: string;
}

// ── Hive Data ─────────────────────────────────────────────────────────────────

const HIVE_NODES: HiveNode[] = [
  { nodeId: 'QUEEN', name: 'Queen Prime', role: 'SOVEREIGN_CONTROLLER', status: 'ACTIVE', intelligence: 98, connections: ['SENTINEL', 'ORACLE', 'GUARDIAN', 'ECONOMIST'], x: 50, y: 50, taskCount: 847, decisionRate: 234 },
  { nodeId: 'SENTINEL', name: 'Sentinel Core', role: 'NETWORK_HUB', status: 'ACTIVE', intelligence: 94, connections: ['QUEEN', 'GUARDIAN', 'ANALYST'], x: 25, y: 25, taskCount: 1203, decisionRate: 1847 },
  { nodeId: 'ORACLE', name: 'Oracle Foresight', role: 'INTELLIGENCE', status: 'PROCESSING', intelligence: 96, connections: ['QUEEN', 'CHRONO', 'ECONOMIST'], x: 75, y: 25, taskCount: 312, decisionRate: 67 },
  { nodeId: 'GUARDIAN', name: 'Penumbra Watch', role: 'SECURITY', status: 'ACTIVE', intelligence: 91, connections: ['QUEEN', 'SENTINEL', 'CHRONO'], x: 20, y: 65, taskCount: 89, decisionRate: 23 },
  { nodeId: 'ECONOMIST', name: 'Doris-Cornelius', role: 'FINANCE', status: 'ACTIVE', intelligence: 93, connections: ['QUEEN', 'ORACLE', 'ANALYST'], x: 80, y: 65, taskCount: 156, decisionRate: 45 },
  { nodeId: 'CHRONO', name: 'Chrono-Intelligence', role: 'TEMPORAL', status: 'PROCESSING', intelligence: 95, connections: ['ORACLE', 'GUARDIAN'], x: 50, y: 15, taskCount: 234, decisionRate: 12 },
  { nodeId: 'ANALYST', name: 'Chrono-Sigma', role: 'ANALYTICS', status: 'IDLE', intelligence: 89, connections: ['SENTINEL', 'ECONOMIST'], x: 50, y: 82, taskCount: 67, decisionRate: 8 },
];

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useHiveNetwork() {
  const [nodes, setNodes] = useState<HiveNode[]>(HIVE_NODES);
  const [activeEdge, setActiveEdge] = useState<[string, string] | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNodes(prev => prev.map(node => ({
        ...node,
        taskCount: Math.max(0, node.taskCount + Math.floor((Math.random() - 0.4) * 20)),
        decisionRate: Math.max(0, node.decisionRate + Math.floor((Math.random() - 0.5) * 15)),
        status: Math.random() < 0.05
          ? (['ACTIVE', 'PROCESSING', 'IDLE'] as HiveNodeStatus[])[Math.floor(Math.random() * 3)]!
          : node.status,
      })));

      // Animate random edge
      const node = HIVE_NODES[Math.floor(Math.random() * HIVE_NODES.length)]!;
      if (node.connections.length > 0) {
        const target = node.connections[Math.floor(Math.random() * node.connections.length)]!;
        setActiveEdge([node.nodeId, target]);
        setTimeout(() => setActiveEdge(null), 600);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return { nodes, activeEdge };
}

function useHAXMatrix() {
  const [signals, setSignals] = useState<HAXSignal[]>([
    { signalId: 'HAX-001', threatClass: 'ADVERSARIAL_ML', level: 'HIGH', source: 'EXTERNAL', target: 'ORACLE', timestamp: Date.now() - 3600000, contained: true, confidence: 0.87 },
    { signalId: 'HAX-002', threatClass: 'DARK_PATTERN', level: 'MEDIUM', source: 'L03', target: 'UI', timestamp: Date.now() - 7200000, contained: false, confidence: 0.73 },
    { signalId: 'HAX-003', threatClass: 'QUANTUM_HARVEST', level: 'CRITICAL', source: 'UNKNOWN', target: 'PQC', timestamp: Date.now() - 1800000, contained: true, confidence: 0.91 },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.15) {
        const classes = ['ADVERSARIAL_ML', 'DARK_PATTERN', 'INSIDER_THREAT', 'APT', 'SUPPLY_CHAIN'];
        const levels: ThreatLevel[] = ['TRACE', 'LOW', 'MEDIUM', 'HIGH'];
        const targets = ['SENTINEL', 'ORACLE', 'BER', 'PQC', 'UPIF'];
        const newSignal: HAXSignal = {
          signalId: `HAX-${Date.now().toString(36).toUpperCase()}`,
          threatClass: classes[Math.floor(Math.random() * classes.length)]!,
          level: levels[Math.floor(Math.random() * levels.length)]!,
          source: `L${String(Math.floor(Math.random() * 23) + 1).padStart(2, '0')}`,
          target: targets[Math.floor(Math.random() * targets.length)]!,
          timestamp: Date.now(),
          contained: Math.random() > 0.4,
          confidence: 0.6 + Math.random() * 0.39,
        };
        setSignals(prev => [newSignal, ...prev].slice(0, 12));
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return signals;
}

function useVoxxStream() {
  const [messages, setMessages] = useState<VoxxMessage[]>([
    { msgId: 'VOX-001', from: 'ORACLE', to: 'QUEEN', protocol: 'SLIPSTREAM', content: 'Temporal anomaly detected in L07 revenue trajectory', encrypted: true, timestamp: Date.now() - 30000, acknowledged: true },
    { msgId: 'VOX-002', from: 'GUARDIAN', to: 'SENTINEL', protocol: 'ENCRYPTED', content: 'PQC key rotation scheduled for WARP-SEN-001', encrypted: true, timestamp: Date.now() - 60000, acknowledged: true },
    { msgId: 'VOX-003', from: 'ECONOMIST', to: 'QUEEN', protocol: 'DIRECT', content: 'FAST ratio: 0.78 — above threshold', encrypted: false, timestamp: Date.now() - 90000, acknowledged: true },
  ]);

  const protocols: VoxxProtocol[] = ['DIRECT', 'BROADCAST', 'ENCRYPTED', 'SLIPSTREAM'];
  const sampleMessages = [
    'Slipstream Class A tunnel established',
    'Oracle consensus reached: ASCENDING trajectory',
    'BER state transition: LUCID → OVERLOAD → LUCID',
    'DePIN device L18 battery critical: 12%',
    'Chrono forecast: 87.3% universe health score',
    'TIGA policy validated: ISO 42001 compliant',
    'UPIF identity issued: tier TRUSTED',
    'Carbon routing: GREEN zone selected (18 gCO2/kWh)',
    'L402 invoice paid: 5 sats → oracle-foresight',
    'Dimensional Fabric sync: 30/30 Dimensionals active',
  ];

  useEffect(() => {
    const nodes = ['QUEEN', 'SENTINEL', 'ORACLE', 'GUARDIAN', 'ECONOMIST', 'CHRONO', 'ANALYST'];
    const interval = setInterval(() => {
      if (Math.random() < 0.4) {
        const from = nodes[Math.floor(Math.random() * nodes.length)]!;
        let to = nodes[Math.floor(Math.random() * nodes.length)]!;
        while (to === from) to = nodes[Math.floor(Math.random() * nodes.length)]!;
        const msg: VoxxMessage = {
          msgId: `VOX-${Date.now().toString(36).toUpperCase()}`,
          from, to,
          protocol: protocols[Math.floor(Math.random() * protocols.length)]!,
          content: sampleMessages[Math.floor(Math.random() * sampleMessages.length)]!,
          encrypted: Math.random() > 0.4,
          timestamp: Date.now(),
          acknowledged: false,
        };
        setMessages(prev => [msg, ...prev].slice(0, 20));
        setTimeout(() => {
          setMessages(prev => prev.map(m => m.msgId === msg.msgId ? { ...m, acknowledged: true } : m));
        }, 2000 + Math.random() * 3000);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return messages;
}

// ── Grid Canvas ───────────────────────────────────────────────────────────────

const HiveCanvas: React.FC<{ nodes: HiveNode[]; activeEdge: [string,string] | null }> = ({ nodes, activeEdge }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Grid background
    ctx.strokeStyle = 'rgba(0,255,136,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const getXY = (n: HiveNode) => ({ x: (n.x / 100) * W, y: (n.y / 100) * H });

    // Draw edges
    nodes.forEach(node => {
      node.connections.forEach(targetId => {
        const target = nodes.find(n => n.nodeId === targetId);
        if (!target) return;
        const from = getXY(node), to = getXY(target);
        const isActive = activeEdge && ((activeEdge[0] === node.nodeId && activeEdge[1] === targetId) || (activeEdge[1] === node.nodeId && activeEdge[0] === targetId));
        ctx.strokeStyle = isActive ? 'rgba(0,255,136,0.8)' : 'rgba(0,255,136,0.12)';
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.setLineDash(isActive ? [] : [4, 8]);
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        ctx.setLineDash([]);

        // Animate packet on active edge
        if (isActive) {
          const t = (Date.now() % 600) / 600;
          const px = from.x + (to.x - from.x) * t, py = from.y + (to.y - from.y) * t;
          ctx.fillStyle = '#00FF88';
          ctx.shadowBlur = 8; ctx.shadowColor = '#00FF88';
          ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      });
    });

    // Draw nodes
    nodes.forEach(node => {
      const { x, y } = getXY(node);
      const isQueen = node.nodeId === 'QUEEN';
      const statusColor = { ACTIVE: '#00FF88', PROCESSING: '#00BFFF', IDLE: '#475569', COMPROMISED: '#FF3366' }[node.status];

      // Node glow
      ctx.shadowBlur = isQueen ? 20 : 10;
      ctx.shadowColor = statusColor;

      // Node circle
      const r = isQueen ? 22 : 14;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isQueen ? 'rgba(0,255,136,0.15)' : 'rgba(0,0,0,0.6)';
      ctx.fill();
      ctx.strokeStyle = statusColor;
      ctx.lineWidth = isQueen ? 2.5 : 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Intelligence ring
      ctx.beginPath();
      ctx.arc(x, y, r + 5, -Math.PI/2, -Math.PI/2 + (node.intelligence / 100) * Math.PI * 2);
      ctx.strokeStyle = `${statusColor}44`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = isQueen ? '#00FF88' : '#94A3B8';
      ctx.font = `${isQueen ? '700' : '400'} ${isQueen ? 10 : 9}px JetBrains Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(node.name.split(' ')[0]!, x, y + r + 14);
      if (isQueen) {
        ctx.fillStyle = '#475569';
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.fillText(`IQ:${node.intelligence}`, x, y + r + 24);
      }
    });
  }, [nodes, activeEdge]);

  return (
    <canvas ref={canvasRef} width={500} height={280}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const TheGridV13: React.FC = () => {
  const { nodes, activeEdge } = useHiveNetwork();
  const haxSignals = useHAXMatrix();
  const voxxMessages = useVoxxStream();
  const [activeTab, setActiveTab] = useState<'hive' | 'hax' | 'voxx'>('hive');

  const metrics: GridMetrics = {
    totalNodes: nodes.length,
    activeNodes: nodes.filter(n => n.status !== 'IDLE').length,
    decisionsPerSec: nodes.reduce((s, n) => s + n.decisionRate, 0),
    threatSignals: haxSignals.filter(s => !s.contained).length,
    messagesPerSec: Math.floor(voxxMessages.filter(m => Date.now() - m.timestamp < 5000).length / 5),
    networkIQ: Math.round(nodes.reduce((s, n) => s + n.intelligence, 0) / nodes.length),
    gridVersion: 'v13.0',
  };

  const threatLevelColor: Record<ThreatLevel, string> = {
    TRACE: '#475569', LOW: '#64748B', MEDIUM: '#F59E0B', HIGH: '#FF3366', CRITICAL: '#FF0040',
  };

  const protoColor: Record<VoxxProtocol, string> = {
    DIRECT: '#00FF88', BROADCAST: '#FFB800', ENCRYPTED: '#9945FF', SLIPSTREAM: '#00BFFF',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#020408', color: '#C8D8E8', fontFamily: 'JetBrains Mono, monospace', padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(0,255,136,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            border: '2px solid #00FF88', background: 'rgba(0,255,136,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: '0 0 16px rgba(0,255,136,0.3)',
          }}>⬡</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#00FF88', letterSpacing: '0.05em' }}>THE GRID</div>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: '0.15em' }}>VERSION 13 · QUEEN\'S HIVE INTELLIGENCE NETWORK</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { label: 'NETWORK IQ', value: metrics.networkIQ, color: '#00FF88' },
            { label: 'THREATS', value: metrics.threatSignals, color: metrics.threatSignals > 0 ? '#FF3366' : '#00FF88' },
            { label: 'DEC/SEC', value: metrics.decisionsPerSec, color: '#00BFFF' },
          ].map(m => (
            <div key={m.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#475569', letterSpacing: '0.12em' }}>{m.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
        {([
          { id: 'hive', label: '⬡ QUEEN\'S HIVE', color: '#00FF88' },
          { id: 'hax', label: '⚠ HAX MATRIX', color: '#FF3366' },
          { id: 'voxx', label: '◈ VOXX STREAM', color: '#00BFFF' },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '7px 16px', background: activeTab === tab.id ? `${tab.color}15` : 'transparent',
            border: `1px solid ${activeTab === tab.id ? tab.color : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 6, color: activeTab === tab.id ? tab.color : '#475569',
            fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
            letterSpacing: '0.08em', transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Hive Tab */}
      {activeTab === 'hive' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.1)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: '0.12em', marginBottom: 12 }}>HIVE TOPOLOGY — {metrics.activeNodes}/{metrics.totalNodes} ACTIVE</div>
            <HiveCanvas nodes={nodes} activeEdge={activeEdge} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {nodes.map(node => {
              const statusColor = { ACTIVE: '#00FF88', PROCESSING: '#00BFFF', IDLE: '#475569', COMPROMISED: '#FF3366' }[node.status];
              return (
                <div key={node.nodeId} style={{
                  background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.05)`,
                  borderLeft: `3px solid ${statusColor}`,
                  borderRadius: 6, padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>{node.name}</div>
                    <div style={{ fontSize: 9, color: statusColor, letterSpacing: '0.1em' }}>{node.status}</div>
                  </div>
                  <div style={{ fontSize: 9, color: '#475569', marginBottom: 6 }}>{node.role}</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ fontSize: 9 }}><span style={{ color: '#475569' }}>IQ </span><span style={{ color: '#00FF88' }}>{node.intelligence}</span></div>
                    <div style={{ fontSize: 9 }}><span style={{ color: '#475569' }}>TASKS </span><span style={{ color: '#00BFFF' }}>{node.taskCount}</span></div>
                    <div style={{ fontSize: 9 }}><span style={{ color: '#475569' }}>DEC/S </span><span style={{ color: '#9945FF' }}>{node.decisionRate}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HAX Tab */}
      {activeTab === 'hax' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 8,
            background: 'rgba(255,51,102,0.03)', border: '1px solid rgba(255,51,102,0.15)', borderRadius: 10, padding: 12,
          }}>
            {(['TRACE','LOW','MEDIUM','HIGH','CRITICAL'] as ThreatLevel[]).map(level => (
              <div key={level} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: '#475569', letterSpacing: '0.1em', marginBottom: 2 }}>{level}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: threatLevelColor[level] }}>
                  {haxSignals.filter(s => s.level === level).length}
                </div>
              </div>
            ))}
          </div>
          {haxSignals.map(signal => (
            <div key={signal.signalId} style={{
              background: signal.contained ? 'rgba(255,255,255,0.02)' : 'rgba(255,51,102,0.05)',
              border: `1px solid ${signal.contained ? 'rgba(255,255,255,0.05)' : 'rgba(255,51,102,0.3)'}`,
              borderRadius: 8, padding: '10px 14px',
              animation: !signal.contained && signal.level === 'CRITICAL' ? 'threat-flash 1s infinite' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: threatLevelColor[signal.level], letterSpacing: '0.1em', background: `${threatLevelColor[signal.level]}22`, padding: '2px 6px', borderRadius: 4 }}>{signal.level}</span>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>{signal.threatClass}</span>
                </div>
                <div style={{ fontSize: 9, color: signal.contained ? '#00FF88' : '#FF3366', letterSpacing: '0.1em' }}>
                  {signal.contained ? '✓ CONTAINED' : '⚠ ACTIVE'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 9, color: '#475569' }}>
                <span><span style={{ color: '#475569' }}>SRC: </span><span style={{ color: '#94A3B8' }}>{signal.source}</span></span>
                <span><span style={{ color: '#475569' }}>TGT: </span><span style={{ color: '#94A3B8' }}>{signal.target}</span></span>
                <span><span style={{ color: '#475569' }}>CONF: </span><span style={{ color: '#9945FF' }}>{(signal.confidence * 100).toFixed(0)}%</span></span>
                <span style={{ marginLeft: 'auto', color: '#2D3748' }}>{new Date(signal.timestamp).toISOString().slice(11, 19)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Voxx Tab */}
      {activeTab === 'voxx' && (
        <div>
          <div style={{ fontSize: 9, color: '#475569', letterSpacing: '0.12em', marginBottom: 12 }}>
            VOXX AGENT COMMUNICATION STREAM · {voxxMessages.filter(m => !m.acknowledged).length} PENDING ACK
          </div>
          {voxxMessages.map(msg => (
            <div key={msg.msgId} style={{
              display: 'flex', gap: 10, padding: '8px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              opacity: msg.acknowledged ? 0.7 : 1,
            }}>
              <div style={{ fontSize: 9, color: protoColor[msg.protocol], letterSpacing: '0.08em', minWidth: 80, paddingTop: 1 }}>
                {msg.protocol}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>
                  <span style={{ color: '#00FF88' }}>{msg.from}</span>
                  <span style={{ color: '#475569' }}> → </span>
                  <span style={{ color: '#00BFFF' }}>{msg.to}</span>
                  {msg.encrypted && <span style={{ color: '#9945FF', marginLeft: 6, fontSize: 9 }}>🔒</span>}
                </div>
                <div style={{ fontSize: 10, color: '#475569' }}>{msg.content}</div>
              </div>
              <div style={{ fontSize: 8, color: msg.acknowledged ? '#00FF88' : '#FFB800', minWidth: 30, textAlign: 'right', paddingTop: 1 }}>
                {msg.acknowledged ? 'ACK' : 'PEND'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
