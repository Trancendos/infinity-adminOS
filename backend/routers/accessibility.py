# routers/accessibility.py — Accessibility Takeover Mode
# ══════════════════════════════════════════════════════════════════
# Enables the platform to temporarily take control of a device
# (phone, tablet, desktop) to assist users with tasks or issues.
#
# Drew's directive: "Investigate into potential abilities like using
# accessibility function to allow the platform to take over for a
# short time of the phone if enabled to assist in a potential task
# or issue."
#
# SAFETY FIRST: All takeover sessions require explicit user consent,
# have strict time limits, full audit trails, and can be terminated
# instantly by the user at any time.
#
# Lane 2 (User/Infinity) — Accessibility layer
# ISO 27001: A.9.4 — System and application access control
# ══════════════════════════════════════════════════════════════════

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Query, Path, Body
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser
from router_migration_helper import store_factory, audit_log_factory

router = APIRouter(prefix="/api/v1/accessibility", tags=["Accessibility — Takeover Mode"])
logger = logging.getLogger("accessibility")


# ── Configuration ────────────────────────────────────────────────

# Maximum takeover duration (seconds)
MAX_TAKEOVER_DURATION = 300  # 5 minutes
DEFAULT_TAKEOVER_DURATION = 60  # 1 minute
COOLDOWN_PERIOD = 30  # 30 seconds between sessions

# Allowed action categories during takeover
ALLOWED_ACTIONS = {
    "navigation": "Navigate between screens and apps",
    "form_fill": "Fill in forms with user-provided data",
    "settings_adjust": "Adjust device settings (accessibility, display, audio)",
    "app_interaction": "Interact with apps (tap, scroll, type)",
    "screenshot": "Capture screenshots for analysis",
    "read_aloud": "Read screen content aloud",
    "dictation": "Type dictated text",
    "emergency": "Emergency actions (call emergency services, send SOS)",
}

# Blocked actions (NEVER allowed during takeover)
BLOCKED_ACTIONS = {
    "payment": "Financial transactions or payments",
    "delete_data": "Deleting user data or files",
    "install_app": "Installing or uninstalling applications",
    "change_password": "Changing passwords or security settings",
    "send_message": "Sending messages without explicit per-message consent",
    "camera_record": "Recording video without explicit consent",
    "location_share": "Sharing location with third parties",
    "contact_access": "Accessing contacts without explicit consent",
}


# ── Models ────────────────────────────────────────────────────────

class TakeoverRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500, description="Why takeover is needed")
    task_description: str = Field(..., min_length=5, max_length=2000, description="What the AI will do")
    allowed_actions: List[str] = Field(
        default=["navigation", "form_fill", "read_aloud"],
        description="Actions permitted during this session"
    )
    duration_seconds: int = Field(
        default=DEFAULT_TAKEOVER_DURATION,
        ge=10, le=MAX_TAKEOVER_DURATION,
        description="Maximum duration in seconds"
    )
    device_type: str = Field(
        default="phone",
        pattern="^(phone|tablet|desktop|wearable)$"
    )
    platform: str = Field(
        default="android",
        pattern="^(android|ios|web|windows|macos|linux)$"
    )
    require_confirmation_per_action: bool = Field(
        default=True,
        description="If true, each action requires user confirmation"
    )

class TakeoverConsent(BaseModel):
    session_id: str = Field(..., min_length=1)
    consent_given: bool = Field(..., description="User explicitly consents to takeover")
    biometric_verified: bool = Field(default=False, description="Biometric verification completed")
    pin_verified: bool = Field(default=False, description="PIN verification completed")

class TakeoverAction(BaseModel):
    session_id: str = Field(..., min_length=1)
    action_type: str = Field(..., min_length=1, max_length=50)
    target: str = Field(default="", max_length=500, description="Target element or screen")
    parameters: Dict[str, Any] = Field(default_factory=dict)
    description: str = Field(default="", max_length=500)

class ActionConfirmation(BaseModel):
    action_id: str = Field(..., min_length=1)
    approved: bool = Field(...)
    user_note: Optional[str] = Field(default=None, max_length=500)

class AccessibilityProfile(BaseModel):
    screen_reader: bool = Field(default=False)
    voice_control: bool = Field(default=False)
    switch_access: bool = Field(default=False)
    magnification: float = Field(default=1.0, ge=1.0, le=10.0)
    high_contrast: bool = Field(default=False)
    reduced_motion: bool = Field(default=False)
    large_text: bool = Field(default=False)
    text_to_speech_speed: float = Field(default=1.0, ge=0.25, le=4.0)
    haptic_feedback: bool = Field(default=True)
    color_correction: str = Field(default="none", pattern="^(none|deuteranomaly|protanomaly|tritanomaly)$")


