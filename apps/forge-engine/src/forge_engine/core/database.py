"""Database configuration and session management."""

import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from forge_engine.core.config import settings

logger = logging.getLogger(__name__)

# Create async engine
DATABASE_URL = f"sqlite+aiosqlite:///{settings.DATABASE_PATH}"
engine = create_async_engine(
    DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
)

# Session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""
    pass


async def _ensure_jobs_payload_column(conn) -> None:
    """Backfill the jobs.payload column on pre-existing SQLite databases.

    SQLAlchemy's create_all is idempotent for table creation but does not alter
    existing tables, so a DB created before `payload` was introduced won't have
    the column even after model updates. ALTER TABLE ADD COLUMN is cheap on
    SQLite (no table rewrite), so we detect and apply it at startup.
    """
    from sqlalchemy import text

    result = await conn.execute(text("PRAGMA table_info(jobs)"))
    columns = {row[1] for row in result.fetchall()}
    if "payload" not in columns:
        logger.info("Adding missing jobs.payload column (lightweight migration)")
        await conn.execute(text("ALTER TABLE jobs ADD COLUMN payload JSON"))


async def init_db() -> None:
    """Initialize the database, creating tables if needed."""
    from forge_engine.models import project, job, template, profile

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_jobs_payload_column(conn)

    logger.info("Database tables created/verified")


async def close_db() -> None:
    """Close database connections."""
    await engine.dispose()
    logger.info("Database connections closed")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()









