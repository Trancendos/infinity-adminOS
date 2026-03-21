# COVERT Synthesis — Penumbra

**DPID:** DPID-COV-SYN-001  
**Port:** 3080  
**Ecosystem:** GUARDIAN  
**Classification:** RESTRICTED

The Penumbra sub-system: covert intelligence synthesis and autonomous threat neutralisation.

**COVERT** = **C**overt **O**perations, **V**igilance, **E**vasion, **R**econnaissance, **T**racking

## Threat Classes

| Class | Description |
|-------|-------------|
| ADVERSARIAL_ML | Model poisoning, evasion attacks, adversarial inputs |
| DARK_PATTERN | Manipulative UX, confirmshaming, hidden costs |
| INSIDER_THREAT | Anomalous internal behaviour analytics |
| APT | Advanced persistent threat actors |
| SYNTHETIC_IDENTITY | Fake UPIF identities, Sybil attacks |
| SUPPLY_CHAIN | Dependency poisoning, build compromise |
| QUANTUM_HARVEST | Harvest-now-decrypt-later quantum attacks |

## Penumbra Modes

| Mode | Description |
|------|-------------|
| PASSIVE | Silent observation only |
| ACTIVE | Monitor + autonomous low-risk neutralisation |
| AGGRESSIVE | Autonomous neutralisation for all HIGH+ threats |
| LOCKDOWN | Block all unauthenticated traffic universe-wide |

## Authentication

All endpoints (except `/health` and `/`) require **Slipstream authentication** via `x-slipstream-token` header. This ensures the Penumbra system is only accessible from within the Trancendos warp tunnel network.
