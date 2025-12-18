"""
Smart Script Summarization Service
Generates multiple script variations from full narration.
"""
import google.generativeai as genai
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import re

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash-lite")


class KeyMoment(BaseModel):
    """Represents a key moment in the recording."""
    timestamp_seconds: float
    description: str
    script_excerpt: str
    importance_score: float  # 0.0 to 1.0


class SummaryResult(BaseModel):
    """Result of summarization."""
    executive_summary: str  # ~30 seconds, 75 words
    quick_overview: str     # ~90 seconds, 225 words
    key_moments: List[KeyMoment]
    social_snippet: str     # ~15 seconds, 40 words
    word_counts: Dict[str, int]
    estimated_durations: Dict[str, float]


def generate_script_summaries(
    full_script: str,
    timeline_context: Optional[Dict[str, Any]] = None,
    session_duration_seconds: float = 60.0
) -> SummaryResult:
    """
    Generate multiple script variations for different use cases.
    
    Args:
        full_script: The complete narration script
        timeline_context: Timeline dict from build_timeline_context()
        session_duration_seconds: Total recording duration
        
    Returns:
        SummaryResult with all summary variations
    """
    if not full_script or not full_script.strip():
        return SummaryResult(
            executive_summary="No script content provided.",
            quick_overview="No script content provided.",
            key_moments=[],
            social_snippet="No content",
            word_counts={
                "executive_summary": 0,
                "quick_overview": 0,
                "social_snippet": 0,
                "full_script": 0
            },
            estimated_durations={
                "executive_summary": 0,
                "quick_overview": 0,
                "social_snippet": 0
            }
        )
    
    full_word_count = len(full_script.split())
    
    # Generate all summaries
    executive = _generate_executive_summary(full_script)
    quick = _generate_quick_overview(full_script)
    social = _generate_social_snippet(full_script)
    key_moments = extract_key_moments(full_script, timeline_context)
    
    # Calculate word counts
    word_counts = {
        "executive_summary": len(executive.split()),
        "quick_overview": len(quick.split()),
        "social_snippet": len(social.split()),
        "full_script": full_word_count
    }
    
    # Estimate durations (150 words per minute)
    estimated_durations = {
        "executive_summary": estimate_reading_duration(executive),
        "quick_overview": estimate_reading_duration(quick),
        "social_snippet": estimate_reading_duration(social)
    }
    
    return SummaryResult(
        executive_summary=executive,
        quick_overview=quick,
        key_moments=key_moments,
        social_snippet=social,
        word_counts=word_counts,
        estimated_durations=estimated_durations
    )


def _generate_executive_summary(full_script: str) -> str:
    """
    Generate 30-second executive summary (~75 words).
    Uses Gemini for intelligent summarization.
    """
    prompt = f"""
Summarize this product demo narration into a 30-second executive summary (approximately 75 words).

Focus on:
1. The main purpose/value proposition
2. Key workflow or action
3. Primary benefit to the user

CRITICAL RULES:
- Maximum 75 words
- Single paragraph, no bullet points
- Present tense, professional tone
- No filler words
- Output ONLY the summary, nothing else

Original script:
{full_script}

Executive summary:
"""
    
    try:
        response = model.generate_content(prompt)
        summary = response.text.strip()
        
        # Truncate if too long
        words = summary.split()
        if len(words) > 90:
            summary = ' '.join(words[:85]) + '.'
        
        return _clean_summary(summary)
    except Exception as e:
        print(f"[Summarization] Executive summary error: {e}")
        # Fallback: Simple extraction
        return _simple_extract(full_script, target_words=75)


def _generate_quick_overview(full_script: str) -> str:
    """
    Generate 90-second quick overview (~225 words).
    """
    prompt = f"""
Create a 90-second quick overview of this product demo (approximately 225 words).

Include:
1. Brief introduction to what this demo shows
2. Main steps or actions in the workflow
3. Key features highlighted
4. Conclusion with the main takeaway

CRITICAL RULES:
- Maximum 225 words
- Professional, engaging tone
- Use transition words (First, Next, Then, Finally)
- Present tense
- Output ONLY the overview, nothing else

Original script:
{full_script}

Quick overview:
"""
    
    try:
        response = model.generate_content(prompt)
        overview = response.text.strip()
        
        # Truncate if too long
        words = overview.split()
        if len(words) > 250:
            overview = ' '.join(words[:235]) + '.'
        
        return _clean_summary(overview)
    except Exception as e:
        print(f"[Summarization] Quick overview error: {e}")
        return _simple_extract(full_script, target_words=225)


def _generate_social_snippet(full_script: str) -> str:
    """
    Generate 15-second social media snippet (~40 words).
    Perfect for Twitter, LinkedIn, or video thumbnails.
    """
    prompt = f"""
Create a 15-second social media snippet from this product demo (approximately 40 words).

Requirements:
1. Catchy, attention-grabbing opening
2. One key value proposition
3. Action-oriented language
4. Could work as a video caption or tweet

CRITICAL RULES:
- Maximum 40 words
- Exciting, punchy tone
- No hashtags or emojis
- Output ONLY the snippet, nothing else

Original script:
{full_script}

Social snippet:
"""
    
    try:
        response = model.generate_content(prompt)
        snippet = response.text.strip()
        
        # Truncate if too long
        words = snippet.split()
        if len(words) > 50:
            snippet = ' '.join(words[:45]) + '.'
        
        return _clean_summary(snippet)
    except Exception as e:
        print(f"[Summarization] Social snippet error: {e}")
        return _simple_extract(full_script, target_words=40)


