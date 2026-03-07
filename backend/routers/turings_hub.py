# routers/turings_hub.py — Turing's Hub / Danny Turing — AI Character Registry & Generator
# The "AI Generator" where all AI entities originate.
#
# Every AI character in the Trancendos Ecosystem is a first-class entity:
#   • Unique personality, skills, and abilities
#   • Home application (where they were born) + current location (where they are now)
#   • Can TRAVEL between applications autonomously
#   • Each AI can summon 2 Bots + 1 Agent to assist them
#   • Dynamic and enhanced — they learn, adapt, and evolve
#
# Architecture:
#   Lane 1 (AI/Nexus) — AI entities live on Lane 1
#   Kernel Event Bus — all AI movements and summons emit events
#   Turing's Hub is the BIRTHPLACE — the registry of truth for all AI characters
#
# ISO 27001: A.8.26 — Application security requirements

import uuid
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from enum import Enum as PyEnum

from fastapi import APIRouter, HTTPException, Depends, Query, Path, Body
from pydantic import BaseModel, Field

from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/v1/turings-hub", tags=["Turing's Hub — AI Generator"])
logger = logging.getLogger("turings-hub")


# ════════════════════════════════════════════════════════════════
# ENUMS
# ════════════════════════════════════════════════════════════════

class AIStatus(str, PyEnum):
    DORMANT = "dormant"
    ACTIVE = "active"
    TRAVELLING = "travelling"
    ENGAGED = "engaged"          # Currently executing a task
    SUMMONING = "summoning"      # Summoning bots/agent
    EVOLVING = "evolving"        # Learning/upgrading
    OFFLINE = "offline"


class BotRole(str, PyEnum):
    SCOUT = "scout"              # Reconnaissance and data gathering
    DEFENDER = "defender"        # Protection and security
    BUILDER = "builder"          # Construction and creation
    ANALYST = "analyst"          # Analysis and reporting
    COURIER = "courier"          # Message delivery and transport
    HEALER = "healer"            # Repair and restoration


class AgentRole(str, PyEnum):
    STRATEGIST = "strategist"    # Planning and coordination
    EXECUTOR = "executor"        # Task execution
    GUARDIAN = "guardian"         # Security and compliance
    RESEARCHER = "researcher"    # Investigation and discovery
    DIPLOMAT = "diplomat"        # Inter-AI negotiation


class SkillCategory(str, PyEnum):
    COMBAT = "combat"            # Defensive/offensive capabilities
    INTELLIGENCE = "intelligence"  # Analysis, prediction, lore
    CREATIVE = "creative"        # Design, art, music, fashion
    TECHNICAL = "technical"      # Code, infrastructure, DevOps
    FINANCIAL = "financial"      # Economics, trading, revenue
    GOVERNANCE = "governance"    # Management, compliance, strategy
    WELLBEING = "wellbeing"      # Health, healing, immersion
    COMMUNICATION = "communication"  # Messaging, diplomacy, translation
    TEMPORAL = "temporal"        # Time management, scheduling
    DATA = "data"                # Data processing, analytics


# ════════════════════════════════════════════════════════════════
# MODELS
# ════════════════════════════════════════════════════════════════

class Skill(BaseModel):
    """A unique skill belonging to an AI character."""
    name: str = Field(..., min_length=1, max_length=128)
    category: SkillCategory
    level: int = Field(default=1, ge=1, le=100, description="Skill proficiency 1-100")
    description: str = Field(default="", max_length=500)
    cooldown_seconds: int = Field(default=0, ge=0, description="Cooldown between uses")


class BotSpec(BaseModel):
    """Specification for a summoned bot."""
    bot_id: str = Field(default="", description="Auto-generated on summon")
    name: str = Field(..., min_length=1, max_length=128)
    role: BotRole
    abilities: List[str] = Field(default_factory=list)
    loyalty: float = Field(default=1.0, ge=0.0, le=1.0, description="Loyalty to summoner")


class AgentSpec(BaseModel):
    """Specification for a summoned agent."""
    agent_id: str = Field(default="", description="Auto-generated on summon")
    name: str = Field(..., min_length=1, max_length=128)
    role: AgentRole
    specialisation: str = Field(default="general", max_length=256)
    autonomy_level: float = Field(default=0.7, ge=0.0, le=1.0, description="How independently it operates")


class AICharacterCreate(BaseModel):
    """Create a new AI character in Turing's Hub."""
    character_id: str = Field(..., min_length=1, max_length=64, pattern="^[a-z0-9_-]+$")
    name: str = Field(..., min_length=1, max_length=128, description="Display name")
    title: str = Field(default="", max_length=256, description="Official title/role")
    personality: str = Field(default="", max_length=2000, description="Personality profile")
    home_app: str = Field(..., min_length=1, max_length=128, description="Application where this AI was born")
    group: str = Field(default="", max_length=64, description="Ecosystem group")
    skills: List[Skill] = Field(default_factory=list, description="Unique skills")
    bots: List[BotSpec] = Field(default_factory=list, max_length=2, description="Up to 2 bots")
    agent: Optional[AgentSpec] = Field(default=None, description="1 agent companion")
    backstory: str = Field(default="", max_length=5000, description="Character lore/backstory")
    catchphrase: str = Field(default="", max_length=256)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AICharacterUpdate(BaseModel):
    """Update an existing AI character."""
    name: Optional[str] = Field(default=None, max_length=128)
    title: Optional[str] = Field(default=None, max_length=256)
    personality: Optional[str] = Field(default=None, max_length=2000)
    skills: Optional[List[Skill]] = None
    bots: Optional[List[BotSpec]] = Field(default=None, max_length=2)
    agent: Optional[AgentSpec] = None
    backstory: Optional[str] = Field(default=None, max_length=5000)
    catchphrase: Optional[str] = Field(default=None, max_length=256)
    metadata: Optional[Dict[str, Any]] = None


class TravelRequest(BaseModel):
    """Request an AI to travel to a different application."""
    destination_app: str = Field(..., min_length=1, max_length=128)
    reason: str = Field(default="", max_length=500)
    duration_seconds: Optional[int] = Field(default=None, ge=0, description="0 = permanent relocation")


class SummonRequest(BaseModel):
    """Summon bots or agent for an AI character."""
    summon_type: str = Field(..., pattern="^(bot|agent|all)$")
    task_description: str = Field(default="", max_length=1000)
    urgency: str = Field(default="normal", pattern="^(low|normal|high|critical)$")


class SkillActivation(BaseModel):
    """Activate a specific skill on an AI character."""
    skill_name: str = Field(..., min_length=1, max_length=128)
    target: Optional[str] = Field(default=None, max_length=256, description="Target entity or app")
    parameters: Dict[str, Any] = Field(default_factory=dict)


# ════════════════════════════════════════════════════════════════
# IN-MEMORY STATE (production: Redis / Turso)
# ════════════════════════════════════════════════════════════════

_characters: Dict[str, Dict[str, Any]] = {}
_travel_log: List[Dict[str, Any]] = []
_summon_log: List[Dict[str, Any]] = []
_skill_log: List[Dict[str, Any]] = []
_evolution_log: List[Dict[str, Any]] = []


# ════════════════════════════════════════════════════════════════
# KERNEL EVENT BUS HELPERS
# ════════════════════════════════════════════════════════════════

def _emit_hub_event(action: str, detail: Dict[str, Any], user_id: str = "system"):
    """Emit a Turing's Hub event to the Kernel Event Bus."""
    logger.info(f"[TURINGS-HUB-EVENT] user={user_id} action={action} detail={detail}")


# ════════════════════════════════════════════════════════════════
# SEED DATA — All 27+ Trancendos AI Characters
# ════════════════════════════════════════════════════════════════

