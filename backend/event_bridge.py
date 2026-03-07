# event_bridge.py — Router ↔ Kernel Event Bus Bridge
# ═══════════════════════════════════════════════════════════════
# Provides a simple, consistent API for routers to emit events
# to the Kernel Event Bus without tight coupling.
#
# Usage in any router:
#   from event_bridge import emit_event, EventCategory
#   await emit_event(EventCategory.DATA, "hive.dataset.created", {"id": "..."})
#
# The bridge handles:
# - Lane routing (AI/User/Data/Cross)
# - Priority assignment based on category
# - Correlation ID propagation from request context
# - Graceful fallback if event bus is unavailable
#
# 2060 Standard: Cross-Lane Event Propagation
# ═══════════════════════════════════════════════════════════════

import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional, List, Callable, Coroutine

logger = logging.getLogger("infinity-os.event_bridge")


class EventCategory(str, Enum):
    """High-level event categories mapped to lanes."""
    AI = "ai"                   # Lane 1 — AI/Nexus events
    USER = "user"               # Lane 2 — User/Infinity events
    DATA = "data"               # Lane 3 — Data/Hive events
    GOVERNANCE = "governance"   # Cross-lane — compliance, audit
    SECURITY = "security"       # Cross-lane — security events
    SYSTEM = "system"           # System-level events
    CREATIVE = "creative"       # Studio/creative pipeline events
    WELLBEING = "wellbeing"     # Tranquillity Realm events


# ── Category → Lane + Priority mapping ───────────────────────

_CATEGORY_LANE_MAP = {
    EventCategory.AI: "lane1_ai",
    EventCategory.USER: "lane2_user",
    EventCategory.DATA: "lane3_data",
    EventCategory.GOVERNANCE: "cross_lane",
    EventCategory.SECURITY: "cross_lane",
    EventCategory.SYSTEM: "system",
    EventCategory.CREATIVE: "lane2_user",
    EventCategory.WELLBEING: "lane2_user",
}

_CATEGORY_PRIORITY_MAP = {
    EventCategory.AI: "normal",
    EventCategory.USER: "normal",
    EventCategory.DATA: "normal",
    EventCategory.GOVERNANCE: "high",
    EventCategory.SECURITY: "critical",
    EventCategory.SYSTEM: "normal",
    EventCategory.CREATIVE: "low",
    EventCategory.WELLBEING: "normal",
}


# ── Event History (bounded in-memory ring buffer) ────────────

_event_history: List[Dict[str, Any]] = []
_MAX_HISTORY = 5000


async def emit_event(
    category: EventCategory,
    topic: str,
    payload: Dict[str, Any],
    source: str = "",
    correlation_id: Optional[str] = None,
    priority: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Emit an event to the Kernel Event Bus.

    Args:
        category: Event category (determines lane routing)
        topic: Dot-separated topic (e.g., "hive.dataset.created")
        payload: Event data
        source: Source identifier (router/service name)
        correlation_id: Request correlation ID for tracing
        priority: Override default priority for category
        metadata: Additional metadata

    Returns:
        Event ID if published, None if bus unavailable
    """
    global _event_history

    event_id = str(uuid.uuid4())
    lane = _CATEGORY_LANE_MAP.get(category, "system")
    event_priority = priority or _CATEGORY_PRIORITY_MAP.get(category, "normal")

    event_record = {
        "id": event_id,
        "topic": topic,
        "category": category.value,
        "lane": lane,
        "priority": event_priority,
        "payload": payload,
        "source": source,
        "correlation_id": correlation_id or str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": metadata or {},
    }

    try:
        # Try to publish to Kernel Event Bus
        from kernel_event_bus import KernelEventBus, KernelEvent, EventLane, EventPriority

        bus = await KernelEventBus.get_instance()

        # Map string lane to EventLane enum
        lane_map = {
            "lane1_ai": EventLane.AI,
            "lane2_user": EventLane.USER,
            "lane3_data": EventLane.DATA,
            "cross_lane": EventLane.CROSS,
            "system": EventLane.SYSTEM,
        }

        priority_map = {
            "critical": EventPriority.CRITICAL,
            "high": EventPriority.HIGH,
            "normal": EventPriority.NORMAL,
            "low": EventPriority.LOW,
        }

        kernel_event = KernelEvent(
            id=event_id,
            topic=topic,
            payload=payload,
            source=source or f"event_bridge.{category.value}",
            lane=lane_map.get(lane, EventLane.SYSTEM),
            priority=priority_map.get(event_priority, EventPriority.NORMAL),
            correlation_id=event_record["correlation_id"],
            metadata=metadata or {},
        )

        await bus.publish(kernel_event)
        event_record["published"] = True
        logger.debug(f"[EventBridge] Published: {topic} → {lane} [{event_priority}]")

    except Exception as e:
        # Graceful fallback — log but don't fail the request
        event_record["published"] = False
        event_record["error"] = str(e)[:200]
        logger.warning(f"[EventBridge] Failed to publish {topic}: {e}")

    # Record in history
    _event_history.append(event_record)
    if len(_event_history) > _MAX_HISTORY:
        _event_history = _event_history[-(_MAX_HISTORY // 2):]

    return event_id


async def subscribe(
    topic_pattern: str,
    handler: Callable[..., Coroutine],
    category: Optional[EventCategory] = None,
) -> Optional[str]:
    """Subscribe to events matching a topic pattern.

    Args:
        topic_pattern: Glob pattern (e.g., "hive.*", "security.#")
        handler: Async callback function
        category: Optional category filter

    Returns:
        Subscription ID if successful, None if bus unavailable
    """
    try:
        from kernel_event_bus import KernelEventBus, EventLane

        bus = await KernelEventBus.get_instance()

        lane_filter = None
        if category:
            lane_str = _CATEGORY_LANE_MAP.get(category, "system")
            lane_map = {
                "lane1_ai": EventLane.AI,
                "lane2_user": EventLane.USER,
                "lane3_data": EventLane.DATA,
                "cross_lane": EventLane.CROSS,
                "system": EventLane.SYSTEM,
            }
            lane_filter = lane_map.get(lane_str)

        sub_id = await bus.subscribe(
            topic_pattern=topic_pattern,
            handler=handler,
            lane_filter=lane_filter,
        )
        logger.info(f"[EventBridge] Subscribed: {topic_pattern} → {sub_id}")
        return sub_id

    except Exception as e:
        logger.warning(f"[EventBridge] Failed to subscribe {topic_pattern}: {e}")
        return None


def get_event_history(
    limit: int = 100,
    category: Optional[str] = None,
    topic_prefix: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get recent event history with optional filters."""
    items = _event_history
    if category:
        items = [e for e in items if e.get("category") == category]
    if topic_prefix:
        items = [e for e in items if e.get("topic", "").startswith(topic_prefix)]
    return items[-limit:]


def get_event_stats() -> Dict[str, Any]:
    """Get event bridge statistics."""
    by_category = {}
    by_lane = {}
    published = 0
    failed = 0

    for e in _event_history:
        cat = e.get("category", "unknown")
        by_category[cat] = by_category.get(cat, 0) + 1
        lane = e.get("lane", "unknown")
        by_lane[lane] = by_lane.get(lane, 0) + 1
        if e.get("published"):
            published += 1
        else:
            failed += 1

    return {
        "total_events": len(_event_history),
        "published": published,
        "failed": failed,
        "by_category": by_category,
        "by_lane": by_lane,
    }