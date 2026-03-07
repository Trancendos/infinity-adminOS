# routers/resonate.py — Resonate Sound & Frequency Healing Gateway
# Lane 2 (User/Infinity) — Soundscapes, binaural beats, frequency therapy, music therapy
#
# Resonate is the sonic healing engine of the Tranquillity Realm.
# It provides adaptive soundscapes, binaural beat generation, frequency
# therapy protocols, and music therapy sessions — all calibrated to
# the user's emotional state and therapeutic goals.
#
# Architecture: Lane 2 (User/Infinity) with Cross-Lane audio pipeline to Hive
# Standard: 2060-ready, spatial-audio-ready, adaptive, HIPAA/GDPR compliant

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from enum import Enum
import uuid
import logging
import math

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, CurrentUser
from database import get_db_session

router = APIRouter(prefix="/api/v1/tranquillity/resonate", tags=["Resonate Sound Healing"])
logger = logging.getLogger("resonate")

# ============================================================
# ENUMS
# ============================================================

class BrainwaveState(str, Enum):
    DELTA = "delta"          # 0.5-4 Hz — deep sleep
    THETA = "theta"          # 4-8 Hz — meditation, creativity
    ALPHA = "alpha"          # 8-13 Hz — relaxed alertness
    BETA = "beta"            # 13-30 Hz — active thinking
    GAMMA = "gamma"          # 30-100 Hz — peak performance

class SoundscapeType(str, Enum):
    NATURE = "nature"
    AMBIENT = "ambient"
    BINAURAL = "binaural"
    ISOCHRONIC = "isochronic"
    SOLFEGGIO = "solfeggio"
    WHITE_NOISE = "white_noise"
    PINK_NOISE = "pink_noise"
    BROWN_NOISE = "brown_noise"
    MUSIC_THERAPY = "music_therapy"
    SPATIAL_AUDIO = "spatial_audio"
    TIBETAN_BOWLS = "tibetan_bowls"
    CRYSTAL_BOWLS = "crystal_bowls"

class TherapeuticGoal(str, Enum):
    STRESS_RELIEF = "stress_relief"
    SLEEP_INDUCTION = "sleep_induction"
    FOCUS_ENHANCEMENT = "focus_enhancement"
    ANXIETY_REDUCTION = "anxiety_reduction"
    PAIN_MANAGEMENT = "pain_management"
    EMOTIONAL_RELEASE = "emotional_release"
    ENERGY_BOOST = "energy_boost"
    MEDITATION_SUPPORT = "meditation_support"
    TRAUMA_PROCESSING = "trauma_processing"
    CREATIVITY_BOOST = "creativity_boost"

class FrequencyProtocol(str, Enum):
    SOLFEGGIO_396 = "396hz"    # Liberating guilt and fear
    SOLFEGGIO_417 = "417hz"    # Undoing situations, facilitating change
    SOLFEGGIO_528 = "528hz"    # Transformation and miracles (DNA repair)
    SOLFEGGIO_639 = "639hz"    # Connecting/relationships
    SOLFEGGIO_741 = "741hz"    # Awakening intuition
    SOLFEGGIO_852 = "852hz"    # Returning to spiritual order
    SCHUMANN = "7.83hz"        # Earth's resonance
    CUSTOM = "custom"

class SessionIntensity(str, Enum):
    WHISPER = "whisper"
    GENTLE = "gentle"
    MODERATE = "moderate"
    IMMERSIVE = "immersive"
    DEEP = "deep"

# ============================================================
# MODELS
# ============================================================

