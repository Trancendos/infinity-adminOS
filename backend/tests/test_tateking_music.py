# tests/test_tateking_music.py — TateKing music production tests
import pytest
from httpx import AsyncClient

from tests.conftest import get_auth_headers


# ── Helper ───────────────────────────────────────────────────

async def _create_project(client, headers, title="Test Beat", genre="hip_hop", bpm=140):
    resp = await client.post(
        "/api/v1/tateking/music/projects",
        headers=headers,
        json={"title": title, "genre": genre, "bpm": bpm},
    )
    assert resp.status_code == 201
    return resp.json()


async def _create_track(client, headers, project_id, name="Lead Vocal", track_type="vocal"):
    resp = await client.post(
        "/api/v1/tateking/music/tracks",
        headers=headers,
        json={"project_id": project_id, "name": name, "track_type": track_type},
    )
    assert resp.status_code == 201
    return resp.json()


# ── Music Projects ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_music_project(client: AsyncClient, test_user):
    """Create a music project"""
    headers = get_auth_headers(test_user)
    data = await _create_project(client, headers)
    assert data["bpm"] == 140
    assert "id" in data


@pytest.mark.asyncio
async def test_list_music_projects(client: AsyncClient, test_user):
    """List music projects"""
    headers = get_auth_headers(test_user)
    await _create_project(client, headers, title="List Test", genre="electronic", bpm=128)
    resp = await client.get("/api/v1/tateking/music/projects", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_get_music_project(client: AsyncClient, test_user):
    """Get a specific music project"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="Get Test", genre="rock", bpm=120)
    project_id = project["id"]

    resp = await client.get(f"/api/v1/tateking/music/projects/{project_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == project_id


@pytest.mark.asyncio
async def test_get_music_project_not_found(client: AsyncClient, test_user):
    """Non-existent project returns 404"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/tateking/music/projects/nonexistent", headers=headers)
    assert resp.status_code == 404


# ── Tracks ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_track(client: AsyncClient, test_user):
    """Create a track in a project"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="Track Test")
    track = await _create_track(client, headers, project["id"])
    assert track["name"] == "Lead Vocal"
    assert track["track_type"] == "vocal"
    assert "id" in track


@pytest.mark.asyncio
async def test_get_track(client: AsyncClient, test_user):
    """Get a specific track"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="Get Track", genre="jazz", bpm=100)
    track = await _create_track(client, headers, project["id"], name="Bass", track_type="bass")

    resp = await client.get(f"/api/v1/tateking/music/tracks/{track['id']}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Bass"


@pytest.mark.asyncio
async def test_update_track(client: AsyncClient, test_user):
    """Update track mixer settings via query params"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="Update Track")
    track = await _create_track(client, headers, project["id"], name="Drums", track_type="drum")

    resp = await client.patch(
        f"/api/v1/tateking/music/tracks/{track['id']}",
        headers=headers,
        params={"volume": 0.6, "muted": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["volume"] == 0.6
    assert data["muted"] is True


# ── Stems ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_stem(client: AsyncClient, test_user):
    """Create a stem on a track"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="Stem Project", genre="electronic", bpm=130)
    track = await _create_track(client, headers, project["id"], name="Synth", track_type="synth")

    resp = await client.post(
        "/api/v1/tateking/music/stems",
        headers=headers,
        json={
            "project_id": project["id"],
            "track_id": track["id"],
            "name": "Synth Intro",
            "start_beat": 0.0,
            "duration_beats": 16.0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Synth Intro"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_stem(client: AsyncClient, test_user):
    """Get a specific stem"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="Get Stem", genre="ambient", bpm=80)
    track = await _create_track(client, headers, project["id"], name="Pad", track_type="synth")

    stem_resp = await client.post(
        "/api/v1/tateking/music/stems",
        headers=headers,
        json={
            "project_id": project["id"],
            "track_id": track["id"],
            "name": "Pad Layer",
            "start_beat": 0.0,
            "duration_beats": 32.0,
        },
    )
    assert stem_resp.status_code == 201
    stem_id = stem_resp.json()["id"]

    resp = await client.get(f"/api/v1/tateking/music/stems/{stem_id}", headers=headers)
    assert resp.status_code == 200


# ── Effects ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_effect(client: AsyncClient, test_user):
    """Add an effect to a track"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="FX Project", genre="electronic", bpm=140)
    track = await _create_track(client, headers, project["id"], name="Bass Drop", track_type="bass")

    resp = await client.post(
        "/api/v1/tateking/music/effects",
        headers=headers,
        json={
            "track_id": track["id"],
            "effect_type": "compressor",
            "parameters": {"threshold": -20, "ratio": 4, "attack": 10, "release": 100},
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["effect_type"] == "compressor"
    assert "id" in data


@pytest.mark.asyncio
async def test_delete_effect(client: AsyncClient, test_user):
    """Delete an effect"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="Del FX", genre="electronic", bpm=150)
    track = await _create_track(client, headers, project["id"], name="808", track_type="drum")

    fx_resp = await client.post(
        "/api/v1/tateking/music/effects",
        headers=headers,
        json={"track_id": track["id"], "effect_type": "eq", "parameters": {"low": 3, "mid": 0, "high": -2}},
    )
    effect_id = fx_resp.json()["id"]

    resp = await client.delete(f"/api/v1/tateking/music/effects/{effect_id}", headers=headers)
    assert resp.status_code == 204


# ── Mixes & Masters ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_mix(client: AsyncClient, test_user):
    """Create a mix snapshot"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="Mix Project", genre="electronic", bpm=125)

    resp = await client.post(
        "/api/v1/tateking/music/mixes",
        headers=headers,
        json={
            "project_id": project["id"],
            "name": "Mix v1",
            "notes": "First rough mix",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Mix v1"


@pytest.mark.asyncio
async def test_create_master(client: AsyncClient, test_user):
    """Create a master from a mix"""
    headers = get_auth_headers(test_user)
    project = await _create_project(client, headers, title="Master Project", genre="pop", bpm=120)

    # Create a mix first (master requires a mix_id)
    mix_resp = await client.post(
        "/api/v1/tateking/music/mixes",
        headers=headers,
        json={"project_id": project["id"], "name": "Pre-Master Mix"},
    )
    assert mix_resp.status_code == 201
    mix_id = mix_resp.json()["id"]

    # Create master via query params
    resp = await client.post(
        "/api/v1/tateking/music/masters",
        headers=headers,
        params={
            "mix_id": mix_id,
            "format": "wav",
            "sample_rate": 44100,
            "bit_depth": 24,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "mastering_chain" in data


@pytest.mark.asyncio
async def test_music_overview(client: AsyncClient, test_user):
    """Get music production overview"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/tateking/music/overview", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_music_projects" in data
    assert "total_tracks" in data