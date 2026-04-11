# tests/test_accessibility.py — Accessibility takeover mode tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


# ── Safety Info & Overview ───────────────────────────────────

@pytest.mark.asyncio
async def test_safety_info(client: AsyncClient, test_user):
    """Get safety information about takeover mode"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/accessibility/takeover/safety-info", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "allowed_actions" in data
    assert "blocked_actions" in data
    assert "safety_features" in data


@pytest.mark.asyncio
async def test_accessibility_overview(client: AsyncClient, test_user):
    """Get accessibility overview"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/accessibility/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


# ── Takeover Request Flow ────────────────────────────────────

@pytest.mark.asyncio
async def test_request_takeover(client: AsyncClient, test_user):
    """Request a takeover session"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/accessibility/takeover/request",
        headers=headers,
        json={
            "reason": "User needs help navigating settings",
            "task_description": "Navigate to accessibility settings and enable voice control",
            "allowed_actions": ["navigation", "settings_adjust"],
            "duration_seconds": 60,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "session_id" in data or "id" in data
    assert data.get("status") in ("pending_consent", "awaiting_consent", None) or "consent" in str(data).lower()


@pytest.mark.asyncio
async def test_consent_flow(client: AsyncClient, test_user):
    """Full consent flow: request → consent"""
    headers = get_auth_headers(test_user)
    # Request
    req_resp = await client.post(
        "/api/v1/accessibility/takeover/request",
        headers=headers,
        json={
            "reason": "Help with form filling",
            "task_description": "Fill out the registration form with provided data",
            "allowed_actions": ["form_fill", "navigation"],
            "duration_seconds": 120,
        },
    )
    assert req_resp.status_code == 201
    session_id = req_resp.json().get("session_id") or req_resp.json().get("id")

    # Give consent
    consent_resp = await client.post(
        "/api/v1/accessibility/takeover/consent",
        headers=headers,
        json={
            "session_id": session_id,
            "consent_given": True,
            "biometric_verified": False,
            "pin_verified": True,
        },
    )
    assert consent_resp.status_code == 200
    data = consent_resp.json()
    assert data.get("status") in ("active", "consented", None) or "active" in str(data).lower()


@pytest.mark.asyncio
async def test_consent_denied(client: AsyncClient, test_user):
    """Denying consent should not activate the session"""
    headers = get_auth_headers(test_user)
    req_resp = await client.post(
        "/api/v1/accessibility/takeover/request",
        headers=headers,
        json={
            "reason": "Testing consent denial",
            "task_description": "This should be denied by the user",
            "allowed_actions": ["navigation"],
            "duration_seconds": 30,
        },
    )
    assert req_resp.status_code == 201
    session_id = req_resp.json().get("session_id") or req_resp.json().get("id")

    consent_resp = await client.post(
        "/api/v1/accessibility/takeover/consent",
        headers=headers,
        json={
            "session_id": session_id,
            "consent_given": False,
        },
    )
    assert consent_resp.status_code == 200
    data = consent_resp.json()
    assert data.get("status") in ("denied", "cancelled", "rejected", None) or "denied" in str(data).lower() or "cancel" in str(data).lower()


# ── Emergency Stop ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_emergency_stop(client: AsyncClient, test_user):
    """Emergency stop should terminate an active session"""
    headers = get_auth_headers(test_user)
    # Create and consent
    req_resp = await client.post(
        "/api/v1/accessibility/takeover/request",
        headers=headers,
        json={
            "reason": "Emergency stop test",
            "task_description": "Testing emergency stop functionality",
            "allowed_actions": ["navigation"],
            "duration_seconds": 60,
        },
    )
    session_id = req_resp.json().get("session_id") or req_resp.json().get("id")

    await client.post(
        "/api/v1/accessibility/takeover/consent",
        headers=headers,
        json={"session_id": session_id, "consent_given": True, "pin_verified": True},
    )

    # Emergency stop
    stop_resp = await client.post(
        f"/api/v1/accessibility/takeover/{session_id}/stop",
        headers=headers,
    )
    assert stop_resp.status_code == 200
    data = stop_resp.json()
    assert data.get("status") in ("stopped", "terminated", "emergency_stopped", None) or "stop" in str(data).lower()


# ── Session Retrieval ────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_takeover_session(client: AsyncClient, test_user):
    """Get a specific takeover session"""
    headers = get_auth_headers(test_user)
    req_resp = await client.post(
        "/api/v1/accessibility/takeover/request",
        headers=headers,
        json={
            "reason": "Session retrieval test",
            "task_description": "Testing session retrieval",
            "allowed_actions": ["read_aloud"],
            "duration_seconds": 30,
        },
    )
    session_id = req_resp.json().get("session_id") or req_resp.json().get("id")

    resp = await client.get(f"/api/v1/accessibility/takeover/{session_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("session_id") == session_id or data.get("id") == session_id


@pytest.mark.asyncio
async def test_get_session_not_found(client: AsyncClient, test_user):
    """Non-existent session returns 404"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/accessibility/takeover/nonexistent-id", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_active_sessions(client: AsyncClient, test_user):
    """List active takeover sessions"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/accessibility/takeover/sessions/active", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list) or "sessions" in data


# ── Accessibility Profile ────────────────────────────────────

@pytest.mark.asyncio
async def test_set_accessibility_profile(client: AsyncClient, test_user):
    """Set accessibility profile"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/accessibility/profile",
        headers=headers,
        json={
            "screen_reader": True,
            "voice_control": True,
            "high_contrast": True,
            "magnification": 2.0,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("screen_reader") is True or "profile" in data


@pytest.mark.asyncio
async def test_get_accessibility_profile(client: AsyncClient, test_user):
    """Get accessibility profile"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/accessibility/profile", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)