"""
Script Quality Scoring Service
Comprehensive quality metrics for narration scripts.
"""
import google.generativeai as genai
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel
import re
from dotenv import load_dotenv
import os

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash-lite")


class QualityBreakdown(BaseModel):
    """Detailed quality score breakdown."""
    clarity: int        # 0-100
    engagement: int     # 0-100
    professionalism: int  # 0-100
    technical_accuracy: int  # 0-100


class QualityMetrics(BaseModel):
    """Complete quality assessment."""
    overall_score: int  # 0-100
    grade: str          # A+, A, A-, B+, B, B-, C+, C, C-, D, F
    breakdown: QualityBreakdown
    strengths: List[str]
    improvements: List[str]
    word_count: int
    sentence_count: int
    average_sentence_length: float
    flesch_reading_ease: float
    percentile: Optional[int] = None


def score_script_quality(
    script: str,
    timeline_context: Optional[Dict] = None,
    session_events: Optional[List] = None
) -> QualityMetrics:
    """
    Calculate comprehensive quality score for script.
    
    Args:
        script: The narration script to score
        timeline_context: Timeline for technical accuracy check
        session_events: DOM events for UI reference validation
        
    Returns:
        Complete quality metrics with breakdown and suggestions
    """
    if not script or not script.strip():
        return QualityMetrics(
            overall_score=0,
            grade="F",
            breakdown=QualityBreakdown(
                clarity=0, engagement=0, professionalism=0, technical_accuracy=0
            ),
            strengths=[],
            improvements=["Script is empty - provide content to analyze"],
            word_count=0,
            sentence_count=0,
            average_sentence_length=0.0,
            flesch_reading_ease=0.0
        )
    
    # Calculate base metrics
    word_count = len(script.split())
    sentences = re.split(r'[.!?]+', script)
    sentences = [s.strip() for s in sentences if s.strip()]
    sentence_count = len(sentences) if sentences else 1
    avg_sentence_length = word_count / sentence_count if sentence_count > 0 else 0
    
    # Calculate component scores
    clarity = _calculate_clarity_score(script, avg_sentence_length)
    engagement = _calculate_engagement_score(script)
    professionalism = _calculate_professionalism_score(script)
    technical_accuracy = _calculate_technical_accuracy(
        script, timeline_context, session_events
    )
    
    # Weighted overall score
    overall = int(
        clarity * 0.25 +
        engagement * 0.30 +
        professionalism * 0.25 +
        technical_accuracy * 0.20
    )
    
    # Generate feedback
    strengths, improvements = _generate_feedback(
        script, clarity, engagement, professionalism, technical_accuracy
    )
    
    return QualityMetrics(
        overall_score=overall,
        grade=_score_to_grade(overall),
        breakdown=QualityBreakdown(
            clarity=clarity,
            engagement=engagement,
            professionalism=professionalism,
            technical_accuracy=technical_accuracy
        ),
        strengths=strengths,
        improvements=improvements,
        word_count=word_count,
        sentence_count=sentence_count,
        average_sentence_length=round(avg_sentence_length, 1),
        flesch_reading_ease=_calculate_flesch_score(script)
    )


def _calculate_clarity_score(script: str, avg_sentence_length: float) -> int:
    """
    Score clarity based on:
    - Flesch reading ease
    - Average sentence length (optimal: 15-20 words)
    - Simple vs complex vocabulary
    """
    score = 100
    
    # Penalize long sentences
    if avg_sentence_length > 25:
        score -= min(30, int((avg_sentence_length - 25) * 3))
    elif avg_sentence_length < 10:
        score -= 10  # Too choppy
    
    # Check for complex words (3+ syllables)
    words = script.lower().split()
    if words:
        complex_words = sum(1 for w in words if _count_syllables(w) >= 3)
        complex_ratio = complex_words / len(words)
        score -= min(20, int(complex_ratio * 100))
    
    # Bonus for transition words (improves flow)
    transitions = ["first", "next", "then", "finally", "now", "after", "before"]
    transition_count = sum(1 for t in transitions if t in script.lower())
    score += min(10, transition_count * 2)
    
    return max(0, min(100, score))


