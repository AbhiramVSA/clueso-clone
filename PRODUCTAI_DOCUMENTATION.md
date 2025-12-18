# ProductAI Feature Documentation

## Overview

ProductAI is a Python/FastAPI backend that processes screen recordings into AI-generated product demo narrations. This document describes six features implemented to enhance the platform's capabilities for Clueso's core product vision: transforming raw screen recordings into professional videos and documentation.

## Table of Contents

1. [Architecture](#architecture)
2. [Feature 1: Script Quality Scoring](#feature-1-script-quality-scoring)
3. [Feature 2: Sentiment and Tone Analysis](#feature-2-sentiment-and-tone-analysis)
4. [Feature 3: Smart Script Summarization](#feature-3-smart-script-summarization)
5. [Feature 4: Analytics Dashboard](#feature-4-analytics-dashboard)
6. [Feature 5: Intelligent Caching](#feature-5-intelligent-caching)
7. [Feature 6: Multi-Language Translation](#feature-6-multi-language-translation)
8. [API Reference](#api-reference)
9. [Testing](#testing)
10. [Dependencies](#dependencies)

---

## Architecture

```
ProductAI/
├── app/
│   ├── main.py                      # FastAPI application with 20+ endpoints
│   ├── models/
│   │   ├── dom_event_models.py      # Recording session and event models
│   │   └── request_models.py        # API request schemas
│   ├── services/
│   │   ├── quality_scorer.py        # Script quality metrics
│   │   ├── sentiment_service.py     # Tone and sentiment analysis
│   │   ├── summarization_service.py # Multi-format summaries
│   │   ├── cache_service.py         # TTL-based caching layer
│   │   ├── translation_service.py   # Multi-language support
│   │   ├── analytics_service.py     # Aggregated insights
│   │   ├── script_generation_service.py
│   │   ├── rag_service.py
│   │   └── elevenlabs_service.py
│   └── repositories/
│       └── session_repository.py    # JSON-based session storage
├── tests/
│   ├── conftest.py                  # Shared test fixtures
│   ├── test_quality.py
│   ├── test_sentiment.py
│   ├── test_cache.py
│   └── test_summarization.py
├── data/sessions/                   # Session metadata storage
└── cache/                           # Cache file storage
```

### Design Rationale

The implementation follows a service layer pattern where each feature is encapsulated in its own module. This provides:

- **Separation of concerns**: Each service handles one responsibility
- **Testability**: Services can be unit tested independently
- **Reusability**: Services can be composed in different endpoints
- **Maintainability**: Changes to one feature do not affect others

---

## Feature 1: Script Quality Scoring

**File**: `app/services/quality_scorer.py`

### Purpose

Provides objective quality metrics for narration scripts before audio generation. This ensures users produce professional content by identifying weaknesses before rendering final videos.

### Rationale

Product demo scripts require specific qualities: clarity for comprehension, engagement to maintain viewer attention, professionalism for brand representation, and technical accuracy to correctly describe UI actions. A scoring system makes these subjective qualities measurable and actionable.

### Implementation

The scoring system evaluates four dimensions:

| Dimension | Weight | Calculation Method |
|-----------|--------|-------------------|
| Clarity | 25% | Flesch reading ease, sentence length, vocabulary complexity |
| Engagement | 30% | Action verb density, enthusiasm markers, sentence variety |
| Professionalism | 25% | Absence of fillers, formal language ratio, uncertainty detection |
| Technical Accuracy | 20% | UI element references matched against DOM events |

**Flesch Reading Ease Formula**:
```
206.835 - (1.015 x ASL) - (84.6 x ASW)
```

Where ASL = average sentence length, ASW = average syllables per word.

**Grade Conversion**:
- 97-100: A+
- 93-96: A
- 90-92: A-
- 87-89: B+
- 83-86: B
- 80-82: B-
- 77-79: C+
- 73-76: C
- 70-72: C-
- 60-69: D
- 0-59: F

### API

```
POST /score-quality
```

Request:
```json
{
  "script": "Click the Create button to start your project.",
  "timeline_context": {},
  "session_events": []
}
```

Response:
```json
{
  "overall_score": 78,
  "grade": "C+",
  "breakdown": {
    "clarity": 85,
    "engagement": 72,
    "professionalism": 80,
    "technical_accuracy": 75
  },
  "strengths": ["Clear, easy-to-follow language"],
  "improvements": ["Add more action verbs"],
  "word_count": 9,
  "sentence_count": 1,
  "average_sentence_length": 9.0,
  "flesch_reading_ease": 72.3
}
```

---

## Feature 2: Sentiment and Tone Analysis

**File**: `app/services/sentiment_service.py`

### Purpose

Detects sentiment polarity and identifies specific tone issues that could impact narration quality. Provides actionable suggestions for improvement.

### Rationale

Narration tone significantly affects viewer perception. Uncertainty phrases ("I think", "maybe") undermine credibility. Filler words ("um", "basically") reduce professionalism. Casual language ("gonna", "wanna") conflicts with enterprise contexts. This service detects these patterns using regex matching, avoiding expensive API calls for deterministic analysis.

### Implementation

Pattern categories with severity levels:

| Category | Examples | Severity |
|----------|----------|----------|
| Uncertainty | "maybe", "perhaps", "I think" | Medium-High |
| Filler | "um", "uh", "basically" | Medium-High |
| Casual | "gonna", "wanna", "yeah" | High |
| Jargon | "synergy", "leverage" | Low |

The service returns three normalized scores (0.0-1.0):
- **Engagement Score**: Based on action verb density and enthusiasm markers
- **Professionalism Score**: Starts at 1.0, penalized for each detected issue
- **Clarity Score**: Based on sentence length and vocabulary simplicity

### API

```
POST /analyze-sentiment
```

Request:
```json
{
  "script": "Um, so basically you click here.",
  "timing_analysis": {}
}
```

Response:
```json
{
  "overall_sentiment": "neutral",
  "confidence": 0.72,
  "engagement_score": 0.55,
  "professionalism_score": 0.65,
  "clarity_score": 0.80,
  "warnings": [
    {
      "type": "filler",
      "sentence": "Um, so basically you click here.",
      "suggestion": "Remove filler - just continue with the next word",
      "severity": "high",
      "position": 0
    }
  ],
  "statistics": {
    "total_sentences": 1,
    "total_words": 6,
    "filler_words": 2
  },
  "improvement_suggestions": [
    "Remove filler words (um, uh, like) for cleaner delivery"
  ]
}
```

---

## Feature 3: Smart Script Summarization

**File**: `app/services/summarization_service.py`

### Purpose

Generates multiple script variations from a full narration for different use cases: executive summaries, quick overviews, social media snippets, and key moments extraction.

### Rationale

Different distribution channels require different content lengths. A 5-minute demo video needs a 30-second summary for stakeholder presentations, a 90-second overview for landing pages, and a 15-second snippet for social media. Rather than manually creating each version, AI-powered summarization maintains consistency while adapting length.

### Implementation

| Format | Target Duration | Word Count | Use Case |
|--------|----------------|------------|----------|
| Executive Summary | 30 seconds | ~75 words | C-level presentations |
| Quick Overview | 90 seconds | ~225 words | Landing pages |
| Social Snippet | 15 seconds | ~40 words | Twitter, LinkedIn |
| Key Moments | Variable | N/A | Video chapters |

Key moments are extracted by:
1. Analyzing timeline events for high-impact actions (clicks, form submissions)
2. Scoring importance based on action type and keywords
3. Mapping high-scoring events to corresponding script excerpts
4. Returning top N moments sorted chronologically

### API

```
POST /generate-summary
```

Request:
```json
{
  "script": "Full narration script...",
  "timeline_context": {},
  "session_duration_seconds": 120.0
}
```

Response:
```json
{
  "executive_summary": "...",
  "quick_overview": "...",
  "social_snippet": "...",
  "key_moments": [
    {
      "timestamp_seconds": 5.0,
      "description": "Clicked Create New Project button",
      "script_excerpt": "First, click the Create button...",
      "importance_score": 0.85
    }
  ],
  "word_counts": {
    "executive_summary": 72,
    "quick_overview": 218,
    "social_snippet": 38,
    "full_script": 450
  },
  "estimated_durations": {
    "executive_summary": 28.8,
    "quick_overview": 87.2,
    "social_snippet": 15.2
  }
}
```

---

## Feature 4: Analytics Dashboard

**Files**: 
- `app/services/analytics_service.py`
- `app/repositories/session_repository.py`

### Purpose

Aggregates session data to provide insights on usage patterns, quality trends, and common UI interactions across all processed recordings.

### Rationale

Understanding how users interact with the platform and what quality scores they achieve helps identify improvement opportunities. Tracking UI patterns across sessions reveals common workflows that could inform template creation or onboarding guidance.

### Implementation

**Session Repository**: JSON-based file storage. Each session is saved as a separate JSON file in `data/sessions/`. This approach was chosen for simplicity and portability; in production, this can be replaced with a database without changing the service layer interface.

**Analytics Calculations**:
- **Overview**: Aggregates totals, averages, and distributions
- **UI Patterns**: Counts element interactions and identifies common click sequences
- **Quality Trends**: Groups sessions by date and calculates rolling averages

Trend detection compares recent sessions (last 3 data points) against older sessions to classify as "improving", "declining", or "stable".

### API

| Endpoint | Description |
|----------|-------------|
| `GET /analytics/overview` | Aggregated statistics |
| `GET /analytics/sessions` | Paginated session list |
| `GET /analytics/sessions/{id}` | Individual session details |
| `DELETE /analytics/sessions/{id}` | Delete session |
| `GET /analytics/ui-patterns` | Common UI interaction patterns |
| `GET /analytics/quality-trends` | Quality scores over time |
| `GET /analytics/recent` | Most recent sessions |

---

## Feature 5: Intelligent Caching

**File**: `app/services/cache_service.py`

### Purpose

Reduces API costs and latency by caching expensive operations like Gemini API calls. Provides TTL-based expiration and statistics tracking.

### Rationale

AI API calls are expensive and slow. Script generation, summarization, and translation produce deterministic outputs for the same inputs. Caching these results reduces costs proportionally to cache hit rate while improving response times from seconds to milliseconds.

### Implementation

**Cache Storage**: File-based JSON storage in `cache/` directory, organized by category subdirectories. Each cache entry includes metadata:
```json
{
  "_cached_at": "2024-12-19T00:00:00",
  "_category": "scripts",
  "_key": "abc123...",
  "data": { ... }
}
```

**TTL Configuration** (hours):
| Category | TTL |
|----------|-----|
| Scripts | 24 |
| RAG Context | 168 |
| Sentiment | 168 |
| Summaries | 24 |
| Quality | 168 |

**Decorator Pattern**:
```python
@cached("scripts", ttl_hours=24)
def generate_product_script(raw_text, word_timings, session):
    ...
```

The decorator transparently handles cache key generation, retrieval, and storage.

### API

| Endpoint | Description |
|----------|-------------|
| `GET /cache/stats` | Hit/miss statistics and storage size |
| `DELETE /cache/clear` | Clear all caches |
| `DELETE /cache/clear/{category}` | Clear specific category |
| `POST /cache/cleanup` | Remove expired entries |

---

## Feature 6: Multi-Language Translation

**File**: `app/services/translation_service.py`

### Purpose

Translates narration scripts to multiple languages while maintaining timing-friendly structure for audio synchronization.

### Rationale

Globalizing product demos requires localization. Traditional translation can alter word count significantly, causing audio/video sync issues. This service instructs the translation model to maintain similar length, preserving timing alignment.

### Implementation

**Supported Languages**:
- English (en), Spanish (es), French (fr), German (de), Japanese (ja)
- Chinese Simplified (zh), Portuguese (pt), Italian (it), Korean (ko), Hindi (hi)

**Translation Prompt Engineering**:
The Gemini prompt explicitly instructs:
1. Maintain similar word count
2. Preserve technical terms when appropriate
3. Keep action verb structure
4. Output only the translation

### API

```
POST /translate
```

Request:
```json
{
  "script": "Click Save to continue.",
  "source_language": null,
  "target_languages": ["es", "fr", "de"]
}
```

Response:
```json
{
  "source_language": "en",
  "translations": {
    "es": {
      "language_code": "es",
      "language_name": "Spanish",
      "translated_text": "Haga clic en Guardar para continuar.",
      "word_count": 6,
      "estimated_duration_seconds": 2.4,
      "success": true
    }
  },
  "detected_language": "en",
  "confidence": 0.95
}
```

Additional endpoints:
- `GET /languages`: List supported languages
- `POST /detect-language`: Detect language of input text

---

## API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/audio-full-process` | Full processing pipeline |
| POST | `/process-recording` | Process DOM events |
| GET | `/` | API information |
| GET | `/health` | Health check |

### Feature Endpoints

| Method | Endpoint | Feature |
|--------|----------|---------|
| POST | `/score-quality` | Quality Scoring |
| POST | `/analyze-sentiment` | Sentiment Analysis |
| POST | `/generate-summary` | Summarization |
| POST | `/translate` | Translation |
| GET | `/analytics/*` | Analytics (7 endpoints) |
| GET/DELETE | `/cache/*` | Caching (4 endpoints) |

---

## Testing

### Running Tests

```bash
uv run pytest tests/ -v
```

### Test Coverage

| File | Tests | Coverage |
|------|-------|----------|
| test_quality.py | 18 | Quality scoring algorithms |
| test_sentiment.py | 20 | Tone detection patterns |
| test_cache.py | 10 | Cache operations |
| test_summarization.py | 12 | Summary generation |

---

## Dependencies

### Required Packages

```
fastapi
uvicorn
pydantic
google-generativeai
python-dotenv
python-multipart
```

### Environment Variables

```
GEMINI_API_KEY=your_gemini_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

---

## Alignment with Clueso Product Vision

Each feature directly supports the mission of transforming raw screen recordings into professional videos and documentation:

| Feature | Contribution |
|---------|--------------|
| Quality Scoring | Ensures narration meets professional standards |
| Sentiment Analysis | Identifies tone issues that undermine credibility |
| Summarization | Enables multiple content formats from single recording |
| Analytics | Tracks quality over time to drive improvement |
| Caching | Reduces processing time for "videos in minutes" |
| Translation | Expands reach through localization |
