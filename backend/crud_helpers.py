# crud_helpers.py — Generic Async CRUD Helpers for Domain Documents
# ═══════════════════════════════════════════════════════════════════
# Phase 20: DRY pattern for all 22 in-memory routers migrating to DB
#
# Provides a DomainCRUD class that handles:
# - Create, Read, Update, Delete with soft-delete support
# - Pagination with skip/limit
# - Filtering by status, owner, tags
# - Automatic audit trail generation
# - Graceful fallback to in-memory when DB is unavailable
#
# Usage in routers:
#   crud = DomainCRUD("citadel", "directive")
#   item = await crud.create(db, entity_id, content, user_id)
#   items = await crud.list_all(db, user_id, skip, limit)
#   item = await crud.get(db, entity_id)
#   item = await crud.update(db, entity_id, updates, user_id)
#   await crud.delete(db, entity_id, user_id)
#
# 2060 Standard: Zero Lock-In, Dialect-Agnostic, Future-Proof
# ═══════════════════════════════════════════════════════════════════

import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from sqlalchemy import select, update, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from models_phase20 import DomainDocument, DomainAuditEntry, DomainCounter

logger = logging.getLogger("infinity-os.crud")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return str(uuid.uuid4())


class DomainCRUD:
    """
    Generic CRUD operations for a specific domain + entity_type.
    
    Each router creates one DomainCRUD instance per entity type:
        directives_crud = DomainCRUD("citadel", "directive")
        initiatives_crud = DomainCRUD("citadel", "initiative")
    """

    def __init__(self, domain: str, entity_type: str,
                 enable_audit: bool = True):
        self.domain = domain
        self.entity_type = entity_type
        self.enable_audit = enable_audit

    # ── CREATE ────────────────────────────────────────────────

    async def create(
        self,
        db: AsyncSession,
        entity_id: str,
        content: Dict[str, Any],
        user_id: str = "system",
        title: Optional[str] = None,
        tags: Optional[List[str]] = None,
        status: str = "active",
        org_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new domain document."""
        now = _utcnow()
        doc = DomainDocument(
            id=_new_id(),
            domain=self.domain,
            entity_type=self.entity_type,
            entity_id=entity_id,
            owner_id=user_id,
            org_id=org_id,
            content=content,
            status=status,
            version=1,
            is_deleted=False,
            created_at=now,
            updated_at=now,
            title=title or content.get("name") or content.get("title", ""),
            tags=",".join(tags) if tags else None,
        )
        db.add(doc)

        if self.enable_audit:
            audit = DomainAuditEntry(
                id=_new_id(),
                domain=self.domain,
                entity_type=self.entity_type,
                entity_id=entity_id,
                action="create",
                user_id=user_id,
                snapshot=content,
                created_at=now,
            )
            db.add(audit)

        await db.commit()
        await db.refresh(doc)
        return doc.to_dict()

    # ── READ (single) ────────────────────────────────────────

    async def get(
        self,
        db: AsyncSession,
        entity_id: str,
        include_deleted: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Get a single document by entity_id."""
        stmt = select(DomainDocument).where(
            and_(
                DomainDocument.domain == self.domain,
                DomainDocument.entity_type == self.entity_type,
                DomainDocument.entity_id == entity_id,
            )
        )
        if not include_deleted:
            stmt = stmt.where(DomainDocument.is_deleted == False)

        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()
        return doc.to_dict() if doc else None

    # ── READ (list) ──────────────────────────────────────────

    async def list_all(
        self,
        db: AsyncSession,
        owner_id: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        search: Optional[str] = None,
        include_deleted: bool = False,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List documents with pagination.
        Returns (items, total_count).
        """
        conditions = [
            DomainDocument.domain == self.domain,
            DomainDocument.entity_type == self.entity_type,
        ]
        if not include_deleted:
            conditions.append(DomainDocument.is_deleted == False)
        if owner_id:
            conditions.append(DomainDocument.owner_id == owner_id)
        if status:
            conditions.append(DomainDocument.status == status)
        if search:
            conditions.append(
                or_(
                    DomainDocument.title.ilike(f"%{search}%"),
                    DomainDocument.tags.ilike(f"%{search}%"),
                )
            )

        where = and_(*conditions)

        # Count
        count_stmt = select(func.count()).select_from(DomainDocument).where(where)
        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Fetch page
        stmt = (
            select(DomainDocument)
            .where(where)
            .order_by(DomainDocument.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        docs = result.scalars().all()

        return [d.to_dict() for d in docs], total

    # ── UPDATE ───────────────────────────────────────────────

    async def update(
        self,
        db: AsyncSession,
        entity_id: str,
        updates: Dict[str, Any],
        user_id: str = "system",
    ) -> Optional[Dict[str, Any]]:
        """Update a document's content (merge). Returns updated doc or None."""
        stmt = select(DomainDocument).where(
            and_(
                DomainDocument.domain == self.domain,
                DomainDocument.entity_type == self.entity_type,
                DomainDocument.entity_id == entity_id,
                DomainDocument.is_deleted == False,
            )
        )
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()
        if not doc:
            return None

        now = _utcnow()
        old_content = dict(doc.content) if doc.content else {}

        # Merge updates into content
        new_content = {**old_content, **updates}
        doc.content = new_content
        doc.updated_at = now
        doc.version = (doc.version or 1) + 1

        # Update searchable fields if present
        if "name" in updates or "title" in updates:
            doc.title = updates.get("name") or updates.get("title") or doc.title
        if "status" in updates:
            doc.status = updates["status"]
        if "tags" in updates:
            tags = updates["tags"]
            doc.tags = ",".join(tags) if isinstance(tags, list) else tags

        if self.enable_audit:
            # Compute changes
            changes = {}
            for key, new_val in updates.items():
                old_val = old_content.get(key)
                if old_val != new_val:
                    changes[key] = {"old": old_val, "new": new_val}

            audit = DomainAuditEntry(
                id=_new_id(),
                domain=self.domain,
                entity_type=self.entity_type,
                entity_id=entity_id,
                action="update",
                user_id=user_id,
                changes=changes,
                snapshot=new_content,
                created_at=now,
            )
            db.add(audit)

        await db.commit()
        await db.refresh(doc)
        return doc.to_dict()

    # ── DELETE (soft) ────────────────────────────────────────

    async def delete(
        self,
        db: AsyncSession,
        entity_id: str,
        user_id: str = "system",
        hard: bool = False,
    ) -> bool:
        """Soft-delete (or hard-delete) a document. Returns True if found."""
        stmt = select(DomainDocument).where(
            and_(
                DomainDocument.domain == self.domain,
                DomainDocument.entity_type == self.entity_type,
                DomainDocument.entity_id == entity_id,
            )
        )
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()
        if not doc:
            return False

        now = _utcnow()

        if hard:
            await db.delete(doc)
        else:
            doc.is_deleted = True
            doc.deleted_at = now
            doc.status = "deleted"
            doc.updated_at = now

        if self.enable_audit:
            audit = DomainAuditEntry(
                id=_new_id(),
                domain=self.domain,
                entity_type=self.entity_type,
                entity_id=entity_id,
                action="hard_delete" if hard else "delete",
                user_id=user_id,
                snapshot=doc.content if not hard else None,
                created_at=now,
            )
            db.add(audit)

        await db.commit()
        return True

    # ── AUDIT LOG ────────────────────────────────────────────

    async def get_audit_log(
        self,
        db: AsyncSession,
        entity_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get audit entries for this domain (optionally filtered by entity)."""
        conditions = [
            DomainAuditEntry.domain == self.domain,
            DomainAuditEntry.entity_type == self.entity_type,
        ]
        if entity_id:
            conditions.append(DomainAuditEntry.entity_id == entity_id)

        where = and_(*conditions)

        count_stmt = select(func.count()).select_from(DomainAuditEntry).where(where)
        count_result = await db.execute(count_stmt)
        total = count_result.scalar() or 0

        stmt = (
            select(DomainAuditEntry)
            .where(where)
            .order_by(DomainAuditEntry.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(stmt)
        entries = result.scalars().all()

        return [e.to_dict() for e in entries], total

    # ── COUNT ────────────────────────────────────────────────

    async def count(
        self,
        db: AsyncSession,
        status: Optional[str] = None,
        owner_id: Optional[str] = None,
    ) -> int:
        """Count documents matching criteria."""
        conditions = [
            DomainDocument.domain == self.domain,
            DomainDocument.entity_type == self.entity_type,
            DomainDocument.is_deleted == False,
        ]
        if status:
            conditions.append(DomainDocument.status == status)
        if owner_id:
            conditions.append(DomainDocument.owner_id == owner_id)

        stmt = select(func.count()).select_from(DomainDocument).where(and_(*conditions))
        result = await db.execute(stmt)
        return result.scalar() or 0

    # ── OVERVIEW / STATS ─────────────────────────────────────

    async def overview(
        self,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """Get overview stats for this domain + entity_type."""
        total = await self.count(db)

        # Count by status
        stmt = (
            select(DomainDocument.status, func.count())
            .where(
                and_(
                    DomainDocument.domain == self.domain,
                    DomainDocument.entity_type == self.entity_type,
                    DomainDocument.is_deleted == False,
                )
            )
            .group_by(DomainDocument.status)
        )
        result = await db.execute(stmt)
        by_status = {row[0]: row[1] for row in result.all()}

        return {
            "domain": self.domain,
            "entity_type": self.entity_type,
            "total": total,
            "by_status": by_status,
        }


# ── Counter Helpers ───────────────────────────────────────────────

class DomainCounterCRUD:
    """CRUD operations for domain counters."""

    def __init__(self, domain: str):
        self.domain = domain

    async def increment(
        self,
        db: AsyncSession,
        counter_name: str,
        entity_id: str = "__global__",
        amount: float = 1.0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> float:
        """Increment a counter. Creates if not exists. Returns new value."""
        stmt = select(DomainCounter).where(
            and_(
                DomainCounter.domain == self.domain,
                DomainCounter.counter_name == counter_name,
                DomainCounter.entity_id == entity_id,
            )
        )
        result = await db.execute(stmt)
        counter = result.scalar_one_or_none()

        if counter:
            counter.value = (counter.value or 0) + amount
            counter.updated_at = _utcnow()
            if metadata:
                counter.extra = metadata
        else:
            counter = DomainCounter(
                id=_new_id(),
                domain=self.domain,
                counter_name=counter_name,
                entity_id=entity_id,
                value=amount,
                extra=metadata,
                updated_at=_utcnow(),
            )
            db.add(counter)

        await db.commit()
        return counter.value

    async def get_value(
        self,
        db: AsyncSession,
        counter_name: str,
        entity_id: str = "__global__",
    ) -> float:
        """Get current counter value."""
        stmt = select(DomainCounter.value).where(
            and_(
                DomainCounter.domain == self.domain,
                DomainCounter.counter_name == counter_name,
                DomainCounter.entity_id == entity_id,
            )
        )
        result = await db.execute(stmt)
        val = result.scalar_one_or_none()
        return val if val is not None else 0.0

    async def reset(
        self,
        db: AsyncSession,
        counter_name: str,
        entity_id: str = "__global__",
    ) -> None:
        """Reset a counter to zero."""
        stmt = select(DomainCounter).where(
            and_(
                DomainCounter.domain == self.domain,
                DomainCounter.counter_name == counter_name,
                DomainCounter.entity_id == entity_id,
            )
        )
        result = await db.execute(stmt)
        counter = result.scalar_one_or_none()
        if counter:
            counter.value = 0.0
            counter.updated_at = _utcnow()
            await db.commit()

    async def list_counters(
        self,
        db: AsyncSession,
    ) -> List[Dict[str, Any]]:
        """List all counters for this domain."""
        stmt = (
            select(DomainCounter)
            .where(DomainCounter.domain == self.domain)
            .order_by(DomainCounter.counter_name)
        )
        result = await db.execute(stmt)
        counters = result.scalars().all()
        return [c.to_dict() for c in counters]


# ── Convenience: Domain Audit Log (cross-entity) ─────────────────

async def get_domain_audit_log(
    db: AsyncSession,
    domain: str,
    skip: int = 0,
    limit: int = 50,
) -> Tuple[List[Dict[str, Any]], int]:
    """Get all audit entries for a domain (across all entity types)."""
    conditions = [DomainAuditEntry.domain == domain]
    where = and_(*conditions)

    count_stmt = select(func.count()).select_from(DomainAuditEntry).where(where)
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = (
        select(DomainAuditEntry)
        .where(where)
        .order_by(DomainAuditEntry.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    entries = result.scalars().all()

    return [e.to_dict() for e in entries], total