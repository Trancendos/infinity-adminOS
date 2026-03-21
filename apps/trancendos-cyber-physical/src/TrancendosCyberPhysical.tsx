/**
 * TrancendosCyberPhysical
 * 
 * The Cyber-Physical interface layer of the Trancendos Universe.
 * Bridges the digital (BER Engine, Oracle AI) with the physical 
 * (IoT sensors, wearables, DePIN devices) via NVIDIA NIM pipelines.
 *
 * Components:
 * - BERStateMonitor    — Real-time biometric empathy state (LUCID/OVERLOAD/CHAOS)
 * - IoTDeviceDashboard — DePIN device network map and telemetry
 * - NIMPipeline        — NVIDIA NIM inference pipeline visualiser
 * - SlipstreamMonitor  — Sentinel Station connection status
 * - BiometricFeed      — Live HRV and biometric data stream
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ── BER Design Tokens ─────────────────────────────────────────────────────────
const BER_TOKENS = {
  LUCID:    { color: '#10B981', label: 'LUCID',    bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.4)'  },
  OVERLOAD: { color: '#F59E0B', label: 'OVERLOAD', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)' },
  CHAOS:    { color: '#F43F5E', label: 'CHAOS',    bg: 'rgba(244,63,94,0.1)',  border: 'rgba(244,63,94,0.4)'  },
} as const;

type BERState = keyof typeof BER_TOKENS;
type DeviceType = 'SENSOR' | 'GATEWAY' | 'WEARABLE' | 'EDGE_COMPUTE' | 'ACTUATOR';

interface BiometricReading {
  timestamp: number;
  hrv: number;       // Heart Rate Variability (ms)
  heartRate: number; // BPM
  stressIndex: number; // 0-100
  berState: BERState;
  confidence: number;
}

interface IoTDevice {
  deviceId: string;
  type: DeviceType;
  location: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  lastReading: number;
  battery?: number;
  signal: number; // 0-100
  dataRate: number; // readings/min
}

interface NIMTask {
  taskId: string;
  model: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED';
  progress: number; // 0-100
  inputType: 'BIOMETRIC' | 'SENSOR' | 'VISION' | 'LANGUAGE';
  latencyMs: number;
  gpuUtil: number;
}

interface SlipstreamConnection {
  tunnelId: string;
  class: 'A' | 'B' | 'C' | 'D';
  target: string;
  latencyMs: number;
  status: 'OPEN' | 'DEGRADED' | 'CLOSED';
  throughput: number; // req/s
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useBiometricStream() {
  const [readings, setReadings] = useState<BiometricReading[]>([]);
  const [current, setCurrent] = useState<BiometricReading>({
    timestamp: Date.now(), hrv: 45, heartRate: 72,
    stressIndex: 25, berState: 'LUCID', confidence: 0.94,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent(prev => {
        const hrv = Math.max(15, Math.min(80, prev.hrv + (Math.random() - 0.5) * 6));
        const heartRate = Math.max(55, Math.min(110, prev.heartRate + (Math.random() - 0.5) * 4));
        const stressIndex = Math.max(0, Math.min(100, prev.stressIndex + (Math.random() - 0.45) * 8));
        const berState: BERState = stressIndex > 75 ? 'CHAOS' : stressIndex > 45 ? 'OVERLOAD' : 'LUCID';
        const reading = { timestamp: Date.now(), hrv, heartRate, stressIndex, berState, confidence: 0.9 + Math.random() * 0.09 };
        setReadings(r => [...r.slice(-60), reading]);
        return reading;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return { readings, current };
}

function useIoTDevices() {
  const [devices] = useState<IoTDevice[]>([
    { deviceId: 'DEV-SEN-L01', type: 'SENSOR', location: 'L01', status: 'ONLINE', lastReading: Date.now(), signal: 95, dataRate: 12, battery: 87 },
    { deviceId: 'DEV-GTW-L05', type: 'GATEWAY', location: 'L05', status: 'ONLINE', lastReading: Date.now(), signal: 99, dataRate: 450 },
    { deviceId: 'DEV-WRB-L18', type: 'WEARABLE', location: 'L18', status: 'ONLINE', lastReading: Date.now(), signal: 82, dataRate: 60, battery: 63 },
    { deviceId: 'DEV-EDG-L12', type: 'EDGE_COMPUTE', location: 'L12', status: 'ONLINE', lastReading: Date.now(), signal: 91, dataRate: 8 },
    { deviceId: 'DEV-SEN-L23', type: 'SENSOR', location: 'L23', status: 'ONLINE', lastReading: Date.now(), signal: 88, dataRate: 24, battery: 71 },
    { deviceId: 'DEV-ACT-L09', type: 'ACTUATOR', location: 'L09', status: 'DEGRADED', lastReading: Date.now() - 5000, signal: 34, dataRate: 2, battery: 12 },
  ]);
  return devices;
}

function useNIMPipeline() {
  const [tasks, setTasks] = useState<NIMTask[]>([
    { taskId: 'NIM-001', model: 'biometric-affect-v3', status: 'RUNNING', progress: 67, inputType: 'BIOMETRIC', latencyMs: 23, gpuUtil: 72 },
    { taskId: 'NIM-002', model: 'sensor-anomaly-v2', status: 'COMPLETE', progress: 100, inputType: 'SENSOR', latencyMs: 8, gpuUtil: 0 },
    { taskId: 'NIM-003', model: 'vision-presence-v1', status: 'QUEUED', progress: 0, inputType: 'VISION', latencyMs: 0, gpuUtil: 0 },
    { taskId: 'NIM-004', model: 'llm-context-fuse-v4', status: 'RUNNING', progress: 34, inputType: 'LANGUAGE', latencyMs: 156, gpuUtil: 89 },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prev => prev.map(task => {
        if (task.status === 'RUNNING') {
          const newProgress = Math.min(100, task.progress + Math.random() * 8);
          return { ...task, progress: newProgress, status: newProgress >= 100 ? 'COMPLETE' : 'RUNNING',
            gpuUtil: Math.max(0, Math.min(100, task.gpuUtil + (Math.random() - 0.5) * 10)),
            latencyMs: Math.max(1, task.latencyMs + (Math.random() - 0.5) * 5),
          };
        }
        if (task.status === 'COMPLETE' && Math.random() < 0.05) {
          return { ...task, status: 'QUEUED', progress: 0 };
        }
        if (task.status === 'QUEUED' && Math.random() < 0.1) {
          return { ...task, status: 'RUNNING', gpuUtil: 40 + Math.random() * 40 };
        }
        return task;
      }));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return tasks;
}

function useSlipstream() {
  const [connections] = useState<SlipstreamConnection[]>([
    { tunnelId: 'WARP-SEN-BER', class: 'C', target: 'ber-engine', latencyMs: 12, status: 'OPEN', throughput: 847 },
    { tunnelId: 'WARP-SEN-ORC', class: 'B', target: 'oracle-foresight', latencyMs: 34, status: 'OPEN', throughput: 234 },
    { tunnelId: 'WARP-SEN-DPN', class: 'B', target: 'depin-broker', latencyMs: 28, status: 'OPEN', throughput: 512 },
    { tunnelId: 'WARP-SEN-PQC', class: 'A', target: 'pqc-service', latencyMs: 8, status: 'OPEN', throughput: 1240 },
  ]);
  return connections;
}

// ── Sub-Components ─────────────────────────────────────────────────────────────

const BERStateIndicator: React.FC<{ state: BERState; hrv: number; heartRate: number; stress: number; confidence: number }> = 
  ({ state, hrv, heartRate, stress, confidence }) => {
  const token = BER_TOKENS[state];
  const animClass = state === 'LUCID' ? 'pulse-empathy' : state === 'CHAOS' ? 'pulse-alert' : 'pulse-warning';

  return (
    <div style={{
      background: token.bg, border: `1px solid ${token.border}`,
      borderRadius: 12, padding: '20px 24px',
      animation: `${animClass} 2s infinite`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: token.color, boxShadow: `0 0 12px ${token.color}`,
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', color: token.color, fontWeight: 700, letterSpacing: '0.15em', fontSize: 13 }}>
          BER STATE: {token.label}
        </span>
        <span style={{ marginLeft: 'auto', color: '#64748B', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {(confidence * 100).toFixed(1)}% conf
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          { label: 'HRV', value: `${hrv.toFixed(1)}ms`, sub: 'heart rate variability' },
          { label: 'BPM', value: `${Math.round(heartRate)}`, sub: 'heart rate' },
          { label: 'STRESS', value: `${Math.round(stress)}%`, sub: 'stress index' },
        ].map(m => (
          <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ color: '#64748B', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em' }}>{m.label}</div>
            <div style={{ color: token.color, fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{m.value}</div>
            <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const HRVSparkline: React.FC<{ readings: BiometricReading[] }> = ({ readings }) => {
  if (readings.length < 2) return null;
  const w = 320, h = 60;
  const min = Math.min(...readings.map(r => r.hrv));
  const max = Math.max(...readings.map(r => r.hrv));
  const range = max - min || 1;
  const points = readings.map((r, i) => {
    const x = (i / (readings.length - 1)) * w;
    const y = h - ((r.hrv - min) / range) * (h - 8) - 4;
    return `${x},${y}`;
  }).join(' ');
  const lastState = readings[readings.length - 1]?.berState ?? 'LUCID';
  const color = BER_TOKENS[lastState].color;

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ color: '#64748B', fontFamily: 'var(--font-mono)', fontSize: 10, marginBottom: 8, letterSpacing: '0.1em' }}>HRV HISTORY (60s)</div>
      <svg width={w} height={h} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="hrv-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const IoTDeviceCard: React.FC<{ device: IoTDevice }> = ({ device }) => {
  const statusColor = device.status === 'ONLINE' ? '#10B981' : device.status === 'DEGRADED' ? '#F59E0B' : '#F43F5E';
  const typeIcon = { SENSOR: '📡', GATEWAY: '🔗', WEARABLE: '⌚', EDGE_COMPUTE: '💻', ACTUATOR: '⚙️' }[device.type];

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.06)`,
      borderRadius: 8, padding: '12px 14px',
      borderLeft: `3px solid ${statusColor}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>{typeIcon}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#94A3B8' }}>{device.deviceId}</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: statusColor, letterSpacing: '0.1em' }}>{device.status}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{ fontSize: 11, color: '#475569' }}>
          <span style={{ color: '#7B68EE' }}>LOC:</span> {device.location}
        </div>
        <div style={{ fontSize: 11, color: '#475569' }}>
          <span style={{ color: '#64748B' }}>SIG:</span> {device.signal}%
        </div>
        <div style={{ fontSize: 11, color: '#475569' }}>
          <span style={{ color: '#64748B' }}>RATE:</span> {device.dataRate}/min
        </div>
        {device.battery !== undefined && (
          <div style={{ fontSize: 11, color: device.battery < 20 ? '#F43F5E' : '#475569' }}>
            <span style={{ color: '#64748B' }}>BAT:</span> {device.battery}%
          </div>
        )}
      </div>
    </div>
  );
};

const NIMTaskRow: React.FC<{ task: NIMTask }> = ({ task }) => {
  const statusColor = { RUNNING: '#7B68EE', COMPLETE: '#10B981', QUEUED: '#64748B', FAILED: '#F43F5E' }[task.status];
  const inputIcon = { BIOMETRIC: '🧬', SENSOR: '📡', VISION: '👁', LANGUAGE: '💬' }[task.inputType];

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '10px 14px',
      display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'center',
      marginBottom: 6,
    }}>
      <span style={{ fontSize: 14 }}>{inputIcon}</span>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#CBD5E1', marginBottom: 4 }}>{task.model}</div>
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${task.progress}%`,
            background: statusColor,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: statusColor, letterSpacing: '0.1em' }}>{task.status}</div>
        {task.status === 'RUNNING' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#475569', marginTop: 2 }}>
            {task.latencyMs.toFixed(0)}ms | GPU {task.gpuUtil.toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  );
};

const SlipstreamRow: React.FC<{ conn: SlipstreamConnection }> = ({ conn }) => {
  const classColor = { A: '#7B68EE', B: '#10B981', C: '#F59E0B', D: '#F43F5E' }[conn.class];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 4, background: `${classColor}22`,
        border: `1px solid ${classColor}66`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 10, color: classColor, fontWeight: 700,
      }}>{conn.class}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#94A3B8' }}>{conn.target}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#475569', marginTop: 1 }}>
          {conn.latencyMs}ms latency · {conn.throughput} req/s
        </div>
      </div>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: conn.status === 'OPEN' ? '#10B981' : conn.status === 'DEGRADED' ? '#F59E0B' : '#F43F5E',
        boxShadow: conn.status === 'OPEN' ? '0 0 6px #10B981' : 'none',
      }} />
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

export const TrancendosCyberPhysical: React.FC = () => {
  const { readings, current } = useBiometricStream();
  const devices = useIoTDevices();
  const nimTasks = useNIMPipeline();
  const slipstream = useSlipstream();
  const [activeTab, setActiveTab] = useState<'ber' | 'iot' | 'nim' | 'slipstream'>('ber');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const token = BER_TOKENS[current.berState];

  return (
    <div style={{
      minHeight: '100vh', background: '#050505', color: '#E2E8F0',
      fontFamily: "'Inter', sans-serif", padding: '24px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #7B68EE, #10B981)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>⬡</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                Trancendos Cyber-Physical
              </h1>
              <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace', marginTop: 2 }}>
                DPID-CYB-PHY-001 · BER + IoT + NIM Pipeline
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#475569', letterSpacing: '0.1em' }}>UNIVERSE TIME</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#7B68EE' }}>
              {new Date().toISOString().slice(0, 19).replace('T', ' ')}
            </div>
          </div>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', background: token.color,
            boxShadow: `0 0 12px ${token.color}`,
          }} />
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 10 }}>
        {([
          { id: 'ber', label: '🧬 BER Engine', color: token.color },
          { id: 'iot', label: '📡 IoT / DePIN', color: '#10B981' },
          { id: 'nim', label: '⚡ NIM Pipeline', color: '#7B68EE' },
          { id: 'slipstream', label: '🌀 Slipstream', color: '#7B68EE' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 7, border: 'none',
              background: activeTab === tab.id ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: activeTab === tab.id ? tab.color : '#475569',
              fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 600 : 400,
              transition: 'all 0.2s',
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* BER Tab */}
      {activeTab === 'ber' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <BERStateIndicator
            state={current.berState} hrv={current.hrv}
            heartRate={current.heartRate} stress={current.stressIndex}
            confidence={current.confidence}
          />
          <HRVSparkline readings={readings} />
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#475569', letterSpacing: '0.1em', marginBottom: 12 }}>BER STATE HISTORY</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {readings.slice(-20).reverse().map((r, i) => {
                const t = BER_TOKENS[r.berState];
                return (
                  <div key={i} style={{
                    width: 12, height: 12, borderRadius: 3,
                    background: t.color, opacity: 0.7 + i * 0.015,
                  }} title={r.berState} />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* IoT Tab */}
      {activeTab === 'iot' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{
            background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 16,
            display: 'flex', gap: 20, marginBottom: 4,
          }}>
            {[
              { label: 'ONLINE', count: devices.filter(d => d.status === 'ONLINE').length, color: '#10B981' },
              { label: 'DEGRADED', count: devices.filter(d => d.status === 'DEGRADED').length, color: '#F59E0B' },
              { label: 'OFFLINE', count: devices.filter(d => d.status === 'OFFLINE').length, color: '#F43F5E' },
              { label: 'TOTAL', count: devices.length, color: '#7B68EE' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#475569', letterSpacing: '0.1em' }}>{s.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: s.color }}>{s.count}</div>
              </div>
            ))}
          </div>
          {devices.map(d => <IoTDeviceCard key={d.deviceId} device={d} />)}
        </div>
      )}

      {/* NIM Tab */}
      {activeTab === 'nim' && (
        <div>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#475569', letterSpacing: '0.1em', marginBottom: 12 }}>
              NVIDIA NIM INFERENCE PIPELINE
            </div>
            {nimTasks.map(t => <NIMTaskRow key={t.taskId} task={t} />)}
          </div>
          <div style={{
            background: 'rgba(123,104,238,0.05)', border: '1px solid rgba(123,104,238,0.2)',
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#7B68EE', letterSpacing: '0.1em', marginBottom: 8 }}>
              GPU CLUSTER STATUS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'ACTIVE MODELS', value: nimTasks.filter(t => t.status === 'RUNNING').length },
                { label: 'AVG LATENCY', value: `${(nimTasks.filter(t => t.status === 'RUNNING').reduce((s, t) => s + t.latencyMs, 0) / Math.max(1, nimTasks.filter(t => t.status === 'RUNNING').length)).toFixed(0)}ms` },
                { label: 'GPU UTIL', value: `${(nimTasks.filter(t => t.status === 'RUNNING').reduce((s, t) => s + t.gpuUtil, 0) / Math.max(1, nimTasks.filter(t => t.status === 'RUNNING').length)).toFixed(0)}%` },
                { label: 'QUEUE DEPTH', value: nimTasks.filter(t => t.status === 'QUEUED').length },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#475569', letterSpacing: '0.08em' }}>{s.label}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#7B68EE' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Slipstream Tab */}
      {activeTab === 'slipstream' && (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#7B68EE', letterSpacing: '0.1em', marginBottom: 16 }}>
            ⬡ SENTINEL STATION — SLIPSTREAM CONNECTIONS
          </div>
          {slipstream.map(c => <SlipstreamRow key={c.tunnelId} conn={c} />)}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#475569', letterSpacing: '0.1em' }}>
              SHP PROTOCOL: ACTIVE · UPTIME: {(99.97).toFixed(2)}% · TUNNELS: {slipstream.filter(c => c.status === 'OPEN').length}/{slipstream.length} OPEN
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
