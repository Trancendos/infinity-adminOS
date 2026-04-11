-- ============================================================================
-- TRN-IAM-001: IAM Core Role Hierarchy & Schema Migration
-- ============================================================================
-- Ticket:       TRN-IAM-001
-- Complexity:   L4 - Security/Architecture
-- Author:       SuperNinja AI + Continuity Guardian Review
-- Date:         2025-03-07
-- Revert Hash:  782cb3a (pre-schema-changes)
-- Database:     Neon Serverless Postgres (Free Tier)
-- Status:       APPROVED by Continuity Guardian
-- ============================================================================
--
-- This migration implements the fluidic, quantum-resistant, 2060-compliant
-- IAM foundation as approved in the IAM_RBAC_DEEP_DIVE.md review cycle.
--
-- Changes:
--   1. Quantum-resistant audit log (SHA-512)
--   2. Quantum-resistant compliance evidence (SHA-512)
--   3. Fluidic NHI state tracking (WebSocket/SSE presence, JSONB state)
--   4. Dead-Letter Queue for orphaned agent tasks (NEW)
--   5. Core role hierarchy tables
--   6. Permission and policy tables
--   7. Subscription and service access tables
--   8. Bot spawning and API key tables
--   9. Performance indexes
--
-- Zero-Cost Check: All structures use JSONB for flexibility, avoiding
-- costly future ALTER TABLE migrations on Neon free tier.
-- ============================================================================

-- ============================================================================
-- SECTION 1: CORE IDENTITY TABLES
-- ============================================================================

-- 1.1 Roles — Expanded Level 0–6 Hierarchy
CREATE TABLE IF NOT EXISTS iam_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    level INTEGER NOT NULL CHECK (level >= 0 AND level <= 6),
    -- Level 0: Continuity Guardian (irrevocable, sole holder)
    -- Level 1: Platform Admin, Security Admin, Compliance Officer
    -- Level 2: Org Admin, Restricted Admin
    -- Level 3: Developer, Power User, Analyst, Support Agent
    -- Level 4: Standard User, Contributor, Trial User
    -- Level 5: Guest (read-only, time-limited)
    -- Level 6: Non-Human (AI Agent, Bot, Service Account, External AI)
    role_type VARCHAR(30) NOT NULL DEFAULT 'SYSTEM',
    -- SYSTEM, ORGANISATION, APPLICATION, CUSTOM, TEMPORAL, EMERGENCY
    is_assignable BOOLEAN DEFAULT TRUE,
    max_holders INTEGER, -- NULL = unlimited, 1 = sole holder (Level 0)
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the core system roles
INSERT INTO iam_roles (name, display_name, description, level, role_type, is_assignable, max_holders) VALUES
    ('continuity_guardian', 'Continuity Guardian', 'Irrevocable platform sovereign. Cannot be removed or overridden.', 0, 'SYSTEM', FALSE, 1),
    ('platform_admin', 'Platform Admin', 'Full platform administration with audit trail.', 1, 'SYSTEM', TRUE, NULL),
    ('security_admin', 'Security Admin', 'Security policy and incident management.', 1, 'SYSTEM', TRUE, 3),
    ('compliance_officer', 'Compliance Officer', 'TIGA governance and regulatory compliance.', 1, 'SYSTEM', TRUE, 5),
    ('org_admin', 'Organisation Admin', 'Organisation-scoped administration.', 2, 'ORGANISATION', TRUE, NULL),
    ('restricted_admin', 'Restricted Admin', 'Admin with explicit deny overrides on sensitive operations.', 2, 'ORGANISATION', TRUE, NULL),
    ('developer', 'Developer', 'API access, Git connections, sandbox environments, agent spawning within limits.', 3, 'SYSTEM', TRUE, NULL),
    ('power_user', 'Power User', 'Advanced features and configuration access.', 3, 'SYSTEM', TRUE, NULL),
    ('analyst', 'Analyst', 'Read-only analytics and reporting access.', 3, 'SYSTEM', TRUE, NULL),
    ('support_agent', 'Support Agent', 'User support and ticket management.', 3, 'SYSTEM', TRUE, NULL),
    ('standard_user', 'Standard User', 'Default authenticated user with subscription-based access.', 4, 'SYSTEM', TRUE, NULL),
    ('contributor', 'Contributor', 'Content creation and community participation.', 4, 'SYSTEM', TRUE, NULL),
    ('trial_user', 'Trial User', 'Time-limited evaluation access.', 4, 'SYSTEM', TRUE, NULL),
    ('guest', 'Guest', 'Read-only, time-limited, no PII access.', 5, 'SYSTEM', TRUE, NULL),
    ('ai_agent', 'AI Agent', 'In-house Trancendos AI agent identity.', 6, 'SYSTEM', TRUE, NULL),
    ('bot', 'Bot', 'Spawned bot identity with inherited permissions.', 6, 'SYSTEM', TRUE, NULL),
    ('service_account', 'Service Account', 'Machine-to-machine service identity.', 6, 'SYSTEM', TRUE, NULL),
    ('external_ai', 'External AI', 'Third-party AI provider identity (Tier 2/3).', 6, 'SYSTEM', TRUE, NULL)
