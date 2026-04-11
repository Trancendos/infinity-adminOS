-- ============================================================
-- Infinity OS — D1 Database Schema
-- Migration: 0001_initial
-- ============================================================

-- ── Organisations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisations (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  owner_id         TEXT NOT NULL,
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organisations_slug ON organisations(slug);
CREATE INDEX IF NOT EXISTS idx_organisations_owner ON organisations(owner_id);

-- ── Users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  display_name     TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'member',
  organisation_id  TEXT REFERENCES organisations(id) ON DELETE SET NULL,
  is_active        INTEGER NOT NULL DEFAULT 1,
  is_verified      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_organisation ON users(organisation_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- ── Sessions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash  TEXT NOT NULL UNIQUE,
  expires_at          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  ip_address          TEXT,
  user_agent          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── Audit Logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  ip_address  TEXT,
  metadata    TEXT DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ── RBAC Role Assignments ──────────────────────────────────
CREATE TABLE IF NOT EXISTS role_assignments (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  granted_by      TEXT REFERENCES users(id),
  granted_at      TEXT NOT NULL,
  expires_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_roles_user ON role_assignments(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_user_role ON role_assignments(user_id, role);