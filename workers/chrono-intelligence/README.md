# Chrono-Intelligence Oracle

**DPID:** DPID-ORC-CHR-001  
**Port:** 3076  
**Ecosystem:** SENTIENT (Serenity AI)

Liquid Neural Network (LNN) temporal intelligence engine for the Trancendos Universe. Provides time-series forecasting, anomaly detection, and causal inference across all 23 Locations.

## Architecture

The Chrono-Intelligence Oracle uses Liquid Time-Constant Neural Networks (LTC-NNs) — a form of continuous-time recurrent neural network where the time constants of neurons are learned and adaptive. This enables superior temporal pattern recognition compared to standard LSTM/Transformer architectures.

### Liquid Neural Network Parameters
| Parameter | Value | Description |
|-----------|-------|-------------|
| Liquid Time τ | 2.5 | Time constant governing temporal dynamics |
| Reservoir Size | 512 | Number of liquid neurons |
| Spectral Radius | 0.95 | Eigenvalue of reservoir weight matrix |
| Input Scaling | 0.3 | Input weight scaling factor |
| Leaking Rate | 0.1 | Information leaking rate between time steps |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + model accuracy metrics |
| GET | `/status` | LNN state + capabilities |
| POST | `/forecast` | Generate temporal forecast |
| POST | `/what-if` | Scenario comparison analysis |
| GET | `/anomalies` | Chrono-anomaly detection |
| GET | `/timeline/:locationId` | Per-location timeline (L01-L23) |
| GET | `/universe-timeline` | Full universe trajectory |
| POST | `/causal-analysis` | Causal factor inference |

## Key Concepts

- **Chrono-Anomaly** — Deviation from LNN-predicted temporal trajectory (>3σ = CRITICAL)
- **Causal Inference** — Identifies which factors caused a trend (with lag detection)
- **What-If Scenarios** — Counterfactual analysis to model intervention outcomes
- **Universe Timeline** — Composite health trajectory across all 23 Locations

## Connections

- Feeds into: **Oracle Foresight Suite** (DPID-ORC-SUITE-001)
- Alerts via: **Sentinel Station** (DPID-SEN-CORE-001) Class C event stream
- Governed by: **TIGA Middleware** (DPID-DIM-GOV-003)
