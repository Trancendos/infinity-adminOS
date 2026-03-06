# 🌐 Trancendos Service Mesh Configuration Guide
## 2060 Migration Path — From Static Ports to Sovereign Mesh

> **Version:** 1.0.0 | **Standard:** 2060 Modular Compliance
> **Current Phase:** Phase 1 (static_port) | **Target:** Phase 5 (sovereign_mesh)

---

## Overview

The Trancendos Ecosystem uses a progressive service mesh architecture designed to evolve from simple static port routing to a fully autonomous sovereign mesh by 2060. Every service in the ecosystem is pre-wired with mesh routing headers and migration seams that activate as the infrastructure matures.

---

## Migration Timeline

```
Phase 1: static_port     (2024-2026)  ← CURRENT
Phase 2: mdns            (2027-2029)
Phase 3: consul          (2030-2035)
Phase 4: semantic_mesh   (2036-2059)
Phase 5: sovereign_mesh  (2060+)
```

### Phase 1 — Static Port (Current)

Services communicate via hardcoded host:port addresses. This is the simplest and most reliable approach for the current scale.

**Configuration:**
```env
MESH_ROUTING_PROTOCOL=static_port
MESH_ADDRESS=localhost:3010        # or Docker DNS: guardian-ai:3000
MESH_DISCOVERY_ENDPOINT=           # Not used in Phase 1
```

**Port Allocation:**
| Port | Service | Wave | Role |
|------|---------|------|------|
| 3000 | infinity-portal | 1 | Core Platform |
| 3010 | guardian-ai | 2 | Security Gateway |
| 3011 | cornelius-ai | 2 | Orchestrator |
| 3012 | dorris-ai | 2 | Financial Chief |
| 3013 | norman-ai | 2 | Security Intel |
| 3014 | the-dr-ai | 2 | Autonomous Healing |
| 3020 | the-agora | 3 | Forum Engine |
| 3021 | the-citadel | 3 | Defense Engine |
| 3022 | the-hive | 3 | Swarm Intelligence |
| 3023 | the-library | 3 | Knowledge Base |
| 3024 | the-nexus | 3 | Integration Hub |
| 3025 | the-observatory | 3 | Analytics Engine |
| 3026 | the-treasury | 3 | Resource Manager |
| 3027 | the-workshop | 3 | Code Quality |
| 3028 | arcadia | 3 | Community/Marketplace |
| 3030 | serenity-ai | 4 | Wellness Monitor |
| 3031 | oracle-ai | 4 | Prediction/Forecast |
| 3032 | porter-family-ai | 4 | Portfolio Mgmt |
| 3033 | prometheus-ai | 4 | Monitoring/Alerting |
| 3034 | queen-ai | 4 | Hive Coordinator |
| 3035 | renik-ai | 4 | Crypto Key Mgmt |
| 3036 | sentinel-ai | 4 | Service Health |
| 3037 | solarscene-ai | 4 | Operations/Workflow |

**How services find each other:**
```typescript
// In Phase 1, resolveServiceAddress() returns the static address
function resolveServiceAddress(service: RouteEntry): string {
  return service.meshAddress || `localhost:${service.port}`;
}
```

### Phase 2 — mDNS Discovery (2027)

Services register themselves via multicast DNS and discover peers automatically on the local network.

**Configuration:**
```env
MESH_ROUTING_PROTOCOL=mdns
MESH_ADDRESS=guardian-ai.local:3000
MESH_DISCOVERY_ENDPOINT=_trancendos._tcp.local
```

**Migration trigger:** When `MESH_ROUTING_PROTOCOL=mdns`, the `resolveServiceAddress()` function switches to mDNS lookup instead of static addresses. No code changes required — only environment variable updates.

### Phase 3 — Consul Service Registry (2030)

Full service registry with health checking, key-value store, and service segmentation.

**Configuration:**
```env
MESH_ROUTING_PROTOCOL=consul
MESH_ADDRESS=guardian-ai
MESH_DISCOVERY_ENDPOINT=http://consul.trancendos.internal:8500
CONSUL_TOKEN=your-consul-acl-token
```

**What changes:**
- Services register with Consul on startup
- Health checks run automatically via `/health` endpoint
- Service discovery uses Consul DNS or HTTP API
- Load balancing handled by Consul Connect

### Phase 4 — Semantic Mesh (2036)

AI-driven routing where Cornelius-AI's ACO (Ant Colony Optimization) algorithm determines optimal paths based on service capabilities, load, and pheromone trails.

**Configuration:**
```env
MESH_ROUTING_PROTOCOL=semantic_mesh
MESH_ADDRESS=guardian-ai.mesh.trancendos.sovereign
MESH_DISCOVERY_ENDPOINT=mesh://cornelius-ai/nexus-router
```

