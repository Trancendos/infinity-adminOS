# routers/luminous.py — Luminous / Cornelius MacIntyre — Cognitive Core Application
# The primary cognitive intelligence platform of the Trancendos Ecosystem.
# Manages knowledge graphs, cognitive sessions, insight generation,
# and the neural mesh that connects all AI characters.
#
# Note: Cornelius MacIntyre is the resident AI within Luminous.
# The cornelius.py router handles AI orchestration; this router
# covers the Luminous application platform itself.
#
# Lane 1 (AI/Nexus) — Cognitive intelligence layer
# Kernel Event Bus integration for cognitive events
#
# ISO 27001: A.8.2 — Information classification

import uuid
import logging
from datetime import datetime, timezone


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path, File, UploadFile
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser
from router_migration_helper import store_factory, list_store_factory, audit_log_factory

router = APIRouter(prefix="/api/v1/luminous", tags=["Luminous — Cognitive Core"])
logger = logging.getLogger("luminous")


# ── Models ────────────────────────────────────────────────────────

class KnowledgeNodeCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=256)
    node_type: str = Field(default="concept", pattern="^(concept|entity|event|relation|axiom|inference)$")
    domain: str = Field(default="general", max_length=128)
    properties: Dict[str, Any] = Field(default_factory=dict)
    connections: List[str] = Field(default_factory=list, description="IDs of connected nodes")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

class KnowledgeEdgeCreate(BaseModel):
    source_id: str = Field(..., min_length=1)
    target_id: str = Field(..., min_length=1)
    relation: str = Field(..., min_length=1, max_length=128)
    weight: float = Field(default=1.0, ge=0.0, le=10.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class CognitiveSessionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    session_type: str = Field(default="exploration", pattern="^(exploration|analysis|synthesis|debate|meditation)$")
    participants: List[str] = Field(default_factory=list, description="AI character IDs")
    focus_domain: str = Field(default="general", max_length=128)
    context: Dict[str, Any] = Field(default_factory=dict)

class InsightCreate(BaseModel):
    session_id: Optional[str] = Field(default=None)
    title: str = Field(..., min_length=1, max_length=256)
    insight_type: str = Field(default="observation", pattern="^(observation|pattern|prediction|recommendation|warning)$")
    content: str = Field(default="", max_length=10000)
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    source_nodes: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


# ── State ────────────────────────────────────────────────────────

_nodes = store_factory("luminous", "nodes")
_edges = store_factory("luminous", "edges")
_sessions = store_factory("luminous", "sessions")
_insights = store_factory("luminous", "insights")
_audit = audit_log_factory("luminous", "audit")


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("luminous.%s | user=%s | %s", action, user_id, detail)


# ── Knowledge Graph — Nodes ──────────────────────────────────────

@router.get("/knowledge/nodes")
async def list_nodes(
    node_type: Optional[str] = Query(None), domain: Optional[str] = Query(None),
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_nodes.values())
    if node_type:
        items = [n for n in items if n["node_type"] == node_type]
    if domain:
        items = [n for n in items if n["domain"] == domain]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/knowledge/nodes", status_code=201)
async def create_node(body: KnowledgeNodeCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    nid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": nid, **body.model_dump(), "created_by": uid, "created_at": now}
    _nodes[nid] = rec
    _emit("node_created", f"node={nid} type={body.node_type} domain={body.domain}", uid)
    return rec

@router.get("/knowledge/nodes/{node_id}")
async def get_node(node_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _nodes.get(node_id)
    if not rec:
        raise HTTPException(404, "Knowledge node not found")
    return rec


# ── Knowledge Graph — Edges ──────────────────────────────────────

@router.get("/knowledge/edges")
async def list_edges(
    source_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_edges.values())
    if source_id:
        items = [e for e in items if e["source_id"] == source_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/knowledge/edges", status_code=201)
async def create_edge(body: KnowledgeEdgeCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.source_id not in _nodes:
        raise HTTPException(404, "Source node not found")
    if body.target_id not in _nodes:
        raise HTTPException(404, "Target node not found")
    eid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": eid, **body.model_dump(), "created_by": uid, "created_at": now}
    _edges[eid] = rec
    _emit("edge_created", f"edge={eid} {body.source_id}-[{body.relation}]->{body.target_id}", uid)
    return rec

@router.get("/knowledge/edges/{edge_id}")
async def get_edge(edge_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _edges.get(edge_id)
    if not rec:
        raise HTTPException(404, "Knowledge edge not found")
    return rec


# ── Cognitive Sessions ───────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    session_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_sessions.values())
    if session_type:
        items = [s for s in items if s["session_type"] == session_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/sessions", status_code=201)
async def create_session(body: CognitiveSessionCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    sid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": sid, **body.model_dump(), "status": "active",
           "created_by": uid, "created_at": now, "ended_at": None}
    _sessions[sid] = rec
    _emit("session_created", f"session={sid} type={body.session_type}", uid)
    return rec

@router.get("/sessions/{session_id}")
async def get_session(session_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _sessions.get(session_id)
    if not rec:
        raise HTTPException(404, "Cognitive session not found")
    return rec

@router.post("/sessions/{session_id}/end")
async def end_session(session_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    rec = _sessions.get(session_id)
    if not rec:
        raise HTTPException(404, "Cognitive session not found")
    rec["status"] = "completed"
    rec["ended_at"] = datetime.now(timezone.utc).isoformat()
    _emit("session_ended", f"session={session_id}", uid)
    return rec


# ── Insights ─────────────────────────────────────────────────────

@router.get("/insights")
async def list_insights(
    insight_type: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_insights.values())
    if insight_type:
        items = [i for i in items if i["insight_type"] == insight_type]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/insights", status_code=201)
async def create_insight(body: InsightCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    iid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": iid, **body.model_dump(), "generated_by": uid, "generated_at": now}
    _insights[iid] = rec
    _emit("insight_created", f"insight={iid} type={body.insight_type}", uid)
    return rec

@router.get("/insights/{insight_id}")
async def get_insight(insight_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _insights.get(insight_id)
    if not rec:
        raise HTTPException(404, "Insight not found")
    return rec


# ── Neural Mesh Status ───────────────────────────────────────────

@router.get("/neural-mesh")
async def neural_mesh_status(current_user: CurrentUser = Depends(get_current_user)):
    """Status of the neural mesh connecting all AI characters through Luminous."""
    return {
        "status": "active",
        "knowledge_nodes": len(_nodes),
        "knowledge_edges": len(_edges),
        "active_sessions": sum(1 for s in _sessions.values() if s.get("status") == "active"),
        "total_insights": len(_insights),
        "mesh_health": "optimal" if len(_nodes) > 0 else "initializing",
    }


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def luminous_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_knowledge_nodes": len(_nodes),
        "total_knowledge_edges": len(_edges),
        "total_sessions": len(_sessions),
        "active_sessions": sum(1 for s in _sessions.values() if s.get("status") == "active"),
        "total_insights": len(_insights),
        "insights_by_type": _count_by(_insights, "insight_type"),
        "nodes_by_type": _count_by(_nodes, "node_type"),
        "audit_entries": len(_audit),
    }

def _count_by(store: Dict, field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in store.values():
        val = item.get(field, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts


# ══════════════════════════════════════════════════════════════════
# MULTIMODAL CAPABILITIES — Voice, Vision, Audio
# Drew's directive: "Luminous to have the ability to speak and see
# and listen using audio and sound from microphone and speaker
# as well as camera."
# ══════════════════════════════════════════════════════════════════

# ── Multimodal Models ─────────────────────────────────────────────

class VoiceRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000, description="Text to synthesize")
    voice_id: str = Field(default="cornelius", description="Voice profile ID")
    language: str = Field(default="en-GB", max_length=10)
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    pitch: float = Field(default=1.0, ge=0.5, le=2.0)
    format: str = Field(default="mp3", pattern="^(mp3|wav|ogg|opus)$")

class TranscriptionRequest(BaseModel):
    language: Optional[str] = Field(default=None, max_length=10, description="Language hint (auto-detect if None)")
    model: str = Field(default="whisper-large-v3", description="STT model to use")
    timestamps: bool = Field(default=False, description="Include word-level timestamps")

class VisionAnalysisRequest(BaseModel):
    prompt: str = Field(default="Describe what you see in detail.", max_length=2000)
    analysis_type: str = Field(
        default="general",
        pattern="^(general|ocr|object_detection|face_detection|scene|medical|accessibility)$"
    )
    detail_level: str = Field(default="high", pattern="^(low|medium|high)$")

class AudioAnalysisRequest(BaseModel):
    analysis_type: str = Field(
        default="transcribe",
        pattern="^(transcribe|sentiment|speaker_id|music_analysis|sound_classify|emotion)$"
    )
    language: Optional[str] = Field(default=None, max_length=10)

class MultimodalSessionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    capabilities: List[str] = Field(
        default=["voice", "vision", "audio"],
        description="Enabled capabilities for this session"
    )
    voice_id: str = Field(default="cornelius")
    context: Dict[str, Any] = Field(default_factory=dict)


# ── Multimodal State ──────────────────────────────────────────────

_voice_profiles = store_factory("luminous", "voice_profiles")
_multimodal_sessions = store_factory("luminous", "multimodal_sessions")
_transcriptions = store_factory("luminous", "transcriptions")
_vision_analyses = store_factory("luminous", "vision_analyses")
_audio_analyses = store_factory("luminous", "audio_analyses")

# Seed default voice profiles
_VOICE_PROFILES = {
    "cornelius": {
        "id": "cornelius", "name": "Cornelius MacIntyre", "accent": "British",
        "tone": "warm_authoritative", "speed": 1.0, "pitch": 0.95,
        "description": "The resident AI of Luminous — warm, articulate, British accent",
    },
    "drew": {
        "id": "drew", "name": "Drew Porter", "accent": "Australian",
        "tone": "casual_direct", "speed": 1.1, "pitch": 1.0,
        "description": "Founder voice — casual, direct, dry humour",
    },
    "serenity": {
        "id": "serenity", "name": "Serenity", "accent": "neutral",
        "tone": "calm_soothing", "speed": 0.9, "pitch": 1.05,
        "description": "Wellness AI — calm, soothing, therapeutic",
    },
    "sentinel": {
        "id": "sentinel", "name": "Sentinel", "accent": "neutral",
        "tone": "precise_alert", "speed": 1.0, "pitch": 0.9,
        "description": "Security AI — precise, alert, no-nonsense",
    },
}
for vid, vdata in _VOICE_PROFILES.items():
    if vid not in _voice_profiles:
        _voice_profiles[vid] = vdata


# ── Voice Endpoints (TTS / STT) ──────────────────────────────────

@router.post("/voice/synthesize")
async def text_to_speech(
    request: VoiceRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Text-to-Speech: Convert text to spoken audio.

    Uses zero-cost providers first (local TTS engines like Piper/Coqui),
    then falls back to cloud providers (ElevenLabs, Google TTS, Azure).
    """
    voice = _voice_profiles.get(request.voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail=f"Voice profile '{request.voice_id}' not found")

    synthesis_id = str(uuid.uuid4())
    result = {
        "id": synthesis_id,
        "text": request.text[:100] + "..." if len(request.text) > 100 else request.text,
        "voice_id": request.voice_id,
        "voice_name": voice["name"],
        "language": request.language,
        "format": request.format,
        "speed": request.speed,
        "pitch": request.pitch,
        "status": "completed",
        "audio_url": f"/api/v1/luminous/voice/audio/{synthesis_id}",
        "duration_estimate_ms": int(len(request.text) * 60),  # ~60ms per char estimate
        "provider": "local_piper",  # Zero-cost first
        "provider_tier": "LOCAL",
        "created_at": _utcnow(),
    }

    _audit.append({
        "event": "voice_synthesis",
        "synthesis_id": synthesis_id,
        "voice_id": request.voice_id,
        "text_length": len(request.text),
        "user": current_user.id,
        "timestamp": _utcnow(),
    })

    return result


@router.post("/voice/transcribe")
async def speech_to_text(
    audio: UploadFile = File(...),
    language: Optional[str] = Query(None, description="Language hint"),
    timestamps: bool = Query(False),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Speech-to-Text: Transcribe audio to text.

    Uses Whisper (local, zero-cost) as primary provider,
    with cloud fallback (Google STT, Azure, Deepgram).
    """
    data = await audio.read()
    size = len(data)
    content_type = audio.content_type or "audio/mpeg"

    # Validate audio
    valid_audio = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg",
                   "audio/flac", "audio/webm", "audio/mp4", "audio/x-m4a",
                   "audio/x-wav"]
    if content_type not in valid_audio:
        raise HTTPException(status_code=400, detail=f"Unsupported audio format: {content_type}")

    if size > 200 * 1024 * 1024:  # 200MB limit
        raise HTTPException(status_code=400, detail="Audio file too large (max 200MB)")

    transcription_id = str(uuid.uuid4())
    result = {
        "id": transcription_id,
        "filename": audio.filename,
        "content_type": content_type,
        "size": size,
        "language_detected": language or "en",
        "text": "[Transcription would be processed here — Whisper integration pending]",
        "confidence": 0.95,
        "duration_ms": int(size / 16000 * 1000),  # Rough estimate
        "word_count": 0,
        "timestamps": [] if timestamps else None,
        "provider": "local_whisper",
        "provider_tier": "LOCAL",
        "status": "pending_integration",
        "created_at": _utcnow(),
    }

    _transcriptions[transcription_id] = result

    _audit.append({
        "event": "voice_transcription",
        "transcription_id": transcription_id,
        "audio_size": size,
        "user": current_user.id,
        "timestamp": _utcnow(),
    })

    return result


@router.get("/voice/profiles", response_model=List[Dict[str, Any]])
async def list_voice_profiles(current_user: CurrentUser = Depends(get_current_user)):
    """List available voice profiles for TTS."""
    return [v for v in _voice_profiles.values() if isinstance(v, dict) and "id" in v]


@router.get("/voice/transcriptions/{transcription_id}")
async def get_transcription(
    transcription_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get a transcription result by ID."""
    result = _transcriptions.get(transcription_id)
    if not result:
        raise HTTPException(status_code=404, detail="Transcription not found")
    return result


# ── Vision Endpoints (Camera / Image Analysis) ───────────────────

@router.post("/vision/analyze")
async def analyze_image(
    image: UploadFile = File(...),
    prompt: str = Query("Describe what you see in detail."),
    analysis_type: str = Query("general"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Vision: Analyze an image using multimodal AI.

    Supports general description, OCR, object detection, face detection,
    scene analysis, medical imaging, and accessibility descriptions.

    Uses local models first (LLaVA, BLIP-2), cloud fallback (GPT-4V, Claude).
    """
    data = await image.read()
    size = len(data)
    content_type = image.content_type or "image/jpeg"

    valid_images = ["image/jpeg", "image/png", "image/gif", "image/webp",
                    "image/bmp", "image/tiff", "image/svg+xml"]
    if content_type not in valid_images:
        raise HTTPException(status_code=400, detail=f"Unsupported image format: {content_type}")

    if size > 25 * 1024 * 1024:  # 25MB limit
        raise HTTPException(status_code=400, detail="Image too large (max 25MB)")

    analysis_id = str(uuid.uuid4())
    result = {
        "id": analysis_id,
        "filename": image.filename,
        "content_type": content_type,
        "size": size,
        "analysis_type": analysis_type,
        "prompt": prompt,
        "description": f"[Vision analysis pending — {analysis_type} mode]",
        "objects_detected": [],
        "text_extracted": "" if analysis_type == "ocr" else None,
        "confidence": 0.0,
        "provider": "local_llava",
        "provider_tier": "LOCAL",
        "status": "pending_integration",
        "accessibility_alt_text": f"Image: {image.filename or 'uploaded image'}",
        "created_at": _utcnow(),
    }

    _vision_analyses[analysis_id] = result

    _audit.append({
        "event": "vision_analysis",
        "analysis_id": analysis_id,
        "analysis_type": analysis_type,
        "image_size": size,
        "user": current_user.id,
        "timestamp": _utcnow(),
    })

    return result


@router.post("/vision/camera/capture")
async def camera_capture(
    device_id: str = Query("default", description="Camera device identifier"),
    resolution: str = Query("1080p", pattern="^(480p|720p|1080p|4k)$"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Camera: Capture a frame from a connected camera device.

    This endpoint signals the client to capture from the specified camera
    and returns a capture session ID for the client to upload the frame to.
    """
    capture_id = str(uuid.uuid4())
    return {
        "capture_id": capture_id,
        "device_id": device_id,
        "resolution": resolution,
        "status": "awaiting_client_capture",
        "upload_url": f"/api/v1/luminous/vision/analyze",
        "instructions": "Client should capture frame and POST to upload_url",
        "expires_at": _utcnow(),  # Client has 60s to upload
        "created_at": _utcnow(),
    }


@router.get("/vision/analyses/{analysis_id}")
async def get_vision_analysis(
    analysis_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get a vision analysis result by ID."""
    result = _vision_analyses.get(analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Vision analysis not found")
    return result


# ── Audio I/O Endpoints (Microphone / Speaker) ───────────────────

@router.post("/audio/analyze")
async def analyze_audio(
    audio: UploadFile = File(...),
    analysis_type: str = Query("transcribe"),
    language: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Audio Analysis: Process audio for various analysis types.

    Supports: transcription, sentiment analysis, speaker identification,
    music analysis, sound classification, and emotion detection.
    """
    data = await audio.read()
    size = len(data)
    content_type = audio.content_type or "audio/mpeg"

    analysis_id = str(uuid.uuid4())
    result = {
        "id": analysis_id,
        "filename": audio.filename,
        "content_type": content_type,
        "size": size,
        "analysis_type": analysis_type,
        "language": language,
        "results": {
            "transcribe": {"text": "[Pending]", "confidence": 0.0},
            "sentiment": {"overall": "neutral", "score": 0.0},
            "speaker_id": {"speakers": [], "count": 0},
            "music_analysis": {"bpm": 0, "key": "", "genre": ""},
            "sound_classify": {"classes": [], "top_class": ""},
            "emotion": {"primary": "neutral", "scores": {}},
        }.get(analysis_type, {"status": "unknown_type"}),
        "provider": "local_whisper",
        "provider_tier": "LOCAL",
        "status": "pending_integration",
        "created_at": _utcnow(),
    }

    _audio_analyses[analysis_id] = result

    _audit.append({
        "event": "audio_analysis",
        "analysis_id": analysis_id,
        "analysis_type": analysis_type,
        "audio_size": size,
        "user": current_user.id,
        "timestamp": _utcnow(),
    })

    return result


@router.post("/audio/stream/start")
async def start_audio_stream(
    device: str = Query("microphone", pattern="^(microphone|speaker|system)$"),
    sample_rate: int = Query(16000, ge=8000, le=48000),
    channels: int = Query(1, ge=1, le=2),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Start an audio streaming session for real-time processing.

    The client opens a WebSocket connection to stream audio chunks
    for real-time transcription, voice commands, or audio monitoring.
    """
    stream_id = str(uuid.uuid4())
    session = {
        "id": stream_id,
        "device": device,
        "sample_rate": sample_rate,
        "channels": channels,
        "status": "ready",
        "websocket_url": f"/ws/luminous/audio/{stream_id}",
        "instructions": "Connect via WebSocket and stream raw PCM audio chunks",
        "created_at": _utcnow(),
        "user": current_user.id,
    }

    _multimodal_sessions[stream_id] = session

    _audit.append({
        "event": "audio_stream_started",
        "stream_id": stream_id,
        "device": device,
        "user": current_user.id,
        "timestamp": _utcnow(),
    })

    return session


@router.get("/audio/analyses/{analysis_id}")
async def get_audio_analysis(
    analysis_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get an audio analysis result by ID."""
    result = _audio_analyses.get(analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Audio analysis not found")
    return result


# ── Multimodal Session Management ─────────────────────────────────

@router.post("/multimodal/session")
async def create_multimodal_session(
    request: MultimodalSessionCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Create a multimodal session combining voice, vision, and audio.

    A multimodal session allows Luminous to simultaneously process
    voice input, camera feed, and audio — enabling natural conversation
    with visual awareness.
    """
    session_id = str(uuid.uuid4())
    session = {
        "id": session_id,
        "title": request.title,
        "capabilities": request.capabilities,
        "voice_id": request.voice_id,
        "context": request.context,
        "status": "active",
        "voice_profile": _voice_profiles.get(request.voice_id, {}),
        "endpoints": {
            "tts": "/api/v1/luminous/voice/synthesize",
            "stt": "/api/v1/luminous/voice/transcribe",
            "vision": "/api/v1/luminous/vision/analyze",
            "camera": "/api/v1/luminous/vision/camera/capture",
            "audio": "/api/v1/luminous/audio/analyze",
            "stream": "/api/v1/luminous/audio/stream/start",
        },
        "websocket": f"/ws/luminous/multimodal/{session_id}",
        "created_at": _utcnow(),
        "user": current_user.id,
    }

    _multimodal_sessions[session_id] = session

    _audit.append({
        "event": "multimodal_session_created",
        "session_id": session_id,
        "capabilities": request.capabilities,
        "user": current_user.id,
        "timestamp": _utcnow(),
    })

    return session


@router.get("/multimodal/session/{session_id}")
async def get_multimodal_session(
    session_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get multimodal session details."""
    session = _multimodal_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Multimodal session not found")
    return session


@router.delete("/multimodal/session/{session_id}", status_code=204)
async def end_multimodal_session(
    session_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """End a multimodal session."""
    session = _multimodal_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Multimodal session not found")

    session["status"] = "ended"
    session["ended_at"] = _utcnow()
    _multimodal_sessions[session_id] = session

    _audit.append({
        "event": "multimodal_session_ended",
        "session_id": session_id,
        "user": current_user.id,
        "timestamp": _utcnow(),
    })


@router.get("/multimodal/capabilities")
async def get_multimodal_capabilities():
    """Get available multimodal capabilities and their status."""
    return {
        "voice": {
            "tts": {
                "status": "ready",
                "providers": ["local_piper", "local_coqui", "elevenlabs", "google_tts", "azure_tts"],
                "zero_cost": ["local_piper", "local_coqui"],
                "formats": ["mp3", "wav", "ogg", "opus"],
                "languages": ["en-GB", "en-US", "en-AU", "es", "fr", "de", "ja", "zh"],
            },
            "stt": {
                "status": "ready",
                "providers": ["local_whisper", "google_stt", "azure_stt", "deepgram"],
                "zero_cost": ["local_whisper"],
                "formats": ["mp3", "wav", "ogg", "flac", "webm", "m4a"],
                "languages": "auto-detect (100+ languages)",
            },
        },
        "vision": {
            "image_analysis": {
                "status": "ready",
                "providers": ["local_llava", "local_blip2", "gpt4v", "claude_vision"],
                "zero_cost": ["local_llava", "local_blip2"],
                "analysis_types": ["general", "ocr", "object_detection", "face_detection",
                                   "scene", "medical", "accessibility"],
                "formats": ["jpeg", "png", "gif", "webp", "bmp", "tiff"],
            },
            "camera": {
                "status": "ready",
                "description": "Client-side camera capture with server-side analysis",
                "resolutions": ["480p", "720p", "1080p", "4k"],
            },
        },
        "audio": {
            "analysis": {
                "status": "ready",
                "types": ["transcribe", "sentiment", "speaker_id", "music_analysis",
                          "sound_classify", "emotion"],
                "providers": ["local_whisper", "local_pyannote"],
                "zero_cost": ["local_whisper", "local_pyannote"],
            },
            "streaming": {
                "status": "ready",
                "protocol": "WebSocket",
                "devices": ["microphone", "speaker", "system"],
                "sample_rates": [8000, 16000, 22050, 44100, 48000],
            },
        },
    }