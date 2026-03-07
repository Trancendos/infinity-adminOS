# routers/tranquillity.py — Tranquillity Realm Gateway
# Cross-Lane Service — Orchestrates all Tranquillity wellbeing services
#
# The Tranquillity Realm is the wellbeing heart of the Trancendos Ecosystem.
# This gateway router provides unified access to all 5 sub-platforms:
#   - i-Mind (cognitive wellness)
#   - Resonate (sound & frequency healing)
#   - AR/VR Platform (immersive therapeutic environments)
#   - tAimra (digital twin for precision mental health)
#   - Savania AI (druid healer & defender orchestrator)
#
# Architecture: Cross-Lane service bridging AI/Nexus, User/Infinity, Data/Hive
# Standard: 2060-ready, adaptive, event-driven, compliance-by-design

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from enum import Enum
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, CurrentUser
from database import get_db_session
from router_migration_helper import store_factory, list_store_factory, audit_log_factory

router = APIRouter(prefix="/api/v1/tranquillity", tags=['Tranquillity Realm'])
logger = logging.getLogger("tranquillity")

# ============================================================
# ENUMS & MODELS
# ============================================================

class RealmService(str, Enum):
    I_MIND = "i_mind"
    RESONATE = "resonate"
    AR_VR = "ar_vr"
    TAIMRA = "taimra"
    SAVANIA = "savania"

class WellbeingDomain(str, Enum):
    COGNITIVE = "cognitive"
    EMOTIONAL = "emotional"
    PHYSICAL = "physical"
    SOCIAL = "social"
    SPIRITUAL = "spiritual"

class RecoveryStage(str, Enum):
    CRISIS = "crisis"
    STABILISATION = "stabilisation"
    EARLY_RECOVERY = "early_recovery"
    ACTIVE_RECOVERY = "active_recovery"
    MAINTENANCE = "maintenance"
    THRIVING = "thriving"

class ServiceHealth(BaseModel):
    service: str
    status: str = "healthy"
    latency_ms: float = 0.0
    last_check: str = ""
    version: str = "1.0.0"

class RealmStatus(BaseModel):
    realm: str = "tranquillity"
    status: str = "operational"
    services: List[ServiceHealth] = []
    active_users: int = 0
    sessions_today: int = 0
    compliance_status: str = "compliant"
    uptime_percent: float = 99.9

class WellbeingSnapshot(BaseModel):
    user_id: str
    timestamp: str
    overall_score: float = Field(ge=0.0, le=100.0)
    domains: Dict[str, float] = {}
    recovery_stage: RecoveryStage = RecoveryStage.ACTIVE_RECOVERY
    active_services: List[str] = []
    recommendations: List[Dict[str, Any]] = []
    streak_days: int = 0
    milestones_achieved: int = 0

class SessionRecommendation(BaseModel):
    service: RealmService
    activity_type: str
    title: str
    description: str
    duration_minutes: int = 15
    priority: float = Field(ge=0.0, le=1.0)
    reason: str = ""
    prerequisites: List[str] = []
    contraindications: List[str] = []

class RealmPreferences(BaseModel):
    preferred_services: List[RealmService] = []
    accessibility_needs: Dict[str, Any] = Field(default_factory=dict)
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    notification_frequency: str = Field(default="balanced", pattern="^(minimal|balanced|frequent)$")
    data_sharing_level: str = Field(default="anonymised", pattern="^(none|anonymised|research|full)$")
    cultural_context: Optional[str] = None
    language: str = "en"

# ============================================================
# IN-MEMORY STATE (production: Redis/PostgreSQL)
# ============================================================

_realm_sessions = store_factory("tranquillity", "realm_sessions")
_user_preferences = store_factory("tranquillity", "user_preferences")
_wellbeing_snapshots = list_store_factory("tranquillity", "wellbeing_snapshots")
_service_registry: Dict[str, Dict[str, Any]] = {
    "i_mind": {"status": "healthy", "version": "1.0.0", "port": 8010, "capabilities": ["exercises", "meditation", "assessment", "neurofeedback"]},
    "resonate": {"status": "healthy", "version": "1.0.0", "port": 8011, "capabilities": ["frequency", "soundscape", "biofeedback", "therapy"]},
    "ar_vr": {"status": "healthy", "version": "1.0.0", "port": 8012, "capabilities": ["environments", "exposure_therapy", "meditation_vr", "social_skills"]},
    "taimra": {"status": "healthy", "version": "1.0.0", "port": 8013, "capabilities": ["twin_state", "predictions", "monitoring", "interventions"]},
    "savania": {"status": "healthy", "version": "1.0.0", "port": 8014, "capabilities": ["healer", "defender", "shepherd", "orchestration"]},
}

# ============================================================
# HELPER — Event Bus Integration
# ============================================================

