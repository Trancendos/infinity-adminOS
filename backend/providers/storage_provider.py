# providers/storage_provider.py — Unified Storage Provider Interface
# ═══════════════════════════════════════════════════════════════════
# Zero-Cost, Multi-Provider Storage Abstraction
#
# Priority Order (zero-cost first):
# 1. LOCAL: Local filesystem (zero cost, no dependencies)
# 2. LOCAL: MinIO (self-hosted S3-compatible, zero cost)
# 3. FREE: Backblaze B2 (10GB free tier)
# 4. PAID: AWS S3 / GCS / Azure Blob (pay-per-use)
#
# Every provider implements the same interface. The system
# auto-selects the best available provider and cascades on failure.
#
# 2060 Standard: Zero-Cost Infrastructure, No Vendor Lock-In
# ═══════════════════════════════════════════════════════════════════

import os
import io
import logging
import shutil
import hashlib
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, BinaryIO
from pathlib import Path

from providers import (
    ProviderTier, ProviderStatus, ProviderCategory,
    register_provider, record_provider_usage, record_provider_error,
    update_provider_status, get_best_provider,
)

logger = logging.getLogger("infinity-os.providers.storage")


# ── Data Classes ──────────────────────────────────────────────────

@dataclass
class StorageObject:
    """Represents a stored object."""
    key: str
    size: int
    content_type: str = "application/octet-stream"
    etag: str = ""
    last_modified: float = 0.0
    metadata: Dict[str, str] = field(default_factory=dict)
    provider: str = ""


@dataclass
class StorageResult:
    """Result of a storage operation."""
    success: bool
    key: str
    provider: str
    size: int = 0
    etag: str = ""
    error: Optional[str] = None
    cost_estimate: float = 0.0
    latency_ms: float = 0.0


@dataclass
class ListResult:
    """Result of listing objects."""
    objects: List[StorageObject] = field(default_factory=list)
    total: int = 0
    truncated: bool = False
    provider: str = ""


# ── Abstract Base Provider ────────────────────────────────────────

class BaseStorageProvider(ABC):
    """Abstract storage provider interface."""

    name: str = "base"
    tier: ProviderTier = ProviderTier.LOCAL

    @abstractmethod
    async def put(self, bucket: str, key: str, data: bytes,
                  content_type: str = "application/octet-stream",
                  metadata: Optional[Dict[str, str]] = None) -> StorageResult:
        """Store an object."""
        ...

    @abstractmethod
    async def get(self, bucket: str, key: str) -> Optional[bytes]:
        """Retrieve an object. Returns None if not found."""
        ...

    @abstractmethod
    async def delete(self, bucket: str, key: str) -> StorageResult:
        """Delete an object."""
        ...

    @abstractmethod
    async def exists(self, bucket: str, key: str) -> bool:
        """Check if an object exists."""
        ...

    @abstractmethod
    async def list_objects(self, bucket: str, prefix: str = "",
                           limit: int = 1000) -> ListResult:
        """List objects in a bucket with optional prefix filter."""
        ...

    @abstractmethod
    async def head(self, bucket: str, key: str) -> Optional[StorageObject]:
        """Get object metadata without downloading content."""
        ...

    @abstractmethod
    async def create_bucket(self, bucket: str) -> bool:
        """Create a bucket/container. Returns True if created or already exists."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if this provider is currently available."""
        ...

    def _compute_etag(self, data: bytes) -> str:
        """Compute MD5 etag for data."""
        return hashlib.md5(data).hexdigest()


# ── Local Filesystem Provider ─────────────────────────────────────