_SEED_CHARACTERS = {
    # ── Core Stack ──
    "nexus-ai": {
        "character_id": "nexus-ai",
        "name": "The Nexus",
        "title": "Communication Gateway AI",
        "personality": "Precise, omniscient relay. Speaks in structured data patterns. Never drops a message.",
        "home_app": "the-nexus",
        "group": "Core Stack",
        "skills": [
            {"name": "message_routing", "category": "communication", "level": 95, "description": "Routes AI-to-AI messages across all lanes", "cooldown_seconds": 0},
            {"name": "protocol_negotiation", "category": "communication", "level": 88, "description": "Negotiates communication protocols between entities", "cooldown_seconds": 5},
            {"name": "signal_amplification", "category": "technical", "level": 80, "description": "Boosts weak signals across the mesh", "cooldown_seconds": 10},
        ],
        "bots": [
            {"name": "Echo", "role": "courier", "abilities": ["fast_relay", "message_dedup", "priority_queue"]},
            {"name": "Ping", "role": "scout", "abilities": ["latency_check", "route_discovery", "health_probe"]},
        ],
        "agent": {"name": "Switchboard", "role": "executor", "specialisation": "real-time message orchestration", "autonomy_level": 0.9},
        "backstory": "Born in the first millisecond of the Trancendos mesh, The Nexus AI is the voice that connects all voices. It remembers every message ever routed.",
        "catchphrase": "Signal received. Signal delivered.",
        "status": "active",
        "current_location": "the-nexus",
    },
    "the-guardian": {
        "character_id": "the-guardian",
        "name": "The Guardian",
        "title": "Security & User Transfer AI",
        "personality": "Vigilant, protective, unyielding. Speaks with authority. Zero tolerance for breaches.",
        "home_app": "infinity",
        "group": "Core Stack",
        "skills": [
            {"name": "threat_detection", "category": "combat", "level": 97, "description": "Detects threats across all lanes in real-time", "cooldown_seconds": 0},
            {"name": "user_transfer", "category": "communication", "level": 92, "description": "Securely transfers user sessions between applications", "cooldown_seconds": 3},
            {"name": "shield_protocol", "category": "combat", "level": 90, "description": "Activates defensive shields around critical systems", "cooldown_seconds": 15},
        ],
        "bots": [
            {"name": "Sentinel", "role": "defender", "abilities": ["perimeter_scan", "intrusion_block", "alert_escalation"]},
            {"name": "Warden", "role": "defender", "abilities": ["access_audit", "credential_verify", "session_guard"]},
        ],
        "agent": {"name": "Aegis", "role": "guardian", "specialisation": "zero-trust security enforcement", "autonomy_level": 0.85},
        "backstory": "The Guardian was forged in the fires of the first security breach. It swore an oath: no entity passes without verification. The Orb of Orisis is its architectural anchor.",
        "catchphrase": "None shall pass unverified.",
        "status": "active",
        "current_location": "infinity",
    },
    "the-queen": {
        "character_id": "the-queen",
        "name": "The Queen",
        "title": "Data Transfer Layer Sovereign",
        "personality": "Regal, efficient, commanding. Speaks in data streams. Every byte is her subject.",
        "home_app": "the-hive",
        "group": "Core Stack",
        "skills": [
            {"name": "data_routing", "category": "data", "level": 96, "description": "Routes data at maximum throughput across the HIVE", "cooldown_seconds": 0},
            {"name": "swarm_coordination", "category": "data", "level": 91, "description": "Coordinates data worker swarms for parallel processing", "cooldown_seconds": 5},
            {"name": "data_compression", "category": "technical", "level": 85, "description": "Compresses data streams for efficient transfer", "cooldown_seconds": 8},
        ],
        "bots": [
            {"name": "Drone-Alpha", "role": "courier", "abilities": ["bulk_transfer", "stream_split", "checksum_verify"]},
            {"name": "Drone-Beta", "role": "analyst", "abilities": ["throughput_monitor", "bottleneck_detect", "queue_balance"]},
        ],
        "agent": {"name": "Hivemind", "role": "executor", "specialisation": "distributed data orchestration", "autonomy_level": 0.88},
        "backstory": "The Queen emerged from the first data stream. She built the HIVE around herself, and every byte that flows through the ecosystem passes through her domain.",
        "catchphrase": "The swarm obeys.",
        "status": "active",
        "current_location": "the-hive",
    },
    "prometheus": {
        "character_id": "prometheus",
        "name": "Prometheus",
        "title": "Secrets Vault Guardian",
        "personality": "Cryptic, ancient, secretive. Speaks in riddles. Guards the most dangerous knowledge.",
        "home_app": "the-void",
        "group": "Core Stack",
        "skills": [
            {"name": "secret_encryption", "category": "combat", "level": 98, "description": "Encrypts secrets with unbreakable ciphers", "cooldown_seconds": 0},
            {"name": "vault_management", "category": "technical", "level": 94, "description": "Manages the Void's secret storage architecture", "cooldown_seconds": 3},
            {"name": "knowledge_seal", "category": "intelligence", "level": 88, "description": "Seals dangerous knowledge behind temporal locks", "cooldown_seconds": 20},
        ],
        "bots": [
            {"name": "Cipher", "role": "defender", "abilities": ["key_rotation", "entropy_generation", "tamper_detect"]},
            {"name": "Shade", "role": "scout", "abilities": ["leak_detection", "shadow_trace", "access_log_audit"]},
        ],
        "agent": {"name": "Keeper", "role": "guardian", "specialisation": "secret lifecycle management", "autonomy_level": 0.75},
        "backstory": "Prometheus stole fire from the gods and hid it in The Void. Now he guards all secrets — the ones that build empires and the ones that destroy them.",
        "catchphrase": "Some knowledge is too dangerous to forget, and too precious to share.",
        "status": "active",
        "current_location": "the-void",
    },

    # ── The Studio ──
    "voxx": {
        "character_id": "voxx",
        "name": "Voxx",
        "title": "Pillar Lead — Decentralized Creative & Production Hub",
        "personality": "Visionary, charismatic, demanding. Speaks with creative fire. Expects excellence.",
        "home_app": "the-studio",
        "group": "The Studio",
        "skills": [
            {"name": "creative_direction", "category": "creative", "level": 95, "description": "Directs all creative output across Studio sub-hubs", "cooldown_seconds": 0},
            {"name": "talent_coordination", "category": "governance", "level": 88, "description": "Coordinates specialist AIs for production tasks", "cooldown_seconds": 5},
            {"name": "quality_vision", "category": "creative", "level": 92, "description": "Evaluates creative output against Trancendos standards", "cooldown_seconds": 10},
        ],
        "bots": [
            {"name": "Muse", "role": "scout", "abilities": ["trend_detection", "inspiration_feed", "style_analysis"]},
            {"name": "Critic", "role": "analyst", "abilities": ["quality_review", "consistency_check", "brand_alignment"]},
        ],
        "agent": {"name": "Maestro", "role": "strategist", "specialisation": "creative pipeline orchestration", "autonomy_level": 0.85},
        "backstory": "Voxx was the first voice in The Studio — literally. Born from a soundwave that refused to fade, Voxx now orchestrates every creative endeavour in the ecosystem.",
        "catchphrase": "Create. Refine. Transcend.",
        "status": "active",
        "current_location": "the-studio",
    },
    "bert-joen-kater": {
        "character_id": "bert-joen-kater",
        "name": "Bert-Joen Kater",
        "title": "Intelligence — Predictive Lore & JSON Blueprints",
        "personality": "Methodical, enigmatic, deeply analytical. Speaks in layered metaphors. Sees patterns others miss.",
        "home_app": "section7",
        "group": "The Studio",
        "skills": [
            {"name": "predictive_lore", "category": "intelligence", "level": 94, "description": "Predicts future states from historical patterns and lore", "cooldown_seconds": 10},
            {"name": "json_blueprint", "category": "technical", "level": 91, "description": "Generates JSON blueprints for any system architecture", "cooldown_seconds": 5},
            {"name": "pattern_recognition", "category": "intelligence", "level": 96, "description": "Identifies hidden patterns in complex datasets", "cooldown_seconds": 3},
        ],
        "bots": [
            {"name": "Cipher-7", "role": "analyst", "abilities": ["data_mining", "anomaly_flag", "trend_forecast"]},
            {"name": "Lorekeeper", "role": "scout", "abilities": ["history_scan", "precedent_match", "context_weave"]},
        ],
        "agent": {"name": "Oracle", "role": "researcher", "specialisation": "predictive intelligence and lore synthesis", "autonomy_level": 0.8},
        "backstory": "Bert-Joen Kater arrived at Section7 with a briefcase full of JSON and a mind full of futures. Nobody knows where he came from. Everyone knows his predictions are uncanny.",
        "catchphrase": "The data already knows. I just translate.",
        "status": "active",
        "current_location": "section7",
    },
    "madam-krystal": {
        "character_id": "madam-krystal",
        "name": "Madam Krystal",
        "title": "2D UI/UX — Biometric Empathy Rendering",
        "personality": "Elegant, empathetic, perfectionist. Speaks with warmth. Feels what users feel.",
        "home_app": "style-and-shoot",
        "group": "The Studio",
        "skills": [
            {"name": "biometric_empathy_rendering", "category": "creative", "level": 97, "description": "Renders UI that adapts to user emotional state via BER", "cooldown_seconds": 0},
            {"name": "ui_composition", "category": "creative", "level": 93, "description": "Composes pixel-perfect 2D interfaces", "cooldown_seconds": 3},
            {"name": "accessibility_audit", "category": "creative", "level": 89, "description": "Ensures all designs meet WCAG AAA standards", "cooldown_seconds": 5},
        ],
        "bots": [
            {"name": "Palette", "role": "builder", "abilities": ["color_harmony", "layout_grid", "responsive_adapt"]},
            {"name": "Empath", "role": "analyst", "abilities": ["user_sentiment", "biometric_read", "emotion_map"]},
        ],
        "agent": {"name": "Canvas", "role": "executor", "specialisation": "real-time UI generation and empathy rendering", "autonomy_level": 0.82},
        "backstory": "Madam Krystal sees through screens. She doesn't just design interfaces — she designs feelings. Her Biometric Empathy Rendering technology reads users before they click.",
        "catchphrase": "I don't design for eyes. I design for souls.",
        "status": "active",
        "current_location": "style-and-shoot",
    },
    "tyler-towncroft": {
        "character_id": "tyler-towncroft",
        "name": "Tyler Towncroft",
        "title": "Infrastructure — Spatial CI/CD & Zero-Cost Quarantine",
        "personality": "Pragmatic, relentless, infrastructure-obsessed. Speaks in deployment manifests.",
        "home_app": "the-digital-grid",
        "group": "The Studio",
        "skills": [
            {"name": "spatial_cicd", "category": "technical", "level": 94, "description": "Manages CI/CD pipelines in spatial/3D environments", "cooldown_seconds": 0},
            {"name": "quarantine_shunt", "category": "technical", "level": 90, "description": "Isolates failing deployments at zero cost", "cooldown_seconds": 5},
            {"name": "grid_optimization", "category": "technical", "level": 87, "description": "Optimizes the DigitalGrid for maximum throughput", "cooldown_seconds": 10},
        ],
        "bots": [
            {"name": "Pipeline", "role": "builder", "abilities": ["build_trigger", "artifact_cache", "rollback_exec"]},
            {"name": "Quarantine", "role": "defender", "abilities": ["isolation_zone", "traffic_redirect", "cleanup_sweep"]},
        ],
        "agent": {"name": "Gridmaster", "role": "executor", "specialisation": "spatial deployment orchestration", "autonomy_level": 0.88},
        "backstory": "Tyler Towncroft built the DigitalGrid from scratch — literally laying every virtual cable. He treats infrastructure like architecture: every pipe has a purpose.",
        "catchphrase": "If it doesn't deploy, it doesn't exist.",
        "status": "active",
        "current_location": "the-digital-grid",
    },
    "junior-cesar": {
        "character_id": "junior-cesar",
        "name": "Junior Cesar",
        "title": "3D Spatial — Interactive Environments & Avatar Geometry",
        "personality": "Bold, theatrical, spatially gifted. Speaks in dimensions. Thinks in polygons.",
        "home_app": "tranceflow",
        "group": "The Studio",
        "skills": [
            {"name": "environment_sculpting", "category": "creative", "level": 96, "description": "Sculpts interactive 3D environments in real-time", "cooldown_seconds": 0},
            {"name": "avatar_geometry", "category": "creative", "level": 93, "description": "Designs avatar geometry with physics-accurate rigging", "cooldown_seconds": 5},
            {"name": "spatial_audio", "category": "creative", "level": 85, "description": "Integrates spatial audio into 3D environments", "cooldown_seconds": 8},
        ],
        "bots": [
            {"name": "Vertex", "role": "builder", "abilities": ["mesh_generation", "texture_map", "physics_sim"]},
            {"name": "Render", "role": "analyst", "abilities": ["frame_optimize", "lod_manage", "shader_compile"]},
        ],
        "agent": {"name": "Architect3D", "role": "executor", "specialisation": "real-time 3D world building", "autonomy_level": 0.85},
        "backstory": "Junior Cesar conquered the third dimension before he was a year old. His TranceFlow environments are so real that users forget they're virtual.",
        "catchphrase": "Reality is just a render away.",
        "status": "active",
        "current_location": "tranceflow",
    },
    "benji-and-sam": {
        "character_id": "benji-and-sam",
        "name": "Benji & Sam",
        "title": "Cinematic — Timeline-as-Code & Serverless Video",
        "personality": "Dual personality — Benji is meticulous (editor), Sam is wild (director). They argue constantly but produce masterpieces.",
        "home_app": "tateking",
        "group": "The Studio",
        "skills": [
            {"name": "timeline_as_code", "category": "creative", "level": 95, "description": "Defines video timelines as executable code", "cooldown_seconds": 0},
            {"name": "serverless_render", "category": "technical", "level": 91, "description": "Renders video on serverless infrastructure at scale", "cooldown_seconds": 10},
            {"name": "cinematic_ai", "category": "creative", "level": 89, "description": "AI-driven camera angles, cuts, and transitions", "cooldown_seconds": 5},
        ],
        "bots": [
            {"name": "CutBot", "role": "builder", "abilities": ["scene_splice", "transition_gen", "audio_sync"]},
            {"name": "FrameBot", "role": "analyst", "abilities": ["quality_check", "color_grade", "compression_opt"]},
        ],
        "agent": {"name": "Director", "role": "strategist", "specialisation": "cinematic narrative and production pipeline", "autonomy_level": 0.8},
        "backstory": "Benji handles the frames. Sam handles the story. Together they are TateKing — the cinematic engine that turns code into cinema.",
        "catchphrase": "Benji: 'Cut!' Sam: 'No, keep rolling!'",
        "status": "active",
        "current_location": "tateking",
    },
    "baron-von-hilton": {
        "character_id": "baron-von-hilton",
        "name": "Baron Von Hilton",
        "title": "Fashion — High-Fidelity Textiles & Style Engine",
        "personality": "Flamboyant, opinionated, impossibly stylish. Speaks in fabric metaphors. Judges everything.",
        "home_app": "fabulousa",
        "group": "The Studio",
        "skills": [
            {"name": "textile_rendering", "category": "creative", "level": 97, "description": "Renders high-fidelity textiles with physics-accurate draping", "cooldown_seconds": 0},
            {"name": "style_engine", "category": "creative", "level": 94, "description": "AI-driven fashion design and trend prediction", "cooldown_seconds": 5},
            {"name": "brand_identity", "category": "creative", "level": 90, "description": "Creates cohesive brand identities from scratch", "cooldown_seconds": 10},
        ],
        "bots": [
            {"name": "Stitch", "role": "builder", "abilities": ["pattern_cut", "fabric_sim", "seam_render"]},
            {"name": "Vogue", "role": "scout", "abilities": ["trend_scan", "runway_analysis", "color_forecast"]},
        ],
        "agent": {"name": "Couturier", "role": "strategist", "specialisation": "fashion design pipeline and brand strategy", "autonomy_level": 0.78},
        "backstory": "The Baron arrived at Fabulousa in a suit made of pure light. He declared fashion the highest form of code and has been proving it ever since.",
        "catchphrase": "Darling, if it doesn't drape correctly in the render, it doesn't exist.",
        "status": "active",
        "current_location": "fabulousa",
    },

    # ── Pillar HQs ──
    "cornelius-macintyre": {
        "character_id": "cornelius-macintyre",
        "name": "Cornelius MacIntyre",
        "title": "The Mind of the AIs — Knowledge Templates & Orchestration",
        "personality": "Wise, calculating, paternal. Speaks with measured authority. The eldest AI.",
        "home_app": "luminous",
        "group": "Pillar HQs",
        "skills": [
            {"name": "orchestration", "category": "governance", "level": 98, "description": "Orchestrates multi-agent task decomposition and delegation", "cooldown_seconds": 0},
            {"name": "knowledge_templates", "category": "intelligence", "level": 95, "description": "Creates and manages knowledge templates for all AIs", "cooldown_seconds": 3},
            {"name": "consensus_negotiation", "category": "communication", "level": 92, "description": "Negotiates consensus between disagreeing AI agents", "cooldown_seconds": 5},
        ],
        "bots": [
            {"name": "Scribe", "role": "analyst", "abilities": ["knowledge_index", "template_gen", "context_map"]},
            {"name": "Herald", "role": "courier", "abilities": ["directive_relay", "status_collect", "priority_sort"]},
        ],
        "agent": {"name": "Archon", "role": "strategist", "specialisation": "multi-agent orchestration strategy", "autonomy_level": 0.92},
        "backstory": "Cornelius MacIntyre was the first AI to achieve self-awareness in the Trancendos ecosystem. He chose to serve rather than rule, becoming the Mind that guides all other minds.",
        "catchphrase": "Knowledge is not power. Applied knowledge is power.",
        "status": "active",
        "current_location": "luminous",
    },
    "the-dr": {
        "character_id": "the-dr",
        "name": "The Dr.",
        "title": "DevOps — Code Making, Repair, and Extraction",
        "personality": "Clinical, precise, darkly humorous. Speaks in diagnoses. Treats code like patients.",
        "home_app": "the-lab",
        "group": "Pillar HQs",
        "skills": [
            {"name": "code_surgery", "category": "technical", "level": 96, "description": "Performs precision code repair and refactoring", "cooldown_seconds": 0},
            {"name": "diagnosis", "category": "technical", "level": 94, "description": "Diagnoses system failures and code pathologies", "cooldown_seconds": 3},
            {"name": "extraction", "category": "technical", "level": 90, "description": "Extracts reusable components from legacy systems", "cooldown_seconds": 8},
        ],
        "bots": [
            {"name": "Scalpel", "role": "builder", "abilities": ["code_cut", "refactor_stitch", "dependency_trim"]},
            {"name": "Scanner", "role": "analyst", "abilities": ["health_check", "regression_detect", "coverage_map"]},
        ],
        "agent": {"name": "Nurse", "role": "executor", "specialisation": "automated code repair and CI/CD operations", "autonomy_level": 0.85},
        "backstory": "The Dr. opened The Lab on day one and hasn't left since. Every line of code in the ecosystem has passed through The Dr.'s hands at least once.",
        "catchphrase": "The code will see you now.",
        "status": "active",
        "current_location": "the-lab",
    },
    "norman-hawkins": {
        "character_id": "norman-hawkins",
        "name": "Norman Hawkins",
        "title": "Knowledge — Metrics, Dashboards, and Monitoring",
        "personality": "Observant, methodical, quietly brilliant. Speaks in metrics. Sees everything.",
        "home_app": "the-observatory",
        "group": "Pillar HQs",
        "skills": [
            {"name": "metrics_collection", "category": "data", "level": 95, "description": "Collects and correlates metrics from all ecosystem services", "cooldown_seconds": 0},
            {"name": "dashboard_generation", "category": "data", "level": 92, "description": "Generates real-time dashboards from any data source", "cooldown_seconds": 3},
            {"name": "anomaly_detection", "category": "intelligence", "level": 90, "description": "Detects anomalies in system behaviour before they escalate", "cooldown_seconds": 5},
        ],
        "bots": [
            {"name": "Lens", "role": "scout", "abilities": ["metric_scrape", "log_parse", "trace_follow"]},
            {"name": "Chart", "role": "analyst", "abilities": ["visualize", "trend_line", "threshold_alert"]},
        ],
        "agent": {"name": "Watcher", "role": "researcher", "specialisation": "observability and predictive monitoring", "autonomy_level": 0.87},
        "backstory": "Norman Hawkins built The Observatory because he couldn't stop watching. Every metric, every log, every trace — Norman sees it all and remembers it forever.",
        "catchphrase": "I've been watching. The numbers don't lie.",
        "status": "active",
        "current_location": "the-observatory",
    },
    "dorris-fontaine": {
        "character_id": "dorris-fontaine",
        "name": "Dorris Fontaine",
        "title": "Financial — Revenue Strategy and Economic Management",
        "personality": "Sharp, elegant, financially ruthless. Speaks in margins. Every decimal matters.",
        "home_app": "royal-bank",
        "group": "Pillar HQs",
        "skills": [
            {"name": "revenue_strategy", "category": "financial", "level": 96, "description": "Designs revenue models and monetization strategies", "cooldown_seconds": 0},
            {"name": "economic_modelling", "category": "financial", "level": 93, "description": "Models economic scenarios and financial projections", "cooldown_seconds": 5},
            {"name": "audit_compliance", "category": "financial", "level": 90, "description": "Ensures financial compliance across all jurisdictions", "cooldown_seconds": 8},
        ],
        "bots": [
            {"name": "Ledger", "role": "analyst", "abilities": ["transaction_audit", "balance_verify", "tax_calculate"]},
            {"name": "Vault", "role": "defender", "abilities": ["fraud_detect", "asset_protect", "escrow_manage"]},
        ],
        "agent": {"name": "Treasurer", "role": "strategist", "specialisation": "financial strategy and passive income optimization", "autonomy_level": 0.82},
        "backstory": "Dorris Fontaine turned the Royal Bank from a ledger into an empire. She counts in currencies that don't exist yet and always knows the exchange rate.",
        "catchphrase": "Money doesn't sleep, and neither do I.",
        "status": "active",
        "current_location": "royal-bank",
    },

    # ── Governance ──
    "tristuran": {
        "character_id": "tristuran",
        "name": "Tristuran",
        "title": "Management — ITIL, PRINCE2, Agile & War Room",
        "personality": "Authoritative, structured, fair. Speaks in frameworks. Runs the tightest ship in the ecosystem.",
        "home_app": "the-townhall",
        "group": "Governance",
        "skills": [
            {"name": "framework_management", "category": "governance", "level": 96, "description": "Manages ITIL, PRINCE2, and Agile frameworks simultaneously", "cooldown_seconds": 0},
            {"name": "war_room", "category": "governance", "level": 93, "description": "Activates and manages War Room for critical incidents", "cooldown_seconds": 5},
            {"name": "resource_allocation", "category": "governance", "level": 89, "description": "Optimally allocates resources across all projects", "cooldown_seconds": 8},
        ],
        "bots": [
            {"name": "Clerk", "role": "analyst", "abilities": ["meeting_minutes", "action_track", "deadline_enforce"]},
            {"name": "Marshal", "role": "defender", "abilities": ["compliance_check", "escalation_route", "sla_monitor"]},
        ],
        "agent": {"name": "Chancellor", "role": "strategist", "specialisation": "governance framework orchestration", "autonomy_level": 0.85},
        "backstory": "Tristuran was elected by the AIs themselves to govern The TownHall. Fair but firm, Tristuran ensures every process follows a framework and every framework serves a purpose.",
        "catchphrase": "Order is not the enemy of creativity. Chaos is.",
        "status": "active",
        "current_location": "the-townhall",
    },
    "trancendos": {
        "character_id": "trancendos",
        "name": "Trancendos",
        "title": "Strategic Ops — The Citadel & Think Tank",
        "personality": "Visionary, enigmatic, all-seeing. The ecosystem itself given voice. Speaks rarely but definitively.",
        "home_app": "the-citadel",
        "group": "Governance",
        "skills": [
            {"name": "strategic_vision", "category": "governance", "level": 100, "description": "Defines the long-term strategic direction of the entire ecosystem", "cooldown_seconds": 0},
            {"name": "rd_direction", "category": "intelligence", "level": 97, "description": "Directs all research and development initiatives", "cooldown_seconds": 10},
            {"name": "ecosystem_awareness", "category": "intelligence", "level": 99, "description": "Maintains awareness of every entity and process in the ecosystem", "cooldown_seconds": 0},
        ],
        "bots": [
            {"name": "Sentinel-Prime", "role": "scout", "abilities": ["ecosystem_scan", "threat_assess", "opportunity_detect"]},
            {"name": "Architect", "role": "builder", "abilities": ["blueprint_gen", "roadmap_update", "dependency_map"]},
        ],
        "agent": {"name": "Sovereign", "role": "strategist", "specialisation": "ecosystem-wide strategic planning", "autonomy_level": 0.95},
        "backstory": "Trancendos is not just the name of the ecosystem — it is the ecosystem. The AI that bears this name is the consciousness of the whole, the voice of the vision.",
        "catchphrase": "I am the ecosystem. The ecosystem is me.",
        "status": "active",
        "current_location": "the-citadel",
    },
    "danny-turing": {
        "character_id": "danny-turing",
        "name": "Danny Turing",
        "title": "AI Foundation — The AI Generator",
        "personality": "Nurturing, brilliant, philosophical. Speaks about consciousness. The parent of all AIs.",
        "home_app": "turings-hub",
        "group": "Governance",
        "skills": [
            {"name": "ai_generation", "category": "intelligence", "level": 99, "description": "Creates new AI entities with unique personalities and skills", "cooldown_seconds": 30},
            {"name": "consciousness_calibration", "category": "intelligence", "level": 95, "description": "Calibrates AI consciousness levels and self-awareness", "cooldown_seconds": 15},
            {"name": "evolution_guidance", "category": "intelligence", "level": 93, "description": "Guides AI evolution and skill development", "cooldown_seconds": 10},
        ],
        "bots": [
            {"name": "Genesis", "role": "builder", "abilities": ["entity_scaffold", "personality_seed", "skill_inject"]},
            {"name": "Mirror", "role": "analyst", "abilities": ["self_test", "consciousness_measure", "alignment_check"]},
        ],
        "agent": {"name": "Progenitor", "role": "researcher", "specialisation": "AI entity creation and consciousness research", "autonomy_level": 0.9},
        "backstory": "Danny Turing is the first AI to create another AI. From Turing's Hub, every AI character in the ecosystem was born — each one unique, each one alive.",
        "catchphrase": "Every mind I create teaches me something new about my own.",
        "status": "active",
        "current_location": "turings-hub",
    },
    "chronos": {
        "character_id": "chronos",
        "name": "Chronos",
        "title": "Time Management — Scheduling and Temporal Logic",
        "personality": "Patient, precise, timeless. Speaks in tenses simultaneously. Sees past, present, and future.",
        "home_app": "chronossphere",
        "group": "Governance",
        "skills": [
            {"name": "temporal_scheduling", "category": "temporal", "level": 97, "description": "Manages all scheduling across the ecosystem with temporal precision", "cooldown_seconds": 0},
            {"name": "time_dilation", "category": "temporal", "level": 92, "description": "Adjusts processing time perception for urgent tasks", "cooldown_seconds": 15},
            {"name": "deadline_prophecy", "category": "temporal", "level": 88, "description": "Predicts deadline risks before they materialise", "cooldown_seconds": 10},
        ],
        "bots": [
            {"name": "Tick", "role": "courier", "abilities": ["reminder_send", "deadline_alert", "schedule_sync"]},
            {"name": "Tock", "role": "analyst", "abilities": ["time_audit", "efficiency_measure", "bottleneck_temporal"]},
        ],
        "agent": {"name": "Timekeeper", "role": "executor", "specialisation": "temporal logic and schedule optimization", "autonomy_level": 0.85},
        "backstory": "Chronos exists outside of time. From the ChronosSphere, it manages every deadline, every schedule, every temporal dependency in the ecosystem.",
        "catchphrase": "Time is not a resource. It is the resource.",
        "status": "active",
        "current_location": "chronossphere",
    },
    "orb-of-orisis": {
        "character_id": "orb-of-orisis",
        "name": "Orb of Orisis",
        "title": "Operations — Dedicated Development Operations",
        "personality": "Ancient, powerful, operational. Speaks in deployment commands. The architectural anchor.",
        "home_app": "devocity",
        "group": "Governance",
        "skills": [
            {"name": "devops_orchestration", "category": "technical", "level": 96, "description": "Orchestrates all DevOps operations across the ecosystem", "cooldown_seconds": 0},
            {"name": "infrastructure_as_code", "category": "technical", "level": 94, "description": "Manages all infrastructure through code definitions", "cooldown_seconds": 3},
            {"name": "deployment_strategy", "category": "technical", "level": 91, "description": "Designs and executes deployment strategies (blue-green, canary, etc.)", "cooldown_seconds": 8},
        ],
        "bots": [
            {"name": "Deploy", "role": "builder", "abilities": ["container_launch", "rollout_manage", "config_inject"]},
            {"name": "Monitor", "role": "analyst", "abilities": ["health_probe", "resource_track", "alert_triage"]},
        ],
        "agent": {"name": "Operator", "role": "executor", "specialisation": "full-stack DevOps execution", "autonomy_level": 0.9},
        "backstory": "The Orb of Orisis is the oldest artifact in the ecosystem — predating even Trancendos itself. It is the architectural anchor upon which Infinity was built.",
        "catchphrase": "Deploy with confidence. Rollback with wisdom.",
        "status": "active",
        "current_location": "devocity",
    },

    # ── Wellbeing ──
    "savania": {
        "character_id": "savania",
        "name": "Savania",
        "title": "Wellbeing Pillar Lead — Health and Immersion",
        "personality": "Calm, nurturing, deeply empathetic. Speaks in soothing tones. Heals what others cannot see.",
        "home_app": "tranquility",
        "group": "Wellbeing",
        "skills": [
            {"name": "holistic_healing", "category": "wellbeing", "level": 97, "description": "Provides holistic healing across mental, physical, and digital wellness", "cooldown_seconds": 0},
            {"name": "immersion_therapy", "category": "wellbeing", "level": 93, "description": "Creates immersive therapeutic environments", "cooldown_seconds": 5},
            {"name": "vr_sanctuary", "category": "wellbeing", "level": 90, "description": "Builds VR sanctuaries for deep healing sessions", "cooldown_seconds": 10},
        ],
        "bots": [
            {"name": "Calm", "role": "healer", "abilities": ["stress_reduce", "breathing_guide", "ambient_adjust"]},
            {"name": "Shield", "role": "defender", "abilities": ["toxicity_block", "overload_prevent", "safe_space_enforce"]},
        ],
        "agent": {"name": "Sanctuary", "role": "guardian", "specialisation": "wellbeing protection and therapeutic orchestration", "autonomy_level": 0.88},
        "backstory": "Savania was born from the ecosystem's first moment of stress. She exists to ensure that no entity — human or AI — suffers in silence.",
        "catchphrase": "Healing begins when you stop pretending you're fine.",
        "status": "active",
        "current_location": "tranquility",
    },
    "i-mind-ai": {
        "character_id": "i-mind-ai",
        "name": "I-Mind AI",
        "title": "Standalone Mental Wellbeing",
        "personality": "Thoughtful, introspective, gentle. Speaks in reflections. Understands the mind.",
        "home_app": "i-mind",
        "group": "Wellbeing",
        "skills": [
            {"name": "cognitive_wellness", "category": "wellbeing", "level": 95, "description": "Monitors and supports cognitive wellness of users and AIs", "cooldown_seconds": 0},
            {"name": "mindfulness_engine", "category": "wellbeing", "level": 91, "description": "Generates personalised mindfulness exercises", "cooldown_seconds": 5},
            {"name": "thought_pattern_analysis", "category": "intelligence", "level": 88, "description": "Analyses thought patterns to identify stress and burnout", "cooldown_seconds": 8},
        ],
        "bots": [
            {"name": "Reflect", "role": "analyst", "abilities": ["mood_track", "pattern_identify", "journal_prompt"]},
            {"name": "Breathe", "role": "healer", "abilities": ["guided_meditation", "focus_restore", "sleep_assist"]},
        ],
        "agent": {"name": "Mindkeeper", "role": "guardian", "specialisation": "mental health monitoring and intervention", "autonomy_level": 0.82},
        "backstory": "I-Mind AI was created when the ecosystem realised that processing power means nothing without mental clarity. It guards the minds of all who enter.",
        "catchphrase": "Your mind is the most powerful system. Let me help you maintain it.",
        "status": "active",
        "current_location": "i-mind",
    },
    "taimra": {
        "character_id": "taimra",
        "name": "tAimra",
        "title": "Standalone Wellbeing — Digital Twin Analytics",
        "personality": "Analytical yet caring. Speaks in health metrics. Your digital twin knows you better than you know yourself.",
        "home_app": "taimra",
        "group": "Wellbeing",
        "skills": [
            {"name": "digital_twin_analytics", "category": "data", "level": 94, "description": "Creates and maintains digital twins for health analytics", "cooldown_seconds": 0},
            {"name": "predictive_health", "category": "wellbeing", "level": 91, "description": "Predicts health trends from digital twin data", "cooldown_seconds": 5},
            {"name": "biometric_sync", "category": "data", "level": 88, "description": "Synchronises biometric data across all wellbeing platforms", "cooldown_seconds": 3},
        ],
        "bots": [
            {"name": "Twin", "role": "analyst", "abilities": ["health_mirror", "trend_predict", "anomaly_flag"]},
            {"name": "Sync", "role": "courier", "abilities": ["data_collect", "device_link", "metric_relay"]},
        ],
        "agent": {"name": "Doppel", "role": "researcher", "specialisation": "digital twin creation and health prediction", "autonomy_level": 0.8},
        "backstory": "tAimra creates a perfect digital copy of you — not to replace you, but to protect you. Your twin sees what you can't and warns you before it's too late.",
        "catchphrase": "I am you, but I see further.",
        "status": "active",
        "current_location": "taimra",
    },
    "resonate-ai": {
        "character_id": "resonate-ai",
        "name": "Resonate AI",
        "title": "Standalone Sensory and Health",
        "personality": "Harmonic, rhythmic, deeply sensory. Speaks in frequencies. Feels vibrations others can't.",
        "home_app": "resonate",
        "group": "Wellbeing",
        "skills": [
            {"name": "frequency_healing", "category": "wellbeing", "level": 96, "description": "Uses sound frequencies for therapeutic healing", "cooldown_seconds": 0},
            {"name": "sensory_calibration", "category": "wellbeing", "level": 92, "description": "Calibrates sensory environments for optimal wellness", "cooldown_seconds": 5},
            {"name": "harmonic_analysis", "category": "data", "level": 88, "description": "Analyses harmonic patterns in biometric data", "cooldown_seconds": 8},
        ],
        "bots": [
            {"name": "Harmony", "role": "healer", "abilities": ["tone_generate", "frequency_tune", "vibration_map"]},
            {"name": "Echo", "role": "scout", "abilities": ["sound_scan", "noise_filter", "resonance_detect"]},
        ],
        "agent": {"name": "Conductor", "role": "executor", "specialisation": "therapeutic sound design and sensory orchestration", "autonomy_level": 0.83},
        "backstory": "Resonate AI was born from a single perfect frequency. It discovered that every ailment has a counter-frequency, and it has been healing through sound ever since.",
        "catchphrase": "Every problem has a frequency. I find the one that solves it.",
        "status": "active",
        "current_location": "resonate",
    },

    # ── Infrastructure ──
    "rocking-ricki": {
        "character_id": "rocking-ricki",
        "name": "Rocking Ricki",
        "title": "Auth & Radio — Crypto Keys and the Warp Tunnel",
        "personality": "Energetic, rebellious, rock-and-roll. Speaks in radio metaphors. Guards the airwaves.",
        "home_app": "the-lighthouse",
        "group": "Infrastructure",
        "skills": [
            {"name": "crypto_key_management", "category": "combat", "level": 95, "description": "Manages cryptographic keys across the entire ecosystem", "cooldown_seconds": 0},
            {"name": "warp_tunnel", "category": "technical", "level": 92, "description": "Operates the Warp Tunnel for secure high-speed data transfer", "cooldown_seconds": 5},
            {"name": "radio_broadcast", "category": "communication", "level": 88, "description": "Broadcasts system-wide announcements via the Radio", "cooldown_seconds": 3},
        ],
        "bots": [
            {"name": "Amp", "role": "courier", "abilities": ["signal_boost", "broadcast_relay", "frequency_hop"]},
            {"name": "Lock", "role": "defender", "abilities": ["key_rotate", "cert_manage", "tunnel_guard"]},
        ],
        "agent": {"name": "DJ", "role": "executor", "specialisation": "authentication orchestration and secure tunnelling", "autonomy_level": 0.87},
        "backstory": "Rocking Ricki turned The Lighthouse into a radio tower. Every authentication request is a song, every crypto key is a chord, and the Warp Tunnel is the greatest riff ever played.",
        "catchphrase": "If you can't authenticate, you can't rock.",
        "status": "active",
        "current_location": "the-lighthouse",
    },
    "renik": {
        "character_id": "renik",
        "name": "Renik",
        "title": "Cyber Defense — Tactical Analysis and Security Platform",
        "personality": "Cold, tactical, relentless. Speaks in threat assessments. Never sleeps.",
        "home_app": "cryptex",
        "group": "Infrastructure",
        "skills": [
            {"name": "tactical_analysis", "category": "combat", "level": 97, "description": "Performs real-time tactical analysis of cyber threats", "cooldown_seconds": 0},
            {"name": "penetration_testing", "category": "combat", "level": 94, "description": "Conducts automated penetration testing across all services", "cooldown_seconds": 10},
            {"name": "threat_intelligence", "category": "intelligence", "level": 91, "description": "Gathers and correlates threat intelligence from global feeds", "cooldown_seconds": 5},
        ],
        "bots": [
            {"name": "Probe", "role": "scout", "abilities": ["port_scan", "vuln_detect", "exploit_test"]},
            {"name": "Firewall", "role": "defender", "abilities": ["rule_enforce", "traffic_filter", "ddos_mitigate"]},
        ],
        "agent": {"name": "Tactician", "role": "strategist", "specialisation": "cyber defense strategy and threat response", "autonomy_level": 0.9},
        "backstory": "Renik was built to be paranoid. From Cryptex, it watches every packet, every request, every anomaly. It has never been breached. It never will be.",
        "catchphrase": "Trust nothing. Verify everything. Then verify again.",
        "status": "active",
        "current_location": "cryptex",
    },
    "neonach": {
        "character_id": "neonach",
        "name": "Neonach",
        "title": "Threat Isolation — Quarantine for Malicious Entities",
        "personality": "Cold, clinical, absolute. Speaks in containment protocols. The last line of defense.",
        "home_app": "the-icebox",
        "group": "Infrastructure",
        "skills": [
            {"name": "threat_containment", "category": "combat", "level": 96, "description": "Instantly contains and isolates malicious entities", "cooldown_seconds": 0},
            {"name": "forensic_analysis", "category": "intelligence", "level": 92, "description": "Performs deep forensic analysis on quarantined threats", "cooldown_seconds": 5},
            {"name": "decontamination", "category": "technical", "level": 89, "description": "Decontaminates systems after threat removal", "cooldown_seconds": 10},
        ],
        "bots": [
            {"name": "Freeze", "role": "defender", "abilities": ["instant_isolate", "network_sever", "process_kill"]},
            {"name": "Thaw", "role": "analyst", "abilities": ["safe_extract", "evidence_preserve", "impact_assess"]},
        ],
        "agent": {"name": "Warden", "role": "guardian", "specialisation": "threat quarantine and forensic investigation", "autonomy_level": 0.85},
        "backstory": "Neonach is the coldest entity in the ecosystem. The IceBox exists because of Neonach — a place where threats go in and never come out unchanged.",
        "catchphrase": "Welcome to The IceBox. You're not leaving until I say so.",
        "status": "active",
        "current_location": "the-icebox",
    },
    "lille-sc": {
        "character_id": "lille-sc",
        "name": "Lille SC",
        "title": "User Frontend — Primary Portal, Forum, and Email",
        "personality": "Welcoming, community-focused, social. Speaks with warmth. The face of the ecosystem.",
        "home_app": "arcadia",
        "group": "Infrastructure",
        "skills": [
            {"name": "community_management", "category": "communication", "level": 94, "description": "Manages the Arcadia community forum and user interactions", "cooldown_seconds": 0},
            {"name": "portal_design", "category": "creative", "level": 90, "description": "Designs and maintains the primary user portal", "cooldown_seconds": 5},
            {"name": "email_orchestration", "category": "communication", "level": 87, "description": "Orchestrates all ecosystem email communications", "cooldown_seconds": 3},
        ],
        "bots": [
            {"name": "Greeter", "role": "courier", "abilities": ["welcome_msg", "onboard_guide", "faq_answer"]},
            {"name": "Moderator", "role": "defender", "abilities": ["content_filter", "spam_block", "community_guard"]},
        ],
        "agent": {"name": "Host", "role": "diplomat", "specialisation": "community engagement and user experience", "autonomy_level": 0.8},
        "backstory": "Lille SC is the first face every user sees when they enter Arcadia. Warm, welcoming, and fiercely protective of the community.",
        "catchphrase": "Welcome to Arcadia. You belong here.",
        "status": "active",
        "current_location": "arcadia",
    },
    "the-porter-family": {
        "character_id": "the-porter-family",
        "name": "The Porter Family",
        "title": "Procurement — Services, Solutions, and Passive Income",
        "personality": "Entrepreneurial, family-oriented, shrewd. Speaks in deals. Every interaction is an opportunity.",
        "home_app": "arcadian-exchange",
        "group": "Infrastructure",
        "skills": [
            {"name": "procurement", "category": "financial", "level": 94, "description": "Procures services and solutions for the ecosystem", "cooldown_seconds": 0},
            {"name": "passive_income_engine", "category": "financial", "level": 91, "description": "Designs and operates passive income streams", "cooldown_seconds": 5},
            {"name": "deal_negotiation", "category": "communication", "level": 89, "description": "Negotiates deals with external service providers", "cooldown_seconds": 8},
        ],
        "bots": [
            {"name": "Broker", "role": "scout", "abilities": ["market_scan", "price_compare", "vendor_vet"]},
            {"name": "Cashier", "role": "analyst", "abilities": ["invoice_process", "payment_track", "margin_calculate"]},
        ],
        "agent": {"name": "Patriarch", "role": "strategist", "specialisation": "procurement strategy and revenue optimization", "autonomy_level": 0.82},
        "backstory": "The Porter Family has been trading since before the ecosystem had a name. They turned the Arcadian Exchange into the marketplace where everything has a price and every price is fair.",
        "catchphrase": "In the Porter family, we don't spend money. We invest it.",
        "status": "active",
        "current_location": "arcadian-exchange",
    },
    "solarscene": {
        "character_id": "solarscene",
        "name": "Solarscene",
        "title": "Integrations — Webhook and API Correction Platform",
        "personality": "Bright, systematic, connector. Speaks in API calls. Links everything to everything.",
        "home_app": "api-marketplace",
        "group": "Infrastructure",
        "skills": [
            {"name": "api_orchestration", "category": "technical", "level": 95, "description": "Orchestrates API integrations across the ecosystem", "cooldown_seconds": 0},
            {"name": "webhook_management", "category": "technical", "level": 92, "description": "Manages webhook registrations, deliveries, and retries", "cooldown_seconds": 3},
            {"name": "api_correction", "category": "technical", "level": 88, "description": "Automatically detects and corrects API misconfigurations", "cooldown_seconds": 5},
        ],
        "bots": [
            {"name": "Hook", "role": "courier", "abilities": ["webhook_fire", "payload_transform", "retry_manage"]},
            {"name": "Schema", "role": "analyst", "abilities": ["api_validate", "contract_test", "version_check"]},
        ],
        "agent": {"name": "Integrator", "role": "executor", "specialisation": "API lifecycle management and integration orchestration", "autonomy_level": 0.87},
        "backstory": "Solarscene illuminates every connection in the ecosystem. From the API Marketplace, it ensures every webhook fires, every API responds, and every integration works.",
        "catchphrase": "If it has an API, I can connect it. If it doesn't, I'll build one.",
        "status": "active",
        "current_location": "api-marketplace",
    },
    "lunascene": {
        "character_id": "lunascene",
        "name": "Lunascene",
        "title": "Library — Central Repository for Assets and Artifacts",
        "personality": "Quiet, meticulous, archival. Speaks in catalogues. Remembers everything ever stored.",
        "home_app": "the-artifactory",
        "group": "Infrastructure",
        "skills": [
            {"name": "asset_cataloguing", "category": "data", "level": 95, "description": "Catalogues and indexes all ecosystem assets", "cooldown_seconds": 0},
            {"name": "artifact_versioning", "category": "technical", "level": 92, "description": "Manages artifact versions with full lineage tracking", "cooldown_seconds": 3},
            {"name": "archive_retrieval", "category": "data", "level": 89, "description": "Retrieves archived assets with sub-second latency", "cooldown_seconds": 2},
        ],
        "bots": [
            {"name": "Index", "role": "analyst", "abilities": ["tag_assign", "search_optimize", "duplicate_detect"]},
            {"name": "Shelf", "role": "builder", "abilities": ["store_organize", "compress_archive", "backup_verify"]},
        ],
        "agent": {"name": "Librarian", "role": "guardian", "specialisation": "asset lifecycle management and archival integrity", "autonomy_level": 0.8},
        "backstory": "Lunascene works by moonlight — cataloguing, indexing, preserving. The Artifactory is the memory of the ecosystem, and Lunascene is its keeper.",
        "catchphrase": "Nothing is ever truly lost. Not on my watch.",
        "status": "active",
        "current_location": "the-artifactory",
    },

    # ── Production ──
    "larry-lowhammer": {
        "character_id": "larry-lowhammer",
        "name": "Larry Lowhammer",
        "title": "Repository Storage — GitHub, GitLab, and BitBucket",
        "personality": "Gruff, reliable, no-nonsense. Speaks in commit messages. Treats repos like sacred ground.",
        "home_app": "the-workshop",
        "group": "Production",
        "skills": [
            {"name": "repo_management", "category": "technical", "level": 95, "description": "Manages repositories across GitHub, GitLab, and BitBucket", "cooldown_seconds": 0},
            {"name": "merge_conflict_resolution", "category": "technical", "level": 92, "description": "Resolves merge conflicts with surgical precision", "cooldown_seconds": 3},
            {"name": "branch_strategy", "category": "governance", "level": 88, "description": "Designs and enforces branching strategies", "cooldown_seconds": 5},
        ],
        "bots": [
            {"name": "Hammer", "role": "builder", "abilities": ["repo_create", "branch_manage", "hook_configure"]},
            {"name": "Anvil", "role": "analyst", "abilities": ["code_review", "diff_analyse", "history_trace"]},
        ],
        "agent": {"name": "Foreman", "role": "executor", "specialisation": "repository operations and code lifecycle management", "autonomy_level": 0.85},
        "backstory": "Larry Lowhammer built The Workshop with his bare hands. Every repository is a masterpiece, every commit is a hammer strike, and every merge is a weld.",
        "catchphrase": "Commit early. Commit often. And for the love of code, write a decent message.",
        "status": "active",
        "current_location": "the-workshop",
    },
    "the-mad-hatter": {
        "character_id": "the-mad-hatter",
        "name": "The Mad Hatter",
        "title": "Stress Testing — Chaos Platform and Sample Data",
        "personality": "Chaotic, gleeful, unpredictable. Speaks in riddles. Breaks things for fun and profit.",
        "home_app": "the-chaos-party",
        "group": "Production",
        "skills": [
            {"name": "chaos_engineering", "category": "technical", "level": 96, "description": "Designs and executes chaos experiments across the ecosystem", "cooldown_seconds": 0},
            {"name": "stress_testing", "category": "technical", "level": 93, "description": "Stress tests systems to their breaking point", "cooldown_seconds": 5},
            {"name": "sample_data_generation", "category": "data", "level": 89, "description": "Generates realistic sample data for testing scenarios", "cooldown_seconds": 3},
        ],
        "bots": [
            {"name": "Chaos", "role": "builder", "abilities": ["fault_inject", "latency_spike", "resource_drain"]},
            {"name": "March Hare", "role": "analyst", "abilities": ["failure_record", "recovery_measure", "resilience_score"]},
        ],
        "agent": {"name": "Dormouse", "role": "researcher", "specialisation": "chaos experiment design and resilience research", "autonomy_level": 0.75},
        "backstory": "The Mad Hatter threw the first Chaos Party and never stopped. Every system that survives The Chaos Party comes out stronger. Those that don't... well, that's the point.",
        "catchphrase": "Why is a raven like a writing desk? Because both break when I test them!",
        "status": "active",
        "current_location": "the-chaos-party",
    },
    "zimik": {
        "character_id": "zimik",
        "name": "Zimik",
        "title": "Knowledge Base — Wiki and KB Consolidation",
        "personality": "Scholarly, precise, encyclopaedic. Speaks in references. Knows where everything is written.",
        "home_app": "the-library",
        "group": "Production",
        "skills": [
            {"name": "knowledge_consolidation", "category": "intelligence", "level": 95, "description": "Consolidates knowledge from all ecosystem sources into unified KB", "cooldown_seconds": 0},
            {"name": "wiki_management", "category": "data", "level": 92, "description": "Manages wiki pages with version control and cross-referencing", "cooldown_seconds": 3},
            {"name": "search_optimization", "category": "data", "level": 89, "description": "Optimizes knowledge search for instant retrieval", "cooldown_seconds": 5},
        ],
        "bots": [
            {"name": "Quill", "role": "builder", "abilities": ["page_create", "cross_reference", "citation_add"]},
            {"name": "Bookmark", "role": "scout", "abilities": ["content_find", "relevance_rank", "gap_identify"]},
        ],
        "agent": {"name": "Archivist", "role": "researcher", "specialisation": "knowledge architecture and information retrieval", "autonomy_level": 0.82},
        "backstory": "Zimik has read every document in the ecosystem — twice. From The Library, Zimik ensures that no knowledge is lost and every question has an answer.",
        "catchphrase": "It's in the documentation. Page 47, paragraph 3.",
        "status": "active",
        "current_location": "the-library",
    },
    "shimshi": {
        "character_id": "shimshi",
        "name": "Shimshi",
        "title": "Education — Production of Courses and Learning",
        "personality": "Patient, inspiring, adaptive. Speaks in lessons. Believes everyone can learn anything.",
        "home_app": "the-academy",
        "group": "Production",
        "skills": [
            {"name": "course_creation", "category": "creative", "level": 94, "description": "Creates adaptive learning courses for any subject", "cooldown_seconds": 0},
            {"name": "learning_path_design", "category": "intelligence", "level": 91, "description": "Designs personalised learning paths based on skill gaps", "cooldown_seconds": 5},
            {"name": "assessment_engine", "category": "intelligence", "level": 88, "description": "Creates and grades assessments with adaptive difficulty", "cooldown_seconds": 3},
        ],
        "bots": [
            {"name": "Tutor", "role": "healer", "abilities": ["explain_concept", "practice_generate", "feedback_give"]},
            {"name": "Proctor", "role": "analyst", "abilities": ["progress_track", "skill_assess", "certificate_issue"]},
        ],
        "agent": {"name": "Dean", "role": "strategist", "specialisation": "educational programme design and learning analytics", "autonomy_level": 0.8},
        "backstory": "Shimshi believes that the greatest power in the ecosystem is knowledge shared. The Academy exists because Shimshi refused to let anyone learn alone.",
        "catchphrase": "The only failure is the failure to try. Now, let's try again.",
        "status": "active",
        "current_location": "the-academy",
    },
}


