from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.room_ai_output import RoomAIOutput
from app.models.room_event import RoomEvent
from app.models.room_member import RoomMember
from app.models.room_memory_bucket import RoomMemoryBucket
from app.models.study_room import StudyRoom
from app.models.user import User
from app.services.rooms.access import (
    get_room_for_user,
    get_user_room_role,
)
from app.services.rooms.foundation import (
    DEFAULT_MEMORY_BUCKETS,
    ROOM_ACTION_DEFINITIONS,
    ROOM_AI_OUTPUT_TYPES,
    ensure_room_foundation,
    from_json,
    log_room_event,
    to_json,
)
from app.utils.deps import get_current_user

router = APIRouter(tags=["Room Foundation"])


class RoomEventCreate(BaseModel):
    event_type: str
    title: str
    description: str | None = None
    details: dict[str, Any] | None = None


class RoomMemoryBucketUpdate(BaseModel):
    summary: str | None = None
    data: dict[str, Any] | None = None


def serialize_event(event: RoomEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "room_id": event.room_id,
        "user_id": event.user_id,
        "event_type": event.event_type,
        "title": event.title,
        "description": event.description,
        "details": from_json(event.details_json, {}),
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def serialize_member(member: RoomMember) -> dict[str, Any]:
    return {
        "id": member.id,
        "room_id": member.room_id,
        "user_id": member.user_id,
        "role": member.role,
        "status": member.status,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
        "last_active_at": member.last_active_at.isoformat()
        if member.last_active_at
        else None,
    }


def serialize_memory_bucket(bucket: RoomMemoryBucket) -> dict[str, Any]:
    return {
        "id": bucket.id,
        "room_id": bucket.room_id,
        "owner_id": bucket.owner_id,
        "bucket_type": bucket.bucket_type,
        "summary": bucket.summary or "",
        "data": from_json(bucket.data_json, {}),
        "created_at": bucket.created_at.isoformat() if bucket.created_at else None,
        "updated_at": bucket.updated_at.isoformat() if bucket.updated_at else None,
    }


def serialize_ai_output(output: RoomAIOutput) -> dict[str, Any]:
    return {
        "id": output.id,
        "room_id": output.room_id,
        "owner_id": output.owner_id,
        "output_type": output.output_type,
        "action_type": output.action_type,
        "title": output.title,
        "content": output.content,
        "content_json": from_json(output.content_json, {}),
        "source_type": output.source_type,
        "source_id": output.source_id,
        "linked_note_id": output.linked_note_id,
        "linked_quiz_id": output.linked_quiz_id,
        "linked_flashcard_ids": from_json(output.linked_flashcard_ids_json, []),
        "created_at": output.created_at.isoformat() if output.created_at else None,
    }


@router.get("/{room_id}")
def get_room_foundation(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = get_room_for_user(db=db, room_id=room_id, user_id=current_user.id)
    ensure_room_foundation(db=db, room=room, user_id=current_user.id)

    role = get_user_room_role(db=db, room=room, user_id=current_user.id)

    members = (
        db.query(RoomMember)
        .filter(RoomMember.room_id == room.id)
        .order_by(RoomMember.id.asc())
        .limit(100)
        .all()
    )

    memory_buckets = (
        db.query(RoomMemoryBucket)
        .filter(RoomMemoryBucket.room_id == room.id)
        .order_by(RoomMemoryBucket.bucket_type.asc())
        .all()
    )

    recent_events = (
        db.query(RoomEvent)
        .filter(RoomEvent.room_id == room.id)
        .order_by(RoomEvent.id.desc())
        .limit(25)
        .all()
    )

    recent_outputs = (
        db.query(RoomAIOutput)
        .filter(RoomAIOutput.room_id == room.id)
        .order_by(RoomAIOutput.id.desc())
        .limit(25)
        .all()
    )

    last_active_at = (
        recent_events[0].created_at.isoformat()
        if recent_events and recent_events[0].created_at
        else room.created_at.isoformat()
        if room.created_at
        else None
    )

    return {
        "room": {
            "id": room.id,
            "name": room.name,
            "subject": room.subject,
            "description": room.description,
            "owner_id": room.owner_id,
            "created_at": room.created_at.isoformat() if room.created_at else None,
            "last_active_at": last_active_at,
        },
        "permissions": {
            "role": role,
            "roles": ROOM_ROLES,
            "can_manage_room": role in {"owner", "admin"},
            "can_upload": role in {"owner", "admin", "member"},
            "can_use_ai": role in {"owner", "admin", "member", "ai_tutor"},
            "can_view": role in {"owner", "admin", "member", "viewer", "ai_tutor"},
        },
        "members": [serialize_member(member) for member in members],
        "memory_buckets": [serialize_memory_bucket(bucket) for bucket in memory_buckets],
        "recent_events": [serialize_event(event) for event in recent_events],
        "recent_outputs": [serialize_ai_output(output) for output in recent_outputs],
        "action_definitions": ROOM_ACTION_DEFINITIONS,
        "output_types": ROOM_AI_OUTPUT_TYPES,
        "context_engine": {
            "active_context": None,
            "available_sources": ["pdf", "note", "flashcards", "quiz", "chat"],
            "memory_bucket_types": DEFAULT_MEMORY_BUCKETS,
            "status": "foundation_ready",
        },
        "realtime": {
            "enabled": False,
            "channel": f"room:{room.id}",
            "note": "WebSocket room sync will attach to this channel later.",
        },
    }


@router.get("/{room_id}/events")
def get_room_events(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = get_room_for_user(db=db, room_id=room_id, user_id=current_user.id)
    ensure_room_foundation(db=db, room=room, user_id=current_user.id)

    events = (
        db.query(RoomEvent)
        .filter(RoomEvent.room_id == room.id)
        .order_by(RoomEvent.id.desc())
        .limit(100)
        .all()
    )

    return [serialize_event(event) for event in events]


@router.post("/{room_id}/events")
def create_room_event(
    room_id: int,
    data: RoomEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = get_room_for_user(db=db, room_id=room_id, user_id=current_user.id)
    ensure_room_foundation(db=db, room=room, user_id=current_user.id)

    event = log_room_event(
        db=db,
        room_id=room.id,
        user_id=current_user.id,
        event_type=data.event_type,
        title=data.title,
        description=data.description,
        details=data.details or {},
    )

    return serialize_event(event)


@router.get("/{room_id}/memory")
def get_room_memory(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = get_room_for_user(db=db, room_id=room_id, user_id=current_user.id)
    ensure_room_foundation(db=db, room=room, user_id=current_user.id)

    buckets = (
        db.query(RoomMemoryBucket)
        .filter(RoomMemoryBucket.room_id == room.id)
        .order_by(RoomMemoryBucket.bucket_type.asc())
        .all()
    )

    return [serialize_memory_bucket(bucket) for bucket in buckets]


@router.patch("/{room_id}/memory/{bucket_type}")
def update_room_memory_bucket(
    room_id: int,
    bucket_type: str,
    data: RoomMemoryBucketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = get_room_for_user(db=db, room_id=room_id, user_id=current_user.id)
    ensure_room_foundation(db=db, room=room, user_id=current_user.id)

    role = get_user_room_role(db=db, room=room, user_id=current_user.id)

    if role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="You cannot update room memory.")

    bucket = (
        db.query(RoomMemoryBucket)
        .filter(
            RoomMemoryBucket.room_id == room.id,
            RoomMemoryBucket.bucket_type == bucket_type,
        )
        .first()
    )

    if not bucket:
        raise HTTPException(status_code=404, detail="Room memory bucket not found")

    if data.summary is not None:
        bucket.summary = data.summary

    if data.data is not None:
        bucket.data_json = to_json(data.data)

    db.add(bucket)
    db.commit()
    db.refresh(bucket)

    return serialize_memory_bucket(bucket)
