# models_phase20.py — Generic Document Models for In-Memory Router Migration
# ═══════════════════════════════════════════════════════════════════════════
# Phase 20: Database Persistence for 22 In-Memory Routers
#
# Design Philosophy:
# Instead of 70+ individual tables (one per data store), we use a
# flexible document-store pattern with a small set of generic tables.
# This gives us:
# 1. Zero-migration overhead when adding new routers
# 2. Schema flexibility (JSON content, typed by domain/entity)
# 3. Works across SQLite, PostgreSQL, and LibSQL
# 4. Proper indexing on domain + entity_type + owner_id
# 5. Audit trail built-in via the AuditEntry table
#
# 2060 Standard: Future-Proof, Dialect-Agnostic, Zero Lock-In
# ═══════════════════════════════════════════════════════════════════════════

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, JSON, Boolean, Integer, Float,
    Text, Index, UniqueConstraint,
)
from sqlalchemy.orm import declarative_base

# Use the same Base from models.py for shared metadata
# But define our own if imported standalone for migrations
try:
    from models import Base, utcnow, new_uuid
except ImportError:
    Base = declarative_base()

    def utcnow():
        return datetime.now(timezone.utc)

    def new_uuid():
        return str(uuid.uuid4())


# ── Generic Document Table ────────────────────────────────────────

class DomainDocument(Base):
    """
    Generic document store for all domain entities.
    
    Replaces 70+ in-memory Dict[str, Dict] stores with a single
    indexed table. Each row is a JSON document belonging to a
    specific domain (router) and entity type.
    
    Examples:
        domain="citadel", entity_type="directive", entity_id="abc-123"
        domain="studio", entity_type="project", entity_id="proj-456"
        domain="arcadian_exchange", entity_type="vendor", entity_id="v-789"
    """
    __tablename__ = "domain_documents"

    # Primary key — dialect-agnostic String UUID
    id = Column(String(36), primary_key=True, default=new_uuid)

    # Domain identification
    domain = Column(String(64), nullable=False, index=True)
    entity_type = Column(String(64), nullable=False, index=True)
    entity_id = Column(String(128), nullable=False, index=True)

    # Ownership
    owner_id = Column(String(36), nullable=False, index=True, default="system")
    org_id = Column(String(36), nullable=True, index=True)

    # Content — the actual document data as JSON
    content = Column(JSON, nullable=False, default=dict)

    # Status & lifecycle
    status = Column(String(32), nullable=False, default="active", index=True)
    version = Column(Integer, nullable=False, default=1)
    is_deleted = Column(Boolean, nullable=False, default=False, index=True)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime, nullable=True)

    # Searchable metadata (flattened from content for indexing)
    title = Column(String(512), nullable=True, index=True)
    tags = Column(String(1024), nullable=True)  # Comma-separated for dialect compat

    __table_args__ = (
        UniqueConstraint("domain", "entity_type", "entity_id",
                         name="uq_domain_entity"),
        Index("ix_domain_entity_owner",
              "domain", "entity_type", "owner_id"),
        Index("ix_domain_status",
              "domain", "status", "is_deleted"),
        Index("ix_domain_created",
              "domain", "created_at"),
    )

    def to_dict(self):
        """Convert to API response dict (merges content with metadata)."""
        result = dict(self.content) if self.content else {}
        result.update({
            "id": self.entity_id,
            "domain": self.domain,
            "entity_type": self.entity_type,
            "owner_id": self.owner_id,
            "status": self.status,
            "version": self.version,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        })
        if self.title:
            result["title"] = self.title
        if self.tags:
            result["tags"] = self.tags.split(",")
        return result


# ── Domain Audit Entry ────────────────────────────────────────────

