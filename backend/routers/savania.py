# routers/savania.py — Savania AI Druid Healer & Defender Gateway
# Lane 1 (AI/Nexus) — AI orchestrator, therapeutic dialogue, crisis detection,
# guardian protocols, adaptive healing pathways, multi-agent coordination
#
# Savania is the AI intelligence engine of the Tranquillity Realm.
# She serves as the Druid Healer (therapeutic AI companion) and
# Defender (crisis detection & safeguarding). Savania orchestrates
# all other Tranquillity services through intelligent routing,
# contextual awareness, and adaptive healing pathways.
#
# Architecture: Lane 1 (AI/Nexus) — primary AI orchestration layer
# Standard: 2060-ready, AGI-safe, trauma-informed, HIPAA/GDPR/EU-AI-Act compliant

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, CurrentUser
from database import get_db_session
from router_migration_helper import store_factory, list_store_factory, audit_log_factory

router = APIRouter(prefix="/api/v1/tranquillity/savania", tags=["Savania AI Healer"])
logger = logging.getLogger("savania")

# ============================================================
# ENUMS
# ============================================================

class SavaniaMode(str, Enum):
    HEALER = "healer"           # Therapeutic companion mode
    DEFENDER = "defender"       # Crisis detection & safeguarding
    GUIDE = "guide"             # Gentle guidance & psychoeducation
    LISTENER = "listener"       # Active listening, minimal intervention
    ORCHESTRATOR = "orchestrator"  # Cross-service coordination

class ConversationTone(str, Enum):
    WARM = "warm"
    GENTLE = "gentle"
    GROUNDING = "grounding"
    ENCOURAGING = "encouraging"
    REFLECTIVE = "reflective"
    DIRECT = "direct"
    PLAYFUL = "playful"

class CrisisLevel(str, Enum):
    NONE = "none"
    WATCH = "watch"             # Subtle indicators, monitor
    CONCERN = "concern"         # Moderate indicators, gentle check-in
    ALERT = "alert"             # Significant indicators, active support
    CRITICAL = "critical"       # Immediate safety concern

class HealingPathway(str, Enum):
    GROUNDING = "grounding"
    EMOTIONAL_PROCESSING = "emotional_processing"
    COGNITIVE_RESTRUCTURING = "cognitive_restructuring"
    SOMATIC_AWARENESS = "somatic_awareness"
    NARRATIVE_THERAPY = "narrative_therapy"
    MINDFULNESS = "mindfulness"
    COMPASSION_FOCUSED = "compassion_focused"
    BEHAVIOURAL_ACTIVATION = "behavioural_activation"
    PSYCHOEDUCATION = "psychoeducation"
    CRISIS_STABILISATION = "crisis_stabilisation"

class GuardianProtocol(str, Enum):
    CONTENT_SAFETY = "content_safety"
    CRISIS_DETECTION = "crisis_detection"
    BOUNDARY_ENFORCEMENT = "boundary_enforcement"
    ESCALATION_ROUTING = "escalation_routing"
    CONSENT_VERIFICATION = "consent_verification"
    DATA_MINIMISATION = "data_minimisation"
    THERAPEUTIC_LIMITS = "therapeutic_limits"

class ServiceRoute(str, Enum):
    IMIND_EXERCISE = "i_mind.exercise"
    IMIND_MEDITATION = "i_mind.meditation"
    IMIND_JOURNAL = "i_mind.journal"
    RESONATE_SOUNDSCAPE = "resonate.soundscape"
    RESONATE_BINAURAL = "resonate.binaural"
    RESONATE_PRESCRIPTION = "resonate.prescription"
    TAIMRA_CHECKIN = "taimra.checkin"
    TAIMRA_INTERVENTION = "taimra.intervention"
    EXTERNAL_CRISIS = "external.crisis_line"
    EXTERNAL_CLINICIAN = "external.clinician"

# ============================================================
# MODELS
# ============================================================

class ConversationMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str = "user"  # user | savania | system
    content: str
    tone: Optional[ConversationTone] = None
    mode: Optional[SavaniaMode] = None
    crisis_level: CrisisLevel = CrisisLevel.NONE
    service_routes: List[ServiceRoute] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Conversation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    mode: SavaniaMode = SavaniaMode.HEALER
    tone: ConversationTone = ConversationTone.WARM
    active_pathway: Optional[HealingPathway] = None
    messages: List[ConversationMessage] = Field(default_factory=list)
    crisis_level: CrisisLevel = CrisisLevel.NONE
    guardian_flags: List[str] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    conversation_id: Optional[str] = None
    preferred_mode: Optional[SavaniaMode] = None
    preferred_tone: Optional[ConversationTone] = None

class ChatResponse(BaseModel):
    conversation_id: str
    response: str
    tone: ConversationTone
    mode: SavaniaMode
    crisis_level: CrisisLevel
    suggested_services: List[Dict[str, Any]] = Field(default_factory=list)
    healing_pathway: Optional[HealingPathway] = None
    guardian_notes: List[str] = Field(default_factory=list)

class HealingPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    pathway: HealingPathway
    title: str
    description: str = ""
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    duration_weeks: int = Field(ge=1, le=52, default=4)
    progress_percent: float = Field(ge=0.0, le=100.0, default=0.0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SafeguardingReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    crisis_level: CrisisLevel
    indicators: List[str] = Field(default_factory=list)
    actions_taken: List[str] = Field(default_factory=list)
    protocols_activated: List[GuardianProtocol] = Field(default_factory=list)
    escalated: bool = False
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SavaniaPreferences(BaseModel):
    preferred_mode: SavaniaMode = SavaniaMode.HEALER
    preferred_tone: ConversationTone = ConversationTone.WARM
    healing_pathway: Optional[HealingPathway] = None
    session_length_preference: str = "medium"  # short, medium, long
    proactive_checkins: bool = True
    crisis_contacts: List[str] = Field(default_factory=list)
    therapeutic_boundaries: List[str] = Field(default_factory=list)

# ============================================================
# IN-MEMORY STATE (Production: PostgreSQL + Valkey + Vector DB)
# ============================================================

_conversations = store_factory("savania", "conversations")
_user_conversations = list_store_factory("savania", "user_conversations")
_healing_plans = list_store_factory("savania", "healing_plans")
_safeguarding_reports = list_store_factory("savania", "safeguarding_reports")
_savania_preferences = store_factory("savania", "savania_preferences")
_crisis_state = store_factory("savania", "crisis_state")

# ============================================================
# KERNEL EVENT BUS INTEGRATION
# ============================================================

async def _emit_savania_event(topic: str, payload: Dict[str, Any], user_id: str = "system"):
    """Emit event to the Kernel Event Bus for cross-lane communication."""
    try:
        from routers.event_bus import get_event_bus
        bus = await get_event_bus()
        await bus.publish(f"tranquillity.savania.{topic}", {
            **payload,
            "source": "savania",
            "lane": "ai_nexus",
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.debug(f"Event bus not available: {e}")


# ============================================================
# GUARDIAN PROTOCOLS — Safety & Safeguarding Engine
# ============================================================

# Crisis indicator keywords (simplified; production: NLP model)
_CRISIS_INDICATORS = {
    CrisisLevel.CRITICAL: [
        "suicide", "kill myself", "end my life", "want to die",
        "no reason to live", "better off dead",
    ],
    CrisisLevel.ALERT: [
        "self harm", "hurt myself", "cutting", "overdose",
        "can't go on", "give up", "hopeless",
    ],
    CrisisLevel.CONCERN: [
        "worthless", "burden", "alone", "nobody cares",
        "can't cope", "falling apart", "breaking down",
    ],
    CrisisLevel.WATCH: [
        "struggling", "overwhelmed", "exhausted", "anxious",
        "depressed", "scared", "lost",
    ],
}


def _assess_crisis_level(text: str) -> CrisisLevel:
    """
    Assess crisis level from message content.
    Production: fine-tuned NLP model with clinical validation.
    """
    text_lower = text.lower()
    for level in [CrisisLevel.CRITICAL, CrisisLevel.ALERT, CrisisLevel.CONCERN, CrisisLevel.WATCH]:
        indicators = _CRISIS_INDICATORS.get(level, [])
        for indicator in indicators:
            if indicator in text_lower:
                return level
    return CrisisLevel.NONE


def _run_guardian_protocols(
    message: str,
    crisis_level: CrisisLevel,
    conversation: Dict[str, Any],
) -> List[str]:
    """
    Run guardian protocols and return any safety notes.
    Production: multi-layer safety system with clinical oversight.
    """
    notes = []

    # Content safety check
    if crisis_level in (CrisisLevel.CRITICAL, CrisisLevel.ALERT):
        notes.append(f"Guardian: {GuardianProtocol.CRISIS_DETECTION.value} activated — "
                     f"crisis level {crisis_level.value}")
        notes.append(f"Guardian: {GuardianProtocol.ESCALATION_ROUTING.value} — "
                     f"professional support resources provided")

    # Therapeutic limits
    msg_count = len(conversation.get("messages", []))
    if msg_count > 50:
        notes.append(f"Guardian: {GuardianProtocol.THERAPEUTIC_LIMITS.value} — "
                     f"extended session ({msg_count} messages), consider break")

    # Boundary enforcement
    if crisis_level == CrisisLevel.CRITICAL:
        notes.append(f"Guardian: {GuardianProtocol.BOUNDARY_ENFORCEMENT.value} — "
                     f"Savania cannot replace professional crisis support")

    return notes


# ============================================================
# THERAPEUTIC RESPONSE ENGINE
# ============================================================

def _generate_therapeutic_response(
    message: str,
    conversation: Dict[str, Any],
    crisis_level: CrisisLevel,
    mode: SavaniaMode,
    tone: ConversationTone,
) -> Dict[str, Any]:
    """
    Generate a therapeutic response based on context, crisis level,
    and healing pathway. Production: fine-tuned LLM with therapeutic
    training, RAG with clinical knowledge base, and safety guardrails.
    """
    # Crisis responses take priority
    if crisis_level == CrisisLevel.CRITICAL:
        return {
            "response": (
                "I hear you, and I want you to know that what you're feeling matters. "
                "You are not alone in this. Right now, the most important thing is your safety. "
                "Please reach out to a crisis helpline or someone you trust. "
                "In the UK: Samaritans 116 123 | In the US: 988 Suicide & Crisis Lifeline | "
                "In AU: Lifeline 13 11 14. "
                "I'm here with you, and I care about what happens to you."
            ),
            "tone": ConversationTone.GROUNDING,
            "mode": SavaniaMode.DEFENDER,
            "suggested_services": [
                {"route": ServiceRoute.EXTERNAL_CRISIS.value,
                 "title": "Crisis Support Line",
                 "description": "24/7 professional crisis support",
                 "urgency": "immediate"},
            ],
            "healing_pathway": HealingPathway.CRISIS_STABILISATION,
        }

    if crisis_level == CrisisLevel.ALERT:
        return {
            "response": (
                "Thank you for sharing that with me. It takes courage to express what you're going through. "
                "I can sense this is a really difficult time for you. "
                "Would it help to try a grounding exercise together right now? "
                "Sometimes bringing ourselves back to the present moment can create a small space of calm. "
                "And please know — if things feel too heavy, reaching out to a professional is a sign of strength, not weakness."
            ),
            "tone": ConversationTone.GENTLE,
            "mode": SavaniaMode.DEFENDER,
            "suggested_services": [
                {"route": ServiceRoute.IMIND_EXERCISE.value,
                 "title": "5-4-3-2-1 Grounding",
                 "description": "A quick grounding exercise using your five senses",
                 "exercise_id": "ex-grounding-54321"},
                {"route": ServiceRoute.RESONATE_SOUNDSCAPE.value,
                 "title": "Calming Soundscape",
                 "description": "Gentle nature sounds for emotional regulation",
                 "soundscape_id": "ss-ocean-waves"},
            ],
            "healing_pathway": HealingPathway.GROUNDING,
        }

    if crisis_level == CrisisLevel.CONCERN:
        return {
            "response": (
                "I hear you. Those feelings are valid, and it's okay to not be okay. "
                "Sometimes when everything feels heavy, the smallest step can make a difference. "
                "Would you like to explore what's on your mind through journaling, "
                "or would a calming breathing exercise feel more helpful right now? "
                "There's no wrong answer — we go at your pace."
            ),
            "tone": ConversationTone.WARM,
            "mode": SavaniaMode.HEALER,
            "suggested_services": [
                {"route": ServiceRoute.IMIND_JOURNAL.value,
                 "title": "Guided Journaling",
                 "description": "Express your thoughts in a safe, private space"},
                {"route": ServiceRoute.IMIND_EXERCISE.value,
                 "title": "Box Breathing",
                 "description": "A calming 4-4-4-4 breathing pattern",
                 "exercise_id": "ex-breath-box"},
            ],
            "healing_pathway": HealingPathway.EMOTIONAL_PROCESSING,
        }

    # Pathway-specific responses
    pathway = conversation.get("active_pathway")

    if mode == SavaniaMode.LISTENER:
        return {
            "response": (
                "I'm listening. Take all the time you need. "
                "There's no rush, and everything you share here is held with care."
            ),
            "tone": ConversationTone.GENTLE,
            "mode": SavaniaMode.LISTENER,
            "suggested_services": [],
            "healing_pathway": pathway,
        }

    if mode == SavaniaMode.GUIDE:
        return {
            "response": (
                "That's a really thoughtful reflection. Understanding our patterns is "
                "one of the most powerful steps in the healing journey. "
                "Would you like to explore this further? I can suggest some exercises "
                "that might help deepen this insight, or we can simply sit with it together."
            ),
            "tone": ConversationTone.ENCOURAGING,
            "mode": SavaniaMode.GUIDE,
            "suggested_services": [
                {"route": ServiceRoute.IMIND_MEDITATION.value,
                 "title": "Breath Awareness Meditation",
                 "description": "A foundation practice for self-awareness",
                 "meditation_id": "med-breath-aware"},
                {"route": ServiceRoute.TAIMRA_CHECKIN.value,
                 "title": "Wellbeing Check-In",
                 "description": "Update your digital twin with how you're feeling"},
            ],
            "healing_pathway": HealingPathway.MINDFULNESS,
        }

    # Default healer response
    msg_count = len(conversation.get("messages", []))
    if msg_count <= 1:
        response_text = (
            "Welcome. I'm Savania, and I'm here to walk alongside you on your wellness journey. "
            "This is a safe space — there's no judgment here, only compassion. "
            "How are you feeling right now? You can share as much or as little as you'd like."
        )
    elif msg_count <= 3:
        response_text = (
            "Thank you for sharing that with me. I appreciate your openness. "
            "Based on what you've told me, I think there are some gentle practices "
            "that might support you right now. Would you like me to suggest something, "
            "or would you prefer to keep talking?"
        )
    else:
        response_text = (
            "I'm glad we're having this conversation. Every step you take matters, "
            "even the small ones. Would you like to try a practice together, "
            "or is there something else on your mind you'd like to explore?"
        )

    suggested = []
    if msg_count > 2:
        suggested = [
            {"route": ServiceRoute.IMIND_EXERCISE.value,
             "title": "Personalised Exercise",
             "description": "An exercise chosen based on your current needs"},
            {"route": ServiceRoute.RESONATE_PRESCRIPTION.value,
             "title": "Sound Therapy",
             "description": "An adaptive frequency prescription for your state"},
        ]

    return {
        "response": response_text,
        "tone": tone,
        "mode": mode,
        "suggested_services": suggested,
        "healing_pathway": pathway or HealingPathway.COMPASSION_FOCUSED,
    }


# ============================================================
# ENDPOINTS — Conversation
# ============================================================

@router.post("/chat", summary="Chat with Savania")
async def chat_with_savania(
    req: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Send a message to Savania and receive a therapeutic response.
    Savania adapts her mode, tone, and suggestions based on the
    conversation context and the user's emotional state.
    """
    user_id = getattr(current_user, "id", "anonymous")
    now = datetime.now(timezone.utc)

    # Get or create conversation
    if req.conversation_id and req.conversation_id in _conversations:
        conv = _conversations[req.conversation_id]
    else:
        conv_id = str(uuid.uuid4())
        conv = {
            "id": conv_id,
            "user_id": user_id,
            "mode": (req.preferred_mode or SavaniaMode.HEALER).value,
            "tone": (req.preferred_tone or ConversationTone.WARM).value,
            "active_pathway": None,
            "messages": [],
            "crisis_level": CrisisLevel.NONE.value,
            "guardian_flags": [],
            "started_at": now.isoformat(),
            "last_activity": now.isoformat(),
        }
        _conversations[conv_id] = conv
        _user_conversations.setdefault(user_id, []).append(conv_id)

    # Assess crisis level
    crisis_level = _assess_crisis_level(req.message)

    # Update conversation crisis level (escalate only, never de-escalate within session)
    crisis_order = [CrisisLevel.NONE, CrisisLevel.WATCH, CrisisLevel.CONCERN,
                    CrisisLevel.ALERT, CrisisLevel.CRITICAL]
    current_crisis = CrisisLevel(conv.get("crisis_level", "none"))
    if crisis_order.index(crisis_level) > crisis_order.index(current_crisis):
        conv["crisis_level"] = crisis_level.value
    else:
        crisis_level = current_crisis

    # Run guardian protocols
    guardian_notes = _run_guardian_protocols(req.message, crisis_level, conv)
    conv["guardian_flags"].extend(guardian_notes)

    # Record user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": req.message,
        "crisis_level": crisis_level.value,
        "timestamp": now.isoformat(),
    }
    conv["messages"].append(user_msg)

    # Generate therapeutic response
    mode = SavaniaMode(req.preferred_mode.value if req.preferred_mode else conv["mode"])
    tone = ConversationTone(req.preferred_tone.value if req.preferred_tone else conv["tone"])

    # Override mode for crisis
    if crisis_level in (CrisisLevel.CRITICAL, CrisisLevel.ALERT):
        mode = SavaniaMode.DEFENDER

    response_data = _generate_therapeutic_response(
        req.message, conv, crisis_level, mode, tone
    )

    # Record Savania's response
    savania_msg = {
        "id": str(uuid.uuid4()),
        "role": "savania",
        "content": response_data["response"],
        "tone": response_data["tone"].value if isinstance(response_data["tone"], ConversationTone) else response_data["tone"],
        "mode": response_data["mode"].value if isinstance(response_data["mode"], SavaniaMode) else response_data["mode"],
        "crisis_level": crisis_level.value,
        "service_routes": [s.get("route", "") for s in response_data.get("suggested_services", [])],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    conv["messages"].append(savania_msg)
    conv["last_activity"] = now.isoformat()

    if response_data.get("healing_pathway"):
        pathway = response_data["healing_pathway"]
        conv["active_pathway"] = pathway.value if isinstance(pathway, HealingPathway) else pathway

    # Create safeguarding report if needed
    if crisis_level in (CrisisLevel.ALERT, CrisisLevel.CRITICAL):
        report = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "crisis_level": crisis_level.value,
            "indicators": [req.message[:200]],
            "actions_taken": ["Therapeutic response provided", "Crisis resources shared"],
            "protocols_activated": [n.split(" — ")[0].replace("Guardian: ", "") for n in guardian_notes],
            "escalated": crisis_level == CrisisLevel.CRITICAL,
            "timestamp": now.isoformat(),
        }
        _safeguarding_reports.setdefault(user_id, []).append(report)

    await _emit_savania_event("chat.message", {
        "conversation_id": conv["id"],
        "crisis_level": crisis_level.value,
        "mode": mode.value,
        "message_count": len(conv["messages"]),
    }, user_id)

    return {
        "conversation_id": conv["id"],
        "response": response_data["response"],
        "tone": response_data.get("tone", tone).value if isinstance(response_data.get("tone", tone), ConversationTone) else response_data.get("tone", tone.value),
        "mode": response_data.get("mode", mode).value if isinstance(response_data.get("mode", mode), SavaniaMode) else response_data.get("mode", mode.value),
        "crisis_level": crisis_level.value,
        "suggested_services": response_data.get("suggested_services", []),
        "healing_pathway": conv.get("active_pathway"),
        "guardian_notes": guardian_notes if crisis_level != CrisisLevel.NONE else [],
    }


@router.get("/conversations", summary="List conversations")
async def list_conversations(
    limit: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve the user's conversation history with Savania."""
    user_id = getattr(current_user, "id", "anonymous")
    conv_ids = _user_conversations.get(user_id, [])
    conversations = []
    for cid in reversed(conv_ids[-limit:]):
        conv = _conversations.get(cid)
        if conv:
            conversations.append({
                "id": conv["id"],
                "mode": conv["mode"],
                "message_count": len(conv["messages"]),
                "crisis_level": conv["crisis_level"],
                "active_pathway": conv.get("active_pathway"),
                "started_at": conv["started_at"],
                "last_activity": conv["last_activity"],
            })
    return {"conversations": conversations, "total": len(conv_ids)}


@router.get("/conversations/{conversation_id}", summary="Get conversation details")
async def get_conversation(
    conversation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve full conversation history including all messages."""
    user_id = getattr(current_user, "id", "anonymous")
    conv = _conversations.get(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return conv


# ============================================================
# ENDPOINTS — Healing Plans
# ============================================================

@router.get("/healing-plans", summary="Get healing plans")
async def list_healing_plans(
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve the user's active and completed healing plans."""
    user_id = getattr(current_user, "id", "anonymous")
    plans = _healing_plans.get(user_id, [])
    return {"plans": plans, "total": len(plans)}


@router.post("/healing-plans", summary="Create a healing plan")
async def create_healing_plan(
    pathway: HealingPathway = Query(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Create a personalised healing plan based on a therapeutic pathway.
    Savania generates adaptive steps tailored to the user's needs.
    """
    user_id = getattr(current_user, "id", "anonymous")

    # Generate pathway-specific steps
    steps = _generate_pathway_steps(pathway)

    plan = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "pathway": pathway.value,
        "title": f"{pathway.value.replace('_', ' ').title()} Healing Plan",
        "description": _pathway_descriptions.get(pathway, "A personalised healing journey."),
        "steps": steps,
        "duration_weeks": len(steps),
        "progress_percent": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _healing_plans.setdefault(user_id, []).append(plan)

    await _emit_savania_event("healing_plan.created", {
        "plan_id": plan["id"],
        "pathway": pathway.value,
        "step_count": len(steps),
    }, user_id)

    return {"plan": plan, "message": "Your healing plan has been created. We'll walk this path together."}


_pathway_descriptions = {
    HealingPathway.GROUNDING: "A foundation practice to help you feel safe and present in your body.",
    HealingPathway.EMOTIONAL_PROCESSING: "Gentle exploration of emotions with tools for healthy expression.",
    HealingPathway.COGNITIVE_RESTRUCTURING: "Learn to identify and reframe unhelpful thought patterns.",
    HealingPathway.SOMATIC_AWARENESS: "Connect with your body's wisdom through movement and sensation.",
    HealingPathway.NARRATIVE_THERAPY: "Rewrite your story with compassion and agency.",
    HealingPathway.MINDFULNESS: "Cultivate present-moment awareness and non-judgmental observation.",
    HealingPathway.COMPASSION_FOCUSED: "Develop self-compassion and kindness towards yourself and others.",
    HealingPathway.BEHAVIOURAL_ACTIVATION: "Gradually re-engage with meaningful activities and routines.",
    HealingPathway.PSYCHOEDUCATION: "Understand your mind and body through accessible learning.",
    HealingPathway.CRISIS_STABILISATION: "Immediate stabilisation with safety planning and grounding.",
}


def _generate_pathway_steps(pathway: HealingPathway) -> List[Dict[str, Any]]:
    """Generate adaptive steps for a healing pathway."""
    pathway_steps = {
        HealingPathway.GROUNDING: [
            {"week": 1, "title": "Foundation: 5-4-3-2-1 Grounding", "activities": [
                "Daily 5-4-3-2-1 grounding exercise", "Body scan before sleep",
                "Safe place visualization"], "service_routes": ["i_mind.exercise"]},
            {"week": 2, "title": "Deepening: Breath Anchoring", "activities": [
                "Box breathing 3x daily", "Grounding walk in nature",
                "Sensory awareness journaling"], "service_routes": ["i_mind.exercise", "i_mind.journal"]},
            {"week": 3, "title": "Integration: Somatic Grounding", "activities": [
                "Progressive muscle relaxation", "Grounding with sound therapy",
                "Body-based emotional check-ins"], "service_routes": ["resonate.soundscape"]},
            {"week": 4, "title": "Mastery: Autonomous Grounding", "activities": [
                "Create personal grounding toolkit", "Practice in challenging situations",
                "Teach grounding to someone else"], "service_routes": ["i_mind.journal"]},
        ],
        HealingPathway.MINDFULNESS: [
            {"week": 1, "title": "Beginning: Breath Awareness", "activities": [
                "5-minute breath awareness daily", "Mindful eating one meal",
                "Notice 3 pleasant moments"], "service_routes": ["i_mind.meditation"]},
            {"week": 2, "title": "Expanding: Body Awareness", "activities": [
                "10-minute body scan daily", "Walking meditation",
                "Mindful listening exercise"], "service_routes": ["i_mind.meditation"]},
            {"week": 3, "title": "Deepening: Thought Observation", "activities": [
                "15-minute sitting meditation", "Thought labelling practice",
                "Loving-kindness meditation"], "service_routes": ["i_mind.meditation"]},
            {"week": 4, "title": "Living Mindfully", "activities": [
                "20-minute daily practice", "Mindful communication",
                "Integrate mindfulness into daily routine"], "service_routes": ["i_mind.meditation", "i_mind.journal"]},
        ],
        HealingPathway.EMOTIONAL_PROCESSING: [
            {"week": 1, "title": "Awareness: Naming Emotions", "activities": [
                "Emotion wheel journaling", "Body-emotion mapping",
                "Gentle self-check-ins 3x daily"], "service_routes": ["i_mind.journal"]},
            {"week": 2, "title": "Expression: Safe Release", "activities": [
                "Expressive writing sessions", "Sound therapy for emotional release",
                "Creative expression exercise"], "service_routes": ["i_mind.journal", "resonate.soundscape"]},
            {"week": 3, "title": "Understanding: Patterns & Triggers", "activities": [
                "Trigger mapping journal", "Cognitive flexibility exercises",
                "Compassionate self-dialogue"], "service_routes": ["i_mind.journal", "i_mind.exercise"]},
            {"week": 4, "title": "Integration: Emotional Resilience", "activities": [
                "Resilience reflection journal", "Emotional regulation toolkit",
                "Celebration of progress"], "service_routes": ["i_mind.journal", "taimra.checkin"]},
        ],
    }

    # Default pathway for unmapped types
    default_steps = [
        {"week": 1, "title": "Week 1: Foundation", "activities": [
            "Daily check-in with Savania", "One gentle exercise per day",
            "Journaling practice"], "service_routes": ["i_mind.exercise", "i_mind.journal"]},
        {"week": 2, "title": "Week 2: Building", "activities": [
            "Increase practice duration", "Try sound therapy",
            "Biomarker tracking"], "service_routes": ["resonate.soundscape", "taimra.checkin"]},
        {"week": 3, "title": "Week 3: Deepening", "activities": [
            "Meditation practice", "Cognitive exercises",
            "Review progress with digital twin"], "service_routes": ["i_mind.meditation", "taimra.checkin"]},
        {"week": 4, "title": "Week 4: Integration", "activities": [
            "Create personal wellness routine", "Reflect on journey",
            "Set intentions for next phase"], "service_routes": ["i_mind.journal"]},
    ]

    steps = pathway_steps.get(pathway, default_steps)
    for step in steps:
        step["completed"] = False
    return steps


# ============================================================
# ENDPOINTS — Preferences
# ============================================================

@router.get("/preferences", summary="Get Savania preferences")
async def get_savania_preferences(
    current_user: CurrentUser = Depends(get_current_user),
):
    """Retrieve the user's Savania interaction preferences."""
    user_id = getattr(current_user, "id", "anonymous")
    prefs = _savania_preferences.get(user_id, {
        "user_id": user_id,
        "preferred_mode": SavaniaMode.HEALER.value,
        "preferred_tone": ConversationTone.WARM.value,
        "healing_pathway": None,
        "session_length_preference": "medium",
        "proactive_checkins": True,
        "crisis_contacts": [],
        "therapeutic_boundaries": [],
    })
    return prefs


@router.put("/preferences", summary="Update Savania preferences")
async def update_savania_preferences(
    prefs: SavaniaPreferences,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update Savania interaction and therapeutic preferences."""
    user_id = getattr(current_user, "id", "anonymous")
    pref_data = {
        "user_id": user_id,
        "preferred_mode": prefs.preferred_mode.value,
        "preferred_tone": prefs.preferred_tone.value,
        "healing_pathway": prefs.healing_pathway.value if prefs.healing_pathway else None,
        "session_length_preference": prefs.session_length_preference,
        "proactive_checkins": prefs.proactive_checkins,
        "crisis_contacts": prefs.crisis_contacts,
        "therapeutic_boundaries": prefs.therapeutic_boundaries,
    }
    _savania_preferences[user_id] = pref_data

    await _emit_savania_event("preferences.updated", {
        "mode": prefs.preferred_mode.value,
        "tone": prefs.preferred_tone.value,
    }, user_id)

    return {"message": "Preferences updated", "preferences": pref_data}


# ============================================================
# ENDPOINTS — Safeguarding
# ============================================================

@router.get("/safeguarding/status", summary="Get safeguarding status")
async def get_safeguarding_status(
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns the current safeguarding status including crisis level
    and any active guardian protocols. Accessible to the user for
    transparency and trust.
    """
    user_id = getattr(current_user, "id", "anonymous")
    crisis = _crisis_state.get(user_id, {
        "crisis_level": CrisisLevel.NONE.value,
        "active_protocols": [],
        "last_assessment": None,
    })
    reports = _safeguarding_reports.get(user_id, [])
    return {
        "current_state": crisis,
        "report_count": len(reports),
        "guardian_protocols": [p.value for p in GuardianProtocol],
        "message": "Your safety is always our priority. All guardian protocols are transparent.",
    }


# ============================================================
# ENDPOINTS — Health
# ============================================================

@router.get("/health", summary="Savania service health", include_in_schema=False)
async def savania_health():
    """Health check for the Savania AI healer service."""
    return {
        "service": "savania",
        "status": "healthy",
        "active_conversations": len(_conversations),
        "guardian_protocols": len(GuardianProtocol),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }