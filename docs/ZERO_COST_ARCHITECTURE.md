# Zero-Cost Architecture — Trancendos Infinity OS

## Overview

Infinity OS is built on a **zero-cost-first** architecture. Every infrastructure component has a local, self-hosted, or free-tier provider as its primary option. Paid providers are available as optional fallbacks but are **blocked by default** in zero-cost mode.

## Provider Priority Matrix

| Service | Tier 1 (LOCAL) | Tier 2 (FREE) | Tier 3 (FREEMIUM) | Tier 4 (PAID) |
|---------|---------------|---------------|-------------------|---------------|
| **LLM** | Ollama (self-hosted) | Groq (free tier) | HuggingFace Inference | OpenAI, Anthropic |
| **Storage** | Local Filesystem | — | MinIO (self-hosted) | AWS S3, GCS |
| **Cache** | In-Memory LRU | — | Valkey/KeyDB (self-hosted) | ElastiCache |
| **Search** | In-Memory TF-IDF | — | Meilisearch/Typesense (self-hosted) | Algolia |
| **Database** | SQLite (dev/edge) | — | LibSQL/Turso | PostgreSQL |
| **Event Bus** | In-Memory (Kernel) | — | Valkey Pub/Sub | NATS, Redis |

## Zero-Cost Enforcement

### Runtime Guard

The `ZeroCostGuard` singleton enforces cost policies at runtime:

- **Zero-Cost Mode** (default): All paid API calls are blocked. Only LOCAL and FREE tier providers are allowed.
- **Budgeted Mode**: Paid providers allowed within daily/monthly limits.
- **Auto-Throttle**: Providers exceeding error thresholds are automatically degraded.

### Cost Headers

Every HTTP response includes cost transparency headers:

```
X-Cost-Mode: zero-cost
X-Cost-Daily-Total: $0.000000
X-Cost-Monthly-Total: $0.000000
X-Cost-Lifetime-Total: $0.000000
X-Cost-Requests-Blocked: 0
X-Cost-Zero-Pct: 100.0%
```

### Configuration

```env
# Zero-cost mode (default: true)
ZERO_COST_MODE=true

# Budget limits (0 = unlimited, only used when ZERO_COST_MODE=false)
COST_DAILY_LIMIT_USD=0
COST_MONTHLY_LIMIT_USD=0
COST_ALERT_THRESHOLD_PCT=80
COST_AUTO_THROTTLE=true

# Provider priorities (comma-separated, first = highest priority)
LLM_PROVIDER_PRIORITY=ollama,groq,huggingface,openai,anthropic
STORAGE_PROVIDER_PRIORITY=local_filesystem,minio_s3
CACHE_PROVIDER_PRIORITY=in_memory,valkey_redis
SEARCH_PROVIDER_PRIORITY=in_memory,meilisearch,typesense
```

## Multi-Provider Architecture

### No Vendor Lock-In

Every critical service has 2+ provider implementations behind a unified interface:

```
┌─────────────────────────────────────────────┐
│              Unified Gateway API             │
│  (storage_put, cache_get, search_query, ...) │
├─────────────────────────────────────────────┤
│           Provider Registry                  │
│  (register, discover, health-check, failover)│
├──────┬──────┬──────┬──────┬────────────────┤
│LOCAL │ FREE │FREEM │ PAID │  ENTERPRISE    │
│      │      │      │      │                │
│Ollama│ Groq │ HF   │OpenAI│  Custom        │
│Files │      │MinIO │ S3   │  Enterprise    │
│Memory│      │Valkey│Redis │  Managed       │
│TF-IDF│      │Meili │Algol │  Dedicated     │
└──────┴──────┴──────┴──────┴────────────────┘
```

### Auto-Failover

If a provider fails:
1. Error is recorded in the provider registry
2. After 5 consecutive errors, provider is auto-degraded
3. Next request cascades to the next available provider
4. Degraded providers are retried after a cooldown period

### Provider Health Checks

```
GET /api/v1/system/costs
```

Returns real-time cost tracking, provider status, and zero-cost compliance.

## Multi-Database Support

### Dialect-Agnostic Design

The database layer supports multiple backends via a single `DATABASE_URL`:

| Backend | URL Format | Use Case |
|---------|-----------|----------|
| SQLite | `sqlite+aiosqlite:///./data.db` | Development, edge |
| PostgreSQL | `postgresql+asyncpg://user:pass@host/db` | Production |
| LibSQL | `sqlite+aiosqlite:///./data.db` | Turso edge |

### Dialect-Agnostic UUID

All models use `DialectUUID` — a custom SQLAlchemy type that:
- Uses native `UUID` on PostgreSQL
- Uses `String(36)` on SQLite/LibSQL
- Transparent to application code

### Generic Document Store

Phase 20 introduced a flexible document-store pattern for 22 routers:

- `domain_documents` — JSON document store with domain/entity_type indexing
- `domain_audit_entries` — Unified audit trail
- `domain_counters` — Metrics and counters

This eliminates the need for 70+ individual tables and provides:
- Zero-migration overhead for new routers
- Schema flexibility via JSON content
- Works across all supported databases

## File Structure

```
backend/
├── providers/
│   ├── __init__.py          # Provider registry (154 lines)
│   ├── llm_provider.py      # LLM abstraction (503 lines)
│   ├── storage_provider.py  # Storage abstraction (715 lines)
│   ├── cache_provider.py    # Cache abstraction (665 lines)
│   └── search_provider.py   # Search abstraction (918 lines)
├── zero_cost_guard.py       # Cost enforcement (161 lines)
├── domain_store.py          # Hybrid DB/memory store (300 lines)
├── crud_helpers.py          # Generic CRUD helpers (450 lines)
├── models_phase20.py        # Document models (250 lines)
├── database.py              # Multi-dialect DB (170 lines)
└── config.py                # Provider preferences
```

## 2060 Standard Compliance

| Requirement | Implementation |
|------------|----------------|
| Zero-Cost Infrastructure | ZeroCostGuard + provider priority |
| No Vendor Lock-In | Multi-provider abstraction layer |
| Future-Proof Architecture | Dialect-agnostic, schema-flexible |
| Data Residency | Configurable per-request |
| AI Auditability | Provider tracking + cost headers |
| Self-Healing | Auto-failover + auto-degrade |