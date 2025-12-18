import requests
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, List, Any
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from app.services.gemini_service import generate_product_text
from app.services.elevenlabs_service import generate_voice_from_text
from app.models.request_models import ProductTextRequest, SyncedNarrationRequest, AudioProcessRequest
from app.models.dom_event_models import RecordingSession, ProcessRecordingResponse
from app.services.dom_event_service import process_dom_events, extract_text_from_events, group_events_by_step
from app.services.synced_narration_service import generate_synced_narration, generate_step_by_step_narration

# New feature imports
from app.services.quality_scorer import score_script_quality, QualityMetrics
from app.services.sentiment_service import analyze_script_sentiment, SentimentAnalysisResult
from app.services.analytics_service import AnalyticsService
from app.repositories.session_repository import SessionRepository
from app.services.summarization_service import generate_script_summaries, SummaryResult
from app.services.cache_service import CacheService, CacheStats, get_cache_status
from app.services.translation_service import (
    translate_to_multiple, 
    detect_language,
    SUPPORTED_LANGUAGES,
    MultiTranslationResult
)

import os
import time
from pathlib import Path

NODE_SERVER_URL = os.getenv("NODE_SERVER_URL")  

app = FastAPI(
    title="ProductAI Backend",
    version="3.0.0",
    description="AI-powered product demo narration with quality analysis, sentiment detection, and multi-language support"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Request Models for New Features
# ============================================================================

class SummarizationRequest(BaseModel):
    """Request for generating script summaries."""
    script: str
    timeline_context: Optional[Dict[str, Any]] = None
    session_duration_seconds: float = 60.0


class QualityScoreRequest(BaseModel):
    """Request for quality scoring."""
    script: str
    timeline_context: Optional[Dict[str, Any]] = None
    session_events: Optional[List[Dict[str, Any]]] = None


class SentimentRequest(BaseModel):
    """Request for sentiment analysis."""
    script: str
    timing_analysis: Optional[Dict[str, Any]] = None


class TranslationRequest(BaseModel):
    """Request for translation."""
    script: str
    source_language: Optional[str] = None
    target_languages: List[str]


# ============================================================================
# Existing Endpoints
# ============================================================================

@app.post("/audio-full-process")
async def full_process(payload: AudioProcessRequest):

    try:
        print(f"[Python] ===== FULL PROCESSING PIPELINE STARTED =====")
        print(f"[Python] Raw text length: {len(payload.text)}")

        has_new_format = payload.deepgramData is not None
        has_old_format = payload.deepgramResponse is not None
        print(f"[Python] Format detected: {'NEW (deepgramData)' if has_new_format else 'OLD (deepgramResponse)' if has_old_format else 'UNKNOWN'}")

        words = payload.words
        print(f"[Python] Deepgram words: {len(words)} words")


        # ----------------------------------------------------------------------
        # 👇 RAG FIX — Safe legacy wrapper for raw domEvents
        # ----------------------------------------------------------------------
        session = payload.get_session_or_create()

        if session:
            print(f"[Python] DOM events: {len(session.events)} events")

        elif payload.domEvents:
            print(f"[Python] DOM events (raw): {len(payload.domEvents)} events (no RecordingSession)")

            try:
                session_id = payload.metadata.get("sessionId", "legacy_session")

                session = RecordingSession(
                    sessionId=session_id,
                    events=payload.domEvents,
                    startTime=payload.metadata.get("startTime") or 0,
                    endTime=payload.metadata.get("endTime") or 0,
                    url=payload.metadata.get("url") or "unknown",
                    viewport=payload.metadata.get("viewport") or {"width": 0, "height": 0}
                )

                print(f"[Python] ✅ Wrapped raw domEvents into RecordingSession "
                      f"(sessionId={session.sessionId}, events={len(session.events)})")

            except Exception as wrap_error:
                print(f"[Python] ❌ Failed to wrap raw domEvents:", wrap_error)
                session = None

        else:
            print(f"[Python] No DOM events available")

        # ----------------------------------------------------------------------


        print(f"[Python] Recordings path: {payload.recordingsPath}")

        print(f"[Python] Step 1: Generating production-ready script...")
        from app.services.script_generation_service import generate_product_script

        script_result = generate_product_script(
            raw_text=payload.text,
            word_timings=words,
            session=session
        )

        if not script_result.get("success"):
            error_msg = script_result.get('error', 'Unknown error')
            print(f"[Python] ❌ Script generation failed: {error_msg}")
            raise Exception(f"Script generation failed: {error_msg}")

        production_script = script_result["script"]
        print(f"\n[Python] ✅ STEP 1 COMPLETE - Script Generated")
        print(f"[Python]   - Script length: {len(production_script)} characters")
        print(f"[Python]   - Script preview: {production_script[:150]}...")
        print(f"[Python]   - Timing analysis: {script_result.get('timing_analysis', {})}")

        # ==================== NEW: Quality & Sentiment Analysis ====================
        print(f"\n[Python] ===== STEP 1.5: QUALITY & SENTIMENT ANALYSIS =====")
        
        # Quality scoring
        quality_metrics = score_script_quality(
            script=production_script,
            timeline_context=script_result.get("timeline_context"),
            session_events=[e.dict() for e in session.events] if session else None
        )
        print(f"[Python]   - Quality Score: {quality_metrics.overall_score} ({quality_metrics.grade})")
        
        # Sentiment analysis
        sentiment_result = analyze_script_sentiment(
            script=production_script,
            timing_analysis=script_result.get("timing_analysis")
        )
        print(f"[Python]   - Sentiment: {sentiment_result.overall_sentiment.value} (confidence: {sentiment_result.confidence})")
        # ===========================================================================

        print(f"\n[Python] ===== STEP 2: AUDIO GENERATION =====")
        print(f"[Python] Converting script to audio using ElevenLabs...")
        print(f"[Python]   - Text length: {len(production_script)} characters")

        try:
            audio_bytes = generate_voice_from_text(production_script)
            print(f"[Python] ✅ Audio generated successfully")
            print(f"[Python]   - Audio size: {len(audio_bytes)} bytes ({len(audio_bytes) / 1024:.2f} KB)")
        except Exception as e:
            print(f"[Python] ❌ Audio generation failed: {str(e)}")
            raise


        print(f"\n[Python] ===== STEP 3: SAVING AUDIO FILE =====")
        timestamp = int(time.time() * 1000)
        session_id = payload.metadata.get("sessionId", "unknown")
        filename = f"processed_audio_{session_id}_{timestamp}.mp3"

        print(f"[Python]   - Session ID: {session_id}")
        print(f"[Python]   - Filename: {filename}")
        print(f"[Python]   - Recordings path: {payload.recordingsPath}")

        recordings_path = Path(payload.recordingsPath)
        recordings_path.mkdir(parents=True, exist_ok=True)
        print(f"[Python]   - Directory created/verified: {recordings_path}")

        file_path = recordings_path / filename

        with open(file_path, "wb") as f:
            f.write(audio_bytes)

        print(f"[Python] ✅ Audio file saved successfully")
        print(f"[Python]   - Full path: {file_path}")
        print(f"[Python]   - File size: {len(audio_bytes)} bytes")


        print(f"\n[Python] ===== STEP 4: PREPARING RESPONSE =====")

        # Calculate duration
        duration_seconds = 0
        if session:
            duration_seconds = (session.endTime - session.startTime) / 1000

        response_data = {
            "success": True,
            "script": production_script,
            "raw_text": payload.text,
            "processed_audio_filename": filename,
            "audio_size_bytes": len(audio_bytes),
            "timing_analysis": script_result.get("timing_analysis", {}),
            "dom_context_used": script_result.get("dom_context_used", False),
            "session_id": session_id,
            # NEW: Quality metrics
            "quality_metrics": quality_metrics.dict(),
            # NEW: Sentiment analysis
            "sentiment_analysis": sentiment_result.dict(),
        }

        # ==================== NEW: Save session for analytics ====================
        try:
            session_metadata = {
                "duration_seconds": duration_seconds,
                "total_events": len(session.events) if session else 0,
                "word_count": len(production_script.split()),
                "quality_score": quality_metrics.overall_score,
                "sentiment": sentiment_result.overall_sentiment.value,
                "url": session.url if session else "unknown",
                "script_preview": production_script[:200] if production_script else "",
                "action_breakdown": _count_action_types(session.events) if session else {},
                "audio_filename": filename
            }
            SessionRepository.save_session(session_id, session_metadata)
            print(f"[Python]   - Session saved to repository")
        except Exception as save_error:
            print(f"[Python]   ⚠️ Failed to save session: {save_error}")
        # ===========================================================================

        print(f"[Python]   - DOM context used: {response_data['dom_context_used']}")
        print(f"\n[Python] ===== ✅ ALL PROCESSING COMPLETE ✅ =====")

        return JSONResponse(response_data)

    except Exception as e:
        error_msg = f"Processing failed: {str(e)}"
        print(f"[Python] ❌ ERROR: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_msg)


def _count_action_types(events: List) -> Dict[str, int]:
    """Helper to count action types for analytics."""
    counts: Dict[str, int] = {}
    for event in events:
        event_type = event.type if hasattr(event, 'type') else event.get('type', 'unknown')
        counts[event_type] = counts.get(event_type, 0) + 1
    return counts


@app.post("/process-recording", response_model=ProcessRecordingResponse)
async def process_recording(
    session: RecordingSession,
    video: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None)
):
    try:
        response = process_dom_events(session)
        extracted_text = extract_text_from_events(session.events)
        grouped_steps = group_events_by_step(session.events)

        response.metadata["extractedText"] = extracted_text
        response.metadata["groupedSteps"] = grouped_steps
        response.metadata["hasVideo"] = video is not None
        response.metadata["hasAudio"] = audio is not None

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process recording: {str(e)}")


# ============================================================================
# Feature 1: Smart Script Summarization
# ============================================================================

@app.post("/generate-summary")
async def generate_summary(request: SummarizationRequest):
    """
    Generate multiple summary formats from a full script.
    
    Returns:
    - Executive summary (~30 seconds)
    - Quick overview (~90 seconds)
    - Key moments with timestamps
    - Social media snippet (~15 seconds)
    """
    try:
        result = generate_script_summaries(
            full_script=request.script,
            timeline_context=request.timeline_context,
            session_duration_seconds=request.session_duration_seconds
        )
        return result.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")


# ============================================================================
# Feature 2: Sentiment & Tone Analysis
# ============================================================================

@app.post("/analyze-sentiment")
async def analyze_sentiment(request: SentimentRequest):
    """
    Analyze sentiment and tone of a narration script.
    
    Returns:
    - Overall sentiment (positive/neutral/negative)
    - Engagement, professionalism, and clarity scores
    - Tone warnings with suggestions
    - Improvement recommendations
    """
    try:
        result = analyze_script_sentiment(
            script=request.script,
            timing_analysis=request.timing_analysis
        )
        return result.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sentiment analysis failed: {str(e)}")


# ============================================================================
# Feature 3: Analytics Dashboard
# ============================================================================

@app.get("/analytics/overview")
async def get_analytics_overview():
    """Get aggregated analytics across all sessions."""
    try:
        return AnalyticsService.get_overview()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics error: {str(e)}")


@app.get("/analytics/sessions")
async def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0)
):
    """List all processed sessions with pagination."""
    try:
        sessions = SessionRepository.get_all_sessions(limit=limit + offset)
        paginated = sessions[offset:offset + limit]
        return {
            "total": len(sessions),
            "offset": offset,
            "limit": limit,
            "sessions": paginated
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list sessions: {str(e)}")


@app.get("/analytics/sessions/{session_id}")
async def get_session(session_id: str):
    """Get specific session details."""
    session = SessionRepository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.delete("/analytics/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a specific session."""
    success = SessionRepository.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": f"Session {session_id} deleted", "success": True}


@app.get("/analytics/ui-patterns")
async def get_ui_patterns():
    """Get common UI interaction patterns across all sessions."""
    try:
        return AnalyticsService.get_ui_patterns()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get UI patterns: {str(e)}")


@app.get("/analytics/quality-trends")
async def get_quality_trends():
    """Get quality score trends over time."""
    try:
        return AnalyticsService.get_quality_trends()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get quality trends: {str(e)}")


@app.get("/analytics/recent")
async def get_recent_sessions(limit: int = Query(default=10, ge=1, le=50)):
    """Get the most recent sessions with summary info."""
    try:
        return AnalyticsService.get_recent_sessions(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get recent sessions: {str(e)}")


# ============================================================================
# Feature 4: Intelligent Caching
# ============================================================================

@app.get("/cache/stats")
async def get_cache_stats():
    """Get cache hit/miss statistics and storage info."""
    return get_cache_status()


@app.delete("/cache/clear")
async def clear_all_cache():
    """Clear all caches."""
    count = CacheService.invalidate()
    CacheStats.reset()
    return {"cleared_entries": count, "message": "All caches cleared"}


@app.delete("/cache/clear/{category}")
async def clear_cache_category(category: str):
    """Clear specific cache category."""
    count = CacheService.invalidate(category)
    return {"cleared_entries": count, "category": category}


@app.post("/cache/cleanup")
async def cleanup_expired_cache():
    """Remove all expired cache entries."""
    count = CacheService.cleanup_expired()
    return {"removed_entries": count, "message": "Expired entries cleaned up"}


# ============================================================================
# Feature 5: Script Quality Scoring
# ============================================================================

@app.post("/score-quality")
async def score_quality(request: QualityScoreRequest):
    """
    Calculate comprehensive quality score for a script.
    
    Returns:
    - Overall score (0-100) and grade (A+ to F)
    - Breakdown: clarity, engagement, professionalism, technical accuracy
    - Strengths and improvement suggestions
    - Readability metrics
    """
    try:
        result = score_script_quality(
            script=request.script,
            timeline_context=request.timeline_context,
            session_events=request.session_events
        )
        return result.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quality scoring failed: {str(e)}")


# ============================================================================
# Feature 6: Multi-Language Translation
# ============================================================================

@app.post("/translate")
async def translate_script_endpoint(request: TranslationRequest):
    """
    Translate script to multiple languages.
    
    Maintains timing-friendly structure for narration sync.
    """
    # Validate target languages
    invalid = [l for l in request.target_languages if l not in SUPPORTED_LANGUAGES]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported languages: {invalid}. Supported: {list(SUPPORTED_LANGUAGES.keys())}"
        )
    
    try:
        result = translate_to_multiple(
            script=request.script,
            target_languages=request.target_languages,
            source_lang=request.source_language
        )
        return result.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")


@app.get("/languages")
async def list_supported_languages():
    """List all supported languages for translation."""
    return {
        "languages": SUPPORTED_LANGUAGES,
        "total": len(SUPPORTED_LANGUAGES)
    }


@app.post("/detect-language")
async def detect_language_endpoint(text: str):
    """Detect the language of input text."""
    try:
        lang_code, confidence = detect_language(text)
        return {
            "language_code": lang_code,
            "language_name": SUPPORTED_LANGUAGES.get(lang_code, "Unknown"),
            "confidence": confidence
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Language detection failed: {str(e)}")


# ============================================================================
# Health & Info Endpoints
# ============================================================================

@app.get("/")
async def root():
    """API root with version and feature info."""
    return {
        "name": "ProductAI Backend",
        "version": "3.0.0",
        "features": [
            "Script Generation with RAG",
            "Quality Scoring",
            "Sentiment Analysis",
            "Smart Summarization",
            "Multi-Language Translation",
            "Analytics Dashboard",
            "Intelligent Caching"
        ],
        "status": "operational"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "sessions_count": SessionRepository.get_session_count(),
        "cache_stats": CacheStats.get_stats()
    }

