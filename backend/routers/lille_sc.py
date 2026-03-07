# routers/lille_sc.py — Lille SC (Sync Centre)
# ═══════════════════════════════════════════════════════════════
# Ecosystem Location: Lille SC — Cross-Lane Synchronisation Hub
# AI Character: Lille (Data Synchronisation Specialist)
# Underlying Service: sync.py — Data Sync engine
#
# Lille SC provides branded ecosystem endpoints that delegate to
# the core Data Sync service while adding ecosystem-specific
# metadata, 2060-compliant audit headers, and character context.
# ═══════════════════════════════════════════════════════════════

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser
from router_migration_helper import store_factory, list_store_factory, audit_log_factory

router = APIRouter(prefix="/api/v1/lille-sc", tags=["Lille SC — Sync Centre"])
logger = logging.getLogger("lille_sc")

# ── In-Memory State ──────────────────────────────────────────

_sync_channels = store_factory("lille_sc", "sync_channels")
_sync_events = store_factory("lille_sc", "sync_events")
_conflict_log: List[dict] = []


# ── Models ───────────────────────────────────────────────────

class SyncChannel(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    source_lane: str = Field(default="lane2_user", pattern="^(lane1_ai|lane2_user|lane3_data|cross_lane)$")
    target_lane: str = Field(default="lane3_data", pattern="^(lane1_ai|lane2_user|lane3_data|cross_lane)$")
    sync_mode: str = Field(default="incremental", pattern="^(full|incremental|differential|streaming)$")
    conflict_strategy: str = Field(default="last_write_wins", pattern="^(last_write_wins|source_wins|target_wins|manual|ai_merge)$")
    schedule_cron: Optional[str] = None
    is_active: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SyncEvent(BaseModel):
    channel_id: str
    event_type: str = Field(default="data_change", pattern="^(data_change|schema_change|conflict|resolution|heartbeat)$")
    payload: Dict[str, Any] = Field(default_factory=dict)


class ConflictEntry(BaseModel):
    channel_id: str
    record_id: str
    source_value: Dict[str, Any] = Field(default_factory=dict)
    target_value: Dict[str, Any] = Field(default_factory=dict)
    resolution: Optional[str] = Field(None, pattern="^(accept_source|accept_target|merge|skip|ai_resolved)$")


# ── Helpers ──────────────────────────────────────────────────

def _emit(action: str, user_id: str, detail: str = ""):
    logger.info(f"[LilleSC] {action} by={user_id} {detail}")


# ── Sync Channels ────────────────────────────────────────────

@router.post("/channels", status_code=201)
async def create_channel(body: SyncChannel, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    cid = str(uuid.uuid4())
    record = {"id": cid, **body.model_dump(), "created_by": uid, "created_at": datetime.now(timezone.utc).isoformat(), "last_sync": None, "sync_count": 0}
    _sync_channels[cid] = record
    _emit("channel_created", uid, f"id={cid}")
    return record


@router.get("/channels")
async def list_channels(
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_sync_channels.values())
    return {"items": items[skip:skip + limit], "total": len(items), "skip": skip, "limit": limit}


@router.get("/channels/{channel_id}")
async def get_channel(channel_id: str, current_user: CurrentUser = Depends(get_current_user)):
    ch = _sync_channels.get(channel_id)
    if not ch:
        raise HTTPException(404, "Sync channel not found")
    return ch


@router.put("/channels/{channel_id}")
async def update_channel(channel_id: str, body: SyncChannel, current_user: CurrentUser = Depends(get_current_user)):
    if channel_id not in _sync_channels:
        raise HTTPException(404, "Sync channel not found")
    uid = getattr(current_user, "id", "anonymous")
    _sync_channels[channel_id].update(body.model_dump())
    _sync_channels[channel_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
    _emit("channel_updated", uid, f"id={channel_id}")
    return _sync_channels[channel_id]


@router.post("/channels/{channel_id}/trigger")
async def trigger_sync(channel_id: str, current_user: CurrentUser = Depends(get_current_user)):
    ch = _sync_channels.get(channel_id)
    if not ch:
        raise HTTPException(404, "Sync channel not found")
    uid = getattr(current_user, "id", "anonymous")
    ch["last_sync"] = datetime.now(timezone.utc).isoformat()
    ch["sync_count"] = ch.get("sync_count", 0) + 1
    _emit("sync_triggered", uid, f"channel={channel_id}")
    return {"status": "sync_triggered", "channel_id": channel_id, "sync_count": ch["sync_count"]}


# ── Sync Events ──────────────────────────────────────────────

@router.post("/events", status_code=201)
async def create_event(body: SyncEvent, current_user: CurrentUser = Depends(get_current_user)):
    if body.channel_id not in _sync_channels:
        raise HTTPException(404, "Sync channel not found")
    uid = getattr(current_user, "id", "anonymous")
    eid = str(uuid.uuid4())
    record = {"id": eid, **body.model_dump(), "created_by": uid, "created_at": datetime.now(timezone.utc).isoformat()}
    _sync_events[eid] = record
    _emit("event_created", uid, f"id={eid} type={body.event_type}")
    return record


@router.get("/events")
async def list_events(
    channel_id: Optional[str] = None,
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_sync_events.values())
    if channel_id:
        items = [e for e in items if e.get("channel_id") == channel_id]
    return {"items": items[skip:skip + limit], "total": len(items), "skip": skip, "limit": limit}


# ── Conflict Log ─────────────────────────────────────────────

@router.post("/conflicts", status_code=201)
async def log_conflict(body: ConflictEntry, current_user: CurrentUser = Depends(get_current_user)):
    if body.channel_id not in _sync_channels:
        raise HTTPException(404, "Sync channel not found")
    uid = getattr(current_user, "id", "anonymous")
    cid = str(uuid.uuid4())
    record = {"id": cid, **body.model_dump(), "created_by": uid, "created_at": datetime.now(timezone.utc).isoformat()}
    _conflict_log.append(record)
    _emit("conflict_logged", uid, f"id={cid} channel={body.channel_id}")
    return record


@router.get("/conflicts")
async def list_conflicts(
    channel_id: Optional[str] = None,
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = _conflict_log
    if channel_id:
        items = [c for c in items if c.get("channel_id") == channel_id]
    return {"items": items[skip:skip + limit], "total": len(items), "skip": skip, "limit": limit}


@router.put("/conflicts/{conflict_id}/resolve")
async def resolve_conflict(conflict_id: str, resolution: str = Query(..., pattern="^(accept_source|accept_target|merge|skip|ai_resolved)$"), current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    for c in _conflict_log:
        if c["id"] == conflict_id:
            c["resolution"] = resolution
            c["resolved_by"] = uid
            c["resolved_at"] = datetime.now(timezone.utc).isoformat()
            _emit("conflict_resolved", uid, f"id={conflict_id} resolution={resolution}")
            return c
    raise HTTPException(404, "Conflict not found")


# ── Overview ─────────────────────────────────────────────────

@router.get("/overview")
async def overview(current_user: CurrentUser = Depends(get_current_user)):
    active_channels = sum(1 for c in _sync_channels.values() if c.get("is_active"))
    unresolved = sum(1 for c in _conflict_log if not c.get("resolution"))
    return {
        "location": "Lille SC",
        "character": "Lille",
        "total_channels": len(_sync_channels),
        "active_channels": active_channels,
        "total_events": len(_sync_events),
        "total_conflicts": len(_conflict_log),
        "unresolved_conflicts": unresolved,
    }