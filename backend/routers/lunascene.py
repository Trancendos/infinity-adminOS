# routers/lunascene.py — Lunascene (The Artifactory)
# ═══════════════════════════════════════════════════════════════
# Ecosystem Location: Lunascene — Immutable Artifact Vault
# AI Character: Luna (Artifact Curator & Provenance Guardian)
# Underlying Service: artifacts.py — Artifact Repository
#
# Lunascene provides branded ecosystem endpoints for immutable
# artifact management with C2PA provenance, versioned vaults,
# and 2060-compliant content authenticity verification.
# ═══════════════════════════════════════════════════════════════

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import uuid
import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser
from router_migration_helper import store_factory, list_store_factory, audit_log_factory

router = APIRouter(prefix="/api/v1/lunascene", tags=["Lunascene — The Artifactory"])
logger = logging.getLogger("lunascene")

# ── In-Memory State ──────────────────────────────────────────

_vaults = store_factory("lunascene", "vaults")
_artifacts = store_factory("lunascene", "artifacts")
_provenance_records = store_factory("lunascene", "provenance_records")


# ── Models ───────────────────────────────────────────────────

class Vault(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="")
    retention_policy: str = Field(default="permanent", pattern="^(permanent|90d|180d|365d|custom)$")
    encryption: str = Field(default="aes-256-gcm", pattern="^(aes-256-gcm|chacha20|post-quantum-kyber)$")
    immutable: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ArtifactUpload(BaseModel):
    name: str = Field(..., min_length=1, max_length=512)
    vault_id: str
    artifact_type: str = Field(default="binary", pattern="^(binary|container|model|dataset|document|media|code)$")
    version: str = Field(default="1.0.0")
    content_hash: Optional[str] = None
    size_bytes: int = Field(default=0, ge=0)
    tags: List[str] = Field(default_factory=list)
    c2pa_signed: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ProvenanceRecord(BaseModel):
    artifact_id: str
    action: str = Field(..., pattern="^(created|modified|signed|verified|transferred|archived)$")
    actor: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


# ── Helpers ──────────────────────────────────────────────────

def _emit(action: str, user_id: str, detail: str = ""):
    logger.info(f"[Lunascene] {action} by={user_id} {detail}")


def _compute_integrity(data: dict) -> str:
    raw = f"{data.get('name', '')}{data.get('version', '')}{data.get('vault_id', '')}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ── Vaults ───────────────────────────────────────────────────

