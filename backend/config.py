# config.py — Production Configuration Module
# ═══════════════════════════════════════════════════════════════
# Centralised, validated configuration for Infinity OS.
# Uses Pydantic Settings for type-safe env var parsing with
# sensible defaults for development and strict validation
# for production deployments.
#
# 2060 Standard: Zero-Cost Infrastructure, Future-Proof Architecture
# ═══════════════════════════════════════════════════════════════

import os
import secrets
import logging
from typing import List, Optional
from functools import lru_cache

from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("infinity-os.config")


class InfinityConfig(BaseModel):
    """Validated configuration for Infinity OS."""

    # ── Core ─────────────────────────────────────────────────
    environment: str = Field(default="development")
    debug: bool = Field(default=False)
    log_level: str = Field(default="INFO")
    service_name: str = Field(default="infinity-os-api")
    service_version: str = Field(default="3.0.0")
    port: int = Field(default=8000, ge=1, le=65535)
    workers: int = Field(default=1, ge=1, le=32)

    # ── Security ─────────────────────────────────────────────
    jwt_secret_key: str = Field(default="")
    jwt_algorithm: str = Field(default="HS512")
    jwt_access_token_expire_minutes: int = Field(default=30, ge=5, le=1440)
    jwt_refresh_token_expire_days: int = Field(default=7, ge=1, le=90)
    cors_origins: List[str] = Field(default_factory=lambda: [
        "http://localhost:3000", "http://localhost:5173", "http://localhost:8080"
    ])

    # ── Database ─────────────────────────────────────────────
    database_url: str = Field(default="postgresql+asyncpg://infinity_os:secure_password@localhost/infinity_os")
    db_pool_size: int = Field(default=20, ge=5, le=100)
    db_max_overflow: int = Field(default=0, ge=0, le=50)
    db_pool_recycle: int = Field(default=3600, ge=300)
    db_echo: bool = Field(default=False)

    # ── Rate Limiting ────────────────────────────────────────
    rate_limit_enabled: bool = Field(default=True)
    rate_limit_default: str = Field(default="100/minute")
    rate_limit_auth: str = Field(default="20/minute")
    rate_limit_ai: str = Field(default="30/minute")
    rate_limit_search: str = Field(default="60/minute")

    # ── Request Limits ───────────────────────────────────────
    max_request_size_mb: int = Field(default=50, ge=1, le=500)
    request_timeout_seconds: int = Field(default=60, ge=10, le=300)

    # ── AI / LLM ────────────────────────────────────────────
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    hf_api_key: Optional[str] = None
    default_llm_provider: str = Field(default="groq")

    # ── C2PA Content Provenance ──────────────────────────────
    c2pa_enabled: bool = Field(default=False)
    c2pa_cert_path: Optional[str] = None
    c2pa_key_path: Optional[str] = None

    # ── Observability ────────────────────────────────────────
    otel_endpoint: Optional[str] = None
    otel_service_name: str = Field(default="infinity-os-api")
    metrics_enabled: bool = Field(default=True)

    # ── 2060 Standard ────────────────────────────────────────
    data_residency_default: str = Field(default="eu")
    consent_required: bool = Field(default=True)
    ai_audit_enabled: bool = Field(default=True)
    zero_cost_mode: bool = Field(default=True)
    future_proof_level: str = Field(default="2060", pattern="^(2030|2040|2050|2060)$")

    # ── Kernel Event Bus ─────────────────────────────────────
    event_bus_backend: str = Field(default="memory", pattern="^(memory|redis|nats)$")
    event_bus_redis_url: Optional[str] = None
    event_bus_max_history: int = Field(default=10000, ge=100)
    event_bus_dead_letter_max: int = Field(default=1000, ge=100)

    # ── Federation ───────────────────────────────────────────
    federation_enabled: bool = Field(default=False)
    federation_peers: List[str] = Field(default_factory=list)

    @field_validator("jwt_secret_key", mode="before")
    @classmethod
    def validate_jwt_secret(cls, v):
        if not v or len(v) < 32:
            env = os.getenv("ENVIRONMENT", "development")
            if env == "production":
                raise ValueError(
                    "JWT_SECRET_KEY must be at least 32 characters in production. "
                    "Generate one: python -c &quot;import secrets; print(secrets.token_urlsafe(48))&quot;"
                )
            # Auto-generate for dev/test
            generated = secrets.token_urlsafe(48)
            logger.warning("⚠️  JWT_SECRET_KEY not set — generated ephemeral key for development")
            return generated
        return v

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v):
        allowed = {"development", "staging", "production", "test"}
        if v not in allowed:
            raise ValueError(f"ENVIRONMENT must be one of {allowed}")
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        return self.environment in ("development", "test")

    @property
    def active_llm_providers(self) -> List[str]:
        providers = []
        if self.groq_api_key:
            providers.append("groq")
        if self.openai_api_key:
            providers.append("openai")
        if self.anthropic_api_key:
            providers.append("anthropic")
        if self.hf_api_key:
            providers.append("huggingface")
        return providers

    def validate_production_readiness(self) -> List[str]:
        """Return list of warnings/errors for production deployment."""
        issues = []
        if len(self.jwt_secret_key) < 48:
            issues.append("CRITICAL: JWT_SECRET_KEY should be at least 48 characters")
        if "localhost" in self.database_url:
            issues.append("WARNING: DATABASE_URL points to localhost")
        if not self.active_llm_providers:
            issues.append("WARNING: No LLM API keys configured — AI features will use stubs")
        if not self.otel_endpoint:
            issues.append("INFO: OpenTelemetry not configured — tracing disabled")
        if self.c2pa_enabled and not self.c2pa_cert_path:
            issues.append("WARNING: C2PA enabled but no certificate path set")
        if not self.rate_limit_enabled:
            issues.append("WARNING: Rate limiting is disabled")
        if self.debug:
            issues.append("CRITICAL: Debug mode is enabled in production")
        if any("localhost" in o for o in self.cors_origins):
            issues.append("WARNING: CORS allows localhost origins")
        return issues