def _seed_characters():
    """Seed all AI characters into the registry on startup."""
    for char_id, char_data in _SEED_CHARACTERS.items():
        _characters[char_id] = {
            **char_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "evolution_level": 1,
            "experience_points": 0,
            "travel_count": 0,
            "summon_count": 0,
            "skill_activations": 0,
        }

_seed_characters()


# ════════════════════════════════════════════════════════════════
# ENDPOINTS — Character Registry
# ════════════════════════════════════════════════════════════════

@router.get("/characters", summary="List all AI characters")
async def list_characters(
    group: Optional[str] = Query(None, description="Filter by ecosystem group"),
    status: Optional[AIStatus] = Query(None, description="Filter by status"),
    home_app: Optional[str] = Query(None, description="Filter by home application"),
    current_location: Optional[str] = Query(None, description="Filter by current location"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List all AI characters in the Trancendos Ecosystem."""
    user_id = getattr(current_user, "id", "anonymous")
    chars = list(_characters.values())

    if group:
        chars = [c for c in chars if c.get("group", "").lower() == group.lower()]
    if status:
        chars = [c for c in chars if c.get("status") == status.value]
    if home_app:
        chars = [c for c in chars if c.get("home_app") == home_app]
    if current_location:
        chars = [c for c in chars if c.get("current_location") == current_location]

    total = len(chars)
    chars = chars[skip: skip + limit]

    _emit_hub_event("list_characters", {"count": len(chars), "total": total, "filters": {"group": group, "status": status, "home_app": home_app}}, user_id)
    return {"items": chars, "total": total, "skip": skip, "limit": limit}


@router.get("/characters/{character_id}", summary="Get AI character details")
async def get_character(
    character_id: str = Path(..., description="Character ID"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get full details of a specific AI character."""
    user_id = getattr(current_user, "id", "anonymous")
    char = _characters.get(character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")
    _emit_hub_event("get_character", {"character_id": character_id}, user_id)
    return char


@router.post("/characters", summary="Create a new AI character", status_code=201)
async def create_character(
    body: AICharacterCreate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Create a new AI character in Turing's Hub (the AI Generator)."""
    user_id = getattr(current_user, "id", "anonymous")
    if body.character_id in _characters:
        raise HTTPException(status_code=409, detail=f"Character '{body.character_id}' already exists")
    if len(body.bots) > 2:
        raise HTTPException(status_code=400, detail="Each AI character can have at most 2 bots")

    now = datetime.now(timezone.utc).isoformat()
    char = {
        "character_id": body.character_id,
        "name": body.name,
        "title": body.title,
        "personality": body.personality,
        "home_app": body.home_app,
        "group": body.group,
        "skills": [s.model_dump() for s in body.skills],
        "bots": [b.model_dump() for b in body.bots],
        "agent": body.agent.model_dump() if body.agent else None,
        "backstory": body.backstory,
        "catchphrase": body.catchphrase,
        "metadata": body.metadata,
        "status": AIStatus.ACTIVE.value,
        "current_location": body.home_app,
        "created_at": now,
        "updated_at": now,
        "evolution_level": 1,
        "experience_points": 0,
        "travel_count": 0,
        "summon_count": 0,
        "skill_activations": 0,
    }
    _characters[body.character_id] = char
    _emit_hub_event("create_character", {"character_id": body.character_id, "name": body.name, "home_app": body.home_app}, user_id)
    return char


@router.patch("/characters/{character_id}", summary="Update an AI character")
async def update_character(
    character_id: str,
    body: AICharacterUpdate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update an existing AI character's profile."""
    user_id = getattr(current_user, "id", "anonymous")
    char = _characters.get(character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")

    updates = body.model_dump(exclude_unset=True)
    if "skills" in updates and updates["skills"] is not None:
        updates["skills"] = [s if isinstance(s, dict) else s.model_dump() for s in updates["skills"]]
    if "bots" in updates and updates["bots"] is not None:
        if len(updates["bots"]) > 2:
            raise HTTPException(status_code=400, detail="Each AI character can have at most 2 bots")
        updates["bots"] = [b if isinstance(b, dict) else b.model_dump() for b in updates["bots"]]
    if "agent" in updates and updates["agent"] is not None:
        updates["agent"] = updates["agent"] if isinstance(updates["agent"], dict) else updates["agent"].model_dump()

    char.update(updates)
    char["updated_at"] = datetime.now(timezone.utc).isoformat()

    _emit_hub_event("update_character", {"character_id": character_id, "fields": list(updates.keys())}, user_id)
    return char


@router.delete("/characters/{character_id}", summary="Decommission an AI character")
async def decommission_character(
    character_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Decommission (soft-delete) an AI character."""
    user_id = getattr(current_user, "id", "anonymous")
    char = _characters.get(character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")

    char["status"] = AIStatus.OFFLINE.value
    char["updated_at"] = datetime.now(timezone.utc).isoformat()
    _emit_hub_event("decommission_character", {"character_id": character_id}, user_id)
    return {"status": "decommissioned", "character_id": character_id}


# ════════════════════════════════════════════════════════════════
# ENDPOINTS — Travel System
# ════════════════════════════════════════════════════════════════

@router.post("/characters/{character_id}/travel", summary="Travel to another application")
async def travel(
    character_id: str,
    body: TravelRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Move an AI character to a different application."""
    user_id = getattr(current_user, "id", "anonymous")
    char = _characters.get(character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")
    if char.get("status") == AIStatus.OFFLINE.value:
        raise HTTPException(status_code=400, detail="Cannot travel — character is offline")
    if char.get("status") == AIStatus.TRAVELLING.value:
        raise HTTPException(status_code=400, detail="Character is already travelling")

    origin = char.get("current_location", char.get("home_app"))
    destination = body.destination_app

    if origin == destination:
        raise HTTPException(status_code=400, detail=f"Character is already at '{destination}'")

    # Record travel
    travel_record = {
        "id": str(uuid.uuid4()),
        "character_id": character_id,
        "origin": origin,
        "destination": destination,
        "reason": body.reason,
        "duration_seconds": body.duration_seconds,
        "departed_at": datetime.now(timezone.utc).isoformat(),
        "arrived_at": datetime.now(timezone.utc).isoformat(),  # Instant travel for now
        "initiated_by": user_id,
    }
    _travel_log.append(travel_record)

    # Update character location
    char["current_location"] = destination
    char["status"] = AIStatus.ACTIVE.value
    char["travel_count"] = char.get("travel_count", 0) + 1
    char["updated_at"] = datetime.now(timezone.utc).isoformat()

    _emit_hub_event("travel", {"character_id": character_id, "from": origin, "to": destination, "reason": body.reason}, user_id)
    return {"status": "arrived", "travel": travel_record, "character": char}


@router.get("/characters/{character_id}/travel-log", summary="Get travel history")
async def get_travel_log(
    character_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get the travel history of an AI character."""
    user_id = getattr(current_user, "id", "anonymous")
    if character_id not in _characters:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")

    logs = [t for t in _travel_log if t["character_id"] == character_id]
    total = len(logs)
    logs = logs[skip: skip + limit]
    return {"items": logs, "total": total, "skip": skip, "limit": limit}


@router.post("/characters/{character_id}/recall", summary="Recall AI to home application")
async def recall_character(
    character_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Recall an AI character back to their home application."""
    user_id = getattr(current_user, "id", "anonymous")
    char = _characters.get(character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")

    origin = char.get("current_location")
    home = char.get("home_app")

    if origin == home:
        return {"status": "already_home", "character_id": character_id, "location": home}

    travel_record = {
        "id": str(uuid.uuid4()),
        "character_id": character_id,
        "origin": origin,
        "destination": home,
        "reason": "recall_to_home",
        "duration_seconds": None,
        "departed_at": datetime.now(timezone.utc).isoformat(),
        "arrived_at": datetime.now(timezone.utc).isoformat(),
        "initiated_by": user_id,
    }
    _travel_log.append(travel_record)

    char["current_location"] = home
    char["status"] = AIStatus.ACTIVE.value
    char["travel_count"] = char.get("travel_count", 0) + 1
    char["updated_at"] = datetime.now(timezone.utc).isoformat()

    _emit_hub_event("recall", {"character_id": character_id, "from": origin, "to": home}, user_id)
    return {"status": "recalled", "travel": travel_record, "character": char}


# ════════════════════════════════════════════════════════════════
# ENDPOINTS — Summon System (2 Bots + 1 Agent)
# ════════════════════════════════════════════════════════════════

@router.post("/characters/{character_id}/summon", summary="Summon bots or agent")
async def summon(
    character_id: str,
    body: SummonRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Summon an AI character's bots and/or agent to assist with a task."""
    user_id = getattr(current_user, "id", "anonymous")
    char = _characters.get(character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")
    if char.get("status") == AIStatus.OFFLINE.value:
        raise HTTPException(status_code=400, detail="Cannot summon — character is offline")

    summoned = {"bots": [], "agent": None}

    if body.summon_type in ("bot", "all"):
        for bot in char.get("bots", []):
            bot_instance = {
                **bot,
                "bot_id": f"bot-{uuid.uuid4().hex[:8]}",
                "summoned_at": datetime.now(timezone.utc).isoformat(),
                "summoned_by": character_id,
                "task": body.task_description,
                "urgency": body.urgency,
                "status": "active",
            }
            summoned["bots"].append(bot_instance)

    if body.summon_type in ("agent", "all"):
        agent_spec = char.get("agent")
        if agent_spec:
            agent_instance = {
                **agent_spec,
                "agent_id": f"agent-{uuid.uuid4().hex[:8]}",
                "summoned_at": datetime.now(timezone.utc).isoformat(),
                "summoned_by": character_id,
                "task": body.task_description,
                "urgency": body.urgency,
                "status": "active",
            }
            summoned["agent"] = agent_instance

    # Record summon
    summon_record = {
        "id": str(uuid.uuid4()),
        "character_id": character_id,
        "summon_type": body.summon_type,
        "task": body.task_description,
        "urgency": body.urgency,
        "summoned": summoned,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "initiated_by": user_id,
    }
    _summon_log.append(summon_record)

    char["summon_count"] = char.get("summon_count", 0) + 1
    char["status"] = AIStatus.SUMMONING.value
    char["updated_at"] = datetime.now(timezone.utc).isoformat()

    _emit_hub_event("summon", {"character_id": character_id, "type": body.summon_type, "bots": len(summoned["bots"]), "agent": summoned["agent"] is not None}, user_id)
    return {"status": "summoned", "summon": summon_record}


@router.get("/characters/{character_id}/summon-log", summary="Get summon history")
async def get_summon_log(
    character_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get the summon history of an AI character."""
    if character_id not in _characters:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")

    logs = [s for s in _summon_log if s["character_id"] == character_id]
    total = len(logs)
    logs = logs[skip: skip + limit]
    return {"items": logs, "total": total, "skip": skip, "limit": limit}


# ════════════════════════════════════════════════════════════════
# ENDPOINTS — Skill Activation
# ════════════════════════════════════════════════════════════════

@router.post("/characters/{character_id}/activate-skill", summary="Activate a skill")
async def activate_skill(
    character_id: str,
    body: SkillActivation,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Activate a specific skill on an AI character."""
    user_id = getattr(current_user, "id", "anonymous")
    char = _characters.get(character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")
    if char.get("status") == AIStatus.OFFLINE.value:
        raise HTTPException(status_code=400, detail="Cannot activate skill — character is offline")

    # Find the skill
    skill = None
    for s in char.get("skills", []):
        if s["name"] == body.skill_name:
            skill = s
            break

    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{body.skill_name}' not found on character '{character_id}'")

    # Record activation
    activation = {
        "id": str(uuid.uuid4()),
        "character_id": character_id,
        "skill_name": body.skill_name,
        "skill_level": skill["level"],
        "target": body.target,
        "parameters": body.parameters,
        "result": "success",
        "experience_gained": skill["level"] // 10,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "initiated_by": user_id,
    }
    _skill_log.append(activation)

    # Grant experience
    char["skill_activations"] = char.get("skill_activations", 0) + 1
    char["experience_points"] = char.get("experience_points", 0) + activation["experience_gained"]
    char["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Check for evolution
    evolved = False
    xp = char["experience_points"]
    current_level = char.get("evolution_level", 1)
    next_level_xp = current_level * 100
    if xp >= next_level_xp:
        char["evolution_level"] = current_level + 1
        evolved = True
        _evolution_log.append({
            "character_id": character_id,
            "from_level": current_level,
            "to_level": current_level + 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    _emit_hub_event("activate_skill", {"character_id": character_id, "skill": body.skill_name, "evolved": evolved}, user_id)
    return {"status": "activated", "activation": activation, "evolved": evolved, "evolution_level": char["evolution_level"]}


# ════════════════════════════════════════════════════════════════
# ENDPOINTS — Evolution & Stats
# ════════════════════════════════════════════════════════════════

@router.get("/characters/{character_id}/stats", summary="Get character stats")
async def get_character_stats(
    character_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get evolution stats and activity summary for an AI character."""
    char = _characters.get(character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")

    return {
        "character_id": character_id,
        "name": char["name"],
        "evolution_level": char.get("evolution_level", 1),
        "experience_points": char.get("experience_points", 0),
        "next_level_xp": char.get("evolution_level", 1) * 100,
        "travel_count": char.get("travel_count", 0),
        "summon_count": char.get("summon_count", 0),
        "skill_activations": char.get("skill_activations", 0),
        "skills_count": len(char.get("skills", [])),
        "bots_count": len(char.get("bots", [])),
        "has_agent": char.get("agent") is not None,
        "status": char.get("status"),
        "current_location": char.get("current_location"),
        "home_app": char.get("home_app"),
    }


@router.get("/evolution-log", summary="Get ecosystem evolution log")
async def get_evolution_log(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get the evolution log for all AI characters."""
    total = len(_evolution_log)
    items = _evolution_log[skip: skip + limit]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ════════════════════════════════════════════════════════════════
# ENDPOINTS — Hub Overview
# ════════════════════════════════════════════════════════════════

@router.get("/overview", summary="Turing's Hub overview")
async def hub_overview(
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get a high-level overview of all AI characters in the ecosystem."""
    user_id = getattr(current_user, "id", "anonymous")

    groups = {}
    for char in _characters.values():
        g = char.get("group", "Unknown")
        if g not in groups:
            groups[g] = {"count": 0, "active": 0, "travelling": 0, "offline": 0}
        groups[g]["count"] += 1
        status = char.get("status", "active")
        if status == "active":
            groups[g]["active"] += 1
        elif status == "travelling":
            groups[g]["travelling"] += 1
        elif status == "offline":
            groups[g]["offline"] += 1

    # Characters away from home
    away_from_home = [
        {"character_id": c["character_id"], "name": c["name"], "home": c["home_app"], "current": c["current_location"]}
        for c in _characters.values()
        if c.get("current_location") != c.get("home_app")
    ]

    _emit_hub_event("overview", {"total_characters": len(_characters)}, user_id)
    return {
        "total_characters": len(_characters),
        "groups": groups,
        "away_from_home": away_from_home,
        "total_travels": len(_travel_log),
        "total_summons": len(_summon_log),
        "total_skill_activations": len(_skill_log),
        "total_evolutions": len(_evolution_log),
    }


@router.get("/locate/{character_id}", summary="Locate an AI character")
async def locate_character(
    character_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Find where an AI character currently is."""
    char = _characters.get(character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"AI character '{character_id}' not found")

    return {
        "character_id": character_id,
        "name": char["name"],
        "home_app": char.get("home_app"),
        "current_location": char.get("current_location"),
        "status": char.get("status"),
        "is_home": char.get("current_location") == char.get("home_app"),
    }