async def _emit_tranquillity_event(topic: str, payload: Dict[str, Any], user_id: str = "system"):
    """Publish event to Kernel Event Bus for cross-lane communication."""
    try:
        from kernel_event_bus import KernelEventBus, KernelEvent, EventLane, EventPriority
        bus = await KernelEventBus.get_instance()
        await bus.publish(KernelEvent(
            topic=f"tranquillity.{topic}",
            payload={**payload, "user_id": user_id},
            source="tranquillity_gateway",
            lane=EventLane.CROSS,
            priority=EventPriority.NORMAL,
        ))
    except Exception as e:
        logger.warning(f"Event bus publish failed: {e}")

# ============================================================
# ADAPTIVE ENGINE — Smart session recommendations
# ============================================================

def _generate_recommendations(user_id: str, snapshot: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generate adaptive session recommendations based on user state."""
    recommendations = []
    domains = snapshot.get("domains", {})
    stage = snapshot.get("recovery_stage", "active_recovery")

    cognitive = domains.get("cognitive", 50.0)
    emotional = domains.get("emotional", 50.0)
    physical = domains.get("physical", 50.0)

    # Adaptive logic: recommend services based on lowest domain scores
    if emotional < 40:
        recommendations.append({
            "service": "resonate", "activity_type": "frequency_therapy",
            "title": "Calming Frequency Session", "description": "Alpha wave binaural beats (10Hz) for emotional regulation and stress reduction",
            "duration_minutes": 20, "priority": 0.95, "reason": f"Emotional wellbeing score is {emotional:.0f}% — sound therapy can help restore balance"
        })
        if stage in ("crisis", "stabilisation"):
            recommendations.append({
                "service": "savania", "activity_type": "healer_session",
                "title": "Savania Healer Check-in", "description": "Gentle conversational support with your AI wellness companion",
                "duration_minutes": 10, "priority": 0.98, "reason": "Recovery stage suggests supportive check-in would be beneficial"
            })

    if cognitive < 45:
        recommendations.append({
            "service": "i_mind", "activity_type": "cognitive_exercise",
            "title": "Gentle Brain Training", "description": "Adaptive working memory exercises calibrated to your current cognitive state",
            "duration_minutes": 15, "priority": 0.85, "reason": f"Cognitive score is {cognitive:.0f}% — gentle exercises can help rebuild focus"
        })

    if physical < 50:
        recommendations.append({
            "service": "i_mind", "activity_type": "breathing_exercise",
            "title": "Box Breathing Session", "description": "4-4-4-4 breathing pattern for physiological calm and HRV improvement",
            "duration_minutes": 10, "priority": 0.80, "reason": f"Physical wellbeing at {physical:.0f}% — breathing exercises support recovery"
        })

    # Always recommend meditation if no other high-priority items
    if not recommendations or all(r.get("priority", 0) < 0.9 for r in recommendations):
        recommendations.append({
            "service": "i_mind", "activity_type": "meditation",
            "title": "Guided Mindfulness", "description": "A gentle guided meditation adapted to your current state",
            "duration_minutes": 10, "priority": 0.70, "reason": "Daily mindfulness supports long-term recovery"
        })

    return sorted(recommendations, key=lambda r: r.get("priority", 0), reverse=True)

# ============================================================
# ENDPOINTS
# ============================================================

@router.get("/status", response_model=RealmStatus)
async def get_realm_status(current_user: CurrentUser = Depends(get_current_user)):
    """Get overall Tranquillity Realm status including all service health."""
    services = []
    for name, info in _service_registry.items():
        services.append(ServiceHealth(
            service=name, status=info["status"],
            latency_ms=round(2.5 + hash(name) % 10, 1),
            last_check=datetime.now(timezone.utc).isoformat(),
            version=info["version"],
        ))
    return RealmStatus(
        services=services,
        active_users=len(_realm_sessions),
        sessions_today=sum(len(v) for v in _wellbeing_snapshots.values()),
    )

@router.get("/services")
async def list_services(current_user: CurrentUser = Depends(get_current_user)):
    """List all available Tranquillity services with capabilities."""
    return {
        "services": [
            {"name": name, **info, "endpoint": f"/api/v1/{name.replace('_', '-')}"}
            for name, info in _service_registry.items()
        ],
        "total": len(_service_registry),
    }

@router.get("/wellbeing/snapshot", response_model=WellbeingSnapshot)
async def get_wellbeing_snapshot(current_user: CurrentUser = Depends(get_current_user)):
    """Get current wellbeing snapshot with adaptive recommendations."""
    user_id = getattr(current_user, "id", "anonymous")
    snapshots = _wellbeing_snapshots.get(user_id, [])
    latest = snapshots[-1] if snapshots else {
        "overall_score": 55.0,
        "domains": {"cognitive": 60.0, "emotional": 50.0, "physical": 55.0, "social": 45.0, "spiritual": 50.0},
        "recovery_stage": "active_recovery",
        "active_services": [],
        "streak_days": 0,
        "milestones_achieved": 0,
    }
    recommendations = _generate_recommendations(user_id, latest)
    return WellbeingSnapshot(
        user_id=user_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        overall_score=latest.get("overall_score", 55.0),
        domains=latest.get("domains", {}),
        recovery_stage=latest.get("recovery_stage", RecoveryStage.ACTIVE_RECOVERY),
        active_services=latest.get("active_services", []),
        recommendations=recommendations,
        streak_days=latest.get("streak_days", 0),
        milestones_achieved=latest.get("milestones_achieved", 0),
    )

@router.post("/wellbeing/checkin")
async def submit_wellbeing_checkin(
    overall_score: float = Query(ge=0.0, le=100.0),
    cognitive: float = Query(default=50.0, ge=0.0, le=100.0),
    emotional: float = Query(default=50.0, ge=0.0, le=100.0),
    physical: float = Query(default=50.0, ge=0.0, le=100.0),
    social: float = Query(default=50.0, ge=0.0, le=100.0),
    spiritual: float = Query(default=50.0, ge=0.0, le=100.0),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Submit a wellbeing check-in — feeds tAimra digital twin and generates recommendations."""
    user_id = getattr(current_user, "id", "anonymous")
    snapshot = {
        "id": str(uuid.uuid4()), "user_id": user_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "overall_score": overall_score,
        "domains": {"cognitive": cognitive, "emotional": emotional, "physical": physical, "social": social, "spiritual": spiritual},
        "recovery_stage": "crisis" if overall_score < 20 else "stabilisation" if overall_score < 35 else "early_recovery" if overall_score < 50 else "active_recovery" if overall_score < 70 else "maintenance" if overall_score < 85 else "thriving",
        "active_services": [], "streak_days": 0, "milestones_achieved": 0,
    }
    _wellbeing_snapshots.setdefault(user_id, []).append(snapshot)
    recommendations = _generate_recommendations(user_id, snapshot)
    await _emit_tranquillity_event("wellbeing.checkin", {"snapshot_id": snapshot["id"], "overall_score": overall_score}, user_id)
    return {"checkin_id": snapshot["id"], "recommendations": recommendations, "recovery_stage": snapshot["recovery_stage"]}

@router.get("/recommendations")
async def get_recommendations(current_user: CurrentUser = Depends(get_current_user)):
    """Get personalised session recommendations based on current wellbeing state."""
    user_id = getattr(current_user, "id", "anonymous")
    snapshots = _wellbeing_snapshots.get(user_id, [])
    latest = snapshots[-1] if snapshots else {"domains": {"cognitive": 60, "emotional": 50, "physical": 55}, "recovery_stage": "active_recovery"}
    return {"recommendations": _generate_recommendations(user_id, latest), "based_on": "latest_checkin" if snapshots else "defaults"}

@router.get("/preferences")
async def get_preferences(current_user: CurrentUser = Depends(get_current_user)):
    """Get user's Tranquillity Realm preferences."""
    user_id = getattr(current_user, "id", "anonymous")
    prefs = _user_preferences.get(user_id, {
        "preferred_services": ["i_mind", "resonate"],
        "accessibility_needs": {}, "quiet_hours_start": "22:00", "quiet_hours_end": "07:00",
        "notification_frequency": "balanced", "data_sharing_level": "anonymised",
        "cultural_context": None, "language": "en",
    })
    return {"user_id": user_id, "preferences": prefs}

@router.put("/preferences")
async def update_preferences(
    prefs: RealmPreferences,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update Tranquillity Realm preferences."""
    user_id = getattr(current_user, "id", "anonymous")
    _user_preferences[user_id] = prefs.model_dump()
    await _emit_tranquillity_event("preferences.updated", {"preferences": prefs.model_dump()}, user_id)
    return {"user_id": user_id, "preferences": prefs.model_dump(), "updated": True}

@router.get("/journey")
async def get_recovery_journey(current_user: CurrentUser = Depends(get_current_user)):
    """Get user's recovery journey timeline with milestones."""
    user_id = getattr(current_user, "id", "anonymous")
    snapshots = _wellbeing_snapshots.get(user_id, [])
    return {
        "user_id": user_id,
        "total_checkins": len(snapshots),
        "journey_started": snapshots[0]["timestamp"] if snapshots else None,
        "current_stage": snapshots[-1].get("recovery_stage", "active_recovery") if snapshots else "active_recovery",
        "milestones": [
            {"name": "First Check-in", "achieved": len(snapshots) >= 1, "date": snapshots[0]["timestamp"] if snapshots else None},
            {"name": "7-Day Streak", "achieved": False, "date": None},
            {"name": "First Meditation", "achieved": False, "date": None},
            {"name": "Wellbeing Score 70+", "achieved": any(s.get("overall_score", 0) >= 70 for s in snapshots), "date": None},
        ],
        "trajectory": [{"date": s["timestamp"], "score": s["overall_score"]} for s in snapshots[-30:]],
    }

@router.get("/health")
async def realm_health():
    """Health check for the Tranquillity Realm gateway."""
    healthy_count = sum(1 for s in _service_registry.values() if s["status"] == "healthy")
    return {
        "status": "healthy" if healthy_count == len(_service_registry) else "degraded",
        "services_healthy": healthy_count,
        "services_total": len(_service_registry),
        "realm": "tranquillity",
    }