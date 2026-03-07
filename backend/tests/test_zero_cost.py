# tests/test_zero_cost.py — Zero-Cost Guard Tests
# Phase 20: Cost tracking, budget enforcement, zero-cost mode
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class TestZeroCostGuard:
    """Test the zero-cost infrastructure guard."""

    async def test_guard_singleton(self):
        from zero_cost_guard import get_zero_cost_guard
        g1 = get_zero_cost_guard()
        g2 = get_zero_cost_guard()
        assert g1 is g2

    async def test_zero_cost_mode_default(self):
        from zero_cost_guard import get_zero_cost_guard
        guard = get_zero_cost_guard()
        assert guard.budget.zero_cost_mode is True

    async def test_zero_cost_blocks_paid(self):
        from zero_cost_guard import get_zero_cost_guard
        guard = get_zero_cost_guard()
        # In zero-cost mode, any cost > 0 should be blocked
        allowed = guard.record_cost("llm", "openai", 0.001, "test generation")
        assert allowed is False

    async def test_zero_cost_allows_free(self):
        from zero_cost_guard import get_zero_cost_guard
        guard = get_zero_cost_guard()
        # Zero-cost operations should always be allowed
        allowed = guard.record_cost("llm", "ollama", 0.0, "local generation")
        assert allowed is True

    async def test_provider_allowed_local(self):
        from zero_cost_guard import get_zero_cost_guard
        guard = get_zero_cost_guard()
        assert guard.is_provider_allowed("ollama", "local") is True
        assert guard.is_provider_allowed("groq", "free") is True
        assert guard.is_provider_allowed("openai", "paid") is False

    async def test_cost_stats(self):
        from zero_cost_guard import get_zero_cost_guard
        guard = get_zero_cost_guard()
        stats = guard.get_stats()
        assert stats["mode"] == "zero-cost"
        assert "totals" in stats
        assert "requests" in stats
        assert "by_category" in stats
        assert "by_provider" in stats
        assert "throttled_providers" in stats

    async def test_cost_headers(self):
        from zero_cost_guard import get_zero_cost_guard
        guard = get_zero_cost_guard()
        headers = guard.get_cost_headers()
        assert "X-Cost-Mode" in headers
        assert headers["X-Cost-Mode"] == "zero-cost"
        assert "X-Cost-Daily-Total" in headers
        assert "X-Cost-Monthly-Total" in headers
        assert "X-Cost-Zero-Pct" in headers

    async def test_alerts_on_paid_attempt(self):
        from zero_cost_guard import get_zero_cost_guard
        guard = get_zero_cost_guard()
        # Attempt a paid operation
        guard.record_cost("llm", "anthropic", 0.01, "test blocked")
        alerts = guard.get_alerts()
        # Should have at least one zero_cost_violation alert
        violation_alerts = [a for a in alerts if a["type"] == "zero_cost_violation"]
        assert len(violation_alerts) >= 1

    async def test_lifetime_total_stays_zero(self):
        from zero_cost_guard import get_zero_cost_guard
        guard = get_zero_cost_guard()
        # In zero-cost mode, lifetime total should remain 0
        # because all paid operations are blocked
        stats = guard.get_stats()
        assert stats["totals"]["lifetime_usd"] == 0.0


