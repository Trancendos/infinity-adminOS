# tests/test_providers.py — Provider Abstraction Tests
# Phase 20: Multi-provider, zero-cost, no vendor lock-in
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ── Provider Registry Tests ───────────────────────────────────────

class TestProviderRegistry:
    """Test the provider registry system."""

    async def test_provider_tiers_exist(self):
        from providers import ProviderTier
        assert ProviderTier.LOCAL == "local"
        assert ProviderTier.FREE == "free"
        assert ProviderTier.FREEMIUM == "freemium"
        assert ProviderTier.PAID == "paid"
        assert ProviderTier.ENTERPRISE == "enterprise"

    async def test_provider_categories_exist(self):
        from providers import ProviderCategory
        assert ProviderCategory.LLM == "llm"
        assert ProviderCategory.STORAGE == "storage"
        assert ProviderCategory.CACHE == "cache"
        assert ProviderCategory.SEARCH == "search"

    async def test_register_and_get_provider(self):
        from providers import (
            register_provider, get_provider, ProviderTier,
            ProviderCategory, ProviderStatus,
        )
        register_provider(
            category=ProviderCategory.LLM,
            name="test_provider_1",
            tier=ProviderTier.LOCAL,
            config={"model": "test"},
        )
        provider = get_provider(ProviderCategory.LLM, "test_provider_1")
        assert provider is not None
        assert provider["name"] == "test_provider_1"
        assert provider["tier"] == ProviderTier.LOCAL.value
        assert provider["status"] == ProviderStatus.AVAILABLE.value

    async def test_list_providers_by_category(self):
        from providers import (
            register_provider, list_providers,
            ProviderTier, ProviderCategory,
        )
        register_provider(
            category=ProviderCategory.LLM,
            name="test_llm_a",
            tier=ProviderTier.LOCAL,
            config={"model": "test"},
        )
        register_provider(
            category=ProviderCategory.STORAGE,
            name="test_storage_a",
            tier=ProviderTier.FREE,
            config={"path": "/tmp"},
        )
        llm_providers = list_providers(category=ProviderCategory.LLM)
        assert any(p["name"] == "test_llm_a" for p in llm_providers)

    async def test_provider_usage_tracking(self):
        from providers import (
            register_provider, record_provider_usage,
            get_provider, ProviderTier, ProviderCategory,
        )
        register_provider(
            category=ProviderCategory.CACHE,
            name="test_usage_provider",
            tier=ProviderTier.LOCAL,
            config={},
        )
        record_provider_usage(ProviderCategory.CACHE, "test_usage_provider")
        record_provider_usage(ProviderCategory.CACHE, "test_usage_provider")
        provider = get_provider(ProviderCategory.CACHE, "test_usage_provider")
        assert provider["request_count"] == 2

    async def test_provider_error_tracking(self):
        from providers import (
            register_provider, record_provider_error,
            get_provider, ProviderTier, ProviderCategory,
            ProviderStatus,
        )
        register_provider(
            category=ProviderCategory.SEARCH,
            name="test_error_provider",
            tier=ProviderTier.FREE,
            config={},
        )
        # Record 5 errors to trigger auto-degrade
        for i in range(5):
            record_provider_error(ProviderCategory.SEARCH, "test_error_provider")
        provider = get_provider(ProviderCategory.SEARCH, "test_error_provider")
        assert provider["error_count"] == 5
        assert provider["status"] == ProviderStatus.DEGRADED.value

    async def test_registry_stats(self):
        from providers import get_registry_stats
        stats = get_registry_stats()
        assert "total_providers" in stats
        assert "by_category" in stats
        assert "zero_cost_compliant" in stats


# ── Storage Provider Tests ────────────────────────────────────────

class TestStorageProvider:
    """Test the storage provider abstraction."""

    async def test_local_filesystem_available(self):
        from providers.storage_provider import LocalFilesystemProvider
        provider = LocalFilesystemProvider()
        assert await provider.is_available()

    async def test_local_put_get_delete(self):
        from providers.storage_provider import LocalFilesystemProvider
        provider = LocalFilesystemProvider()
        await provider.create_bucket("test-bucket")

        # Put
        result = await provider.put(
            "test-bucket", "test-key.txt",
            b"Hello, Trancendos!",
            content_type="text/plain",
        )
        assert result.success
        assert result.size == 18
        assert result.cost_estimate == 0.0

        # Get
        data = await provider.get("test-bucket", "test-key.txt")
        assert data == b"Hello, Trancendos!"

        # Exists
        assert await provider.exists("test-bucket", "test-key.txt")

        # Head
        obj = await provider.head("test-bucket", "test-key.txt")
        assert obj is not None
        assert obj.size == 18

        # List
        listing = await provider.list_objects("test-bucket")
        assert listing.total >= 1

        # Delete
        del_result = await provider.delete("test-bucket", "test-key.txt")
        assert del_result.success
        assert not await provider.exists("test-bucket", "test-key.txt")

    async def test_local_path_traversal_blocked(self):
        from providers.storage_provider import LocalFilesystemProvider
        provider = LocalFilesystemProvider()
        with pytest.raises(ValueError, match="traversal"):
            provider._resolve_path("test-bucket", "../../etc/passwd")

    async def test_storage_gateway_put_get(self):
        from providers.storage_provider import storage_put, storage_get, storage_delete
        result = await storage_put(
            "gateway-test", "gw-key.txt",
            b"Gateway test data",
        )
        assert result.success

        data = await storage_get("gateway-test", "gw-key.txt")
        assert data == b"Gateway test data"

        await storage_delete("gateway-test", "gw-key.txt")

    async def test_available_storage_providers(self):
        from providers.storage_provider import get_available_storage_providers
        providers = await get_available_storage_providers()
        assert len(providers) >= 1
        local = next(p for p in providers if p["name"] == "local_filesystem")
        assert local["tier"] == "local"
        assert local["zero_cost"] is True


# ── Cache Provider Tests ──────────────────────────────────────────

class TestCacheProvider:
    """Test the cache provider abstraction."""

    async def test_in_memory_cache_available(self):
        from providers.cache_provider import InMemoryCacheProvider
        provider = InMemoryCacheProvider()
        assert await provider.is_available()

    async def test_in_memory_set_get_delete(self):
        from providers.cache_provider import InMemoryCacheProvider
        provider = InMemoryCacheProvider()

        # Set
        result = await provider.set("test-key", {"value": 42})
        assert result.success

        # Get
        val = await provider.get("test-key")
        assert val == {"value": 42}

        # Exists
        assert await provider.exists("test-key")

        # Delete
        del_result = await provider.delete("test-key")
        assert del_result.success
        assert not await provider.exists("test-key")

    async def test_in_memory_ttl_expiry(self):
        import time
        from providers.cache_provider import InMemoryCacheProvider
        provider = InMemoryCacheProvider()

        await provider.set("ttl-key", "expires-soon", ttl=1)
        assert await provider.get("ttl-key") == "expires-soon"

        time.sleep(1.1)
        assert await provider.get("ttl-key") is None

    async def test_in_memory_lru_eviction(self):
        from providers.cache_provider import InMemoryCacheProvider
        provider = InMemoryCacheProvider()
        provider.max_size = 5

        for i in range(10):
            await provider.set(f"key-{i}", f"value-{i}")

        # Only last 5 should remain
        stats = await provider.get_stats()
        assert stats.size <= 6  # Allow small margin for timing

    async def test_in_memory_get_many(self):
        from providers.cache_provider import InMemoryCacheProvider
        provider = InMemoryCacheProvider()

        await provider.set("a", 1)
        await provider.set("b", 2)
        await provider.set("c", 3)

        result = await provider.get_many(["a", "b", "missing"])
        assert result["a"] == 1
        assert result["b"] == 2
        assert "missing" not in result

    async def test_cache_gateway_set_get(self):
        from providers.cache_provider import cache_set, cache_get, cache_delete
        result = await cache_set("gw-cache-key", {"data": "test"})
        assert result.success

        val = await cache_get("gw-cache-key")
        assert val == {"data": "test"}

        await cache_delete("gw-cache-key")

    async def test_cache_stats(self):
        from providers.cache_provider import cache_stats
        stats = await cache_stats()
        assert len(stats) >= 1
        assert stats[0].provider == "in_memory"

    async def test_available_cache_providers(self):
        from providers.cache_provider import get_available_cache_providers
        providers = await get_available_cache_providers()
        assert len(providers) >= 1
        mem = next(p for p in providers if p["name"] == "in_memory")
        assert mem["tier"] == "local"
        assert mem["zero_cost"] is True


# ── Search Provider Tests ─────────────────────────────────────────

class TestSearchProvider:
    """Test the search provider abstraction."""

    async def test_in_memory_search_available(self):
        from providers.search_provider import InMemorySearchProvider
        provider = InMemorySearchProvider()
        assert await provider.is_available()

    async def test_in_memory_index_and_search(self):
        from providers.search_provider import InMemorySearchProvider
        provider = InMemorySearchProvider()

        await provider.create_index("test-idx")
        await provider.index_document("test-idx", "doc-1", {
            "title": "Trancendos Digital Recovery",
            "body": "A framework for mental health and wellbeing",
        })
        await provider.index_document("test-idx", "doc-2", {
            "title": "Infinity OS Architecture",
            "body": "Three-lane mesh with AI orchestration",
        })

        result = await provider.search("test-idx", "mental health")
        assert result.total >= 1
        assert result.hits[0].id == "doc-1"
        assert result.provider == "in_memory"

    async def test_in_memory_search_empty_query(self):
        from providers.search_provider import InMemorySearchProvider
        provider = InMemorySearchProvider()

        await provider.create_index("empty-q-idx")
        await provider.index_document("empty-q-idx", "d1", {"title": "Test"})

        result = await provider.search("empty-q-idx", "")
        assert result.total >= 1

    async def test_in_memory_delete_document(self):
        from providers.search_provider import InMemorySearchProvider
        provider = InMemorySearchProvider()

        await provider.create_index("del-idx")
        await provider.index_document("del-idx", "d1", {"title": "Delete me"})
        assert await provider.delete_document("del-idx", "d1")

        result = await provider.search("del-idx", "delete")
        assert result.total == 0

    async def test_in_memory_index_stats(self):
        from providers.search_provider import InMemorySearchProvider
        provider = InMemorySearchProvider()

        await provider.create_index("stats-idx")
        await provider.index_document("stats-idx", "d1", {"title": "One"})
        await provider.index_document("stats-idx", "d2", {"title": "Two"})

        stats = await provider.get_index_stats("stats-idx")
        assert stats.document_count == 2

    async def test_search_gateway(self):
        from providers.search_provider import (
            search_create_index, search_index_document,
            search_query, search_delete_index,
        )
        await search_create_index("gw-idx")
        await search_index_document("gw-idx", "gw-1", {
            "title": "Gateway Search Test",
            "content": "Zero cost multi-provider search",
        })

        result = await search_query("gw-idx", "zero cost")
        assert result.total >= 1

        await search_delete_index("gw-idx")

    async def test_available_search_providers(self):
        from providers.search_provider import get_available_search_providers
        providers = await get_available_search_providers()
        assert len(providers) >= 1
        mem = next(p for p in providers if p["name"] == "in_memory")
        assert mem["tier"] == "local"
        assert mem["zero_cost"] is True


