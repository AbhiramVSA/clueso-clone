"""
Tests for Summarization Service
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.summarization_service import (
    generate_script_summaries,
    extract_key_moments,
    estimate_reading_duration,
    SummaryResult,
    KeyMoment
)


class TestSummarization:
    """Test cases for script summarization."""
    
    def test_generates_all_summary_types(self, sample_script, sample_timeline):
        """Should generate all summary types."""
        result = generate_script_summaries(
            full_script=sample_script,
            timeline_context=sample_timeline,
            session_duration_seconds=60.0
        )
        
        assert isinstance(result, SummaryResult)
        assert result.executive_summary is not None
        assert result.quick_overview is not None
        assert result.social_snippet is not None
        assert isinstance(result.key_moments, list)
    
    def test_word_counts_calculated(self, sample_script):
        """Word counts should be calculated for each summary."""
        result = generate_script_summaries(
            full_script=sample_script,
            session_duration_seconds=60.0
        )
        
        assert "executive_summary" in result.word_counts
        assert "quick_overview" in result.word_counts
        assert "social_snippet" in result.word_counts
        assert "full_script" in result.word_counts
    
    def test_durations_estimated(self, sample_script):
        """Durations should be estimated for each summary."""
        result = generate_script_summaries(
            full_script=sample_script,
            session_duration_seconds=60.0
        )
        
        assert "executive_summary" in result.estimated_durations
        assert "quick_overview" in result.estimated_durations
        assert "social_snippet" in result.estimated_durations
    
    def test_empty_script_handling(self, empty_script):
        """Should handle empty script gracefully."""
        result = generate_script_summaries(
            full_script=empty_script,
            session_duration_seconds=60.0
        )
        
        assert result.word_counts["full_script"] == 0
        assert len(result.key_moments) == 0
    
    def test_executive_summary_length(self, sample_script):
        """Executive summary should be concise (under ~100 words)."""
        result = generate_script_summaries(
            full_script=sample_script * 5,  # Make it longer
            session_duration_seconds=120.0
        )
        
        word_count = len(result.executive_summary.split())
        # Should be reasonably concise
        assert word_count < 150


class TestKeyMomentExtraction:
    """Test cases for key moment extraction."""
    
    def test_extracts_key_moments_from_timeline(self, sample_script, sample_timeline):
        """Should extract key moments using timeline."""
        moments = extract_key_moments(
            full_script=sample_script,
            timeline_context=sample_timeline,
            top_n=3
        )
        
        assert len(moments) <= 3
        for moment in moments:
            assert isinstance(moment, KeyMoment)
            assert moment.description is not None
            assert 0 <= moment.importance_score <= 1
    
    def test_extracts_moments_without_timeline(self, sample_script):
        """Should extract moments even without timeline."""
        moments = extract_key_moments(
            full_script=sample_script,
            timeline_context=None,
            top_n=3
        )
        
        assert isinstance(moments, list)
        # May or may not have moments depending on script content
    
    def test_respects_top_n(self, sample_script, sample_timeline):
        """Should respect the top_n parameter."""
        moments = extract_key_moments(
            full_script=sample_script,
            timeline_context=sample_timeline,
            top_n=2
        )
        
        assert len(moments) <= 2


class TestReadingDuration:
    """Test cases for reading duration estimation."""
    
    def test_basic_estimation(self):
        """Should estimate duration based on word count."""
        # 150 words at 150 wpm = 60 seconds
        text = " ".join(["word"] * 150)
        duration = estimate_reading_duration(text, wpm=150)
        assert duration == 60.0
    
    def test_empty_text(self):
        """Empty text should return 0."""
        duration = estimate_reading_duration("")
        assert duration == 0.0
    
    def test_custom_wpm(self):
        """Should respect custom WPM."""
        text = " ".join(["word"] * 100)
        
        slow = estimate_reading_duration(text, wpm=100)  # 60 seconds
        fast = estimate_reading_duration(text, wpm=200)  # 30 seconds
        
        assert slow > fast
