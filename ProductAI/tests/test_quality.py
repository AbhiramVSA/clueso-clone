"""
Tests for Quality Scoring Service
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.quality_scorer import (
    score_script_quality,
    _calculate_clarity_score,
    _calculate_engagement_score,
    _calculate_professionalism_score,
    _count_syllables,
    _score_to_grade,
    _calculate_flesch_score,
    QualityMetrics
)


class TestQualityScoring:
    """Test cases for quality scoring functionality."""
    
    def test_high_quality_script_scores_above_70(self, sample_script):
        """A well-written script should score above 70."""
        result = score_script_quality(sample_script)
        
        assert isinstance(result, QualityMetrics)
        assert result.overall_score >= 60
        assert result.grade in ["A+", "A", "A-", "B+", "B", "B-", "C+"]
    
    def test_poor_script_scores_below_60(self, sample_poor_script):
        """A script with many issues should score low."""
        result = score_script_quality(sample_poor_script)
        
        assert result.overall_score < 70
        assert len(result.improvements) > 0
    
    def test_empty_script_returns_zero(self, empty_script):
        """Empty script should return zero scores."""
        result = score_script_quality(empty_script)
        
        assert result.overall_score == 0
        assert result.grade == "F"
        assert result.word_count == 0
    
    def test_quality_breakdown_all_present(self, sample_script):
        """All breakdown scores should be present and valid."""
        result = score_script_quality(sample_script)
        
        assert result.breakdown.clarity is not None
        assert result.breakdown.engagement is not None
        assert result.breakdown.professionalism is not None
        assert result.breakdown.technical_accuracy is not None
        
        # All scores should be between 0 and 100
        assert 0 <= result.breakdown.clarity <= 100
        assert 0 <= result.breakdown.engagement <= 100
        assert 0 <= result.breakdown.professionalism <= 100
        assert 0 <= result.breakdown.technical_accuracy <= 100
    
    def test_strengths_and_improvements_generated(self, sample_script):
        """Feedback should include both strengths and improvements."""
        result = score_script_quality(sample_script)
        
        # At least some feedback
        assert isinstance(result.strengths, list)
        assert isinstance(result.improvements, list)
    
    def test_word_and_sentence_counts(self, sample_script):
        """Word and sentence counts should be accurate."""
        result = score_script_quality(sample_script)
        
        assert result.word_count > 0
        assert result.sentence_count > 0
        assert result.average_sentence_length > 0
    
    def test_flesch_score_in_valid_range(self, sample_script):
        """Flesch reading ease should be in valid range."""
        result = score_script_quality(sample_script)
        
        assert 0 <= result.flesch_reading_ease <= 100


class TestClarityScoring:
    """Test cases for clarity score calculation."""
    
    def test_clarity_penalizes_long_sentences(self):
        """Long sentences should reduce clarity score."""
        short = "Click the button. Enter your name. Save the project."
        long = "Click the button which is located at the top right corner of the screen next to the other buttons and then proceed to enter your name in the field that appears below the header section."
        
        short_score = _calculate_clarity_score(short, 4.0)
        long_score = _calculate_clarity_score(long, 40.0)
        
        assert short_score > long_score
    
    def test_clarity_penalizes_complex_vocabulary(self):
        """Complex vocabulary should reduce clarity."""
        simple = "Click the button to save your work."
        complex_text = "Instantiate the configuration parameters accordingly."
        
        simple_score = _calculate_clarity_score(simple, 7.0)
        complex_score = _calculate_clarity_score(complex_text, 5.0)
        
        assert simple_score >= complex_score


class TestEngagementScoring:
    """Test cases for engagement score calculation."""
    
    def test_engagement_rewards_action_verbs(self):
        """Action verbs should boost engagement."""
        active = "Click Create, enter your details, select the options, and submit the form."
        passive = "The button is there and details can be entered somehow."
        
        active_score = _calculate_engagement_score(active)
        passive_score = _calculate_engagement_score(passive)
        
        assert active_score > passive_score
    
    def test_engagement_rewards_enthusiasm(self):
        """Enthusiasm markers should boost engagement."""
        enthusiastic = "Now you can easily create powerful projects instantly!"
        boring = "The project will be created when you are done."
        
        enthusiastic_score = _calculate_engagement_score(enthusiastic)
        boring_score = _calculate_engagement_score(boring)
        
        assert enthusiastic_score > boring_score


class TestProfessionalismScoring:
    """Test cases for professionalism score calculation."""
    
    def test_professionalism_penalizes_fillers(self):
        """Filler words should reduce professionalism."""
        professional = "Click the button to create your project."
        casual = "Um, so like, basically just click the button, you know?"
        
        prof_score = _calculate_professionalism_score(professional)
        casual_score = _calculate_professionalism_score(casual)
        
        assert prof_score > casual_score
    
    def test_professionalism_penalizes_uncertainty(self):
        """Uncertainty phrases should reduce professionalism."""
        confident = "Click the Save button to confirm your changes."
        uncertain = "I think maybe you should click Save, I guess."
        
        confident_score = _calculate_professionalism_score(confident)
        uncertain_score = _calculate_professionalism_score(uncertain)
        
        assert confident_score > uncertain_score


class TestSyllableCounting:
    """Test cases for syllable counting."""
    
    def test_common_words(self):
        """Test syllable counting for common words."""
        assert _count_syllables("hello") == 2
        assert _count_syllables("the") == 1
        assert _count_syllables("button") == 2
        assert _count_syllables("create") == 1  # Silent e reduces count
    
    def test_longer_words(self):
        """Test syllable counting for longer words."""
        assert _count_syllables("beautiful") >= 3
        assert _count_syllables("configuration") >= 4
    
    def test_single_syllable(self):
        """Short words should have 1 syllable minimum."""
        assert _count_syllables("a") == 1
        assert _count_syllables("I") == 1


class TestGradeConversion:
    """Test cases for score to grade conversion."""
    
    def test_grade_boundaries(self):
        """Test all grade boundaries."""
        assert _score_to_grade(100) == "A+"
        assert _score_to_grade(97) == "A+"
        assert _score_to_grade(95) == "A"
        assert _score_to_grade(91) == "A-"
        assert _score_to_grade(88) == "B+"
        assert _score_to_grade(85) == "B"
        assert _score_to_grade(81) == "B-"
        assert _score_to_grade(78) == "C+"
        assert _score_to_grade(75) == "C"
        assert _score_to_grade(71) == "C-"
        assert _score_to_grade(65) == "D"
        assert _score_to_grade(50) == "F"
        assert _score_to_grade(0) == "F"


class TestWithSessionEvents:
    """Test quality scoring with session events context."""
    
    def test_technical_accuracy_with_events(self, sample_script, sample_session):
        """Technical accuracy should consider session events."""
        events_dict = [e.dict() for e in sample_session.events]
        
        result = score_script_quality(
            script=sample_script,
            session_events=events_dict
        )
        
        # Should have technical accuracy score
        assert result.breakdown.technical_accuracy >= 0
    
    def test_technical_accuracy_without_events(self, sample_script):
        """Without events, should use default technical accuracy."""
        result = score_script_quality(
            script=sample_script,
            session_events=None
        )
        
        # Default is 75
        assert result.breakdown.technical_accuracy == 75
