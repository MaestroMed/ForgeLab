"""Retry decorator for transient failures."""

import asyncio
import functools
import logging
from typing import Callable, TypeVar

T = TypeVar("T")
logger = logging.getLogger(__name__)


def async_retry(
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    exceptions: tuple = (Exception,),
):
    """Retry an async function on transient failures with exponential backoff."""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            delay = initial_delay
            last_exc: Exception | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exc = e
                    if attempt >= max_attempts:
                        logger.error(
                            "All %d attempts failed for %s: %s",
                            max_attempts, func.__name__, e,
                        )
                        raise
                    logger.warning(
                        "Attempt %d/%d for %s failed (%s), retrying in %.1fs",
                        attempt, max_attempts, func.__name__, e, delay,
                    )
                    await asyncio.sleep(delay)
                    delay *= backoff_factor
            raise last_exc  # type: ignore
        return wrapper
    return decorator
