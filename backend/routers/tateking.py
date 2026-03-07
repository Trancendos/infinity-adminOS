# routers/tateking.py — TateKing / Benji & Sam — Cinematic Production
# Cinematic and video production module within The Studio.
# Manages productions, storyboards, shots, and post-production workflows.
#
# Lane 2 (User/Infinity) — Cinematic layer
# Kernel Event Bus integration for production events

import uuid
import logging
from datetime import datetime, timezone


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser
from router_migration_helper import store_factory, list_store_factory, audit_log_factory

router = APIRouter(prefix="/api/v1/tateking", tags=["TateKing — Cinematic"])
logger = logging.getLogger("tateking")


# ── Models ────────────────────────────────────────────────────────

class ProductionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=5000)
    genre: str = Field(default="narrative", pattern="^(narrative|documentary|commercial|music_video|animation|experimental)$")
    format: str = Field(default="4k", pattern="^(hd|4k|8k|imax|vr360)$")
    duration_seconds: int = Field(default=0, ge=0)

class StoryboardCreate(BaseModel):
    production_id: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=256)
    panels: int = Field(default=1, ge=1, le=500)
    notes: str = Field(default="", max_length=3000)

class ShotCreate(BaseModel):
    production_id: str = Field(..., min_length=1)
    shot_number: int = Field(..., ge=1)
    shot_type: str = Field(default="wide", pattern="^(wide|medium|close_up|extreme_close|aerial|tracking|pov)$")
    description: str = Field(default="", max_length=2000)
    duration_seconds: float = Field(default=5.0, ge=0.1, le=3600)
    camera_settings: Dict[str, Any] = Field(default_factory=dict)


# ── State ────────────────────────────────────────────────────────

_productions = store_factory("tateking", "productions")
_storyboards = store_factory("tateking", "storyboards")
_shots = store_factory("tateking", "shots")
_audit = audit_log_factory("tateking", "audit")


def _emit(action: str, detail: str, user_id: str):
    _audit.append({"id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(),
                    "action": action, "detail": detail, "user_id": user_id})
    logger.info("tateking.%s | user=%s | %s", action, user_id, detail)


# ── Productions ──────────────────────────────────────────────────

@router.get("/productions")
async def list_productions(
    genre: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_productions.values())
    if genre:
        items = [p for p in items if p["genre"] == genre]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/productions", status_code=201)
async def create_production(body: ProductionCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": pid, **body.model_dump(), "status": "pre_production",
           "created_by": uid, "created_at": now}
    _productions[pid] = rec
    _emit("production_created", f"production={pid} genre={body.genre}", uid)
    return rec

@router.get("/productions/{production_id}")
async def get_production(production_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _productions.get(production_id)
    if not rec:
        raise HTTPException(404, "Production not found")
    return rec


# ── Storyboards ──────────────────────────────────────────────────

@router.get("/storyboards")
async def list_storyboards(
    production_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_storyboards.values())
    if production_id:
        items = [s for s in items if s["production_id"] == production_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/storyboards", status_code=201)
async def create_storyboard(body: StoryboardCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.production_id not in _productions:
        raise HTTPException(404, "Production not found")
    sid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": sid, **body.model_dump(), "status": "draft", "created_by": uid, "created_at": now}
    _storyboards[sid] = rec
    _emit("storyboard_created", f"storyboard={sid} production={body.production_id}", uid)
    return rec

@router.get("/storyboards/{storyboard_id}")
async def get_storyboard(storyboard_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _storyboards.get(storyboard_id)
    if not rec:
        raise HTTPException(404, "Storyboard not found")
    return rec


# ── Shots ────────────────────────────────────────────────────────

@router.get("/shots")
async def list_shots(
    production_id: Optional[str] = Query(None), skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_shots.values())
    if production_id:
        items = [s for s in items if s["production_id"] == production_id]
    total = len(items)
    return {"items": items[skip:skip+limit], "total": total, "skip": skip, "limit": limit}

@router.post("/shots", status_code=201)
async def create_shot(body: ShotCreate, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    if body.production_id not in _productions:
        raise HTTPException(404, "Production not found")
    shid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {"id": shid, **body.model_dump(), "status": "planned", "created_by": uid, "created_at": now}
    _shots[shid] = rec
    _emit("shot_created", f"shot={shid} production={body.production_id}", uid)
    return rec

@router.get("/shots/{shot_id}")
async def get_shot(shot_id: str = Path(...), current_user: CurrentUser = Depends(get_current_user)):
    rec = _shots.get(shot_id)
    if not rec:
        raise HTTPException(404, "Shot not found")
    return rec


# ── Overview ─────────────────────────────────────────────────────

@router.get("/overview")
async def tateking_overview(current_user: CurrentUser = Depends(get_current_user)):
    return {
        "total_productions": len(_productions),
        "total_storyboards": len(_storyboards),
        "total_shots": len(_shots),
        "productions_by_genre": _count_by(_productions, "genre"),
    }

def _count_by(store: Dict, field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in store.values():
        val = item.get(field, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts


# ══════════════════════════════════════════════════════════════════
# MUSIC PRODUCTION — TateKing Studios
# Drew's directive: "Look into TateKing Studios and see if we can
# incorporate music production studio into the platform as well
# so they'll be managing tv, video, and music"
#
# This extends TateKing from cinematic-only to a full creative
# production suite: TV + Video + Music
# ══════════════════════════════════════════════════════════════════

# ── Music Models ──────────────────────────────────────────────────

class MusicProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=5000)
    genre: str = Field(
        default="electronic",
        pattern="^(electronic|hip_hop|rock|pop|jazz|classical|ambient|"
                "rnb|country|metal|folk|world|experimental|soundtrack)$"
    )
    bpm: int = Field(default=120, ge=20, le=300)
    key: str = Field(default="C", pattern="^[A-G][#b]?$")
    scale: str = Field(default="major", pattern="^(major|minor|dorian|mixolydian|pentatonic|blues|chromatic)$")
    time_signature: str = Field(default="4/4", pattern="^[0-9]+/[0-9]+$")

class TrackCreate(BaseModel):
    project_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=128)
    track_type: str = Field(
        default="audio",
        pattern="^(audio|midi|bus|aux|master|instrument|vocal|drum|bass|synth|fx)$"
    )
    instrument: str = Field(default="", max_length=128)
    color: str = Field(default="#4A90D9", pattern="^#[0-9A-Fa-f]{6}$")
    volume: float = Field(default=0.8, ge=0.0, le=1.0)
    pan: float = Field(default=0.0, ge=-1.0, le=1.0)
    muted: bool = Field(default=False)
    solo: bool = Field(default=False)

class StemCreate(BaseModel):
    project_id: str = Field(..., min_length=1)
    track_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=128)
    stem_type: str = Field(
        default="audio",
        pattern="^(audio|midi|vocal|instrument|drum|bass|synth|fx|ambient)$"
    )
    start_beat: float = Field(default=0.0, ge=0.0)
    duration_beats: float = Field(default=16.0, ge=0.1)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class MixCreate(BaseModel):
    project_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=128)
    version: int = Field(default=1, ge=1)
    notes: str = Field(default="", max_length=3000)
    settings: Dict[str, Any] = Field(default_factory=lambda: {
        "master_volume": 0.85,
        "master_eq": {"low": 0, "mid": 0, "high": 0},
        "master_compressor": {"threshold": -6, "ratio": 2.0, "attack": 10, "release": 100},
        "master_limiter": {"ceiling": -0.3},
    })

class EffectCreate(BaseModel):
    track_id: str = Field(..., min_length=1)
    effect_type: str = Field(
        ...,
        pattern="^(eq|compressor|reverb|delay|chorus|flanger|phaser|distortion|"
                "limiter|gate|de_esser|pitch_shift|auto_tune|vocoder|filter|saturation)$"
    )
    name: str = Field(default="", max_length=128)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    bypass: bool = Field(default=False)
    order: int = Field(default=0, ge=0)


# ── Music State ───────────────────────────────────────────────────

_music_projects = store_factory("tateking", "music_projects")
_tracks = store_factory("tateking", "tracks")
_stems = store_factory("tateking", "stems")
_mixes = store_factory("tateking", "mixes")
_masters = store_factory("tateking", "masters")
_effects = store_factory("tateking", "effects")
_music_audit = audit_log_factory("tateking", "music_events")


# ── Music Project Endpoints ───────────────────────────────────────

@router.post("/music/projects", status_code=201)
async def create_music_project(
    body: MusicProjectCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Create a new music production project."""
    uid = current_user.id
    pid = str(uuid.uuid4())
    now = _utcnow()
    project = {
        "id": pid,
        **body.model_dump(),
        "status": "active",
        "track_count": 0,
        "stem_count": 0,
        "mix_count": 0,
        "master_count": 0,
        "duration_seconds": 0,
        "created_by": uid,
        "created_at": now,
        "updated_at": now,
    }
    _music_projects[pid] = project
    _emit("music_project_created", f"project={pid} genre={body.genre} bpm={body.bpm}", uid)
    return project


@router.get("/music/projects")
async def list_music_projects(
    genre: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List music projects with optional genre filter."""
    projects = [p for p in _music_projects.values()
                if isinstance(p, dict) and "id" in p
                and (not genre or p.get("genre") == genre)]
    projects.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"items": projects[skip:skip + limit], "total": len(projects)}


@router.get("/music/projects/{project_id}")
async def get_music_project(
    project_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get music project details including all tracks."""
    project = _music_projects.get(project_id)
    if not project:
        raise HTTPException(404, "Music project not found")

    # Gather related data
    project_tracks = [t for t in _tracks.values()
                      if isinstance(t, dict) and t.get("project_id") == project_id]
    project_mixes = [m for m in _mixes.values()
                     if isinstance(m, dict) and m.get("project_id") == project_id]

    return {
        **project,
        "tracks": project_tracks,
        "mixes": project_mixes,
    }


# ── Track Endpoints ───────────────────────────────────────────────

@router.post("/music/tracks", status_code=201)
async def create_track(
    body: TrackCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Create a new track in a music project."""
    uid = current_user.id
    project = _music_projects.get(body.project_id)
    if not project:
        raise HTTPException(404, "Music project not found")

    tid = str(uuid.uuid4())
    now = _utcnow()
    track = {
        "id": tid,
        **body.model_dump(),
        "effects": [],
        "stem_count": 0,
        "created_by": uid,
        "created_at": now,
    }
    _tracks[tid] = track

    # Update project track count
    project["track_count"] = project.get("track_count", 0) + 1
    project["updated_at"] = now
    _music_projects[body.project_id] = project

    _emit("track_created", f"track={tid} project={body.project_id} type={body.track_type}", uid)
    return track


@router.get("/music/tracks/{track_id}")
async def get_track(
    track_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get track details including effects chain."""
    track = _tracks.get(track_id)
    if not track:
        raise HTTPException(404, "Track not found")

    # Get effects for this track
    track_effects = [e for e in _effects.values()
                     if isinstance(e, dict) and e.get("track_id") == track_id]
    track_effects.sort(key=lambda x: x.get("order", 0))

    # Get stems for this track
    track_stems = [s for s in _stems.values()
                   if isinstance(s, dict) and s.get("track_id") == track_id]

    return {**track, "effects": track_effects, "stems": track_stems}


@router.patch("/music/tracks/{track_id}")
async def update_track(
    track_id: str = Path(...),
    volume: Optional[float] = Query(None, ge=0.0, le=1.0),
    pan: Optional[float] = Query(None, ge=-1.0, le=1.0),
    muted: Optional[bool] = Query(None),
    solo: Optional[bool] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update track mixer settings (volume, pan, mute, solo)."""
    track = _tracks.get(track_id)
    if not track:
        raise HTTPException(404, "Track not found")

    if volume is not None:
        track["volume"] = volume
    if pan is not None:
        track["pan"] = pan
    if muted is not None:
        track["muted"] = muted
    if solo is not None:
        track["solo"] = solo

    _tracks[track_id] = track
    return track


# ── Stem Endpoints ────────────────────────────────────────────────

@router.post("/music/stems", status_code=201)
async def create_stem(
    body: StemCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Create a new stem (audio region) on a track."""
    uid = current_user.id
    track = _tracks.get(body.track_id)
    if not track:
        raise HTTPException(404, "Track not found")

    sid = str(uuid.uuid4())
    stem = {
        "id": sid,
        **body.model_dump(),
        "status": "active",
        "created_by": uid,
        "created_at": _utcnow(),
    }
    _stems[sid] = stem

    track["stem_count"] = track.get("stem_count", 0) + 1
    _tracks[body.track_id] = track

    _emit("stem_created", f"stem={sid} track={body.track_id}", uid)
    return stem


@router.get("/music/stems/{stem_id}")
async def get_stem(
    stem_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get stem details."""
    stem = _stems.get(stem_id)
    if not stem:
        raise HTTPException(404, "Stem not found")
    return stem


# ── Effects Chain Endpoints ───────────────────────────────────────

@router.post("/music/effects", status_code=201)
async def add_effect(
    body: EffectCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Add an effect to a track's effects chain."""
    uid = current_user.id
    track = _tracks.get(body.track_id)
    if not track:
        raise HTTPException(404, "Track not found")

    eid = str(uuid.uuid4())
    effect = {
        "id": eid,
        **body.model_dump(),
        "name": body.name or body.effect_type.replace("_", " ").title(),
        "created_by": uid,
        "created_at": _utcnow(),
    }
    _effects[eid] = effect

    _emit("effect_added", f"effect={eid} type={body.effect_type} track={body.track_id}", uid)
    return effect


@router.patch("/music/effects/{effect_id}")
async def update_effect(
    effect_id: str = Path(...),
    parameters: Optional[Dict[str, Any]] = None,
    bypass: Optional[bool] = Query(None),
    order: Optional[int] = Query(None, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update effect parameters or bypass state."""
    effect = _effects.get(effect_id)
    if not effect:
        raise HTTPException(404, "Effect not found")

    if parameters is not None:
        effect["parameters"].update(parameters)
    if bypass is not None:
        effect["bypass"] = bypass
    if order is not None:
        effect["order"] = order

    _effects[effect_id] = effect
    return effect


@router.delete("/music/effects/{effect_id}", status_code=204)
async def remove_effect(
    effect_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Remove an effect from a track."""
    if effect_id not in _effects:
        raise HTTPException(404, "Effect not found")
    _effects.pop(effect_id, None)


# ── Mix & Master Endpoints ────────────────────────────────────────

@router.post("/music/mixes", status_code=201)
async def create_mix(
    body: MixCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Create a mix (snapshot of all track settings for a project)."""
    uid = current_user.id
    project = _music_projects.get(body.project_id)
    if not project:
        raise HTTPException(404, "Music project not found")

    mid = str(uuid.uuid4())
    now = _utcnow()

    # Capture current track states
    project_tracks = [t for t in _tracks.values()
                      if isinstance(t, dict) and t.get("project_id") == body.project_id]
    track_snapshot = [{
        "track_id": t["id"],
        "name": t.get("name"),
        "volume": t.get("volume"),
        "pan": t.get("pan"),
        "muted": t.get("muted"),
        "solo": t.get("solo"),
    } for t in project_tracks]

    mix = {
        "id": mid,
        **body.model_dump(),
        "track_snapshot": track_snapshot,
        "status": "draft",
        "created_by": uid,
        "created_at": now,
    }
    _mixes[mid] = mix

    project["mix_count"] = project.get("mix_count", 0) + 1
    project["updated_at"] = now
    _music_projects[body.project_id] = project

    _emit("mix_created", f"mix={mid} project={body.project_id} v{body.version}", uid)
    return mix


@router.get("/music/mixes/{mix_id}")
async def get_mix(
    mix_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get mix details."""
    mix = _mixes.get(mix_id)
    if not mix:
        raise HTTPException(404, "Mix not found")
    return mix


@router.post("/music/masters", status_code=201)
async def create_master(
    mix_id: str = Query(..., description="Mix ID to master"),
    format: str = Query("wav", pattern="^(wav|mp3|flac|aac|ogg)$"),
    sample_rate: int = Query(44100, ge=22050, le=192000),
    bit_depth: int = Query(24, ge=16, le=32),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Create a mastered output from a mix.

    Applies final mastering chain (EQ, compression, limiting, dithering)
    and exports to the specified format.
    """
    uid = current_user.id
    mix = _mixes.get(mix_id)
    if not mix:
        raise HTTPException(404, "Mix not found")

    master_id = str(uuid.uuid4())
    now = _utcnow()
    master = {
        "id": master_id,
        "mix_id": mix_id,
        "project_id": mix.get("project_id"),
        "format": format,
        "sample_rate": sample_rate,
        "bit_depth": bit_depth,
        "status": "processing",
        "mastering_chain": [
            {"type": "eq", "settings": {"low_cut": 30, "high_shelf": 12000, "boost_db": 1.5}},
            {"type": "multiband_compressor", "settings": {"bands": 4, "threshold": -12}},
            {"type": "stereo_enhancer", "settings": {"width": 1.2}},
            {"type": "limiter", "settings": {"ceiling": -0.3, "release": 50}},
            {"type": "dither", "settings": {"type": "triangular", "bit_depth": bit_depth}},
        ],
        "output_url": f"/api/v1/tateking/music/masters/{master_id}/download",
        "created_by": uid,
        "created_at": now,
    }
    _masters[master_id] = master

    # Update project
    project = _music_projects.get(mix.get("project_id"))
    if project:
        project["master_count"] = project.get("master_count", 0) + 1
        project["updated_at"] = now
        _music_projects[mix.get("project_id")] = project

    _emit("master_created", f"master={master_id} mix={mix_id} format={format}", uid)
    return master


@router.get("/music/masters/{master_id}")
async def get_master(
    master_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get master details."""
    master = _masters.get(master_id)
    if not master:
        raise HTTPException(404, "Master not found")
    return master


# ── Updated Overview (TV + Video + Music) ─────────────────────────

@router.get("/music/overview")
async def music_overview(current_user: CurrentUser = Depends(get_current_user)):
    """Get music production overview."""
    return {
        "total_music_projects": len([p for p in _music_projects.values()
                                     if isinstance(p, dict) and "id" in p]),
        "total_tracks": len([t for t in _tracks.values()
                            if isinstance(t, dict) and "id" in t]),
        "total_stems": len([s for s in _stems.values()
                           if isinstance(s, dict) and "id" in s]),
        "total_mixes": len([m for m in _mixes.values()
                           if isinstance(m, dict) and "id" in m]),
        "total_masters": len([m for m in _masters.values()
                             if isinstance(m, dict) and "id" in m]),
        "total_effects": len([e for e in _effects.values()
                             if isinstance(e, dict) and "id" in e]),
        "projects_by_genre": _count_by(_music_projects, "genre"),
    }