ON CONFLICT (name) DO NOTHING;

-- 1.2 Permissions — Granular Action Definitions
CREATE TABLE IF NOT EXISTS iam_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace VARCHAR(100) NOT NULL,
    -- e.g., 'admin-os', 'arcadia', 'royal-bank', 'luminous', 'infinity-one'
    resource VARCHAR(100) NOT NULL,
    -- e.g., 'services', 'marketplace', 'transactions', 'agents'
    action VARCHAR(50) NOT NULL,
    -- e.g., 'read', 'write', 'delete', 'admin', 'spawn', 'execute'
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE,
    -- Sensitive permissions require select-few elevation
    requires_mfa BOOLEAN DEFAULT FALSE,
    max_holders INTEGER, -- NULL = unlimited (select-few constraint)
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(namespace, resource, action)
);

-- 1.3 Role-Permission Assignments
CREATE TABLE IF NOT EXISTS iam_role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES iam_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES iam_permissions(id) ON DELETE CASCADE,
    effect VARCHAR(10) NOT NULL DEFAULT 'ALLOW' CHECK (effect IN ('ALLOW', 'DENY')),
    -- DENY overrides ALLOW (restriction profiles)
    conditions JSONB DEFAULT '{}'::jsonb,
    -- ABAC conditions: {"time_range": "09:00-17:00", "ip_allowlist": [...], "mfa_required": true}
    granted_by UUID,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- NULL = permanent
    UNIQUE(role_id, permission_id)
);

-- 1.4 User-Role Assignments (supports multiple roles per user)
CREATE TABLE IF NOT EXISTS iam_user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role_id UUID NOT NULL REFERENCES iam_roles(id) ON DELETE CASCADE,
    organisation_id UUID, -- NULL = global scope
    is_active BOOLEAN DEFAULT TRUE,
    is_primary BOOLEAN DEFAULT FALSE,
    -- Primary role determines default routing after login
    granted_by UUID,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- NULL = permanent, set for TEMPORAL/EMERGENCY roles
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, role_id, organisation_id)
);

-- 1.5 Restriction Profiles — Explicit DENY Overrides for Restricted Admins
CREATE TABLE IF NOT EXISTS iam_restriction_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    target_user_id UUID, -- Specific user restriction
    target_role_id UUID REFERENCES iam_roles(id), -- Role-wide restriction
    denied_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Array of permission IDs or namespace:resource:action patterns
    reason TEXT NOT NULL,
    enforced_by UUID NOT NULL, -- Must be Level 0 or Level 1
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ -- NULL = permanent
);

