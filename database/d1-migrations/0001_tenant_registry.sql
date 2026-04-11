-- ============================================================
-- INFINITY OS — D1 Migration 0001: Tenant Registry
-- ============================================================
-- Multi-tenant platform core: tenants, domains, routes, config
-- Database: Cloudflare D1 (SQLite)
-- Standard: Trancendos 2060
-- ============================================================

-- ── Tenants ─────────────────────────────────────────────────
-- Core tenant record — every organisation maps to one tenant
CREATE TABLE IF NOT EXISTS tenants (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  plan              TEXT NOT NULL DEFAULT 'free'
                    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise', 'custom')),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'provisioning', 'deactivated', 'archived')),
  owner_id          TEXT NOT NULL,

  -- Branding & config
  display_name      TEXT,
  logo_url          TEXT,
  primary_color     TEXT DEFAULT '#6366f1',
  settings          TEXT NOT NULL DEFAULT '{}',      -- JSON blob

  -- Limits (plan-driven, overridable)
  max_users         INTEGER NOT NULL DEFAULT 5,
  max_workers       INTEGER NOT NULL DEFAULT 3,
  max_storage_mb    INTEGER NOT NULL DEFAULT 100,
  max_ai_tokens     INTEGER NOT NULL DEFAULT 10000,
  rate_limit_rpm    INTEGER NOT NULL DEFAULT 100,

  -- Metadata
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  suspended_at      TEXT,
  deleted_at        TEXT                              -- Soft delete
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan);

-- ── Tenant Domains ──────────────────────────────────────────
-- Custom domains mapped to tenants (for dispatch routing)
CREATE TABLE IF NOT EXISTS tenant_domains (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain            TEXT NOT NULL UNIQUE,
  type              TEXT NOT NULL DEFAULT 'custom'
                    CHECK (type IN ('custom', 'subdomain', 'internal')),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'failed', 'removed')),
  ssl_status        TEXT DEFAULT 'pending',
  verified_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_domain ON tenant_domains(domain);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains(tenant_id);

-- ── Tenant Routes ───────────────────────────────────────────
-- URL patterns → worker/module routing table
CREATE TABLE IF NOT EXISTS tenant_routes (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pattern           TEXT NOT NULL,                    -- e.g., '/api/v1/*', '/dashboard'
  target_worker     TEXT NOT NULL,                    -- worker script name or module ID
  target_type       TEXT NOT NULL DEFAULT 'worker'
                    CHECK (target_type IN ('worker', 'module', 'static', 'redirect', 'proxy')),
  method            TEXT DEFAULT '*',                 -- HTTP method filter
  priority          INTEGER NOT NULL DEFAULT 100,     -- Lower = higher priority
  auth_required     INTEGER NOT NULL DEFAULT 1,       -- Boolean
  rate_limit_override INTEGER,                        -- Per-route override
  metadata          TEXT DEFAULT '{}',                -- JSON: headers, transforms, etc.
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_routes_tenant ON tenant_routes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_routes_pattern ON tenant_routes(tenant_id, pattern);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_routes_unique ON tenant_routes(tenant_id, pattern, method);

-- ── Tenant API Keys ─────────────────────────────────────────
-- Per-tenant API keys for programmatic access
CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  key_hash          TEXT NOT NULL,                    -- SHA-256 of the actual key
  key_prefix        TEXT NOT NULL,                    -- First 8 chars for identification
  scopes            TEXT NOT NULL DEFAULT '["read"]', -- JSON array of scopes
  expires_at        TEXT,
  last_used_at      TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_tenant ON tenant_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_prefix ON tenant_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_hash ON tenant_api_keys(key_hash);

-- ── Tenant Quotas (Usage Tracking) ──────────────────────────
CREATE TABLE IF NOT EXISTS tenant_usage (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period            TEXT NOT NULL,                    -- e.g., '2025-03' (monthly)
  metric            TEXT NOT NULL,                    -- 'requests', 'ai_tokens', 'storage_mb', 'bandwidth_mb'
  value             INTEGER NOT NULL DEFAULT 0,
  limit_value       INTEGER,                          -- NULL = unlimited
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_usage_unique ON tenant_usage(tenant_id, period, metric);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_tenant ON tenant_usage(tenant_id);

-- ── Tenant Feature Flags ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_features (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature           TEXT NOT NULL,                    -- e.g., 'ai_gateway', 'custom_domains', 'webhooks'
  enabled           INTEGER NOT NULL DEFAULT 0,
  config            TEXT DEFAULT '{}',                -- JSON feature-specific config
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_features_unique ON tenant_features(tenant_id, feature);