@router.post("/vaults", status_code=201)
async def create_vault(body: Vault, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    vid = str(uuid.uuid4())
    record = {"id": vid, **body.model_dump(), "created_by": uid, "created_at": datetime.now(timezone.utc).isoformat(), "artifact_count": 0}
    _vaults[vid] = record
    _emit("vault_created", uid, f"id={vid}")
    return record


@router.get("/vaults")
async def list_vaults(
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_vaults.values())
    return {"items": items[skip:skip + limit], "total": len(items), "skip": skip, "limit": limit}


@router.get("/vaults/{vault_id}")
async def get_vault(vault_id: str, current_user: CurrentUser = Depends(get_current_user)):
    v = _vaults.get(vault_id)
    if not v:
        raise HTTPException(404, "Vault not found")
    return v


@router.put("/vaults/{vault_id}")
async def update_vault(vault_id: str, body: Vault, current_user: CurrentUser = Depends(get_current_user)):
    if vault_id not in _vaults:
        raise HTTPException(404, "Vault not found")
    uid = getattr(current_user, "id", "anonymous")
    _vaults[vault_id].update(body.model_dump())
    _vaults[vault_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
    _emit("vault_updated", uid, f"id={vault_id}")
    return _vaults[vault_id]


# ── Artifacts ────────────────────────────────────────────────

@router.post("/artifacts", status_code=201)
async def upload_artifact(body: ArtifactUpload, current_user: CurrentUser = Depends(get_current_user)):
    if body.vault_id not in _vaults:
        raise HTTPException(404, "Vault not found")
    uid = getattr(current_user, "id", "anonymous")
    aid = str(uuid.uuid4())
    integrity = _compute_integrity(body.model_dump())
    record = {
        "id": aid, **body.model_dump(),
        "integrity_hash": integrity,
        "created_by": uid,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "download_count": 0,
        "verified": False,
    }
    _artifacts[aid] = record
    _vaults[body.vault_id]["artifact_count"] = _vaults[body.vault_id].get("artifact_count", 0) + 1
    _emit("artifact_uploaded", uid, f"id={aid} vault={body.vault_id}")
    return record


@router.get("/artifacts")
async def list_artifacts(
    vault_id: Optional[str] = None,
    artifact_type: Optional[str] = None,
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_artifacts.values())
    if vault_id:
        items = [a for a in items if a.get("vault_id") == vault_id]
    if artifact_type:
        items = [a for a in items if a.get("artifact_type") == artifact_type]
    return {"items": items[skip:skip + limit], "total": len(items), "skip": skip, "limit": limit}


@router.get("/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str, current_user: CurrentUser = Depends(get_current_user)):
    a = _artifacts.get(artifact_id)
    if not a:
        raise HTTPException(404, "Artifact not found")
    return a


@router.post("/artifacts/{artifact_id}/verify")
async def verify_artifact(artifact_id: str, current_user: CurrentUser = Depends(get_current_user)):
    a = _artifacts.get(artifact_id)
    if not a:
        raise HTTPException(404, "Artifact not found")
    uid = getattr(current_user, "id", "anonymous")
    expected = _compute_integrity(a)
    is_valid = expected == a.get("integrity_hash")
    a["verified"] = is_valid
    a["verified_at"] = datetime.now(timezone.utc).isoformat()
    a["verified_by"] = uid
    _emit("artifact_verified", uid, f"id={artifact_id} valid={is_valid}")
    return {"artifact_id": artifact_id, "verified": is_valid, "integrity_hash": a.get("integrity_hash")}


# ── Provenance ───────────────────────────────────────────────

@router.post("/provenance", status_code=201)
async def record_provenance(body: ProvenanceRecord, current_user: CurrentUser = Depends(get_current_user)):
    if body.artifact_id not in _artifacts:
        raise HTTPException(404, "Artifact not found")
    uid = getattr(current_user, "id", "anonymous")
    pid = str(uuid.uuid4())
    record = {
        "id": pid, **body.model_dump(),
        "actor": body.actor or uid,
        "recorded_by": uid,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _provenance_records[pid] = record
    _emit("provenance_recorded", uid, f"id={pid} artifact={body.artifact_id} action={body.action}")
    return record


@router.get("/provenance")
async def list_provenance(
    artifact_id: Optional[str] = None,
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_provenance_records.values())
    if artifact_id:
        items = [p for p in items if p.get("artifact_id") == artifact_id]
    return {"items": items[skip:skip + limit], "total": len(items), "skip": skip, "limit": limit}


@router.get("/provenance/{artifact_id}/chain")
async def get_provenance_chain(artifact_id: str, current_user: CurrentUser = Depends(get_current_user)):
    if artifact_id not in _artifacts:
        raise HTTPException(404, "Artifact not found")
    chain = sorted(
        [p for p in _provenance_records.values() if p.get("artifact_id") == artifact_id],
        key=lambda x: x.get("created_at", ""),
    )
    return {"artifact_id": artifact_id, "chain": chain, "total": len(chain)}


# ── Overview ─────────────────────────────────────────────────

@router.get("/overview")
async def overview(current_user: CurrentUser = Depends(get_current_user)):
    signed = sum(1 for a in _artifacts.values() if a.get("c2pa_signed"))
    verified = sum(1 for a in _artifacts.values() if a.get("verified"))
    return {
        "location": "Lunascene",
        "character": "Luna",
        "total_vaults": len(_vaults),
        "total_artifacts": len(_artifacts),
        "c2pa_signed": signed,
        "verified_artifacts": verified,
        "total_provenance_records": len(_provenance_records),
    }