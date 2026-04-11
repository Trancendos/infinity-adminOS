# tests/test_turings_hub.py — Turing's Hub / Danny Turing — AI Character Registry & Generator
"""
Tests for the AI Character system:
  - Character CRUD (list, get, create, update, decommission)
  - Travel system (travel, recall, travel log)
  - Summon system (bots, agent, all, summon log)
  - Skill activation & evolution
  - Hub overview & locate
"""

import pytest
from httpx import AsyncClient
from tests.conftest import get_auth_headers


# ── Character Registry ───────────────────────────────────────

@pytest.mark.asyncio
async def test_list_characters(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 27


@pytest.mark.asyncio
async def test_list_characters_filter_core_stack(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters?group=Core Stack", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 4


@pytest.mark.asyncio
async def test_list_characters_filter_studio(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters?group=The Studio", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 7


@pytest.mark.asyncio
async def test_list_characters_filter_governance(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters?group=Governance", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 5


@pytest.mark.asyncio
async def test_list_characters_filter_wellbeing(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters?group=Wellbeing", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 4


@pytest.mark.asyncio
async def test_list_characters_filter_infrastructure(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters?group=Infrastructure", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 7


@pytest.mark.asyncio
async def test_list_characters_filter_production(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters?group=Production", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 4


@pytest.mark.asyncio
async def test_list_characters_filter_pillar_hqs(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters?group=Pillar HQs", headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 4


@pytest.mark.asyncio
async def test_get_character_cornelius(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters/cornelius-macintyre", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Cornelius MacIntyre"
    assert data["home_app"] == "luminous"
    assert data["group"] == "Pillar HQs"
    assert len(data["skills"]) == 3
    assert len(data["bots"]) == 2
    assert data["agent"] is not None
    assert data["agent"]["name"] == "Archon"


@pytest.mark.asyncio
async def test_get_character_danny_turing(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters/danny-turing", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Danny Turing"
    assert data["home_app"] == "turings-hub"
    assert data["group"] == "Governance"


@pytest.mark.asyncio
async def test_get_character_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_character(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "character_id": "test-ai-001",
        "name": "Test AI",
        "title": "Test Character",
        "personality": "Friendly and helpful",
        "home_app": "test-app",
        "group": "Test",
        "skills": [
            {"name": "testing", "category": "technical", "level": 50, "description": "Can test things"}
        ],
        "bots": [
            {"name": "TestBot1", "role": "scout", "abilities": ["scan"]},
            {"name": "TestBot2", "role": "analyst", "abilities": ["analyse"]},
        ],
        "agent": {"name": "TestAgent", "role": "executor", "specialisation": "testing", "autonomy_level": 0.5},
        "backstory": "Created for testing purposes.",
        "catchphrase": "Testing, testing, 1-2-3.",
    }
    r = await client.post("/api/v1/turings-hub/characters", json=payload, headers=headers)
    assert r.status_code == 201
    data = r.json()
    assert data["character_id"] == "test-ai-001"
    assert data["name"] == "Test AI"
    assert data["status"] == "active"
    assert data["current_location"] == "test-app"
    assert len(data["bots"]) == 2
    assert data["agent"]["name"] == "TestAgent"
    assert data["evolution_level"] == 1


@pytest.mark.asyncio
async def test_create_character_duplicate(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    payload = {
        "character_id": "cornelius-macintyre",
        "name": "Duplicate",
        "home_app": "test",
    }
    r = await client.post("/api/v1/turings-hub/characters", json=payload, headers=headers)
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_update_character(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # First create a character to update
    await client.post("/api/v1/turings-hub/characters", json={
        "character_id": "update-test-ai",
        "name": "Update Test",
        "home_app": "test",
    }, headers=headers)

    r = await client.patch(
        "/api/v1/turings-hub/characters/update-test-ai",
        json={"title": "Updated Title", "catchphrase": "Updated!"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "Updated Title"
    assert data["catchphrase"] == "Updated!"


@pytest.mark.asyncio
async def test_update_character_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.patch("/api/v1/turings-hub/characters/nonexistent", json={"title": "X"}, headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_decommission_character(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create a throwaway character
    await client.post("/api/v1/turings-hub/characters", json={
        "character_id": "decom-test",
        "name": "Decom Test",
        "home_app": "test",
    }, headers=headers)

    r = await client.delete("/api/v1/turings-hub/characters/decom-test", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "decommissioned"

    # Verify it's offline
    r2 = await client.get("/api/v1/turings-hub/characters/decom-test", headers=headers)
    assert r2.json()["status"] == "offline"


@pytest.mark.asyncio
async def test_decommission_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.delete("/api/v1/turings-hub/characters/nonexistent", headers=headers)
    assert r.status_code == 404


# ── Travel System ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_travel_to_new_location(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/turings-hub/characters/the-queen/travel",
        json={"destination_app": "the-nexus", "reason": "Consulting with Nexus AI"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "arrived"
    assert data["travel"]["origin"] == "the-hive"
    assert data["travel"]["destination"] == "the-nexus"
    assert data["character"]["current_location"] == "the-nexus"


@pytest.mark.asyncio
async def test_travel_same_location(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # The Queen is now at the-nexus from previous test
    r = await client.post(
        "/api/v1/turings-hub/characters/the-queen/travel",
        json={"destination_app": "the-nexus"},
        headers=headers,
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_travel_offline_character(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create and decommission a character
    await client.post("/api/v1/turings-hub/characters", json={
        "character_id": "travel-offline-test",
        "name": "Offline Travel Test",
        "home_app": "test",
    }, headers=headers)
    await client.delete("/api/v1/turings-hub/characters/travel-offline-test", headers=headers)

    r = await client.post(
        "/api/v1/turings-hub/characters/travel-offline-test/travel",
        json={"destination_app": "somewhere"},
        headers=headers,
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_travel_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/turings-hub/characters/nonexistent/travel",
        json={"destination_app": "somewhere"},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_travel_log(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters/the-queen/travel-log", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    assert data["items"][0]["character_id"] == "the-queen"


@pytest.mark.asyncio
async def test_travel_log_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters/nonexistent/travel-log", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_recall_character(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # The Queen is at the-nexus, recall to the-hive
    r = await client.post("/api/v1/turings-hub/characters/the-queen/recall", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "recalled"
    assert data["character"]["current_location"] == "the-hive"


@pytest.mark.asyncio
async def test_recall_already_home(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # The Queen is now back at the-hive
    r = await client.post("/api/v1/turings-hub/characters/the-queen/recall", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "already_home"


@pytest.mark.asyncio
async def test_recall_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post("/api/v1/turings-hub/characters/nonexistent/recall", headers=headers)
    assert r.status_code == 404


# ── Summon System ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_summon_bots(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/turings-hub/characters/the-guardian/summon",
        json={"summon_type": "bot", "task_description": "Perimeter scan", "urgency": "high"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "summoned"
    assert len(data["summon"]["summoned"]["bots"]) == 2
    assert data["summon"]["summoned"]["agent"] is None


@pytest.mark.asyncio
async def test_summon_agent(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/turings-hub/characters/the-guardian/summon",
        json={"summon_type": "agent", "task_description": "Zero-trust audit"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["summon"]["summoned"]["bots"]) == 0
    assert data["summon"]["summoned"]["agent"] is not None
    assert data["summon"]["summoned"]["agent"]["name"] == "Aegis"


@pytest.mark.asyncio
async def test_summon_all(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/turings-hub/characters/prometheus/summon",
        json={"summon_type": "all", "task_description": "Full vault audit", "urgency": "critical"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["summon"]["summoned"]["bots"]) == 2
    assert data["summon"]["summoned"]["agent"]["name"] == "Keeper"


@pytest.mark.asyncio
async def test_summon_offline_character(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create and decommission
    await client.post("/api/v1/turings-hub/characters", json={
        "character_id": "summon-offline-test",
        "name": "Summon Offline Test",
        "home_app": "test",
    }, headers=headers)
    await client.delete("/api/v1/turings-hub/characters/summon-offline-test", headers=headers)

    r = await client.post(
        "/api/v1/turings-hub/characters/summon-offline-test/summon",
        json={"summon_type": "all"},
        headers=headers,
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_summon_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/turings-hub/characters/nonexistent/summon",
        json={"summon_type": "bot"},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_summon_log(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters/the-guardian/summon-log", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 2


@pytest.mark.asyncio
async def test_summon_log_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters/nonexistent/summon-log", headers=headers)
    assert r.status_code == 404


# ── Skill Activation & Evolution ─────────────────────────────

@pytest.mark.asyncio
async def test_activate_skill(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/turings-hub/characters/nexus-ai/activate-skill",
        json={"skill_name": "message_routing", "target": "the-hive", "parameters": {"priority": "high"}},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "activated"
    assert data["activation"]["skill_name"] == "message_routing"
    assert data["activation"]["result"] == "success"
    assert data["activation"]["experience_gained"] > 0


@pytest.mark.asyncio
async def test_activate_skill_not_found_character(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/turings-hub/characters/nonexistent/activate-skill",
        json={"skill_name": "test"},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_activate_skill_not_found_skill(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.post(
        "/api/v1/turings-hub/characters/nexus-ai/activate-skill",
        json={"skill_name": "nonexistent_skill"},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_activate_skill_offline(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    # Create and decommission
    await client.post("/api/v1/turings-hub/characters", json={
        "character_id": "skill-offline-test",
        "name": "Skill Offline Test",
        "home_app": "test",
        "skills": [{"name": "test_skill", "category": "technical", "level": 10, "description": "test"}],
    }, headers=headers)
    await client.delete("/api/v1/turings-hub/characters/skill-offline-test", headers=headers)

    r = await client.post(
        "/api/v1/turings-hub/characters/skill-offline-test/activate-skill",
        json={"skill_name": "test_skill"},
        headers=headers,
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_character_stats(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters/nexus-ai/stats", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["character_id"] == "nexus-ai"
    assert data["evolution_level"] >= 1
    assert data["experience_points"] >= 0
    assert data["skills_count"] == 3
    assert data["bots_count"] == 2
    assert data["has_agent"] is True


@pytest.mark.asyncio
async def test_character_stats_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters/nonexistent/stats", headers=headers)
    assert r.status_code == 404


# ── Hub Overview & Locate ────────────────────────────────────

@pytest.mark.asyncio
async def test_hub_overview(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/overview", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total_characters"] >= 27
    assert "groups" in data
    assert "Core Stack" in data["groups"]
    assert "The Studio" in data["groups"]
    assert "Governance" in data["groups"]
    assert "Wellbeing" in data["groups"]
    assert "Infrastructure" in data["groups"]
    assert "Production" in data["groups"]
    assert "Pillar HQs" in data["groups"]


@pytest.mark.asyncio
async def test_locate_character(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/locate/prometheus", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["character_id"] == "prometheus"
    assert data["home_app"] == "the-void"
    assert data["current_location"] == "the-void"
    assert data["is_home"] is True


@pytest.mark.asyncio
async def test_locate_not_found(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/locate/nonexistent", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_evolution_log(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/evolution-log", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data


# ── Seed Data Verification ───────────────────────────────────

@pytest.mark.asyncio
async def test_all_core_stack_characters(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    for cid in ["nexus-ai", "the-guardian", "the-queen", "prometheus"]:
        r = await client.get(f"/api/v1/turings-hub/characters/{cid}", headers=headers)
        assert r.status_code == 200, f"Missing Core Stack character: {cid}"
        data = r.json()
        assert data["group"] == "Core Stack"
        assert len(data["bots"]) == 2
        assert data["agent"] is not None


@pytest.mark.asyncio
async def test_all_studio_characters(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    for cid in ["voxx", "bert-joen-kater", "madam-krystal", "tyler-towncroft", "junior-cesar", "benji-and-sam", "baron-von-hilton"]:
        r = await client.get(f"/api/v1/turings-hub/characters/{cid}", headers=headers)
        assert r.status_code == 200, f"Missing Studio character: {cid}"
        data = r.json()
        assert data["group"] == "The Studio"
        assert len(data["bots"]) == 2
        assert data["agent"] is not None


@pytest.mark.asyncio
async def test_all_pillar_hq_characters(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    for cid in ["cornelius-macintyre", "the-dr", "norman-hawkins", "dorris-fontaine"]:
        r = await client.get(f"/api/v1/turings-hub/characters/{cid}", headers=headers)
        assert r.status_code == 200, f"Missing Pillar HQ character: {cid}"
        assert r.json()["group"] == "Pillar HQs"


@pytest.mark.asyncio
async def test_all_governance_characters(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    for cid in ["tristuran", "trancendos", "danny-turing", "chronos", "orb-of-orisis"]:
        r = await client.get(f"/api/v1/turings-hub/characters/{cid}", headers=headers)
        assert r.status_code == 200, f"Missing Governance character: {cid}"
        assert r.json()["group"] == "Governance"


@pytest.mark.asyncio
async def test_all_wellbeing_characters(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    for cid in ["savania", "i-mind-ai", "taimra", "resonate-ai"]:
        r = await client.get(f"/api/v1/turings-hub/characters/{cid}", headers=headers)
        assert r.status_code == 200, f"Missing Wellbeing character: {cid}"
        assert r.json()["group"] == "Wellbeing"


@pytest.mark.asyncio
async def test_all_infrastructure_characters(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    for cid in ["rocking-ricki", "renik", "neonach", "lille-sc", "the-porter-family", "solarscene", "lunascene"]:
        r = await client.get(f"/api/v1/turings-hub/characters/{cid}", headers=headers)
        assert r.status_code == 200, f"Missing Infrastructure character: {cid}"
        assert r.json()["group"] == "Infrastructure"


@pytest.mark.asyncio
async def test_all_production_characters(client: AsyncClient, test_user):
    headers = get_auth_headers(test_user)
    for cid in ["larry-lowhammer", "the-mad-hatter", "zimik", "shimshi"]:
        r = await client.get(f"/api/v1/turings-hub/characters/{cid}", headers=headers)
        assert r.status_code == 200, f"Missing Production character: {cid}"
        assert r.json()["group"] == "Production"


@pytest.mark.asyncio
async def test_every_seed_character_has_bots_and_agent(client: AsyncClient, test_user):
    """Every seed character must have exactly 2 bots and 1 agent."""
    headers = get_auth_headers(test_user)
    r = await client.get("/api/v1/turings-hub/characters?limit=200", headers=headers)
    data = r.json()
    seed_ids = [
        "nexus-ai", "the-guardian", "the-queen", "prometheus",
        "voxx", "bert-joen-kater", "madam-krystal", "tyler-towncroft",
        "junior-cesar", "benji-and-sam", "baron-von-hilton",
        "cornelius-macintyre", "the-dr", "norman-hawkins", "dorris-fontaine",
        "tristuran", "trancendos", "danny-turing", "chronos", "orb-of-orisis",
        "savania", "i-mind-ai", "taimra", "resonate-ai",
        "rocking-ricki", "renik", "neonach", "lille-sc", "the-porter-family", "solarscene", "lunascene",
        "larry-lowhammer", "the-mad-hatter", "zimik", "shimshi",
    ]
    for char in data["items"]:
        if char["character_id"] in seed_ids:
            assert len(char["bots"]) == 2, f"{char['character_id']} has {len(char['bots'])} bots, expected 2"
            assert char["agent"] is not None, f"{char['character_id']} has no agent"