**What changes:**
- Cornelius-AI becomes the mesh control plane
- Routes are determined by capability matching, not addresses
- Pheromone trails optimize frequently-used paths
- Services declare capabilities in their health endpoint

### Phase 5 — Sovereign Mesh (2060)

Fully autonomous, self-healing mesh with quantum-encrypted channels, zero-trust verification at every hop, and AI-driven topology optimization.

**Configuration:**
```env
MESH_ROUTING_PROTOCOL=sovereign_mesh
MESH_ADDRESS=guardian-ai.sovereign.trancendos.mesh
MESH_DISCOVERY_ENDPOINT=sovereign://mesh-controller/v5
QUANTUM_CHANNEL_ENABLED=true
```

---

## Current Architecture (Phase 1)

### Service Communication Flow

```
┌─────────────────┐     IAM Token      ┌─────────────────┐
│  infinity-portal │ ──────────────────→ │   guardian-ai    │
│     :3000        │     (HS512 JWT)    │     :3010        │
└─────────────────┘                     └─────────────────┘
        │                                       │
        │ Route Request                         │ Validate Token
        ▼                                       ▼
┌─────────────────┐                     ┌─────────────────┐
│  cornelius-ai    │ ←── ACO Routing ── │   norman-ai      │
│     :3011        │                    │     :3013        │
└─────────────────┘                     └─────────────────┘
        │
        │ Dispatch to target service
        ▼
┌─────────────────────────────────────────────────────┐
│  Target Service (any of the 23 services)             │
│  - Validates IAM token inline (zero-dependency)      │
│  - Checks IAM level requirement                      │
│  - Logs audit trail (SHA-512)                        │
│  - Returns response with mesh headers                │
└─────────────────────────────────────────────────────┘
```

### Mesh Headers

Every service response includes mesh routing headers for observability:

```
X-Trancendos-Service: guardian-ai
X-Trancendos-Version: 1.0.0
X-Trancendos-Mesh-Protocol: static_port
X-Trancendos-IAM-Level: 2
X-Trancendos-Request-Id: uuid-v4
```

### Health Endpoint

Every service exposes `/health` with IAM and mesh status:

```json
{
  "status": "healthy",
  "service": "guardian-ai",
  "version": "1.0.0",
  "iam": {
    "enabled": true,
    "algorithm": "HS512",
    "auditHash": "SHA-512"
  },
  "mesh": {
    "protocol": "static_port",
    "address": "guardian-ai:3000",
    "phase": "Phase 1 (2024-2026)"
  },
  "uptime": 86400,
  "timestamp": "2025-01-15T00:00:00.000Z"
}
```

---

## Docker Compose Mesh Network

When running locally with `docker-compose.ecosystem.yml`, all services join the `trancendos-mesh` bridge network:

```bash
# Start all services
docker compose -f docker-compose.ecosystem.yml up -d

# Verify mesh connectivity
docker compose -f docker-compose.ecosystem.yml exec guardian-ai \
  curl -s http://cornelius-ai:3000/health | jq .

# View mesh network
docker network inspect trancendos-mesh
```

Services use Docker DNS for discovery (e.g., `guardian-ai:3000` resolves automatically within the mesh network).

---

## Adding a New Service to the Mesh

1. **Register in `seed_iam.py`** — Add to `PLATFORM_SERVICES` list
2. **Add to `docker-compose.ecosystem.yml`** — New service block with mesh env vars
3. **Apply IAM middleware** — Copy inline middleware from template
4. **Create Dockerfile** — Use the production template
5. **Add CI/CD** — Apply the CI/CD template
6. **Create permissions** — Add namespace permissions to seed data
7. **Update Cornelius routing** — Register in NexusRouter route table

---

## Monitoring & Debugging

### Check all service health
```bash
# Local development
for port in 3000 3010 3011 3012 3013 3014 3020 3021 3022 3023 3024 3025 3026 3027 3028 3030 3031 3032 3033 3034 3035 3036 3037; do
  echo "Port $port: $(curl -s http://localhost:$port/health | jq -r '.status // "unreachable"')"
done
```

### Check IAM token propagation
```bash
# Generate a test token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"drew@trancendos.com","password":"..."}' | jq -r '.token')

# Test against guardian-ai
curl -s http://localhost:3010/health \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### View audit logs
```bash
# Check IAM audit entries
curl -s http://localhost:3010/api/v1/zero-trust/audit \
  -H "Authorization: Bearer $TOKEN" | jq '.[-5:]'
```

---

*This guide is part of the Trancendos Ecosystem Production Readiness documentation.*
*For the 2060 Compliance Checklist, see `IAM_2060_COMPLIANCE_CHECKLIST.md`.*