from app.services.brain.analyzer import analyze_text
from app.services.brain.memory import build_learning_memory_snapshot
from app.services.brain.objects import (
    brain_analysis_to_dict,
    brain_event_to_dict,
    build_brain_analysis,
    build_brain_event_object,
)


BRAIN_EVENT_TYPES = {
    "uploaded_pdf",
    "created_note",
    "updated_note",
    "generated_flashcards",
    "completed_quiz",
    "asked_ai",
    "reviewed_topic",
    "created_project",
    "joined_study_room",
    "imported_course",
}


def normalize_event_type(event_type: str) -> str:
    return (event_type or "").strip().lower()


def is_supported_event(event_type: str) -> bool:
    return normalize_event_type(event_type) in BRAIN_EVENT_TYPES


def build_brain_event(event_type: str, payload: dict | None = None) -> dict:
    """
    Brain Event v2.

    Builds a typed BrainEvent internally, then returns a JSON-safe dict
    for backward compatibility with existing routes.
    """

    normalized_type = normalize_event_type(event_type)
    brain_event = build_brain_event_object(
        event_type=normalized_type,
        payload=payload,
        supported=is_supported_event(normalized_type),
    )

    event_dict = brain_event_to_dict(brain_event)

    return {
        "type": event_dict["event_type"],
        "payload": event_dict["payload"],
        "supported": event_dict["supported"],
        "user_id": event_dict["user_id"],
        "study_room_id": event_dict["study_room_id"],
        "timestamp": event_dict["timestamp"],
    }


def run_brain_pipeline(event_type: str, payload: dict | None = None) -> dict:
    """
    Brain Pipeline v2.

    Central orchestration layer for StudySnap Brain.

    Flow:

    Raw Feature Event
        ↓
    BrainEvent
        ↓
    Analyzer
        ↓
    BrainAnalysis
        ↓
    Memory Snapshot
        ↓
    Future:
        Persistent Memory
        Knowledge Graph DB
        Recommendations
        Search Index
    """

    event = build_brain_event(event_type, payload)

    text = (
        event["payload"].get("text")
        or event["payload"].get("content")
        or ""
    )

    raw_analysis = analyze_text(text)
    brain_analysis = build_brain_analysis(raw_analysis)
    brain_objects = brain_analysis_to_dict(brain_analysis)

    memory_snapshot = build_learning_memory_snapshot(
        event=event,
        brain_objects=brain_objects,
    )

    return {
        "event": event,

        # Existing API (kept for backward compatibility)
        "analysis": raw_analysis,

        # Brain Core 2.0 structured objects
        "brain_objects": brain_objects,

        # Brain Memory v2 temporary snapshot
        "memory": memory_snapshot,

        "actions": {
            "analyzed_text": bool(text.strip()),
            "updated_memory": memory_snapshot["has_memory"],
            "updated_knowledge_graph": False,
            "updated_recommendations": False,
        },
    }
