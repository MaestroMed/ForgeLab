"""Intelligent Caching System for Analysis Results."""

import asyncio
import hashlib
import json
import logging
import os
import pickle
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, TypeVar, Generic

logger = logging.getLogger(__name__)

T = TypeVar('T')


@dataclass
class CacheEntry(Generic[T]):
    """A cached analysis result."""
    key: str
    value: T
    created_at: float
    expires_at: Optional[float] = None
    file_hash: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def is_expired(self) -> bool:
        """Check if cache entry has expired."""
        if self.expires_at is None:
            return False
        return time.time() > self.expires_at


class CacheType:
    """Types of cached data."""
    TRANSCRIPTION = "transcription"
    SCENE_DETECTION = "scene_detection"
    AUDIO_ANALYSIS = "audio_analysis"
    FACE_DETECTION = "face_detection"
    EMOTION_ANALYSIS = "emotion_analysis"
    LLM_SCORES = "llm_scores"
    SEGMENTS = "segments"
    VIRALITY_SCORES = "virality_scores"


class IntelligentCache:
    """
    Intelligent caching system for analysis results.
    
    Features:
    - File hash-based invalidation
    - TTL (time-to-live) support
    - Memory + disk hybrid caching
    - Automatic cleanup
    - Cache warming
    """
    
    # Default TTL (in seconds) per cache type
    DEFAULT_TTL = {
        CacheType.TRANSCRIPTION: None,  # Never expires (file-based invalidation)
        CacheType.SCENE_DETECTION: None,
        CacheType.AUDIO_ANALYSIS: None,
        CacheType.FACE_DETECTION: None,
        CacheType.EMOTION_ANALYSIS: None,
        CacheType.LLM_SCORES: 86400,  # 24 hours (LLM might improve)
        CacheType.SEGMENTS: None,
        CacheType.VIRALITY_SCORES: 86400,  # 24 hours
    }
    
    # Memory cache size limits (number of entries)
    MEMORY_CACHE_SIZE = 100
    
    _instance: Optional["IntelligentCache"] = None
    
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Memory cache (LRU-style)
        self._memory_cache: Dict[str, CacheEntry] = {}
        self._access_order: List[str] = []
        
        # Stats
        self._hits = 0
        self._misses = 0
    
    @classmethod
    def get_instance(cls, cache_dir: Optional[Path] = None) -> "IntelligentCache":
        """Get singleton instance."""
        if cls._instance is None:
            if cache_dir is None:
                from forge_engine.core.config import settings
                cache_dir = settings.LIBRARY_PATH / ".cache"
            cls._instance = cls(cache_dir)
        return cls._instance
    
    def _generate_key(
        self,
        cache_type: str,
        project_id: str,
        file_path: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> str:
        """Generate a unique cache key."""
        parts = [cache_type, project_id]
        
        if params:
            # Sort params for consistent hashing
            param_str = json.dumps(params, sort_keys=True)
            parts.append(hashlib.md5(param_str.encode()).hexdigest()[:8])
        
        return ":".join(parts)
    
    def _get_file_hash(self, file_path: str) -> Optional[str]:
        """Get hash of a file for cache invalidation."""
        try:
            path = Path(file_path)
            if not path.exists():
                return None
            
            # Use file size + mtime as quick hash
            stat = path.stat()
            quick_hash = f"{stat.st_size}:{stat.st_mtime}"
            return hashlib.md5(quick_hash.encode()).hexdigest()
        except Exception:
            return None
    
    def _get_disk_path(self, key: str) -> Path:
        """Get disk path for a cache key."""
        # Sanitize key for filesystem
        safe_key = key.replace(":", "_").replace("/", "_")
        return self.cache_dir / f"{safe_key}.cache"
    
    async def get(
        self,
        cache_type: str,
        project_id: str,
        file_path: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        validate_file: bool = True
    ) -> Optional[Any]:
        """
        Get a cached value.
        
        Args:
            cache_type: Type of cache (e.g., CacheType.TRANSCRIPTION)
            project_id: Project ID
            file_path: Optional file path for hash validation
            params: Optional parameters used in analysis
            validate_file: Whether to validate file hash
        
        Returns:
            Cached value or None if not found/invalid
        """
        key = self._generate_key(cache_type, project_id, file_path, params)
        
        # Check memory cache first
        if key in self._memory_cache:
            entry = self._memory_cache[key]
            
            # Check expiration
            if entry.is_expired:
                del self._memory_cache[key]
                self._misses += 1
                return None
            
            # Validate file hash
            if validate_file and file_path and entry.file_hash:
                current_hash = self._get_file_hash(file_path)
                if current_hash != entry.file_hash:
                    del self._memory_cache[key]
                    self._misses += 1
                    return None
            
            # Update access order
            if key in self._access_order:
                self._access_order.remove(key)
            self._access_order.append(key)
            
            self._hits += 1
            logger.debug(f"Cache hit (memory): {key}")
            return entry.value
        
        # Check disk cache
        disk_path = self._get_disk_path(key)
        if disk_path.exists():
            try:
                with open(disk_path, 'rb') as f:
                    entry = pickle.load(f)
                
                # Check expiration
                if entry.is_expired:
                    disk_path.unlink(missing_ok=True)
                    self._misses += 1
                    return None
                
                # Validate file hash
                if validate_file and file_path and entry.file_hash:
                    current_hash = self._get_file_hash(file_path)
                    if current_hash != entry.file_hash:
                        disk_path.unlink(missing_ok=True)
                        self._misses += 1
                        return None
                
                # Load into memory cache
                self._memory_cache[key] = entry
                self._access_order.append(key)
                self._evict_if_needed()
                
                self._hits += 1
                logger.debug(f"Cache hit (disk): {key}")
                return entry.value
                
            except Exception as e:
                logger.warning(f"Failed to load cache {key}: {e}")
                disk_path.unlink(missing_ok=True)
        
        self._misses += 1
        return None
    
    async def set(
        self,
        cache_type: str,
        project_id: str,
        value: Any,
        file_path: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        ttl: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Set a cached value.
        
        Args:
            cache_type: Type of cache
            project_id: Project ID
            value: Value to cache
            file_path: Optional file path for hash validation
            params: Optional parameters
            ttl: Time-to-live in seconds (None = use default)
            metadata: Optional metadata to store
        """
        key = self._generate_key(cache_type, project_id, file_path, params)
        
        # Determine TTL
        if ttl is None:
            ttl = self.DEFAULT_TTL.get(cache_type)
        
        expires_at = None
        if ttl is not None:
            expires_at = time.time() + ttl
        
        # Get file hash
        file_hash = None
        if file_path:
            file_hash = self._get_file_hash(file_path)
        
        entry = CacheEntry(
            key=key,
            value=value,
            created_at=time.time(),
            expires_at=expires_at,
            file_hash=file_hash,
            metadata=metadata or {}
        )
        
        # Store in memory
        self._memory_cache[key] = entry
        if key in self._access_order:
            self._access_order.remove(key)
        self._access_order.append(key)
        self._evict_if_needed()
        
        # Store on disk (async)
        disk_path = self._get_disk_path(key)
        try:
            with open(disk_path, 'wb') as f:
                pickle.dump(entry, f)
            logger.debug(f"Cached: {key}")
        except Exception as e:
            logger.warning(f"Failed to write cache {key}: {e}")
    
    def _evict_if_needed(self):
        """Evict oldest entries if memory cache is full."""
        while len(self._memory_cache) > self.MEMORY_CACHE_SIZE:
            if self._access_order:
                oldest_key = self._access_order.pop(0)
                if oldest_key in self._memory_cache:
                    del self._memory_cache[oldest_key]
    
    async def invalidate(
        self,
        cache_type: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> int:
        """
        Invalidate cache entries.
        
        Args:
            cache_type: Specific cache type to invalidate (None = all)
            project_id: Specific project to invalidate (None = all)
        
        Returns:
            Number of entries invalidated
        """
        count = 0
        
        # Build pattern to match
        if cache_type and project_id:
            pattern = f"{cache_type}:{project_id}"
        elif cache_type:
            pattern = f"{cache_type}:"
        elif project_id:
            pattern = f":{project_id}"
        else:
            pattern = None
        
        # Invalidate memory cache
        keys_to_delete = []
        for key in self._memory_cache:
            if pattern is None or pattern in key:
                keys_to_delete.append(key)
        
        for key in keys_to_delete:
            del self._memory_cache[key]
            if key in self._access_order:
                self._access_order.remove(key)
            count += 1
        
        # Invalidate disk cache
        for cache_file in self.cache_dir.glob("*.cache"):
            key = cache_file.stem.replace("_", ":")
            if pattern is None or pattern in key:
                cache_file.unlink(missing_ok=True)
                count += 1
        
        logger.info(f"Invalidated {count} cache entries")
        return count
    
    async def cleanup(self, max_age_days: int = 30) -> int:
        """
        Clean up old cache entries.
        
        Args:
            max_age_days: Maximum age of cache entries
        
        Returns:
            Number of entries cleaned up
        """
        count = 0
        cutoff = time.time() - (max_age_days * 86400)
        
        # Clean disk cache
        for cache_file in self.cache_dir.glob("*.cache"):
            try:
                if cache_file.stat().st_mtime < cutoff:
                    cache_file.unlink()
                    count += 1
            except Exception:
                pass
        
        # Clean memory cache
        keys_to_delete = []
        for key, entry in self._memory_cache.items():
            if entry.created_at < cutoff:
                keys_to_delete.append(key)
        
        for key in keys_to_delete:
            del self._memory_cache[key]
            if key in self._access_order:
                self._access_order.remove(key)
            count += 1
        
        logger.info(f"Cleaned up {count} old cache entries")
        return count
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total_requests = self._hits + self._misses
        hit_rate = self._hits / total_requests if total_requests > 0 else 0
        
        # Count disk cache size
        disk_size = sum(
            f.stat().st_size 
            for f in self.cache_dir.glob("*.cache")
            if f.exists()
        )
        disk_count = len(list(self.cache_dir.glob("*.cache")))
        
        return {
            "memory_entries": len(self._memory_cache),
            "disk_entries": disk_count,
            "disk_size_mb": disk_size / (1024 * 1024),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": hit_rate,
        }


# Decorator for cached functions
def cached(
    cache_type: str,
    ttl: Optional[int] = None
):
    """
    Decorator to cache function results.
    
    Usage:
        @cached(CacheType.TRANSCRIPTION)
        async def transcribe(project_id, audio_path, **kwargs):
            ...
    """
    def decorator(func):
        async def wrapper(project_id: str, file_path: str = None, **kwargs):
            cache = IntelligentCache.get_instance()
            
            # Try to get from cache
            cached_value = await cache.get(
                cache_type, project_id, file_path, kwargs
            )
            if cached_value is not None:
                return cached_value
            
            # Execute function
            result = await func(project_id, file_path, **kwargs)
            
            # Cache result
            if result is not None:
                await cache.set(
                    cache_type, project_id, result, file_path, kwargs, ttl
                )
            
            return result
        
        return wrapper
    return decorator


# Convenience functions
def get_cache() -> IntelligentCache:
    """Get the cache instance."""
    return IntelligentCache.get_instance()


async def get_cached_analysis(
    cache_type: str,
    project_id: str,
    file_path: Optional[str] = None
) -> Optional[Any]:
    """Get a cached analysis result."""
    cache = IntelligentCache.get_instance()
    return await cache.get(cache_type, project_id, file_path)


async def cache_analysis(
    cache_type: str,
    project_id: str,
    value: Any,
    file_path: Optional[str] = None
) -> None:
    """Cache an analysis result."""
    cache = IntelligentCache.get_instance()
    await cache.set(cache_type, project_id, value, file_path)