-- 1.6 Select-Few Elevations — Named Individual Permissions
CREATE TABLE IF NOT EXISTS iam_select_few (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_id UUID NOT NULL REFERENCES iam_permissions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    reason TEXT NOT NULL,
    approved_by UUID NOT NULL, -- Must be Level 0
    approved_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(permission_id, user_id)
);

-- ============================================================================
-- SECTION 2: NON-HUMAN IDENTITY (NHI) MANAGEMENT
-- ============================================================================

-- 2.1 Non-Human Identities — Fluidic Agent State
-- Removing rigid polling heartbeat. WebSocket/SSE presence + JSONB state tracking.
CREATE TABLE IF NOT EXISTS non_human_identities (
    id VARCHAR(100) PRIMARY KEY, -- nhi_{type}_{uuid}
    type VARCHAR(30) NOT NULL CHECK (type IN ('ai_agent', 'bot', 'service_account', 'external_ai', 'ci_cd')),
    name VARCHAR(200) NOT NULL,
    owner_id VARCHAR(100) NOT NULL,
    -- For bots: parent agent ID. For agents: Continuity Guardian or org_admin.
    parent_nhi_id VARCHAR(100) REFERENCES non_human_identities(id),
    -- Spawn chain tracking (NULL for root-level agents)
    spawn_depth INTEGER DEFAULT 0 CHECK (spawn_depth >= 0 AND spawn_depth <= 3),
    -- Max depth: Tier 1 = 3, Tier 2 = 1, Tier 3 = 0

    -- AI Tier Classification
    ai_tier VARCHAR(20) CHECK (ai_tier IN ('tier_1_inhouse', 'tier_2_free', 'tier_3_premium')),
    -- tier_1_inhouse: Free, full ecosystem access, can spawn, TIGA-governed
    -- tier_2_free: £0.001/1K tokens, sandboxed, no spawning, data stays in-region
    -- tier_3_premium: Market rate, isolated execution, no PII, mandatory HITL

    -- Operational Priority (separate from AI tier)
    operational_tier VARCHAR(20) DEFAULT 'T2_IMPORTANT'
        CHECK (operational_tier IN ('T1_CRITICAL', 'T2_IMPORTANT', 'T3_NICE_TO_HAVE')),

    role_id UUID REFERENCES iam_roles(id),
    status VARCHAR(20) DEFAULT 'hibernating'
        CHECK (status IN ('active', 'hibernating', 'processing', 'degraded', 'terminated', 'quarantined')),

    -- Fluidic Presence (Replaces requires_heartbeat)
    presence_protocol VARCHAR(50) DEFAULT 'websocket'
        CHECK (presence_protocol IN ('websocket', 'sse', 'webhook', 'mqtt')),
    agent_state JSONB DEFAULT '{
        "current_task": null,
        "last_event_ts": null,
        "memory_usage_mb": 0,
        "active_connections": 0,
        "error_count": 0
    }'::jsonb,

    -- Security Constraints
    rate_limit JSONB DEFAULT '{"requests_per_minute": 60, "tokens_per_hour": 10000}'::jsonb,
    token_budget JSONB DEFAULT '{"daily_limit": 50000, "monthly_limit": 1000000, "current_usage": 0}'::jsonb,
    ip_allowlist JSONB DEFAULT '[]'::jsonb,
    mandatory_restrictions JSONB DEFAULT '[]'::jsonb,
    -- Restrictions inherited from parent that CANNOT be removed

    -- Lifecycle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ,
    terminated_reason TEXT
);

-- 2.2 Bot Spawning Registry — Tracks Parent→Child Inheritance
CREATE TABLE IF NOT EXISTS nhi_spawn_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_nhi_id VARCHAR(100) NOT NULL REFERENCES non_human_identities(id),
    child_nhi_id VARCHAR(100) NOT NULL REFERENCES non_human_identities(id),
    inherited_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Always a SUBSET of parent permissions
    mandatory_restrictions JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Cannot be removed by child
    spawn_reason TEXT NOT NULL,
    approved_by VARCHAR(100), -- NULL = auto-approved within policy
    spawned_at TIMESTAMPTZ DEFAULT NOW(),
    max_lifetime_hours INTEGER DEFAULT 24,
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'terminated', 'orphaned')),
    orphan_fallback_owner VARCHAR(100),
    -- Fallback owner if parent terminates (default: Continuity Guardian)
    UNIQUE(parent_nhi_id, child_nhi_id)
);

-- ============================================================================
-- SECTION 3: DEAD-LETTER QUEUE (NEW — Drew's Enhancement)
-- ============================================================================

-- 3.1 Agent Task Dead-Letter Queue
-- Catches orphaned tasks and failed permissions. Zero data loss guarantee.
CREATE TABLE IF NOT EXISTS agent_task_dlq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nhi_id VARCHAR(100) REFERENCES non_human_identities(id),
    task_type VARCHAR(100) NOT NULL,
    -- e.g., 'ai_inference', 'data_processing', 'bot_spawn', 'api_call'
    task_payload JSONB NOT NULL,
    -- WARNING: Must be encrypted if contains PII (Future Horizon: E2EE)
    failure_reason TEXT NOT NULL,
    point_of_failure VARCHAR(100) NOT NULL,
    -- e.g., 'abac_evaluation', 'api_timeout', 'token_budget_exceeded',
    --       'parent_terminated', 'permission_denied', 'rate_limited'
    original_principal_id VARCHAR(100),
    original_principal_type VARCHAR(30),
    auto_requeue BOOLEAN DEFAULT TRUE,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status VARCHAR(20) DEFAULT 'pending_rescue'
        CHECK (status IN ('pending_rescue', 'retrying', 'rescued', 'abandoned', 'escalated')),
    escalated_to VARCHAR(100),
    -- If abandoned after max_retries, escalate to Continuity Guardian
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_retry_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT
);

-- ============================================================================
-- SECTION 4: SUBSCRIPTION & SERVICE ACCESS
-- ============================================================================

-- 4.1 Subscription Tiers
CREATE TABLE IF NOT EXISTS subscription_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    -- free, starter, professional, enterprise, sovereign
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    monthly_price_gbp DECIMAL(10,2) DEFAULT 0.00,
    included_services JSONB DEFAULT '[]'::jsonb,
    -- Array of service IDs included by default
    ai_tier_access JSONB DEFAULT '{"tier_1": true, "tier_2": false, "tier_3": false}'::jsonb,
    token_budget JSONB DEFAULT '{"tier_1_daily": 50000, "tier_2_daily": 0, "tier_3_daily": 0}'::jsonb,
    max_agents INTEGER DEFAULT 0,
    max_api_keys INTEGER DEFAULT 1,
    max_git_connections INTEGER DEFAULT 0,
    features JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed subscription tiers
INSERT INTO subscription_tiers (name, display_name, monthly_price_gbp, ai_tier_access, max_agents, max_api_keys, max_git_connections) VALUES
    ('free', 'Free', 0.00, '{"tier_1": true, "tier_2": false, "tier_3": false}', 0, 1, 0),
    ('starter', 'Starter', 4.99, '{"tier_1": true, "tier_2": true, "tier_3": false}', 1, 3, 1),
    ('professional', 'Professional', 14.99, '{"tier_1": true, "tier_2": true, "tier_3": true}', 5, 10, 5),
    ('enterprise', 'Enterprise', 49.99, '{"tier_1": true, "tier_2": true, "tier_3": true}', 20, 50, 20),
    ('sovereign', 'Sovereign', 0.00, '{"tier_1": true, "tier_2": true, "tier_3": true}', -1, -1, -1)
    -- Sovereign: £0 because it's the Continuity Guardian tier. -1 = unlimited.
ON CONFLICT (name) DO NOTHING;

