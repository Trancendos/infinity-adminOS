# tests/test_luminous_multimodal.py — Luminous multimodal extension tests
import pytest
import io
from httpx import AsyncClient

from tests.conftest import get_auth_headers


# ── Voice Endpoints ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_voice_profiles(client: AsyncClient, test_user):
    """List available voice profiles"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/luminous/voice/profiles", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 4  # Cornelius MacIntyre, Drew Porter, Serenity, Sentinel
    names = [p["name"] for p in data]
    assert any("Cornelius" in n for n in names)
    assert any("Drew" in n for n in names)


@pytest.mark.asyncio
async def test_voice_synthesize(client: AsyncClient, test_user):
    """Synthesize speech from text"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/luminous/voice/synthesize",
        headers=headers,
        json={
            "text": "Hello from Luminous",
            "voice_profile_id": "cornelius",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data


@pytest.mark.asyncio
async def test_voice_transcribe(client: AsyncClient, test_user):
    """Transcribe audio to text"""
    headers = get_auth_headers(test_user)
    wav_header = b'RIFF' + b'\x00' * 4 + b'WAVE' + b'fmt ' + b'\x00' * 20 + b'data' + b'\x00' * 100
    resp = await client.post(
        "/api/v1/luminous/voice/transcribe",
        headers=headers,
        files={"audio": ("test.wav", io.BytesIO(wav_header), "audio/wav")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data


@pytest.mark.asyncio
async def test_get_transcription_not_found(client: AsyncClient, test_user):
    """Non-existent transcription returns 404"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/luminous/voice/transcriptions/nonexistent", headers=headers)
    assert resp.status_code == 404


# ── Vision Endpoints ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_vision_analyze(client: AsyncClient, test_user):
    """Analyze an image"""
    headers = get_auth_headers(test_user)
    png_data = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100
    resp = await client.post(
        "/api/v1/luminous/vision/analyze",
        headers=headers,
        files={"image": ("test.png", io.BytesIO(png_data), "image/png")},
        data={"analysis_type": "general"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data


@pytest.mark.asyncio
async def test_vision_camera_capture(client: AsyncClient, test_user):
    """Camera capture endpoint"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/luminous/vision/camera/capture",
        headers=headers,
        json={"analysis_type": "general"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data or "capture_id" in data


@pytest.mark.asyncio
async def test_get_vision_analysis_not_found(client: AsyncClient, test_user):
    """Non-existent vision analysis returns 404"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/luminous/vision/analyses/nonexistent", headers=headers)
    assert resp.status_code == 404


# ── Audio Endpoints ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_audio_analyze(client: AsyncClient, test_user):
    """Analyze audio content"""
    headers = get_auth_headers(test_user)
    wav_data = b'RIFF' + b'\x00' * 4 + b'WAVE' + b'fmt ' + b'\x00' * 20 + b'data' + b'\x00' * 100
    resp = await client.post(
        "/api/v1/luminous/audio/analyze",
        headers=headers,
        files={"audio": ("test.wav", io.BytesIO(wav_data), "audio/wav")},
        data={"analysis_type": "transcribe"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data


@pytest.mark.asyncio
async def test_audio_stream_start(client: AsyncClient, test_user):
    """Start audio streaming session"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/luminous/audio/stream/start",
        headers=headers,
        json={"mode": "transcribe"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data  # Stream session has an ID


@pytest.mark.asyncio
async def test_get_audio_analysis_not_found(client: AsyncClient, test_user):
    """Non-existent audio analysis returns 404"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/luminous/audio/analyses/nonexistent", headers=headers)
    assert resp.status_code == 404


# ── Multimodal Session Endpoints ─────────────────────────────

@pytest.mark.asyncio
async def test_create_multimodal_session(client: AsyncClient, test_user):
    """Create a multimodal session"""
    headers = get_auth_headers(test_user)
    resp = await client.post(
        "/api/v1/luminous/multimodal/session",
        headers=headers,
        json={
            "title": "Test Multimodal Session",
            "capabilities": ["voice", "vision"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data


@pytest.mark.asyncio
async def test_get_multimodal_session(client: AsyncClient, test_user):
    """Get multimodal session details"""
    headers = get_auth_headers(test_user)
    create_resp = await client.post(
        "/api/v1/luminous/multimodal/session",
        headers=headers,
        json={"title": "Get Session Test", "capabilities": ["voice"]},
    )
    assert create_resp.status_code == 200
    session_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/luminous/multimodal/session/{session_id}", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_multimodal_session(client: AsyncClient, test_user):
    """Delete a multimodal session"""
    headers = get_auth_headers(test_user)
    create_resp = await client.post(
        "/api/v1/luminous/multimodal/session",
        headers=headers,
        json={"title": "Delete Session Test", "capabilities": ["audio"]},
    )
    assert create_resp.status_code == 200
    session_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/luminous/multimodal/session/{session_id}", headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_multimodal_session_not_found(client: AsyncClient, test_user):
    """Non-existent multimodal session returns 404"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/luminous/multimodal/session/nonexistent", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_multimodal_capabilities(client: AsyncClient, test_user):
    """Get multimodal capabilities"""
    headers = get_auth_headers(test_user)
    resp = await client.get("/api/v1/luminous/multimodal/capabilities", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)
    # Should have voice, vision, audio sections
    assert any(k in data for k in ["voice", "vision", "audio", "capabilities"])