class TestZeroCostMiddleware:
    """Test the zero-cost middleware integration."""

    async def test_middleware_adds_headers(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert "X-Cost-Mode" in resp.headers

    async def test_all_responses_have_cost_headers(self, client: AsyncClient, test_user):
        from tests.conftest import get_auth_headers
        headers = get_auth_headers(test_user)

        # Test multiple endpoints
        endpoints = ["/health", "/ready", "/"]
        for endpoint in endpoints:
            resp = await client.get(endpoint, headers=headers)
            assert "X-Cost-Mode" in resp.headers, f"Missing X-Cost-Mode on {endpoint}"
            assert "X-Cost-Zero-Pct" in resp.headers, f"Missing X-Cost-Zero-Pct on {endpoint}"


class TestMultiDatabaseSupport:
    """Test multi-database dialect support."""

    async def test_database_url_resolution(self):
        from database import _resolve_database_url, _detect_dialect
        # The test environment uses SQLite
        url = _resolve_database_url()
        assert "sqlite" in url or "postgresql" in url

    async def test_dialect_detection_sqlite(self):
        from database import _detect_dialect
        assert _detect_dialect("sqlite+aiosqlite:///./test.db") == "sqlite"

    async def test_dialect_detection_postgresql(self):
        from database import _detect_dialect
        assert _detect_dialect("postgresql+asyncpg://user:pass@host/db") == "postgresql"

    async def test_dialect_detection_postgres_shorthand(self):
        from database import _detect_dialect
        assert _detect_dialect("postgres://user:pass@host/db") == "postgresql"

    async def test_engine_kwargs_sqlite(self):
        from database import _build_engine_kwargs
        kwargs = _build_engine_kwargs("sqlite+aiosqlite:///./test.db", "sqlite")
        from sqlalchemy.pool import NullPool
        assert kwargs["poolclass"] == NullPool

    async def test_engine_kwargs_postgresql(self):
        from database import _build_engine_kwargs
        kwargs = _build_engine_kwargs("postgresql+asyncpg://u:p@h/d", "postgresql")
        assert "pool_size" in kwargs
        assert kwargs["pool_pre_ping"] is True

    async def test_db_health_check(self):
        from database import check_db_health
        health = await check_db_health()
        assert health["status"] == "healthy"
        assert "dialect" in health


class TestDialectAgnosticModels:
    """Test that models work with the dialect-agnostic UUID type."""

    async def test_dialect_uuid_type(self):
        from models import DialectUUID
        uuid_type = DialectUUID()
        assert uuid_type is not None

    async def test_dialect_uuid_with_as_uuid(self):
        from models import DialectUUID
        uuid_type = DialectUUID(as_uuid=True)
        assert uuid_type is not None

    async def test_domain_document_model(self):
        from models_phase20 import DomainDocument
        assert DomainDocument.__tablename__ == "domain_documents"

    async def test_domain_audit_entry_model(self):
        from models_phase20 import DomainAuditEntry
        assert DomainAuditEntry.__tablename__ == "domain_audit_entries"

    async def test_domain_counter_model(self):
        from models_phase20 import DomainCounter
        assert DomainCounter.__tablename__ == "domain_counters"

    async def test_domain_document_to_dict(self):
        from models_phase20 import DomainDocument
        from datetime import datetime, timezone
        doc = DomainDocument(
            id="test-id",
            domain="citadel",
            entity_type="directive",
            entity_id="dir-1",
            owner_id="user-1",
            content={"name": "Test Directive", "priority": "high"},
            status="active",
            version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        d = doc.to_dict()
        assert d["id"] == "dir-1"
        assert d["domain"] == "citadel"
        assert d["name"] == "Test Directive"
        assert d["priority"] == "high"


class TestConfigProviderPreferences:
    """Test config provider preference fields."""

    async def test_config_has_provider_priorities(self):
        from config import get_config, reset_config
        reset_config()
        config = get_config()
        assert "ollama" in config.llm_provider_priority
        assert "local_filesystem" in config.storage_provider_priority
        assert "in_memory" in config.cache_provider_priority
        assert "in_memory" in config.search_provider_priority

    async def test_config_zero_cost_mode(self):
        from config import get_config, reset_config
        reset_config()
        config = get_config()
        assert config.zero_cost_mode is True

    async def test_config_cost_limits_default_zero(self):
        from config import get_config, reset_config
        reset_config()
        config = get_config()
        assert config.cost_daily_limit_usd == 0.0
        assert config.cost_monthly_limit_usd == 0.0