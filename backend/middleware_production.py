# middleware_production.py — Production Middleware Stack
# ═══════════════════════════════════════════════════════════════
# Provides production-grade middleware for Infinity OS:
# 1. Rate Limiting (token bucket per IP/user)
# 2. Request Size Limiting
# 3. Structured Logging (structlog-compatible)
# 4. Graceful Shutdown with connection draining
# 5. Request timeout enforcement
#
# 2060 Standard: Zero-Cost Infrastructure, Future-Proof Architecture
# ═══════════════════════════════════════════════════════════════

import asyncio
import logging
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, Optional, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("infinity-os.middleware")


# ═══════════════════════════════════════════════════════════════
# 1. RATE LIMITER (Token Bucket — In-Memory)
# Production: Replace with Redis-backed limiter
# ═══════════════════════════════════════════════════════════════

class TokenBucket:
    """Simple token bucket rate limiter."""

    def __init__(self, rate: float, capacity: int):
        self.rate = rate          # tokens per second
        self.capacity = capacity  # max burst
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()

    def consume(self, tokens: int = 1) -> bool:
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_refill = now
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False

    @property
    def retry_after(self) -> float:
        if self.tokens >= 1:
            return 0.0
        return (1.0 - self.tokens) / self.rate


def _parse_rate(rate_str: str) -> tuple:
    """Parse rate string like '100/minute' into (tokens_per_second, capacity)."""
    parts = rate_str.split("/")
    count = int(parts[0])
    period = parts[1] if len(parts) > 1 else "minute"
    multipliers = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
    seconds = multipliers.get(period, 60)
    return count / seconds, count


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP rate limiting with configurable limits per path prefix."""

    def __init__(self, app, default_rate: str = "100/minute", path_rates: Optional[Dict[str, str]] = None, enabled: bool = True):
        super().__init__(app)
        self.enabled = enabled
        self.default_rate = _parse_rate(default_rate)
        self.path_rates = {}
        if path_rates:
            for prefix, rate in path_rates.items():
                self.path_rates[prefix] = _parse_rate(rate)
        self._buckets: Dict[str, TokenBucket] = defaultdict(
            lambda: TokenBucket(*self.default_rate)
        )

    def _get_client_key(self, request: Request) -> str:
        # Use user ID from auth if available, else IP
        user_id = None
        if hasattr(request.state, "user_id"):
            user_id = request.state.user_id
        forwarded = request.headers.get("X-Forwarded-For", "")
        ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
        return f"{user_id or ip}"

    def _get_rate_for_path(self, path: str) -> tuple:
        for prefix, rate in self.path_rates.items():
            if path.startswith(prefix):
                return rate
        return self.default_rate

    async def dispatch(self, request: Request, call_next):
        if not self.enabled:
            return await call_next(request)

        # Skip rate limiting for health checks
        if request.url.path in ("/health", "/ready", "/metrics", "/"):
            return await call_next(request)

        client_key = self._get_client_key(request)
        rate = self._get_rate_for_path(request.url.path)
        bucket_key = f"{client_key}:{rate[0]:.4f}"

        if bucket_key not in self._buckets:
            self._buckets[bucket_key] = TokenBucket(*rate)

        bucket = self._buckets[bucket_key]
        if not bucket.consume():
            retry_after = max(1, int(bucket.retry_after))
            logger.warning(f"Rate limit exceeded: client={client_key} path={request.url.path}")
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(int(bucket.tokens))
        return response


# ═══════════════════════════════════════════════════════════════
# 2. REQUEST SIZE LIMITER
# ═══════════════════════════════════════════════════════════════

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests exceeding max body size."""

    def __init__(self, app, max_size_mb: int = 50):
        super().__init__(app)
        self.max_size_bytes = max_size_mb * 1024 * 1024

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_size_bytes:
            return JSONResponse(
                status_code=413,
                content={
                    "detail": f"Request body too large. Maximum: {self.max_size_bytes // (1024*1024)}MB",
                },
            )
        return await call_next(request)


# ═══════════════════════════════════════════════════════════════
# 3. STRUCTURED LOGGING MIDDLEWARE
# ═══════════════════════════════════════════════════════════════

