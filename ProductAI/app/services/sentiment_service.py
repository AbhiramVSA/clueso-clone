"""
Sentiment & Tone Analysis Service
Analyzes scripts for engagement, professionalism, and improvements.
"""
import google.generativeai as genai
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel
from enum import Enum
import re
from dotenv import load_dotenv
import os

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash-lite")


class SentimentType(str, Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class ToneWarning(BaseModel):
    """Warning about potential tone issues."""
    type: str  # "uncertainty", "casual", "jargon", "repetition", "filler"
    sentence: str
    suggestion: str
    severity: str  # "low", "medium", "high"
    position: int  # sentence index


class SentimentAnalysisResult(BaseModel):
    """Complete sentiment analysis result."""
    overall_sentiment: SentimentType
    confidence: float  # 0.0 to 1.0
    engagement_score: float  # 0.0 to 1.0
    professionalism_score: float  # 0.0 to 1.0
    clarity_score: float  # 0.0 to 1.0
    warnings: List[ToneWarning]
    statistics: Dict[str, int]
    improvement_suggestions: List[str]


# Patterns to detect
UNCERTAINTY_PATTERNS = [
    (r"\b(maybe|perhaps)\b", "uncertainty", "high"),
    (r"\b(i think|i guess|i believe)\b", "uncertainty", "medium"),
    (r"\b(sort of|kind of|probably)\b", "uncertainty", "medium"),
    (r"\b(might|could be|seems like|appears to)\b", "uncertainty", "low"),
]

FILLER_PATTERNS = [
    (r"\b(um|uh)\b", "filler", "high"),
    (r"\blike\b(?!.*\blike\s+a\b)", "filler", "medium"),  # Avoid "like a"
    (r"\b(you know|basically|actually|literally)\b", "filler", "medium"),
]

CASUAL_PATTERNS = [
    (r"\b(gonna|wanna|gotta|kinda|shoulda|coulda)\b", "casual", "high"),
    (r"\b(yeah|yep|nope)\b", "casual", "high"),
    (r"\b(ok so|alright|cool)\b", "casual", "medium"),
    (r"\b(stuff|thingy|whatever)\b", "casual", "medium"),
]

JARGON_PATTERNS = [
    (r"\b(synergy|leverage|paradigm|holistic|ecosystem)\b", "jargon", "low"),
    (r"\b(ideate|align|circle back|deep dive)\b", "jargon", "low"),
]


def analyze_script_sentiment(
    script: str,
    timing_analysis: Optional[Dict[str, Any]] = None
) -> SentimentAnalysisResult:
    """
    Analyze sentiment and tone of narration script.
    
    Args:
        script: The narration script to analyze
        timing_analysis: Optional timing data for context
        
    Returns:
        Complete sentiment analysis with scores and suggestions
    """
    if not script or not script.strip():
        return SentimentAnalysisResult(
            overall_sentiment=SentimentType.NEUTRAL,
            confidence=0.0,
            engagement_score=0.0,
            professionalism_score=0.0,
            clarity_score=0.0,
            warnings=[],
            statistics={"total_sentences": 0, "issues_found": 0},
            improvement_suggestions=["Script is empty - provide content to analyze"]
        )
    
    # Detect tone issues
    warnings = detect_tone_issues(script)
    
    # Calculate scores
    engagement = calculate_engagement_score(script)
    professionalism = calculate_professionalism_score(script)
    clarity = calculate_clarity_score(script)
    
    # Determine overall sentiment
    overall_sentiment, confidence = _analyze_overall_sentiment(script)
    
    # Generate improvement suggestions
    suggestions = _generate_improvement_suggestions(script, warnings, 
                                                     engagement, professionalism, clarity)
    
    # Calculate statistics
    sentences = re.split(r'[.!?]+', script)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    statistics = {
        "total_sentences": len(sentences),
        "total_words": len(script.split()),
        "issues_found": len(warnings),
        "filler_words": sum(1 for w in warnings if w.type == "filler"),
        "uncertainty_phrases": sum(1 for w in warnings if w.type == "uncertainty"),
        "casual_language": sum(1 for w in warnings if w.type == "casual"),
    }
    
    return SentimentAnalysisResult(
        overall_sentiment=overall_sentiment,
        confidence=confidence,
        engagement_score=round(engagement, 2),
        professionalism_score=round(professionalism, 2),
        clarity_score=round(clarity, 2),
        warnings=warnings[:10],  # Limit to top 10 warnings
        statistics=statistics,
        improvement_suggestions=suggestions[:5]  # Limit to top 5 suggestions
    )


def detect_tone_issues(script: str) -> List[ToneWarning]:
    """Detect specific tone issues using pattern matching."""
    warnings = []
    sentences = re.split(r'[.!?]+', script)
    
    for i, sentence in enumerate(sentences):
        sentence = sentence.strip()
        if not sentence:
            continue
        
        sentence_lower = sentence.lower()
        
        # Check all pattern types
        all_patterns = (
            UNCERTAINTY_PATTERNS + 
            FILLER_PATTERNS + 
            CASUAL_PATTERNS + 
            JARGON_PATTERNS
        )
        
        for pattern, issue_type, severity in all_patterns:
            match = re.search(pattern, sentence_lower)
            if match:
                matched_text = match.group(0)
                suggestion = _get_suggestion_for_issue(issue_type, matched_text, sentence)
                
                warnings.append(ToneWarning(
                    type=issue_type,
                    sentence=sentence[:100] + ("..." if len(sentence) > 100 else ""),
                    suggestion=suggestion,
                    severity=severity,
                    position=i
                ))
    
    # Check for repetition
    words = script.lower().split()
    word_counts = {}
    for word in words:
        word = re.sub(r'[.,!?;:\'"()-]', '', word)
        if len(word) > 4:  # Only check significant words
            word_counts[word] = word_counts.get(word, 0) + 1
    
    for word, count in word_counts.items():
        if count > 5 and word not in ["click", "button", "select", "enter"]:
            warnings.append(ToneWarning(
                type="repetition",
                sentence=f"Word '{word}' used {count} times",
                suggestion=f"Consider using synonyms for '{word}' to vary language",
                severity="low",
                position=-1
            ))
    
    # Sort by severity
    severity_order = {"high": 0, "medium": 1, "low": 2}
    warnings.sort(key=lambda w: severity_order.get(w.severity, 2))
    
    return warnings


def calculate_engagement_score(script: str) -> float:
    """
    Calculate engagement score based on:
    - Action verb density
    - Specific examples mentioned
    - Emotional/enthusiasm markers
    - Storytelling elements (transitions, flow)
    """
    if not script:
        return 0.0
    
    score = 0.5  # Base score
    script_lower = script.lower()
    words = script_lower.split()
    
    if not words:
        return 0.0
    
    # Action verbs boost
    action_verbs = [
        "click", "select", "type", "enter", "navigate", "open",
        "create", "add", "configure", "set", "choose", "drag",
        "submit", "save", "upload", "download", "view", "search"
    ]
    action_count = sum(1 for v in action_verbs if v in script_lower)
    action_density = action_count / len(words)
    score += min(0.2, action_density * 5)
    
    # Enthusiasm markers
    enthusiasm = ["now", "here", "easy", "simple", "powerful", "instantly",
                  "quickly", "seamlessly", "efficient", "direct"]
    enthusiasm_count = sum(1 for e in enthusiasm if e in script_lower)
    score += min(0.15, enthusiasm_count * 0.03)
    
    # Transition words (indicates flow)
    transitions = ["first", "next", "then", "finally", "after", "once", "now"]
    transition_count = sum(1 for t in transitions if t in script_lower)
    score += min(0.1, transition_count * 0.02)
    
    # Specific details (numbers, quoted text)
    numbers = len(re.findall(r'\d+', script))
    quotes = len(re.findall(r'["\'][^"\']+["\']', script))
    score += min(0.05, (numbers + quotes) * 0.01)
    
    return min(1.0, max(0.0, score))


def calculate_professionalism_score(script: str) -> float:
    """
    Calculate professionalism score based on:
    - Absence of filler words
    - Formal vs casual language ratio
    - Technical accuracy indicators
    - Consistent tone
    """
    if not script:
        return 0.0
    
    score = 1.0  # Start at max
    script_lower = script.lower()
    
    # Penalize fillers
    fillers = ["um", "uh", "like", "you know", "basically", "actually",
               "literally", "kinda", "sorta", "gonna", "wanna"]
    for filler in fillers:
        count = len(re.findall(r'\b' + re.escape(filler) + r'\b', script_lower))
        score -= count * 0.03
    
    # Penalize casual language
    casual = ["yeah", "yep", "nope", "ok so", "alright", "cool", "stuff"]
    for word in casual:
        if word in script_lower:
            score -= 0.03
    
    # Penalize uncertainty
    uncertainty = ["maybe", "perhaps", "i think", "i guess", "might"]
    for phrase in uncertainty:
        if phrase in script_lower:
            score -= 0.04
    
    return min(1.0, max(0.0, score))


def calculate_clarity_score(script: str) -> float:
    """
    Calculate clarity score based on readability metrics.
    """
    if not script:
        return 0.0
    
    words = script.split()
    sentences = re.split(r'[.!?]+', script)
    sentences = [s for s in sentences if s.strip()]
    
    if not sentences:
        return 0.0
    
    # Average sentence length (optimal: 15-20)
    avg_length = len(words) / len(sentences)
    if 15 <= avg_length <= 20:
        length_score = 1.0
    elif 10 <= avg_length <= 25:
        length_score = 0.8
    else:
        length_score = max(0.3, 1.0 - abs(avg_length - 17.5) * 0.02)
    
    # Simple vocabulary ratio
    simple_word_ratio = sum(1 for w in words if len(w) <= 6) / len(words)
    vocab_score = 0.5 + (simple_word_ratio * 0.5)
    
    return min(1.0, (length_score + vocab_score) / 2)


def _analyze_overall_sentiment(script: str) -> Tuple[SentimentType, float]:
    """
    Analyze overall sentiment using keyword matching and Gemini if needed.
    """
    script_lower = script.lower()
    
    positive_words = [
        "easy", "simple", "powerful", "great", "excellent", "perfect",
        "seamless", "efficient", "intuitive", "helpful", "amazing",
        "successful", "complete", "achieve", "accomplish"
    ]
    
    negative_words = [
        "difficult", "confusing", "problem", "error", "fail", "wrong",
        "unfortunately", "issue", "mistake", "complicated", "hard"
    ]
    
    neutral_words = [
        "click", "select", "enter", "navigate", "configure", "set"
    ]
    
    positive_count = sum(1 for w in positive_words if w in script_lower)
    negative_count = sum(1 for w in negative_words if w in script_lower)
    neutral_count = sum(1 for w in neutral_words if w in script_lower)
    
    total = positive_count + negative_count + neutral_count + 1
    
    if positive_count > negative_count * 2:
        sentiment = SentimentType.POSITIVE
        confidence = min(0.95, 0.6 + (positive_count / total) * 0.3)
    elif negative_count > positive_count * 2:
        sentiment = SentimentType.NEGATIVE
        confidence = min(0.95, 0.6 + (negative_count / total) * 0.3)
    else:
        sentiment = SentimentType.NEUTRAL
        confidence = 0.7 + (neutral_count / total) * 0.2
    
    return sentiment, round(confidence, 2)


def _get_suggestion_for_issue(issue_type: str, matched_text: str, sentence: str) -> str:
    """Generate a suggestion for fixing a tone issue."""
    suggestions = {
        "uncertainty": {
            "maybe": "Use confident language: 'You can' or 'This allows'",
            "perhaps": "Be direct: state the action clearly",
            "i think": "Remove uncertainty: describe the actual behavior",
            "i guess": "Be confident about the feature",
            "sort of": "Be specific about what it does",
            "kind of": "Use precise language",
            "default": "Use confident, declarative statements"
        },
        "filler": {
            "um": "Remove filler - just continue with the next word",
            "uh": "Remove filler - just continue with the next word",
            "like": "Remove or replace with specific description",
            "you know": "Remove - the audience will understand from context",
            "basically": "Remove - get to the point directly",
            "actually": "Remove unless emphasizing a contrast",
            "literally": "Remove unless describing exact behavior",
            "default": "Remove filler words for cleaner delivery"
        },
        "casual": {
            "gonna": "Use 'going to' for professional tone",
            "wanna": "Use 'want to' for professional tone",
            "yeah": "Use 'yes' or rephrase affirmatively",
            "nope": "Use 'no' or rephrase negatively",
            "cool": "Use 'great', 'excellent', or 'perfect'",
            "stuff": "Be specific about what you're referring to",
            "default": "Use more formal language"
        },
        "jargon": {
            "default": "Consider simpler alternatives for broader audience"
        },
        "repetition": {
            "default": "Vary your word choice to keep the script engaging"
        }
    }
    
    type_suggestions = suggestions.get(issue_type, {})
    return type_suggestions.get(matched_text, type_suggestions.get("default", "Review and revise"))


def _generate_improvement_suggestions(
    script: str,
    warnings: List[ToneWarning],
    engagement: float,
    professionalism: float,
    clarity: float
) -> List[str]:
    """Generate prioritized improvement suggestions."""
    suggestions = []
    
    # Based on warnings
    high_severity = [w for w in warnings if w.severity == "high"]
    if high_severity:
        types = set(w.type for w in high_severity)
        if "filler" in types:
            suggestions.append("Remove filler words (um, uh, like) for cleaner delivery")
        if "casual" in types:
            suggestions.append("Replace casual language with professional alternatives")
        if "uncertainty" in types:
            suggestions.append("Use confident, declarative statements")
    
    # Based on scores
    if engagement < 0.6:
        suggestions.append("Add more action verbs and enthusiasm markers")
    if professionalism < 0.7:
        suggestions.append("Review script for informal language")
    if clarity < 0.6:
        suggestions.append("Shorten sentences and simplify vocabulary")
    
    # Word count advice
    word_count = len(script.split())
    if word_count < 50:
        suggestions.append("Consider adding more detail to fully explain the workflow")
    elif word_count > 500:
        suggestions.append("Consider condensing to keep viewer attention")
    
    return suggestions


def get_sentiment_response(
    script: str,
    timing_analysis: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Get sentiment analysis as dictionary for API response.
    """
    result = analyze_script_sentiment(script, timing_analysis)
    return result.dict()
