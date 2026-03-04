# AI Canon Compliance Policy
# Policy ID: POL-002
# Enforces the 5 Articles of the AI Magna Carta across all AI systems

package infinity.policies.ai_canon

import future.keywords.if
import future.keywords.in

default allow := false
default compliant := false

# Allow if all 5 articles are satisfied
allow if {
    compliant
}

compliant if {
    article_1_sovereignty
    article_2_transparency
    article_3_privacy
    article_4_security
    article_5_accountability
}

# Article 1 — Sovereignty: Human override capability
article_1_sovereignty if {
    input.ai_system.has_human_override == true
    input.ai_system.hitl_enabled == true
    input.ai_system.autonomy_level <= 4  # Max L4, L5 requires board approval
}

# Article 2 — Transparency: Explainable decisions
article_2_transparency if {
    input.ai_system.has_explainability == true
    input.ai_system.decision_logging == true
    input.ai_system.model_card_published == true
}

# Article 3 — Privacy: Data minimisation
article_3_privacy if {
    input.ai_system.data_minimisation == true
    input.ai_system.pii_handling in {"anonymised", "pseudonymised", "none"}
    input.ai_system.dpia_completed == true
}

# Article 4 — Security: Quantum-safe cryptography
article_4_security if {
    input.ai_system.crypto_standard in {"ML-DSA-65", "ML-KEM-1024", "SLH-DSA"}
    input.ai_system.tls_version >= "1.3"
    input.ai_system.secrets_in_void == true
}

# Article 5 — Accountability: Audit trail
article_5_accountability if {
    input.ai_system.audit_trail_enabled == true
    input.ai_system.on_chain_anchoring == true
    input.ai_system.responsible_party != ""
}

# Logic Levels — autonomy constraints
logic_level_violations[msg] if {
    input.ai_system.autonomy_level == 5
    not input.ai_system.board_approval == true
    msg := "L5 autonomy requires Governance Board approval (AI Canon Art. 1)"
}

logic_level_violations[msg] if {
    input.ai_system.autonomy_level >= 4
    not input.ai_system.hitl_gate_configured == true
    msg := "L4+ autonomy requires HITL gate configuration (AI Canon Art. 1)"
}

# Violations
violations[msg] if {
    not article_1_sovereignty
    msg := "AI Canon Article 1 (Sovereignty) violation: missing human override or HITL"
}

violations[msg] if {
    not article_2_transparency
    msg := "AI Canon Article 2 (Transparency) violation: missing explainability or model card"
}

violations[msg] if {
    not article_3_privacy
    msg := "AI Canon Article 3 (Privacy) violation: DPIA not completed or PII not handled"
}

violations[msg] if {
    not article_4_security
    msg := "AI Canon Article 4 (Security) violation: non-quantum-safe crypto or secrets not in Vault"
}

violations[msg] if {
    not article_5_accountability
    msg := "AI Canon Article 5 (Accountability) violation: missing audit trail or on-chain anchoring"
}