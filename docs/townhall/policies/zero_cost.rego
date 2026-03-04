# Zero-Cost Mandate Policy
# Policy ID: POL-001
# Enforces that all platform services comply with the Zero-Cost Mandate
# No paid services, SaaS subscriptions, or licensing fees permitted

package infinity.policies.zero_cost

import future.keywords.if
import future.keywords.in

# Default deny
default allow := false

# Allow if service is zero-cost compliant
allow if {
    input.service.cost_per_month == 0
    input.service.uses_paid_tier == false
    not has_unlicensed_paid_component
}

# Check for paid components
has_unlicensed_paid_component if {
    some component in input.service.components
    component.cost > 0
    not component.exception_approved == true
}

# Violation messages
violations[msg] if {
    input.service.cost_per_month > 0
    msg := sprintf("Service '%v' has monthly cost of $%v — violates Zero-Cost Mandate (POL-001)", [
        input.service.name,
        input.service.cost_per_month
    ])
}

violations[msg] if {
    some component in input.service.components
    component.cost > 0
    not component.exception_approved == true
    msg := sprintf("Component '%v' in service '%v' has cost $%v — requires exception approval", [
        component.name,
        input.service.name,
        component.cost
    ])
}

# Approved free-tier services
approved_free_services := {
    "cloudflare_workers",
    "cloudflare_r2",
    "cloudflare_d1",
    "cloudflare_kv",
    "cloudflare_calls",
    "oracle_always_free",
    "supabase_free",
    "groq_free",
    "github_free",
    "postgresql_self_hosted",
    "prometheus_self_hosted",
    "grafana_self_hosted",
    "loki_self_hosted",
    "arbitrum_l2",
    "ipfs_free",
}