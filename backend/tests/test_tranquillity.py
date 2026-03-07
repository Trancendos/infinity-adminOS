# tests/test_tranquillity.py — Tranquillity Realm Gateway Tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


@pytest.mark.asyncio
async def test_realm_status(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/status", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert "services" in data
    assert data["realm"] == "tranquillity"


@pytest.mark.asyncio
async def test_list_services(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/services", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "services" in data
    assert len(data["services"]) >= 5


@pytest.mark.asyncio
async def test_wellbeing_snapshot(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/wellbeing/snapshot", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "domains" in data


@pytest.mark.asyncio
async def test_wellbeing_checkin(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Checkin uses query params, not JSON body
    r = await client.post(
        "/api/v1/tranquillity/wellbeing/checkin"
        "?overall_score=65&cognitive=70&emotional=60&physical=50&social=65&spiritual=75",
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "checkin_id" in data
    assert "recovery_stage" in data


@pytest.mark.asyncio
async def test_recommendations(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/recommendations", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "recommendations" in data


@pytest.mark.asyncio
async def test_preferences_get_put(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/preferences", headers=headers)
    assert r.status_code == 200

    r = await client.put("/api/v1/tranquillity/preferences", headers=headers, json={
        "preferred_services": ["i_mind", "resonate"],
        "notification_level": "gentle",
        "data_sharing_consent": True,
    })
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_recovery_journey(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/journey", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "current_stage" in data
    assert "milestones" in data


@pytest.mark.asyncio
async def test_realm_health(client: AsyncClient):
    r = await client.get("/api/v1/tranquillity/health")
    assert r.status_code == 200
    data = r.json()
    assert data["realm"] == "tranquillity"
    assert "status" in data
    assert "services_healthy" in data