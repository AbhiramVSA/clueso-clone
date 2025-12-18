"""
Tests for Sentiment Analysis Service
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.sentiment_service import (
    analyze_script_sentiment,
    detect_tone_issues,
    calculate_engagement_score,
    calculate_professionalism_score,
    calculate_clarity_score,
    SentimentType,
    SentimentAnalysisResult
)


class TestSentimentAnalysis:
    """Test cases for sentiment analysis."""
    
    def test_positive_sentiment_detection(self):
        """Positive language should be detected as positive."""
        script = """
        This is an amazing product with excellent features. 
        It's simple, powerful, and incredibly easy to use.
        You'll love how seamlessly everything works together.
        """
        result = analyze_script_sentiment(script)
        
        assert result.overall_sentiment == SentimentType.POSITIVE
        assert result.confidence > 0.5
    
    def test_neutral_sentiment_for_demo_script(self, sample_script):
        """Demo scripts are typically neutral or positive."""
        result = analyze_script_sentiment(sample_script)
        
        assert result.overall_sentiment in [SentimentType.NEUTRAL, SentimentType.POSITIVE]
    
    def test_empty_script_returns_neutral(self, empty_script):
        """Empty script should return neutral with low confidence."""
        result = analyze_script_sentiment(empty_script)
        
        assert result.overall_sentiment == SentimentType.NEUTRAL
        assert result.confidence == 0.0
    
    def test_result_has_all_scores(self, sample_script):
        """Result should include all required scores."""
        result = analyze_script_sentiment(sample_script)
        
        assert 0 <= result.engagement_score <= 1.0
        assert 0 <= result.professionalism_score <= 1.0
        assert 0 <= result.clarity_score <= 1.0
    
    def test_statistics_are_populated(self, sample_script):
        """Statistics should be calculated."""
        result = analyze_script_sentiment(sample_script)
        
        assert "total_sentences" in result.statistics
        assert "total_words" in result.statistics
        assert result.statistics["total_words"] > 0


class TestToneIssueDetection:
    """Test cases for tone issue detection."""
    
    def test_detects_uncertainty(self):
        """Should detect uncertainty phrases."""
        script = "I think maybe this might work. Perhaps it could be useful."
        warnings = detect_tone_issues(script)
        
        uncertainty_warnings = [w for w in warnings if w.type == "uncertainty"]
        assert len(uncertainty_warnings) > 0
    
    def test_detects_fillers(self):
        """Should detect filler words."""
        script = "Um, so basically, you know, just click the button."
        warnings = detect_tone_issues(script)
        
        filler_warnings = [w for w in warnings if w.type == "filler"]
        assert len(filler_warnings) > 0
    
    def test_detects_casual_language(self):
        """Should detect casual language."""
        script = "Yeah so you're gonna wanna click this thingy here."
        warnings = detect_tone_issues(script)
        
        casual_warnings = [w for w in warnings if w.type == "casual"]
        assert len(casual_warnings) > 0
    
    def test_clean_script_has_few_warnings(self, sample_script):
        """A clean script should have few or no warnings."""
        warnings = detect_tone_issues(sample_script)
        
        high_severity = [w for w in warnings if w.severity == "high"]
        assert len(high_severity) <= 2
    
    def test_warnings_have_suggestions(self):
        """Warnings should include suggestions."""
        script = "Um, I think maybe this is good."
        warnings = detect_tone_issues(script)
        
        for warning in warnings:
            assert warning.suggestion is not None
            assert len(warning.suggestion) > 0


class TestEngagementScore:
    """Test cases for engagement score calculation."""
    
    def test_action_verbs_boost_engagement(self):
        """Action verbs should increase engagement."""
        active = "Click Create, select the options, enter details, and save."
        passive = "The options are there."
        
        active_score = calculate_engagement_score(active)
        passive_score = calculate_engagement_score(passive)
        
        assert active_score > passive_score
    
    def test_empty_text_returns_zero(self):
        """Empty text should return 0."""
        assert calculate_engagement_score("") == 0.0
    
    def test_score_in_valid_range(self, sample_script):
        """Score should be between 0 and 1."""
        score = calculate_engagement_score(sample_script)
        assert 0 <= score <= 1.0


class TestProfessionalismScore:
    """Test cases for professionalism score."""
    
    def test_professional_script_scores_high(self, sample_script):
        """Professional script should score high."""
        score = calculate_professionalism_score(sample_script)
        assert score >= 0.7
    
    def test_casual_script_scores_low(self, sample_poor_script):
        """Casual script with fillers should score low."""
        score = calculate_professionalism_score(sample_poor_script)
        assert score < 0.7
    
    def test_empty_returns_zero(self):
        """Empty text returns 0."""
        assert calculate_professionalism_score("") == 0.0


class TestClarityScore:
    """Test cases for clarity score."""
    
    def test_clear_script_scores_high(self, sample_script):
        """Clear, simple script should score high."""
        score = calculate_clarity_score(sample_script)
        assert score >= 0.5
    
    def test_empty_returns_zero(self):
        """Empty text returns 0."""
        assert calculate_clarity_score("") == 0.0


class TestImprovementSuggestions:
    """Test cases for improvement suggestions."""
    
    def test_suggestions_generated_for_poor_script(self, sample_poor_script):
        """Poor script should get suggestions."""
        result = analyze_script_sentiment(sample_poor_script)
        
        assert len(result.improvement_suggestions) > 0
    
    def test_suggestions_are_actionable(self, sample_poor_script):
        """Suggestions should be non-empty strings."""
        result = analyze_script_sentiment(sample_poor_script)
        
        for suggestion in result.improvement_suggestions:
            assert isinstance(suggestion, str)
            assert len(suggestion) > 10
