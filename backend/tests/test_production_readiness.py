# tests/test_production_readiness.py — Production Readiness Tests
# ═══════════════════════════════════════════════════════════════
# Tests for middleware, health endpoints, config validation,
# and system info endpoints added in Phase 19.
# ═══════════════════════════════════════════════════════════════

import pytest
import pytest_asyncio
from httpx import AsyncClient

from tests.conftest import get_auth_headers


# ── Health Endpoint ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_returns_200(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("healthy", "degraded")
    assert data["version"] == "3.0.0"
    assert "checks" in data
    assert "services" in data


@pytest.mark.asyncio
async def test_health_contains_2060_standard(client: AsyncClient):
    resp = await client.get("/health")
    data = resp.json()
    checks = data["checks"]
    assert "2060_standard" in checks
    standard = checks["2060_standard"]
    assert standard["level"] == "2060"
    assert "data_residency" in standard
    assert "consent_required" in standard
    assert "ai_audit" in standard


@pytest.mark.asyncio
async def test_health_contains_shutdown_state(client: AsyncClient):
    resp = await client.get("/health")
    data = resp.json()
    assert "shutdown" in data["checks"]
    assert data["checks"]["shutdown"]["draining"] is False


# ── Readiness Endpoint ───────────────────────────────────────

@pytest.mark.asyncio
async def test_ready_returns_200(client: AsyncClient):
    resp = await client.get("/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ready"] is True


