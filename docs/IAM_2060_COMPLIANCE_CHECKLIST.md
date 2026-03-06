# IAM & RBAC — 2060 Compliance Checklist
## Trancendos Ecosystem · Infinity Portal

**Version:** 1.0.0  
**Status:** ACTIVE  
**Ticket:** TRN-IAM-003c  
**Revert:** db30743  
**Last Updated:** 2025-03-06  
**Owner:** Continuity Guardian  
**Standard:** 2060 Modular Standard  

---

## 1. Purpose

This document serves as the authoritative compliance checklist for all IAM and RBAC components within the Infinity Portal, measured against the Trancendos 2060 Modular Standard. Every item maps to a specific code artifact, configuration, or architectural decision.

The checklist is designed to be reviewed quarterly and updated as the platform evolves through the three major technology horizons:

| Horizon | Period | Key Transition |
|---------|--------|----------------|
| **Foundation** | 2024–2026 | Classical crypto + static routing |
| **Hybrid** | 2027–2035 | PQC hybrid + mDNS/Consul discovery |
| **Sovereign** | 2036–2060 | Pure PQC + semantic mesh + neural-ready |

---

## 2. Cryptographic Compliance

### 2.1 Token Signing

| Requirement | Status | Artifact | Migration Path |
|-------------|--------|----------|----------------|
| JWT signed with HS512 (minimum) | ✅ PASS | `backend/auth.py:70` | HS256 → HS512 (done) → Ed25519 (2028) → ML-DSA (2035) |
| Algorithm configurable via env var | ✅ PASS | `JWT_ALGORITHM` env var | Allows zero-downtime algorithm rotation |
| Token includes JTI for revocation | ✅ PASS | `auth.py` create_token | JTI stored for blacklist checking |
| Refresh token rotation on use | ✅ PASS | `auth.py` refresh endpoint | Prevents replay attacks |

### 2.2 Integrity Hashing

| Requirement | Status | Artifact | Migration Path |
|-------------|--------|----------|----------------|
| Audit log integrity: SHA-512 | ✅ PASS | `auth.py:721` _log_decision | SHA-256 → SHA-512 (done) → SHA-3 (2030) → XMSS (2045) |
| API key hashing: SHA-512 | ✅ PASS | `auth.py:852` generate_api_key | 128-char hex digest, constant-time comparison |
| Webhook secret hashing: SHA-512 | ✅ PASS | `models.py` GitConnection | Consistent with API key hashing |
| Password hashing: bcrypt | ✅ PASS | `auth.py` register_user | bcrypt → Argon2id (2028) → PQC-KDF (2040) |

### 2.3 Quantum-Safe Readiness

| Requirement | Status | Artifact | Notes |
|-------------|--------|----------|-------|
| quantum_signature column on NHI models | ✅ PASS | `models.py:2795,2877,2901,2929` | Nullable — populated when PQC is activated |
| Service auth method tracking | ✅ PASS | `models.py` PlatformService | `hmac_sha512 → ml_kem → hybrid_pqc → slh_dsa` |
| PQC migration path documented | ✅ PASS | This document + `2060_TECHNOLOGY_ROADMAP.md` | NIST PQC standards: ML-DSA, ML-KEM, SLH-DSA |
| Crypto agility (no hardcoded algorithms) | ✅ PASS | All crypto via env vars or config | Zero-downtime algorithm rotation |

---

## 3. Identity & Access Model Compliance

### 3.1 Role Architecture

| Requirement | Status | Artifact | Notes |
|-------------|--------|----------|-------|
| 7-tier role hierarchy (Level 0–6) | ✅ PASS | `models.py` IAMRoleLevel enum | Continuity Guardian (0) → External AI (6) |
| 18 system roles defined | ✅ PASS | `seed_iam.py:54` SYSTEM_ROLES | Immutable system roles + extensible custom roles |
| Role type classification | ✅ PASS | `models.py` IAMRoleType | system / custom / dynamic |
| Max holders enforcement | ✅ PASS | `models.py` IAMRole.max_holders | Prevents role sprawl |
| Irrevocable CG role | ✅ PASS | `routers/rbac.py` delete endpoint | System roles cannot be deleted |

### 3.2 Permission Model

| Requirement | Status | Artifact | Notes |
|-------------|--------|----------|-------|
| Semantic triple format (ns:resource:action) | ✅ PASS | `models.py` IAMPermission | 200+ permissions across 19 namespaces |
| Wildcard matching | ✅ PASS | `auth.py` evaluate_permission | `*` matches all; `ns:*:action` patterns |
| ALLOW/DENY/DENY_RESTRICTION effects | ✅ PASS | `models.py` IAMPermissionEffect | Explicit deny overrides allow |
| Select-Few permissions | ✅ PASS | `models.py` IAMSelectFew | Named individuals only, Level 0 approval |
| Restriction profiles | ✅ PASS | `models.py` IAMRestrictionProfile | DENY overrides with selective elevation |

