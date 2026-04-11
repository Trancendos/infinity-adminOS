# middleware_compliance.py — Compliance & Governance Middleware
# ═══════════════════════════════════════════════════════════════════
# Request-level compliance enforcement for the Trancendos Ecosystem:
#
# 1. Data Residency — inject/validate X-Data-Residency header per region
# 2. Consent Verification — enforce consent tokens on data-processing writes
# 3. AI Audit Trail — log AI-related requests with invocation tracking
# 4. Content Provenance — C2PA awareness headers (stub — real signing TBD)
# 5. Resource Metering — request counting for cost awareness
#
# HONEST STATUS:
#   - Data Residency: Header pass-through only. Real region routing TBD.
#   - Consent: Soft enforcement (warns, doesn't block). Real consent store TBD.
#   - AI Audit: Basic request logging filtered to AI paths. Real model
#     versioning, I/O hashing, and bias tracking TBD.
#   - C2PA: Stub only. Real content signing TBD.
#   - Metering: Basic counters. Real cost enforcement is in zero_cost_guard.py.
#
# Integrates with standard_2060.py for compliance validation
# and kernel_event_bus.py for cross-lane event propagation.
# ═══════════════════════════════════════════════════════════════════

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("infinity-os.compliance")

# ── AI-related path prefixes (trigger audit trail) ───────────
AI_PATH_PREFIXES = (
    "/api/v1/ai",
    "/api/v1/cornelius",
    "/api/v1/multiAI",
    "/api/v1/agent",
    "/api/v1/luminous",
    "/api/v1/turings-hub",
    "/api/v1/codegen",
    "/api/v1/adaptive-engine",
    "/api/v1/self-healing",
    "/api/v1/savania",
    "/api/v1/section7",
)

# ── Data processing paths (require consent) ──────────────────
DATA_PROCESSING_PREFIXES = (
    "/api/v1/hive",
    "/api/v1/nexus",
    "/api/v1/observatory",
    "/api/v1/taimra",
    "/api/v1/lille-sc",
    "/api/v1/solarscene",
)

# ── Valid data residency zones ───────────────────────────────
VALID_RESIDENCY_ZONES = {"eu", "uk", "us-east", "us-west", "apac", "global"}


