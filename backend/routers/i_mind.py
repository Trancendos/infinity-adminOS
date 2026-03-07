# routers/i_mind.py — i-Mind Cognitive Wellness Gateway
# Lane 2 (User/Infinity) — Cognitive exercises, meditation, assessment, neurofeedback
#
# i-Mind is the cognitive wellness engine of the Tranquillity Realm.
# It provides adaptive mental exercises, guided meditation, cognitive
# assessments, and neurofeedback integration — all personalised to
# the user's recovery stage and cognitive profile.
#
# Architecture: Lane 2 (User/Infinity) with Cross-Lane data flow to Hive
# Standard: 2060-ready, BCI-ready, adaptive, HIPAA/GDPR compliant

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import logging
import random

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, CurrentUser
from database import get_db_session

router = APIRouter(prefix="/api/v1/tranquillity/i-mind", tags=["i-Mind Cognitive Wellness"])
logger = logging.getLogger("i_mind")

# ============================================================
# ENUMS
# ============================================================

class ExerciseCategory(str, Enum):
    MINDFULNESS = "mindfulness"
    COGNITIVE_TRAINING = "cognitive_training"
    BREATHING = "breathing"
    MEDITATION = "meditation"
    JOURNALING = "journaling"
    GROUNDING = "grounding"
    VISUALIZATION = "visualization"
    NEUROFEEDBACK = "neurofeedback"
    MEMORY = "memory"
    FOCUS = "focus"

class DifficultyLevel(str, Enum):
    GENTLE = "gentle"
    EASY = "easy"
    MODERATE = "moderate"
    CHALLENGING = "challenging"
    ADVANCED = "advanced"