-- 4.2 User Subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tier_id UUID NOT NULL REFERENCES subscription_tiers(id),
    -- À la carte service selections (beyond tier defaults)
    selected_services JSONB DEFAULT '[]'::jsonb,
    -- Array of service IDs the user has opted into
    addon_features JSONB DEFAULT '[]'::jsonb,
    billing_status VARCHAR(20) DEFAULT 'active'
        CHECK (billing_status IN ('active', 'trial', 'past_due', 'cancelled', 'suspended')),
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.3 Platform Services Registry
CREATE TABLE IF NOT EXISTS platform_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    -- e.g., 'arcadia', 'royal-bank', 'luminous', 'void', 'icebox'
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    -- 'core', 'ai', 'financial', 'social', 'utility', 'governance'
    min_subscription_tier VARCHAR(50) DEFAULT 'free',
    is_addon BOOLEAN DEFAULT FALSE,
    -- TRUE = available à la carte outside tier defaults
    addon_price_gbp DECIMAL(10,2) DEFAULT 0.00,
    required_permissions JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'beta', 'maintenance', 'deprecated', 'disabled')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 5: API & GIT CONNECTION PERMISSIONS
-- ============================================================================

-- 5.1 Scoped API Keys — SHA-512 Hashed
CREATE TABLE IF NOT EXISTS scoped_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    -- SHA-512 hash of the API key (quantum-resistant)
    key_prefix VARCHAR(12) NOT NULL,
    -- First 12 chars for identification (e.g., 'trn_live_abc')
    owner_id VARCHAR(100) NOT NULL,
    owner_type VARCHAR(30) NOT NULL CHECK (owner_type IN ('human', 'nhi')),
    name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Scoping
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Array of permission patterns: ["arcadia:marketplace:read", "luminous:inference:execute"]
    ip_allowlist JSONB DEFAULT '[]'::jsonb,
    rate_limit JSONB DEFAULT '{"requests_per_minute": 60}'::jsonb,

    -- Lifecycle
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'expired', 'rotating')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    -- Mandatory expiry — no permanent keys
    last_used_at TIMESTAMPTZ,
    last_rotated_at TIMESTAMPTZ,
    rotation_interval_days INTEGER DEFAULT 90,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT
);

-- 5.2 Git Connection Permissions
CREATE TABLE IF NOT EXISTS git_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id VARCHAR(100) NOT NULL,
    owner_type VARCHAR(30) NOT NULL CHECK (owner_type IN ('human', 'nhi')),
    provider VARCHAR(30) NOT NULL CHECK (provider IN ('github', 'gitlab', 'bitbucket', 'gitea')),
    repository_pattern VARCHAR(500) NOT NULL,
    -- e.g., 'Trancendos/*', 'Trancendos/infinity-portal', 'Trancendos/arcadia-*'

    -- Scoping
    allowed_branches JSONB DEFAULT '["main", "develop"]'::jsonb,
    allowed_operations JSONB DEFAULT '["read"]'::jsonb,
    -- ["read", "write", "create_branch", "create_pr", "merge", "delete_branch"]
    allowed_environments JSONB DEFAULT '["development"]'::jsonb,
    -- ["development", "staging", "production"]

    -- Security
    requires_review BOOLEAN DEFAULT TRUE,
    -- PRs require human review before merge
    max_commits_per_day INTEGER DEFAULT 50,
    webhook_secret_hash VARCHAR(128),
    -- SHA-512 hash of webhook secret

    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'revoked')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);

-- ============================================================================
-- SECTION 6: QUANTUM-RESISTANT AUDIT & COMPLIANCE
-- ============================================================================

-- 6.1 IAM Audit Log — SHA-512 (Quantum-Resistant)
CREATE TABLE IF NOT EXISTS iam_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    principal_id VARCHAR(100) NOT NULL,
    principal_type VARCHAR(30) NOT NULL
        CHECK (principal_type IN ('human', 'ai_agent', 'bot', 'service_account', 'external_ai', 'system')),
    action VARCHAR(200) NOT NULL,
    -- e.g., 'role.assign', 'permission.evaluate', 'login.success', 'agent.spawn'
    resource_type VARCHAR(100),
    resource_id VARCHAR(200),
    decision VARCHAR(10) NOT NULL CHECK (decision IN ('ALLOW', 'DENY', 'ERROR')),
    decision_reason TEXT,
    -- Human-readable explanation of why access was granted/denied
    evaluation_chain JSONB DEFAULT '[]'::jsonb,
    -- Full RBAC→ABAC→Subscription evaluation trace
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    organisation_id UUID,
    risk_score DECIMAL(3,2) DEFAULT 0.00,
    -- 0.00 = no risk, 1.00 = maximum risk
    metadata JSONB DEFAULT '{}'::jsonb,
    sha512_hash VARCHAR(128) NOT NULL
    -- SHA-512 hash of the entire log entry for tamper detection
    -- Replaces sha256_hash for quantum resistance
);

-- 6.2 Compliance Evidence — SHA-512 (Quantum-Resistant)
CREATE TABLE IF NOT EXISTS compliance_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_id VARCHAR(20) NOT NULL,
    -- TIGA control reference: FF-CTRL-001 through FF-CTRL-040+
    control_name VARCHAR(200),
    type VARCHAR(50) NOT NULL,
    -- 'audit_log', 'config_snapshot', 'penetration_test', 'policy_document'
    description TEXT,
    file_url TEXT,
    sha512_hash VARCHAR(128),
    -- SHA-512 hash of evidence file for integrity verification
    uploaded_by UUID,
    verified_by UUID,
    verification_status VARCHAR(20) DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'verified', 'rejected', 'expired')),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    -- CRA 10-year retention minimum
    retention_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 years')
);

-- ============================================================================
-- SECTION 7: APPLICATION-LEVEL RBAC
-- ============================================================================

-- 7.1 Application Permission Namespaces
CREATE TABLE IF NOT EXISTS app_permission_namespaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES platform_services(id),
    namespace VARCHAR(100) NOT NULL UNIQUE,
    -- e.g., 'arcadia', 'admin-os', 'royal-bank', 'luminous'
    description TEXT,
    default_permissions JSONB DEFAULT '[]'::jsonb,
    -- Permissions granted to all authenticated users of this app
    admin_permissions JSONB DEFAULT '[]'::jsonb,
    -- Permissions requiring admin-level access
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 8: PLATFORM CONFIGURATION (JSONB — No Future Migrations)
-- ============================================================================

-- 8.1 Platform Config — Flexible JSONB Store
CREATE TABLE IF NOT EXISTS platform_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(200) NOT NULL UNIQUE,
    config_value JSONB NOT NULL,
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE,
    -- Sensitive configs require Level 0/1 to modify
    last_modified_by UUID,
    last_modified_at TIMESTAMPTZ DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

-- Seed critical platform configs
INSERT INTO platform_config (config_key, config_value, description, is_sensitive) VALUES
    ('auth.jwt.algorithm', '"HS512"', 'JWT signing algorithm — upgraded for quantum resistance', TRUE),
    ('auth.jwt.access_token_ttl_minutes', '30', 'Access token lifetime', FALSE),
    ('auth.jwt.refresh_token_ttl_days', '7', 'Refresh token lifetime', FALSE),
    ('auth.brute_force.max_attempts', '5', 'Max login attempts before lockout', FALSE),
    ('auth.brute_force.lockout_minutes', '15', 'Lockout duration after max attempts', FALSE),
    ('auth.mfa.required_for_level', '2', 'MFA required for roles at this level and above', FALSE),
    ('nhi.presence.default_protocol', '"websocket"', 'Default agent presence protocol', FALSE),
    ('nhi.spawn.max_depth_tier1', '3', 'Max spawn depth for Tier 1 (In-House) agents', FALSE),
    ('nhi.spawn.max_depth_tier2', '1', 'Max spawn depth for Tier 2 (Free-Tier) agents', FALSE),
    ('nhi.spawn.max_depth_tier3', '0', 'Max spawn depth for Tier 3 (Premium) agents — no spawning', FALSE),
    ('dlq.max_retries', '3', 'Max auto-retry attempts for DLQ tasks', FALSE),
    ('dlq.escalation_target', '"continuity_guardian"', 'Escalation target for abandoned DLQ tasks', TRUE),
    ('audit.hash_algorithm', '"sha512"', 'Hash algorithm for audit log integrity', TRUE),
    ('audit.retention_years', '10', 'CRA-compliant audit log retention period', FALSE),
    ('mesh.routing_mode', '"semantic"', 'Agent routing: semantic (2060) vs static_port (legacy)', FALSE)
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- SECTION 9: PERFORMANCE INDEXES
-- ============================================================================

