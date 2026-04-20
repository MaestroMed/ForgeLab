"""Database configuration and session management."""

import logging
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from forge_engine.core.config import settings

logger = logging.getLogger(__name__)

# Create async engine
DATABASE_URL = f"sqlite+aiosqlite:///{settings.DATABASE_PATH}"
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Disabled SQL echo to avoid flooding logs and blocking requests
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


async def _add_missing_columns() -> None:
    """Best-effort column addition for SQLite — lightweight migration.

    SQLAlchemy's ``create_all`` only creates missing tables, not missing
    columns on existing tables. For simple additive changes we issue raw
    ``ALTER TABLE`` statements and swallow the error when the column is
    already present.
    """
    migrations = [
        # (table, column, ddl)
        ("projects", "is_pinned", "ALTER TABLE projects ADD COLUMN is_pinned BOOLEAN DEFAULT 0"),
    ]

    async with engine.begin() as conn:
        for table, column, ddl in migrations:
            try:
                await conn.execute(text(ddl))
                logger.info("Added %s column to %s", column, table)
            except Exception as exc:
                # Most common cause: column already exists. Log at debug so
                # normal startup stays quiet, but surface genuine errors.
                logger.debug("Skipped migration %s.%s: %s", table, column, exc)


async def init_db() -> None:
    """Initialize the database, creating tables if needed."""
    # Import all models so their tables are registered with Base.metadata
    from forge_engine.models import (  # noqa: F401
        artifact,
        channel,
        job,
        profile,
        project,
        review,
        segment,
        template,
    )
    from forge_engine.models.user import User  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Best-effort additive migrations for existing DBs
    await _add_missing_columns()

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









