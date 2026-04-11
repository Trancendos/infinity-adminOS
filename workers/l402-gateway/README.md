# L402 Gateway

**DPID:** DPID-ECO-L402-001  
**Port:** 3083  
**Ecosystem:** SOVEREIGN

Lightning Network L402 (LSAT) machine-to-machine micropayment gateway for the Trancendos Universe.

## L402 Protocol Flow

```
Client                          L402 Gateway                    Service
  │                                   │                              │
  │──── GET /service ─────────────────►│                             │
  │◄─── 402 Payment Required ──────────│                             │
  │     (invoice + macaroon)           │                             │
  │                                    │                             │
  │──── Pay Lightning invoice ─────────────────────────────────────►│
  │◄─── Payment preimage ──────────────────────────────────────────│
  │                                    │                             │
  │──── POST /payment/confirm ─────────►│                            │
  │     (invoiceId + preimage)          │                            │
  │◄─── Access token + session ─────────│                            │
  │                                    │                             │
  │──── GET /service + Access-Token ───►│                            │
  │◄─── 200 OK ────────────────────────────────────────────────────│
```

## Payment Methods

- **Lightning Network** — Bitcoin micropayments (BOLT-11)
- **TRAN Token** — Native Trancendos token (1 sat = 1000 TRAN)

## Service Pricing

| Service | Price |
|---------|-------|
| Oracle Foresight | 5 sats/call |
| Chrono Intelligence | 10 sats/call |
| Cornelius Strategy | 50 sats/call |
| PQC Service | 2 sats/call |
| DePIN Broker | 1 sat/call |
| COVERT Synthesis | 100 sats/call |