-- Audit log indexes (high-volume table)
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON iam_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_principal ON iam_audit_log(principal_id, principal_type);
CREATE INDEX IF NOT EXISTS idx_audit_action ON iam_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_decision ON iam_audit_log(decision);
CREATE INDEX IF NOT EXISTS idx_audit_org ON iam_audit_log(organisation_id);
CREATE INDEX IF NOT EXISTS idx_audit_risk ON iam_audit_log(risk_score DESC) WHERE risk_score > 0.5;

-- DLQ indexes (rescue priority)
CREATE INDEX IF NOT EXISTS idx_dlq_status ON agent_task_dlq(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_dlq_nhi ON agent_task_dlq(nhi_id);
CREATE INDEX IF NOT EXISTS idx_dlq_rescue ON agent_task_dlq(status, retry_count)
    WHERE status = 'pending_rescue' AND retry_count < 3;

-- NHI indexes
CREATE INDEX IF NOT EXISTS idx_nhi_type ON non_human_identities(type);
CREATE INDEX IF NOT EXISTS idx_nhi_status ON non_human_identities(status);
CREATE INDEX IF NOT EXISTS idx_nhi_owner ON non_human_identities(owner_id);
CREATE INDEX IF NOT EXISTS idx_nhi_tier ON non_human_identities(ai_tier);
CREATE INDEX IF NOT EXISTS idx_nhi_parent ON non_human_identities(parent_nhi_id)
    WHERE parent_nhi_id IS NOT NULL;

-- Role & permission indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON iam_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON iam_user_roles(user_id, is_active)
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_role_perms_role ON iam_role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_perms_namespace ON iam_permissions(namespace, resource);

-- Subscription indexes
CREATE INDEX IF NOT EXISTS idx_user_subs_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subs_status ON user_subscriptions(billing_status);

-- API key indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON scoped_api_keys(owner_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON scoped_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON scoped_api_keys(status, expires_at)
    WHERE status = 'active';

-- Git connection indexes
CREATE INDEX IF NOT EXISTS idx_git_conn_owner ON git_connections(owner_id, owner_type);

-- ============================================================================
-- SECTION 10: ROW-LEVEL SECURITY (Future Horizon — Database-Level ABAC)
-- ============================================================================
-- NOTE: RLS policies will be added in a future migration once the JWT
-- active_role claim is integrated with Neon's connection pooler.
-- This provides a zero-cost fortress wall — even if backend API logic fails,
-- the database itself will refuse to return restricted rows.
--
-- Example (to be implemented):
-- ALTER TABLE iam_audit_log ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY audit_read_policy ON iam_audit_log
--     FOR SELECT USING (
--         current_setting('app.current_role_level')::int <= 2
--         OR principal_id = current_setting('app.current_user_id')
--     );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Revert Hash: 782cb3a (git revert to this hash to undo all schema changes)
-- Next Step: Backend Auth Flow & Role Routing (Phase 2)
-- ============================================================================