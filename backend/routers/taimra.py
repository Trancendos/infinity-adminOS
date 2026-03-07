# routers/taimra.py — tAimra Digital Twin Gateway
# Lane 3 (Data/Hive) — Precision mental health digital twin, predictive analytics,
# biomarker tracking, intervention planning, longitudinal modelling
#
# tAimra is the data intelligence engine of the Tranquillity Realm.
# It maintains a living digital twin of the user's mental health state,
# integrating data from all Tranquillity services to provide predictive
# insights, early warning systems, and precision intervention planning.
#
# Architecture: Lane 3 (Data/Hive) with Cross-Lane feeds from all services
# Standard: 2060-ready, quantum-ML-ready, adaptive, HIPAA/GDPR/EU-AI-Act compliant

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import logging
import math
import statistics

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, CurrentUser
from database import get_db_session

router = APIRouter(prefix="/api/v1/tranquillity/taimra", tags=["tAimra Digital Twin"])
logger = logging.getLogger("taimra")

# ============================================================
# ENUMS
# ============================================================

class TwinDimension(str, Enum):
    COGNITIVE = "cognitive"
    EMOTIONAL = "emotional"
    PHYSICAL = "physical"
    SOCIAL = "social"
    SPIRITUAL = "spiritual"
    BEHAVIOURAL = "behavioural"
    ENVIRONMENTAL = "environmental"

class RiskLevel(str, Enum):
    MINIMAL = "minimal"
    LOW = "low"
    MODERATE = "moderate"
    ELEVATED = "elevated"
    HIGH = "high"
    CRITICAL = "critical"

class TrendDirection(str, Enum):
    IMPROVING = "improving"
    STABLE = "stable"
    DECLINING = "declining"
    VOLATILE = "volatile"

class BiomarkerType(str, Enum):
    HEART_RATE = "heart_rate"
    HRV = "heart_rate_variability"
    SLEEP_QUALITY = "sleep_quality"
    SLEEP_DURATION = "sleep_duration"
    ACTIVITY_LEVEL = "activity_level"
    CORTISOL_PROXY = "cortisol_proxy"
    MOOD_SCORE = "mood_score"
    ANXIETY_LEVEL = "anxiety_level"
    ENERGY_LEVEL = "energy_level"
    SOCIAL_ENGAGEMENT = "social_engagement"
    SCREEN_TIME = "screen_time"
    MEDITATION_MINUTES = "meditation_minutes"
    EXERCISE_MINUTES = "exercise_minutes"
    JOURNAL_SENTIMENT = "journal_sentiment"
    COGNITIVE_SCORE = "cognitive_score"

class InterventionType(str, Enum):
    BREATHING_EXERCISE = "breathing_exercise"
    GROUNDING_TECHNIQUE = "grounding_technique"
    MEDITATION_SESSION = "meditation_session"
    SOUND_THERAPY = "sound_therapy"
    JOURNALING_PROMPT = "journaling_prompt"
    SOCIAL_CONNECTION = "social_connection"
    PHYSICAL_ACTIVITY = "physical_activity"
    PROFESSIONAL_REFERRAL = "professional_referral"
    CRISIS_SUPPORT = "crisis_support"
    SLEEP_HYGIENE = "sleep_hygiene"
    COGNITIVE_EXERCISE = "cognitive_exercise"
    NATURE_EXPOSURE = "nature_exposure"

class InterventionUrgency(str, Enum):
    PREVENTIVE = "preventive"
    SUPPORTIVE = "supportive"
    RESPONSIVE = "responsive"
    URGENT = "urgent"
    CRITICAL = "critical"

class DataSourceType(str, Enum):
    SELF_REPORT = "self_report"
    WEARABLE = "wearable"
    APP_USAGE = "app_usage"
    IMIND = "i_mind"
    RESONATE = "resonate"
    SAVANIA = "savania"
    CLINICAL = "clinical"
    ENVIRONMENTAL = "environmental"

# ============================================================
# MODELS
# ============================================================

