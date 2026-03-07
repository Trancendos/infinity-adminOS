# database.py — Multi-Dialect Async Database Setup
# ═══════════════════════════════════════════════════════════════════
# Phase 20: No PostgreSQL Lock-In
#
# Supported backends (via single DATABASE_URL env var):
# 1. SQLite:      sqlite+aiosqlite:///./data.db       (dev/edge)
# 2. PostgreSQL:  postgresql+asyncpg://user:pass@host/db (production)
# 3. LibSQL:      sqlite+aiosqlite:///./data.db        (Turso edge)
#
# The engine auto-detects the dialect and configures accordingly.
# Pool settings only apply to poolable backends (PostgreSQL).
# SQLite uses NullPool (single connection, no pooling).
#
# 2060 Standard: Zero Lock-In, Dialect-Agnostic, Future-Proof
# ═══════════════════════════════════════════════════════════════════

import os
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from contextlib import asynccontextmanager

logger = logging.getLogger("infinity-os.database")

# ── Database URL Resolution ───────────────────────────────────────
# Priority: DATABASE_URL env var → dialect-specific env vars → default

def _resolve_database_url() -> str:
    """Resolve database URL from environment with multi-dialect support."""
    url = os.getenv("DATABASE_URL")
    if url:
        # Handle common URL format issues
        # Heroku/Railway use postgres:// but asyncpg needs postgresql+asyncpg://
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and "+asyncpg" not in url:
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    # Check dialect-specific env vars
    sqlite_path = os.getenv("SQLITE_PATH")
    if sqlite_path:
        return f"sqlite+aiosqlite:///{sqlite_path}"

    pg_host = os.getenv("PG_HOST", os.getenv("PGHOST"))
    if pg_host:
        pg_user = os.getenv("PG_USER", os.getenv("PGUSER", "infinity_os"))
        pg_pass = os.getenv("PG_PASSWORD", os.getenv("PGPASSWORD", "secure_password"))
        pg_db = os.getenv("PG_DATABASE", os.getenv("PGDATABASE", "infinity_os"))
        pg_port = os.getenv("PG_PORT", os.getenv("PGPORT", "5432"))
        return f"postgresql+asyncpg://{pg_user}:{pg_pass}@{pg_host}:{pg_port}/{pg_db}"

    libsql_url = os.getenv("LIBSQL_URL", os.getenv("TURSO_DATABASE_URL"))
    if libsql_url:
        # LibSQL/Turso uses HTTP protocol, but for local dev we use SQLite
        local_path = os.getenv("LIBSQL_LOCAL_PATH", "./data/libsql.db")
        return f"sqlite+aiosqlite:///{local_path}"

    # Default: PostgreSQL for production-like environments
    env = os.getenv("ENVIRONMENT", "development")
    if env in ("production", "staging"):
        return "postgresql+asyncpg://infinity_os:secure_password@localhost/infinity_os"

    # Development default: SQLite (zero cost, zero setup)
    return "sqlite+aiosqlite:///./data/infinity_dev.db"


DATABASE_URL = _resolve_database_url()

# ── Dialect Detection ─────────────────────────────────────────────

def _detect_dialect(url: str) -> str:
    """Detect database dialect from URL."""
    if "sqlite" in url:
        return "sqlite"
    elif "postgresql" in url or "postgres" in url:
        return "postgresql"
    elif "mysql" in url or "mariadb" in url:
        return "mysql"
    return "unknown"


DB_DIALECT = _detect_dialect(DATABASE_URL)

# ── Engine Configuration ──────────────────────────────────────────

def _build_engine_kwargs(url: str, dialect: str) -> dict:
    """Build engine kwargs based on dialect."""
    kwargs = {
        "echo": os.getenv("SQL_ECHO", "false").lower() == "true",
        "future": True,
    }

    if dialect == "sqlite":
        # SQLite: NullPool (no connection pooling), WAL mode for concurrency
        kwargs["poolclass"] = NullPool
        # Enable WAL mode and foreign keys via connect_args
        kwargs["connect_args"] = {"check_same_thread": False}
    elif dialect == "postgresql":
        # PostgreSQL: Connection pooling with health checks
        kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "20"))
        kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "0"))
        kwargs["pool_pre_ping"] = True
        kwargs["pool_recycle"] = int(os.getenv("DB_POOL_RECYCLE", "3600"))
    else:
        # Generic: minimal config
        kwargs["pool_pre_ping"] = True

    return kwargs


_engine_kwargs = _build_engine_kwargs(DATABASE_URL, DB_DIALECT)

# Create async engine
engine = create_async_engine(DATABASE_URL, **_engine_kwargs)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

logger.info(f"Database configured: dialect={DB_DIALECT}, url={DATABASE_URL[:50]}...")


# ── FastAPI Dependency ────────────────────────────────────────────

async def get_db_session():
    """Dependency for getting database session (FastAPI Depends)"""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


# ── Lifecycle ─────────────────────────────────────────────────────

async def init_db():
    """Initialize database and create tables."""
    from models import Base
    # Also import Phase 20 models to ensure their tables are created
    try:
        from models_phase20 import DomainDocument, DomainAuditEntry, DomainCounter
    except ImportError:
        pass

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # SQLite-specific: enable WAL mode for better concurrency
    if DB_DIALECT == "sqlite":
        async with engine.begin() as conn:
            await conn.execute(
                __import__("sqlalchemy").text("PRAGMA journal_mode=WAL")
            )
            await conn.execute(
                __import__("sqlalchemy").text("PRAGMA foreign_keys=ON")
            )

    logger.info(f"✅ Database initialized successfully (dialect={DB_DIALECT})")


async def close_db():
    """Close database connection pool."""
    await engine.dispose()
    logger.info("Database connection pool closed")


@asynccontextmanager
async def get_db_context():
    """Context manager for database operations outside of FastAPI request cycle."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Health Check ──────────────────────────────────────────────────

async def check_db_health() -> dict:
    """Check database connectivity and return health info."""
    try:
        async with async_session_maker() as session:
            from sqlalchemy import text
            result = await session.execute(text("SELECT 1"))
            result.scalar()
            return {
                "status": "healthy",
                "dialect": DB_DIALECT,
                "url_prefix": DATABASE_URL[:30] + "...",
            }
    except Exception as e:
        return {
            "status": "unhealthy",
            "dialect": DB_DIALECT,
            "error": str(e),
        }