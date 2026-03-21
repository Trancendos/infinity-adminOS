# Dimensional Fabric

> **DPID:** DPID-DIM-FABRIC-001 | **Port:** 3065 | **Standard:** Trancendos 2060

Orchestrates all **30 Dimensional supporting services** across 7 classes — the middleware fabric connecting all 23 Locations.

## 7 Dimensional Classes (30 Total)

| Class | Count | Colour | Examples |
|-------|-------|--------|---------|
| Data | 7 | #06B6D4 | InfluxDB, PostgreSQL, Milvus, Neo4j, Turso |
| Messaging | 4 | #F59E0B | Kafka, MQTT, RabbitMQ, Socket.io |
| Security | 5 | #F43F5E | Keycloak, Vault, ML-KEM-768, WAF, ZKP |
| AI | 4 | #10B981 | NVIDIA NIM, CrewAI, LangGraph, Flower FL |
| Infrastructure | 4 | #8B5CF6 | WasmEdge, Docker/K8s, Cloudflare, DePIN |
| API | 3 | #EC4899 | Kong, Apollo, L402/Lightning |
| Governance | 3 | #F5A623 | OPA, FACT Ledger, TIGA |

## Endpoints
- `GET /health` — Fabric health
- `GET /dimensionals` — List all (filter: `?class=Data&status=active`)
- `GET /dimensionals/:dpid` — Get by DPID
- `GET /classes` — Classes summary
- `GET /locations/:id/dimensionals` — Dimensionals needed by a Location
- `GET /status` — Full status overview