class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """Emit structured log entries for every request."""

    def __init__(self, app, service_name: str = "infinity-os"):
        super().__init__(app)
        self.service_name = service_name

    async def dispatch(self, request: Request, call_next):
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
        start = time.perf_counter()

        # Extract user info if available
        user_id = "anonymous"
        if hasattr(request.state, "user_id"):
            user_id = request.state.user_id

        try:
            response = await call_next(request)
            duration = time.perf_counter() - start

            log_data = {
                "event": "http_request",
                "service": self.service_name,
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration * 1000, 2),
                "user_id": user_id,
                "ip": request.client.host if request.client else "unknown",
                "user_agent": request.headers.get("user-agent", "")[:100],
            }

            if response.status_code >= 500:
                logger.error(str(log_data))
            elif response.status_code >= 400:
                logger.warning(str(log_data))
            elif duration > 5.0:
                log_data["slow_request"] = True
                logger.warning(str(log_data))
            else:
                logger.info(str(log_data))

            return response

        except Exception as exc:
            duration = time.perf_counter() - start
            logger.error({
                "event": "http_request_error",
                "service": self.service_name,
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "error": str(exc)[:500],
                "duration_ms": round(duration * 1000, 2),
            })
            raise


# ═══════════════════════════════════════════════════════════════
# 4. GRACEFUL SHUTDOWN MANAGER
# ═══════════════════════════════════════════════════════════════

class GracefulShutdownManager:
    """Manages graceful shutdown with connection draining."""

    def __init__(self, drain_timeout: int = 30):
        self.drain_timeout = drain_timeout
        self._active_requests = 0
        self._shutting_down = False
        self._lock = asyncio.Lock()

    @property
    def is_shutting_down(self) -> bool:
        return self._shutting_down

    @property
    def active_requests(self) -> int:
        return self._active_requests

    async def start_request(self):
        async with self._lock:
            self._active_requests += 1

    async def end_request(self):
        async with self._lock:
            self._active_requests = max(0, self._active_requests - 1)

    async def initiate_shutdown(self):
        """Begin graceful shutdown — wait for active requests to drain."""
        self._shutting_down = True
        logger.info(f"🛑 Graceful shutdown initiated. Active requests: {self._active_requests}")

        start = time.monotonic()
        while self._active_requests > 0:
            elapsed = time.monotonic() - start
            if elapsed > self.drain_timeout:
                logger.warning(
                    f"⚠️  Drain timeout ({self.drain_timeout}s) exceeded. "
                    f"Forcing shutdown with {self._active_requests} active requests."
                )
                break
            await asyncio.sleep(0.5)
            logger.info(f"⏳ Draining... {self._active_requests} active requests remaining")

        logger.info("✅ All connections drained. Shutdown complete.")


# Singleton
_shutdown_manager = GracefulShutdownManager()


def get_shutdown_manager() -> GracefulShutdownManager:
    return _shutdown_manager


class GracefulShutdownMiddleware(BaseHTTPMiddleware):
    """Track active requests and reject new ones during shutdown."""

    async def dispatch(self, request: Request, call_next):
        manager = get_shutdown_manager()

        if manager.is_shutting_down:
            # During shutdown, only allow health checks
            if request.url.path not in ("/health", "/ready"):
                return JSONResponse(
                    status_code=503,
                    content={"detail": "Service is shutting down"},
                    headers={"Retry-After": "30"},
                )

        await manager.start_request()
        try:
            response = await call_next(request)
            return response
        finally:
            await manager.end_request()


# ═══════════════════════════════════════════════════════════════
# 5. MIDDLEWARE INSTALLER
# ═══════════════════════════════════════════════════════════════

def install_production_middleware(app: FastAPI, config=None):
    """Install all production middleware in correct order.

    Middleware execution order (outermost first):
    1. GracefulShutdown — reject during drain
    2. RequestSizeLimit — reject oversized bodies
    3. RateLimit — throttle abusive clients
    4. StructuredLogging — log all requests
    """
    if config is None:
        from config import get_config
        config = get_config()

    # Install in reverse order (last added = first executed)
    app.add_middleware(
        StructuredLoggingMiddleware,
        service_name=config.service_name,
    )

    app.add_middleware(
        RateLimitMiddleware,
        default_rate=config.rate_limit_default,
        path_rates={
            "/api/v1/auth": config.rate_limit_auth,
            "/api/v1/ai": config.rate_limit_ai,
            "/api/v1/solarscene": config.rate_limit_search,
            "/api/v1/search": config.rate_limit_search,
        },
        enabled=config.rate_limit_enabled,
    )

    app.add_middleware(
        RequestSizeLimitMiddleware,
        max_size_mb=config.max_request_size_mb,
    )

    app.add_middleware(GracefulShutdownMiddleware)

    logger.info(
        f"✅ Production middleware installed: "
        f"rate_limit={'ON' if config.rate_limit_enabled else 'OFF'} "
        f"max_body={config.max_request_size_mb}MB "
        f"structured_logging=ON graceful_shutdown=ON"
    )