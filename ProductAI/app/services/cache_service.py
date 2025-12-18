"""
Intelligent Caching Service
Multi-layer caching for expensive operations with TTL support.
"""
import hashlib
import json
import os
from typing import Optional, Dict, Any, Callable, TypeVar
from datetime import datetime, timedelta
from pathlib import Path
import threading
from functools import wraps

# Cache directory - relative to ProductAI root
CACHE_DIR = Path(__file__).parent.parent.parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

T = TypeVar('T')


class CacheConfig:
    """Cache configuration by category."""
    SCRIPT_TTL_HOURS = 24
    RAG_CONTEXT_TTL_HOURS = 168  # 7 days
    SENTIMENT_TTL_HOURS = 168    # 7 days
    SUMMARY_TTL_HOURS = 24
    QUALITY_TTL_HOURS = 168      # 7 days
    TRANSLATION_TTL_HOURS = 168  # 7 days


class CacheStats:
    """Track cache hit/miss statistics."""
    _stats: Dict[str, Any] = {"hits": 0, "misses": 0, "by_category": {}}
    _lock = threading.Lock()
    
    @classmethod
    def record_hit(cls, category: str) -> None:
        """Record a cache hit."""
        with cls._lock:
            cls._stats["hits"] += 1
            if category not in cls._stats["by_category"]:
                cls._stats["by_category"][category] = {"hits": 0, "misses": 0}
            cls._stats["by_category"][category]["hits"] += 1
    
    @classmethod
    def record_miss(cls, category: str) -> None:
        """Record a cache miss."""
        with cls._lock:
            cls._stats["misses"] += 1
            if category not in cls._stats["by_category"]:
                cls._stats["by_category"][category] = {"hits": 0, "misses": 0}
            cls._stats["by_category"][category]["misses"] += 1
    
    @classmethod
    def get_stats(cls) -> Dict[str, Any]:
        """Get current cache statistics."""
        with cls._lock:
            total = cls._stats["hits"] + cls._stats["misses"]
            hit_rate = cls._stats["hits"] / total if total > 0 else 0.0
            
            return {
                "hits": cls._stats["hits"],
                "misses": cls._stats["misses"],
                "total_requests": total,
                "hit_rate": round(hit_rate, 4),
                "hit_rate_percentage": f"{hit_rate * 100:.2f}%",
                "by_category": dict(cls._stats["by_category"])
            }
    
    @classmethod
    def reset(cls) -> None:
        """Reset all statistics."""
        with cls._lock:
            cls._stats = {"hits": 0, "misses": 0, "by_category": {}}


class CacheService:
    """File-based caching with TTL support and thread safety."""
    
    _lock = threading.Lock()
    
    @classmethod
    def get_cache_key(cls, data: Any, prefix: str = "") -> str:
        """
        Generate deterministic cache key from data.
        
        Args:
            data: Data to hash (dict, str, or any serializable)
            prefix: Optional prefix for the key
            
        Returns:
            Hash string suitable for filename
        """
        if isinstance(data, dict):
            # Sort keys for consistent hashing
            content = json.dumps(data, sort_keys=True, default=str)
        elif isinstance(data, (list, tuple)):
            content = json.dumps(list(data), default=str)
        else:
            content = str(data)
        
        hash_value = hashlib.sha256(content.encode()).hexdigest()[:16]
        return f"{prefix}_{hash_value}" if prefix else hash_value
    
    @classmethod
    def get(
        cls,
        key: str,
        category: str,
        max_age_hours: int = 24
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve cached data if valid.
        
        Args:
            key: Cache key
            category: Cache category (for organization)
            max_age_hours: Maximum age in hours
            
        Returns:
            Cached data dict or None if not found/expired
        """
        category_dir = CACHE_DIR / category
        filepath = category_dir / f"{key}.json"
        
        if not filepath.exists():
            CacheStats.record_miss(category)
            return None
        
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                cached = json.load(f)
            
            # Check expiration
            cached_at_str = cached.get("_cached_at")
            if not cached_at_str:
                CacheStats.record_miss(category)
                return None
            
            cached_at = datetime.fromisoformat(cached_at_str)
            max_age = timedelta(hours=max_age_hours)
            
            if datetime.now() - cached_at > max_age:
                # Expired - delete and return None
                try:
                    filepath.unlink()
                except Exception:
                    pass
                CacheStats.record_miss(category)
                return None
            
            CacheStats.record_hit(category)
            return cached.get("data")
            
        except Exception as e:
            print(f"[CacheService] Read error for {key}: {e}")
            CacheStats.record_miss(category)
            return None
    
    @classmethod
    def set(cls, key: str, category: str, data: Dict[str, Any]) -> bool:
        """
        Store data in cache.
        
        Args:
            key: Cache key
            category: Cache category
            data: Data to cache (must be JSON serializable)
            
        Returns:
            True if cached successfully
        """
        category_dir = CACHE_DIR / category
        category_dir.mkdir(exist_ok=True)
        
        filepath = category_dir / f"{key}.json"
        
        try:
            with cls._lock:
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump({
                        "_cached_at": datetime.now().isoformat(),
                        "_category": category,
                        "_key": key,
                        "data": data
                    }, f, indent=2, default=str)
            return True
        except Exception as e:
            print(f"[CacheService] Write error for {key}: {e}")
            return False
    
    @classmethod
    def invalidate(cls, category: Optional[str] = None) -> int:
        """
        Invalidate cache entries.
        
        Args:
            category: If provided, clear only that category.
                     Otherwise, clear all caches.
            
        Returns:
            Number of entries cleared
        """
        count = 0
        
        with cls._lock:
            if category:
                category_dir = CACHE_DIR / category
                if category_dir.exists():
                    for f in category_dir.glob("*.json"):
                        try:
                            f.unlink()
                            count += 1
                        except Exception:
                            pass
            else:
                # Clear all categories
                for category_dir in CACHE_DIR.iterdir():
                    if category_dir.is_dir():
                        for f in category_dir.glob("*.json"):
                            try:
                                f.unlink()
                                count += 1
                            except Exception:
                                pass
        
        print(f"[CacheService] Invalidated {count} cache entries")
        return count
    
    @classmethod
    def get_size(cls) -> Dict[str, Any]:
        """
        Get cache size statistics.
        
        Returns:
            Dictionary with file counts and sizes by category
        """
        stats: Dict[str, Any] = {
            "total_files": 0,
            "total_bytes": 0,
            "by_category": {}
        }
        
        try:
            for category_dir in CACHE_DIR.iterdir():
                if category_dir.is_dir():
                    category_name = category_dir.name
                    files = list(category_dir.glob("*.json"))
                    size = sum(f.stat().st_size for f in files)
                    
                    stats["by_category"][category_name] = {
                        "files": len(files),
                        "bytes": size,
                        "mb": round(size / (1024 * 1024), 3)
                    }
                    stats["total_files"] += len(files)
                    stats["total_bytes"] += size
        except Exception as e:
            print(f"[CacheService] Size calculation error: {e}")
        
        stats["total_mb"] = round(stats["total_bytes"] / (1024 * 1024), 3)
        return stats
    
    @classmethod
    def cleanup_expired(cls) -> int:
        """
        Remove all expired cache entries.
        
        Returns:
            Number of entries removed
        """
        removed = 0
        
        for category_dir in CACHE_DIR.iterdir():
            if not category_dir.is_dir():
                continue
            
            # Get TTL for this category
            category_name = category_dir.name.upper()
            ttl_attr = f"{category_name}_TTL_HOURS"
            ttl_hours = getattr(CacheConfig, ttl_attr, 24)
            max_age = timedelta(hours=ttl_hours)
            
            for filepath in category_dir.glob("*.json"):
                try:
                    with open(filepath, "r") as f:
                        cached = json.load(f)
                    
                    cached_at_str = cached.get("_cached_at")
                    if cached_at_str:
                        cached_at = datetime.fromisoformat(cached_at_str)
                        if datetime.now() - cached_at > max_age:
                            filepath.unlink()
                            removed += 1
                except Exception:
                    pass
        
        print(f"[CacheService] Cleaned up {removed} expired entries")
        return removed


def cached(category: str, ttl_hours: int = 24):
    """
    Decorator to cache function results.
    
    Usage:
        @cached("scripts", ttl_hours=24)
        def generate_script(text: str, events: List) -> Dict:
            ...
    
    Args:
        category: Cache category name
        ttl_hours: Time-to-live in hours
        
    Returns:
        Decorated function with caching
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            # Generate cache key from arguments
            cache_input = {
                "function": func.__name__,
                "args": [_serialize_arg(a) for a in args],
                "kwargs": {k: _serialize_arg(v) for k, v in sorted(kwargs.items())}
            }
            cache_key = CacheService.get_cache_key(cache_input, func.__name__)
            
            # Try cache first
            cached_result = CacheService.get(cache_key, category, ttl_hours)
            if cached_result is not None:
                print(f"[Cache] HIT for {func.__name__}")
                return cached_result
            
            print(f"[Cache] MISS for {func.__name__}")
            
            # Execute function
            result = func(*args, **kwargs)
            
            # Cache result if it's a dict
            if isinstance(result, dict):
                CacheService.set(cache_key, category, result)
            
            return result
        
        return wrapper
    return decorator


def _serialize_arg(arg: Any) -> str:
    """Serialize an argument for cache key generation."""
    if hasattr(arg, 'dict'):  # Pydantic model
        return json.dumps(arg.dict(), sort_keys=True, default=str)
    elif hasattr(arg, '__dict__'):  # Regular object
        return json.dumps(vars(arg), sort_keys=True, default=str)
    elif isinstance(arg, (dict, list)):
        return json.dumps(arg, sort_keys=True, default=str)
    else:
        return str(arg)


def get_cache_status() -> Dict[str, Any]:
    """
    Get complete cache status for API response.
    """
    return {
        "performance": CacheStats.get_stats(),
        "storage": CacheService.get_size(),
        "config": {
            "script_ttl_hours": CacheConfig.SCRIPT_TTL_HOURS,
            "rag_context_ttl_hours": CacheConfig.RAG_CONTEXT_TTL_HOURS,
            "sentiment_ttl_hours": CacheConfig.SENTIMENT_TTL_HOURS,
            "summary_ttl_hours": CacheConfig.SUMMARY_TTL_HOURS,
            "quality_ttl_hours": CacheConfig.QUALITY_TTL_HOURS
        }
    }
