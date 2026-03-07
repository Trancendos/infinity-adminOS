# routers/solarscene.py — SolarScene (Unified Search Engine)
# ═══════════════════════════════════════════════════════════════
# Ecosystem Location: SolarScene — Cross-Lane Search & Discovery
# AI Character: Solar (Search Intelligence & Discovery Agent)
# Underlying Service: search.py — Platform Search
#
# SolarScene provides branded ecosystem endpoints for unified
# cross-lane search, semantic indexing, search analytics, and
# 2060-compliant content discovery with AI-augmented ranking.
# ═══════════════════════════════════════════════════════════════

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/solarscene", tags=["SolarScene — Search & Discovery"])
logger = logging.getLogger("solarscene")

# ── In-Memory State ──────────────────────────────────────────

_search_indices: Dict[str, dict] = {}
_saved_searches: Dict[str, dict] = {}
_search_history: List[dict] = []


# ── Models ───────────────────────────────────────────────────

class SearchIndex(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    source_lane: str = Field(default="cross_lane", pattern="^(lane1_ai|lane2_user|lane3_data|cross_lane)$")
    index_type: str = Field(default="full_text", pattern="^(full_text|semantic|vector|hybrid)$")
    content_types: List[str] = Field(default_factory=lambda: ["all"])
    embedding_model: Optional[str] = Field(default="text-embedding-3-small")
    is_active: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SearchQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    scope: str = Field(default="all", pattern="^(all|articles|code|apps|data|users|threads|artifacts|characters)$")
    lane: Optional[str] = Field(None, pattern="^(lane1_ai|lane2_user|lane3_data|cross_lane)$")
    search_type: str = Field(default="hybrid", pattern="^(keyword|semantic|vector|hybrid)$")
    filters: Dict[str, Any] = Field(default_factory=dict)
    boost_fields: List[str] = Field(default_factory=list)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class SavedSearch(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    query: str = Field(..., min_length=1)
    scope: str = Field(default="all")
    filters: Dict[str, Any] = Field(default_factory=dict)
    alert_on_new: bool = False


# ── Helpers ──────────────────────────────────────────────────

def _emit(action: str, user_id: str, detail: str = ""):
    logger.info(f"[SolarScene] {action} by={user_id} {detail}")


def _mock_results(query: str, scope: str, limit: int) -> List[dict]:
    """Generate mock search results for demonstration."""
    return [
        {
            "id": str(uuid.uuid4()),
            "title": f"Result for '{query}' #{i+1}",
            "snippet": f"Matched content in {scope} scope...",
            "score": round(0.95 - (i * 0.05), 2),
            "source": scope if scope != "all" else "articles",
            "lane": "lane2_user",
            "url": f"/api/v1/{scope}/{uuid.uuid4()}",
            "highlighted": f"...{query}...",
        }
        for i in range(min(limit, 5))
    ]


# ── Search Indices ───────────────────────────────────────────

@router.post("/indices", status_code=201)
async def create_index(body: SearchIndex, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    iid = str(uuid.uuid4())
    record = {
        "id": iid, **body.model_dump(),
        "created_by": uid,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "document_count": 0,
        "last_indexed": None,
    }
    _search_indices[iid] = record
    _emit("index_created", uid, f"id={iid} type={body.index_type}")
    return record


@router.get("/indices")
async def list_indices(
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    items = list(_search_indices.values())
    return {"items": items[skip:skip + limit], "total": len(items), "skip": skip, "limit": limit}


@router.get("/indices/{index_id}")
async def get_index(index_id: str, current_user: CurrentUser = Depends(get_current_user)):
    idx = _search_indices.get(index_id)
    if not idx:
        raise HTTPException(404, "Search index not found")
    return idx


@router.post("/indices/{index_id}/reindex")
async def trigger_reindex(index_id: str, current_user: CurrentUser = Depends(get_current_user)):
    idx = _search_indices.get(index_id)
    if not idx:
        raise HTTPException(404, "Search index not found")
    uid = getattr(current_user, "id", "anonymous")
    idx["last_indexed"] = datetime.now(timezone.utc).isoformat()
    _emit("reindex_triggered", uid, f"index={index_id}")
    return {"status": "reindex_started", "index_id": index_id}


# ── Search ───────────────────────────────────────────────────

@router.post("/search")
async def execute_search(body: SearchQuery, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    results = _mock_results(body.query, body.scope, body.limit)
    # Record in history
    entry = {
        "id": str(uuid.uuid4()),
        "query": body.query,
        "scope": body.scope,
        "search_type": body.search_type,
        "result_count": len(results),
        "user_id": uid,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _search_history.append(entry)
    _emit("search_executed", uid, f"q='{body.query}' scope={body.scope} results={len(results)}")
    return {
        "query": body.query,
        "scope": body.scope,
        "search_type": body.search_type,
        "results": results,
        "total": len(results),
        "offset": body.offset,
        "limit": body.limit,
    }


# ── Saved Searches ───────────────────────────────────────────

@router.post("/saved-searches", status_code=201)
async def create_saved_search(body: SavedSearch, current_user: CurrentUser = Depends(get_current_user)):
    uid = getattr(current_user, "id", "anonymous")
    sid = str(uuid.uuid4())
    record = {"id": sid, **body.model_dump(), "created_by": uid, "created_at": datetime.now(timezone.utc).isoformat(), "run_count": 0}
    _saved_searches[sid] = record
    _emit("saved_search_created", uid, f"id={sid}")
    return record


@router.get("/saved-searches")
async def list_saved_searches(
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    uid = getattr(current_user, "id", "anonymous")
    items = [s for s in _saved_searches.values() if s.get("created_by") == uid]
    return {"items": items[skip:skip + limit], "total": len(items), "skip": skip, "limit": limit}


@router.delete("/saved-searches/{search_id}", status_code=204)
async def delete_saved_search(search_id: str, current_user: CurrentUser = Depends(get_current_user)):
    if search_id not in _saved_searches:
        raise HTTPException(404, "Saved search not found")
    del _saved_searches[search_id]
    return None


# ── Search Analytics ─────────────────────────────────────────

@router.get("/analytics")
async def search_analytics(current_user: CurrentUser = Depends(get_current_user)):
    total_searches = len(_search_history)
    unique_queries = len(set(h.get("query", "") for h in _search_history))
    scope_breakdown = {}
    for h in _search_history:
        scope = h.get("scope", "all")
        scope_breakdown[scope] = scope_breakdown.get(scope, 0) + 1
    return {
        "total_searches": total_searches,
        "unique_queries": unique_queries,
        "scope_breakdown": scope_breakdown,
        "recent_searches": _search_history[-10:] if _search_history else [],
    }


# ── Overview ─────────────────────────────────────────────────

@router.get("/overview")
async def overview(current_user: CurrentUser = Depends(get_current_user)):
    active_indices = sum(1 for i in _search_indices.values() if i.get("is_active"))
    return {
        "location": "SolarScene",
        "character": "Solar",
        "total_indices": len(_search_indices),
        "active_indices": active_indices,
        "total_saved_searches": len(_saved_searches),
        "total_searches_executed": len(_search_history),
    }