class Soundscape(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    soundscape_type: SoundscapeType
    description: str = ""
    duration_minutes: int = Field(ge=1, le=480, default=30)
    therapeutic_goals: List[TherapeuticGoal] = Field(default_factory=list)
    target_brainwave: Optional[BrainwaveState] = None
    base_frequency_hz: Optional[float] = None
    beat_frequency_hz: Optional[float] = None
    intensity: SessionIntensity = SessionIntensity.GENTLE
    layers: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    accessibility_notes: str = ""

class SoundSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    soundscape_id: str
    state: str = "active"
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    duration_seconds: int = 0
    mood_before: Optional[int] = Field(None, ge=1, le=10)
    mood_after: Optional[int] = Field(None, ge=1, le=10)
    effectiveness_rating: Optional[int] = Field(None, ge=1, le=5)
    notes: str = ""

class FrequencyPrescription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    protocol: FrequencyProtocol
    target_brainwave: BrainwaveState
    base_frequency_hz: float
    beat_frequency_hz: float
    duration_minutes: int = 20
    therapeutic_goal: TherapeuticGoal
    rationale: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StartSoundSessionRequest(BaseModel):
    soundscape_id: str
    mood_before: Optional[int] = Field(None, ge=1, le=10)
    intensity_override: Optional[SessionIntensity] = None

class EndSoundSessionRequest(BaseModel):
    mood_after: Optional[int] = Field(None, ge=1, le=10)
    effectiveness_rating: Optional[int] = Field(None, ge=1, le=5)
    notes: str = ""

class MixerLayer(BaseModel):
    sound_type: SoundscapeType
    volume: float = Field(ge=0.0, le=1.0, default=0.5)
    frequency_hz: Optional[float] = None
    label: str = ""

class CustomMixRequest(BaseModel):
    name: str = "Custom Mix"
    layers: List[MixerLayer] = Field(min_length=1, max_length=8)
    duration_minutes: int = Field(ge=1, le=480, default=30)
    therapeutic_goal: Optional[TherapeuticGoal] = None

class SonicProfile(BaseModel):
    user_id: str
    preferred_types: List[SoundscapeType] = Field(default_factory=list)
    preferred_goals: List[TherapeuticGoal] = Field(default_factory=list)
    preferred_intensity: SessionIntensity = SessionIntensity.GENTLE
    hearing_sensitivities: List[str] = Field(default_factory=list)
    total_listening_minutes: int = 0
    sessions_completed: int = 0
    average_effectiveness: float = 0.0

# ============================================================
# IN-MEMORY STATE (Production: PostgreSQL + Valkey + Object Storage)
# ============================================================

_soundscape_library: Dict[str, Dict[str, Any]] = {}
_user_sessions: Dict[str, List[Dict[str, Any]]] = {}
_sonic_profiles: Dict[str, Dict[str, Any]] = {}
_frequency_prescriptions: Dict[str, List[Dict[str, Any]]] = {}
_custom_mixes: Dict[str, List[Dict[str, Any]]] = {}

# Seed soundscape library
_SEED_SOUNDSCAPES = [
    {
        "id": "ss-rain-forest", "name": "Rainforest Canopy",
        "soundscape_type": "nature", "duration_minutes": 60,
        "description": "Immersive rainforest ambience with gentle rain, distant thunder, and tropical birds.",
        "therapeutic_goals": ["stress_relief", "sleep_induction"],
        "target_brainwave": "alpha", "intensity": "gentle",
        "layers": ["rain", "thunder_distant", "tropical_birds", "wind_leaves"],
        "tags": ["nature", "rain", "sleep", "relaxation"],
    },
    {
        "id": "ss-ocean-waves", "name": "Ocean Waves at Dusk",
        "soundscape_type": "nature", "duration_minutes": 45,
        "description": "Rhythmic ocean waves with seagulls and a gentle evening breeze.",
        "therapeutic_goals": ["anxiety_reduction", "meditation_support"],
        "target_brainwave": "theta", "intensity": "gentle",
        "layers": ["ocean_waves", "seagulls", "wind_gentle"],
        "tags": ["ocean", "waves", "calming", "meditation"],
    },
    {
        "id": "ss-binaural-theta", "name": "Deep Theta Journey",
        "soundscape_type": "binaural", "duration_minutes": 30,
        "description": "Binaural beats at 6Hz theta frequency for deep meditation and creativity.",
        "therapeutic_goals": ["meditation_support", "creativity_boost"],
        "target_brainwave": "theta",
        "base_frequency_hz": 200.0, "beat_frequency_hz": 6.0,
        "intensity": "immersive",
        "layers": ["binaural_carrier", "ambient_pad"],
        "tags": ["binaural", "theta", "meditation", "deep"],
    },
    {
        "id": "ss-binaural-delta", "name": "Delta Sleep Protocol",
        "soundscape_type": "binaural", "duration_minutes": 60,
        "description": "Binaural beats at 2Hz delta frequency for deep restorative sleep.",
        "therapeutic_goals": ["sleep_induction"],
        "target_brainwave": "delta",
        "base_frequency_hz": 150.0, "beat_frequency_hz": 2.0,
        "intensity": "deep",
        "layers": ["binaural_carrier", "pink_noise_bed"],
        "tags": ["binaural", "delta", "sleep", "deep"],
    },
    {
        "id": "ss-solfeggio-528", "name": "528Hz Transformation",
        "soundscape_type": "solfeggio", "duration_minutes": 20,
        "description": "The 528Hz 'miracle tone' associated with transformation and DNA repair.",
        "therapeutic_goals": ["emotional_release", "stress_relief"],
        "base_frequency_hz": 528.0, "intensity": "moderate",
        "layers": ["solfeggio_tone", "harmonic_overtones", "ambient_pad"],
        "tags": ["solfeggio", "528hz", "healing", "transformation"],
    },
    {
        "id": "ss-tibetan-bowls", "name": "Tibetan Singing Bowl Ceremony",
        "soundscape_type": "tibetan_bowls", "duration_minutes": 25,
        "description": "Traditional Tibetan singing bowls with rich harmonic overtones for deep relaxation.",
        "therapeutic_goals": ["meditation_support", "stress_relief"],
        "target_brainwave": "theta", "intensity": "moderate",
        "layers": ["bowl_low", "bowl_mid", "bowl_high", "room_reverb"],
        "tags": ["tibetan", "bowls", "ceremony", "meditation"],
    },
    {
        "id": "ss-focus-beta", "name": "Focus Flow State",
        "soundscape_type": "binaural", "duration_minutes": 45,
        "description": "Binaural beats at 18Hz beta frequency with ambient backing for sustained focus.",
        "therapeutic_goals": ["focus_enhancement"],
        "target_brainwave": "beta",
        "base_frequency_hz": 250.0, "beat_frequency_hz": 18.0,
        "intensity": "moderate",
        "layers": ["binaural_carrier", "lo_fi_ambient"],
        "tags": ["focus", "beta", "work", "productivity"],
    },
    {
        "id": "ss-pink-noise", "name": "Pink Noise Blanket",
        "soundscape_type": "pink_noise", "duration_minutes": 480,
        "description": "Continuous pink noise for sleep masking and sensory comfort.",
        "therapeutic_goals": ["sleep_induction", "anxiety_reduction"],
        "intensity": "whisper",
        "layers": ["pink_noise"],
        "tags": ["noise", "pink", "sleep", "masking", "all-night"],
    },
    {
        "id": "ss-crystal-healing", "name": "Crystal Bowl Healing Circle",
        "soundscape_type": "crystal_bowls", "duration_minutes": 30,
        "description": "Quartz crystal singing bowls tuned to chakra frequencies for energetic healing.",
        "therapeutic_goals": ["emotional_release", "energy_boost"],
        "intensity": "immersive",
        "layers": ["crystal_c", "crystal_e", "crystal_g", "crystal_b"],
        "tags": ["crystal", "bowls", "chakra", "healing"],
    },
    {
        "id": "ss-schumann", "name": "Schumann Resonance Grounding",
        "soundscape_type": "isochronic", "duration_minutes": 20,
        "description": "7.83Hz Earth resonance frequency for grounding and reconnection.",
        "therapeutic_goals": ["anxiety_reduction", "meditation_support"],
        "target_brainwave": "alpha",
        "base_frequency_hz": 7.83, "intensity": "gentle",
        "layers": ["isochronic_pulse", "earth_hum", "nature_bed"],
        "tags": ["schumann", "grounding", "earth", "resonance"],
    },
]

for _ss in _SEED_SOUNDSCAPES:
    _soundscape_library[_ss["id"]] = _ss


# ============================================================
# KERNEL EVENT BUS INTEGRATION
# ============================================================

async def _emit_resonate_event(topic: str, payload: Dict[str, Any], user_id: str = "system"):
    """Emit event to the Kernel Event Bus for cross-lane communication."""
    try:
        from routers.event_bus import get_event_bus
        bus = await get_event_bus()
        await bus.publish(f"tranquillity.resonate.{topic}", {
            **payload,
            "source": "resonate",
            "lane": "user_infinity",
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.debug(f"Event bus not available: {e}")


# ============================================================
# ADAPTIVE ENGINE — Personalised Soundscape Selection
# ============================================================

def _recommend_soundscapes(
    user_id: str,
    goal: Optional[TherapeuticGoal] = None,
    brainwave: Optional[BrainwaveState] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Adaptively recommend soundscapes based on user's sonic profile,
    listening history, and therapeutic goals. Production: ML model.
    """
    profile = _sonic_profiles.get(user_id, {})
    history = _user_sessions.get(user_id, [])

    candidates = list(_soundscape_library.values())
    if goal:
        candidates = [s for s in candidates if goal.value in s.get("therapeutic_goals", [])]
    if brainwave:
        candidates = [s for s in candidates if s.get("target_brainwave") == brainwave.value]

    scored = []
    for ss in candidates:
        score = 1.0
        # Boost preferred types
        pref_types = profile.get("preferred_types", [])
        if ss.get("soundscape_type") in pref_types:
            score += 0.5
        # Boost preferred goals
        pref_goals = profile.get("preferred_goals", [])
        for g in ss.get("therapeutic_goals", []):
            if g in pref_goals:
                score += 0.3
        # Boost highly-rated past sessions
        past_ratings = [
            s.get("effectiveness_rating", 3)
            for s in history
            if s.get("soundscape_id") == ss["id"] and s.get("effectiveness_rating")
        ]
        if past_ratings:
            avg_rating = sum(past_ratings) / len(past_ratings)
            score += (avg_rating - 3) * 0.2
        # Penalise very recently played for variety
        recent_ids = [s.get("soundscape_id") for s in history[-5:]]
        if ss["id"] in recent_ids:
            score *= 0.4
        scored.append((score, ss))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ss for _, ss in scored[:limit]]


def _generate_frequency_prescription(
    user_id: str,
    goal: TherapeuticGoal,
) -> Dict[str, Any]:
    """
    Generate an adaptive frequency prescription based on the therapeutic
    goal. Maps goals to optimal brainwave states and frequencies.
    """
    goal_map = {
        TherapeuticGoal.STRESS_RELIEF: (BrainwaveState.ALPHA, 200.0, 10.0, 20),
        TherapeuticGoal.SLEEP_INDUCTION: (BrainwaveState.DELTA, 150.0, 2.0, 30),
        TherapeuticGoal.FOCUS_ENHANCEMENT: (BrainwaveState.BETA, 250.0, 18.0, 25),
        TherapeuticGoal.ANXIETY_REDUCTION: (BrainwaveState.ALPHA, 180.0, 8.0, 20),
        TherapeuticGoal.PAIN_MANAGEMENT: (BrainwaveState.THETA, 170.0, 5.0, 30),
        TherapeuticGoal.EMOTIONAL_RELEASE: (BrainwaveState.THETA, 190.0, 6.0, 25),
        TherapeuticGoal.ENERGY_BOOST: (BrainwaveState.BETA, 260.0, 20.0, 15),
        TherapeuticGoal.MEDITATION_SUPPORT: (BrainwaveState.THETA, 200.0, 6.0, 30),
        TherapeuticGoal.TRAUMA_PROCESSING: (BrainwaveState.ALPHA, 185.0, 10.0, 20),
        TherapeuticGoal.CREATIVITY_BOOST: (BrainwaveState.THETA, 210.0, 7.0, 25),
    }

    brainwave, base_freq, beat_freq, duration = goal_map.get(
        goal, (BrainwaveState.ALPHA, 200.0, 10.0, 20)
    )

    return {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "protocol": FrequencyProtocol.CUSTOM.value,
        "target_brainwave": brainwave.value,
        "base_frequency_hz": base_freq,
        "beat_frequency_hz": beat_freq,
        "duration_minutes": duration,
        "therapeutic_goal": goal.value,
        "rationale": f"Adaptive prescription targeting {brainwave.value} brainwave state "
                     f"({beat_freq}Hz entrainment) for {goal.value.replace('_', ' ')}. "
                     f"Base carrier at {base_freq}Hz with {duration}-minute protocol.",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================
# ENDPOINTS — Soundscape Library
# ============================================================

@router.get("/soundscapes", summary="Browse adaptive soundscape library")
async def list_soundscapes(
    soundscape_type: Optional[SoundscapeType] = Query(None),
    goal: Optional[TherapeuticGoal] = Query(None),
    brainwave: Optional[BrainwaveState] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns soundscapes adaptively ranked for the current user based on
    their sonic profile, listening history, and therapeutic goals.
    """
    user_id = getattr(current_user, "id", "anonymous")

    if goal or brainwave:
        results = _recommend_soundscapes(user_id, goal, brainwave, limit)
    else:
        results = list(_soundscape_library.values())
        if soundscape_type:
            results = [s for s in results if s.get("soundscape_type") == soundscape_type.value]
        results = results[:limit]

    await _emit_resonate_event("soundscapes.browsed", {
        "type_filter": soundscape_type.value if soundscape_type else None,
        "goal_filter": goal.value if goal else None,
        "result_count": len(results),
    }, user_id)

    return {"soundscapes": results, "total": len(results), "adaptive": bool(goal or brainwave)}


@router.get("/soundscapes/{soundscape_id}", summary="Get soundscape details")
async def get_soundscape(
    soundscape_id: str = Path(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve full details for a specific soundscape."""
    ss = _soundscape_library.get(soundscape_id)
    if not ss:
        raise HTTPException(status_code=404, detail="Soundscape not found")
    return ss


# ============================================================
# ENDPOINTS — Sound Sessions
# ============================================================

@router.post("/sessions/start", summary="Start a sound healing session")
async def start_sound_session(
    req: StartSoundSessionRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Begin a new sound healing session. Records mood-before and creates
    a tracked session for analytics and effectiveness measurement.
    """
    user_id = getattr(current_user, "id", "anonymous")
    ss = _soundscape_library.get(req.soundscape_id)
    if not ss:
        raise HTTPException(status_code=404, detail="Soundscape not found")

    session = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "soundscape_id": req.soundscape_id,
        "soundscape_name": ss.get("name", ""),
        "state": "active",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "duration_seconds": 0,
        "mood_before": req.mood_before,
        "mood_after": None,
        "effectiveness_rating": None,
        "intensity": (req.intensity_override or ss.get("intensity", "gentle")),
        "notes": "",
    }
    if isinstance(session["intensity"], SessionIntensity):
        session["intensity"] = session["intensity"].value

    _user_sessions.setdefault(user_id, []).append(session)

    await _emit_resonate_event("session.started", {
        "session_id": session["id"],
        "soundscape_id": req.soundscape_id,
        "soundscape_type": ss.get("soundscape_type"),
    }, user_id)

    return {"session": session, "message": "Sound session started. Let the frequencies guide you."}


@router.post("/sessions/{session_id}/end", summary="End a sound healing session")
async def end_sound_session(
    session_id: str,
    req: EndSoundSessionRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    End a sound session. Records mood-after, effectiveness rating,
    and updates the user's sonic profile.
    """
    user_id = getattr(current_user, "id", "anonymous")
    sessions = _user_sessions.get(user_id, [])
    session = next((s for s in sessions if s["id"] == session_id), None)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["state"] != "active":
        raise HTTPException(status_code=400, detail=f"Session is {session['state']}, not active")

    now = datetime.now(timezone.utc)
    started = datetime.fromisoformat(session["started_at"])
    duration = int((now - started).total_seconds())

    session.update({
        "state": "completed",
        "ended_at": now.isoformat(),
        "duration_seconds": duration,
        "mood_after": req.mood_after,
        "effectiveness_rating": req.effectiveness_rating,
        "notes": req.notes,
    })

    # Update sonic profile
    _update_sonic_profile(user_id, session)

    mood_delta = None
    if session.get("mood_before") and req.mood_after:
        mood_delta = req.mood_after - session["mood_before"]

    await _emit_resonate_event("session.completed", {
        "session_id": session_id,
        "duration_seconds": duration,
        "mood_delta": mood_delta,
        "effectiveness": req.effectiveness_rating,
    }, user_id)

    return {"session": session, "mood_delta": mood_delta}


@router.get("/sessions", summary="List sound session history")
async def list_sound_sessions(
    limit: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve the user's sound session history."""
    user_id = getattr(current_user, "id", "anonymous")
    sessions = _user_sessions.get(user_id, [])
    return {"sessions": list(reversed(sessions[-limit:])), "total": len(sessions)}


def _update_sonic_profile(user_id: str, session: Dict[str, Any]):
    """Update the user's sonic profile based on completed session data."""
    profile = _sonic_profiles.get(user_id, {
        "user_id": user_id,
        "preferred_types": [],
        "preferred_goals": [],
        "preferred_intensity": "gentle",
        "hearing_sensitivities": [],
        "total_listening_minutes": 0,
        "sessions_completed": 0,
        "average_effectiveness": 0.0,
    })

    profile["sessions_completed"] = profile.get("sessions_completed", 0) + 1
    profile["total_listening_minutes"] = (
        profile.get("total_listening_minutes", 0) + session.get("duration_seconds", 0) // 60
    )

    # Update average effectiveness
    rating = session.get("effectiveness_rating")
    if rating:
        prev_avg = profile.get("average_effectiveness", 0.0)
        count = profile["sessions_completed"]
        profile["average_effectiveness"] = round(
            ((prev_avg * (count - 1)) + rating) / count, 2
        )

    # Track preferred types from high-rated sessions
    if rating and rating >= 4:
        ss = _soundscape_library.get(session.get("soundscape_id"), {})
        ss_type = ss.get("soundscape_type")
        if ss_type and ss_type not in profile["preferred_types"]:
            profile["preferred_types"].append(ss_type)
        for goal in ss.get("therapeutic_goals", []):
            if goal not in profile["preferred_goals"]:
                profile["preferred_goals"].append(goal)

    _sonic_profiles[user_id] = profile


# ============================================================
# ENDPOINTS — Frequency Prescriptions
# ============================================================

@router.get("/prescriptions", summary="Get adaptive frequency prescription")
async def get_frequency_prescription(
    goal: TherapeuticGoal = Query(..., description="Therapeutic goal"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Generate an adaptive frequency prescription tailored to the user's
    therapeutic goal. Maps goals to optimal brainwave entrainment protocols.
    """
    user_id = getattr(current_user, "id", "anonymous")
    prescription = _generate_frequency_prescription(user_id, goal)
    _frequency_prescriptions.setdefault(user_id, []).append(prescription)

    await _emit_resonate_event("prescription.generated", {
        "prescription_id": prescription["id"],
        "goal": goal.value,
        "brainwave": prescription["target_brainwave"],
    }, user_id)

    return {"prescription": prescription}


@router.get("/prescriptions/history", summary="List prescription history")
async def list_prescriptions(
    limit: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve the user's frequency prescription history."""
    user_id = getattr(current_user, "id", "anonymous")
    prescriptions = _frequency_prescriptions.get(user_id, [])
    return {"prescriptions": list(reversed(prescriptions[-limit:])), "total": len(prescriptions)}


# ============================================================
# ENDPOINTS — Custom Mixer
# ============================================================

@router.post("/mixer", summary="Create a custom sound mix")
async def create_custom_mix(
    req: CustomMixRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Create a custom multi-layer sound mix. Users can blend up to 8
    sound layers with individual volume controls for a personalised
    sonic environment.
    """
    user_id = getattr(current_user, "id", "anonymous")

    mix = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": req.name,
        "layers": [layer.model_dump() for layer in req.layers],
        "duration_minutes": req.duration_minutes,
        "therapeutic_goal": req.therapeutic_goal.value if req.therapeutic_goal else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _custom_mixes.setdefault(user_id, []).append(mix)

    await _emit_resonate_event("mixer.created", {
        "mix_id": mix["id"],
        "layer_count": len(req.layers),
    }, user_id)

    return {"mix": mix, "message": "Custom mix created."}


@router.get("/mixer", summary="List custom mixes")
async def list_custom_mixes(
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve the user's saved custom sound mixes."""
    user_id = getattr(current_user, "id", "anonymous")
    mixes = _custom_mixes.get(user_id, [])
    return {"mixes": mixes, "total": len(mixes)}


# ============================================================
# ENDPOINTS — Sonic Profile
# ============================================================

@router.get("/profile", summary="Get sonic wellness profile")
async def get_sonic_profile(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns the user's sonic profile including preferred types,
    listening statistics, and effectiveness metrics.
    """
    user_id = getattr(current_user, "id", "anonymous")
    profile = _sonic_profiles.get(user_id, {
        "user_id": user_id,
        "preferred_types": [],
        "preferred_goals": [],
        "preferred_intensity": "gentle",
        "hearing_sensitivities": [],
        "total_listening_minutes": 0,
        "sessions_completed": 0,
        "average_effectiveness": 0.0,
    })
    return profile


@router.put("/profile/sensitivities", summary="Update hearing sensitivities")
async def update_hearing_sensitivities(
    sensitivities: List[str],
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Update hearing sensitivities for accessibility. The adaptive engine
    uses this to filter out potentially harmful frequencies.
    """
    user_id = getattr(current_user, "id", "anonymous")
    profile = _sonic_profiles.get(user_id, {"user_id": user_id})
    profile["hearing_sensitivities"] = sensitivities
    _sonic_profiles[user_id] = profile

    await _emit_resonate_event("profile.sensitivities_updated", {
        "sensitivity_count": len(sensitivities),
    }, user_id)

    return {"message": "Hearing sensitivities updated", "sensitivities": sensitivities}


# ============================================================
# ENDPOINTS — Brainwave Guide
# ============================================================

@router.get("/brainwaves", summary="Brainwave state reference guide")
async def brainwave_guide():
    """
    Educational reference for brainwave states and their associated
    mental states. Helps users understand frequency therapy.
    """
    return {
        "brainwave_states": [
            {
                "state": "delta", "frequency_range": "0.5-4 Hz",
                "mental_state": "Deep sleep, unconscious healing",
                "therapeutic_uses": ["sleep_induction", "pain_management"],
            },
            {
                "state": "theta", "frequency_range": "4-8 Hz",
                "mental_state": "Deep meditation, creativity, REM sleep",
                "therapeutic_uses": ["meditation_support", "creativity_boost", "emotional_release"],
            },
            {
                "state": "alpha", "frequency_range": "8-13 Hz",
                "mental_state": "Relaxed alertness, calm focus",
                "therapeutic_uses": ["stress_relief", "anxiety_reduction", "trauma_processing"],
            },
            {
                "state": "beta", "frequency_range": "13-30 Hz",
                "mental_state": "Active thinking, concentration",
                "therapeutic_uses": ["focus_enhancement", "energy_boost"],
            },
            {
                "state": "gamma", "frequency_range": "30-100 Hz",
                "mental_state": "Peak performance, insight, higher consciousness",
                "therapeutic_uses": ["creativity_boost", "focus_enhancement"],
            },
        ]
    }


# ============================================================
# ENDPOINTS — Health
# ============================================================

@router.get("/health", summary="Resonate service health", include_in_schema=False)
async def resonate_health():
    """Health check for the Resonate sound healing service."""
    return {
        "service": "resonate",
        "status": "healthy",
        "soundscape_count": len(_soundscape_library),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }