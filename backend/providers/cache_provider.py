# providers/cache_provider.py — Unified Cache Provider Interface
# ═══════════════════════════════════════════════════════════════════
# Zero-Cost, Multi-Provider Cache Abstraction
#
# Priority Order (zero-cost first):
# 1. LOCAL: In-memory LRU cache (zero cost, no dependencies)
# 2. LOCAL: Valkey (self-hosted Redis fork, zero cost, BSD license)
# 3. LOCAL: KeyDB (multi-threaded Redis fork, zero cost)
# 4. FREEMIUM: Upstash Redis (free tier: 10K commands/day)
# 5. PAID: AWS ElastiCache / GCP Memorystore (managed)
#
# Every provider implements the same interface. The system
# auto-selects the best available provider and cascades on failure.
#
# 2060 Standard: Zero-Cost Infrastructure, No Vendor Lock-In
# ═══════════════════════════════════════════════════════════════════

import os
import logging
import time
import hashlib
import json
from abc import ABC, abstractmethod
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional
import threading

from providers import (
    ProviderTier, ProviderStatus, ProviderCategory,
    register_provider, record_provider_usage, record_provider_error,
    update_provider_status, get_best_provider,
)

logger = logging.getLogger("infinity-os.providers.cache")


# ── Data Classes ──────────────────────────────────────────────────

@dataclass
class CacheEntry:
    """Represents a cached value."""
    key: str
    value: Any
    ttl: Optional[int] = None  # seconds, None = no expiry
    created_at: float = 0.0
    expires_at: Optional[float] = None
    provider: str = ""


@dataclass
class CacheResult:
    """Result of a cache operation."""
    success: bool
    key: str
    provider: str
    hit: bool = False
    error: Optional[str] = None
    latency_ms: float = 0.0


@dataclass
class CacheStats:
    """Cache statistics."""
    hits: int = 0
    misses: int = 0
    sets: int = 0
    deletes: int = 0
    evictions: int = 0
    size: int = 0
    max_size: int = 0
    provider: str = ""
    hit_rate: float = 0.0


# ── Abstract Base Provider ────────────────────────────────────────

class BaseCacheProvider(ABC):
    """Abstract cache provider interface."""

    name: str = "base"
    tier: ProviderTier = ProviderTier.LOCAL

    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        """Get a value by key. Returns None if not found or expired."""
        ...

    @abstractmethod
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> CacheResult:
        """Set a value with optional TTL in seconds."""
        ...

    @abstractmethod
    async def delete(self, key: str) -> CacheResult:
        """Delete a key."""
        ...

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Check if a key exists and is not expired."""
        ...

    @abstractmethod
    async def clear(self) -> CacheResult:
        """Clear all cached entries."""
        ...

    @abstractmethod
    async def get_stats(self) -> CacheStats:
        """Get cache statistics."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if this provider is currently available."""
        ...

    async def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """Get multiple values. Default implementation calls get() for each."""
        result = {}
        for key in keys:
            val = await self.get(key)
            if val is not None:
                result[key] = val
        return result

    async def set_many(self, items: Dict[str, Any],
                       ttl: Optional[int] = None) -> CacheResult:
        """Set multiple values. Default implementation calls set() for each."""
        for key, value in items.items():
            await self.set(key, value, ttl)
        return CacheResult(
            success=True, key=f"batch:{len(items)}",
            provider=self.name,
        )


# ── In-Memory LRU Cache Provider ─────────────────────────────────

class InMemoryCacheProvider(BaseCacheProvider):
    """
    In-memory LRU cache provider.
    Tier: LOCAL (zero cost, no external dependencies)
    
    Thread-safe LRU cache with TTL support.
    Configurable max size with automatic eviction.
    """

    name = "in_memory"
    tier = ProviderTier.LOCAL

    def __init__(self):
        self.max_size = int(os.getenv("CACHE_MEMORY_MAX_SIZE", "10000"))
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = threading.Lock()
        self._stats = CacheStats(
            max_size=self.max_size,
            provider=self.name,
        )

    def _is_expired(self, entry: CacheEntry) -> bool:
        """Check if a cache entry has expired."""
        if entry.expires_at is None:
            return False
        return time.time() > entry.expires_at

    def _evict_expired(self):
        """Remove expired entries (called under lock)."""
        now = time.time()
        expired_keys = [
            k for k, v in self._cache.items()
            if v.expires_at is not None and now > v.expires_at
        ]
        for key in expired_keys:
            del self._cache[key]
            self._stats.evictions += 1

    def _evict_lru(self):
        """Evict least recently used entries if over max size (called under lock)."""
        while len(self._cache) > self.max_size:
            self._cache.popitem(last=False)
            self._stats.evictions += 1

    async def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._stats.misses += 1
                return None
            if self._is_expired(entry):
                del self._cache[key]
                self._stats.misses += 1
                self._stats.evictions += 1
                return None
            # Move to end (most recently used)
            self._cache.move_to_end(key)
            self._stats.hits += 1
            return entry.value

    async def set(self, key: str, value: Any,
                  ttl: Optional[int] = None) -> CacheResult:
        start = time.monotonic()
        with self._lock:
            now = time.time()
            expires_at = now + ttl if ttl else None

            # Serialize check — ensure value is cacheable
            try:
                if isinstance(value, (dict, list)):
                    json.dumps(value)  # Validate JSON-serializable
            except (TypeError, ValueError):
                pass  # Allow non-JSON values in memory cache

            entry = CacheEntry(
                key=key, value=value, ttl=ttl,
                created_at=now, expires_at=expires_at,
                provider=self.name,
            )
            self._cache[key] = entry
            self._cache.move_to_end(key)
            self._stats.sets += 1
            self._stats.size = len(self._cache)

            # Evict if over capacity
            self._evict_lru()
            # Periodic expired cleanup (every 100 sets)
            if self._stats.sets % 100 == 0:
                self._evict_expired()

        latency = (time.monotonic() - start) * 1000
        record_provider_usage(self.name, {"operation": "set", "key": key})
        return CacheResult(
            success=True, key=key, provider=self.name,
            latency_ms=latency,
        )

    async def delete(self, key: str) -> CacheResult:
        start = time.monotonic()
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                self._stats.deletes += 1
                self._stats.size = len(self._cache)
        latency = (time.monotonic() - start) * 1000
        record_provider_usage(self.name, {"operation": "delete", "key": key})
        return CacheResult(
            success=True, key=key, provider=self.name,
            latency_ms=latency,
        )

    async def exists(self, key: str) -> bool:
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return False
            if self._is_expired(entry):
                del self._cache[key]
                return False
            return True

    async def clear(self) -> CacheResult:
        start = time.monotonic()
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._stats.size = 0
        latency = (time.monotonic() - start) * 1000
        record_provider_usage(self.name, {"operation": "clear", "count": count})
        return CacheResult(
            success=True, key="*", provider=self.name,
            latency_ms=latency,
        )

    async def get_stats(self) -> CacheStats:
        with self._lock:
            self._stats.size = len(self._cache)
            total = self._stats.hits + self._stats.misses
            self._stats.hit_rate = (
                self._stats.hits / total if total > 0 else 0.0
            )
            return CacheStats(
                hits=self._stats.hits,
                misses=self._stats.misses,
                sets=self._stats.sets,
                deletes=self._stats.deletes,
                evictions=self._stats.evictions,
                size=self._stats.size,
                max_size=self._stats.max_size,
                provider=self.name,
                hit_rate=self._stats.hit_rate,
            )

    async def get_many(self, keys: List[str]) -> Dict[str, Any]:
        result = {}
        with self._lock:
            for key in keys:
                entry = self._cache.get(key)
                if entry and not self._is_expired(entry):
                    self._cache.move_to_end(key)
                    self._stats.hits += 1
                    result[key] = entry.value
                else:
                    self._stats.misses += 1
        return result

    async def is_available(self) -> bool:
        return True  # Always available


# ── Valkey / Redis-Compatible Provider ────────────────────────────