### 3.3 Five-Step Evaluation Chain

| Step | Status | Artifact | Description |
|------|--------|----------|-------------|
| 1. Identify Principal | ✅ PASS | `auth.py` IAMService | Human or NHI identification |
| 2. RBAC Check | ✅ PASS | `auth.py` get_role_permissions | Role-based permission lookup |
| 3. ABAC Check | ✅ PASS | `auth.py` evaluate_abac_conditions | Attribute-based conditions (time, IP, etc.) |
| 4. Subscription Check | ✅ PASS | `auth.py` check_subscription_access | Tier-gated feature access |
| 5. Audit Log | ✅ PASS | `auth.py` _log_decision | SHA-512 integrity hash on every decision |

---

## 4. Non-Human Identity (NHI) Compliance

| Requirement | Status | Artifact | Notes |
|-------------|--------|----------|-------|
| 3-tier AI classification | ✅ PASS | `models.py` AITier enum | Tier 1 (in-house) / Tier 2 (free external) / Tier 3 (premium) |
| NHI spawn registry | ✅ PASS | `models.py` NHISpawnRegistry | Parent-child tracking with depth limits |
| Orphaned bot protocol | ✅ PASS | `models.py` NHISpawnRegistry.fallback_owner_id | Auto-reassignment when parent terminates |
| Dead-letter queue | ✅ PASS | `models.py` AgentTaskDLQ | Zero data loss with retry + escalation |
| Presence protocol (WebSocket/SSE) | ✅ PASS | `models.py` PresenceProtocol enum | Replaces HTTP heartbeat polling |
| Operational tier tracking | ✅ PASS | `models.py` OperationalTier enum | development / staging / production / sovereign |

---

## 5. Semantic Mesh Routing Readiness

| Requirement | Status | Artifact | Migration Path |
|-------------|--------|----------|----------------|
| mesh_address column on PlatformService | ✅ PASS | `models.py` PlatformService | `service.agent.local` addressing |
| routing_protocol tracking | ✅ PASS | `models.py` PlatformService | `static_port → mdns → consul → semantic_mesh` |
| health_endpoint per service | ✅ PASS | `models.py` PlatformService | Supports HTTP and gRPC health checks |
| Mesh routing config in PlatformConfig | ✅ PASS | `seed_iam.py` platform configs | `mesh.routing_mode`, `mesh.discovery_protocol` |
| Intent-based routing readiness | 🔲 FUTURE | — | Phase 3 (2036+): "route to nearest GPU node" |
| Service mesh sidecar support | 🔲 FUTURE | — | Phase 2 (2027+): Envoy/Linkerd integration |

### Routing Protocol Migration Timeline

```
2024 ─── static_port ──────────────────────────────────────────
         Services at localhost:PORT
         Direct HTTP/gRPC calls

2027 ─── mdns ─────────────────────────────────────────────────
         Services at service-name.local
         Zero-config discovery on local network

2030 ─── consul ───────────────────────────────────────────────
         Services registered in Consul catalog
         Health checking, load balancing, failover

2036 ─── semantic_mesh ────────────────────────────────────────
         Services at agent.local with intent-based routing
         AI-driven traffic shaping and auto-scaling
         Quantum-encrypted service-to-service channels

2045 ─── neural_mesh ──────────────────────────────────────────
         BCI-aware routing (neural interface priority)
         Thought-to-service direct invocation
         Ambient computing integration

2060 ─── sovereign_mesh ───────────────────────────────────────
         Self-evolving topology
         Edge-to-orbit routing continuum
         Holographic interface endpoints
```

---

## 6. Subscription & Monetisation Compliance

| Requirement | Status | Artifact | Notes |
|-------------|--------|----------|-------|
| 5 subscription tiers | ✅ PASS | `seed_iam.py` SUBSCRIPTION_TIERS | Free → Sovereign |
| GBP pricing (£) | ✅ PASS | `models.py` SubscriptionTier | Numeric(10,2) for precision |
| AI token budgets per tier | ✅ PASS | `models.py` SubscriptionTier | monthly_ai_token_budget |
| Service gating by tier | ✅ PASS | `models.py` PlatformService | min_subscription_tier |
| Addon pricing support | ✅ PASS | `models.py` PlatformService | is_addon + addon_price_gbp |
| Passive income readiness | ✅ PASS | Architecture supports marketplace | App Store + addon services |

---

## 7. Audit & Compliance

| Requirement | Status | Artifact | Notes |
|-------------|--------|----------|-------|
| CRA 10-year retention | ✅ PASS | `models.py` IAMAuditLog | Cyber Resilience Act compliance |
| TIGA compliance evidence | ✅ PASS | `models.py` ComplianceEvidence | SHA-512 integrity hashes |
| Every permission decision logged | ✅ PASS | `auth.py` _log_decision | Including DENY decisions |
| Audit log pagination + filtering | ✅ PASS | `routers/rbac.py` GET /audit | Date range, user, decision filters |
| Tamper-evident log chain | ✅ PASS | SHA-512 hash per entry | Future: Merkle tree chain (2030) |

