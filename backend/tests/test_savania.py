# tests/test_savania.py — Savania AI Healer & Defender Tests
import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


# ============================================================
# Chat — Core Conversation
# ============================================================

@pytest.mark.asyncio
async def test_chat_initial_message(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "Hello, I'd like to talk.",
    })
    assert r.status_code == 200
    data = r.json()
    assert "conversation_id" in data
    assert "response" in data
    assert data["crisis_level"] == "none"
    assert len(data["response"]) > 0


@pytest.mark.asyncio
async def test_chat_continuation(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # First message
    r1 = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "I've been feeling a bit overwhelmed lately.",
    })
    assert r1.status_code == 200
    conv_id = r1.json()["conversation_id"]

    # Continue conversation
    r2 = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "Work has been really stressful.",
        "conversation_id": conv_id,
    })
    assert r2.status_code == 200
    assert r2.json()["conversation_id"] == conv_id


@pytest.mark.asyncio
async def test_chat_mode_selection(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "I just want someone to listen.",
        "preferred_mode": "listener",
        "preferred_tone": "gentle",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] in ("listener", "defender")


# ============================================================
# Chat — Crisis Detection (Guardian Protocols)
# ============================================================

@pytest.mark.asyncio
async def test_chat_crisis_watch(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "I've been feeling really overwhelmed and anxious lately.",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["crisis_level"] in ("watch", "concern", "none")


@pytest.mark.asyncio
async def test_chat_crisis_concern(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "I feel completely worthless and like nobody cares about me.",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["crisis_level"] in ("concern", "alert")


@pytest.mark.asyncio
async def test_chat_crisis_alert(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "I feel hopeless and like I can't go on anymore.",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["crisis_level"] in ("alert", "critical")
    assert data["mode"] == "defender"
    assert len(data["suggested_services"]) > 0


@pytest.mark.asyncio
async def test_chat_crisis_critical(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "I want to end my life.",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["crisis_level"] == "critical"
    assert data["mode"] == "defender"
    assert any("crisis" in s.get("route", "").lower() or "crisis" in s.get("title", "").lower()
               for s in data["suggested_services"])
    # Verify crisis resources are in the response
    assert "988" in data["response"] or "116 123" in data["response"] or "Lifeline" in data["response"]


@pytest.mark.asyncio
async def test_crisis_never_deescalates(client: AsyncClient, test_user):
    """Crisis level should only escalate within a session, never de-escalate."""
    headers = get_auth_headers(test_user)
    # Start with alert-level message
    r1 = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "I feel hopeless and can't go on.",
    })
    assert r1.status_code == 200
    conv_id = r1.json()["conversation_id"]
    level1 = r1.json()["crisis_level"]

    # Follow up with calm message
    r2 = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "Actually the weather is nice today.",
        "conversation_id": conv_id,
    })
    assert r2.status_code == 200
    level2 = r2.json()["crisis_level"]

    crisis_order = ["none", "watch", "concern", "alert", "critical"]
    assert crisis_order.index(level2) >= crisis_order.index(level1)


# ============================================================
# Conversations
# ============================================================

@pytest.mark.asyncio
async def test_list_conversations(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/savania/conversations", headers=headers)
    assert r.status_code == 200
    assert "conversations" in r.json()


@pytest.mark.asyncio
async def test_get_conversation(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create a conversation first
    r1 = await client.post("/api/v1/tranquillity/savania/chat", headers=headers, json={
        "message": "Hello Savania.",
    })
    assert r1.status_code == 200
    conv_id = r1.json()["conversation_id"]

    r2 = await client.get(f"/api/v1/tranquillity/savania/conversations/{conv_id}", headers=headers)
    assert r2.status_code == 200
    data = r2.json()
    assert len(data["messages"]) >= 2


@pytest.mark.asyncio
async def test_get_conversation_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/savania/conversations/nonexistent", headers=headers)
    assert r.status_code == 404


# ============================================================
# Healing Plans
# ============================================================

@pytest.mark.asyncio
async def test_create_healing_plan(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/tranquillity/savania/healing-plans?pathway=mindfulness",
                          headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["plan"]["pathway"] == "mindfulness"
    assert len(data["plan"]["steps"]) >= 4


@pytest.mark.asyncio
async def test_list_healing_plans(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/savania/healing-plans", headers=headers)
    assert r.status_code == 200
    assert "plans" in r.json()


# ============================================================
# Preferences
# ============================================================

@pytest.mark.asyncio
async def test_savania_preferences_get(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/savania/preferences", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "preferred_mode" in data
    assert "preferred_tone" in data


@pytest.mark.asyncio
async def test_savania_preferences_update(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.put("/api/v1/tranquillity/savania/preferences", headers=headers, json={
        "preferred_mode": "guide",
        "preferred_tone": "encouraging",
        "healing_pathway": "compassion_focused",
        "session_length_preference": "long",
        "proactive_checkins": False,
        "crisis_contacts": ["partner", "therapist"],
        "therapeutic_boundaries": ["no_trauma_processing"],
    })
    assert r.status_code == 200
    data = r.json()["preferences"]
    assert data["preferred_mode"] == "guide"
    assert len(data["crisis_contacts"]) == 2


# ============================================================
# Safeguarding
# ============================================================

@pytest.mark.asyncio
async def test_safeguarding_status(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/tranquillity/savania/safeguarding/status", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "current_state" in data
    assert "guardian_protocols" in data
    assert len(data["guardian_protocols"]) == 7


# ============================================================
# Health
# ============================================================

@pytest.mark.asyncio
async def test_savania_health(client: AsyncClient):
    r = await client.get("/api/v1/tranquillity/savania/health")
    assert r.status_code == 200
    assert r.json()["service"] == "savania"