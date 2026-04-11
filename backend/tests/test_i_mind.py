# tests/test_i_mind.py — i-Mind Cognitive Wellness Tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


# ============================================================
# Exercise Library
# ============================================================

@pytest.mark.asyncio
async def test_list_exercises(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/i-mind/exercises", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "exercises" in data
    assert data["total"] > 0
    assert data["adaptive"] is True


@pytest.mark.asyncio
async def test_list_exercises_filter_category(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/i-mind/exercises?category=breathing", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert all(e.get("category") == "breathing" for e in data["exercises"])


@pytest.mark.asyncio
async def test_get_exercise(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/i-mind/exercises/ex-breath-box", headers=headers)
    assert r.status_code == 200
    assert r.json()["title"] == "Box Breathing"


@pytest.mark.asyncio
async def test_get_exercise_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/i-mind/exercises/nonexistent", headers=headers)
    assert r.status_code == 404


# ============================================================
# Sessions
# ============================================================

@pytest.mark.asyncio
async def test_session_lifecycle(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Start session
    r = await client.post("/api/v1/tranquillity/i-mind/sessions/start", headers=headers, json={
        "exercise_id": "ex-breath-box", "mood_before": 4,
    })
    assert r.status_code == 200
    session_id = r.json()["session"]["id"]

    # Complete session
    r = await client.post(
        f"/api/v1/tranquillity/i-mind/sessions/{session_id}/complete",
        headers=headers, json={"mood_after": 7, "notes": "Felt calmer"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["mood_delta"] == 3
    assert "streak" in data


@pytest.mark.asyncio
async def test_start_session_invalid_exercise(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/i-mind/sessions/start", headers=headers, json={
        "exercise_id": "nonexistent",
    })
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_sessions(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/i-mind/sessions", headers=headers)
    assert r.status_code == 200
    assert "sessions" in r.json()


# ============================================================
# Cognitive Profile & Assessment
# ============================================================

@pytest.mark.asyncio
async def test_cognitive_profile(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/i-mind/profile", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "metrics" in data
    assert "recommended_categories" in data


@pytest.mark.asyncio
async def test_submit_assessment(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/i-mind/assessment", headers=headers,
                          json={"attention_span": 7.0, "working_memory": 5.5, "emotional_regulation": 4.0})
    assert r.status_code == 200
    data = r.json()
    assert "result" in data
    assert "updated_profile" in data


# ============================================================
# Meditation
# ============================================================

@pytest.mark.asyncio
async def test_list_meditations(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/i-mind/meditations", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] > 0


@pytest.mark.asyncio
async def test_get_meditation(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/i-mind/meditations/med-breath-aware", headers=headers)
    assert r.status_code == 200
    assert "Breath Awareness" in r.json()["title"]


# ============================================================
# Journal
# ============================================================

@pytest.mark.asyncio
async def test_journal_create_and_list(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/i-mind/journal", headers=headers, json={
        "title": "Test Entry", "content": "Today I practiced breathing.",
        "mood_score": 7, "tags": ["breathing", "calm"],
    })
    assert r.status_code == 200
    assert r.json()["entry"]["title"] == "Test Entry"

    r = await client.get("/api/v1/tranquillity/i-mind/journal", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


# ============================================================
# Streak
# ============================================================

@pytest.mark.asyncio
async def test_streak(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/i-mind/streak", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "current_streak_days" in data


# ============================================================
# Health
# ============================================================

@pytest.mark.asyncio
async def test_imind_health(client: AsyncClient):
    r = await client.get("/api/v1/tranquillity/i-mind/health")
    assert r.status_code == 200
    assert r.json()["service"] == "i-mind"