class ComplianceMiddleware(BaseHTTPMiddleware):
    """Enforce compliance policies at the request level.

    This is a governance layer — it tracks, logs, and annotates requests
    with compliance metadata. It does NOT yet enforce hard blocks on
    non-compliant requests (that's the roadmap for real compliance).
    """

    def __init__(
        self,
        app,
        default_residency: str = "eu",
        consent_required: bool = True,
        ai_audit_enabled: bool = True,
        zero_cost_mode: bool = True,
    ):
        super().__init__(app)
        self.default_residency = default_residency
        self.consent_required = consent_required
        self.ai_audit_enabled = ai_audit_enabled
        self.zero_cost_mode = zero_cost_mode
        self._ai_audit_log: List[Dict[str, Any]] = []
        self._resource_meter: Dict[str, float] = {
            "total_requests": 0,
            "ai_requests": 0,
            "data_requests": 0,
            "compute_ms": 0.0,
        }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        start = time.perf_counter()

        # Skip compliance for health/system endpoints
        if path in ("/health", "/ready", "/metrics", "/", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        # ── 1. Data Residency (header pass-through — real routing TBD) ──
        requested_residency = request.headers.get("X-Data-Residency", self.default_residency)
        if requested_residency not in VALID_RESIDENCY_ZONES:
            requested_residency = self.default_residency

        # Store on request state for downstream use
        request.state.data_residency = requested_residency

        # ── 2. Consent Verification (soft enforcement — real store TBD) ──
        is_data_path = any(path.startswith(p) for p in DATA_PROCESSING_PREFIXES)
        if self.consent_required and is_data_path and request.method in ("POST", "PUT", "PATCH"):
            consent_header = request.headers.get("X-Consent-Token", "")
            if not consent_header:
                # TODO: When consent store is built, this should return 403
                logger.warning(
                    f"[compliance] Missing consent token for data processing: "
                    f"path={path} method={request.method}"
                )
                request.state.consent_status = "missing"
            else:
                request.state.consent_status = "provided"
        else:
            request.state.consent_status = "not_required"

        # ── 3. AI Audit Trail (basic logging — real model tracking TBD) ──
        is_ai_path = any(path.startswith(p) for p in AI_PATH_PREFIXES)
        if self.ai_audit_enabled and is_ai_path:
            request.state.ai_invocation = True
            invocation_id = str(uuid.uuid4())
            request.state.ai_invocation_id = invocation_id
        else:
            request.state.ai_invocation = False

        # ── Execute Request ──────────────────────────────────────
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        # ── 4. Response Headers ──────────────────────────────────
        response.headers["X-Data-Residency"] = requested_residency
        response.headers["X-2060-Compliant"] = "true"  # backward compat
        response.headers["X-Compliance-Level"] = "basic"  # honest about current enforcement level
        response.headers["X-Consent-Status"] = getattr(request.state, "consent_status", "unknown")

        if getattr(request.state, "ai_invocation", False):
            response.headers["X-AI-Invocation-ID"] = getattr(request.state, "ai_invocation_id", "")
            response.headers["X-AI-Auditable"] = "true"

            # Record AI audit entry
            audit_entry = {
                "id": getattr(request.state, "ai_invocation_id", ""),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "path": path,
                "method": request.method,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
                "data_residency": requested_residency,
                "consent_status": getattr(request.state, "consent_status", "unknown"),
            }
            self._ai_audit_log.append(audit_entry)
            # Keep bounded
            if len(self._ai_audit_log) > 10000:
                self._ai_audit_log = self._ai_audit_log[-5000:]

        # ── 5. Resource Metering ─────────────────────────────────
        if self.zero_cost_mode:
            self._resource_meter["total_requests"] += 1
            self._resource_meter["compute_ms"] += duration_ms
            if is_ai_path:
                self._resource_meter["ai_requests"] += 1
            if is_data_path:
                self._resource_meter["data_requests"] += 1

        return response

    def get_ai_audit_log(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Return recent AI audit entries."""
        return self._ai_audit_log[-limit:]

    def get_resource_meter(self) -> Dict[str, Any]:
        """Return resource usage metrics."""
        return {
            **self._resource_meter,
            "compute_seconds": round(self._resource_meter["compute_ms"] / 1000, 2),
        }


# ── Singleton for access from endpoints ──────────────────────
_compliance_middleware: Optional[ComplianceMiddleware] = None


def get_compliance_middleware() -> Optional[ComplianceMiddleware]:
    return _compliance_middleware


def install_compliance_middleware(app: FastAPI, config=None):
    """Install compliance middleware."""
    global _compliance_middleware

    if config is None:
        from config import get_config
        config = get_config()

    middleware = ComplianceMiddleware(
        app,
        default_residency=config.data_residency_default,
        consent_required=config.consent_required,
        ai_audit_enabled=config.ai_audit_enabled,
        zero_cost_mode=config.zero_cost_mode,
    )
    app.add_middleware(
        ComplianceMiddleware,
        default_residency=config.data_residency_default,
        consent_required=config.consent_required,
        ai_audit_enabled=config.ai_audit_enabled,
        zero_cost_mode=config.zero_cost_mode,
    )
    _compliance_middleware = middleware

    logger.info(
        f"✅ Compliance middleware installed: "
        f"residency={config.data_residency_default} "
        f"consent={'required' if config.consent_required else 'optional'} "
        f"ai_audit={'ON' if config.ai_audit_enabled else 'OFF'} "
        f"zero_cost={'ON' if config.zero_cost_mode else 'OFF'}"
    )


# ── Backward compatibility aliases ───────────────────────────
# These exist so existing imports from middleware_2060 still work
# during the transition period. Will be removed once all refs updated.
Compliance2060Middleware = ComplianceMiddleware
install_2060_middleware = install_compliance_middleware