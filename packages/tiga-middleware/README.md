# @trancendos/tiga-middleware

> **DPID:** DPID-DIM-GOV-003 | **Standard:** Trancendos 2060

TIGA (Trancendos Integrity & Governance Architecture) middleware for all Hono workers.

## Usage

```typescript
import { tigaMiddleware, checkOPAPolicy, createFACTEntry } from '@trancendos/tiga-middleware';

const app = new Hono();

// Apply TIGA to all routes
app.use('*', tigaMiddleware({
  service: 'my-service',
  dpid: 'DPID-XXX-001',
  complianceLevel: 'STANDARD',  // BASIC | STANDARD | STRICT
  factLedgerEnabled: true,
}));
```

## Features
- **OPA Policy Enforcement** — Every request checked against OPA Rego policies
- **FACT Ledger** — Cryptographic hash of every request/response for audit trail
- **ISO 42001 Headers** — AI Governance compliance headers on every response
- **Zero-Trust** — All requests treated as untrusted until policy validated