def _calculate_engagement_score(script: str) -> int:
    """
    Score engagement based on:
    - Action verb density
    - Specific examples (numbers, names, concrete details)
    - Variety in sentence structure
    - Enthusiasm markers
    """
    score = 50  # Base score
    script_lower = script.lower()
    words = script_lower.split()
    
    if not words:
        return 0
    
    # Action verbs boost
    action_verbs = [
        "click", "select", "type", "enter", "navigate", "open",
        "create", "add", "configure", "set", "choose", "drag",
        "submit", "save", "upload", "download", "edit", "delete",
        "view", "search", "filter", "sort", "expand", "collapse"
    ]
    action_count = sum(1 for v in action_verbs if v in script_lower)
    score += min(25, action_count * 3)
    
    # Specific details boost (numbers, quoted strings)
    specific_patterns = [r'\d+', r'"[^"]*"', r"'[^']*'"]
    for pattern in specific_patterns:
        matches = len(re.findall(pattern, script))
        score += min(8, matches * 2)
    
    # Enthusiasm markers
    enthusiasm = ["now", "here", "easy", "simple", "powerful", "instantly", 
                  "quickly", "seamlessly", "efficiently", "directly"]
    for word in enthusiasm:
        if word in script_lower:
            score += 2
    
    # Variety in sentence starters
    sentences = re.split(r'[.!?]+', script)
    starters = [s.strip().split()[0].lower() for s in sentences if s.strip() and s.strip().split()]
    if starters:
        unique_ratio = len(set(starters)) / len(starters)
        score += int(unique_ratio * 10)
    
    return max(0, min(100, score))


def _calculate_professionalism_score(script: str) -> int:
    """
    Score professionalism based on:
    - Absence of filler words
    - Formal language
    - Consistent tone
    - Proper grammar indicators
    """
    score = 100
    script_lower = script.lower()
    
    # Penalize fillers
    fillers = ["um", "uh", "like", "you know", "basically", "actually",
               "literally", "kinda", "sorta", "gonna", "wanna"]
    for filler in fillers:
        count = len(re.findall(r'\b' + filler + r'\b', script_lower))
        score -= count * 5
    
    # Penalize casual language
    casual = ["yeah", "yep", "nope", "ok so", "alright so", "cool", 
              "stuff", "thingy", "whatever"]
    for word in casual:
        if word in script_lower:
            score -= 4
    
    # Penalize uncertainty
    uncertainty = ["maybe", "perhaps", "i think", "i guess", "might", 
                   "probably", "sort of", "kind of"]
    for phrase in uncertainty:
        if phrase in script_lower:
            score -= 5
    
    # Penalize contractions in formal context (optional - mild penalty)
    contractions = ["don't", "won't", "can't", "shouldn't", "couldn't"]
    contraction_count = sum(1 for c in contractions if c in script_lower)
    score -= min(5, contraction_count)
    
    # Bonus for professional phrases
    professional = ["please note", "ensure that", "proceed to", "configure the",
                   "navigate to", "select the", "enter your"]
    for phrase in professional:
        if phrase in script_lower:
            score += 2
    
    return max(0, min(100, score))


def _calculate_technical_accuracy(
    script: str,
    timeline: Optional[Dict],
    events: Optional[List]
) -> int:
    """
    Score technical accuracy based on:
    - UI element references match DOM events
    - Action descriptions match timeline
    - No factual inconsistencies
    """
    if not timeline and not events:
        return 75  # Default when no context available
    
    score = 70  # Base score
    script_lower = script.lower()
    
    # Extract UI elements from events
    ui_elements = set()
    if events:
        for event in events:
            if isinstance(event, dict):
                target = event.get("target", {})
                if target:
                    if target.get("text"):
                        ui_elements.add(target["text"].lower().strip())
                    attrs = target.get("attributes", {})
                    if isinstance(attrs, dict):
                        if attrs.get("data-testid"):
                            ui_elements.add(attrs["data-testid"].lower())
                        if attrs.get("aria-label"):
                            ui_elements.add(attrs["aria-label"].lower())
    
    # Check if script references these elements
    if ui_elements:
        referenced = sum(1 for el in ui_elements if el and el in script_lower)
        reference_ratio = referenced / len(ui_elements)
        score += int(reference_ratio * 25)
    
    # Check timeline alignment
    if timeline and timeline.get("timeline"):
        timeline_events = timeline["timeline"]
        timeline_actions = [e.get("description", "").lower() for e in timeline_events if e.get("description")]
        
        action_matches = sum(1 for action in timeline_actions 
                           if any(word in script_lower for word in action.split()[:3]))
        if timeline_actions:
            timeline_ratio = action_matches / len(timeline_actions)
            score += int(timeline_ratio * 10)
    
    return max(0, min(100, score))


def _calculate_flesch_score(text: str) -> float:
    """Calculate Flesch Reading Ease score (0-100, higher = easier)."""
    words = text.split()
    sentences = re.split(r'[.!?]+', text)
    sentences = [s for s in sentences if s.strip()]
    
    if not words or not sentences:
        return 0.0
    
    total_syllables = sum(_count_syllables(w) for w in words)
    
    if not total_syllables:
        return 0.0
    
    # Flesch formula
    asl = len(words) / len(sentences)  # Average sentence length
    asw = total_syllables / len(words)  # Average syllables per word
    flesch = 206.835 - (1.015 * asl) - (84.6 * asw)
    
    return max(0, min(100, round(flesch, 1)))


def _count_syllables(word: str) -> int:
    """Estimate syllable count for a word."""
    word = word.lower().strip(".,!?;:'\"()-")
    if len(word) <= 3:
        return 1
    
    vowels = "aeiouy"
    count = 0
    prev_vowel = False
    
    for char in word:
        is_vowel = char in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    
    # Adjust for silent e
    if word.endswith("e") and count > 1:
        count -= 1
    
    # Adjust for common endings
    if word.endswith("le") and len(word) > 2 and word[-3] not in vowels:
        count += 1
    
    return max(1, count)


def _score_to_grade(score: int) -> str:
    """Convert numeric score to letter grade."""
    if score >= 97: return "A+"
    if score >= 93: return "A"
    if score >= 90: return "A-"
    if score >= 87: return "B+"
    if score >= 83: return "B"
    if score >= 80: return "B-"
    if score >= 77: return "C+"
    if score >= 73: return "C"
    if score >= 70: return "C-"
    if score >= 60: return "D"
    return "F"


def _generate_feedback(
    script: str,
    clarity: int,
    engagement: int,
    professionalism: int,
    technical: int
) -> Tuple[List[str], List[str]]:
    """Generate strengths and improvement suggestions."""
    strengths = []
    improvements = []
    script_lower = script.lower()
    
    # Clarity feedback
    if clarity >= 80:
        strengths.append("Clear, easy-to-follow language")
    elif clarity >= 60:
        improvements.append("Consider shorter sentences (15-20 words ideal)")
    else:
        improvements.append("Simplify sentence structure and use clearer vocabulary")
    
    # Engagement feedback
    if engagement >= 80:
        strengths.append("Engaging with strong action verbs")
    elif engagement >= 60:
        improvements.append("Add more action verbs (click, select, configure)")
    else:
        improvements.append("Make the script more dynamic with active language and specific examples")
    
    # Professionalism feedback
    if professionalism >= 85:
        strengths.append("Professional, polished tone")
    elif professionalism >= 70:
        improvements.append("Remove filler words (um, basically, like)")
    else:
        improvements.append("Adopt a more formal tone; avoid casual language")
    
    # Technical feedback
    if technical >= 80:
        strengths.append("Accurate UI element references")
    elif technical >= 60:
        improvements.append("Reference specific UI elements by name")
    else:
        improvements.append("Align script more closely with actual UI interactions")
    
    # Additional specific feedback
    if "click" in script_lower and script_lower.count("click") > 5:
        improvements.append("Vary verb usage - replace some 'click' with 'select', 'choose', 'press'")
    
    avg_sentence_len = len(script.split()) / max(1, len(re.split(r'[.!?]+', script)))
    if avg_sentence_len > 25:
        improvements.append(f"Average sentence length is {avg_sentence_len:.0f} words - aim for under 20")
    
    return strengths, improvements


# Endpoint-ready function for direct quality scoring
def get_quality_score_response(
    script: str,
    timeline_context: Optional[Dict] = None,
    session_events: Optional[List] = None
) -> Dict[str, Any]:
    """
    Get quality score as a dictionary response.
    Wrapper for API endpoints.
    """
    metrics = score_script_quality(script, timeline_context, session_events)
    return metrics.dict()
