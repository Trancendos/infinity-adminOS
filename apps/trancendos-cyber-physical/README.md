# TrancendosCyberPhysical

**DPID:** DPID-CYB-PHY-001  
**Port:** 3062  
**Type:** React Application (Vite + TypeScript)

The Cyber-Physical interface layer of the Trancendos Universe. Bridges the digital (BER Engine, Oracle AI) with the physical (IoT sensors, wearables, DePIN devices) via NVIDIA NIM pipelines.

## Tabs

| Tab | Description |
|-----|-------------|
| 🧬 BER Engine | Real-time biometric empathy state (LUCID/OVERLOAD/CHAOS), HRV sparkline, state history |
| 📡 IoT / DePIN | DePIN device dashboard across all 23 Locations, device telemetry, battery, signal |
| ⚡ NIM Pipeline | NVIDIA NIM inference pipeline — biometric, sensor, vision, language models |
| 🌀 Slipstream | Sentinel Station connection status — Class A/B/C/D tunnel monitoring |

## BER Design Tokens

| Token | Hex | State |
|-------|-----|-------|
| `empathy` | `#10B981` | LUCID (healthy) |
| `alert` | `#F43F5E` | CHAOS (critical) |
| `warning` | `#F59E0B` | OVERLOAD (stressed) |
| `slipstream` | `#7B68EE` | Sentinel Station |
| `void-900` | `#050505` | Background |

## Development

```bash
pnpm dev  # Starts on port 3062
```

API proxy routes:
- `/api/ber` → `localhost:3061` (BER Engine)
- `/api/depin` → `localhost:3081` (DePIN Broker)
- `/api/sentinel` → `localhost:3060` (Sentinel Station)
