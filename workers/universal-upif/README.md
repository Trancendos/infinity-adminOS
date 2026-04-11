# Universal UPIF

**DPID:** DPID-ORC-UPF-001  
**Port:** 3078  
**Ecosystem:** NEXUS (Central Hub)

Universal Participant Identity Framework — the identity backbone of the Trancendos Universe. Every human, AI agent, IoT device, and entity has a UPIF identity.

## Identity Tiers

| Tier | Locations | Pillars | Biometric | L402 | Description |
|------|-----------|---------|-----------|------|-------------|
| BASIC | 3 | 1 | No | No | Entry-level participant |
| VERIFIED | 8 | 2 | No | Yes | Verified participant |
| TRUSTED | 15 | 4 | Yes | Yes | Trusted ecosystem member |
| SOVEREIGN | 20 | 5 | Yes | Yes | Sovereign participant |
| UNIVERSAL | 23 | 6 | Yes | Yes | Full universe access |

## Agentic GDP

Every participant generates economic value tracked in **TRAN units**:
- Data Generated
- Services Provided
- Transactions Processed
- Knowledge Contributed
- Security Contributed

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + stats |
| GET | `/stats` | Universe identity statistics |
| POST | `/identity/issue` | Issue new UPIF identity |
| GET | `/identity/:upifId` | Retrieve identity |
| GET | `/identity/:upifId/gdp` | Agentic GDP for identity |
| POST | `/identity/:upifId/federate` | Federate with external systems |
| GET | `/resolve/:locationId` | Resolve all identities at a location |
| GET | `/agentic-gdp/universe` | Universe-wide GDP dashboard |
| GET | `/search` | Search identities |
