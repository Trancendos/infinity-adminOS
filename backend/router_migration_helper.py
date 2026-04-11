# router_migration_helper.py — Reusable migration utilities for Phase 21
# Converts in-memory Dict stores → DomainStore instances
#
# The DomainStore class (from domain_store.py) implements the full dict
# interface (__setitem__, __getitem__, __delitem__, __contains__, get(),
# keys(), values(), items(), pop(), clear(), __iter__, __len__) so it
# is a DROP-IN replacement for Dict[str, Dict[str, Any]].
#
# This helper provides:
#   1. store_factory() — create a DomainStore with proper domain/entity_type
#   2. list_store_factory() — create a DomainStore for list-valued stores
#   3. counter_store_factory() — create a DomainStore for counter/metrics stores
#   4. MIGRATION_REGISTRY — tracks all migrated stores for observability
#
# Zero-cost: DomainStore uses in-memory dict as primary with optional DB sync.
# No external dependencies required.

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from domain_store import DomainStore, DomainAuditLog

# ============================================================
# MIGRATION REGISTRY — tracks all migrated stores
# ============================================================

MIGRATION_REGISTRY: Dict[str, Dict[str, Any]] = {}


def store_factory(
    domain: str,
    entity_type: str,
    enable_audit: bool = False,
    seed_data: Optional[Dict[str, Dict[str, Any]]] = None,
) -> DomainStore:
    """
    Create a DomainStore instance for a router migration.

    This is a drop-in replacement for:
        _my_store: Dict[str, Dict[str, Any]] = {}

    Replace with:
        _my_store = store_factory("my_router", "my_entity")

    Args:
        domain: Router/module name (e.g., "the_void", "academy")
        entity_type: Entity type within the domain (e.g., "secret", "learning_path")
        enable_audit: Whether to enable audit logging for this store
        seed_data: Optional initial data to populate the store

    Returns:
        DomainStore instance with dict-compatible interface
    """
    store = DomainStore(
        domain=domain,
        entity_type=entity_type,
        enable_audit=enable_audit,
    )

    # Seed initial data if provided
    if seed_data:
        for key, value in seed_data.items():
            store[key] = value

    # Register in migration registry
    registry_key = f"{domain}:{entity_type}"
    MIGRATION_REGISTRY[registry_key] = {
        "domain": domain,
        "entity_type": entity_type,
        "enable_audit": enable_audit,
        "seeded": bool(seed_data),
        "seed_count": len(seed_data) if seed_data else 0,
        "migrated_at": datetime.now(timezone.utc).isoformat(),
    }

    return store


def list_store_factory(
    domain: str,
    entity_type: str,
    enable_audit: bool = False,
) -> DomainStore:
    """
    Create a DomainStore for list-valued stores.

    This is a drop-in replacement for:
        _my_lists: Dict[str, List[Dict[str, Any]]] = {}

    The DomainStore stores each key's value as a dict with a "items" list.
    Use list_store_append() and list_store_get() helpers for list operations.

    Replace with:
        _my_lists = list_store_factory("my_router", "my_list_entity")
    """
    store = DomainStore(
        domain=domain,
        entity_type=entity_type,
        enable_audit=enable_audit,
    )

    registry_key = f"{domain}:{entity_type}"
    MIGRATION_REGISTRY[registry_key] = {
        "domain": domain,
        "entity_type": entity_type,
        "enable_audit": enable_audit,
        "store_type": "list",
        "migrated_at": datetime.now(timezone.utc).isoformat(),
    }

    return store


def audit_log_factory(
    domain: str,
    entity_type: str = "audit",
    max_memory: int = 10000,
) -> DomainAuditLog:
    """
    Create a DomainAuditLog instance for audit/access log migration.

    This is a drop-in replacement for:
        _access_log: List[Dict[str, Any]] = []

    Replace with:
        _access_log = audit_log_factory("my_router")
    """
    log = DomainAuditLog(
        domain=domain,
        entity_type=entity_type,
        max_memory=max_memory,
    )

    registry_key = f"{domain}:{entity_type}_audit"
    MIGRATION_REGISTRY[registry_key] = {
        "domain": domain,
        "entity_type": entity_type,
        "store_type": "audit_log",
        "max_memory": max_memory,
        "migrated_at": datetime.now(timezone.utc).isoformat(),
    }

    return log


def metrics_store_factory(
    domain: str,
    initial_metrics: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    For simple metrics/counters dicts that don't need DB persistence,
    return a plain dict but register it in the migration registry.

    These are typically small config-like dicts with scalar values
    (counts, rates, timestamps) that don't benefit from DomainStore overhead.

    Replace:
        _metrics: Dict[str, Any] = {"total": 0, "errors": 0}
    With:
        _metrics = metrics_store_factory("my_router", {"total": 0, "errors": 0})
    """
    store = dict(initial_metrics or {})

    registry_key = f"{domain}:metrics"
    MIGRATION_REGISTRY[registry_key] = {
        "domain": domain,
        "entity_type": "metrics",
        "store_type": "plain_dict",
        "migrated_at": datetime.now(timezone.utc).isoformat(),
    }

    return store


def get_migration_stats() -> Dict[str, Any]:
    """Return migration statistics for observability."""
    total = len(MIGRATION_REGISTRY)
    by_type = {}
    by_domain = {}

    for key, info in MIGRATION_REGISTRY.items():
        store_type = info.get("store_type", "domain_store")
        by_type[store_type] = by_type.get(store_type, 0) + 1
        domain = info["domain"]
        by_domain[domain] = by_domain.get(domain, 0) + 1

    return {
        "total_stores_migrated": total,
        "by_store_type": by_type,
        "by_domain": by_domain,
        "registry": MIGRATION_REGISTRY,
    }