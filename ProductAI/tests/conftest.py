"""
Pytest fixtures and configuration for ProductAI tests.
"""
import pytest
import sys
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models.dom_event_models import (
    RecordingSession, 
    InteractionEvent, 
    EventMetadata, 
    Viewport,
    EventTarget,
    BoundingBox
)


@pytest.fixture
def sample_script():
    """A well-written product demo script."""
    return """
    Welcome to our product demo. First, click the Create New Project button 
    to get started. Next, enter your project name in the text field. 
    You can add a description to help identify your project later.
    Finally, click Save to create your project. Your new project will 
    appear in the dashboard, ready for you to start working.
    """


@pytest.fixture
def sample_poor_script():
    """A script with many issues for testing."""
    return """
    Um, so like, basically we're gonna, you know, maybe click 
    the thingy and stuff. I think it might work, kinda. Yeah so 
    basically you just click here and stuff happens I guess.
    """


@pytest.fixture
def sample_session():
    """A sample recording session with events."""
    return RecordingSession(
        sessionId="test-session-001",
        startTime=1000,
        endTime=60000,
        url="https://example.com/dashboard",
        viewport=Viewport(width=1920, height=1080),
        events=[
            InteractionEvent(
                timestamp=5000,
                type="click",
                target=EventTarget(
                    tag="button",
                    id="create-btn",
                    classes=["btn", "primary"],
                    text="Create New Project",
                    selector="#create-btn",
                    bbox=BoundingBox(x=100, y=200, width=150, height=40),
                    attributes={"data-testid": "create-button"}
                ),
                value=None,
                metadata=EventMetadata(
                    url="https://example.com/dashboard",
                    viewport=Viewport(width=1920, height=1080)
                )
            ),
            InteractionEvent(
                timestamp=10000,
                type="type",
                target=EventTarget(
                    tag="input",
                    id="project-name",
                    classes=["input-field"],
                    text=None,
                    selector="#project-name",
                    bbox=BoundingBox(x=100, y=300, width=300, height=40),
                    attributes={"data-testid": "project-name-input"},
                    type="text",
                    name="projectName"
                ),
                value="My New Project",
                metadata=EventMetadata(
                    url="https://example.com/dashboard",
                    viewport=Viewport(width=1920, height=1080)
                )
            ),
            InteractionEvent(
                timestamp=20000,
                type="click",
                target=EventTarget(
                    tag="button",
                    id="save-btn",
                    classes=["btn", "success"],
                    text="Save",
                    selector="#save-btn",
                    bbox=BoundingBox(x=100, y=400, width=100, height=40),
                    attributes={"data-testid": "save-button"}
                ),
                value=None,
                metadata=EventMetadata(
                    url="https://example.com/dashboard",
                    viewport=Viewport(width=1920, height=1080)
                )
            )
        ]
    )


@pytest.fixture
def sample_timeline():
    """A sample timeline context."""
    return {
        "total_events": 5,
        "significant_events": 3,
        "timeline": [
            {
                "timestamp_seconds": 5.0, 
                "action": "click", 
                "description": "Clicked Create New Project button"
            },
            {
                "timestamp_seconds": 10.0, 
                "action": "type", 
                "description": "Typed project name"
            },
            {
                "timestamp_seconds": 20.0, 
                "action": "click", 
                "description": "Clicked Save button"
            }
        ]
    }


@pytest.fixture
def sample_timing_analysis():
    """Sample timing analysis from Deepgram."""
    return {
        "total_duration": 30.5,
        "total_words": 75,
        "speaking_rate": 2.46,
        "num_gaps": 3,
        "average_gap": 0.8,
        "num_filler_words": 2,
        "num_low_confidence": 1,
        "has_timing_data": True
    }


@pytest.fixture
def empty_script():
    """Empty script for edge case testing."""
    return ""


@pytest.fixture
def short_script():
    """Very short script."""
    return "Click the button."
