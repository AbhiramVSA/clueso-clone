"""
Analytics Service - Aggregated insights across sessions.
Provides overview statistics, UI patterns, and quality trends.
"""
from typing import Dict, Any, List, Optional
from collections import Counter
from datetime import datetime, timedelta
from app.repositories.session_repository import SessionRepository


class AnalyticsService:
    """Generate analytics and insights from session data."""
    
    @staticmethod
    def get_overview() -> Dict[str, Any]:
        """
        Get overall analytics summary across all sessions.
        
        Returns:
            Dictionary with aggregated statistics including:
            - Total sessions count
            - Total and average durations
            - Action breakdown
            - Quality metrics
        """
        sessions = SessionRepository.get_all_sessions()
        
        if not sessions:
            return {
                "total_sessions": 0,
                "message": "No sessions recorded yet",
                "total_duration_minutes": 0,
                "average_session_duration_seconds": 0,
                "total_dom_events": 0,
                "action_breakdown": {},
                "average_quality_score": None,
                "sessions_last_7_days": 0,
                "sessions_last_30_days": 0
            }
        
        # Calculate totals
        total_duration = sum(s.get("duration_seconds", 0) for s in sessions)
        total_events = sum(s.get("total_events", 0) for s in sessions)
        
        # Aggregate action types
        action_counts: Counter = Counter()
        for s in sessions:
            action_breakdown = s.get("action_breakdown", {})
            if isinstance(action_breakdown, dict):
                for action_type, count in action_breakdown.items():
                    action_counts[action_type] += count
        
        # Quality metrics
        quality_scores = [
            s.get("quality_score") 
            for s in sessions 
            if s.get("quality_score") is not None
        ]
        avg_quality = (
            sum(quality_scores) / len(quality_scores) 
            if quality_scores else None
        )
        
        # Sentiment distribution
        sentiment_counts: Counter = Counter()
        for s in sessions:
            sentiment = s.get("sentiment", s.get("overall_sentiment"))
            if sentiment:
                sentiment_counts[sentiment] += 1
        
        return {
            "total_sessions": len(sessions),
            "total_duration_minutes": round(total_duration / 60, 2),
            "average_session_duration_seconds": round(total_duration / len(sessions), 2),
            "total_dom_events": total_events,
            "action_breakdown": dict(action_counts),
            "average_quality_score": round(avg_quality, 2) if avg_quality else None,
            "sentiment_distribution": dict(sentiment_counts),
            "sessions_last_7_days": AnalyticsService._count_recent_sessions(sessions, 7),
            "sessions_last_30_days": AnalyticsService._count_recent_sessions(sessions, 30),
            "generated_at": datetime.now().isoformat()
        }
    
    @staticmethod
    def _count_recent_sessions(sessions: List[Dict], days: int) -> int:
        """Count sessions within last N days."""
        cutoff = datetime.now() - timedelta(days=days)
        count = 0
        
        for s in sessions:
            saved_at = s.get("saved_at")
            if saved_at:
                try:
                    # Handle both ISO format with and without microseconds
                    session_date = datetime.fromisoformat(
                        saved_at.replace("Z", "+00:00")
                    )
                    if session_date.replace(tzinfo=None) > cutoff:
                        count += 1
                except (ValueError, AttributeError):
                    pass
        
        return count
    
    @staticmethod
    def get_ui_patterns() -> Dict[str, Any]:
        """
        Identify common UI interaction patterns across sessions.
        
        Returns:
            Dictionary with:
            - Most interacted UI elements
            - Common click sequences
            - Element statistics
        """
        sessions = SessionRepository.get_all_sessions()
        
        if not sessions:
            return {
                "most_interacted_elements": [],
                "common_click_sequences": [],
                "total_unique_elements": 0,
                "element_type_distribution": {}
            }
        
        # Aggregate UI elements
        element_counts: Counter = Counter()
        element_types: Counter = Counter()
        click_sequences: List[tuple] = []
        
        for s in sessions:
            # Get UI elements
            elements = s.get("ui_elements", [])
            if isinstance(elements, list):
                for el in elements:
                    if isinstance(el, str):
                        element_counts[el] += 1
                    elif isinstance(el, dict):
                        name = el.get("name") or el.get("text") or el.get("selector")
                        if name:
                            element_counts[str(name)] += 1
                        el_type = el.get("type") or el.get("tag")
                        if el_type:
                            element_types[el_type] += 1
            
            # Track click sequences (first 5 clicks)
            clicks = s.get("click_sequence", [])
            if isinstance(clicks, list) and clicks:
                sequence = tuple(str(c) for c in clicks[:5])
                if sequence:
                    click_sequences.append(sequence)
        
        # Find common click sequences
        sequence_counts: Counter = Counter(click_sequences)
        
        return {
            "most_interacted_elements": [
                {"element": el, "count": count}
                for el, count in element_counts.most_common(15)
            ],
            "common_click_sequences": [
                {"sequence": list(seq), "count": count}
                for seq, count in sequence_counts.most_common(5)
            ],
            "total_unique_elements": len(element_counts),
            "element_type_distribution": dict(element_types.most_common(10)),
            "generated_at": datetime.now().isoformat()
        }
    
    @staticmethod
    def get_quality_trends() -> Dict[str, Any]:
        """
        Analyze quality score trends over time.
        
        Returns:
            Dictionary with daily averages and trend direction
        """
        sessions = SessionRepository.get_all_sessions()
        
        # Extract quality data with dates
        quality_data = []
        for s in sessions:
            score = s.get("quality_score")
            saved_at = s.get("saved_at")
            
            if score is not None and saved_at:
                try:
                    date_str = saved_at[:10]  # YYYY-MM-DD
                    quality_data.append({
                        "date": date_str,
                        "score": float(score),
                        "session_id": s.get("session_id", "unknown")
                    })
                except (ValueError, TypeError):
                    pass
        
        if not quality_data:
            return {
                "daily_averages": [],
                "total_scored_sessions": 0,
                "trend": "insufficient_data",
                "overall_average": None
            }
        
        # Group by date
        daily_scores: Dict[str, List[float]] = {}
        for item in quality_data:
            date = item["date"]
            if date not in daily_scores:
                daily_scores[date] = []
            daily_scores[date].append(item["score"])
        
        # Calculate daily averages
        daily_averages = [
            {
                "date": date,
                "average_score": round(sum(scores) / len(scores), 2),
                "session_count": len(scores)
            }
            for date, scores in sorted(daily_scores.items())
        ]
        
        # Calculate trend
        trend = AnalyticsService._calculate_trend(daily_averages)
        
        # Overall average
        all_scores = [item["score"] for item in quality_data]
        overall_avg = sum(all_scores) / len(all_scores) if all_scores else None
        
        return {
            "daily_averages": daily_averages,
            "total_scored_sessions": len(quality_data),
            "trend": trend,
            "overall_average": round(overall_avg, 2) if overall_avg else None,
            "best_day": max(daily_averages, key=lambda x: x["average_score"]) if daily_averages else None,
            "generated_at": datetime.now().isoformat()
        }
    
    @staticmethod
    def _calculate_trend(daily_data: List[Dict]) -> str:
        """
        Calculate if quality is improving, declining, or stable.
        
        Compares recent sessions to older ones.
        """
        if len(daily_data) < 2:
            return "insufficient_data"
        
        # Split into recent and older
        if len(daily_data) >= 6:
            recent = daily_data[-3:]
            older = daily_data[:-3]
        else:
            mid = len(daily_data) // 2
            recent = daily_data[mid:]
            older = daily_data[:mid]
        
        recent_avg = sum(d["average_score"] for d in recent) / len(recent)
        older_avg = sum(d["average_score"] for d in older) / len(older)
        
        diff = recent_avg - older_avg
        
        if diff > 5:  # Significant improvement
            return "improving"
        elif diff < -5:  # Significant decline
            return "declining"
        return "stable"
    
    @staticmethod
    def get_session_details(session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information for a specific session.
        """
        return SessionRepository.get_session(session_id)
    
    @staticmethod
    def get_recent_sessions(limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get the most recent sessions with summary info.
        """
        sessions = SessionRepository.get_all_sessions(limit=limit)
        
        # Return summary view
        return [
            {
                "session_id": s.get("session_id"),
                "saved_at": s.get("saved_at"),
                "duration_seconds": s.get("duration_seconds"),
                "quality_score": s.get("quality_score"),
                "sentiment": s.get("sentiment") or s.get("overall_sentiment"),
                "word_count": s.get("word_count"),
                "total_events": s.get("total_events")
            }
            for s in sessions
        ]
    
    @staticmethod
    def get_comparison(session_ids: List[str]) -> Dict[str, Any]:
        """
        Compare metrics across multiple sessions.
        """
        sessions_data = []
        for sid in session_ids:
            session = SessionRepository.get_session(sid)
            if session:
                sessions_data.append({
                    "session_id": sid,
                    "quality_score": session.get("quality_score"),
                    "sentiment": session.get("sentiment"),
                    "word_count": session.get("word_count"),
                    "duration_seconds": session.get("duration_seconds"),
                    "total_events": session.get("total_events")
                })
        
        if not sessions_data:
            return {"error": "No valid sessions found", "sessions": []}
        
        return {
            "sessions": sessions_data,
            "best_quality": max(sessions_data, key=lambda x: x.get("quality_score") or 0),
            "comparison_count": len(sessions_data)
        }