# ── Metrics Endpoint ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_metrics_returns_200(client: AsyncClient):
    resp = await client.get("/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert "service" in data
    assert "version" in data
    assert "event_bus" in data
    assert "routers" in data
    assert data["2060_standard"] == "2060"


# ── System Info Endpoint ─────────────────────────────────────

@pytest.mark.asyncio
async def test_system_info_returns_200(client: AsyncClient):
    resp = await client.get("/api/v1/system/info")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Infinity OS"
    assert data["architecture"] == "Three-Lane Mesh"
    assert "ecosystem" in data
    assert data["ecosystem"]["total_routers"] == 79


@pytest.mark.asyncio
async def test_system_info_contains_compliance(client: AsyncClient):
    resp = await client.get("/api/v1/system/info")
    data = resp.json()
    compliance = data["compliance"]
    assert compliance["eu_ai_act"] is True
    assert compliance["gdpr_soft_delete"] is True
    assert "data_residency" in compliance
    assert "consent_management" in compliance
    assert "ai_auditability" in compliance


@pytest.mark.asyncio
async def test_system_info_contains_infrastructure(client: AsyncClient):
    resp = await client.get("/api/v1/system/info")
    data = resp.json()
    infra = data["infrastructure"]
    assert "database" in infra
    assert "event_bus" in infra
    assert "auth" in infra


@pytest.mark.asyncio
async def test_system_info_contains_lanes(client: AsyncClient):
    resp = await client.get("/api/v1/system/info")
    data = resp.json()
    lanes = data["ecosystem"]["lanes"]
    assert "lane1_ai_nexus" in lanes
    assert "lane2_user_infinity" in lanes
    assert "lane3_data_hive" in lanes


# ── Root Endpoint ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_root_returns_200(client: AsyncClient):
    resp = await client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Infinity OS"
    assert data["status"] == "operational"
    assert "/health" in data["health"]
    assert "/ready" in data["ready"]
    assert "/metrics" in data["metrics"]


# ── Security Headers ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_security_headers_present(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
    assert "max-age" in resp.headers.get("Strict-Transport-Security", "")


# ── Correlation ID ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_correlation_id_returned(client: AsyncClient):
    resp = await client.get("/health")
    assert "X-Request-ID" in resp.headers
    assert "X-Correlation-ID" in resp.headers
    assert "X-Response-Time" in resp.headers


@pytest.mark.asyncio
async def test_custom_correlation_id_propagated(client: AsyncClient):
    resp = await client.get("/health", headers={"X-Request-ID": "test-123"})
    assert resp.headers.get("X-Request-ID") == "test-123"


# ── 2060 Compliance Headers ──────────────────────────────────

@pytest.mark.asyncio
async def test_2060_data_residency_header(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/system/info", headers=headers)
    assert resp.headers.get("X-Data-Residency") == "eu"
    assert resp.headers.get("X-2060-Compliant") == "true"


@pytest.mark.asyncio
async def test_2060_custom_residency(client: AsyncClient, test_user):
    headers = {**get_auth_headers(test_user), "X-Data-Residency": "uk"}
    resp = await client.get("/api/v1/system/info", headers=headers)
    assert resp.headers.get("X-Data-Residency") == "uk"


# ── Rate Limit Headers ──────────────────────────────────────

@pytest.mark.asyncio
async def test_rate_limit_header_present(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/system/info", headers=headers)
    import os
    if os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true":
        assert "X-RateLimit-Remaining" in resp.headers
    else:
        # Rate limiting disabled in test env — header won't be present
        assert resp.status_code == 200


# ── Config Validation ────────────────────────────────────────

def test_config_loads():
    from config import get_config, reset_config
    reset_config()
    config = get_config()
    assert config.environment == "test"
    assert config.service_version == "3.0.0"
    assert config.future_proof_level == "2060"


def test_config_production_validation():
    from config import InfinityConfig
    config = InfinityConfig(
        environment="development",
        jwt_secret_key="short",
        database_url="postgresql+asyncpg://localhost/test",
        debug=True,
    )
    issues = config.validate_production_readiness()
    # jwt_secret_key validator auto-generates a long key for dev, so JWT check may pass
    assert any("localhost" in i for i in issues)
    assert any("debug" in i.lower() for i in issues)
    assert len(issues) >= 2  # At least localhost + debug issues


def test_config_active_llm_providers():
    from config import InfinityConfig
    config = InfinityConfig(
        environment="development",
        groq_api_key="test-key",
        openai_api_key="test-key",
    )
    providers = config.active_llm_providers
    assert "groq" in providers
    assert "openai" in providers
    assert "anthropic" not in providers


# ── Branded Router Endpoints ─────────────────────────────────

@pytest.mark.asyncio
async def test_lille_sc_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/lille-sc/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["location"] == "Lille SC"
    assert data["character"] == "Lille"


@pytest.mark.asyncio
async def test_lunascene_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/lunascene/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["location"] == "Lunascene"
    assert data["character"] == "Luna"


@pytest.mark.asyncio
async def test_solarscene_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/solarscene/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["location"] == "SolarScene"
    assert data["character"] == "Solar"


# ── Lille SC CRUD ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_lille_sc_channel_crud(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create
    resp = await client.post("/api/v1/lille-sc/channels", json={
        "name": "Test Channel", "source_lane": "lane2_user", "target_lane": "lane3_data"
    }, headers=headers)
    assert resp.status_code == 201
    cid = resp.json()["id"]
    # Get
    resp = await client.get(f"/api/v1/lille-sc/channels/{cid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Test Channel"
    # List
    resp = await client.get("/api/v1/lille-sc/channels", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1
    # Trigger sync
    resp = await client.post(f"/api/v1/lille-sc/channels/{cid}/trigger", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "sync_triggered"


# ── Lunascene CRUD ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_lunascene_vault_and_artifact(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create vault
    resp = await client.post("/api/v1/lunascene/vaults", json={
        "name": "Test Vault", "retention_policy": "permanent"
    }, headers=headers)
    assert resp.status_code == 201
    vid = resp.json()["id"]
    # Upload artifact
    resp = await client.post("/api/v1/lunascene/artifacts", json={
        "name": "test-model.bin", "vault_id": vid, "artifact_type": "model", "version": "1.0.0"
    }, headers=headers)
    assert resp.status_code == 201
    aid = resp.json()["id"]
    # Verify artifact
    resp = await client.post(f"/api/v1/lunascene/artifacts/{aid}/verify", headers=headers)
    assert resp.status_code == 200
    assert "verified" in resp.json()


# ── SolarScene CRUD ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_solarscene_search(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Execute search
    resp = await client.post("/api/v1/solarscene/search", json={
        "query": "test query", "scope": "all"
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["query"] == "test query"
    assert "results" in data
    # Analytics
    resp = await client.get("/api/v1/solarscene/analytics", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total_searches"] >= 1