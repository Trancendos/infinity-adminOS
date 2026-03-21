# DPID Registry Service

**DPID:** DPID-REG-CORE-001  
**Port:** 3084  
**Ecosystem:** NEXUS

Master registry for all Digital Participant IDs (DPIDs) in the Trancendos Universe. Every service, location, persona, component, and infrastructure element has a registered DPID.

## DPID Format

```
DPID-{CATEGORY}-{SUBCATEGORY}-{SEQUENCE}
```

Examples:
- `DPID-SEN-CORE-001` — Sentinel Station Core
- `DPID-ORC-CHR-001`  — Chrono Intelligence Oracle
- `DPID-PCK-PIL6-002` — BER Engine (Pocket, Pillar 6)

## Categories

| Code | Category | Description |
|------|----------|-------------|
| LOC | Location | L01-L23 ecosystem locations |
| SEN | Sentinel | Sentinel Station sub-components |
| DIM | Dimensional | Dimensional Fabric services |
| ORC | Oracle | Oracle-AI foresight applications |
| PER | Persona | Named Personas (Madam Krystal, etc.) |
| ECO | Ecosystem | Cross-ecosystem infrastructure |
| INF | Infrastructure | CI/CD, monitoring, platform |
| PKG | Package | Shared npm/pnpm packages |
| REG | Registry | Registry services |
| COV | Covert | COVERT/Penumbra services |
| PCK | Pocket | Pockets within Pillars |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health |
| GET | `/dpid/:dpid` | Look up a specific DPID |
| POST | `/register` | Register a new DPID |
| GET | `/list` | List DPIDs (filterable) |
| GET | `/search` | Full-text search |
| GET | `/dpid/:dpid/dependencies` | Dependency graph for a DPID |
| GET | `/stats` | Registry statistics |