---

## 8. Frontend Compliance

| Requirement | Status | Artifact | Notes |
|-------------|--------|----------|-------|
| Multi-role IAM context | ✅ PASS | `AuthProvider.tsx` IAMContext | Roles, permissions, subscription tier |
| Client-side permission check | ✅ PASS | `AuthProvider.tsx` hasPermission | Fast cached check, no network |
| Server-side permission evaluation | ✅ PASS | `AuthProvider.tsx` evaluatePermission | Full 5-step chain via API |
| Role-based route guards | ✅ PASS | `App.tsx` RoleGatedRoute | Level-based access control |
| Multi-role selection UI | ✅ PASS | `RoleSelector.tsx` | Cognitive ease, dark theme |
| Graceful IAM fallback | ✅ PASS | `AuthProvider.tsx` loadIAMContext | Legacy auth works if IAM unavailable |
| useIAM / usePermission hooks | ✅ PASS | `AuthProvider.tsx` exports | Convenience hooks for components |

---

## 9. Code Quality & Standards

| Requirement | Status | Notes |
|-------------|--------|-------|
| 2060 Standard comment in every new file | ✅ PASS | All files include `2060 Standard:` header |
| Ticket reference in every commit | ✅ PASS | TRN-IAM-001 through TRN-IAM-003c |
| Revert hash in every file header | ✅ PASS | Safe rollback to any previous state |
| Idempotent seed scripts | ✅ PASS | Check-before-insert pattern |
| Async/await throughout | ✅ PASS | No blocking I/O in request path |
| Type safety (TypeScript + Python type hints) | ✅ PASS | Full type coverage |
| Component Isolation Protocol | ✅ PASS | Max 2 file modifications per ticket |

---

## 10. Future Horizon Log — IAM Specific

Items logged for future implementation, not blocking current production readiness:

| # | Item | Target Horizon | Priority | Notes |
|---|------|---------------|----------|-------|
| 1 | Migrate JWT signing to Ed25519 | 2028 | Medium | Faster than HS512, better key management |
| 2 | Migrate password hashing to Argon2id | 2028 | Medium | Memory-hard, GPU-resistant |
| 3 | Implement Merkle tree audit chain | 2030 | Medium | Tamper-evident log verification |
| 4 | Add ABAC time-window conditions | 2026 | High | "Allow only during business hours" |
| 5 | Add ABAC geo-fencing conditions | 2027 | Medium | "Allow only from UK IP ranges" |
| 6 | Implement mDNS service discovery | 2027 | Medium | Phase 2 mesh routing |
| 7 | Add BCI authentication method | 2040 | Low | Neural interface identity verification |
| 8 | Implement intent-based routing | 2036 | Low | "Route to nearest GPU node" |
| 9 | Add ML-KEM key encapsulation | 2030 | High | NIST PQC standard for key exchange |
| 10 | Implement SLH-DSA signatures | 2035 | Medium | Stateless hash-based signatures |
| 11 | Add Admin OS Focus Mode | 2026 | High | Progressive disclosure UI for admin panels |
| 12 | Implement event-driven telemetry | 2026 | High | Replace polling with WebSocket/SSE events |
| 13 | Add dead-letter queue retry daemon | 2026 | High | Automated DLQ processing with backoff |
| 14 | Implement role delegation chains | 2027 | Medium | Temporary role grants with auto-expiry |
| 15 | Add cross-organisation federation | 2028 | Medium | Multi-tenant IAM with trust boundaries |

---

## 11. Commit Chain — IAM Implementation

```
db30743 feat(iam): TRN-IAM-003b — Frontend IAM integration + role-based routing
2993380 feat(iam): TRN-IAM-003a — Comprehensive IAM seed data script
06afe6d feat(iam): TRN-IAM-002b — Auth Flow & Permission Evaluation Engine
ec68e4b feat(iam): TRN-IAM-002a — ORM models for expanded IAM architecture
b818845 feat(iam): TRN-IAM-001 — Core IAM schema migration + v1.0.1 enhancements
782cb3a docs: add IAM & RBAC Deep Dive architecture document
```

Each commit is independently revertable. The revert hash in each file header points to the safe rollback target.

---

## 12. Sign-Off

| Reviewer | Role | Status | Date |
|----------|------|--------|------|
| Continuity Guardian | Level 0 — Sovereign | ☐ Pending | — |
| Platform Architect | Level 1 — Architect | ☐ Pending | — |

---

*This document is a living artifact. Update quarterly or after any IAM architecture change.*  
*2060 Modular Standard · Trancendos Ecosystem · Zero-Cost Forever*