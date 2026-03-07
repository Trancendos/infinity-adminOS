# domain_store.py — Hybrid Domain Store (DB + In-Memory Fallback)
# ═══════════════════════════════════════════════════════════════════
# Phase 20: Non-destructive migration bridge for 22 in-memory routers
#
# Design: Each router replaces its Dict[str, Dict] stores with a
# DomainStore instance. The DomainStore:
# 1. Tries DB first (via crud_helpers.DomainCRUD)
# 2. Falls back to in-memory Dict if DB unavailable
# 3. Syncs in-memory → DB on next successful DB connection
# 4. Provides the SAME dict-like API routers already use
#
# This means ZERO changes to router endpoint logic — only the
# store initialization changes from:
#   _directives: Dict[str, Dict[str, Any]] = {}
# to:
#   _directives = DomainStore("citadel", "directive")
#
# 2060 Standard: Non-Destructive, Graceful Degradation, Future-Proof
# ═══════════════════════════════════════════════════════════════════

import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Iterator

logger = logging.getLogger("infinity-os.domain_store")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


class DomainStore:
    """
    Hybrid dict-like store with DB persistence.
    
    Provides dict-compatible interface:
        store[key] = value      # __setitem__
        value = store[key]      # __getitem__
        del store[key]          # __delitem__
        key in store            # __contains__
        for key in store:       # __iter__
        len(store)              # __len__
        store.values()          # values()
        store.items()           # items()
        store.keys()            # keys()
        store.get(key, default) # get()
    
    Plus async DB operations:
        await store.db_create(db, entity_id, content, user_id)
        await store.db_list(db, user_id, skip, limit)
        await store.db_get(db, entity_id)
        await store.db_update(db, entity_id, updates, user_id)
        await store.db_delete(db, entity_id, user_id)
        await store.db_sync(db)  # Sync in-memory → DB
    """

    def __init__(self, domain: str, entity_type: str,
                 enable_audit: bool = True):
        self.domain = domain
        self.entity_type = entity_type
        self.enable_audit = enable_audit
        self._memory: Dict[str, Dict[str, Any]] = {}
        self._crud = None  # Lazy-loaded
        self._dirty_keys: set = set()  # Keys modified in-memory but not synced

    def _get_crud(self):
        """Lazy-load DomainCRUD to avoid circular imports."""
        if self._crud is None:
            try:
                from crud_helpers import DomainCRUD
                self._crud = DomainCRUD(
                    self.domain, self.entity_type, self.enable_audit
                )
            except ImportError:
                logger.warning("crud_helpers not available, using memory-only mode")
        return self._crud

    # ── Dict-Compatible Interface (synchronous, in-memory) ────

    def __setitem__(self, key: str, value: Dict[str, Any]):
        self._memory[key] = value
        self._dirty_keys.add(key)

    def __getitem__(self, key: str) -> Dict[str, Any]:
        return self._memory[key]

    def __delitem__(self, key: str):
        if key in self._memory:
            del self._memory[key]
            self._dirty_keys.add(key)

    def __contains__(self, key: str) -> bool:
        return key in self._memory

    def __iter__(self) -> Iterator[str]:
        return iter(self._memory)

    def __len__(self) -> int:
        return len(self._memory)

    def __bool__(self) -> bool:
        return True  # Store always truthy (even if empty)

    def get(self, key: str, default: Any = None) -> Any:
        return self._memory.get(key, default)

    def keys(self):
        return self._memory.keys()

    def values(self):
        return self._memory.values()

    def items(self):
        return self._memory.items()

    def pop(self, key: str, *args) -> Any:
        result = self._memory.pop(key, *args)
        self._dirty_keys.add(key)
        return result

    def clear(self):
        self._memory.clear()
        self._dirty_keys.clear()

    def update(self, other=None, **kwargs):
        """dict.update() — merge another dict/iterable into this store."""
        if other:
            if hasattr(other, "items"):
                for key, value in other.items():
                    self._memory[key] = value
                    self._dirty_keys.add(key)
            elif hasattr(other, "keys"):
                for key in other.keys():
                    self._memory[key] = other[key]
                    self._dirty_keys.add(key)
            else:
                for key, value in other:
                    self._memory[key] = value
                    self._dirty_keys.add(key)
        for key, value in kwargs.items():
            self._memory[key] = value
            self._dirty_keys.add(key)

    def setdefault(self, key: str, default: Any = None) -> Any:
        """dict.setdefault() — return value if key exists, else set default and return it."""
        if key not in self._memory:
            self._memory[key] = default
            self._dirty_keys.add(key)
        return self._memory[key]

    def copy(self) -> Dict[str, Any]:
        """Return a shallow copy of the in-memory data."""
        return self._memory.copy()

    def __repr__(self) -> str:
        return f"DomainStore({self.domain!r}, {self.entity_type!r}, items={len(self._memory)})"

    # ── Async DB Operations ───────────────────────────────────

    async def db_create(
        self,
        db,  # AsyncSession
        entity_id: str,
        content: Dict[str, Any],
        user_id: str = "system",
        title: Optional[str] = None,
        tags: Optional[List[str]] = None,
        status: str = "active",
    ) -> Dict[str, Any]:
        """Create in both memory and DB."""
        # Always update memory
        self._memory[entity_id] = content

        # Try DB
        crud = self._get_crud()
        if crud and db:
            try:
                result = await crud.create(
                    db, entity_id, content, user_id, title, tags, status
                )
                self._dirty_keys.discard(entity_id)
                return result
            except Exception as e:
                logger.warning(f"DB create failed for {self.domain}/{self.entity_type}/{entity_id}: {e}")
                self._dirty_keys.add(entity_id)

        return {**content, "id": entity_id, "domain": self.domain,
                "entity_type": self.entity_type}

    async def db_get(
        self,
        db,  # AsyncSession
        entity_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get from DB first, fall back to memory."""
        crud = self._get_crud()
        if crud and db:
            try:
                result = await crud.get(db, entity_id)
                if result:
                    # Update memory cache
                    self._memory[entity_id] = result
                    return result
            except Exception as e:
                logger.warning(f"DB get failed for {self.domain}/{self.entity_type}/{entity_id}: {e}")

        # Fallback to memory
        return self._memory.get(entity_id)

    async def db_list(
        self,
        db,  # AsyncSession
        owner_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List from DB first, fall back to memory."""
        crud = self._get_crud()
        if crud and db:
            try:
                items, total = await crud.list_all(
                    db, owner_id, status, skip, limit, search
                )
                if items or total >= 0:
                    return items, total
            except Exception as e:
                logger.warning(f"DB list failed for {self.domain}/{self.entity_type}: {e}")

        # Fallback to memory with pagination
        all_items = list(self._memory.values())
        if owner_id:
            all_items = [i for i in all_items
                         if i.get("owner_id") == owner_id or
                         i.get("created_by") == owner_id]
        if status:
            all_items = [i for i in all_items if i.get("status") == status]
        if search:
            search_lower = search.lower()
            all_items = [i for i in all_items
                         if search_lower in str(i.get("name", "")).lower() or
                         search_lower in str(i.get("title", "")).lower()]

        total = len(all_items)
        page = all_items[skip:skip + limit]
        return page, total

    async def db_update(
        self,
        db,  # AsyncSession
        entity_id: str,
        updates: Dict[str, Any],
        user_id: str = "system",
    ) -> Optional[Dict[str, Any]]:
        """Update in both memory and DB."""
        # Update memory
        if entity_id in self._memory:
            self._memory[entity_id].update(updates)
        else:
            self._memory[entity_id] = updates

        # Try DB
        crud = self._get_crud()
        if crud and db:
            try:
                result = await crud.update(db, entity_id, updates, user_id)
                if result:
                    self._dirty_keys.discard(entity_id)
                    return result
            except Exception as e:
                logger.warning(f"DB update failed for {self.domain}/{self.entity_type}/{entity_id}: {e}")
                self._dirty_keys.add(entity_id)

        return self._memory.get(entity_id)

    async def db_delete(
        self,
        db,  # AsyncSession
        entity_id: str,
        user_id: str = "system",
    ) -> bool:
        """Delete from both memory and DB."""
        # Remove from memory
        existed = entity_id in self._memory
        self._memory.pop(entity_id, None)

        # Try DB
        crud = self._get_crud()
        if crud and db:
            try:
                await crud.delete(db, entity_id, user_id)
                self._dirty_keys.discard(entity_id)
            except Exception as e:
                logger.warning(f"DB delete failed for {self.domain}/{self.entity_type}/{entity_id}: {e}")

        return existed

    async def db_count(self, db) -> int:
        """Count from DB, fall back to memory."""
        crud = self._get_crud()
        if crud and db:
            try:
                return await crud.count(db)
            except Exception:
                pass
        return len(self._memory)

    async def db_overview(self, db) -> Dict[str, Any]:
        """Get overview stats."""
        crud = self._get_crud()
        if crud and db:
            try:
                return await crud.overview(db)
            except Exception:
                pass
        return {
            "domain": self.domain,
            "entity_type": self.entity_type,
            "total": len(self._memory),
            "by_status": {"active": len(self._memory)},
        }

    async def db_audit_log(
        self,
        db,
        entity_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get audit log from DB."""
        crud = self._get_crud()
        if crud and db:
            try:
                return await crud.get_audit_log(db, entity_id, skip, limit)
            except Exception:
                pass
        return [], 0

    async def db_sync(self, db) -> int:
        """
        Sync dirty in-memory entries to DB.
        Returns count of synced items.
        """
        if not self._dirty_keys or not db:
            return 0

        crud = self._get_crud()
        if not crud:
            return 0

        synced = 0
        for key in list(self._dirty_keys):
            if key in self._memory:
                try:
                    # Try update first, then create
                    existing = await crud.get(db, key)
                    if existing:
                        await crud.update(db, key, self._memory[key], "system")
                    else:
                        await crud.create(db, key, self._memory[key], "system")
                    self._dirty_keys.discard(key)
                    synced += 1
                except Exception as e:
                    logger.warning(f"Sync failed for {self.domain}/{self.entity_type}/{key}: {e}")
            else:
                # Key was deleted from memory
                try:
                    await crud.delete(db, key, "system")
                    self._dirty_keys.discard(key)
                    synced += 1
                except Exception:
                    pass

        if synced:
            logger.info(
                f"Synced {synced} items for {self.domain}/{self.entity_type}"
            )
        return synced


class DomainAuditLog:
    """
    Hybrid list-like audit log with DB persistence.
    
    Replaces: _audit_log: List[Dict[str, Any]] = []
    With:     _audit_log = DomainAuditLog("citadel")
    
    Provides list-compatible interface:
        log.append(entry)
        for entry in log:
        len(log)
        log[-10:]  # slicing
    """

    def __init__(self, domain: str, entity_type: str = "audit",
                 max_memory: int = 1000):
        self.domain = domain
        self.entity_type = entity_type
        self.max_memory = max_memory
        self._entries: List[Dict[str, Any]] = []

    def append(self, entry: Dict[str, Any]):
        self._entries.append(entry)
        # Trim if over capacity
        if len(self._entries) > self.max_memory:
            self._entries = self._entries[-self.max_memory:]

    def __iter__(self):
        return iter(self._entries)

    def __len__(self) -> int:
        return len(self._entries)

    def __getitem__(self, index):
        return self._entries[index]

    def __setitem__(self, index, value):
        """Support slice assignment for trimming: log[:] = log[-500:]"""
        self._entries[index] = value

    def extend(self, items):
        """Extend the log with multiple entries."""
        self._entries.extend(items)
        if len(self._entries) > self.max_memory:
            self._entries = self._entries[-self.max_memory:]

    def __bool__(self) -> bool:
        return True

    def clear(self):
        self._entries.clear()

    async def db_list(
        self,
        db,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get audit entries from DB, fall back to memory."""
        try:
            from crud_helpers import get_domain_audit_log
            return await get_domain_audit_log(db, self.domain, skip, limit)
        except Exception:
            total = len(self._entries)
            page = self._entries[skip:skip + limit]
            return page, total