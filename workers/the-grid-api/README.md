# The Grid API Worker

**DPID:** `DPID-GRD-API-001`  
**Port:** `3087`  
**Framework:** Hono on Cloudflare Workers  

## Overview

Backend API worker for TheGridV13 React application. Provides Queen's Hive agent intelligence data, HAX threat matrix signals, and Voxx agent-to-agent communication protocol.

## Endpoints

### Queen's Hive
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| GET | `/hive/agents` | All 7 Hive agents (filter: `?role=QUEEN&status=ACTIVE`) |
| GET | `/hive/agents/:id` | Single agent detail |
| GET | `/hive/consensus` | Latest consensus vote simulation |

### HAX Threat Matrix
| Method | Path | Description |
|--------|------|-------------|
| GET | `/hax/signals` | Threat signals (filter: `?n=12&unresolved=true`) |
| GET | `/hax/signals/:id` | Single threat signal |

### Voxx Protocol
| Method | Path | Description |
|--------|------|-------------|
| GET | `/voxx/stream` | Message stream (filter: `?n=8&mode=ENCRYPTED`) |
| POST | `/voxx/send` | Send new Voxx message |

## Agent Roles

| Role | Name | Specialisation |
|------|------|----------------|
| QUEEN | Sovereign | Meta-coordination + emergent strategy synthesis |
| ORACLE | Foresight | Temporal pattern recognition + predictive modelling |
| GUARDIAN | Sentinel | Threat neutralisation + TIGA policy enforcement |
| ECONOMIST | Cornelius | TRAN economics + FAST circuit breaker arbitration |
| ETHICIST | Axiom | ISO 42001 alignment + value drift detection |
| ARCHITECT | Blueprint | Infrastructure topology + DePIN orchestration |
| NAVIGATOR | Meridian | Carbon-aware routing + Slipstream path optimisation |

## Threat Classes

| Class | Severity | Neutralisation Mode |
|-------|----------|---------------------|
| CLASS_1 | 1-14 | PASSIVE |
| CLASS_2 | 15-28 | PASSIVE |
| CLASS_3 | 29-42 | ACTIVE |
| CLASS_4 | 43-56 | ACTIVE |
| CLASS_5 | 57-70 | AGGRESSIVE |
| CLASS_6 | 71-84 | AGGRESSIVE |
| CLASS_7 | 85-100 | LOCKDOWN |

## Development
```bash
pnpm dev      # Start on port 3087
pnpm build    # TypeScript check
pnpm deploy   # Deploy to Cloudflare Workers
```
