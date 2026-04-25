"""Cooperative cancellation for long-running jobs.

Pattern:
    ctx = get_cancellation_context(job_id)
    for chunk in big_loop:
        ctx.raise_if_cancelled()
        ...

For subprocess-based jobs:
    proc = await asyncio.create_subprocess_exec(...)
    ctx.bind_subprocess(proc)  # killed on cancel
"""

import asyncio
import logging
import os
import signal
import sys

logger = logging.getLogger(__name__)


class JobCancelled(Exception):
    """Raised when cooperative cancellation is detected."""


class CancellationContext:
    """Per-job cancellation flag + bound subprocess kill list."""

    def __init__(self, job_id: str) -> None:
        self.job_id = job_id
        self._cancelled = False
        self._subprocesses: list[asyncio.subprocess.Process] = []

    def cancel(self) -> None:
        """Mark cancelled AND kill any bound subprocesses (their tree on POSIX)."""
        self._cancelled = True
        for proc in list(self._subprocesses):
            try:
                if proc.returncode is None:
                    if sys.platform == "win32":
                        # taskkill /T terminates the whole process tree
                        try:
                            import subprocess as _sp
                            _sp.run(
                                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                                capture_output=True,
                                timeout=5,
                            )
                        except Exception:
                            try:
                                proc.kill()
                            except Exception:
                                pass
                    else:
                        try:
                            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                        except Exception:
                            try:
                                proc.kill()
                            except Exception:
                                pass
            except Exception as e:
                logger.debug("subprocess kill error: %s", e)
        logger.info("Job %s cancelled", self.job_id[:8])

    @property
    def cancelled(self) -> bool:
        return self._cancelled

    def raise_if_cancelled(self) -> None:
        if self._cancelled:
            raise JobCancelled(f"job {self.job_id} cancelled")

    def bind_subprocess(self, proc: asyncio.subprocess.Process) -> None:
        self._subprocesses.append(proc)


_contexts: dict[str, CancellationContext] = {}


def get_cancellation_context(job_id: str) -> CancellationContext:
    ctx = _contexts.get(job_id)
    if ctx is None:
        ctx = CancellationContext(job_id)
        _contexts[job_id] = ctx
    return ctx


def cancel_job(job_id: str) -> bool:
    """External signal: cancel a running job. Returns True if a context existed."""
    ctx = _contexts.get(job_id)
    if ctx is None:
        return False
    ctx.cancel()
    return True


def drop_context(job_id: str) -> None:
    """Clean up when job finishes."""
    _contexts.pop(job_id, None)