class DomainAuditEntry(Base):
    """
    Audit trail for all domain operations.
    
    Replaces the _audit_log: List[Dict] pattern used by most routers.
    Every create/update/delete on DomainDocument generates an audit entry.
    """
    __tablename__ = "domain_audit_entries"

    id = Column(String(36), primary_key=True, default=new_uuid)

    # What happened
    domain = Column(String(64), nullable=False, index=True)
    entity_type = Column(String(64), nullable=False, index=True)
    entity_id = Column(String(128), nullable=False, index=True)
    action = Column(String(32), nullable=False, index=True)  # create, update, delete

    # Who did it
    user_id = Column(String(36), nullable=False, index=True, default="system")

    # What changed
    changes = Column(JSON, nullable=True)  # {field: {old: ..., new: ...}}
    snapshot = Column(JSON, nullable=True)  # Full document snapshot at time of action

    # When
    created_at = Column(DateTime, nullable=False, default=utcnow)

    # Context
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(512), nullable=True)
    correlation_id = Column(String(64), nullable=True, index=True)

    __table_args__ = (
        Index("ix_audit_domain_entity",
              "domain", "entity_type", "entity_id"),
        Index("ix_audit_domain_action",
              "domain", "action", "created_at"),
        Index("ix_audit_user",
              "user_id", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "domain": self.domain,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "action": self.action,
            "user_id": self.user_id,
            "changes": self.changes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "correlation_id": self.correlation_id,
        }


# ── Domain Counter / Metrics ──────────────────────────────────────

class DomainCounter(Base):
    """
    Counters and metrics for domain entities.
    
    Replaces patterns like _failure_counters, _search_history counts,
    and other numeric tracking in routers.
    """
    __tablename__ = "domain_counters"

    id = Column(String(36), primary_key=True, default=new_uuid)

    domain = Column(String(64), nullable=False, index=True)
    counter_name = Column(String(128), nullable=False, index=True)
    entity_id = Column(String(128), nullable=True, index=True)

    value = Column(Float, nullable=False, default=0.0)
    extra = Column("extra_data", JSON, nullable=True)

    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("domain", "counter_name", "entity_id",
                         name="uq_domain_counter"),
        Index("ix_counter_domain_name",
              "domain", "counter_name"),
    )

    def to_dict(self):
        return {
            "domain": self.domain,
            "counter_name": self.counter_name,
            "entity_id": self.entity_id,
            "value": self.value,
            "metadata": self.extra,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ── Domain-to-Table Mapping ──────────────────────────────────────
# Maps each router's in-memory stores to domain + entity_type pairs.
# Used by crud_helpers.py for automatic routing.

DOMAIN_ENTITY_MAP = {
    # Governance routers
    "citadel": {
        "stores": ["directive", "initiative"],
        "audit": True,
        "counters": [],
    },
    "think_tank": {
        "stores": ["project", "experiment", "proposal"],
        "audit": False,
        "counters": [],
    },
    "chronossphere": {
        "stores": ["schedule", "deadline", "temporal_rule"],
        "audit": True,  # _timeline
        "counters": [],
    },
    "devocity": {
        "stores": ["pipeline", "deployment", "environment"],
        "audit": True,
        "counters": [],
    },
    # Studio routers
    "studio": {
        "stores": ["project", "brief", "asset"],
        "audit": True,
        "counters": [],
    },
    "section7": {
        "stores": ["report", "task", "feed"],
        "audit": True,
        "counters": [],
    },
    "style_and_shoot": {
        "stores": ["design_system", "component", "style_guide"],
        "audit": True,
        "counters": [],
    },
    "digital_grid": {
        "stores": ["node", "build", "deployment"],
        "audit": True,
        "counters": [],
    },
    "tranceflow": {
        "stores": ["scene", "material", "render_job"],
        "audit": True,
        "counters": [],
    },
    "tateking": {
        "stores": ["production", "storyboard", "shot"],
        "audit": True,
        "counters": [],
    },
    "fabulousa": {
        "stores": ["collection", "lookbook", "campaign"],
        "audit": True,
        "counters": [],
    },
    # Infrastructure routers
    "arcadian_exchange": {
        "stores": ["vendor", "order", "contract"],
        "audit": True,
        "counters": [],
    },
    "vrar3d": {
        "stores": ["experience", "anchor", "session"],
        "audit": True,
        "counters": [],
    },
    "luminous": {
        "stores": ["node", "edge", "session", "insight"],
        "audit": True,
        "counters": [],
    },
    "turings_hub": {
        "stores": ["character"],
        "audit": True,  # travel_log, summon_log, skill_log, evolution_log
        "counters": [],
    },
    "adaptive_engine": {
        "stores": [],
        "audit": False,
        "counters": ["feature_flag"],
    },
    "agent_manager": {
        "stores": ["agent"],
        "audit": False,
        "counters": [],
    },
    "self_healing": {
        "stores": ["probe", "circuit_breaker"],
        "audit": False,
        "counters": ["failure"],
    },
    "vulnerability": {
        "stores": [],
        "audit": True,  # _scan_history
        "counters": [],
    },
    # Branded routers
    "lille_sc": {
        "stores": ["sync_channel", "sync_event"],
        "audit": True,  # _conflict_log
        "counters": [],
    },
    "lunascene": {
        "stores": ["vault", "artifact", "provenance_record"],
        "audit": False,
        "counters": [],
    },
    "solarscene": {
        "stores": ["search_index", "saved_search"],
        "audit": True,  # _search_history
        "counters": [],
    },
}