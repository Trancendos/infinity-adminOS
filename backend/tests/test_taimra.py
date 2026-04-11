# tests/test_taimra.py — tAimra Digital Twin Tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


# ============================================================
# Digital Twin Core
# ============================================================

@pytest.mark.asyncio
async def test_get_digital_twin(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/taimra/twin", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "dimensions" in data
    assert "overall_wellbeing" in data
    assert "risk_level" in data
    assert len(data["dimensions"]) == 7


@pytest.mark.asyncio
async def test_get_dimension(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/taimra/twin/dimension/emotional", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "dimension" in data
    assert data["dimension"]["dimension"] == "emotional"


@pytest.mark.asyncio
async def test_get_dimension_invalid(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/taimra/twin/dimension/nonexistent", headers=headers)
    assert r.status_code == 422


# ============================================================
# Biomarker Tracking
# ============================================================

@pytest.mark.asyncio
async def test_submit_biomarkers(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/taimra/biomarkers", headers=headers, json={
        "readings": [
            {"biomarker": "mood_score", "value": 7.0, "unit": "score", "source": "self_report"},
            {"biomarker": "sleep_quality", "value": 6.5, "unit": "score", "source": "self_report"},
            {"biomarker": "anxiety_level", "value": 3.0, "unit": "score", "source": "self_report"},
            {"biomarker": "energy_level", "value": 6.0, "unit": "score", "source": "self_report"},
        ],
    })
    assert r.status_code == 200
    data = r.json()
    assert data["accepted"] == 4
    assert data["twin_updated"] is True
    assert "risk_level" in data


@pytest.mark.asyncio
async def test_get_biomarker_history(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Submit first
    await client.post("/api/v1/tranquillity/taimra/biomarkers", headers=headers, json={
        "readings": [{"biomarker": "mood_score", "value": 8.0}],
    })
    r = await client.get("/api/v1/tranquillity/taimra/biomarkers", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


@pytest.mark.asyncio
async def test_get_biomarker_history_filtered(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/tranquillity/taimra/biomarkers", headers=headers, json={
        "readings": [{"biomarker": "mood_score", "value": 7.0}],
    })
    r = await client.get("/api/v1/tranquillity/taimra/biomarkers?biomarker=mood_score", headers=headers)
    assert r.status_code == 200
    for reading in r.json()["readings"]:
        assert reading["biomarker"] == "mood_score"


@pytest.mark.asyncio
async def test_biomarker_timeseries(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    await client.post("/api/v1/tranquillity/taimra/biomarkers", headers=headers, json={
        "readings": [{"biomarker": "mood_score", "value": 6.0}],
    })
    r = await client.get("/api/v1/tranquillity/taimra/biomarkers/timeseries/mood_score", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["biomarker"] == "mood_score"
    assert "points" in data
    assert "statistics" in data


# ============================================================
# Interventions
# ============================================================

@pytest.mark.asyncio
async def test_get_interventions(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/taimra/interventions", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "interventions" in data
    assert "risk_level" in data


@pytest.mark.asyncio
async def test_complete_intervention(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/tranquillity/taimra/interventions/test-intervention-id/complete?effectiveness=4",
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["record"]["effectiveness"] == 4


# ============================================================
# Predictive Insights
# ============================================================

@pytest.mark.asyncio
async def test_get_predictions(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/taimra/predictions", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "predictions" in data
    assert "twin_state" in data


# ============================================================
# Preferences
# ============================================================

@pytest.mark.asyncio
async def test_twin_preferences_get(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/taimra/preferences", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "data_sources_enabled" in data


@pytest.mark.asyncio
async def test_twin_preferences_update(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.put("/api/v1/tranquillity/taimra/preferences", headers=headers, json={
        "data_sources_enabled": ["self_report", "wearable", "app_usage"],
        "alert_threshold": "elevated",
        "share_with_clinician": True,
        "predictive_insights_enabled": True,
        "biomarker_reminders": True,
        "reminder_frequency_hours": 12,
    })
    assert r.status_code == 200
    assert r.json()["preferences"]["share_with_clinician"] is True


# ============================================================
# Health
# ============================================================

@pytest.mark.asyncio
async def test_taimra_health(client: AsyncClient):
    r = await client.get("/api/v1/tranquillity/taimra/health")
    assert r.status_code == 200
    assert r.json()["service"] == "taimra"