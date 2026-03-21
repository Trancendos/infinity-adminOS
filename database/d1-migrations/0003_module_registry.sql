-- ============================================================
-- INFINITY OS — D1 Migration 0003: Module Registry
-- ============================================================
-- Plug-and-play module/plugin system: catalog, versions, installs
-- Database: Cloudflare D1 (SQLite)
-- Standard: Trancendos 2060 — Modular, composable, portable
-- ============================================================

-- ── Modules (Global Catalog) ────────────────────────────────
-- Every deployable unit in the ecosystem: workers, packages, apps
CREATE TABLE IF NOT EXISTS modules (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,              -- e.g., '@trancendos/ai-gateway'
  display_name      TEXT NOT NULL,
  description       TEXT,
  type              TEXT NOT NULL DEFAULT 'worker'
                    CHECK (type IN ('worker', 'package', 'app', 'adapter', 'plugin', 'theme', 'integration')),
  category          TEXT DEFAULT 'utility'
                    CHECK (category IN ('core', 'ai', 'finance', 'security', 'analytics', 'communication', 'storage', 'utility', 'ui', 'integration')),
  author_id         TEXT,
  author_name       TEXT,
  repository_url    TEXT,
  icon_url          TEXT,
  
  -- Capabilities declared by this module
  capabilities      TEXT NOT NULL DEFAULT '[]',       -- JSON: ['ai:completion', 'storage:read', 'db:write']
  
  -- Requirements from the platform
  required_bindings TEXT NOT NULL DEFAULT '[]',        -- JSON: ['D1', 'KV', 'AI']
  required_plan     TEXT DEFAULT 'free'
                    CHECK (required_plan IN ('free', 'starter', 'pro', 'enterprise')),
  
  -- Lifecycle
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'review', 'published', 'deprecated', 'archived')),
  visibility        TEXT NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('public', 'private', 'unlisted', 'internal')),
  
  -- Stats
  install_count     INTEGER NOT NULL DEFAULT 0,
  rating_sum        INTEGER NOT NULL DEFAULT 0,
  rating_count      INTEGER NOT NULL DEFAULT 0,
  
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  published_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_modules_type ON modules(type);
CREATE INDEX IF NOT EXISTS idx_modules_category ON modules(category);
CREATE INDEX IF NOT EXISTS idx_modules_status ON modules(status);
CREATE INDEX IF NOT EXISTS idx_modules_visibility ON modules(visibility);

-- ── Module Versions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS module_versions (
  id                TEXT PRIMARY KEY,
  module_id         TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  version           TEXT NOT NULL,                    -- Semver: '1.2.3'
  changelog         TEXT,
  
  -- Deployment artifact
  entry_point       TEXT NOT NULL,                    -- e.g., 'src/index.ts'
  worker_script     TEXT,                             -- Script name for Workers for Platforms
  bundle_url        TEXT,                             -- R2 URL to bundled artifact
  bundle_hash       TEXT,                             -- SHA-256 of bundle
  bundle_size       INTEGER DEFAULT 0,                -- Bytes
  
  -- Compatibility
  min_platform_version TEXT DEFAULT '0.1.0',
  compatibility_flags  TEXT DEFAULT '[]',             -- JSON: ['nodejs_compat']
  
  -- Wrangler config fragment (merged at deploy time)
  wrangler_overrides TEXT DEFAULT '{}',               -- JSON: bindings, vars, etc.
  
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'testing', 'published', 'yanked')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  published_at      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_module_versions_unique ON module_versions(module_id, version);
CREATE INDEX IF NOT EXISTS idx_module_versions_module ON module_versions(module_id);
CREATE INDEX IF NOT EXISTS idx_module_versions_status ON module_versions(status);

-- ── Module Dependencies ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS module_dependencies (
  id                TEXT PRIMARY KEY,
  module_version_id TEXT NOT NULL REFERENCES module_versions(id) ON DELETE CASCADE,
  depends_on_module TEXT NOT NULL,                    -- Module name
  version_range     TEXT NOT NULL DEFAULT '*',        -- Semver range: '^1.0.0'
  dependency_type   TEXT NOT NULL DEFAULT 'required'
                    CHECK (dependency_type IN ('required', 'optional', 'peer', 'dev')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_module_deps_version ON module_dependencies(module_version_id);
CREATE INDEX IF NOT EXISTS idx_module_deps_target ON module_dependencies(depends_on_module);

-- ── Tenant Module Installations ─────────────────────────────
-- Which modules are installed per tenant
CREATE TABLE IF NOT EXISTS tenant_modules (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id         TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  version_id        TEXT NOT NULL REFERENCES module_versions(id),
  
  -- Per-tenant module config
  config            TEXT NOT NULL DEFAULT '{}',       -- JSON: module-specific settings
  enabled           INTEGER NOT NULL DEFAULT 1,
  
  -- Deployment state
  deploy_status     TEXT NOT NULL DEFAULT 'pending'
                    CHECK (deploy_status IN ('pending', 'deploying', 'active', 'failed', 'suspended', 'uninstalling')),
  worker_name       TEXT,                             -- Deployed worker script name
  last_deployed_at  TEXT,
  last_error        TEXT,
  
  -- Resource allocation
  allocated_cpu_ms  INTEGER DEFAULT 50,               -- Max CPU ms per invocation
  allocated_memory_mb INTEGER DEFAULT 128,
  
  installed_by      TEXT NOT NULL,
  installed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_modules_unique ON tenant_modules(tenant_id, module_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant ON tenant_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_module ON tenant_modules(module_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_status ON tenant_modules(deploy_status);

-- ── Module Ratings & Reviews ────────────────────────────────
CREATE TABLE IF NOT EXISTS module_reviews (
  id                TEXT PRIMARY KEY,
  module_id         TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL,
  tenant_id         TEXT NOT NULL,
  rating            INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title             TEXT,
  body              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_module_reviews_unique ON module_reviews(module_id, user_id);
CREATE INDEX IF NOT EXISTS idx_module_reviews_module ON module_reviews(module_id);

-- ── Module Webhooks ─────────────────────────────────────────
-- Lifecycle event notifications for installed modules
CREATE TABLE IF NOT EXISTS module_webhooks (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id         TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  event             TEXT NOT NULL,                    -- 'install', 'uninstall', 'update', 'error', 'health_check'
  url               TEXT NOT NULL,
  secret_hash       TEXT,                             -- For HMAC verification
  enabled           INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  last_status       INTEGER,                          -- HTTP status code
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_module_webhooks_tenant ON module_webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_module_webhooks_event ON module_webhooks(event);