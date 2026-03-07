# providers/__init__.py — Trancendos Multi-Provider Registry
# ═══════════════════════════════════════════════════════════════
# Zero-Cost, No-Vendor-Lock-In Provider Abstraction Layer
#
# Design Principles:
# 1. LOCAL-FIRST: Always prefer self-hosted/local providers
# 2. FREE-TIER-SECOND: Use free tiers of cloud services
# 3. PAID-LAST: Only use paid APIs when no free option exists
# 4. AUTO-FAILOVER: If primary fails, cascade to next provider
# 5. ZERO LOCK-IN: Every provider is swappable via config
#
# 2060 Standard: Zero-Cost Infrastructure, Future-Proof Architecture
# ═══════════════════════════════════════════════════════════════

import logging
from typing import Dict, Any, Optional, List
from enum import Enum

logger = logging.getLogger("infinity-os.providers")


class ProviderTier(str, Enum):
    """Cost tier for provider selection."""
    LOCAL = "local"           # Self-hosted, zero cost
    FREE = "free"             # Free tier of cloud service
    FREEMIUM = "freemium"     # Free with limits
    PAID = "paid"             # Paid API
    ENTERPRISE = "enterprise" # Enterprise contract


class ProviderStatus(str, Enum):
    """Runtime status of a provider."""
    AVAILABLE = "available"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    RATE_LIMITED = "rate_limited"
    DISABLED = "disabled"


class ProviderCategory(str, Enum):
    """Categories of providers."""
    LLM = "llm"
    STORAGE = "storage"
    CACHE = "cache"
    SEARCH = "search"
    DATABASE = "database"
    EMAIL = "email"
    VECTOR = "vector"


# ── Provider Registry ────────────────────────────────────────

_registry: Dict[str, Dict[str, Any]] = {}


def register_provider(
    category: str,
    name: str,
    tier: ProviderTier,
    config: Dict[str, Any],
):
    """Register a provider in the global registry."""
    key = f"{category}:{name}"
    _registry[key] = {
        "category": category,
        "name": name,
        "tier": tier.value,
        "status": ProviderStatus.AVAILABLE.value,
        "config": config,
        "request_count": 0,
        "error_count": 0,
        "total_cost_estimate": 0.0,
    }
    logger.info(f"[Registry] Registered {key} (tier={tier.value})")


def get_provider(category: str, name: str) -> Optional[Dict[str, Any]]:
    """Get a specific provider."""
    return _registry.get(f"{category}:{name}")


def list_providers(category: Optional[str] = None) -> List[Dict[str, Any]]:
    """List all registered providers, optionally filtered by category."""
    items = list(_registry.values())
    if category:
        items = [p for p in items if p["category"] == category]
    # Sort by tier priority: local → free → freemium → paid → enterprise
    tier_order = {
        ProviderTier.LOCAL.value: 0,
        ProviderTier.FREE.value: 1,
        ProviderTier.FREEMIUM.value: 2,
        ProviderTier.PAID.value: 3,
        ProviderTier.ENTERPRISE.value: 4,
    }
    items.sort(key=lambda p: tier_order.get(p["tier"], 99))
    return items


def get_best_provider(category: str) -> Optional[Dict[str, Any]]:
    """Get the best available provider for a category (lowest cost first)."""
    providers = list_providers(category)
    for p in providers:
        if p["status"] in (ProviderStatus.AVAILABLE.value, ProviderStatus.DEGRADED.value):
            return p
    return None


def update_provider_status(category: str, name: str, status: ProviderStatus):
    """Update a provider's runtime status."""
    key = f"{category}:{name}"
    if key in _registry:
        _registry[key]["status"] = status.value
        logger.info(f"[Registry] {key} status → {status.value}")


def record_provider_usage(category: str, name: str, cost_estimate: float = 0.0):
    """Record a usage event for a provider."""
    key = f"{category}:{name}"
    if key in _registry:
        _registry[key]["request_count"] += 1
        _registry[key]["total_cost_estimate"] += cost_estimate


def record_provider_error(category: str, name: str):
    """Record an error for a provider."""
    key = f"{category}:{name}"
    if key in _registry:
        _registry[key]["error_count"] += 1
        # Auto-degrade after 5 consecutive errors
        if _registry[key]["error_count"] >= 5:
            _registry[key]["status"] = ProviderStatus.DEGRADED.value
            logger.warning(f"[Registry] {key} auto-degraded after 5 errors")


def get_registry_stats() -> Dict[str, Any]:
    """Get overall registry statistics."""
    by_category = {}
    total_cost = 0.0
    for p in _registry.values():
        cat = p["category"]
        if cat not in by_category:
            by_category[cat] = {"total": 0, "available": 0, "local": 0}
        by_category[cat]["total"] += 1
        if p["status"] == ProviderStatus.AVAILABLE.value:
            by_category[cat]["available"] += 1
        if p["tier"] == ProviderTier.LOCAL.value:
            by_category[cat]["local"] += 1
        total_cost += p.get("total_cost_estimate", 0.0)

    return {
        "total_providers": len(_registry),
        "by_category": by_category,
        "total_cost_estimate": round(total_cost, 6),
        "zero_cost_compliant": total_cost == 0.0,
    }