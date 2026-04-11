-- ============================================================
-- INFINITY OS — D1 Migration 0002: IAM Core
-- ============================================================
-- Identity & Access Management: users, roles, permissions, sessions
-- Database: Cloudflare D1 (SQLite)
-- Compliance: GDPR, SOC 2, ISO 27001
-- ============================================================

-- ── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  avatar_url        TEXT,
  password_hash     TEXT,                             -- NULL for SSO-only users
  role              TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('super_admin', 'org_admin', 'power_user', 'member', 'viewer', 'guest', 'service_account')),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'suspended', 'pending_verification')),

  -- MFA
  mfa_enabled       INTEGER NOT NULL DEFAULT 0,
  mfa_secret        TEXT,                             -- Encrypted TOTP secret
  mfa_backup_codes  TEXT,                             -- JSON array, encrypted

  -- Profile
  preferences       TEXT NOT NULL DEFAULT '{}',       -- JSON: theme, language, timezone, etc.
  metadata          TEXT NOT NULL DEFAULT '{}',       -- JSON: custom fields

  -- Timestamps
  email_verified_at TEXT,
  last_login_at     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT                              -- GDPR soft delete
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_tenant ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ── Roles (Custom per-tenant) ───────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  description       TEXT,
  level             INTEGER NOT NULL DEFAULT 4
                    CHECK (level >= 0 AND level <= 6),
  -- Level 0: Platform Guardian (system-only)
  -- Level 1: Platform Admin, Security Admin
  -- Level 2: Org Admin
  -- Level 3: Power User, Developer
  -- Level 4: Standard User
  -- Level 5: Guest (time-limited)
  -- Level 6: Non-Human Identity (agent, bot, service)
  role_type         TEXT NOT NULL DEFAULT 'CUSTOM'
                    CHECK (role_type IN ('SYSTEM', 'ORGANISATION', 'APPLICATION', 'CUSTOM', 'TEMPORAL', 'EMERGENCY')),
  is_assignable     INTEGER NOT NULL DEFAULT 1,
  max_holders       INTEGER,                          -- NULL = unlimited
  metadata          TEXT DEFAULT '{}',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_tenant ON roles(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_roles_level ON roles(level);

-- ── Permissions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id                TEXT PRIMARY KEY,
  namespace         TEXT NOT NULL,                    -- e.g., 'hive', 'ai-gateway', 'registry'
  resource          TEXT NOT NULL,                    -- e.g., 'modules', 'tenants', 'users'
  action            TEXT NOT NULL,                    -- e.g., 'read', 'write', 'delete', 'admin'
  description       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_unique ON permissions(namespace, resource, action);

-- ── Role-Permission Mappings ────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id                TEXT PRIMARY KEY,
  role_id           TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id     TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  conditions        TEXT DEFAULT '{}',                -- JSON: contextual constraints
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_permissions_unique ON role_permissions(role_id, permission_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

-- ── User-Role Assignments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id           TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by        TEXT,
  expires_at        TEXT,                             -- For temporal roles
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique ON user_roles(user_id, role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

-- ── Sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL,                    -- SHA-256 of session token
  ip_address        TEXT,
  user_agent        TEXT,
  device_fingerprint TEXT,
  expires_at        TEXT NOT NULL,
  last_active_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── Audit Log (Append-only) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  actor_id          TEXT,                             -- User or service account
  actor_type        TEXT NOT NULL DEFAULT 'user'
                    CHECK (actor_type IN ('user', 'service', 'system', 'agent')),
  action            TEXT NOT NULL,                    -- e.g., 'user.login', 'module.install', 'tenant.update'
  resource_type     TEXT,
  resource_id       TEXT,
  details           TEXT DEFAULT '{}',                -- JSON: before/after, metadata
  ip_address        TEXT,
  user_agent        TEXT,
  risk_level        TEXT DEFAULT 'none'
                    CHECK (risk_level IN ('none', 'low', 'medium', 'high', 'critical')),
  integrity_hash    TEXT,                             -- SHA-256 chain for tamper detection
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_risk ON audit_log(risk_level);