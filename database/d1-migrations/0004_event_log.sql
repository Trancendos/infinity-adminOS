-- ============================================================
-- INFINITY OS — D1 Migration 0004: Event Log & Job Queue
-- ============================================================
-- Async event bus persistence, job queue, webhook delivery
-- Database: Cloudflare D1 (SQLite)
-- Standard: Trancendos 2060
-- ============================================================

-- ── Platform Events ─────────────────────────────────────────
-- Immutable event log for the entire platform event bus
CREATE TABLE IF NOT EXISTS platform_events (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  event_type        TEXT NOT NULL,                    -- e.g., 'tenant.created', 'module.installed', 'user.login'
  source            TEXT NOT NULL,                    -- Worker/service that emitted the event
  subject           TEXT,                             -- Resource identifier
  data              TEXT NOT NULL DEFAULT '{}',       -- JSON event payload
  metadata          TEXT NOT NULL DEFAULT '{}',       -- JSON: correlation_id, trace_id, etc.
  version           TEXT NOT NULL DEFAULT '1.0',      -- Event schema version
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_tenant ON platform_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON platform_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_source ON platform_events(source);
CREATE INDEX IF NOT EXISTS idx_events_created ON platform_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_tenant_type ON platform_events(tenant_id, event_type);

-- ── Event Subscriptions ─────────────────────────────────────
-- Declarative event routing: which modules/workers listen to which events
CREATE TABLE IF NOT EXISTS event_subscriptions (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT,                             -- NULL = platform-wide subscription
  subscriber        TEXT NOT NULL,                    -- Worker/module name
  event_pattern     TEXT NOT NULL,                    -- Glob: 'tenant.*', 'module.installed', '*'
  filter            TEXT DEFAULT '{}',                -- JSON: additional filter conditions
  delivery_type     TEXT NOT NULL DEFAULT 'queue'
                    CHECK (delivery_type IN ('queue', 'webhook', 'service_binding', 'durable_object')),
  delivery_target   TEXT NOT NULL,                    -- Queue name, URL, or binding name
  max_retries       INTEGER NOT NULL DEFAULT 3,
  retry_delay_ms    INTEGER NOT NULL DEFAULT 1000,
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_event_subs_tenant ON event_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_subs_pattern ON event_subscriptions(event_pattern);
CREATE INDEX IF NOT EXISTS idx_event_subs_subscriber ON event_subscriptions(subscriber);

-- ── Async Job Queue ─────────────────────────────────────────
-- Persistent job tracking for Queue-based async operations
CREATE TABLE IF NOT EXISTS async_jobs (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  job_type          TEXT NOT NULL,                    -- e.g., 'module.deploy', 'ai.batch', 'report.generate'
  queue_name        TEXT NOT NULL DEFAULT 'default',
  priority          INTEGER NOT NULL DEFAULT 5
                    CHECK (priority >= 1 AND priority <= 10),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled', 'retrying')),
  
  -- Payload
  input             TEXT NOT NULL DEFAULT '{}',       -- JSON: job parameters
  output            TEXT,                             -- JSON: job result
  error             TEXT,                             -- Error message if failed
  
  -- Execution
  worker_id         TEXT,                             -- Which worker instance picked this up
  attempt           INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 3,
  
  -- Progress tracking
  progress          INTEGER DEFAULT 0,                -- 0-100 percentage
  progress_message  TEXT,
  
  -- Timing
  scheduled_at      TEXT,                             -- For delayed jobs
  started_at        TEXT,
  completed_at      TEXT,
  expires_at        TEXT,                             -- TTL for completed/failed jobs
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON async_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON async_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON async_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON async_jobs(queue_name, status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled ON async_jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON async_jobs(priority, created_at);

-- ── Webhook Delivery Log ────────────────────────────────────
-- Track outbound webhook delivery attempts
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  webhook_id        TEXT,                             -- Reference to module_webhooks or event_subscriptions
  event_id          TEXT REFERENCES platform_events(id),
  url               TEXT NOT NULL,
  method            TEXT NOT NULL DEFAULT 'POST',
  
  -- Request
  request_headers   TEXT DEFAULT '{}',
  request_body      TEXT,
  
  -- Response
  response_status   INTEGER,
  response_body     TEXT,
  response_time_ms  INTEGER,
  
  -- Delivery
  attempt           INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'delivered', 'failed', 'retrying')),
  error             TEXT,
  next_retry_at     TEXT,
  
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_del_tenant ON webhook_deliveries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_del_event ON webhook_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_del_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_del_retry ON webhook_deliveries(next_retry_at);

-- ── CRON / Scheduled Tasks ──────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  cron_expression   TEXT NOT NULL,                    -- e.g., '0 */6 * * *'
  target_worker     TEXT NOT NULL,                    -- Worker to invoke
  target_endpoint   TEXT DEFAULT '/',                 -- Path to call
  payload           TEXT DEFAULT '{}',                -- JSON payload
  timezone          TEXT DEFAULT 'UTC',
  enabled           INTEGER NOT NULL DEFAULT 1,
  last_run_at       TEXT,
  last_run_status   TEXT,
  next_run_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_tasks_unique ON scheduled_tasks(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_tenant ON scheduled_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next ON scheduled_tasks(next_run_at);