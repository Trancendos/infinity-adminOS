# 📋 Policy Hub — Index
## The TownHall | Infinity OS / Arcadia Ecosystem

**Version:** 1.0.0 | **Classification:** INTERNAL  
**Last Updated:** 2025-01-01 | **Owner:** Governance Board  
**Policy Engine:** OPA/Rego → Rust WASM (`packages/policy-engine`)

---

## Active Policies

| Policy ID | Title | Category | Version | Status | Rego File |
|-----------|-------|----------|---------|--------|-----------|
| POL-001 | Zero-Cost Mandate | Financial | 1.0.0 | ACTIVE | `zero_cost.rego` |
| POL-002 | AI Canon Compliance | AI Governance | 1.0.0 | ACTIVE | `ai_canon.rego` |
| POL-003 | Data Classification | Security | 1.0.0 | ACTIVE | `data_classification.rego` |
| POL-004 | HITL Gate Requirements | AI Safety | 1.0.0 | ACTIVE | `hitl_gates.rego` |
| POL-005 | Quantum-Safe Cryptography | Security | 1.0.0 | ACTIVE | `quantum_safe.rego` |
| POL-006 | PRINCE2 Gate Compliance | Project Management | 1.0.0 | ACTIVE | `prince2_gates.rego` |
| POL-007 | ITIL 4 Service Management | ITSM | 1.0.0 | ACTIVE | `itil4.rego` |
| POL-008 | EU AI Act Compliance | Legal/Regulatory | 1.0.0 | ACTIVE | `eu_ai_act.rego` |
| POL-009 | GDPR Data Protection | Legal/Regulatory | 1.0.0 | ACTIVE | `gdpr.rego` |
| POL-010 | IP Protection | Legal | 1.0.0 | ACTIVE | `ip_protection.rego` |

---

## Policy Categories

- **Financial** — Zero-cost mandate, budget controls, financial governance
- **AI Governance** — AI Canon, HITL gates, model governance
- **Security** — Data classification, cryptography, access control
- **Project Management** — PRINCE2 gates, delivery governance
- **ITSM** — ITIL 4 practices, service management
- **Legal/Regulatory** — EU AI Act, GDPR, UK GDPR, ISO standards
- **Legal** — IP protection, contracts, NDAs

---

## Policy Lifecycle

```
DRAFT → REVIEW → APPROVED → ACTIVE → DEPRECATED → ARCHIVED
```

All policy changes require:
1. Gate G2 (Design) review minimum
2. Governance Board approval for ACTIVE policies
3. On-chain anchoring (IPFS + Arbitrum L2) upon activation
4. ML-DSA-65 quantum-safe signature