class DimensionState(BaseModel):
    dimension: TwinDimension
    score: float = Field(ge=0.0, le=10.0, default=5.0)
    trend: TrendDirection = TrendDirection.STABLE
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    contributing_factors: List[str] = Field(default_factory=list)

class DigitalTwinSnapshot(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    dimensions: Dict[str, DimensionState] = Field(default_factory=dict)
    overall_wellbeing: float = Field(ge=0.0, le=10.0, default=5.0)
    risk_level: RiskLevel = RiskLevel.LOW
    trend: TrendDirection = TrendDirection.STABLE
    active_alerts: List[str] = Field(default_factory=list)
    snapshot_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BiomarkerReading(BaseModel):
    biomarker: BiomarkerType
    value: float
    unit: str = ""
    source: DataSourceType = DataSourceType.SELF_REPORT
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = Field(default_factory=dict)

class BiomarkerSubmission(BaseModel):
    readings: List[BiomarkerReading] = Field(min_length=1, max_length=50)

class Intervention(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    intervention_type: InterventionType
    urgency: InterventionUrgency = InterventionUrgency.SUPPORTIVE
    title: str
    description: str = ""
    rationale: str = ""
    target_dimension: TwinDimension
    estimated_impact: float = Field(ge=0.0, le=5.0, default=1.0)
    duration_minutes: int = Field(ge=1, le=120, default=10)
    deep_link: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PredictiveInsight(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dimension: TwinDimension
    prediction: str
    confidence: float = Field(ge=0.0, le=1.0)
    timeframe_hours: int = 24
    risk_level: RiskLevel = RiskLevel.LOW
    recommended_actions: List[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TwinPreferences(BaseModel):
    data_sources_enabled: List[DataSourceType] = Field(
        default_factory=lambda: [DataSourceType.SELF_REPORT, DataSourceType.APP_USAGE]
    )
    alert_threshold: RiskLevel = RiskLevel.MODERATE
    share_with_clinician: bool = False
    predictive_insights_enabled: bool = True
    biomarker_reminders: bool = True
    reminder_frequency_hours: int = Field(ge=1, le=168, default=24)

class TimeSeriesPoint(BaseModel):
    timestamp: str
    value: float
    source: str = ""

# ============================================================
# IN-MEMORY STATE (Production: PostgreSQL + TimescaleDB + Valkey)
# ============================================================

_digital_twins: Dict[str, Dict[str, Any]] = {}
_biomarker_history: Dict[str, List[Dict[str, Any]]] = {}
_intervention_history: Dict[str, List[Dict[str, Any]]] = {}
_predictive_insights: Dict[str, List[Dict[str, Any]]] = {}
_twin_preferences: Dict[str, Dict[str, Any]] = {}
_alert_history: Dict[str, List[Dict[str, Any]]] = {}

# ============================================================
# KERNEL EVENT BUS INTEGRATION
# ============================================================

async def _emit_taimra_event(topic: str, payload: Dict[str, Any], user_id: str = "system"):
    """Emit event to the Kernel Event Bus for cross-lane communication."""
    try:
        from routers.event_bus import get_event_bus
        bus = await get_event_bus()
        await bus.publish(f"tranquillity.taimra.{topic}", {
            **payload,
            "source": "taimra",
            "lane": "data_hive",
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.debug(f"Event bus not available: {e}")


# ============================================================
# DIGITAL TWIN ENGINE — Core Intelligence
# ============================================================

def _get_or_create_twin(user_id: str) -> Dict[str, Any]:
    """Get or initialise the user's digital twin."""
    if user_id not in _digital_twins:
        now = datetime.now(timezone.utc).isoformat()
        _digital_twins[user_id] = {
            "user_id": user_id,
            "dimensions": {
                dim.value: {
                    "dimension": dim.value,
                    "score": 5.0,
                    "trend": TrendDirection.STABLE.value,
                    "confidence": 0.1,
                    "last_updated": now,
                    "contributing_factors": [],
                }
                for dim in TwinDimension
            },
            "overall_wellbeing": 5.0,
            "risk_level": RiskLevel.LOW.value,
            "trend": TrendDirection.STABLE.value,
            "active_alerts": [],
            "created_at": now,
            "last_updated": now,
        }
    return _digital_twins[user_id]


def _recalculate_twin(user_id: str) -> Dict[str, Any]:
    """
    Recalculate the digital twin state from biomarker history.
    In production this would use ML models, Bayesian networks,
    and temporal pattern recognition.
    """
    twin = _get_or_create_twin(user_id)
    history = _biomarker_history.get(user_id, [])
    now = datetime.now(timezone.utc)

    if not history:
        return twin

    # Map biomarkers to dimensions
    dimension_biomarkers = {
        TwinDimension.COGNITIVE.value: [
            BiomarkerType.COGNITIVE_SCORE.value,
            BiomarkerType.MEDITATION_MINUTES.value,
        ],
        TwinDimension.EMOTIONAL.value: [
            BiomarkerType.MOOD_SCORE.value,
            BiomarkerType.ANXIETY_LEVEL.value,
            BiomarkerType.JOURNAL_SENTIMENT.value,
        ],
        TwinDimension.PHYSICAL.value: [
            BiomarkerType.HEART_RATE.value,
            BiomarkerType.HRV.value,
            BiomarkerType.SLEEP_QUALITY.value,
            BiomarkerType.SLEEP_DURATION.value,
            BiomarkerType.EXERCISE_MINUTES.value,
        ],
        TwinDimension.SOCIAL.value: [
            BiomarkerType.SOCIAL_ENGAGEMENT.value,
        ],
        TwinDimension.BEHAVIOURAL.value: [
            BiomarkerType.SCREEN_TIME.value,
            BiomarkerType.ACTIVITY_LEVEL.value,
        ],
        TwinDimension.ENVIRONMENTAL.value: [],
        TwinDimension.SPIRITUAL.value: [
            BiomarkerType.MEDITATION_MINUTES.value,
        ],
    }

    # Calculate dimension scores from recent biomarkers (last 7 days)
    cutoff = (now - timedelta(days=7)).isoformat()
    recent = [r for r in history if r.get("recorded_at", "") >= cutoff]

    for dim_name, biomarker_types in dimension_biomarkers.items():
        dim_readings = [
            r for r in recent
            if r.get("biomarker") in biomarker_types
        ]
        if dim_readings:
            # Normalise values to 0-10 scale
            values = [_normalise_biomarker(r) for r in dim_readings]
            score = sum(values) / len(values)
            score = max(0.0, min(10.0, score))

            # Calculate trend from older vs newer readings
            mid = len(dim_readings) // 2
            if mid > 0:
                older_avg = sum(_normalise_biomarker(r) for r in dim_readings[:mid]) / mid
                newer_avg = sum(_normalise_biomarker(r) for r in dim_readings[mid:]) / (len(dim_readings) - mid)
                delta = newer_avg - older_avg
                if delta > 0.5:
                    trend = TrendDirection.IMPROVING.value
                elif delta < -0.5:
                    trend = TrendDirection.DECLINING.value
                else:
                    trend = TrendDirection.STABLE.value
            else:
                trend = TrendDirection.STABLE.value

            confidence = min(1.0, len(dim_readings) / 10.0)

            twin["dimensions"][dim_name].update({
                "score": round(score, 2),
                "trend": trend,
                "confidence": round(confidence, 2),
                "last_updated": now.isoformat(),
                "contributing_factors": list(set(r.get("biomarker", "") for r in dim_readings)),
            })

    # Calculate overall wellbeing (weighted average)
    weights = {
        TwinDimension.COGNITIVE.value: 0.2,
        TwinDimension.EMOTIONAL.value: 0.25,
        TwinDimension.PHYSICAL.value: 0.2,
        TwinDimension.SOCIAL.value: 0.1,
        TwinDimension.SPIRITUAL.value: 0.1,
        TwinDimension.BEHAVIOURAL.value: 0.1,
        TwinDimension.ENVIRONMENTAL.value: 0.05,
    }
    weighted_sum = sum(
        twin["dimensions"][dim]["score"] * weights.get(dim, 0.1)
        for dim in twin["dimensions"]
    )
    twin["overall_wellbeing"] = round(weighted_sum, 2)

    # Determine risk level
    twin["risk_level"] = _assess_risk_level(twin)

    # Determine overall trend
    trends = [twin["dimensions"][d]["trend"] for d in twin["dimensions"]]
    declining_count = trends.count(TrendDirection.DECLINING.value)
    improving_count = trends.count(TrendDirection.IMPROVING.value)
    if declining_count >= 3:
        twin["trend"] = TrendDirection.DECLINING.value
    elif improving_count >= 3:
        twin["trend"] = TrendDirection.IMPROVING.value
    elif declining_count >= 2 and improving_count >= 2:
        twin["trend"] = TrendDirection.VOLATILE.value
    else:
        twin["trend"] = TrendDirection.STABLE.value

    # Generate alerts
    twin["active_alerts"] = _generate_alerts(twin)
    twin["last_updated"] = now.isoformat()

    return twin


def _normalise_biomarker(reading: Dict[str, Any]) -> float:
    """Normalise a biomarker reading to a 0-10 scale."""
    biomarker = reading.get("biomarker", "")
    value = reading.get("value", 5.0)

    # Normalisation ranges (min, max, invert)
    ranges = {
        BiomarkerType.MOOD_SCORE.value: (1, 10, False),
        BiomarkerType.ANXIETY_LEVEL.value: (1, 10, True),
        BiomarkerType.SLEEP_QUALITY.value: (1, 10, False),
        BiomarkerType.SLEEP_DURATION.value: (4, 10, False),
        BiomarkerType.ENERGY_LEVEL.value: (1, 10, False),
        BiomarkerType.COGNITIVE_SCORE.value: (1, 10, False),
        BiomarkerType.SOCIAL_ENGAGEMENT.value: (0, 10, False),
        BiomarkerType.MEDITATION_MINUTES.value: (0, 60, False),
        BiomarkerType.EXERCISE_MINUTES.value: (0, 90, False),
        BiomarkerType.SCREEN_TIME.value: (0, 16, True),
        BiomarkerType.ACTIVITY_LEVEL.value: (0, 10, False),
        BiomarkerType.HEART_RATE.value: (50, 100, True),
        BiomarkerType.HRV.value: (20, 100, False),
        BiomarkerType.JOURNAL_SENTIMENT.value: (0, 10, False),
        BiomarkerType.CORTISOL_PROXY.value: (1, 10, True),
    }

    if biomarker in ranges:
        min_val, max_val, invert = ranges[biomarker]
        normalised = (value - min_val) / (max_val - min_val) * 10.0
        normalised = max(0.0, min(10.0, normalised))
        if invert:
            normalised = 10.0 - normalised
        return normalised

    return max(0.0, min(10.0, value))


def _assess_risk_level(twin: Dict[str, Any]) -> str:
    """Assess overall risk level from twin state."""
    overall = twin.get("overall_wellbeing", 5.0)
    emotional = twin["dimensions"].get(TwinDimension.EMOTIONAL.value, {}).get("score", 5.0)
    cognitive = twin["dimensions"].get(TwinDimension.COGNITIVE.value, {}).get("score", 5.0)

    # Critical: any dimension below 2.0 or overall below 2.5
    dims = twin.get("dimensions", {})
    if any(d.get("score", 5.0) < 2.0 for d in dims.values()):
        return RiskLevel.CRITICAL.value
    if overall < 2.5:
        return RiskLevel.HIGH.value
    if overall < 3.5 or emotional < 3.0:
        return RiskLevel.ELEVATED.value
    if overall < 5.0:
        return RiskLevel.MODERATE.value
    if overall < 6.5:
        return RiskLevel.LOW.value
    return RiskLevel.MINIMAL.value


def _generate_alerts(twin: Dict[str, Any]) -> List[str]:
    """Generate active alerts based on twin state."""
    alerts = []
    dims = twin.get("dimensions", {})

    for dim_name, dim_data in dims.items():
        score = dim_data.get("score", 5.0)
        trend = dim_data.get("trend", "stable")

        if score < 3.0:
            alerts.append(f"Low {dim_name} score ({score:.1f}/10) — intervention recommended")
        if trend == TrendDirection.DECLINING.value and score < 5.0:
            alerts.append(f"Declining {dim_name} trend — monitoring closely")

    risk = twin.get("risk_level", "low")
    if risk in (RiskLevel.HIGH.value, RiskLevel.CRITICAL.value):
        alerts.insert(0, f"⚠️ Risk level: {risk.upper()} — professional support recommended")

    return alerts


def _generate_interventions(twin: Dict[str, Any], user_id: str) -> List[Dict[str, Any]]:
    """
    Generate adaptive interventions based on the digital twin state.
    Prioritises the most impactful interventions for the user's
    current needs. Production: reinforcement learning optimisation.
    """
    interventions = []
    dims = twin.get("dimensions", {})

    # Intervention mapping: dimension → (type, title, description, deep_link)
    intervention_map = {
        TwinDimension.EMOTIONAL.value: [
            (InterventionType.BREATHING_EXERCISE, "Box Breathing for Calm",
             "A 5-minute box breathing exercise to regulate your emotional state.",
             "/api/v1/tranquillity/i-mind/exercises/ex-breath-box"),
            (InterventionType.JOURNALING_PROMPT, "Emotional Check-In Journal",
             "Write about what you're feeling right now without judgment.",
             "/api/v1/tranquillity/i-mind/journal"),
            (InterventionType.SOUND_THERAPY, "Alpha Wave Calming Session",
             "10-minute alpha wave binaural session for emotional balance.",
             "/api/v1/tranquillity/resonate/soundscapes/ss-schumann"),
        ],
        TwinDimension.COGNITIVE.value: [
            (InterventionType.COGNITIVE_EXERCISE, "Focus Training",
             "A 10-minute sustained attention exercise to sharpen cognitive function.",
             "/api/v1/tranquillity/i-mind/exercises/ex-focus-train"),
            (InterventionType.MEDITATION_SESSION, "Mindfulness Meditation",
             "15-minute breath awareness meditation for mental clarity.",
             "/api/v1/tranquillity/i-mind/meditations/med-breath-aware"),
        ],
        TwinDimension.PHYSICAL.value: [
            (InterventionType.PHYSICAL_ACTIVITY, "Gentle Movement Break",
             "A 10-minute gentle stretching or walking session.",
             None),
            (InterventionType.SLEEP_HYGIENE, "Sleep Preparation Protocol",
             "Wind-down routine with delta wave sound therapy for better sleep.",
             "/api/v1/tranquillity/resonate/soundscapes/ss-binaural-delta"),
        ],
        TwinDimension.SOCIAL.value: [
            (InterventionType.SOCIAL_CONNECTION, "Reach Out",
             "Send a message to someone you trust. Connection heals.",
             None),
        ],
        TwinDimension.SPIRITUAL.value: [
            (InterventionType.MEDITATION_SESSION, "Loving-Kindness Practice",
             "20-minute loving-kindness meditation for inner peace.",
             "/api/v1/tranquillity/i-mind/meditations/med-loving-kindness"),
        ],
    }

    for dim_name, dim_data in dims.items():
        score = dim_data.get("score", 5.0)
        trend = dim_data.get("trend", "stable")

        if score >= 7.0 and trend != TrendDirection.DECLINING.value:
            continue  # No intervention needed

        # Determine urgency
        if score < 2.0:
            urgency = InterventionUrgency.CRITICAL
        elif score < 3.5:
            urgency = InterventionUrgency.URGENT
        elif score < 5.0:
            urgency = InterventionUrgency.RESPONSIVE
        elif trend == TrendDirection.DECLINING.value:
            urgency = InterventionUrgency.SUPPORTIVE
        else:
            urgency = InterventionUrgency.PREVENTIVE

        available = intervention_map.get(dim_name, [])
        for int_type, title, desc, deep_link in available:
            impact = max(0.5, (7.0 - score) / 2.0)
            interventions.append({
                "id": str(uuid.uuid4()),
                "intervention_type": int_type.value,
                "urgency": urgency.value,
                "title": title,
                "description": desc,
                "rationale": f"{dim_name.capitalize()} score is {score:.1f}/10 "
                             f"(trend: {trend}). This intervention targets improvement.",
                "target_dimension": dim_name,
                "estimated_impact": round(min(5.0, impact), 1),
                "duration_minutes": 10,
                "deep_link": deep_link,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    # Sort by urgency then impact
    urgency_order = {
        InterventionUrgency.CRITICAL.value: 0,
        InterventionUrgency.URGENT.value: 1,
        InterventionUrgency.RESPONSIVE.value: 2,
        InterventionUrgency.SUPPORTIVE.value: 3,
        InterventionUrgency.PREVENTIVE.value: 4,
    }
    interventions.sort(key=lambda x: (
        urgency_order.get(x["urgency"], 5),
        -x["estimated_impact"],
    ))

    # Add crisis support if risk is critical
    if twin.get("risk_level") == RiskLevel.CRITICAL.value:
        interventions.insert(0, {
            "id": str(uuid.uuid4()),
            "intervention_type": InterventionType.CRISIS_SUPPORT.value,
            "urgency": InterventionUrgency.CRITICAL.value,
            "title": "Crisis Support Available",
            "description": "You are not alone. Professional crisis support is available 24/7. "
                           "Please reach out to a trusted person or crisis helpline.",
            "rationale": "Digital twin indicates critical risk level. Immediate support recommended.",
            "target_dimension": TwinDimension.EMOTIONAL.value,
            "estimated_impact": 5.0,
            "duration_minutes": 1,
            "deep_link": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    return interventions


def _generate_predictions(twin: Dict[str, Any], user_id: str) -> List[Dict[str, Any]]:
    """
    Generate predictive insights based on twin trends and biomarker patterns.
    Production: temporal ML models, Bayesian forecasting, causal inference.
    """
    predictions = []
    dims = twin.get("dimensions", {})

    for dim_name, dim_data in dims.items():
        score = dim_data.get("score", 5.0)
        trend = dim_data.get("trend", "stable")
        confidence = dim_data.get("confidence", 0.1)

        if confidence < 0.3:
            continue  # Not enough data for prediction

        if trend == TrendDirection.DECLINING.value:
            predicted_score = max(0.0, score - 1.5)
            risk = RiskLevel.ELEVATED.value if predicted_score < 4.0 else RiskLevel.MODERATE.value
            predictions.append({
                "id": str(uuid.uuid4()),
                "dimension": dim_name,
                "prediction": f"{dim_name.capitalize()} may decline to ~{predicted_score:.1f}/10 "
                              f"within the next 24-48 hours if current patterns continue.",
                "confidence": round(confidence * 0.7, 2),
                "timeframe_hours": 48,
                "risk_level": risk,
                "recommended_actions": [
                    f"Prioritise {dim_name} wellness activities",
                    "Consider adjusting daily routine",
                    "Monitor biomarkers more frequently",
                ],
                "generated_at": datetime.now(timezone.utc).isoformat(),
            })
        elif trend == TrendDirection.IMPROVING.value and score < 7.0:
            predicted_score = min(10.0, score + 1.0)
            predictions.append({
                "id": str(uuid.uuid4()),
                "dimension": dim_name,
                "prediction": f"{dim_name.capitalize()} is trending positively and may reach "
                              f"~{predicted_score:.1f}/10 within the next 24-48 hours.",
                "confidence": round(confidence * 0.6, 2),
                "timeframe_hours": 48,
                "risk_level": RiskLevel.MINIMAL.value,
                "recommended_actions": [
                    "Continue current wellness practices",
                    f"Maintain {dim_name} activities that are working",
                ],
                "generated_at": datetime.now(timezone.utc).isoformat(),
            })

    return predictions


# ============================================================
# ENDPOINTS — Digital Twin Core
# ============================================================

@router.get("/twin", summary="Get digital twin state")
async def get_digital_twin(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns the user's complete digital twin state including all
    dimension scores, trends, risk level, and active alerts.
    """
    user_id = getattr(current_user, "id", "anonymous")
    twin = _recalculate_twin(user_id)

    await _emit_taimra_event("twin.viewed", {
        "overall_wellbeing": twin["overall_wellbeing"],
        "risk_level": twin["risk_level"],
    }, user_id)

    return twin


@router.get("/twin/dimension/{dimension}", summary="Get specific dimension details")
async def get_dimension(
    dimension: TwinDimension = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve detailed state for a specific twin dimension."""
    user_id = getattr(current_user, "id", "anonymous")
    twin = _get_or_create_twin(user_id)
    dim_data = twin["dimensions"].get(dimension.value)
    if not dim_data:
        raise HTTPException(status_code=404, detail="Dimension not found")

    # Include recent biomarkers for this dimension
    history = _biomarker_history.get(user_id, [])
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent = [r for r in history if r.get("recorded_at", "") >= cutoff]

    return {
        "dimension": dim_data,
        "recent_biomarkers": recent[-20:],
        "biomarker_count": len(recent),
    }


# ============================================================
# ENDPOINTS — Biomarker Tracking
# ============================================================

@router.post("/biomarkers", summary="Submit biomarker readings")
async def submit_biomarkers(
    submission: BiomarkerSubmission,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Submit one or more biomarker readings. The digital twin automatically
    recalculates dimension scores and risk levels from new data.
    """
    user_id = getattr(current_user, "id", "anonymous")
    now = datetime.now(timezone.utc).isoformat()

    readings = []
    for reading in submission.readings:
        record = {
            "biomarker": reading.biomarker.value,
            "value": reading.value,
            "unit": reading.unit,
            "source": reading.source.value,
            "recorded_at": reading.recorded_at.isoformat() if reading.recorded_at else now,
            "metadata": reading.metadata,
        }
        readings.append(record)

    _biomarker_history.setdefault(user_id, []).extend(readings)

    # Recalculate twin
    twin = _recalculate_twin(user_id)

    await _emit_taimra_event("biomarkers.submitted", {
        "reading_count": len(readings),
        "biomarker_types": list(set(r["biomarker"] for r in readings)),
        "new_risk_level": twin["risk_level"],
    }, user_id)

    return {
        "accepted": len(readings),
        "twin_updated": True,
        "overall_wellbeing": twin["overall_wellbeing"],
        "risk_level": twin["risk_level"],
        "active_alerts": twin["active_alerts"],
    }


@router.get("/biomarkers", summary="Get biomarker history")
async def get_biomarker_history(
    biomarker: Optional[BiomarkerType] = Query(None),
    days: int = Query(7, ge=1, le=365),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve biomarker reading history with optional type filter."""
    user_id = getattr(current_user, "id", "anonymous")
    history = _biomarker_history.get(user_id, [])

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    filtered = [r for r in history if r.get("recorded_at", "") >= cutoff]

    if biomarker:
        filtered = [r for r in filtered if r.get("biomarker") == biomarker.value]

    return {"readings": filtered, "total": len(filtered), "days": days}


@router.get("/biomarkers/timeseries/{biomarker}", summary="Get biomarker time series")
async def get_biomarker_timeseries(
    biomarker: BiomarkerType = Path(...),
    days: int = Query(30, ge=1, le=365),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get time-series data for a specific biomarker, suitable for
    charting and trend analysis.
    """
    user_id = getattr(current_user, "id", "anonymous")
    history = _biomarker_history.get(user_id, [])

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    filtered = [
        r for r in history
        if r.get("biomarker") == biomarker.value and r.get("recorded_at", "") >= cutoff
    ]

    points = [
        {"timestamp": r["recorded_at"], "value": r["value"], "source": r.get("source", "")}
        for r in filtered
    ]

    # Calculate statistics
    values = [p["value"] for p in points]
    stats = {}
    if values:
        stats = {
            "mean": round(statistics.mean(values), 2),
            "median": round(statistics.median(values), 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "stdev": round(statistics.stdev(values), 2) if len(values) > 1 else 0.0,
            "count": len(values),
        }

    return {"biomarker": biomarker.value, "points": points, "statistics": stats, "days": days}


# ============================================================
# ENDPOINTS — Interventions
# ============================================================

@router.get("/interventions", summary="Get adaptive interventions")
async def get_interventions(
    limit: int = Query(10, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Generate adaptive interventions based on the current digital twin
    state. Interventions are prioritised by urgency and estimated impact.
    """
    user_id = getattr(current_user, "id", "anonymous")
    twin = _recalculate_twin(user_id)
    interventions = _generate_interventions(twin, user_id)

    await _emit_taimra_event("interventions.generated", {
        "count": len(interventions),
        "risk_level": twin["risk_level"],
    }, user_id)

    return {"interventions": interventions[:limit], "risk_level": twin["risk_level"]}


@router.post("/interventions/{intervention_id}/complete", summary="Mark intervention completed")
async def complete_intervention(
    intervention_id: str,
    effectiveness: int = Query(..., ge=1, le=5, description="How effective was this? 1-5"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Record that an intervention was completed with an effectiveness rating."""
    user_id = getattr(current_user, "id", "anonymous")
    record = {
        "intervention_id": intervention_id,
        "user_id": user_id,
        "effectiveness": effectiveness,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    _intervention_history.setdefault(user_id, []).append(record)

    await _emit_taimra_event("intervention.completed", {
        "intervention_id": intervention_id,
        "effectiveness": effectiveness,
    }, user_id)

    return {"message": "Intervention recorded", "record": record}


# ============================================================
# ENDPOINTS — Predictive Insights
# ============================================================

@router.get("/predictions", summary="Get predictive insights")
async def get_predictions(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Generate predictive insights based on digital twin trends.
    Forecasts potential changes in wellbeing dimensions.
    """
    user_id = getattr(current_user, "id", "anonymous")
    twin = _recalculate_twin(user_id)
    predictions = _generate_predictions(twin, user_id)

    # Store for history
    _predictive_insights[user_id] = predictions

    await _emit_taimra_event("predictions.generated", {
        "count": len(predictions),
    }, user_id)

    return {"predictions": predictions, "twin_state": {
        "overall_wellbeing": twin["overall_wellbeing"],
        "risk_level": twin["risk_level"],
        "trend": twin["trend"],
    }}


# ============================================================
# ENDPOINTS — Preferences
# ============================================================

@router.get("/preferences", summary="Get twin preferences")
async def get_twin_preferences(
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve the user's digital twin data and alert preferences."""
    user_id = getattr(current_user, "id", "anonymous")
    prefs = _twin_preferences.get(user_id, {
        "user_id": user_id,
        "data_sources_enabled": [DataSourceType.SELF_REPORT.value, DataSourceType.APP_USAGE.value],
        "alert_threshold": RiskLevel.MODERATE.value,
        "share_with_clinician": False,
        "predictive_insights_enabled": True,
        "biomarker_reminders": True,
        "reminder_frequency_hours": 24,
    })
    return prefs


@router.put("/preferences", summary="Update twin preferences")
async def update_twin_preferences(
    prefs: TwinPreferences,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update digital twin data collection and alert preferences."""
    user_id = getattr(current_user, "id", "anonymous")
    pref_data = {
        "user_id": user_id,
        "data_sources_enabled": [s.value for s in prefs.data_sources_enabled],
        "alert_threshold": prefs.alert_threshold.value,
        "share_with_clinician": prefs.share_with_clinician,
        "predictive_insights_enabled": prefs.predictive_insights_enabled,
        "biomarker_reminders": prefs.biomarker_reminders,
        "reminder_frequency_hours": prefs.reminder_frequency_hours,
    }
    _twin_preferences[user_id] = pref_data

    await _emit_taimra_event("preferences.updated", {
        "share_with_clinician": prefs.share_with_clinician,
        "predictive_enabled": prefs.predictive_insights_enabled,
    }, user_id)

    return {"message": "Preferences updated", "preferences": pref_data}


# ============================================================
# ENDPOINTS — Health
# ============================================================

@router.get("/health", summary="tAimra service health", include_in_schema=False)
async def taimra_health():
    """Health check for the tAimra digital twin service."""
    return {
        "service": "taimra",
        "status": "healthy",
        "active_twins": len(_digital_twins),
        "total_biomarker_readings": sum(len(v) for v in _biomarker_history.values()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }