# Sentinel Station — Worker

> **DPID:** DPID-SEN-CORE-001 | **Location:** L23 | **Colour:** #7B68EE | **Port:** 3060

Trans-Warp Slipstream Interplexing Hub for the Trancendos Universe.

## Slipstream Classes
| Class | Type | SLA |
|-------|------|-----|
| A | Agent Transit | 100ms |
| B | Data Transfer | 500ms |
| C | Event Stream | 50ms |
| **D** | **Emergency** | **5ms** |

## Protocol: SHP
`HELLO → CHALLENGE → RESPONSE → OPA_VALIDATE → WARP_TUNNEL_OPEN → TRANSIT → SHP_CLOSE`

## Endpoints
- `GET /health` — Station health
- `GET /status` — Operational status
- `POST /slipstream/initiate` — Begin transit
- `POST /passport/validate` — Validate agent passport
- `POST /recall` — Emergency recall (Class D)
- `GET /tunnel/:id` — Tunnel status