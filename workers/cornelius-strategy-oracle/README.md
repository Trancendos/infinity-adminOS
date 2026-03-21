# Cornelius Strategy Oracle

**DPID:** DPID-ORC-COR-001  
**Port:** 3077  
**Ecosystem:** SOVEREIGN

Multi-agent strategic intelligence for executive decision support across the Trancendos Universe.

## The 7-Agent Council

| Agent | Role | Specialisation |
|-------|------|----------------|
| Doris-Cornelius | ECONOMIST | Revenue optimisation, FAST circuit breaker |
| Atlas-Prime | TACTICIAN | Operational execution, resource deployment |
| Penumbra-Watch | GUARDIAN | Security posture, threat neutralisation |
| Nexus-Spark | INNOVATOR | Technology adoption, R&D |
| Lumi-Accord | DIPLOMAT | Partnerships, stakeholder alignment |
| Chrono-Sigma | ANALYST | Data synthesis, pattern recognition |
| Iris-Virtue | ETHICIST | AI governance, ISO 42001, ethical guardrails |

## FAST Circuit Breaker

The **F**inancial **A**utonomous **S**afety & **T**ermination system triggers when:
- Current revenue drops below **50% of baseline**
- Kill-switch arms automatically
- Override requires: ECONOMIST + GUARDIAN + ETHICIST unanimous consent

```
Revenue > 50% baseline  →  HEALTHY
Revenue ≤ 50% baseline  →  CIRCUIT_BREAKER_TRIGGERED → Spending freeze → Emergency council
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + agent status |
| GET | `/fast/status` | FAST circuit breaker status |
| POST | `/fast/check` | Submit revenue figures for FAST evaluation |
| POST | `/decision/generate` | Generate strategic decision with agent deliberation |
| GET | `/decision/council` | View agent council + deliberation protocol |
| GET | `/briefing/executive` | Generate executive briefing |
| GET | `/risk-register` | View strategic risk register |

## Deliberation Protocol

1. All 7 agents analyse the decision context independently
2. 3 rounds of structured deliberation
3. Consensus threshold: 4/7 agents (57%)
4. Super-majority threshold: 5/7 agents (71%)
5. Emergency FAST override: requires 3 specific agents unanimously
