from app.services.brain.analyzer import analyze_text


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
    Brain Event v1.

    Standard shape for anything that changes a student's learning journey.
    """

    normalized_type = normalize_event_type(event_type)
    safe_payload = payload or {}

    return {
        "type": normalized_type,
        "payload": safe_payload,
        "supported": is_supported_event(normalized_type),
    }


def run_brain_pipeline(event_type: str, payload: dict | None = None) -> dict:
    """
    Brain Pipeline v1.

    One central entry point for future learning events.

    For now it:
    - standardizes the event
    - analyzes provided text
    - returns concepts and knowledge graph

    Later it will:
    - save Brain Objects
    - update Knowledge Graph database
    - update Learning Memory
    - update recommendations
    - update search/context indexes
    """

    event = build_brain_event(event_type, payload)
    text = event["payload"].get("text") or event["payload"].get("content") or ""
    analysis = analyze_text(text)

    return {
        "event": event,
        "analysis": analysis,
        "actions": {
            "analyzed_text": bool(text.strip()),
            "updated_memory": False,
            "updated_knowledge_graph": False,
            "updated_recommendations": False,
        },
    }