class SessionState(str, Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    ABANDONED = "abandoned"

class CognitiveMetric(str, Enum):
    ATTENTION_SPAN = "attention_span"
    WORKING_MEMORY = "working_memory"
    PROCESSING_SPEED = "processing_speed"
    EMOTIONAL_REGULATION = "emotional_regulation"
    STRESS_RESILIENCE = "stress_resilience"
    MINDFULNESS_DEPTH = "mindfulness_depth"
    FOCUS_DURATION = "focus_duration"
    COGNITIVE_FLEXIBILITY = "cognitive_flexibility"

class MeditationType(str, Enum):
    GUIDED = "guided"
    UNGUIDED = "unguided"
    BODY_SCAN = "body_scan"
    LOVING_KINDNESS = "loving_kindness"
    BREATH_AWARENESS = "breath_awareness"
    PROGRESSIVE_RELAXATION = "progressive_relaxation"
    MANTRA = "mantra"
    WALKING = "walking"
    SLEEP = "sleep"
    BINAURAL = "binaural"

# ============================================================
# MODELS
# ============================================================

class Exercise(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    category: ExerciseCategory
    difficulty: DifficultyLevel = DifficultyLevel.GENTLE
    duration_minutes: int = Field(ge=1, le=120, default=10)
    description: str = ""
    instructions: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    accessibility_notes: str = ""
    contraindications: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExerciseSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    exercise_id: str
    state: SessionState = SessionState.SCHEDULED
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: int = 0
    mood_before: Optional[int] = Field(None, ge=1, le=10)
    mood_after: Optional[int] = Field(None, ge=1, le=10)
    notes: str = ""
    metrics: Dict[str, Any] = Field(default_factory=dict)

class CognitiveProfile(BaseModel):
    user_id: str
    metrics: Dict[CognitiveMetric, float] = Field(default_factory=dict)
    strengths: List[str] = Field(default_factory=list)
    growth_areas: List[str] = Field(default_factory=list)
    recommended_categories: List[ExerciseCategory] = Field(default_factory=list)
    last_assessment: Optional[datetime] = None
    assessment_count: int = 0

class MeditationSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    meditation_type: MeditationType
    title: str
    duration_minutes: int = Field(ge=1, le=180, default=15)
    description: str = ""
    audio_url: Optional[str] = None
    background_soundscape: Optional[str] = None
    binaural_frequency_hz: Optional[float] = None
    tags: List[str] = Field(default_factory=list)

class AssessmentResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    assessment_type: str
    scores: Dict[str, float] = Field(default_factory=dict)
    interpretation: str = ""
    recommendations: List[str] = Field(default_factory=list)
    completed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StartSessionRequest(BaseModel):
    exercise_id: str
    mood_before: Optional[int] = Field(None, ge=1, le=10)

class CompleteSessionRequest(BaseModel):
    mood_after: Optional[int] = Field(None, ge=1, le=10)
    notes: str = ""
    metrics: Dict[str, Any] = Field(default_factory=dict)

class JournalEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str = ""
    content: str
    mood_score: Optional[int] = Field(None, ge=1, le=10)
    tags: List[str] = Field(default_factory=list)
    is_private: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class JournalEntryCreate(BaseModel):
    title: str = ""
    content: str = Field(min_length=1, max_length=50000)
    mood_score: Optional[int] = Field(None, ge=1, le=10)
    tags: List[str] = Field(default_factory=list)

class StreakInfo(BaseModel):
    current_streak_days: int = 0
    longest_streak_days: int = 0
    total_sessions: int = 0
    total_minutes: int = 0
    last_session_date: Optional[datetime] = None

# ============================================================
# IN-MEMORY STATE (Production: PostgreSQL + Valkey)
# ============================================================

_exercise_library: Dict[str, Dict[str, Any]] = {}
_user_sessions: Dict[str, List[Dict[str, Any]]] = {}
_cognitive_profiles: Dict[str, Dict[str, Any]] = {}
_journal_entries: Dict[str, List[Dict[str, Any]]] = {}
_meditation_library: Dict[str, Dict[str, Any]] = {}
_assessment_results: Dict[str, List[Dict[str, Any]]] = {}

# Seed exercise library
_SEED_EXERCISES = [
    {
        "id": "ex-breath-box", "title": "Box Breathing",
        "category": "breathing", "difficulty": "gentle", "duration_minutes": 5,
        "description": "A calming 4-4-4-4 breathing pattern used by Navy SEALs to manage stress.",
        "instructions": ["Inhale for 4 seconds", "Hold for 4 seconds", "Exhale for 4 seconds", "Hold for 4 seconds", "Repeat 4-8 cycles"],
        "tags": ["stress-relief", "anxiety", "quick", "beginner"],
    },
    {
        "id": "ex-body-scan", "title": "Progressive Body Scan",
        "category": "mindfulness", "difficulty": "easy", "duration_minutes": 15,
        "description": "Systematically scan your body from toes to crown, releasing tension in each area.",
        "instructions": ["Find a comfortable position", "Close your eyes gently", "Start at your toes", "Notice sensations without judgment", "Move slowly upward through each body part"],
        "tags": ["relaxation", "body-awareness", "sleep-prep"],
    },
    {
        "id": "ex-focus-train", "title": "Sustained Attention Training",
        "category": "focus", "difficulty": "moderate", "duration_minutes": 10,
        "description": "Train your ability to maintain focus on a single point of attention.",
        "instructions": ["Choose a focal point", "Set a timer for 10 minutes", "Return attention gently when it wanders", "Note each wandering without self-criticism"],
        "tags": ["focus", "attention", "cognitive-training"],
    },
    {
        "id": "ex-gratitude-journal", "title": "Gratitude Journaling",
        "category": "journaling", "difficulty": "gentle", "duration_minutes": 10,
        "description": "Write three things you are grateful for today, exploring each in detail.",
        "instructions": ["Open your journal", "Write three gratitudes", "For each, explain why it matters", "Notice how you feel after writing"],
        "tags": ["gratitude", "positivity", "journaling", "beginner"],
    },
    {
        "id": "ex-grounding-54321", "title": "5-4-3-2-1 Grounding",
        "category": "grounding", "difficulty": "gentle", "duration_minutes": 5,
        "description": "Use your five senses to ground yourself in the present moment.",
        "instructions": ["Name 5 things you can see", "Name 4 things you can touch", "Name 3 things you can hear", "Name 2 things you can smell", "Name 1 thing you can taste"],
        "tags": ["grounding", "anxiety", "panic", "quick", "crisis"],
    },
    {
        "id": "ex-memory-palace", "title": "Memory Palace Construction",
        "category": "memory", "difficulty": "challenging", "duration_minutes": 20,
        "description": "Build a mental memory palace to strengthen spatial and associative memory.",
        "instructions": ["Choose a familiar location", "Walk through it mentally", "Place items at specific locations", "Retrieve items by retracing your path"],
        "tags": ["memory", "cognitive-training", "advanced"],
    },
    {
        "id": "ex-visualization-safe", "title": "Safe Place Visualization",
        "category": "visualization", "difficulty": "easy", "duration_minutes": 12,
        "description": "Create a detailed mental image of your personal safe place for emotional regulation.",
        "instructions": ["Close your eyes", "Imagine a place where you feel completely safe", "Add sensory details — sights, sounds, smells", "Anchor the feeling with a word or gesture"],
        "tags": ["safety", "emotional-regulation", "trauma-informed"],
    },
    {
        "id": "ex-cognitive-flex", "title": "Cognitive Flexibility Drill",
        "category": "cognitive_training", "difficulty": "moderate", "duration_minutes": 15,
        "description": "Practice switching between different mental tasks to build cognitive flexibility.",
        "instructions": ["Alternate between two different mental tasks", "Increase switching speed gradually", "Notice the mental effort required", "Rest between sets"],
        "tags": ["flexibility", "executive-function", "cognitive-training"],
    },
]

for _ex in _SEED_EXERCISES:
    _exercise_library[_ex["id"]] = _ex

# Seed meditation library
_SEED_MEDITATIONS = [
    {
        "id": "med-breath-aware", "meditation_type": "breath_awareness",
        "title": "Breath Awareness Meditation", "duration_minutes": 10,
        "description": "Simply observe your natural breath without trying to change it.",
        "tags": ["beginner", "calming", "foundation"],
    },
    {
        "id": "med-loving-kindness", "meditation_type": "loving_kindness",
        "title": "Loving-Kindness Meditation", "duration_minutes": 20,
        "description": "Cultivate compassion for yourself and others through guided phrases.",
        "tags": ["compassion", "self-love", "emotional-healing"],
    },
    {
        "id": "med-body-scan", "meditation_type": "body_scan",
        "title": "Deep Body Scan", "duration_minutes": 30,
        "description": "A thorough body scan meditation for deep relaxation and body awareness.",
        "tags": ["relaxation", "body-awareness", "deep-practice"],
    },
    {
        "id": "med-sleep", "meditation_type": "sleep",
        "title": "Sleep Transition Meditation", "duration_minutes": 25,
        "description": "Gentle guided meditation designed to ease the transition into restful sleep.",
        "tags": ["sleep", "insomnia", "evening"],
    },
    {
        "id": "med-binaural-alpha", "meditation_type": "binaural",
        "title": "Alpha Wave Binaural Session", "duration_minutes": 15,
        "description": "Binaural beats at 10Hz alpha frequency for relaxed alertness.",
        "binaural_frequency_hz": 10.0,
        "tags": ["binaural", "alpha", "focus", "relaxation"],
    },
]

for _med in _SEED_MEDITATIONS:
    _meditation_library[_med["id"]] = _med


# ============================================================
# KERNEL EVENT BUS INTEGRATION
# ============================================================

async def _emit_imind_event(topic: str, payload: Dict[str, Any], user_id: str = "system"):
    """Emit event to the Kernel Event Bus for cross-lane communication."""
    try:
        from routers.event_bus import get_event_bus
        bus = await get_event_bus()
        await bus.publish(f"tranquillity.imind.{topic}", {
            **payload,
            "source": "i_mind",
            "lane": "user_infinity",
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.debug(f"Event bus not available: {e}")


# ============================================================
# ADAPTIVE ENGINE — Personalised Exercise Selection
# ============================================================

def _select_adaptive_exercises(
    user_id: str,
    category: Optional[ExerciseCategory] = None,
    difficulty: Optional[DifficultyLevel] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Adaptively select exercises based on user's cognitive profile,
    session history, and current state. In production this would
    use ML models trained on user outcomes.
    """
    profile = _cognitive_profiles.get(user_id, {})
    history = _user_sessions.get(user_id, [])

    # Filter by category/difficulty if specified
    candidates = list(_exercise_library.values())
    if category:
        candidates = [e for e in candidates if e.get("category") == category.value]
    if difficulty:
        candidates = [e for e in candidates if e.get("difficulty") == difficulty.value]

    # Boost exercises in growth areas
    growth_areas = profile.get("growth_areas", [])
    scored = []
    for ex in candidates:
        score = 1.0
        ex_tags = set(ex.get("tags", []))
        for area in growth_areas:
            if area.lower() in ex_tags or area.lower() in ex.get("category", ""):
                score += 0.5
        # Penalise recently completed exercises for variety
        recent_ids = {s.get("exercise_id") for s in history[-10:]}
        if ex["id"] in recent_ids:
            score *= 0.3
        scored.append((score, ex))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ex for _, ex in scored[:limit]]


def _calculate_streak(user_id: str) -> Dict[str, Any]:
    """Calculate the user's practice streak and statistics."""
    sessions = _user_sessions.get(user_id, [])
    completed = [s for s in sessions if s.get("state") == "completed"]

    if not completed:
        return {"current_streak_days": 0, "longest_streak_days": 0,
                "total_sessions": 0, "total_minutes": 0, "last_session_date": None}

    total_minutes = sum(s.get("duration_seconds", 0) for s in completed) // 60
    dates = sorted(set(
        s["completed_at"][:10] for s in completed if s.get("completed_at")
    ))

    # Calculate streaks
    current_streak = 1
    longest_streak = 1
    if len(dates) > 1:
        streak = 1
        for i in range(1, len(dates)):
            d1 = datetime.fromisoformat(dates[i - 1])
            d2 = datetime.fromisoformat(dates[i])
            if (d2 - d1).days == 1:
                streak += 1
            else:
                streak = 1
            longest_streak = max(longest_streak, streak)
        current_streak = streak

    return {
        "current_streak_days": current_streak,
        "longest_streak_days": longest_streak,
        "total_sessions": len(completed),
        "total_minutes": total_minutes,
        "last_session_date": dates[-1] if dates else None,
    }


# ============================================================
# ENDPOINTS — Exercise Library
# ============================================================

@router.get("/exercises", summary="Browse adaptive exercise library")
async def list_exercises(
    category: Optional[ExerciseCategory] = Query(None, description="Filter by category"),
    difficulty: Optional[DifficultyLevel] = Query(None, description="Filter by difficulty"),
    limit: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns exercises adaptively ranked for the current user based on
    their cognitive profile, session history, and growth areas.
    """
    user_id = getattr(current_user, "id", "anonymous")
    exercises = _select_adaptive_exercises(user_id, category, difficulty, limit)
    await _emit_imind_event("exercises.browsed", {
        "category": category.value if category else None,
        "result_count": len(exercises),
    }, user_id)
    return {"exercises": exercises, "total": len(exercises), "adaptive": True}


@router.get("/exercises/{exercise_id}", summary="Get exercise details")
async def get_exercise(
    exercise_id: str = Path(..., description="Exercise ID"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve full details for a specific exercise."""
    exercise = _exercise_library.get(exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


# ============================================================
# ENDPOINTS — Sessions
# ============================================================

@router.post("/sessions/start", summary="Start an exercise session")
async def start_session(
    req: StartSessionRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Begin a new exercise session. Records mood-before and creates
    a tracked session for analytics and streak calculation.
    """
    user_id = getattr(current_user, "id", "anonymous")
    exercise = _exercise_library.get(req.exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    session = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "exercise_id": req.exercise_id,
        "exercise_title": exercise.get("title", ""),
        "state": SessionState.IN_PROGRESS.value,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "duration_seconds": 0,
        "mood_before": req.mood_before,
        "mood_after": None,
        "notes": "",
        "metrics": {},
    }
    _user_sessions.setdefault(user_id, []).append(session)

    await _emit_imind_event("session.started", {
        "session_id": session["id"],
        "exercise_id": req.exercise_id,
        "exercise_category": exercise.get("category"),
    }, user_id)

    return {"session": session, "message": "Session started. Take your time."}


@router.post("/sessions/{session_id}/complete", summary="Complete an exercise session")
async def complete_session(
    session_id: str,
    req: CompleteSessionRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Mark a session as completed. Records mood-after, duration,
    and any metrics. Updates cognitive profile and streak.
    """
    user_id = getattr(current_user, "id", "anonymous")
    sessions = _user_sessions.get(user_id, [])
    session = next((s for s in sessions if s["id"] == session_id), None)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["state"] != SessionState.IN_PROGRESS.value:
        raise HTTPException(status_code=400, detail=f"Session is {session['state']}, not in_progress")

    now = datetime.now(timezone.utc)
    started = datetime.fromisoformat(session["started_at"])
    duration = int((now - started).total_seconds())

    session.update({
        "state": SessionState.COMPLETED.value,
        "completed_at": now.isoformat(),
        "duration_seconds": duration,
        "mood_after": req.mood_after,
        "notes": req.notes,
        "metrics": req.metrics,
    })

    # Calculate mood improvement
    mood_delta = None
    if session.get("mood_before") and req.mood_after:
        mood_delta = req.mood_after - session["mood_before"]

    await _emit_imind_event("session.completed", {
        "session_id": session_id,
        "duration_seconds": duration,
        "mood_delta": mood_delta,
    }, user_id)

    streak = _calculate_streak(user_id)
    return {"session": session, "mood_delta": mood_delta, "streak": streak}


@router.get("/sessions", summary="List user's exercise sessions")
async def list_sessions(
    state: Optional[SessionState] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve the user's exercise session history with optional state filter."""
    user_id = getattr(current_user, "id", "anonymous")
    sessions = _user_sessions.get(user_id, [])
    if state:
        sessions = [s for s in sessions if s.get("state") == state.value]
    return {"sessions": sessions[-limit:], "total": len(sessions)}


# ============================================================
# ENDPOINTS — Cognitive Profile & Assessment
# ============================================================

@router.get("/profile", summary="Get cognitive wellness profile")
async def get_cognitive_profile(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns the user's adaptive cognitive profile including strengths,
    growth areas, and recommended exercise categories.
    """
    user_id = getattr(current_user, "id", "anonymous")
    profile = _cognitive_profiles.get(user_id)
    if not profile:
        # Generate initial profile from session history
        sessions = _user_sessions.get(user_id, [])
        completed = [s for s in sessions if s.get("state") == "completed"]
        categories_used = {}
        for s in completed:
            ex = _exercise_library.get(s.get("exercise_id"), {})
            cat = ex.get("category", "unknown")
            categories_used[cat] = categories_used.get(cat, 0) + 1

        profile = {
            "user_id": user_id,
            "metrics": {m.value: 5.0 for m in CognitiveMetric},
            "strengths": [],
            "growth_areas": ["mindfulness", "emotional-regulation"],
            "recommended_categories": [
                ExerciseCategory.MINDFULNESS.value,
                ExerciseCategory.BREATHING.value,
                ExerciseCategory.GROUNDING.value,
            ],
            "last_assessment": None,
            "assessment_count": 0,
            "sessions_completed": len(completed),
            "categories_explored": categories_used,
        }
        _cognitive_profiles[user_id] = profile

    return profile


@router.post("/assessment", summary="Submit cognitive assessment")
async def submit_assessment(
    scores: Dict[str, float],
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Submit a cognitive assessment. The adaptive engine uses these scores
    to personalise exercise recommendations and track progress over time.
    """
    user_id = getattr(current_user, "id", "anonymous")
    now = datetime.now(timezone.utc)

    # Validate scores
    valid_metrics = {m.value for m in CognitiveMetric}
    validated = {k: max(0.0, min(10.0, v)) for k, v in scores.items() if k in valid_metrics}
    if not validated:
        raise HTTPException(status_code=400, detail="No valid cognitive metrics provided")

    result = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "assessment_type": "cognitive_wellness",
        "scores": validated,
        "interpretation": _interpret_assessment(validated),
        "recommendations": _assessment_recommendations(validated),
        "completed_at": now.isoformat(),
    }
    _assessment_results.setdefault(user_id, []).append(result)

    # Update cognitive profile
    profile = _cognitive_profiles.get(user_id, {"user_id": user_id, "metrics": {}})
    profile["metrics"].update(validated)
    profile["last_assessment"] = now.isoformat()
    profile["assessment_count"] = profile.get("assessment_count", 0) + 1

    # Recalculate strengths and growth areas
    sorted_metrics = sorted(validated.items(), key=lambda x: x[1], reverse=True)
    profile["strengths"] = [m for m, v in sorted_metrics[:3] if v >= 6.0]
    profile["growth_areas"] = [m for m, v in sorted_metrics if v < 5.0]

    # Update recommended categories based on growth areas
    category_map = {
        "attention_span": ExerciseCategory.FOCUS.value,
        "working_memory": ExerciseCategory.MEMORY.value,
        "emotional_regulation": ExerciseCategory.MINDFULNESS.value,
        "stress_resilience": ExerciseCategory.BREATHING.value,
        "mindfulness_depth": ExerciseCategory.MEDITATION.value,
        "cognitive_flexibility": ExerciseCategory.COGNITIVE_TRAINING.value,
    }
    profile["recommended_categories"] = list(set(
        category_map.get(area, ExerciseCategory.MINDFULNESS.value)
        for area in profile["growth_areas"]
    ))
    _cognitive_profiles[user_id] = profile

    await _emit_imind_event("assessment.completed", {
        "assessment_id": result["id"],
        "metric_count": len(validated),
    }, user_id)

    return {"result": result, "updated_profile": profile}


def _interpret_assessment(scores: Dict[str, float]) -> str:
    """Generate a human-readable interpretation of assessment scores."""
    avg = sum(scores.values()) / len(scores) if scores else 0
    if avg >= 8.0:
        return "Excellent cognitive wellness. Your scores indicate strong mental fitness across measured domains."
    elif avg >= 6.0:
        return "Good cognitive wellness with some areas for growth. Targeted exercises can help strengthen specific domains."
    elif avg >= 4.0:
        return "Moderate cognitive wellness. A consistent practice routine will help build strength in key areas."
    else:
        return "Your scores suggest this is a challenging time. Gentle, foundational exercises are recommended to build a supportive practice."


def _assessment_recommendations(scores: Dict[str, float]) -> List[str]:
    """Generate personalised recommendations from assessment scores."""
    recs = []
    for metric, score in scores.items():
        if score < 4.0:
            recs.append(f"Priority: Focus on {metric.replace('_', ' ')} with daily gentle exercises")
        elif score < 6.0:
            recs.append(f"Growth: Build {metric.replace('_', ' ')} with moderate-difficulty training")
    if not recs:
        recs.append("Maintain your excellent practice with varied, challenging exercises")
    return recs


# ============================================================
# ENDPOINTS — Meditation
# ============================================================

@router.get("/meditations", summary="Browse meditation library")
async def list_meditations(
    meditation_type: Optional[MeditationType] = Query(None),
    max_duration: Optional[int] = Query(None, ge=1, le=180),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Browse available meditation sessions with optional filters."""
    meditations = list(_meditation_library.values())
    if meditation_type:
        meditations = [m for m in meditations if m.get("meditation_type") == meditation_type.value]
    if max_duration:
        meditations = [m for m in meditations if m.get("duration_minutes", 0) <= max_duration]
    return {"meditations": meditations, "total": len(meditations)}


@router.get("/meditations/{meditation_id}", summary="Get meditation details")
async def get_meditation(
    meditation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve full details for a specific meditation session."""
    meditation = _meditation_library.get(meditation_id)
    if not meditation:
        raise HTTPException(status_code=404, detail="Meditation not found")
    return meditation


# ============================================================
# ENDPOINTS — Journal
# ============================================================

@router.post("/journal", summary="Create a journal entry")
async def create_journal_entry(
    entry: JournalEntryCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Create a private journal entry. Journaling is a core cognitive
    wellness practice for emotional processing and self-reflection.
    """
    user_id = getattr(current_user, "id", "anonymous")
    journal = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": entry.title,
        "content": entry.content,
        "mood_score": entry.mood_score,
        "tags": entry.tags,
        "is_private": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _journal_entries.setdefault(user_id, []).append(journal)

    await _emit_imind_event("journal.created", {
        "entry_id": journal["id"],
        "has_mood": entry.mood_score is not None,
    }, user_id)

    return {"entry": journal, "message": "Journal entry saved."}


@router.get("/journal", summary="List journal entries")
async def list_journal_entries(
    limit: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve the user's journal entries (most recent first)."""
    user_id = getattr(current_user, "id", "anonymous")
    entries = _journal_entries.get(user_id, [])
    return {"entries": list(reversed(entries[-limit:])), "total": len(entries)}


# ============================================================
# ENDPOINTS — Streak & Stats
# ============================================================

@router.get("/streak", summary="Get practice streak and stats")
async def get_streak(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns the user's current practice streak, longest streak,
    total sessions, and total practice minutes.
    """
    user_id = getattr(current_user, "id", "anonymous")
    return _calculate_streak(user_id)


# ============================================================
# ENDPOINTS — Health
# ============================================================

@router.get("/health", summary="i-Mind service health", include_in_schema=False)
async def imind_health():
    """Health check for the i-Mind cognitive wellness service."""
    return {
        "service": "i-mind",
        "status": "healthy",
        "exercise_count": len(_exercise_library),
        "meditation_count": len(_meditation_library),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }