"""
Session Repository - JSON-based storage for demo purposes.
In production, replace with database integration.
"""
import json
import os
from typing import List, Dict, Optional, Any
from datetime import datetime
from pathlib import Path
import threading

# Storage directory - relative to ProductAI root
STORAGE_DIR = Path(__file__).parent.parent.parent / "data" / "sessions"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class SessionRepository:
    """Thread-safe session metadata storage."""
    
    _lock = threading.Lock()
    
    @classmethod
    def save_session(
        cls,
        session_id: str,
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Save session metadata to JSON file.
        
        Args:
            session_id: Unique session identifier
            metadata: Session data including script, metrics, events summary
            
        Returns:
            True if saved successfully, False otherwise
        """
        with cls._lock:
            try:
                filepath = STORAGE_DIR / f"{session_id}.json"
                
                # Add metadata
                metadata["saved_at"] = datetime.now().isoformat()
                metadata["session_id"] = session_id
                
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(metadata, f, indent=2, default=str)
                
                print(f"[SessionRepository] Saved session: {session_id}")
                return True
                
            except Exception as e:
                print(f"[SessionRepository] Error saving session {session_id}: {e}")
                return False
    
    @classmethod
    def get_session(cls, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve session by ID.
        
        Args:
            session_id: Session identifier to retrieve
            
        Returns:
            Session metadata dict or None if not found
        """
        filepath = STORAGE_DIR / f"{session_id}.json"
        
        if not filepath.exists():
            return None
        
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[SessionRepository] Error reading session {session_id}: {e}")
            return None
    
    @classmethod
    def get_all_sessions(cls, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Retrieve all sessions, sorted by date (newest first).
        
        Args:
            limit: Maximum number of sessions to return
            
        Returns:
            List of session metadata dicts
        """
        sessions = []
        
        try:
            for filepath in STORAGE_DIR.glob("*.json"):
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        session = json.load(f)
                        sessions.append(session)
                except Exception as e:
                    print(f"[SessionRepository] Error reading {filepath}: {e}")
                    continue
        except Exception as e:
            print(f"[SessionRepository] Error listing sessions: {e}")
        
        # Sort by saved_at, newest first
        sessions.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
        
        return sessions[:limit]
    
    @classmethod
    def delete_session(cls, session_id: str) -> bool:
        """
        Delete session by ID.
        
        Args:
            session_id: Session identifier to delete
            
        Returns:
            True if deleted, False if not found or error
        """
        filepath = STORAGE_DIR / f"{session_id}.json"
        
        if filepath.exists():
            try:
                filepath.unlink()
                print(f"[SessionRepository] Deleted session: {session_id}")
                return True
            except Exception as e:
                print(f"[SessionRepository] Error deleting session {session_id}: {e}")
                return False
        
        return False
    
    @classmethod
    def session_exists(cls, session_id: str) -> bool:
        """Check if a session exists."""
        filepath = STORAGE_DIR / f"{session_id}.json"
        return filepath.exists()
    
    @classmethod
    def get_session_count(cls) -> int:
        """Get total number of stored sessions."""
        try:
            return len(list(STORAGE_DIR.glob("*.json")))
        except Exception:
            return 0
    
    @classmethod
    def update_session(
        cls,
        session_id: str,
        updates: Dict[str, Any]
    ) -> bool:
        """
        Update specific fields in an existing session.
        
        Args:
            session_id: Session to update
            updates: Dictionary of fields to update
            
        Returns:
            True if updated successfully
        """
        existing = cls.get_session(session_id)
        if not existing:
            return False
        
        # Merge updates
        existing.update(updates)
        existing["updated_at"] = datetime.now().isoformat()
        
        return cls.save_session(session_id, existing)
    
    @classmethod
    def clear_all(cls) -> int:
        """
        Delete all stored sessions.
        
        Returns:
            Number of sessions deleted
        """
        count = 0
        with cls._lock:
            try:
                for filepath in STORAGE_DIR.glob("*.json"):
                    filepath.unlink()
                    count += 1
            except Exception as e:
                print(f"[SessionRepository] Error clearing sessions: {e}")
        
        return count
