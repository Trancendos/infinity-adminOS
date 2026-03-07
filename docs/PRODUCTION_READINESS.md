# Infinity OS — Production Readiness Guide

> **Trancendos 2060 Standard** | Version 3.0.0 | Phase 19

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Configuration](#configuration)
4. [Deployment Options](#deployment-options)
5. [Middleware Stack](#middleware-stack)
6. [2060 Compliance](#2060-compliance)
7. [Health & Monitoring](#health--monitoring)
8. [Security Hardening](#security-hardening)
9. [Scaling & Performance](#scaling--performance)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

Infinity OS is a browser-native AI-augmented Virtual Operating System built on the **Three-Lane Mesh Architecture**:

| Lane | Name | Purpose |
|------|------|---------|
| Lane 1 | AI/Nexus | AI orchestration, agents, characters, cognitive core |
| Lane 2 | User/Infinity | User-facing apps, creative tools, wellbeing |
| Lane 3 | Data/Hive | Data transfer, sync, search, analytics |

### Key Statistics

| Metric | Value |
|--------|-------|
| Total Routers | 79 |
| API Routes | 837 |
| Ecosystem Apps Matched | 37/37 (100%) |
| AI Characters | 27 |
| Test Suite | 664 tests, 67% coverage |
| Middleware Layers | 8 |
| GitHub Workflows | 32 |

---

## Prerequisites

- **Python 3.12+** (3.11 compatible)
- **PostgreSQL 16+** (primary database)
- **Valkey/Redis 8+** (caching, event bus, sessions)
- **Docker 24+** & **Docker Compose v2**
- **Kubernetes 1.28+** (for K8s deployment)

---

## Configuration

### Environment Variables

Copy the production template and fill in required values:

```bash
cp backend/.env.production.template backend/.env
```

**Critical variables (REQUIRED):**

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET_KEY` | JWT signing key (min 48 chars) | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DB_PASSWORD` | PostgreSQL password | Strong random password |
| `DATABASE_URL` | Full database connection string | `postgresql+asyncpg://infinity:{password}@db:5432/infinity_os` |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `https://app.infinity-os.dev` |

**2060 Standard variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_RESIDENCY_DEFAULT` | `eu` | Default data residency zone |
| `CONSENT_REQUIRED` | `true` | Require consent for data processing |
| `AI_AUDIT_ENABLED` | `true` | Enable AI invocation audit trail |
| `ZERO_COST_MODE` | `true` | Enable zero-cost resource metering |
| `FUTURE_PROOF_LEVEL` | `2060` | Compliance standard level |

### Config Validation

The `config.py` module validates all configuration on startup. In production mode, it will:
- **ERROR** on missing JWT_SECRET_KEY
- **WARN** on localhost database URLs
- **WARN** on missing LLM API keys
- **WARN** on disabled rate limiting
- **WARN** on debug mode enabled

---

## Deployment Options

### Option 1: Docker Compose (Recommended for staging)

```bash
# Development
docker compose up -d

# Production profile
docker compose --profile production up -d

# With database migration
docker compose --profile production --profile migrate up -d
```

### Option 2: Kubernetes (Recommended for production)

```bash
# Create namespace
kubectl create namespace infinity

# Apply secrets (create from .env)
kubectl create secret generic infinity-os-secrets \
  --from-env-file=backend/.env \
  -n infinity

# Deploy
kubectl apply -f k8s/deployment.yaml

# Verify
kubectl get pods -n infinity
kubectl logs -f deployment/infinity-os-api -n infinity
```

### Option 3: Direct (Development only)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## Middleware Stack

Middleware executes in this order (outermost first):

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | **CORSMiddleware** | Cross-origin request handling |
| 2 | **StructuredLoggingMiddleware** | Per-request structured log entries |
| 3 | **RateLimitMiddleware** | Token bucket rate limiting per IP/path |
| 4 | **RequestSizeLimitMiddleware** | Reject oversized request bodies |
| 5 | **GracefulShutdownMiddleware** | Connection draining during shutdown |
| 6 | **Compliance2060Middleware** | Data residency, consent, AI audit |
| 7 | **CorrelationIDMiddleware** | Request/correlation ID propagation |
| 8 | **SecurityHeadersMiddleware** | OWASP security headers |

### Rate Limiting

| Path Prefix | Default Rate |
|-------------|-------------|
| `/api/v1/auth` | 20/minute |
| `/api/v1/ai` | 30/minute |
| `/api/v1/search`, `/api/v1/solarscene` | 60/minute |
| All other paths | 100/minute |

---

## 2060 Compliance

### Five Pillars

1. **Data Residency & Sovereignty** — All requests tagged with residency zone via `X-Data-Residency` header
2. **Consent & Transparency** — Data processing endpoints require `X-Consent-Token` header
3. **AI Auditability** — AI endpoints receive `X-AI-Invocation-ID` for full audit trail
4. **Zero-Cost Infrastructure** — Resource metering tracks compute, AI, and data requests
5. **Future-Proof Architecture** — Modular, microservice-ready, event-driven

### Response Headers

Every API response includes:

| Header | Description |
|--------|-------------|
| `X-Data-Residency` | Active data residency zone |
| `X-2060-Compliant` | Always `true` |
| `X-Consent-Status` | `provided`, `missing`, or `not_required` |
| `X-AI-Invocation-ID` | UUID for AI endpoint calls |
| `X-AI-Auditable` | `true` for AI endpoints |
| `X-Request-ID` | Unique request identifier |
| `X-Correlation-ID` | Correlation ID for distributed tracing |
| `X-Response-Time` | Request duration |
| `X-RateLimit-Remaining` | Remaining rate limit tokens |

### Event Bridge

The Event Bridge (`event_bridge.py`) connects routers to the Kernel Event Bus:

```python
from event_bridge import emit_event, EventCategory

await emit_event(
    EventCategory.DATA,
    "hive.dataset.created",
    {"id": dataset_id, "name": name},
    source="hive_router",
)
```

Categories are automatically routed to the correct lane:

| Category | Lane | Priority |
|----------|------|----------|
| AI | Lane 1 (AI/Nexus) | Normal |
| USER | Lane 2 (User/Infinity) | Normal |
| DATA | Lane 3 (Data/Hive) | Normal |
| GOVERNANCE | Cross-Lane | High |
| SECURITY | Cross-Lane | Critical |

---

## Health & Monitoring

### Endpoints

| Endpoint | Purpose | Auth Required |
|----------|---------|---------------|
| `GET /health` | Deep health check (DB, event bus, 2060) | No |
| `GET /ready` | Kubernetes readiness probe | No |
| `GET /metrics` | Prometheus-compatible metrics | No |
| `GET /api/v1/system/info` | Ecosystem information | No |
| `GET /` | Service root with links | No |

### Health Check Response

```json
{
  "status": "healthy",
  "version": "3.0.0",
  "environment": "production",
  "checks": {
    "database": "connected",
    "event_bus": "running",
    "2060_standard": {
      "level": "2060",
      "data_residency": "eu",
      "consent_required": true,
      "ai_audit": true,
      "zero_cost": true
    },
    "shutdown": {
      "draining": false,
      "active_requests": 0
    }
  }
}
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 15

readinessProbe:
  httpGet:
    path: /ready
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 5
```

---

## Security Hardening

### Headers (OWASP)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'self'`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### Authentication

- JWT HS512 with JTI for revocation
- 18 system roles across 7 levels (0-6)
- Hybrid RBAC + ABAC permission evaluation
- API key authentication (SHA-512)
- Brute force protection
- Token revocation support

### Docker Security

- Multi-stage build (minimal attack surface)
- Non-root user (`infinity:infinity`)
- Tini init system for signal handling
- Restrictive file permissions (550/770)
- No dev tools in production image

---

## Scaling & Performance

### Horizontal Scaling

The HPA (Horizontal Pod Autoscaler) scales based on:
- CPU utilization > 70% → scale up
- Memory utilization > 80% → scale up
- Min replicas: 3, Max replicas: 12

### Connection Pooling

- PostgreSQL: 20 connections per worker, pre-ping enabled
- Pool recycle: 3600 seconds

### Graceful Shutdown

1. Kubernetes sends SIGTERM
2. Readiness probe returns 503 (no new traffic)
3. Active connections drain (30s timeout)
4. Event bus stops
5. Database connections close
6. Process exits

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `JWT_SECRET_KEY not set` | Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `Database connection refused` | Check `DATABASE_URL` and PostgreSQL status |
| `Rate limit exceeded (429)` | Check `RATE_LIMIT_DEFAULT` setting |
| `Request body too large (413)` | Increase `MAX_REQUEST_SIZE_MB` |
| `Service unavailable (503)` | Check `/ready` endpoint, may be shutting down |

### Logs

```bash
# Docker
docker compose logs -f api

# Kubernetes
kubectl logs -f deployment/infinity-os-api -n infinity

# Structured log format
# {"event": "http_request", "method": "GET", "path": "/health", "status": 200, "duration_ms": 1.23}
```

### Production Readiness Checklist

- [ ] JWT_SECRET_KEY set (48+ chars)
- [ ] DATABASE_URL points to production DB
- [ ] CORS_ORIGINS set to production domains only
- [ ] RATE_LIMIT_ENABLED=true
- [ ] DEBUG=false
- [ ] LOG_LEVEL=WARNING
- [ ] ENVIRONMENT=production
- [ ] At least one LLM API key configured
- [ ] OpenTelemetry endpoint configured
- [ ] SSL/TLS termination configured
- [ ] Database backups configured
- [ ] Monitoring alerts configured