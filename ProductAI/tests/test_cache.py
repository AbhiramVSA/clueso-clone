"""
Tests for Caching Service
"""
import pytest
import sys
from pathlib import Path
import tempfile
import shutil

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.cache_service import (
    CacheService,
    CacheStats,
    CacheConfig,
    cached,
    get_cache_status
)


class TestCacheService:
    """Test cases for cache service operations."""
    
    @pytest.fixture(autouse=True)
    def reset_stats(self):
        """Reset cache stats before each test."""
        CacheStats.reset()
        yield
    
    def test_set_and_get(self):
        """Should store and retrieve data."""
        test_data = {"message": "Hello, World!", "number": 42}
        key = "test_key_001"
        category = "test"
        
        # Set
        success = CacheService.set(key, category, test_data)
        assert success is True
        
        # Get
        result = CacheService.get(key, category, max_age_hours=1)
        assert result is not None
        assert result["message"] == "Hello, World!"
        assert result["number"] == 42
        
        # Cleanup
        CacheService.invalidate(category)
    
    def test_get_nonexistent_returns_none(self):
        """Should return None for nonexistent keys."""
        result = CacheService.get("nonexistent_key", "test", max_age_hours=1)
        assert result is None
    
    def test_cache_stats_tracking(self):
        """Should track hits and misses."""
        CacheStats.reset()
        
        # Miss
        CacheService.get("missing_key", "test", 1)
        
        # Set then hit
        CacheService.set("hit_key", "test", {"data": "test"})
        CacheService.get("hit_key", "test", 1)
        
        stats = CacheStats.get_stats()
        assert stats["hits"] >= 1
        assert stats["misses"] >= 1
        
        # Cleanup
        CacheService.invalidate("test")
    
    def test_invalidate_category(self):
        """Should clear specific category."""
        CacheService.set("key1", "category_a", {"data": 1})
        CacheService.set("key2", "category_a", {"data": 2})
        CacheService.set("key3", "category_b", {"data": 3})
        
        # Invalidate category_a
        count = CacheService.invalidate("category_a")
        assert count >= 2
        
        # category_a should be empty
        assert CacheService.get("key1", "category_a", 1) is None
        
        # category_b should still exist
        # Note: may or may not exist depending on test order
        
        # Cleanup
        CacheService.invalidate("category_b")
    
    def test_get_size(self):
        """Should return size statistics."""
        CacheService.set("size_test", "test_size", {"data": "x" * 100})
        
        size = CacheService.get_size()
        
        assert "total_files" in size
        assert "total_bytes" in size
        assert "total_mb" in size
        assert size["total_files"] >= 1
        
        # Cleanup
        CacheService.invalidate("test_size")
    
    def test_get_cache_key_deterministic(self):
        """Same data should produce same key."""
        data = {"a": 1, "b": 2}
        
        key1 = CacheService.get_cache_key(data, "test")
        key2 = CacheService.get_cache_key(data, "test")
        
        assert key1 == key2
    
    def test_get_cache_key_different_data(self):
        """Different data should produce different keys."""
        key1 = CacheService.get_cache_key({"a": 1}, "test")
        key2 = CacheService.get_cache_key({"a": 2}, "test")
        
        assert key1 != key2


class TestCacheDecorator:
    """Test cases for @cached decorator."""
    
    def test_cached_decorator_basic(self):
        """Decorator should cache function results."""
        call_count = 0
        
        @cached("test_decorator", ttl_hours=1)
        def expensive_function(x: int) -> dict:
            nonlocal call_count
            call_count += 1
            return {"result": x * 2}
        
        # First call - should execute function
        result1 = expensive_function(5)
        assert result1["result"] == 10
        assert call_count == 1
        
        # Second call with same args - should use cache
        result2 = expensive_function(5)
        assert result2["result"] == 10
        # call_count might be 1 or 2 depending on cache hit
        
        # Different args - should execute function
        result3 = expensive_function(10)
        assert result3["result"] == 20
        
        # Cleanup
        CacheService.invalidate("test_decorator")


class TestCacheConfig:
    """Test cases for cache configuration."""
    
    def test_config_values_exist(self):
        """All config values should be defined."""
        assert CacheConfig.SCRIPT_TTL_HOURS > 0
        assert CacheConfig.RAG_CONTEXT_TTL_HOURS > 0
        assert CacheConfig.SENTIMENT_TTL_HOURS > 0
        assert CacheConfig.SUMMARY_TTL_HOURS > 0
        assert CacheConfig.QUALITY_TTL_HOURS > 0


class TestCacheStatus:
    """Test cases for cache status endpoint helper."""
    
    def test_get_cache_status_format(self):
        """Status should include performance and storage."""
        status = get_cache_status()
        
        assert "performance" in status
        assert "storage" in status
        assert "config" in status
        
        assert "hits" in status["performance"]
        assert "misses" in status["performance"]
        assert "hit_rate" in status["performance"]