def _load_from_env() -> InfinityConfig:
    """Load configuration from environment variables."""
    return InfinityConfig(
        environment=os.getenv("ENVIRONMENT", "development"),
        debug=os.getenv("DEBUG", "false").lower() == "true",
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        service_name=os.getenv("OTEL_SERVICE_NAME", "infinity-os-api"),
        port=int(os.getenv("PORT", "8000")),
        workers=int(os.getenv("WORKERS", "1")),
        jwt_secret_key=os.getenv("JWT_SECRET_KEY", ""),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS512"),
        jwt_access_token_expire_minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30")),
        cors_origins=[
            o.strip() for o in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:3000,http://localhost:5173,http://localhost:8080"
            ).split(",")
        ],
        database_url=os.getenv("DATABASE_URL", "postgresql+asyncpg://infinity_os:secure_password@localhost/infinity_os"),
        db_pool_size=int(os.getenv("DB_POOL_SIZE", "20")),
        db_max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "0")),
        db_pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "3600")),
        db_echo=os.getenv("SQL_ECHO", "false").lower() == "true",
        rate_limit_enabled=os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true",
        rate_limit_default=os.getenv("RATE_LIMIT_DEFAULT", "100/minute"),
        rate_limit_auth=os.getenv("RATE_LIMIT_AUTH", "20/minute"),
        rate_limit_ai=os.getenv("RATE_LIMIT_AI", "30/minute"),
        max_request_size_mb=int(os.getenv("MAX_REQUEST_SIZE_MB", "50")),
        request_timeout_seconds=int(os.getenv("REQUEST_TIMEOUT_SECONDS", "60")),
        groq_api_key=os.getenv("GROQ_API_KEY"),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
        hf_api_key=os.getenv("HF_API_KEY"),
        c2pa_enabled=os.getenv("C2PA_ENABLED", "false").lower() == "true",
        c2pa_cert_path=os.getenv("C2PA_CERT_PATH"),
        otel_endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
        data_residency_default=os.getenv("DATA_RESIDENCY_DEFAULT", "eu"),
        consent_required=os.getenv("CONSENT_REQUIRED", "true").lower() == "true",
        ai_audit_enabled=os.getenv("AI_AUDIT_ENABLED", "true").lower() == "true",
        zero_cost_mode=os.getenv("ZERO_COST_MODE", "true").lower() == "true",
        future_proof_level=os.getenv("FUTURE_PROOF_LEVEL", "2060"),
        event_bus_backend=os.getenv("EVENT_BUS_BACKEND", "memory"),
        event_bus_redis_url=os.getenv("EVENT_BUS_REDIS_URL"),
        event_bus_max_history=int(os.getenv("EVENT_BUS_MAX_HISTORY", "10000")),
        federation_enabled=os.getenv("FEDERATION_ENABLED", "false").lower() == "true",
    )


@lru_cache(maxsize=1)
def get_config() -> InfinityConfig:
    """Get cached configuration singleton."""
    config = _load_from_env()
    if config.is_production:
        issues = config.validate_production_readiness()
        for issue in issues:
            if issue.startswith("CRITICAL"):
                logger.error(issue)
            elif issue.startswith("WARNING"):
                logger.warning(issue)
            else:
                logger.info(issue)
    return config


def reset_config():
    """Clear cached config (for testing)."""
    get_config.cache_clear()