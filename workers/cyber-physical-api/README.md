# Cyber-Physical API Worker

**DPID:** `DPID-CYB-PHY-API-001`  
**Port:** `3086`  
**Framework:** Hono on Cloudflare Workers  

## Overview

Backend API worker for the TrancendosCyberPhysical React application. Provides real-time BER biometric data, IoT device registry, NIM pipeline status, and Slipstream tunnel monitoring.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| GET | `/ber/stream` | Live BER biometric reading |
| GET | `/ber/history?n=10` | Historical BER readings |
| GET | `/iot/devices` | IoT device registry |
| GET | `/iot/devices/:id` | Single device details |
| GET | `/nim/pipeline` | NIM pipeline task status |
| GET | `/slipstream/status` | Slipstream tunnel status |

## BER States

| State | HRV | Stress | Design Token | Adaptive Mode |
|-------|-----|--------|-------------|---------------|
| LUCID | >65 | <30 | `#10B981` (Empathy Green) | FLOW |
| OVERLOAD | >40 | <60 | `#F59E0B` (Amber) | GUIDED |
| CHAOS | <40 | >60 | `#F43F5E` (Alert Red) | RESTORE |

## IoT Networks Supported
- **Helium** — LoRaWAN gateways
- **Solana** — Blockchain validators  
- **Filecoin** — Decentralised storage
- **Render** — GPU compute
- **Akash** — Cloud compute
- **DePIN** — Biosensor hubs

## Development
```bash
pnpm dev      # Start on port 3086
pnpm build    # TypeScript check
pnpm deploy   # Deploy to Cloudflare Workers
```
