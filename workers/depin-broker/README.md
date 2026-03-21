# DePIN Broker

**DPID:** DPID-ECO-DEP-001  
**Port:** 3081  
**Ecosystem:** PULSE

Decentralised Physical Infrastructure Network broker for IoT device management, sensor data ingestion, and DePIN token incentives.

## Supported Networks

| Network | Use Case | Token |
|---------|----------|-------|
| Helium IoT | LoRaWAN sensor coverage | HNT |
| Solana Saga | High-throughput transactions | SOL |
| Filecoin | Edge storage | FIL |
| Render Network | GPU compute | RNDR |
| Akash | Cloud compute | AKT |
| Internal | Trancendos native | TRAN |

## Device Types

SENSOR, GATEWAY, EDGE_COMPUTE, ACTUATOR, CAMERA, WEARABLE, VEHICLE

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health |
| POST | `/devices/register` | Register new device |
| GET | `/devices` | List devices (filterable) |
| GET | `/devices/:deviceId` | Get device details |
| POST | `/data/ingest` | Ingest sensor reading + mint reward |
| GET | `/network/stats` | Per-network statistics |