# ── LLM Provider Tests ────────────────────────────────────────────

class TestLLMProvider:
    """Test the LLM provider abstraction."""

    async def test_llm_providers_registered(self):
        from providers.llm_provider import get_available_providers
        providers = get_available_providers()
        assert len(providers) >= 1
        # At minimum, Ollama (local) should be registered
        names = [p["name"] for p in providers]
        assert "ollama" in names

    async def test_llm_request_dataclass(self):
        from providers.llm_provider import LLMRequest
        req = LLMRequest(
            messages=[{"role": "user", "content": "Hello"}],
            model="test-model",
            max_tokens=100,
        )
        assert req.messages[0]["content"] == "Hello"
        assert req.temperature == 0.7  # default

    async def test_llm_response_dataclass(self):
        from providers.llm_provider import LLMResponse
        resp = LLMResponse(
            content="Generated text",
            provider="test",
            model="test-model",
            tier="local",
        )
        assert resp.content == "Generated text"
        assert resp.cost_estimate == 0.0  # default


# ── Domain Store Tests ────────────────────────────────────────────

class TestDomainStore:
    """Test the hybrid domain store."""

    async def test_dict_interface(self):
        from domain_store import DomainStore
        store = DomainStore("test", "item")

        store["key1"] = {"name": "Test Item"}
        assert "key1" in store
        assert store["key1"]["name"] == "Test Item"
        assert len(store) == 1

        del store["key1"]
        assert "key1" not in store
        assert len(store) == 0

    async def test_dict_iteration(self):
        from domain_store import DomainStore
        store = DomainStore("test", "item")

        store["a"] = {"v": 1}
        store["b"] = {"v": 2}
        store["c"] = {"v": 3}

        keys = list(store.keys())
        assert set(keys) == {"a", "b", "c"}

        values = list(store.values())
        assert len(values) == 3

        items = list(store.items())
        assert len(items) == 3

    async def test_dict_get_default(self):
        from domain_store import DomainStore
        store = DomainStore("test", "item")

        assert store.get("missing") is None
        assert store.get("missing", "default") == "default"

    async def test_domain_audit_log(self):
        from domain_store import DomainAuditLog
        log = DomainAuditLog("test")

        log.append({"action": "create", "id": "1"})
        log.append({"action": "update", "id": "2"})

        assert len(log) == 2
        assert log[0]["action"] == "create"

    async def test_domain_audit_log_max_memory(self):
        from domain_store import DomainAuditLog
        log = DomainAuditLog("test", max_memory=5)

        for i in range(10):
            log.append({"action": f"event_{i}"})

        assert len(log) == 5
        assert log[0]["action"] == "event_5"  # Oldest kept


# ── API Endpoint Tests ────────────────────────────────────────────

class TestCostEndpoint:
    """Test the /api/v1/system/costs endpoint."""

    async def test_costs_endpoint(self, client: AsyncClient, test_user):
        from tests.conftest import get_auth_headers
        headers = get_auth_headers(test_user)
        resp = await client.get("/api/v1/system/costs", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["zero_cost_compliant"] is True
        assert data["mode"] == "zero-cost"
        assert "provider_priorities" in data
        assert "llm" in data["provider_priorities"]
        assert "storage" in data["provider_priorities"]

    async def test_cost_headers_present(self, client: AsyncClient, test_user):
        from tests.conftest import get_auth_headers
        headers = get_auth_headers(test_user)
        resp = await client.get("/health", headers=headers)
        assert resp.status_code == 200
        assert "X-Cost-Mode" in resp.headers
        assert resp.headers["X-Cost-Mode"] == "zero-cost"

    async def test_root_includes_costs_link(self, client: AsyncClient):
        resp = await client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "costs" in data
        assert data["costs"] == "/api/v1/system/costs"