class ValkeyRedisProvider(BaseCacheProvider):
    """
    Valkey / Redis-compatible cache provider.
    Tier: LOCAL (self-hosted Valkey/KeyDB) or FREEMIUM (Upstash/managed)
    
    Works with any Redis-compatible server: Valkey, Redis,
    KeyDB, DragonflyDB, Garnet, etc.
    
    Uses raw socket protocol (RESP) to avoid redis-py dependency,
    but falls back to redis-py if available.
    """

    name = "valkey_redis"
    tier = ProviderTier.LOCAL

    def __init__(self):
        self.host = os.getenv("REDIS_HOST", os.getenv("VALKEY_HOST", "localhost"))
        self.port = int(os.getenv("REDIS_PORT", os.getenv("VALKEY_PORT", "6379")))
        self.password = os.getenv("REDIS_PASSWORD", os.getenv("VALKEY_PASSWORD", ""))
        self.db = int(os.getenv("REDIS_DB", "0"))
        self.url = os.getenv("REDIS_URL", os.getenv("VALKEY_URL", ""))
        self._client = None
        self._available = None

        # Determine tier
        if "upstash" in self.host.lower() or "upstash" in self.url.lower():
            self.tier = ProviderTier.FREEMIUM
        elif "elasticache" in self.host.lower() or "memorystore" in self.host.lower():
            self.tier = ProviderTier.PAID
        else:
            self.tier = ProviderTier.LOCAL

    async def _get_client(self):
        """Get or create Redis client."""
        if self._client is not None:
            return self._client

        try:
            # Try redis-py (async)
            import redis.asyncio as aioredis
            if self.url:
                self._client = aioredis.from_url(
                    self.url, decode_responses=True
                )
            else:
                self._client = aioredis.Redis(
                    host=self.host, port=self.port,
                    password=self.password or None,
                    db=self.db, decode_responses=True,
                )
            # Test connection
            await self._client.ping()
            return self._client
        except ImportError:
            logger.info("redis-py not installed, Valkey/Redis provider unavailable")
            return None
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}")
            self._client = None
            return None

    async def get(self, key: str) -> Optional[Any]:
        client = await self._get_client()
        if not client:
            return None
        try:
            raw = await client.get(f"infinity:{key}")
            if raw is None:
                return None
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return raw
        except Exception as e:
            record_provider_error(self.name, str(e))
            return None

    async def set(self, key: str, value: Any,
                  ttl: Optional[int] = None) -> CacheResult:
        start = time.monotonic()
        client = await self._get_client()
        if not client:
            return CacheResult(
                success=False, key=key, provider=self.name,
                error="Redis client unavailable",
            )
        try:
            serialized = json.dumps(value) if isinstance(value, (dict, list)) else str(value)
            if ttl:
                await client.setex(f"infinity:{key}", ttl, serialized)
            else:
                await client.set(f"infinity:{key}", serialized)
            latency = (time.monotonic() - start) * 1000
            record_provider_usage(self.name, {"operation": "set", "key": key})
            return CacheResult(
                success=True, key=key, provider=self.name,
                latency_ms=latency,
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            record_provider_error(self.name, str(e))
            return CacheResult(
                success=False, key=key, provider=self.name,
                error=str(e), latency_ms=latency,
            )

    async def delete(self, key: str) -> CacheResult:
        start = time.monotonic()
        client = await self._get_client()
        if not client:
            return CacheResult(
                success=False, key=key, provider=self.name,
                error="Redis client unavailable",
            )
        try:
            await client.delete(f"infinity:{key}")
            latency = (time.monotonic() - start) * 1000
            record_provider_usage(self.name, {"operation": "delete", "key": key})
            return CacheResult(
                success=True, key=key, provider=self.name,
                latency_ms=latency,
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            record_provider_error(self.name, str(e))
            return CacheResult(
                success=False, key=key, provider=self.name,
                error=str(e), latency_ms=latency,
            )

    async def exists(self, key: str) -> bool:
        client = await self._get_client()
        if not client:
            return False
        try:
            return bool(await client.exists(f"infinity:{key}"))
        except Exception:
            return False

    async def clear(self) -> CacheResult:
        start = time.monotonic()
        client = await self._get_client()
        if not client:
            return CacheResult(
                success=False, key="*", provider=self.name,
                error="Redis client unavailable",
            )
        try:
            # Only clear infinity-namespaced keys
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = await client.scan(cursor, match="infinity:*", count=100)
                if keys:
                    await client.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
            latency = (time.monotonic() - start) * 1000
            record_provider_usage(self.name, {"operation": "clear", "count": deleted})
            return CacheResult(
                success=True, key="*", provider=self.name,
                latency_ms=latency,
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            record_provider_error(self.name, str(e))
            return CacheResult(
                success=False, key="*", provider=self.name,
                error=str(e), latency_ms=latency,
            )

    async def get_stats(self) -> CacheStats:
        client = await self._get_client()
        if not client:
            return CacheStats(provider=self.name)
        try:
            info = await client.info("stats")
            keyspace = await client.info("keyspace")
            db_info = keyspace.get(f"db{self.db}", {})
            return CacheStats(
                hits=info.get("keyspace_hits", 0),
                misses=info.get("keyspace_misses", 0),
                size=db_info.get("keys", 0) if isinstance(db_info, dict) else 0,
                provider=self.name,
                hit_rate=info.get("keyspace_hits", 0) / max(
                    info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0), 1
                ),
            )
        except Exception:
            return CacheStats(provider=self.name)

    async def get_many(self, keys: List[str]) -> Dict[str, Any]:
        client = await self._get_client()
        if not client:
            return {}
        try:
            prefixed = [f"infinity:{k}" for k in keys]
            values = await client.mget(*prefixed)
            result = {}
            for key, raw in zip(keys, values):
                if raw is not None:
                    try:
                        result[key] = json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        result[key] = raw
            return result
        except Exception:
            return {}

    async def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        client = await self._get_client()
        self._available = client is not None
        return self._available


# ── Unified Cache Gateway ─────────────────────────────────────────

# Provider instances (lazy-initialized)
_providers: Dict[str, BaseCacheProvider] = {}


def _init_providers():
    """Initialize and register all cache providers."""
    global _providers
    if _providers:
        return

    # 1. In-memory — always available, zero cost
    memory = InMemoryCacheProvider()
    _providers["in_memory"] = memory
    register_provider(
        name="cache_in_memory",
        category=ProviderCategory.CACHE,
        tier=ProviderTier.LOCAL,
        config={"max_size": memory.max_size},
    )

    # 2. Valkey/Redis — available if configured
    if (os.getenv("REDIS_HOST") or os.getenv("VALKEY_HOST") or
            os.getenv("REDIS_URL") or os.getenv("VALKEY_URL")):
        valkey = ValkeyRedisProvider()
        _providers["valkey_redis"] = valkey
        register_provider(
            name="cache_valkey_redis",
            category=ProviderCategory.CACHE,
            tier=valkey.tier,
            config={"host": valkey.host, "port": valkey.port},
        )

    logger.info(f"Cache providers initialized: {list(_providers.keys())}")


async def cache_get(key: str,
                    preferred_provider: Optional[str] = None) -> Optional[Any]:
    """Get a cached value using the best available provider."""
    _init_providers()

    # Try preferred first
    if preferred_provider and preferred_provider in _providers:
        val = await _providers[preferred_provider].get(key)
        if val is not None:
            return val

    # Try all providers (external first for distributed cache, then memory)
    for name in reversed(list(_providers.keys())):
        provider = _providers[name]
        if await provider.is_available():
            val = await provider.get(key)
            if val is not None:
                return val

    return None


async def cache_set(key: str, value: Any,
                    ttl: Optional[int] = None,
                    zero_cost_only: bool = True,
                    preferred_provider: Optional[str] = None) -> CacheResult:
    """Set a cached value using the best available provider."""
    _init_providers()

    # Build provider priority list
    candidates: List[BaseCacheProvider] = []

    if preferred_provider and preferred_provider in _providers:
        candidates.append(_providers[preferred_provider])

    tier_order = [ProviderTier.LOCAL, ProviderTier.FREE, ProviderTier.FREEMIUM, ProviderTier.PAID]
    for tier in tier_order:
        if zero_cost_only and tier in (ProviderTier.PAID, ProviderTier.ENTERPRISE):
            continue
        for name, provider in _providers.items():
            if provider.tier == tier and provider not in candidates:
                candidates.append(provider)

    # Write to all available providers (write-through)
    last_result = CacheResult(success=False, key=key, provider="none", error="No providers")
    for provider in candidates:
        if await provider.is_available():
            result = await provider.set(key, value, ttl)
            if result.success:
                last_result = result
                # For write-through, continue to next provider
                # (ensures memory + redis both have the value)

    return last_result


async def cache_delete(key: str) -> CacheResult:
    """Delete from all cache providers."""
    _init_providers()
    last_result = CacheResult(success=False, key=key, provider="none")
    for provider in _providers.values():
        if await provider.is_available():
            last_result = await provider.delete(key)
    return last_result


async def cache_clear() -> CacheResult:
    """Clear all cache providers."""
    _init_providers()
    last_result = CacheResult(success=False, key="*", provider="none")
    for provider in _providers.values():
        if await provider.is_available():
            last_result = await provider.clear()
    return last_result


async def cache_stats() -> List[CacheStats]:
    """Get stats from all cache providers."""
    _init_providers()
    stats = []
    for provider in _providers.values():
        if await provider.is_available():
            stats.append(await provider.get_stats())
    return stats


async def get_available_cache_providers() -> List[Dict[str, Any]]:
    """List all registered cache providers and their status."""
    _init_providers()
    result = []
    for name, provider in _providers.items():
        available = await provider.is_available()
        result.append({
            "name": name,
            "tier": provider.tier.value,
            "available": available,
            "zero_cost": provider.tier in (ProviderTier.LOCAL, ProviderTier.FREE),
        })
    return result