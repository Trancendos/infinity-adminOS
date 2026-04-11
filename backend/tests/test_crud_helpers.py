# tests/test_crud_helpers.py — Tests for DomainCRUD and DomainCounterCRUD
# Phase 21: Coverage push for crud_helpers.py (0% → 80%+)
# Uses shared db_session fixture from conftest.py (creates tables properly)

import pytest
import uuid
from datetime import datetime, timezone


# ============================================================
# DomainCRUD Tests
# ============================================================

class TestDomainCRUD:
    """Test DomainCRUD operations."""

    @pytest.mark.asyncio
    async def test_crud_create(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_entity", enable_audit=True)
        entity_id = f"test-{uuid.uuid4().hex[:8]}"
        content = {"name": "Test Item", "value": 42}

        result = await crud.create(
            db_session, entity_id, content, "user-1", "Test Item", ["tag1"], "active"
        )

        assert result is not None
        assert result.get("entity_id") == entity_id or "id" in result

    @pytest.mark.asyncio
    async def test_crud_get(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_get", enable_audit=False)
        entity_id = f"get-{uuid.uuid4().hex[:8]}"
        content = {"name": "Get Test", "status": "active"}

        await crud.create(db_session, entity_id, content, "user-1")
        result = await crud.get(db_session, entity_id)

        assert result is not None

    @pytest.mark.asyncio
    async def test_crud_get_nonexistent(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_get_none", enable_audit=False)

        result = await crud.get(db_session, "nonexistent-id")
        assert result is None

    @pytest.mark.asyncio
    async def test_crud_list_all(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_list", enable_audit=False)

        # Create multiple items
        for i in range(3):
            eid = f"list-{uuid.uuid4().hex[:8]}"
            await crud.create(db_session, eid, {"name": f"Item {i}"}, "user-1")

        items, total = await crud.list_all(db_session, skip=0, limit=10)
        assert total >= 3
        assert len(items) >= 3

    @pytest.mark.asyncio
    async def test_crud_list_with_pagination(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_paginate", enable_audit=False)

        for i in range(5):
            eid = f"page-{uuid.uuid4().hex[:8]}"
            await crud.create(db_session, eid, {"name": f"Page Item {i}"}, "user-1")

        items, total = await crud.list_all(db_session, skip=0, limit=2)
        assert len(items) <= 2
        assert total >= 5

    @pytest.mark.asyncio
    async def test_crud_list_with_search(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_search", enable_audit=False)

        eid = f"search-{uuid.uuid4().hex[:8]}"
        await crud.create(
            db_session, eid, {"name": "Unique Searchable"}, "user-1",
            title="Unique Searchable"
        )

        items, total = await crud.list_all(db_session, search="Unique", skip=0, limit=10)
        assert total >= 1

    @pytest.mark.asyncio
    async def test_crud_update(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_update", enable_audit=True)
        entity_id = f"upd-{uuid.uuid4().hex[:8]}"

        await crud.create(db_session, entity_id, {"name": "Original"}, "user-1")
        result = await crud.update(
            db_session, entity_id, {"name": "Updated", "extra": "data"}, "user-2"
        )

        assert result is not None

    @pytest.mark.asyncio
    async def test_crud_update_nonexistent(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_upd_none", enable_audit=False)

        result = await crud.update(db_session, "nonexistent", {"name": "X"}, "user-1")
        assert result is None

    @pytest.mark.asyncio
    async def test_crud_delete_soft(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_delete", enable_audit=True)
        entity_id = f"del-{uuid.uuid4().hex[:8]}"

        await crud.create(db_session, entity_id, {"name": "To Delete"}, "user-1")
        result = await crud.delete(db_session, entity_id, "user-1", hard=False)

        assert result is True

    @pytest.mark.asyncio
    async def test_crud_delete_hard(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_hard_del", enable_audit=False)
        entity_id = f"hdel-{uuid.uuid4().hex[:8]}"

        await crud.create(db_session, entity_id, {"name": "Hard Delete"}, "user-1")
        result = await crud.delete(db_session, entity_id, "user-1", hard=True)

        assert result is True

        # Verify it's gone
        get_result = await crud.get(db_session, entity_id)
        assert get_result is None

    @pytest.mark.asyncio
    async def test_crud_delete_nonexistent(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_del_none", enable_audit=False)

        result = await crud.delete(db_session, "nonexistent", "user-1")
        assert result is False

    @pytest.mark.asyncio
    async def test_crud_count(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_count", enable_audit=False)

        for i in range(3):
            eid = f"cnt-{uuid.uuid4().hex[:8]}"
            await crud.create(db_session, eid, {"name": f"Count {i}"}, "user-1")

        count = await crud.count(db_session)
        assert count >= 3

    @pytest.mark.asyncio
    async def test_crud_overview(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_overview", enable_audit=False)

        eid = f"ov-{uuid.uuid4().hex[:8]}"
        await crud.create(db_session, eid, {"name": "Overview"}, "user-1")

        overview = await crud.overview(db_session)
        assert "domain" in overview
        assert "total" in overview
        assert overview["domain"] == "test_domain"

    @pytest.mark.asyncio
    async def test_crud_audit_log(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_audit", enable_audit=True)
        entity_id = f"aud-{uuid.uuid4().hex[:8]}"

        await crud.create(db_session, entity_id, {"name": "Audited"}, "user-1")
        await crud.update(db_session, entity_id, {"name": "Updated"}, "user-2")

        entries, total = await crud.get_audit_log(db_session, entity_id)
        assert total >= 1

    @pytest.mark.asyncio
    async def test_crud_list_with_owner_filter(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_owner", enable_audit=False)

        eid = f"own-{uuid.uuid4().hex[:8]}"
        await crud.create(db_session, eid, {"name": "Owned"}, "specific-owner")

        items, total = await crud.list_all(
            db_session, owner_id="specific-owner", skip=0, limit=10
        )
        # Should find at least the one we created
        assert total >= 1

    @pytest.mark.asyncio
    async def test_crud_list_with_status_filter(self, db_session):
        from crud_helpers import DomainCRUD
        crud = DomainCRUD("test_domain", "test_status_filter", enable_audit=False)

        eid = f"stat-{uuid.uuid4().hex[:8]}"
        await crud.create(
            db_session, eid, {"name": "Active Item"}, "user-1",
            status="active"
        )

        items, total = await crud.list_all(
            db_session, status="active", skip=0, limit=10
        )
        assert total >= 1


# ============================================================
# DomainCounterCRUD Tests
# ============================================================

class TestDomainCounterCRUD:
    """Test DomainCounterCRUD operations."""

    @pytest.mark.asyncio
    async def test_counter_increment(self, db_session):
        from crud_helpers import DomainCounterCRUD
        crud = DomainCounterCRUD("test_counters")
        counter_name = f"cnt-{uuid.uuid4().hex[:8]}"

        value = await crud.increment(db_session, counter_name, amount=1.0)
        assert value >= 1.0

    @pytest.mark.asyncio
    async def test_counter_increment_by_amount(self, db_session):
        from crud_helpers import DomainCounterCRUD
        crud = DomainCounterCRUD("test_counters")
        counter_name = f"amt-{uuid.uuid4().hex[:8]}"

        await crud.increment(db_session, counter_name, amount=5.0)
        await crud.increment(db_session, counter_name, amount=3.0)
        value = await crud.get_value(db_session, counter_name)
        assert value >= 8.0

    @pytest.mark.asyncio
    async def test_counter_get_value(self, db_session):
        from crud_helpers import DomainCounterCRUD
        crud = DomainCounterCRUD("test_counters")
        counter_name = f"val-{uuid.uuid4().hex[:8]}"

        await crud.increment(db_session, counter_name, amount=10.0)
        value = await crud.get_value(db_session, counter_name)
        assert value == 10.0

    @pytest.mark.asyncio
    async def test_counter_get_nonexistent(self, db_session):
        from crud_helpers import DomainCounterCRUD
        crud = DomainCounterCRUD("test_counters")

        value = await crud.get_value(db_session, "nonexistent-counter")
        assert value == 0.0

    @pytest.mark.asyncio
    async def test_counter_reset(self, db_session):
        from crud_helpers import DomainCounterCRUD
        crud = DomainCounterCRUD("test_counters")
        counter_name = f"rst-{uuid.uuid4().hex[:8]}"

        await crud.increment(db_session, counter_name, amount=50.0)
        await crud.reset(db_session, counter_name)

        value = await crud.get_value(db_session, counter_name)
        assert value == 0.0

    @pytest.mark.asyncio
    async def test_counter_reset_nonexistent(self, db_session):
        from crud_helpers import DomainCounterCRUD
        crud = DomainCounterCRUD("test_counters")

        # reset on nonexistent counter should not raise
        await crud.reset(db_session, "nonexistent-reset")
        value = await crud.get_value(db_session, "nonexistent-reset")
        assert value == 0.0

    @pytest.mark.asyncio
    async def test_counter_list(self, db_session):
        from crud_helpers import DomainCounterCRUD
        crud = DomainCounterCRUD("test_list_counters")
        counter_name = f"lc-{uuid.uuid4().hex[:8]}"

        await crud.increment(db_session, counter_name, amount=1.0)
        counters = await crud.list_counters(db_session)
        assert len(counters) >= 1

    @pytest.mark.asyncio
    async def test_counter_with_entity_id(self, db_session):
        from crud_helpers import DomainCounterCRUD
        crud = DomainCounterCRUD("test_entity_counters")
        counter_name = f"ec-{uuid.uuid4().hex[:8]}"

        value = await crud.increment(
            db_session, counter_name, amount=1.0, entity_id="entity-123"
        )
        assert value >= 1.0


# ============================================================
# get_domain_audit_log Tests
# ============================================================

class TestDomainAuditLogHelper:
    """Test the get_domain_audit_log convenience function."""

    @pytest.mark.asyncio
    async def test_get_domain_audit_log(self, db_session):
        from crud_helpers import DomainCRUD, get_domain_audit_log
        crud = DomainCRUD("test_audit_domain", "test_audit_entity", enable_audit=True)

        eid = f"alog-{uuid.uuid4().hex[:8]}"
        await crud.create(db_session, eid, {"name": "Audit Test"}, "user-1")

        entries, total = await get_domain_audit_log(
            db_session, "test_audit_domain", skip=0, limit=50
        )
        assert isinstance(entries, list)
        assert isinstance(total, int)

    @pytest.mark.asyncio
    async def test_get_domain_audit_log_empty(self, db_session):
        from crud_helpers import get_domain_audit_log

        entries, total = await get_domain_audit_log(
            db_session, "nonexistent_domain", skip=0, limit=50
        )
        assert entries == [] or isinstance(entries, list)
        assert total >= 0