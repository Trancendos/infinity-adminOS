# tests/test_resonate.py — Resonate Sound Healing Tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


# ============================================================
# Soundscape Library
# ============================================================

@pytest.mark.asyncio
async def test_list_soundscapes(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/soundscapes", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0


@pytest.mark.asyncio
async def test_list_soundscapes_filter_type(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/soundscapes?soundscape_type=binaural", headers=headers)
    assert r.status_code == 200
    data = r.json()
    for ss in data["soundscapes"]:
        assert ss.get("soundscape_type") == "binaural"


@pytest.mark.asyncio
async def test_list_soundscapes_filter_goal(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/soundscapes?goal=sleep_induction", headers=headers)
    assert r.status_code == 200
    assert r.json()["adaptive"] is True


@pytest.mark.asyncio
async def test_get_soundscape(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/soundscapes/ss-rain-forest", headers=headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Rainforest Canopy"


@pytest.mark.asyncio
async def test_get_soundscape_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/soundscapes/nonexistent", headers=headers)
    assert r.status_code == 404


# ============================================================
# Sound Sessions
# ============================================================

@pytest.mark.asyncio
async def test_sound_session_lifecycle(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Start session
    r = await client.post("/api/v1/tranquillity/resonate/sessions/start", headers=headers, json={
        "soundscape_id": "ss-binaural-theta", "mood_before": 5,
    })
    assert r.status_code == 200
    session_id = r.json()["session"]["id"]

    # End session
    r = await client.post(
        f"/api/v1/tranquillity/resonate/sessions/{session_id}/end",
        headers=headers, json={
            "mood_after": 8, "effectiveness_rating": 4, "notes": "Very calming",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["mood_delta"] == 3


@pytest.mark.asyncio
async def test_start_session_invalid_soundscape(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/resonate/sessions/start", headers=headers, json={
        "soundscape_id": "nonexistent",
    })
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_sound_sessions(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/sessions", headers=headers)
    assert r.status_code == 200
    assert "sessions" in r.json()


# ============================================================
# Frequency Prescriptions
# ============================================================

@pytest.mark.asyncio
async def test_get_frequency_prescription(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/prescriptions?goal=stress_relief", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "prescription" in data
    assert data["prescription"]["therapeutic_goal"] == "stress_relief"


@pytest.mark.asyncio
async def test_prescription_history(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/prescriptions/history", headers=headers)
    assert r.status_code == 200
    assert "prescriptions" in r.json()


# ============================================================
# Custom Mixer
# ============================================================

@pytest.mark.asyncio
async def test_create_custom_mix(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/resonate/mixer", headers=headers, json={
        "name": "My Calm Mix",
        "layers": [
            {"sound_type": "nature", "volume": 0.6, "label": "Rain"},
            {"sound_type": "pink_noise", "volume": 0.3, "label": "Pink Noise"},
        ],
        "duration_minutes": 30,
        "therapeutic_goal": "sleep_induction",
    })
    assert r.status_code == 200
    assert r.json()["mix"]["name"] == "My Calm Mix"


@pytest.mark.asyncio
async def test_list_custom_mixes(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/mixer", headers=headers)
    assert r.status_code == 200
    assert "mixes" in r.json()


# ============================================================
# Sonic Profile
# ============================================================

@pytest.mark.asyncio
async def test_sonic_profile(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/profile", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_listening_minutes" in data


@pytest.mark.asyncio
async def test_update_hearing_sensitivities(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.put("/api/v1/tranquillity/resonate/profile/sensitivities",
                         headers=headers, json=["high_frequency", "sudden_loud"])
    assert r.status_code == 200
    assert len(r.json()["sensitivities"]) == 2


# ============================================================
# Brainwave Guide
# ============================================================

@pytest.mark.asyncio
async def test_brainwave_guide(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/resonate/brainwaves", headers=headers)
    assert r.status_code == 200
    states = r.json()["brainwave_states"]
    assert len(states) == 5
    assert states[0]["state"] == "delta"


# ============================================================
# Health
# ============================================================

@pytest.mark.asyncio
async def test_resonate_health(client: AsyncClient):
    r = await client.get("/api/v1/tranquillity/resonate/health")
    assert r.status_code == 200
    assert r.json()["service"] == "resonate"