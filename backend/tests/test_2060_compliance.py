# tests/test_2060_compliance.py — 2060 Standard Compliance Tests
# ═══════════════════════════════════════════════════════════════
# Tests for 2060 compliance middleware, event bridge,
# data residency, consent verification, and AI audit trail.
# ═══════════════════════════════════════════════════════════════

import pytest
import pytest_asyncio
from httpx import AsyncClient

from tests.conftest import get_auth_headers


# ── Data Residency ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_default_data_residency_eu(client: AsyncClient, test_user):
    """Default data residency should be EU per 2060 standard."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.headers.get("X-Data-Residency") == "eu"


@pytest.mark.asyncio
async def test_custom_data_residency_uk(client: AsyncClient, test_user):
    """Client can request UK data residency."""
    headers = {**get_auth_headers(test_user), "X-Data-Residency": "uk"}
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.headers.get("X-Data-Residency") == "uk"


@pytest.mark.asyncio
async def test_custom_data_residency_apac(client: AsyncClient, test_user):
    """Client can request APAC data residency."""
    headers = {**get_auth_headers(test_user), "X-Data-Residency": "apac"}
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.headers.get("X-Data-Residency") == "apac"


@pytest.mark.asyncio
async def test_invalid_residency_falls_back_to_default(client: AsyncClient, test_user):
    """Invalid residency zone should fall back to default (eu)."""
    headers = {**get_auth_headers(test_user), "X-Data-Residency": "mars"}
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.headers.get("X-Data-Residency") == "eu"


# ── 2060 Compliance Header ───────────────────────────────────

@pytest.mark.asyncio
async def test_2060_compliant_header_present(client: AsyncClient, test_user):
    """All API responses should include X-2060-Compliant header."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.headers.get("X-2060-Compliant") == "true"


# ── Consent Verification ────────────────────────────────────

@pytest.mark.asyncio
async def test_consent_status_not_required_for_get(client: AsyncClient, test_user):
    """GET requests should not require consent."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.headers.get("X-Consent-Status") in ("not_required", "missing")


# ── AI Audit Trail ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_ai_endpoint_gets_invocation_id(client: AsyncClient, test_user):
    """AI-related endpoints should receive an invocation ID."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/ai/models", headers=headers)
    # AI endpoints should have audit headers
    if resp.status_code == 200:
        assert resp.headers.get("X-AI-Auditable") == "true"
        assert resp.headers.get("X-AI-Invocation-ID") is not None
        assert len(resp.headers.get("X-AI-Invocation-ID", "")) > 0


@pytest.mark.asyncio
async def test_non_ai_endpoint_no_invocation_id(client: AsyncClient, test_user):
    """Non-AI endpoints should not have AI audit headers."""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.headers.get("X-AI-Auditable") is None


# ── Event Bridge ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_event_bridge_emit():
    """Event bridge should emit events without error."""
    from event_bridge import emit_event, EventCategory
    event_id = await emit_event(
        EventCategory.SYSTEM,
        "test.event.created",
        {"test": True},
        source="test_suite",
    )
    assert event_id is not None
    assert len(event_id) > 0


@pytest.mark.asyncio
async def test_event_bridge_history():
    """Event bridge should maintain event history."""
    from event_bridge import emit_event, get_event_history, EventCategory
    await emit_event(EventCategory.DATA, "test.data.created", {"key": "value"})
    history = get_event_history(limit=10)
    assert len(history) > 0
    latest = history[-1]
    assert latest["topic"] == "test.data.created"
    assert latest["category"] == "data"


@pytest.mark.asyncio
async def test_event_bridge_stats():
    """Event bridge should provide statistics."""
    from event_bridge import emit_event, get_event_stats, EventCategory
    await emit_event(EventCategory.SECURITY, "test.security.alert", {"level": "high"})
    stats = get_event_stats()
    assert stats["total_events"] > 0
    assert "by_category" in stats
    assert "by_lane" in stats


@pytest.mark.asyncio
async def test_event_bridge_category_routing():
    """Events should be routed to correct lanes based on category."""
    from event_bridge import emit_event, get_event_history, EventCategory

    await emit_event(EventCategory.AI, "test.ai.inference", {"model": "test"})
    await emit_event(EventCategory.GOVERNANCE, "test.governance.audit", {"action": "review"})

    history = get_event_history(limit=50)
    ai_events = [e for e in history if e.get("category") == "ai"]
    gov_events = [e for e in history if e.get("category") == "governance"]

    if ai_events:
        assert ai_events[-1]["lane"] == "lane1_ai"
    if gov_events:
        assert gov_events[-1]["lane"] == "cross_lane"


# ── Standard 2060 Module ────────────────────────────────────

def test_standard_2060_data_residency_enum():
    """DataResidency enum should have all required zones."""
    from standard_2060 import DataResidency
    assert DataResidency.EU == "eu"
    assert DataResidency.UK == "uk"
    assert DataResidency.US_EAST == "us-east"
    assert DataResidency.APAC == "apac"
    assert DataResidency.GLOBAL == "global"


def test_standard_2060_consent_types():
    """ConsentType2060 should cover all required consent categories."""
    from standard_2060 import ConsentType2060
    assert ConsentType2060.PROCESSING == "processing"
    assert ConsentType2060.ANALYTICS == "analytics"
    assert ConsentType2060.TRAINING == "training"
    assert ConsentType2060.THIRD_PARTY == "third_party"
    assert ConsentType2060.EXPORT == "export"
    assert ConsentType2060.PROFILING == "profiling"


def test_standard_2060_invocation_risk():
    """InvocationRisk should have all risk levels."""
    from standard_2060 import InvocationRisk
    assert InvocationRisk.LOW == "low"
    assert InvocationRisk.MEDIUM == "medium"
    assert InvocationRisk.HIGH == "high"
    assert InvocationRisk.CRITICAL == "critical"


def test_standard_2060_data_lineage():
    """DataLineageEntry should be constructable."""
    from standard_2060 import DataLineageEntry
    entry = DataLineageEntry(
        timestamp="2026-03-07T12:00:00Z",
        source_type="user-upload",
        identifier="s3://bucket/file.csv",
        license="proprietary",
        generated_by_ai=False,
        human_reviewed=True,
    )
    assert entry.source_type == "user-upload"
    assert entry.human_reviewed is True


# ── Config 2060 Settings ────────────────────────────────────

def test_config_2060_defaults():
    """Config should have 2060-compliant defaults."""
    from config import get_config, reset_config
    reset_config()
    config = get_config()
    assert config.future_proof_level == "2060"
    assert config.data_residency_default == "eu"
    assert config.consent_required is True
    assert config.ai_audit_enabled is True
    assert config.zero_cost_mode is True