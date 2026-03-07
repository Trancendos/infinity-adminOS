# zero_cost_guard.py — Zero-Cost Infrastructure Enforcement
# ═══════════════════════════════════════════════════════════════════
# Phase 20: Runtime cost tracking, budget alerts, auto-throttle
#
# Design Principles:
# 1. Track all provider costs in real-time
# 2. Alert when approaching budget limits
# 3. Auto-throttle paid providers when budget exceeded
# 4. Enforce LOCAL → FREE → PAID priority at runtime
# 5. Add cost headers to all responses
#
# 2060 Standard: Zero-Cost Infrastructure, Full Transparency
# ═══════════════════════════════════════════════════════════════════

import os
import logging
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from enum import Enum
import threading

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("infinity-os.zero_cost")


# ── Cost Tracking ─────────────────────────────────────────────────

class CostCategory(str, Enum):
    LLM = "llm"
    STORAGE = "storage"
    SEARCH = "search"
    CACHE = "cache"
    COMPUTE = "compute"
    NETWORK = "network"
    OTHER = "other"


@dataclass
class CostEntry:
    """A single cost event."""
    timestamp: float
    category: str
    provider: str
    amount: float  # USD
    description: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BudgetConfig:
    """Budget configuration."""
    daily_limit_usd: float = 0.0       # 0 = unlimited (zero-cost mode)
    monthly_limit_usd: float = 0.0     # 0 = unlimited
    alert_threshold_pct: float = 80.0   # Alert at 80% of limit
    auto_throttle: bool = True          # Auto-block paid providers at limit
    zero_cost_mode: bool = True         # Enforce zero-cost by default


