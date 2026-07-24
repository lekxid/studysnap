from __future__ import annotations

from datetime import datetime
import json
from typing import Any

from sqlalchemy.orm import Session

from app.models.room_event import RoomEvent
from app.models.room_member import RoomMember
from app.models.room_memory_bucket import RoomMemoryBucket
from app.models.study_room import StudyRoom
from app.services.rooms.access import (
    ROOM_ROLES,
    ensure_room_owner_membership,
)
from app.utils.utc import utc_now_naive



DEFAULT_MEMORY_BUCKETS = [
    "pdfs",
    "notes",
    "flashcards",
    "quizzes",
    "chat",
    "weak_strong_concepts",
    "actions",
]

ROOM_ACTION_DEFINITIONS = [
    {
        "id": "summarize",
        "label": "Summarize",
        "description": "Create a clear summary from selected room material.",
        "output_type": "summary",
    },
    {
        "id": "explain",
        "label": "Explain",
        "description": "Explain selected material in student-friendly language.",
        "output_type": "explanation",
    },
    {
        "id": "tutor",
        "label": "Ask Tutor",
        "description": "Ask questions without saving anything unless the user chooses.",
        "output_type": "chat",
    },
    {
        "id": "create_note",
        "label": "Create Note",
        "description": "Create a real saved StudySnap note from selected material.",
        "output_type": "note",
    },
    {
        "id": "create_quiz",
        "label": "Create Quiz",
        "description": "Create a real saved quiz from selected material.",
        "output_type": "quiz",
    },
    {
        "id": "create_flashcards",
        "label": "Create Flashcards",
        "description": "Create real saved flashcards from selected material.",
        "output_type": "flashcards",
    },
    {
        "id": "create_everything",
        "label": "Create Everything",
        "description": "Create note, quiz, flashcards, and a summary from selected material.",
        "output_type": "multi_output",
    },
    {
        "id": "voice_transcribe",
        "label": "Voice Transcribe",
        "description": "Future voice command action for StudySnap voice mode.",
        "output_type": "chat",
        "future": True,
    },
]

ROOM_AI_OUTPUT_TYPES = [
    "chat",
    "note",
    "quiz",
    "flashcards",
    "summary",
    "explanation",
    "multi_output",
    "concept_map",
]


def to_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def from_json(value: str | None, fallback: Any = None) -> Any:
    if not value:
        return fallback

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def ensure_room_foundation(db: Session, room: StudyRoom, user_id: int) -> None:
    changed = False

    if ensure_room_owner_membership(
        db=db,
        room=room,
        commit=False,
    ):
        changed = True

    current_member = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == user_id,
        )
        .first()
    )

    if current_member:
        current_member.last_active_at = utc_now_naive()
        changed = True

    for bucket_type in DEFAULT_MEMORY_BUCKETS:
        existing_bucket = (
            db.query(RoomMemoryBucket)
            .filter(
                RoomMemoryBucket.room_id == room.id,
                RoomMemoryBucket.owner_id == room.owner_id,
                RoomMemoryBucket.bucket_type == bucket_type,
            )
            .first()
        )

        if existing_bucket is None:
            db.add(
                RoomMemoryBucket(
                    room_id=room.id,
                    owner_id=room.owner_id,
                    bucket_type=bucket_type,
                    summary="",
                    data_json=to_json({}),
                )
            )
            changed = True

    if changed:
        db.commit()


def log_room_event(
    db: Session,
    room_id: int,
    user_id: int | None,
    event_type: str,
    title: str,
    description: str | None = None,
    details: dict[str, Any] | None = None,
    commit: bool = True,
) -> RoomEvent:
    event = RoomEvent(
        room_id=room_id,
        user_id=user_id,
        event_type=event_type,
        title=title,
        description=description,
        details_json=to_json(details or {}),
    )

    db.add(event)

    if commit:
        db.commit()
        db.refresh(event)

    return event