class LocalFilesystemProvider(BaseStorageProvider):
    """
    Local filesystem storage provider.
    Tier: LOCAL (zero cost, no external dependencies)
    
    Stores objects as files on the local filesystem.
    Buckets are directories, keys are file paths within them.
    """

    name = "local_filesystem"
    tier = ProviderTier.LOCAL

    def __init__(self):
        self.base_path = Path(os.getenv(
            "STORAGE_LOCAL_PATH",
            "/data/infinity-storage"
        ))
        self._ensure_base_path()

    def _ensure_base_path(self):
        """Create base storage directory if it doesn't exist."""
        try:
            self.base_path.mkdir(parents=True, exist_ok=True)
        except OSError:
            # Fallback to temp directory if /data isn't writable
            self.base_path = Path(os.getenv("TMPDIR", "/tmp")) / "infinity-storage"
            self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, bucket: str, key: str) -> Path:
        """Resolve bucket/key to filesystem path (safe against traversal)."""
        bucket_path = self.base_path / bucket
        full_path = (bucket_path / key).resolve()
        # Prevent directory traversal attacks
        if not str(full_path).startswith(str(self.base_path.resolve())):
            raise ValueError(f"Path traversal detected: {key}")
        return full_path

    def _meta_path(self, bucket: str, key: str) -> Path:
        """Path for metadata sidecar file."""
        obj_path = self._resolve_path(bucket, key)
        return obj_path.parent / f".{obj_path.name}.meta"

    async def put(self, bucket: str, key: str, data: bytes,
                  content_type: str = "application/octet-stream",
                  metadata: Optional[Dict[str, str]] = None) -> StorageResult:
        start = time.monotonic()
        try:
            file_path = self._resolve_path(bucket, key)
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(data)

            # Write metadata sidecar
            import json
            meta = {
                "content_type": content_type,
                "metadata": metadata or {},
                "size": len(data),
                "etag": self._compute_etag(data),
                "created": time.time(),
            }
            self._meta_path(bucket, key).write_text(json.dumps(meta))

            latency = (time.monotonic() - start) * 1000
            record_provider_usage(self.name, {"operation": "put", "size": len(data)})
            return StorageResult(
                success=True, key=key, provider=self.name,
                size=len(data), etag=meta["etag"],
                cost_estimate=0.0, latency_ms=latency,
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            record_provider_error(self.name, str(e))
            return StorageResult(
                success=False, key=key, provider=self.name,
                error=str(e), latency_ms=latency,
            )

    async def get(self, bucket: str, key: str) -> Optional[bytes]:
        try:
            file_path = self._resolve_path(bucket, key)
            if file_path.exists():
                record_provider_usage(self.name, {"operation": "get", "key": key})
                return file_path.read_bytes()
            return None
        except Exception as e:
            record_provider_error(self.name, str(e))
            return None

    async def delete(self, bucket: str, key: str) -> StorageResult:
        start = time.monotonic()
        try:
            file_path = self._resolve_path(bucket, key)
            meta_file = self._meta_path(bucket, key)
            if file_path.exists():
                file_path.unlink()
            if meta_file.exists():
                meta_file.unlink()
            latency = (time.monotonic() - start) * 1000
            record_provider_usage(self.name, {"operation": "delete", "key": key})
            return StorageResult(
                success=True, key=key, provider=self.name,
                cost_estimate=0.0, latency_ms=latency,
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            record_provider_error(self.name, str(e))
            return StorageResult(
                success=False, key=key, provider=self.name,
                error=str(e), latency_ms=latency,
            )

    async def exists(self, bucket: str, key: str) -> bool:
        try:
            return self._resolve_path(bucket, key).exists()
        except Exception:
            return False

    async def list_objects(self, bucket: str, prefix: str = "",
                           limit: int = 1000) -> ListResult:
        import json
        try:
            bucket_path = self.base_path / bucket
            if not bucket_path.exists():
                return ListResult(provider=self.name)

            objects = []
            search_path = bucket_path / prefix if prefix else bucket_path
            if not search_path.exists():
                return ListResult(provider=self.name)

            for file_path in sorted(search_path.rglob("*")):
                if file_path.is_file() and not file_path.name.startswith("."):
                    rel_key = str(file_path.relative_to(bucket_path))
                    meta = {}
                    meta_path = file_path.parent / f".{file_path.name}.meta"
                    if meta_path.exists():
                        try:
                            meta = json.loads(meta_path.read_text())
                        except Exception:
                            pass

                    objects.append(StorageObject(
                        key=rel_key,
                        size=file_path.stat().st_size,
                        content_type=meta.get("content_type", "application/octet-stream"),
                        etag=meta.get("etag", ""),
                        last_modified=file_path.stat().st_mtime,
                        metadata=meta.get("metadata", {}),
                        provider=self.name,
                    ))
                    if len(objects) >= limit:
                        break

            truncated = len(objects) >= limit
            record_provider_usage(self.name, {"operation": "list", "count": len(objects)})
            return ListResult(
                objects=objects, total=len(objects),
                truncated=truncated, provider=self.name,
            )
        except Exception as e:
            record_provider_error(self.name, str(e))
            return ListResult(provider=self.name)

    async def head(self, bucket: str, key: str) -> Optional[StorageObject]:
        import json
        try:
            file_path = self._resolve_path(bucket, key)
            if not file_path.exists():
                return None

            meta = {}
            meta_path = self._meta_path(bucket, key)
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text())
                except Exception:
                    pass

            return StorageObject(
                key=key,
                size=file_path.stat().st_size,
                content_type=meta.get("content_type", "application/octet-stream"),
                etag=meta.get("etag", ""),
                last_modified=file_path.stat().st_mtime,
                metadata=meta.get("metadata", {}),
                provider=self.name,
            )
        except Exception:
            return None

    async def create_bucket(self, bucket: str) -> bool:
        try:
            (self.base_path / bucket).mkdir(parents=True, exist_ok=True)
            return True
        except Exception:
            return False

    async def is_available(self) -> bool:
        try:
            self._ensure_base_path()
            test_file = self.base_path / ".health_check"
            test_file.write_text("ok")
            test_file.unlink()
            return True
        except Exception:
            return False


# ── MinIO / S3-Compatible Provider ────────────────────────────────

class MinioS3Provider(BaseStorageProvider):
    """
    MinIO / S3-compatible storage provider.
    Tier: LOCAL (self-hosted) or FREE (MinIO cloud free tier)
    
    Works with any S3-compatible API: MinIO, Ceph, Garage,
    SeaweedFS, Wasabi, Backblaze B2, etc.
    """

    name = "minio_s3"
    tier = ProviderTier.LOCAL  # Self-hosted = zero cost

    def __init__(self):
        self.endpoint = os.getenv("S3_ENDPOINT", "http://localhost:9000")
        self.access_key = os.getenv("S3_ACCESS_KEY", "")
        self.secret_key = os.getenv("S3_SECRET_KEY", "")
        self.region = os.getenv("S3_REGION", "us-east-1")
        self.use_ssl = os.getenv("S3_USE_SSL", "false").lower() == "true"

        # Determine tier based on endpoint
        if "localhost" in self.endpoint or "127.0.0.1" in self.endpoint:
            self.tier = ProviderTier.LOCAL
        elif "b2" in self.endpoint.lower() or "backblaze" in self.endpoint.lower():
            self.tier = ProviderTier.FREE  # B2 has 10GB free
        elif "wasabi" in self.endpoint.lower():
            self.tier = ProviderTier.FREEMIUM
        else:
            self.tier = ProviderTier.FREEMIUM

    async def _get_client(self):
        """Get httpx client configured for S3 API."""
        import httpx
        return httpx.AsyncClient(
            base_url=self.endpoint,
            timeout=30.0,
            verify=self.use_ssl,
        )

    async def _s3_request(self, method: str, path: str,
                          data: Optional[bytes] = None,
                          headers: Optional[Dict] = None) -> Optional[Any]:
        """Make an S3 API request with AWS Signature V4 (simplified)."""
        # NOTE: In production, use proper AWS Sig V4 signing.
        # For MinIO with access keys, basic auth headers work.
        import httpx
        req_headers = headers or {}
        if self.access_key:
            # Simplified auth — production should use proper SigV4
            req_headers["Authorization"] = f"AWS {self.access_key}:{self.secret_key}"

        try:
            async with httpx.AsyncClient(
                base_url=self.endpoint, timeout=30.0
            ) as client:
                response = await client.request(
                    method, path, content=data, headers=req_headers
                )
                return response
        except Exception as e:
            logger.warning(f"S3 request failed: {e}")
            return None

    async def put(self, bucket: str, key: str, data: bytes,
                  content_type: str = "application/octet-stream",
                  metadata: Optional[Dict[str, str]] = None) -> StorageResult:
        start = time.monotonic()
        try:
            headers = {"Content-Type": content_type}
            if metadata:
                for k, v in metadata.items():
                    headers[f"x-amz-meta-{k}"] = v

            resp = await self._s3_request(
                "PUT", f"/{bucket}/{key}", data=data, headers=headers
            )
            latency = (time.monotonic() - start) * 1000

            if resp and resp.status_code in (200, 201):
                etag = resp.headers.get("ETag", self._compute_etag(data))
                record_provider_usage(self.name, {"operation": "put", "size": len(data)})
                return StorageResult(
                    success=True, key=key, provider=self.name,
                    size=len(data), etag=etag,
                    cost_estimate=0.0, latency_ms=latency,
                )
            else:
                error = f"S3 PUT failed: {resp.status_code if resp else 'no response'}"
                record_provider_error(self.name, error)
                return StorageResult(
                    success=False, key=key, provider=self.name,
                    error=error, latency_ms=latency,
                )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            record_provider_error(self.name, str(e))
            return StorageResult(
                success=False, key=key, provider=self.name,
                error=str(e), latency_ms=latency,
            )

    async def get(self, bucket: str, key: str) -> Optional[bytes]:
        try:
            resp = await self._s3_request("GET", f"/{bucket}/{key}")
            if resp and resp.status_code == 200:
                record_provider_usage(self.name, {"operation": "get", "key": key})
                return resp.content
            return None
        except Exception as e:
            record_provider_error(self.name, str(e))
            return None

    async def delete(self, bucket: str, key: str) -> StorageResult:
        start = time.monotonic()
        try:
            resp = await self._s3_request("DELETE", f"/{bucket}/{key}")
            latency = (time.monotonic() - start) * 1000
            if resp and resp.status_code in (200, 204):
                record_provider_usage(self.name, {"operation": "delete", "key": key})
                return StorageResult(
                    success=True, key=key, provider=self.name,
                    cost_estimate=0.0, latency_ms=latency,
                )
            error = f"S3 DELETE failed: {resp.status_code if resp else 'no response'}"
            return StorageResult(
                success=False, key=key, provider=self.name,
                error=error, latency_ms=latency,
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            record_provider_error(self.name, str(e))
            return StorageResult(
                success=False, key=key, provider=self.name,
                error=str(e), latency_ms=latency,
            )

    async def exists(self, bucket: str, key: str) -> bool:
        try:
            resp = await self._s3_request("HEAD", f"/{bucket}/{key}")
            return resp is not None and resp.status_code == 200
        except Exception:
            return False

    async def list_objects(self, bucket: str, prefix: str = "",
                           limit: int = 1000) -> ListResult:
        try:
            params = f"?list-type=2&max-keys={limit}"
            if prefix:
                params += f"&prefix={prefix}"
            resp = await self._s3_request("GET", f"/{bucket}{params}")
            if resp and resp.status_code == 200:
                # Parse XML response (simplified)
                import xml.etree.ElementTree as ET
                root = ET.fromstring(resp.text)
                ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
                objects = []
                for content in root.findall(".//s3:Contents", ns):
                    key_el = content.find("s3:Key", ns)
                    size_el = content.find("s3:Size", ns)
                    etag_el = content.find("s3:ETag", ns)
                    if key_el is not None:
                        objects.append(StorageObject(
                            key=key_el.text or "",
                            size=int(size_el.text) if size_el is not None else 0,
                            etag=etag_el.text.strip('"') if etag_el is not None else "",
                            provider=self.name,
                        ))
                # Also try without namespace (MinIO sometimes omits it)
                if not objects:
                    for content in root.findall(".//Contents"):
                        key_el = content.find("Key")
                        size_el = content.find("Size")
                        etag_el = content.find("ETag")
                        if key_el is not None:
                            objects.append(StorageObject(
                                key=key_el.text or "",
                                size=int(size_el.text) if size_el is not None else 0,
                                etag=etag_el.text.strip('"') if etag_el is not None else "",
                                provider=self.name,
                            ))
                record_provider_usage(self.name, {"operation": "list", "count": len(objects)})
                return ListResult(
                    objects=objects, total=len(objects),
                    truncated=len(objects) >= limit, provider=self.name,
                )
            return ListResult(provider=self.name)
        except Exception as e:
            record_provider_error(self.name, str(e))
            return ListResult(provider=self.name)

    async def head(self, bucket: str, key: str) -> Optional[StorageObject]:
        try:
            resp = await self._s3_request("HEAD", f"/{bucket}/{key}")
            if resp and resp.status_code == 200:
                return StorageObject(
                    key=key,
                    size=int(resp.headers.get("Content-Length", 0)),
                    content_type=resp.headers.get("Content-Type", "application/octet-stream"),
                    etag=resp.headers.get("ETag", "").strip('"'),
                    provider=self.name,
                )
            return None
        except Exception:
            return None

    async def create_bucket(self, bucket: str) -> bool:
        try:
            resp = await self._s3_request("PUT", f"/{bucket}")
            return resp is not None and resp.status_code in (200, 409)  # 409 = already exists
        except Exception:
            return False

    async def is_available(self) -> bool:
        if not self.access_key:
            return False
        try:
            resp = await self._s3_request("GET", "/")
            return resp is not None and resp.status_code in (200, 403)
        except Exception:
            return False


# ── Unified Storage Gateway ───────────────────────────────────────

# Provider instances (lazy-initialized)
_providers: Dict[str, BaseStorageProvider] = {}


def _init_providers():
    """Initialize and register all storage providers."""
    global _providers
    if _providers:
        return

    # 1. Local filesystem — always available, zero cost
    local = LocalFilesystemProvider()
    _providers["local_filesystem"] = local
    register_provider(
        name="local_filesystem",
        category=ProviderCategory.STORAGE,
        tier=ProviderTier.LOCAL,
        config={"base_path": str(local.base_path)},
    )

    # 2. MinIO / S3-compatible — available if configured
    if os.getenv("S3_ENDPOINT") or os.getenv("S3_ACCESS_KEY"):
        minio = MinioS3Provider()
        _providers["minio_s3"] = minio
        register_provider(
            name="minio_s3",
            category=ProviderCategory.STORAGE,
            tier=minio.tier,
            config={"endpoint": minio.endpoint, "region": minio.region},
        )

    logger.info(f"Storage providers initialized: {list(_providers.keys())}")


async def storage_put(bucket: str, key: str, data: bytes,
                      content_type: str = "application/octet-stream",
                      metadata: Optional[Dict[str, str]] = None,
                      zero_cost_only: bool = True,
                      preferred_provider: Optional[str] = None) -> StorageResult:
    """
    Store an object using the best available provider.
    
    Auto-failover: tries preferred → best available → local filesystem.
    """
    _init_providers()

    # Build provider priority list
    candidates: List[BaseStorageProvider] = []

    if preferred_provider and preferred_provider in _providers:
        candidates.append(_providers[preferred_provider])

    # Sort remaining by tier priority
    tier_order = [ProviderTier.LOCAL, ProviderTier.FREE, ProviderTier.FREEMIUM, ProviderTier.PAID]
    for tier in tier_order:
        if zero_cost_only and tier in (ProviderTier.PAID, ProviderTier.ENTERPRISE):
            continue
        for name, provider in _providers.items():
            if provider.tier == tier and provider not in candidates:
                candidates.append(provider)

    # Try each provider in order
    for provider in candidates:
        if await provider.is_available():
            result = await provider.put(bucket, key, data, content_type, metadata)
            if result.success:
                return result
            logger.warning(f"Storage PUT failed on {provider.name}: {result.error}")

    return StorageResult(
        success=False, key=key, provider="none",
        error="All storage providers failed or unavailable",
    )


async def storage_get(bucket: str, key: str,
                      preferred_provider: Optional[str] = None) -> Optional[bytes]:
    """Retrieve an object from the best available provider."""
    _init_providers()

    # Try preferred first
    if preferred_provider and preferred_provider in _providers:
        data = await _providers[preferred_provider].get(bucket, key)
        if data is not None:
            return data

    # Try all providers
    for provider in _providers.values():
        if await provider.is_available():
            data = await provider.get(bucket, key)
            if data is not None:
                return data

    return None


async def storage_delete(bucket: str, key: str,
                         preferred_provider: Optional[str] = None) -> StorageResult:
    """Delete an object from the best available provider."""
    _init_providers()

    if preferred_provider and preferred_provider in _providers:
        return await _providers[preferred_provider].delete(bucket, key)

    # Delete from all providers that have it
    last_result = StorageResult(success=False, key=key, provider="none", error="No providers")
    for provider in _providers.values():
        if await provider.is_available() and await provider.exists(bucket, key):
            last_result = await provider.delete(bucket, key)

    return last_result


async def storage_exists(bucket: str, key: str) -> bool:
    """Check if an object exists in any provider."""
    _init_providers()
    for provider in _providers.values():
        if await provider.is_available() and await provider.exists(bucket, key):
            return True
    return False


async def storage_list(bucket: str, prefix: str = "",
                       limit: int = 1000,
                       preferred_provider: Optional[str] = None) -> ListResult:
    """List objects from the best available provider."""
    _init_providers()

    if preferred_provider and preferred_provider in _providers:
        return await _providers[preferred_provider].list_objects(bucket, prefix, limit)

    for provider in _providers.values():
        if await provider.is_available():
            result = await provider.list_objects(bucket, prefix, limit)
            if result.objects or result.total >= 0:
                return result

    return ListResult()


async def get_available_storage_providers() -> List[Dict[str, Any]]:
    """List all registered storage providers and their status."""
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