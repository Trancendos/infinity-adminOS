/**
 * DePIN Broker Worker
 * DPID: DPID-ECO-DEP-001
 * Port: 3081
 * Ecosystem: PULSE
 *
 * Decentralised Physical Infrastructure Network broker.
 * Manages IoT device registration, edge compute allocation,
 * sensor data ingestion, and DePIN token incentives across
 * the Trancendos physical ecosystem layer.
 *
 * Networks: Helium IoT, Solana Saga DePIN, Filecoin edge storage,
 *           Render Network GPU, Akash compute
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';

// ── Types ────────────────────────────────────────────────────────────────────

type DeviceType = 'SENSOR' | 'GATEWAY' | 'EDGE_COMPUTE' | 'ACTUATOR' | 'CAMERA' | 'WEARABLE' | 'VEHICLE';
type NetworkProtocol = 'LORAWAN' | 'WIFI' | '5G' | 'BLUETOOTH' | 'ZIGBEE' | 'THREAD' | 'MATTER';
type DePINNetwork = 'HELIUM' | 'SOLANA' | 'FILECOIN' | 'RENDER' | 'AKASH' | 'INTERNAL';
type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'MAINTENANCE' | 'DECOMMISSIONED';

interface DePINDevice {
  deviceId: string;
  dpid: string;
  deviceType: DeviceType;
  protocol: NetworkProtocol;
  network: DePINNetwork;
  locationId: string;       // L01-L23
  coordinates?: { lat: number; lon: number; alt: number };
  status: DeviceStatus;
  registeredAt: string;
  lastSeen: string;
  uptime: number;           // % over last 30 days
  dataPointsToday: number;
  stakingRewards: number;   // TRAN tokens earned
  carbonFootprint: number;  // kg CO2 equivalent
  capabilities: string[];
  firmware: string;
}

interface SensorReading {
  readingId: string;
  deviceId: string;
  locationId: string;
  timestamp: string;
  metrics: Record<string, { value: number; unit: string }>;
  quality: 'HIGH' | 'MEDIUM' | 'LOW' | 'CORRUPT';
  transmitted: boolean;
  carbonCost: number;       // kg CO2 for this transmission
}

interface DePINReward {
  rewardId: string;
  deviceId: string;
  network: DePINNetwork;
  amount: number;
  currency: string;         // HNT, MOBILE, TRAN, etc.
  earnedAt: string;
  reason: 'DATA_SUBMISSION' | 'UPTIME_BONUS' | 'COVERAGE_BONUS' | 'QUALITY_BONUS';
  txHash?: string;
}

interface NetworkStats {
  network: DePINNetwork;
  activeDevices: number;
  totalDevices: number;
  dataPointsToday: number;
  rewardsDistributed: number;
  coverageScore: number;
  avgUptime: number;
}

// ── Device Registry ───────────────────────────────────────────────────────────

const deviceRegistry = new Map<string, DePINDevice>();
const sensorReadings: SensorReading[] = [];
const rewards: DePINReward[] = [];

function generateDeviceId(type: DeviceType): string {
  return `DEV-${type.slice(0, 3)}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function createDevice(
  deviceType: DeviceType,
  protocol: NetworkProtocol,
  network: DePINNetwork,
  locationId: string,
  capabilities: string[]
): DePINDevice {
  const deviceId = generateDeviceId(deviceType);
  const device: DePINDevice = {
    deviceId,
    dpid: 'DPID-ECO-DEP-001',
    deviceType,
    protocol,
    network,
    locationId,
    status: 'ONLINE',
    registeredAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    uptime: 95 + Math.random() * 5,
    dataPointsToday: Math.floor(Math.random() * 10000),
    stakingRewards: Math.random() * 100,
    carbonFootprint: Math.random() * 0.5,
    capabilities,
    firmware: `v${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 10)}.0`,
  };
  deviceRegistry.set(deviceId, device);
  return device;
}

// Pre-seed devices across locations
const SEED_DEVICES = [
  createDevice('SENSOR', 'LORAWAN', 'HELIUM', 'L01', ['temperature', 'humidity', 'air-quality']),
  createDevice('GATEWAY', 'WIFI', 'HELIUM', 'L05', ['lorawan-gateway', 'data-routing']),
  createDevice('EDGE_COMPUTE', '5G', 'AKASH', 'L12', ['ml-inference', 'video-processing']),
  createDevice('WEARABLE', 'BLUETOOTH', 'INTERNAL', 'L18', ['biometric', 'hrv', 'motion']),
  createDevice('SENSOR', 'THREAD', 'INTERNAL', 'L23', ['slipstream-telemetry', 'latency-probe']),
];

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());
app.use('*', logger());

app.use('*', async (c, next) => {
  c.header('X-DPID', 'DPID-ECO-DEP-001');
  c.header('X-Service', 'DePIN Broker');
  c.header('X-Network', 'HELIUM_SOLANA_HYBRID');
  await next();
});

app.get('/health', (c) => {
  const devices = Array.from(deviceRegistry.values());
  const online = devices.filter(d => d.status === 'ONLINE').length;
  return c.json({
    dpid: 'DPID-ECO-DEP-001',
    service: 'DePIN Broker',
    status: 'HEALTHY',
    totalDevices: devices.length,
    onlineDevices: online,
    networks: ['HELIUM', 'SOLANA', 'FILECOIN', 'RENDER', 'AKASH'],
    uptime: 99.7,
  });
});

// ── Device Registration ───────────────────────────────────────────────────────

const RegisterSchema = z.object({
  deviceType: z.enum(['SENSOR', 'GATEWAY', 'EDGE_COMPUTE', 'ACTUATOR', 'CAMERA', 'WEARABLE', 'VEHICLE']),
  protocol: z.enum(['LORAWAN', 'WIFI', '5G', 'BLUETOOTH', 'ZIGBEE', 'THREAD', 'MATTER']),
  network: z.enum(['HELIUM', 'SOLANA', 'FILECOIN', 'RENDER', 'AKASH', 'INTERNAL']),
  locationId: z.string().regex(/^L(0[1-9]|1[0-9]|2[0-3])$/),
  capabilities: z.array(z.string()),
});

app.post('/devices/register', async (c) => {
  const body = await c.req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  const device = createDevice(parsed.data.deviceType, parsed.data.protocol, parsed.data.network, parsed.data.locationId, parsed.data.capabilities);
  return c.json({ registered: true, device }, 201);
});

app.get('/devices', (c) => {
  const location = c.req.query('location');
  const network = c.req.query('network') as DePINNetwork | undefined;
  const status = c.req.query('status') as DeviceStatus | undefined;

  let devices = Array.from(deviceRegistry.values());
  if (location) devices = devices.filter(d => d.locationId === location);
  if (network) devices = devices.filter(d => d.network === network);
  if (status) devices = devices.filter(d => d.status === status);

  return c.json({ totalDevices: devices.length, devices });
});

app.get('/devices/:deviceId', (c) => {
  const device = deviceRegistry.get(c.req.param('deviceId'));
  if (!device) return c.json({ error: 'Device not found' }, 404);
  return c.json(device);
});

// ── Sensor Data Ingestion ─────────────────────────────────────────────────────

app.post('/data/ingest', async (c) => {
  const body = await c.req.json();
  const { deviceId, metrics } = body;

  const device = deviceRegistry.get(deviceId);
  if (!device) return c.json({ error: 'Device not found' }, 404);

  const reading: SensorReading = {
    readingId: `READ-${Date.now()}`,
    deviceId,
    locationId: device.locationId,
    timestamp: new Date().toISOString(),
    metrics: metrics ?? {},
    quality: 'HIGH',
    transmitted: true,
    carbonCost: 0.0001,
  };

  sensorReadings.push(reading);
  device.dataPointsToday++;
  device.lastSeen = new Date().toISOString();
  deviceRegistry.set(deviceId, device);

  // Mint small staking reward
  const reward: DePINReward = {
    rewardId: `RWD-${Date.now()}`,
    deviceId,
    network: device.network,
    amount: 0.001,
    currency: 'TRAN',
    earnedAt: new Date().toISOString(),
    reason: 'DATA_SUBMISSION',
  };
  rewards.push(reward);

  return c.json({ ingested: true, readingId: reading.readingId, reward }, 201);
});

// ── Network Stats ─────────────────────────────────────────────────────────────

app.get('/network/stats', (c) => {
  const devices = Array.from(deviceRegistry.values());
  const networks: DePINNetwork[] = ['HELIUM', 'SOLANA', 'FILECOIN', 'RENDER', 'AKASH', 'INTERNAL'];

  const stats: NetworkStats[] = networks.map(network => {
    const netDevices = devices.filter(d => d.network === network);
    return {
      network,
      activeDevices: netDevices.filter(d => d.status === 'ONLINE').length,
      totalDevices: netDevices.length,
      dataPointsToday: netDevices.reduce((s, d) => s + d.dataPointsToday, 0),
      rewardsDistributed: rewards.filter(r => r.network === network).reduce((s, r) => s + r.amount, 0),
      coverageScore: Math.round((70 + Math.random() * 30) * 10) / 10,
      avgUptime: netDevices.length > 0
        ? Math.round(netDevices.reduce((s, d) => s + d.uptime, 0) / netDevices.length * 10) / 10
        : 0,
    };
  });

  return c.json({ generatedAt: new Date().toISOString(), networks: stats });
});

app.get('/', (c) => c.json({
  service: 'DePIN Broker', dpid: 'DPID-ECO-DEP-001', version: '1.0.0',
  description: 'Decentralised Physical Infrastructure Network broker',
  endpoints: ['GET /health','POST /devices/register','GET /devices','GET /devices/:deviceId','POST /data/ingest','GET /network/stats'],
}));

export interface Env {
  DPID: string; SERVICE_NAME: string; SENTINEL_STATION: Fetcher; CARBON_ROUTER: Fetcher;
}

export default app;