class ZeroCostGuard:
    """
    Central cost tracking and enforcement engine.
    
    Tracks all provider costs, enforces budgets, and provides
    cost transparency headers on every response.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True

        # Configuration
        self.budget = BudgetConfig(
            daily_limit_usd=float(os.getenv("COST_DAILY_LIMIT_USD", "0")),
            monthly_limit_usd=float(os.getenv("COST_MONTHLY_LIMIT_USD", "0")),
            alert_threshold_pct=float(os.getenv("COST_ALERT_THRESHOLD_PCT", "80")),
            auto_throttle=os.getenv("COST_AUTO_THROTTLE", "true").lower() == "true",
            zero_cost_mode=os.getenv("ZERO_COST_MODE", "true").lower() == "true",
        )

        # Cost tracking
        self._entries: List[CostEntry] = []
        self._daily_total: float = 0.0
        self._monthly_total: float = 0.0
        self._lifetime_total: float = 0.0
        self._current_day: str = ""
        self._current_month: str = ""
        self._by_category: Dict[str, float] = {}
        self._by_provider: Dict[str, float] = {}
        self._throttled_providers: set = set()
        self._alerts: List[Dict[str, Any]] = []
        self._data_lock = threading.Lock()

        # Stats
        self._requests_total: int = 0
        self._requests_zero_cost: int = 0
        self._requests_paid: int = 0
        self._requests_blocked: int = 0

        self._reset_period_if_needed()

        logger.info(
            f"ZeroCostGuard initialized: zero_cost_mode={self.budget.zero_cost_mode}, "
            f"daily_limit=${self.budget.daily_limit_usd}, "
            f"monthly_limit=${self.budget.monthly_limit_usd}"
        )

    def _reset_period_if_needed(self):
        """Reset daily/monthly counters if period has changed."""
        now = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")
        month = now.strftime("%Y-%m")

        if today != self._current_day:
            self._daily_total = 0.0
            self._current_day = today
            self._throttled_providers.clear()

        if month != self._current_month:
            self._monthly_total = 0.0
            self._current_month = month

    # ── Cost Recording ────────────────────────────────────────

    def record_cost(
        self,
        category: str,
        provider: str,
        amount: float,
        description: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Record a cost event. Returns True if allowed, False if blocked.
        
        In zero-cost mode, any amount > 0 from a paid provider is blocked.
        """
        with self._data_lock:
            self._reset_period_if_needed()
            self._requests_total += 1

            # Zero-cost enforcement
            if amount <= 0:
                self._requests_zero_cost += 1
                return True

            # Check if provider is throttled
            if provider in self._throttled_providers:
                self._requests_blocked += 1
                logger.warning(
                    f"BLOCKED: {provider} is throttled (cost: ${amount:.6f})"
                )
                return False

            # Zero-cost mode: block all paid operations
            if self.budget.zero_cost_mode:
                self._requests_blocked += 1
                logger.warning(
                    f"ZERO-COST BLOCK: {provider} attempted ${amount:.6f} "
                    f"for {category}/{description}"
                )
                self._add_alert("zero_cost_violation", {
                    "provider": provider,
                    "category": category,
                    "amount": amount,
                    "description": description,
                })
                return False

            # Budget checks
            if self.budget.daily_limit_usd > 0:
                if self._daily_total + amount > self.budget.daily_limit_usd:
                    self._throttle_provider(provider, "daily_limit_exceeded")
                    self._requests_blocked += 1
                    return False

                # Alert threshold
                pct = ((self._daily_total + amount) / self.budget.daily_limit_usd) * 100
                if pct >= self.budget.alert_threshold_pct:
                    self._add_alert("daily_budget_warning", {
                        "current": self._daily_total + amount,
                        "limit": self.budget.daily_limit_usd,
                        "percentage": pct,
                    })

            if self.budget.monthly_limit_usd > 0:
                if self._monthly_total + amount > self.budget.monthly_limit_usd:
                    self._throttle_provider(provider, "monthly_limit_exceeded")
                    self._requests_blocked += 1
                    return False

            # Record the cost
            entry = CostEntry(
                timestamp=time.time(),
                category=category,
                provider=provider,
                amount=amount,
                description=description,
                metadata=metadata or {},
            )
            self._entries.append(entry)

            # Update totals
            self._daily_total += amount
            self._monthly_total += amount
            self._lifetime_total += amount
            self._by_category[category] = self._by_category.get(category, 0) + amount
            self._by_provider[provider] = self._by_provider.get(provider, 0) + amount
            self._requests_paid += 1

            # Trim old entries (keep last 10000)
            if len(self._entries) > 10000:
                self._entries = self._entries[-10000:]

            return True

    def _throttle_provider(self, provider: str, reason: str):
        """Throttle a provider (block future paid requests)."""
        if self.budget.auto_throttle:
            self._throttled_providers.add(provider)
            self._add_alert("provider_throttled", {
                "provider": provider,
                "reason": reason,
            })
            logger.warning(f"THROTTLED: {provider} — {reason}")

    def _add_alert(self, alert_type: str, data: Dict[str, Any]):
        """Add an alert to the alert log."""
        self._alerts.append({
            "type": alert_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        # Keep last 100 alerts
        if len(self._alerts) > 100:
            self._alerts = self._alerts[-100:]

    # ── Query Methods ─────────────────────────────────────────

    def is_provider_allowed(self, provider: str, tier: str = "local") -> bool:
        """Check if a provider is allowed to incur costs."""
        if tier in ("local", "free"):
            return True  # Always allow zero-cost providers
        if self.budget.zero_cost_mode:
            return False  # Block all paid in zero-cost mode
        if provider in self._throttled_providers:
            return False
        return True

    def get_cost_headers(self) -> Dict[str, str]:
        """Get cost-related headers for HTTP responses."""
        with self._data_lock:
            return {
                "X-Cost-Mode": "zero-cost" if self.budget.zero_cost_mode else "budgeted",
                "X-Cost-Daily-Total": f"${self._daily_total:.6f}",
                "X-Cost-Monthly-Total": f"${self._monthly_total:.6f}",
                "X-Cost-Lifetime-Total": f"${self._lifetime_total:.6f}",
                "X-Cost-Requests-Blocked": str(self._requests_blocked),
                "X-Cost-Zero-Pct": f"{self._zero_cost_percentage():.1f}%",
            }

    def _zero_cost_percentage(self) -> float:
        """Calculate percentage of requests that were zero-cost."""
        if self._requests_total == 0:
            return 100.0
        return (self._requests_zero_cost / self._requests_total) * 100

    def get_stats(self) -> Dict[str, Any]:
        """Get comprehensive cost statistics."""
        with self._data_lock:
            return {
                "mode": "zero-cost" if self.budget.zero_cost_mode else "budgeted",
                "budget": {
                    "daily_limit_usd": self.budget.daily_limit_usd,
                    "monthly_limit_usd": self.budget.monthly_limit_usd,
                    "alert_threshold_pct": self.budget.alert_threshold_pct,
                    "auto_throttle": self.budget.auto_throttle,
                },
                "totals": {
                    "daily_usd": round(self._daily_total, 6),
                    "monthly_usd": round(self._monthly_total, 6),
                    "lifetime_usd": round(self._lifetime_total, 6),
                },
                "requests": {
                    "total": self._requests_total,
                    "zero_cost": self._requests_zero_cost,
                    "paid": self._requests_paid,
                    "blocked": self._requests_blocked,
                    "zero_cost_pct": round(self._zero_cost_percentage(), 2),
                },
                "by_category": {k: round(v, 6) for k, v in self._by_category.items()},
                "by_provider": {k: round(v, 6) for k, v in self._by_provider.items()},
                "throttled_providers": list(self._throttled_providers),
                "recent_alerts": self._alerts[-10:],
                "current_day": self._current_day,
                "current_month": self._current_month,
            }

    def get_alerts(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent alerts."""
        with self._data_lock:
            return self._alerts[-limit:]


# ── Singleton accessor ────────────────────────────────────────────

def get_zero_cost_guard() -> ZeroCostGuard:
    """Get the singleton ZeroCostGuard instance."""
    return ZeroCostGuard()


# ── Middleware ────────────────────────────────────────────────────

class ZeroCostMiddleware(BaseHTTPMiddleware):
    """
    Middleware that adds cost transparency headers to every response.
    
    Headers added:
    - X-Cost-Mode: zero-cost | budgeted
    - X-Cost-Daily-Total: $0.000000
    - X-Cost-Monthly-Total: $0.000000
    - X-Cost-Zero-Pct: 100.0%
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        guard = get_zero_cost_guard()
        cost_headers = guard.get_cost_headers()
        for key, value in cost_headers.items():
            response.headers[key] = value

        return response


def install_zero_cost_middleware(app):
    """Install zero-cost middleware on the FastAPI app."""
    app.add_middleware(ZeroCostMiddleware)
    logger.info("ZeroCostMiddleware installed")