# middleware_2060.py — DEPRECATED: Use middleware_compliance.py instead
# This file exists only for backward compatibility during transition.
# All real implementation is in middleware_compliance.py.

from middleware_compliance import (
    ComplianceMiddleware as Compliance2060Middleware,
    install_compliance_middleware as install_2060_middleware,
    get_compliance_middleware,
    ComplianceMiddleware,
    AI_PATH_PREFIXES,
    DATA_PROCESSING_PREFIXES,
    VALID_RESIDENCY_ZONES,
)

__all__ = [
    "Compliance2060Middleware",
    "install_2060_middleware",
    "get_compliance_middleware",
    "ComplianceMiddleware",
    "AI_PATH_PREFIXES",
    "DATA_PROCESSING_PREFIXES",
    "VALID_RESIDENCY_ZONES",
]