def extract_key_moments(
    full_script: str,
    timeline_context: Optional[Dict[str, Any]] = None,
    top_n: int = 5
) -> List[KeyMoment]:
    """
    Extract the most important moments from the recording.
    
    Uses timeline events to identify critical actions and
    maps them to relevant script excerpts.
    """
    key_moments = []
    
    # If we have timeline context, use it
    if timeline_context and timeline_context.get("timeline"):
        timeline = timeline_context["timeline"]
        
        # Score each timeline event for importance
        scored_events = []
        for event in timeline:
            timestamp = event.get("timestamp_seconds", 0)
            action = event.get("action", "")
            description = event.get("description", "")
            
            # Importance scoring
            importance = 0.5  # Base score
            
            # Boost for significant actions
            if action in ["click", "submit"]:
                importance += 0.2
            if any(word in description.lower() for word in ["create", "save", "submit", "login", "start"]):
                importance += 0.15
            if any(word in description.lower() for word in ["button", "menu", "form"]):
                importance += 0.1
            
            scored_events.append({
                "timestamp": timestamp,
                "description": description,
                "importance": min(1.0, importance)
            })
        
        # Sort by importance and take top N
        scored_events.sort(key=lambda x: x["importance"], reverse=True)
        
        for event in scored_events[:top_n]:
            # Find relevant script excerpt
            excerpt = _find_script_excerpt(full_script, event["description"])
            
            key_moments.append(KeyMoment(
                timestamp_seconds=event["timestamp"],
                description=event["description"],
                script_excerpt=excerpt,
                importance_score=round(event["importance"], 2)
            ))
    else:
        # No timeline - extract key moments from script itself
        sentences = re.split(r'[.!]+', full_script)
        sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 20]
        
        # Score sentences for importance
        scored_sentences = []
        for i, sentence in enumerate(sentences):
            importance = 0.5
            sentence_lower = sentence.lower()
            
            # Boost for action keywords
            action_words = ["click", "select", "enter", "create", "save", "open", "navigate"]
            for word in action_words:
                if word in sentence_lower:
                    importance += 0.1
            
            # Boost for position (first and last sentences are often important)
            if i == 0 or i == len(sentences) - 1:
                importance += 0.15
            
            # Estimate timestamp based on position
            position_ratio = i / max(1, len(sentences))
            estimated_timestamp = position_ratio * 60  # Assume 60 seconds
            
            scored_sentences.append({
                "timestamp": estimated_timestamp,
                "sentence": sentence,
                "importance": min(1.0, importance)
            })
        
        scored_sentences.sort(key=lambda x: x["importance"], reverse=True)
        
        for item in scored_sentences[:top_n]:
            key_moments.append(KeyMoment(
                timestamp_seconds=round(item["timestamp"], 1),
                description=_extract_action_description(item["sentence"]),
                script_excerpt=item["sentence"][:150] + ("..." if len(item["sentence"]) > 150 else ""),
                importance_score=round(item["importance"], 2)
            ))
    
    # Sort by timestamp for chronological order
    key_moments.sort(key=lambda x: x.timestamp_seconds)
    
    return key_moments


def _find_script_excerpt(script: str, action_description: str) -> str:
    """Find the most relevant excerpt from script matching the action."""
    sentences = re.split(r'[.!]+', script)
    
    # Look for sentences containing keywords from the action
    keywords = action_description.lower().split()[:3]  # First 3 words
    
    best_match = ""
    best_score = 0
    
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        
        sentence_lower = sentence.lower()
        score = sum(1 for kw in keywords if kw in sentence_lower)
        
        if score > best_score:
            best_score = score
            best_match = sentence
    
    if best_match:
        return best_match[:150] + ("..." if len(best_match) > 150 else "")
    
    # Fallback: return first sentence
    return sentences[0][:150] if sentences else ""


def _extract_action_description(sentence: str) -> str:
    """Extract a brief action description from a sentence."""
    # Look for imperative verbs at the start
    words = sentence.split()[:8]
    description = ' '.join(words)
    
    if len(description) > 60:
        description = description[:57] + "..."
    
    return description


def _simple_extract(text: str, target_words: int) -> str:
    """Simple extraction fallback when Gemini fails."""
    words = text.split()
    if len(words) <= target_words:
        return text
    
    # Take from beginning and end
    start_words = target_words // 2
    end_words = target_words - start_words - 1
    
    result = ' '.join(words[:start_words]) + ' ... ' + ' '.join(words[-end_words:])
    return result


def _clean_summary(text: str) -> str:
    """Clean and normalize summary text."""
    # Remove markdown formatting
    text = re.sub(r'\*\*', '', text)
    text = re.sub(r'\*', '', text)
    
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Clean up punctuation
    text = re.sub(r'\s+([.,!?])', r'\1', text)
    
    return text.strip()


def estimate_reading_duration(text: str, wpm: int = 150) -> float:
    """
    Estimate reading/speaking duration in seconds.
    
    Args:
        text: Text to estimate duration for
        wpm: Words per minute (default: 150 for narration)
        
    Returns:
        Estimated duration in seconds
    """
    words = len(text.split())
    return round((words / wpm) * 60, 1)


def get_summary_response(
    full_script: str,
    timeline_context: Optional[Dict[str, Any]] = None,
    session_duration_seconds: float = 60.0
) -> Dict[str, Any]:
    """
    Get summaries as dictionary for API response.
    """
    result = generate_script_summaries(
        full_script,
        timeline_context,
        session_duration_seconds
    )
    return result.dict()