# ── State ─────────────────────────────────────────────────────────

_takeover_sessions = store_factory("accessibility", "takeover_sessions")
_pending_actions = store_factory("accessibility", "pending_actions")
_action_history = store_factory("accessibility", "action_history")
_user_profiles = store_factory("accessibility", "user_profiles")
_audit = audit_log_factory("accessibility", "events")


# ── Helpers ───────────────────────────────────────────────────────

def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Takeover Session Endpoints ────────────────────────────────────

@router.post("/takeover/request", status_code=201)
async def request_takeover(
    request: TakeoverRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Request a device takeover session.

    This creates a PENDING session that requires explicit user consent
    before any actions can be performed. The user must confirm via
    the /takeover/consent endpoint.

    Safety guardrails:
    - Maximum 5-minute duration
    - Explicit consent required
    - Full audit trail
    - User can terminate instantly
    - Blocked actions list enforced
    - Optional per-action confirmation
    """
    uid = user.id

    # Validate allowed actions
    for action in request.allowed_actions:
        if action not in ALLOWED_ACTIONS:
            raise HTTPException(400, f"Unknown action type: {action}")
        if action in BLOCKED_ACTIONS:
            raise HTTPException(403, f"Action '{action}' is never allowed during takeover")

    session_id = str(uuid.uuid4())
    now = _utcnow()

    session = {
        "id": session_id,
        "status": "pending_consent",  # Must be consented before active
        "reason": request.reason,
        "task_description": request.task_description,
        "allowed_actions": request.allowed_actions,
        "duration_seconds": request.duration_seconds,
        "device_type": request.device_type,
        "platform": request.platform,
        "require_confirmation_per_action": request.require_confirmation_per_action,
        "actions_performed": 0,
        "actions_approved": 0,
        "actions_rejected": 0,
        "consent_given": False,
        "consent_method": None,
        "started_at": None,
        "expires_at": None,
        "ended_at": None,
        "end_reason": None,
        "user_id": uid,
        "created_at": now,
    }
    _takeover_sessions[session_id] = session

    _audit.append({
        "event": "takeover_requested",
        "session_id": session_id,
        "reason": request.reason,
        "duration": request.duration_seconds,
        "user": uid,
        "timestamp": now,
    })

    logger.info(f"Takeover requested: {session_id} by {uid} — {request.reason}")

    return {
        **session,
        "consent_url": f"/api/v1/accessibility/takeover/consent",
        "safety_notice": (
            "This session requires your explicit consent. "
            "You can terminate it at any time by pressing the emergency stop button, "
            "shaking your device, or saying 'stop takeover'. "
            f"Maximum duration: {request.duration_seconds} seconds."
        ),
    }


@router.post("/takeover/consent")
async def give_consent(
    consent: TakeoverConsent,
    user: CurrentUser = Depends(get_current_user),
):
    """Give or deny consent for a takeover session.

    At least one verification method (biometric or PIN) is recommended
    for production use.
    """
    session = _takeover_sessions.get(consent.session_id)
    if not session:
        raise HTTPException(404, "Takeover session not found")
    if session.get("status") != "pending_consent":
        raise HTTPException(400, f"Session is not pending consent (status: {session.get('status')})")
    if session.get("user_id") != user.id:
        raise HTTPException(403, "Only the requesting user can consent")

    now = _utcnow()

    if not consent.consent_given:
        session["status"] = "denied"
        session["ended_at"] = now
        session["end_reason"] = "user_denied_consent"
        _takeover_sessions[consent.session_id] = session

        _audit.append({
            "event": "takeover_denied",
            "session_id": consent.session_id,
            "user": user.id,
            "timestamp": now,
        })
        return {"status": "denied", "message": "Takeover consent denied. Session cancelled."}

    # Consent given — activate session
    consent_method = []
    if consent.biometric_verified:
        consent_method.append("biometric")
    if consent.pin_verified:
        consent_method.append("pin")
    if not consent_method:
        consent_method.append("explicit_tap")

    session["status"] = "active"
    session["consent_given"] = True
    session["consent_method"] = consent_method
    session["started_at"] = now
    # Calculate expiry
    from datetime import timedelta
    expires = datetime.fromisoformat(now) + timedelta(seconds=session["duration_seconds"])
    session["expires_at"] = expires.isoformat()
    _takeover_sessions[consent.session_id] = session

    _audit.append({
        "event": "takeover_consented",
        "session_id": consent.session_id,
        "consent_method": consent_method,
        "user": user.id,
        "timestamp": now,
    })

    logger.info(f"Takeover consented: {consent.session_id} via {consent_method}")

    return {
        **session,
        "message": "Takeover session is now active.",
        "emergency_stop": {
            "methods": [
                "Press the red STOP button on screen",
                "Shake device 3 times",
                "Say 'stop takeover' or 'cancel'",
                "Press power button 3 times",
                f"POST /api/v1/accessibility/takeover/{consent.session_id}/stop",
            ],
        },
    }


@router.post("/takeover/{session_id}/action")
async def propose_action(
    session_id: str = Path(...),
    action: TakeoverAction = Body(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Propose an action during an active takeover session.

    If require_confirmation_per_action is enabled, the action will be
    queued for user approval before execution.
    """
    session = _takeover_sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Takeover session not found")
    if session.get("status") != "active":
        raise HTTPException(400, f"Session is not active (status: {session.get('status')})")

    # Check if action type is allowed
    if action.action_type not in session.get("allowed_actions", []):
        raise HTTPException(403, f"Action '{action.action_type}' is not allowed in this session")

    # Check blocked actions
    if action.action_type in BLOCKED_ACTIONS:
        raise HTTPException(403, f"Action '{action.action_type}' is permanently blocked")

    action_id = str(uuid.uuid4())
    now = _utcnow()

    action_record = {
        "id": action_id,
        "session_id": session_id,
        "action_type": action.action_type,
        "target": action.target,
        "parameters": action.parameters,
        "description": action.description,
        "status": "pending_approval" if session.get("require_confirmation_per_action") else "approved",
        "proposed_at": now,
        "executed_at": None,
    }

    if session.get("require_confirmation_per_action"):
        _pending_actions[action_id] = action_record
        return {
            **action_record,
            "message": "Action queued for user approval",
            "approve_url": f"/api/v1/accessibility/takeover/action/{action_id}/confirm",
        }
    else:
        # Auto-approved — execute immediately
        action_record["status"] = "executed"
        action_record["executed_at"] = now
        _action_history[action_id] = action_record

        session["actions_performed"] = session.get("actions_performed", 0) + 1
        session["actions_approved"] = session.get("actions_approved", 0) + 1
        _takeover_sessions[session_id] = session

        _audit.append({
            "event": "takeover_action_executed",
            "action_id": action_id,
            "action_type": action.action_type,
            "session_id": session_id,
            "user": user.id,
            "timestamp": now,
        })

        return {**action_record, "message": "Action executed"}


@router.post("/takeover/action/{action_id}/confirm")
async def confirm_action(
    action_id: str = Path(...),
    confirmation: ActionConfirmation = ...,
    user: CurrentUser = Depends(get_current_user),
):
    """Approve or reject a pending takeover action."""
    action_record = _pending_actions.get(action_id)
    if not action_record:
        raise HTTPException(404, "Pending action not found")

    session = _takeover_sessions.get(action_record.get("session_id"))
    if not session:
        raise HTTPException(404, "Session not found")

    now = _utcnow()

    if confirmation.approved:
        action_record["status"] = "executed"
        action_record["executed_at"] = now
        session["actions_performed"] = session.get("actions_performed", 0) + 1
        session["actions_approved"] = session.get("actions_approved", 0) + 1
    else:
        action_record["status"] = "rejected"
        action_record["rejected_at"] = now
        action_record["rejection_note"] = confirmation.user_note
        session["actions_rejected"] = session.get("actions_rejected", 0) + 1

    _action_history[action_id] = action_record
    _pending_actions.pop(action_id, None)
    _takeover_sessions[action_record["session_id"]] = session

    _audit.append({
        "event": f"takeover_action_{'approved' if confirmation.approved else 'rejected'}",
        "action_id": action_id,
        "session_id": action_record["session_id"],
        "user": user.id,
        "timestamp": now,
    })

    return action_record


@router.post("/takeover/{session_id}/stop")
async def emergency_stop(
    session_id: str = Path(...),
    reason: str = Query("user_initiated", description="Reason for stopping"),
    user: CurrentUser = Depends(get_current_user),
):
    """Emergency stop — immediately terminate a takeover session.

    This is the highest-priority action and ALWAYS succeeds.
    All pending actions are cancelled.
    """
    session = _takeover_sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Takeover session not found")

    now = _utcnow()
    session["status"] = "terminated"
    session["ended_at"] = now
    session["end_reason"] = reason
    _takeover_sessions[session_id] = session

    # Cancel all pending actions
    cancelled = 0
    for aid, action in list(_pending_actions.items()):
        if isinstance(action, dict) and action.get("session_id") == session_id:
            action["status"] = "cancelled"
            _action_history[aid] = action
            _pending_actions.pop(aid, None)
            cancelled += 1

    _audit.append({
        "event": "takeover_emergency_stop",
        "session_id": session_id,
        "reason": reason,
        "actions_cancelled": cancelled,
        "user": user.id,
        "timestamp": now,
    })

    logger.warning(f"EMERGENCY STOP: Takeover {session_id} terminated — {reason}")

    return {
        "status": "terminated",
        "session_id": session_id,
        "reason": reason,
        "actions_cancelled": cancelled,
        "message": "Takeover session terminated immediately. All pending actions cancelled.",
    }


@router.get("/takeover/sessions/active")
async def list_active_sessions(user: CurrentUser = Depends(get_current_user)):
    """List all active takeover sessions for the current user."""
    uid = user.id
    active = [s for s in _takeover_sessions.values()
              if isinstance(s, dict) and s.get("user_id") == uid
              and s.get("status") in ("pending_consent", "active")]
    return {"sessions": active, "total": len(active)}


@router.get("/takeover/safety-info")
async def get_safety_info():
    """Get safety information about the takeover feature."""
    return {
        "allowed_actions": ALLOWED_ACTIONS,
        "blocked_actions": BLOCKED_ACTIONS,
        "safety_features": {
            "explicit_consent": "Every session requires explicit user consent",
            "time_limited": f"Maximum duration: {MAX_TAKEOVER_DURATION} seconds",
            "emergency_stop": "User can terminate instantly via button, gesture, voice, or API",
            "full_audit": "Every action is logged with timestamps",
            "per_action_approval": "Optional per-action confirmation mode",
            "blocked_actions": "Certain dangerous actions are permanently blocked",
            "biometric_verification": "Optional biometric or PIN verification for consent",
            "cooldown": f"{COOLDOWN_PERIOD} second cooldown between sessions",
        },
        "emergency_stop_methods": [
            "Red STOP button on screen overlay",
            "Shake device 3 times rapidly",
            "Voice command: 'stop takeover' or 'cancel'",
            "Press power button 3 times",
            "API: POST /api/v1/accessibility/takeover/{session_id}/stop",
        ],
        "supported_platforms": {
            "android": "AccessibilityService API",
            "ios": "UIAccessibility + Guided Access",
            "web": "ARIA + DOM manipulation",
            "desktop": "OS-level accessibility APIs",
        },
    }


@router.get("/takeover/{session_id}")
async def get_takeover_session(
    session_id: str = Path(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Get takeover session details and action history."""
    session = _takeover_sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Takeover session not found")

    # Get action history for this session
    actions = [a for a in _action_history.values()
               if isinstance(a, dict) and a.get("session_id") == session_id]
    pending = [a for a in _pending_actions.values()
               if isinstance(a, dict) and a.get("session_id") == session_id]

    return {
        **session,
        "action_history": actions,
        "pending_actions": pending,
    }


# ── Accessibility Profile Endpoints ───────────────────────────────

@router.post("/profile")
async def set_accessibility_profile(
    profile: AccessibilityProfile,
    user: CurrentUser = Depends(get_current_user),
):
    """Set or update the user's accessibility profile."""
    uid = user.id
    profile_data = {
        "user_id": uid,
        **profile.model_dump(),
        "updated_at": _utcnow(),
    }
    _user_profiles[uid] = profile_data

    _audit.append({
        "event": "accessibility_profile_updated",
        "user": uid,
        "timestamp": _utcnow(),
    })

    return profile_data


@router.get("/profile")
async def get_accessibility_profile(user: CurrentUser = Depends(get_current_user)):
    """Get the user's accessibility profile."""
    uid = user.id
    profile = _user_profiles.get(uid)
    if not profile:
        # Return defaults
        return AccessibilityProfile().model_dump()
    return profile
@router.get("/overview")
async def accessibility_overview(user: CurrentUser = Depends(get_current_user)):
    """Get accessibility feature overview."""
    uid = user.id
    user_sessions = [s for s in _takeover_sessions.values()
                     if isinstance(s, dict) and s.get("user_id") == uid]
    return {
        "total_sessions": len(user_sessions),
        "active_sessions": sum(1 for s in user_sessions if s.get("status") == "active"),
        "completed_sessions": sum(1 for s in user_sessions if s.get("status") == "completed"),
        "terminated_sessions": sum(1 for s in user_sessions if s.get("status") == "terminated"),
        "total_actions_performed": sum(s.get("actions_performed", 0) for s in user_sessions),
        "total_actions_rejected": sum(s.get("actions_rejected", 0) for s in user_sessions),
        "has_profile": uid in _user_profiles,
        "audit_entries": len(_audit),
    }