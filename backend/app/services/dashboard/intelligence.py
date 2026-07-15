from __future__ import annotations

import base64
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ai_conversation import AIConversation
from app.models.dashboard_activity import DashboardActivity
from app.models.flashcard import Flashcard
from app.models.learning_event import LearningEvent
from app.models.note import Note
from app.models.pdf_document import PDFDocument
from app.models.quiz import Quiz
from app.models.quiz_attempt import QuizAttempt
from app.models.room_event import RoomEvent
from app.models.room_member import RoomMember
from app.models.room_message import RoomMessage
from app.models.room_read_state import RoomReadState
from app.models.study_material import StudyMaterial
from app.models.study_plan import StudyPlan
from app.models.study_room import StudyRoom
from app.models.user import User
from app.models.user_resume_state import UserResumeState
from app.services.legacy_material_notes import is_legacy_material_note


FEED_SOURCE_LIMIT = 150
SESSION_WINDOW_MINUTES = 30
DEDUPE_WINDOW_MINUTES = 20

ACTIVITY_ICONS = {
    "file": "📄",
    "room": "📚",
    "note": "📝",
    "quiz": "▤",
    "concept": "◫",
    "ai": "✦",
    "group": "💬",
    "progress": "📈",
    "plan": "🗓️",
}

REVIEW_ACTIVITY_TYPES = {
    "flashcard",
    "quiz_question",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def iso_timestamp(value: datetime | None) -> str:
    normalized = as_utc(value) or utc_now()
    return normalized.isoformat()


def parse_json_object(value: str | None) -> dict[str, Any]:
    if not value:
        return {}

    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return {}

    return parsed if isinstance(parsed, dict) else {}


def clean_text(value: str | None, limit: int = 180) -> str:
    clean = " ".join((value or "").split())

    if len(clean) <= limit:
        return clean

    return clean[: max(0, limit - 1)].rstrip() + "…"


def room_href(
    room_id: int,
    tab: str | None = None,
) -> str:
    base = f"/study-rooms/{room_id}"

    if tab:
        return f"{base}?tab={tab}"

    return base


def material_href(
    room_id: int,
    material_id: int,
    filename: str | None = None,
) -> str:
    href = (
        f"{room_href(room_id, 'materials')}"
        f"&materialId={material_id}"
    )

    if filename:
        href += (
            "&materialName="
            f"{quote(filename, safe='')}"
        )

    return href


def make_feed_item(
    *,
    item_id: str,
    activity_type: str,
    event: str,
    timestamp: datetime | None,
    title: str,
    description: str,
    action_label: str,
    action_href: str,
    room_id: int | None = None,
    room_name: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actor_name: str | None = None,
    priority: int = 0,
    session_id: str | None = None,
    dedupe_key: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_timestamp = as_utc(timestamp) or utc_now()

    return {
        "id": item_id,
        "type": activity_type,
        "event": event,
        "timestamp": normalized_timestamp,
        "title": clean_text(title, 140),
        "description": clean_text(description, 240),
        "icon": ACTIVITY_ICONS.get(activity_type, "•"),
        "room_id": room_id,
        "room_name": room_name,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "actor_name": actor_name,
        "action_label": action_label,
        "action_href": action_href,
        "priority": priority,
        "session_id": session_id,
        "dedupe_key": dedupe_key,
        "metadata": metadata or {},
    }


def serialize_feed_item(
    item: dict[str, Any],
) -> dict[str, Any]:
    return {
        **item,
        "timestamp": iso_timestamp(item.get("timestamp")),
    }


def get_accessible_rooms(
    db: Session,
    user_id: int,
) -> tuple[list[int], dict[int, StudyRoom]]:
    owned_ids = {
        row[0]
        for row in (
            db.query(StudyRoom.id)
            .filter(StudyRoom.owner_id == user_id)
            .all()
        )
    }

    member_ids = {
        row[0]
        for row in (
            db.query(RoomMember.room_id)
            .filter(
                RoomMember.user_id == user_id,
                RoomMember.status == "active",
            )
            .all()
        )
    }

    room_ids = sorted(owned_ids | member_ids)

    if not room_ids:
        return [], {}

    rooms = (
        db.query(StudyRoom)
        .filter(StudyRoom.id.in_(room_ids))
        .all()
    )

    return room_ids, {
        room.id: room
        for room in rooms
    }


def get_user_names(
    db: Session,
    user_ids: set[int],
) -> dict[int, str]:
    if not user_ids:
        return {}

    users = (
        db.query(User)
        .filter(User.id.in_(sorted(user_ids)))
        .all()
    )

    return {
        user.id: (
            user.full_name
            or user.email.split("@")[0]
            or "Student"
        )
        for user in users
    }


def floor_session_time(value: datetime) -> datetime:
    normalized = as_utc(value) or utc_now()

    minute = (
        normalized.minute
        // SESSION_WINDOW_MINUTES
        * SESSION_WINDOW_MINUTES
    )

    return normalized.replace(
        minute=minute,
        second=0,
        microsecond=0,
    )


def derived_session_key(
    *,
    activity_type: str,
    room_id: int | None,
    timestamp: datetime,
) -> str:
    bucket = floor_session_time(timestamp)

    return (
        f"{activity_type}:"
        f"{room_id or 'global'}:"
        f"{bucket.isoformat()}"
    )


def encode_cursor(item: dict[str, Any]) -> str:
    payload = {
        "timestamp": iso_timestamp(item.get("timestamp")),
        "id": str(item.get("id") or ""),
    }

    raw = json.dumps(
        payload,
        separators=(",", ":"),
    ).encode("utf-8")

    return (
        base64.urlsafe_b64encode(raw)
        .decode("ascii")
        .rstrip("=")
    )


def decode_cursor(
    cursor: str | None,
) -> tuple[datetime, str] | None:
    if not cursor:
        return None

    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(
            cursor + padding
        )

        payload = json.loads(
            raw.decode("utf-8")
        )

        timestamp = datetime.fromisoformat(
            str(payload["timestamp"])
        )

        return (
            as_utc(timestamp) or utc_now(),
            str(payload["id"]),
        )
    except (
        KeyError,
        TypeError,
        ValueError,
        json.JSONDecodeError,
    ):
        return None



def ensure_room_read_state_baseline(
    db: Session,
    *,
    user_id: int,
    room_ids: list[int],
) -> None:
    """
    Establish a one-time read baseline for rooms that existed before
    per-user unread tracking was introduced.

    Existing message history is considered already seen. Messages created
    after this baseline become unread until the student opens the group.
    """

    if not room_ids:
        return

    existing_room_ids = {
        row[0]
        for row in (
            db.query(RoomReadState.room_id)
            .filter(
                RoomReadState.user_id == user_id,
                RoomReadState.room_id.in_(room_ids),
            )
            .all()
        )
    }

    missing_room_ids = [
        room_id
        for room_id in room_ids
        if room_id not in existing_room_ids
    ]

    if not missing_room_ids:
        return

    latest_rows = (
        db.query(
            RoomMessage.room_id,
            func.max(RoomMessage.id),
        )
        .filter(
            RoomMessage.room_id.in_(
                missing_room_ids
            )
        )
        .group_by(RoomMessage.room_id)
        .all()
    )

    latest_message_by_room = {
        room_id: latest_message_id
        for room_id, latest_message_id
        in latest_rows
    }

    baseline_time = utc_now()

    for room_id in missing_room_ids:
        db.add(
            RoomReadState(
                room_id=room_id,
                user_id=user_id,
                last_read_message_id=(
                    latest_message_by_room.get(
                        room_id
                    )
                ),
                last_read_at=baseline_time,
            )
        )

    db.commit()


def build_unread_group_activity(
    db: Session,
    *,
    user_id: int,
    room_ids: list[int],
    rooms_by_id: dict[int, StudyRoom],
) -> tuple[list[dict[str, Any]], int]:
    if not room_ids:
        return [], 0

    read_states = (
        db.query(RoomReadState)
        .filter(
            RoomReadState.user_id == user_id,
            RoomReadState.room_id.in_(room_ids),
        )
        .all()
    )

    read_by_room = {
        state.room_id: state.last_read_message_id or 0
        for state in read_states
    }

    group_items: list[dict[str, Any]] = []
    total_unread = 0

    for room_id in room_ids:
        last_read_message_id = read_by_room.get(
            room_id,
            0,
        )

        unread_query = (
            db.query(RoomMessage)
            .filter(
                RoomMessage.room_id == room_id,
                RoomMessage.id > last_read_message_id,
                RoomMessage.deleted_at.is_(None),
                RoomMessage.sender_id.isnot(None),
                RoomMessage.sender_id != user_id,
                RoomMessage.message_type.in_(
                    ["message", "attachment"]
                ),
            )
        )

        unread_count = unread_query.count()

        if unread_count <= 0:
            continue

        latest_message = (
            unread_query
            .order_by(RoomMessage.id.desc())
            .first()
        )

        if latest_message is None:
            continue

        sender = (
            db.query(User)
            .filter(User.id == latest_message.sender_id)
            .first()
        )

        actor_name = (
            sender.full_name
            if sender and sender.full_name
            else "A classmate"
        )

        room = rooms_by_id.get(room_id)
        room_name = (
            room.name
            if room
            else "Study group"
        )

        total_unread += unread_count

        group_items.append(
            make_feed_item(
                item_id=f"group-unread-{room_id}",
                activity_type="group",
                event="unread_group_messages",
                timestamp=latest_message.created_at,
                title=(
                    f"{unread_count} new message"
                    f"{'' if unread_count == 1 else 's'} "
                    f"in {room_name}"
                ),
                description=(
                    f"{actor_name}: "
                    f"{clean_text(latest_message.content, 120)}"
                ),
                action_label="Open group",
                action_href=room_href(
                    room_id,
                    "together",
                ),
                room_id=room_id,
                room_name=room_name,
                entity_type="room_message",
                entity_id=latest_message.id,
                actor_name=actor_name,
                priority=95,
                dedupe_key=f"unread-group:{room_id}",
                metadata={
                    "unread_count": unread_count,
                    "last_message_id": latest_message.id,
                },
            )
        )

    group_items.sort(
        key=lambda item: (
            item["timestamp"],
            item["id"],
        ),
        reverse=True,
    )

    return group_items, total_unread


def build_weak_topics(
    db: Session,
    *,
    user_id: int,
    rooms_by_id: dict[int, StudyRoom],
) -> list[dict[str, Any]]:
    events = (
        db.query(LearningEvent)
        .filter(
            LearningEvent.user_id == user_id,
            LearningEvent.activity_type.in_(
                sorted(REVIEW_ACTIVITY_TYPES)
            ),
        )
        .order_by(LearningEvent.created_at.desc())
        .limit(1000)
        .all()
    )

    grouped: dict[int | None, dict[str, Any]] = defaultdict(
        lambda: {
            "reviewed": 0,
            "correct": 0,
            "wrong": 0,
            "last_at": None,
        }
    )

    for event in events:
        stats = grouped[event.study_room_id]
        stats["reviewed"] += 1

        if event.result == "correct":
            stats["correct"] += 1

        if event.result == "wrong":
            stats["wrong"] += 1

        event_time = as_utc(event.created_at)

        if (
            event_time is not None
            and (
                stats["last_at"] is None
                or event_time > stats["last_at"]
            )
        ):
            stats["last_at"] = event_time

    weak_topics: list[dict[str, Any]] = []

    for room_id, stats in grouped.items():
        reviewed = int(stats["reviewed"])
        correct = int(stats["correct"])
        wrong = int(stats["wrong"])

        if reviewed <= 0:
            continue

        accuracy = round(
            (correct / reviewed) * 100
        )

        if not (
            wrong > correct
            or accuracy < 60
        ):
            continue

        room = (
            rooms_by_id.get(room_id)
            if room_id is not None
            else None
        )

        subject = (
            room.subject
            if room and room.subject
            else room.name
            if room
            else "General"
        )

        weak_topics.append({
            "room_id": room_id,
            "room_name": room.name if room else None,
            "subject": subject,
            "reviewed": reviewed,
            "correct": correct,
            "wrong": wrong,
            "accuracy": accuracy,
            "last_at": stats["last_at"],
        })

    weak_topics.sort(
        key=lambda item: (
            item["accuracy"],
            -item["wrong"],
        )
    )

    return weak_topics[:5]


def build_persisted_activity_items(
    db: Session,
    *,
    user_id: int,
    rooms_by_id: dict[int, StudyRoom],
) -> list[dict[str, Any]]:
    rows = (
        db.query(DashboardActivity)
        .filter(DashboardActivity.user_id == user_id)
        .order_by(
            DashboardActivity.occurred_at.desc(),
            DashboardActivity.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    actor_ids = {
        row.actor_user_id
        for row in rows
        if row.actor_user_id is not None
    }

    actor_names = get_user_names(
        db,
        actor_ids,
    )

    items: list[dict[str, Any]] = []

    for row in rows:
        room = (
            rooms_by_id.get(row.room_id)
            if row.room_id is not None
            else None
        )

        metadata = parse_json_object(
            row.metadata_json
        )

        activity_type = (
            row.activity_type
            if row.activity_type in ACTIVITY_ICONS
            else "progress"
        )

        items.append(
            make_feed_item(
                item_id=f"activity-{row.id}",
                activity_type=activity_type,
                event=metadata.get(
                    "event",
                    row.activity_type,
                ),
                timestamp=row.occurred_at,
                title=row.title,
                description=row.description or "",
                action_label=(
                    row.action_label
                    or "Open"
                ),
                action_href=(
                    row.action_href
                    or (
                        room_href(row.room_id)
                        if (
                            room
                            and row.room_id is not None
                        )
                        else "/dashboard"
                    )
                ),
                room_id=row.room_id,
                room_name=room.name if room else None,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                actor_name=actor_names.get(
                    row.actor_user_id
                ),
                priority=row.priority,
                session_id=row.session_key,
                dedupe_key=row.dedupe_key,
                metadata={
                    **metadata,
                    "is_resolved": row.is_resolved,
                },
            )
        )

    return items


def build_material_items(
    db: Session,
    *,
    user_id: int,
    room_ids: list[int],
    rooms_by_id: dict[int, StudyRoom],
) -> tuple[list[dict[str, Any]], list[StudyMaterial]]:
    if not room_ids:
        return [], []

    materials = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.study_room_id.in_(
                room_ids
            )
        )
        .order_by(
            StudyMaterial.created_at.desc(),
            StudyMaterial.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    actor_names = get_user_names(
        db,
        {
            material.owner_id
            for material in materials
        },
    )

    items: list[dict[str, Any]] = []

    for material in materials:
        room = rooms_by_id.get(
            material.study_room_id
        )

        actor_name = actor_names.get(
            material.owner_id,
            "A student",
        )

        is_current_user = (
            material.owner_id == user_id
        )

        title = (
            f"You uploaded {material.original_filename}"
            if is_current_user
            else (
                f"{actor_name} uploaded "
                f"{material.original_filename}"
            )
        )

        items.append(
            make_feed_item(
                item_id=f"material-{material.id}",
                activity_type="file",
                event="material_uploaded",
                timestamp=material.created_at,
                title=title,
                description=(
                    f"Added to "
                    f"{room.name if room else 'a Study Room'}"
                ),
                action_label="Open file",
                action_href=material_href(
                    material.study_room_id,
                    material.id,
                    material.original_filename,
                ),
                room_id=material.study_room_id,
                room_name=room.name if room else None,
                entity_type="study_material",
                entity_id=material.id,
                actor_name=actor_name,
                session_id=derived_session_key(
                    activity_type="file",
                    room_id=material.study_room_id,
                    timestamp=(
                        as_utc(material.created_at)
                        or utc_now()
                    ),
                ),
                dedupe_key=(
                    f"material-upload:{material.id}"
                ),
                metadata={
                    "material_type": material.material_type,
                    "last_opened_at": (
                        iso_timestamp(
                            material.last_opened_at
                        )
                        if material.last_opened_at
                        else None
                    ),
                },
            )
        )

        if material.last_opened_at is not None:
            items.append(
                make_feed_item(
                    item_id=(
                        f"material-opened-{material.id}"
                    ),
                    activity_type="file",
                    event="material_opened",
                    timestamp=material.last_opened_at,
                    title=(
                        f"You studied "
                        f"{material.original_filename}"
                    ),
                    description=(
                        f"Opened from "
                        f"{room.name if room else 'a Study Room'}"
                    ),
                    action_label="Open again",
                    action_href=material_href(
                    material.study_room_id,
                    material.id,
                    material.original_filename,
                ),
                    room_id=material.study_room_id,
                    room_name=room.name if room else None,
                    entity_type="study_material",
                    entity_id=material.id,
                    actor_name=None,
                    session_id=derived_session_key(
                        activity_type="file",
                        room_id=material.study_room_id,
                        timestamp=(
                            as_utc(
                                material.last_opened_at
                            )
                            or utc_now()
                        ),
                    ),
                    dedupe_key=(
                        f"material-opened:{material.id}"
                    ),
                )
            )

    return items, materials


def build_legacy_pdf_items(
    db: Session,
    *,
    user_id: int,
    rooms_by_id: dict[int, StudyRoom],
    material_keys: set[tuple[int, str]],
) -> list[dict[str, Any]]:
    pdfs = (
        db.query(PDFDocument)
        .filter(PDFDocument.owner_id == user_id)
        .order_by(
            PDFDocument.created_at.desc(),
            PDFDocument.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    items: list[dict[str, Any]] = []

    for pdf in pdfs:
        duplicate_key = (
            pdf.study_room_id,
            pdf.original_filename.lower(),
        )

        if duplicate_key in material_keys:
            continue

        room = rooms_by_id.get(
            pdf.study_room_id
        )

        items.append(
            make_feed_item(
                item_id=f"legacy-pdf-{pdf.id}",
                activity_type="file",
                event="pdf_uploaded",
                timestamp=pdf.created_at,
                title=(
                    f"You uploaded "
                    f"{pdf.original_filename}"
                ),
                description=(
                    f"Added to "
                    f"{room.name if room else 'a Study Room'}"
                ),
                action_label="Open PDF",
                action_href=room_href(
                    pdf.study_room_id,
                    "materials",
                ),
                room_id=pdf.study_room_id,
                room_name=room.name if room else None,
                entity_type="pdf_document",
                entity_id=pdf.id,
                dedupe_key=f"pdf-upload:{pdf.id}",
            )
        )

    return items


def build_note_items(
    db: Session,
    *,
    user_id: int,
    rooms_by_id: dict[int, StudyRoom],
) -> tuple[list[dict[str, Any]], list[Note]]:
    all_notes = (
        db.query(Note)
        .filter(Note.owner_id == user_id)
        .order_by(
            Note.created_at.desc(),
            Note.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    notes = [
        note
        for note in all_notes
        if not is_legacy_material_note(note)
    ]

    items: list[dict[str, Any]] = []

    for note in notes:
        room = rooms_by_id.get(
            note.study_room_id
        )

        items.append(
            make_feed_item(
                item_id=f"note-{note.id}",
                activity_type="note",
                event="note_created",
                timestamp=note.created_at,
                title=f"You created {note.title}",
                description=clean_text(
                    note.content,
                    150,
                )
                or "A new note is ready to continue.",
                action_label="Open note",
                action_href=(
                    f"/notes?roomId={note.study_room_id}"
                    f"&noteId={note.id}"
                ),
                room_id=note.study_room_id,
                room_name=room.name if room else None,
                entity_type="note",
                entity_id=note.id,
                dedupe_key=f"note-created:{note.id}",
            )
        )

    return items, notes


def build_quiz_items(
    db: Session,
    *,
    user_id: int,
    rooms_by_id: dict[int, StudyRoom],
) -> tuple[
    list[dict[str, Any]],
    list[Quiz],
    list[QuizAttempt],
]:
    quizzes = (
        db.query(Quiz)
        .filter(Quiz.owner_id == user_id)
        .order_by(
            Quiz.created_at.desc(),
            Quiz.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    quiz_by_id = {
        quiz.id: quiz
        for quiz in quizzes
    }

    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.user_id == user_id)
        .order_by(
            QuizAttempt.created_at.desc(),
            QuizAttempt.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    items: list[dict[str, Any]] = []

    for quiz in quizzes:
        room = rooms_by_id.get(
            quiz.study_room_id
        )

        items.append(
            make_feed_item(
                item_id=f"quiz-{quiz.id}",
                activity_type="quiz",
                event="quiz_created",
                timestamp=quiz.created_at,
                title=f"You created {quiz.title}",
                description=(
                    f"Quiz in "
                    f"{room.name if room else 'a Study Room'}"
                ),
                action_label="Start quiz",
                action_href=(
                    f"/quizzes?roomId={quiz.study_room_id}"
                    f"&quizId={quiz.id}"
                ),
                room_id=quiz.study_room_id,
                room_name=room.name if room else None,
                entity_type="quiz",
                entity_id=quiz.id,
                dedupe_key=f"quiz-created:{quiz.id}",
            )
        )

    for attempt in attempts:
        quiz = quiz_by_id.get(
            attempt.quiz_id
        )

        if quiz is None:
            quiz = (
                db.query(Quiz)
                .filter(Quiz.id == attempt.quiz_id)
                .first()
            )

        if quiz is None:
            continue

        room = rooms_by_id.get(
            quiz.study_room_id
        )

        score = attempt.score or 0
        total = attempt.total or 0

        percentage = (
            round((score / total) * 100)
            if total > 0
            else 0
        )

        items.append(
            make_feed_item(
                item_id=f"quiz-attempt-{attempt.id}",
                activity_type="quiz",
                event="quiz_completed",
                timestamp=attempt.created_at,
                title=f"You completed {quiz.title}",
                description=(
                    f"Score: {score}/{total}"
                    f"{f' · {percentage}%' if total else ''}"
                ),
                action_label="Review quiz",
                action_href=(
                    f"/quizzes?roomId={quiz.study_room_id}"
                    f"&quizId={quiz.id}"
                ),
                room_id=quiz.study_room_id,
                room_name=room.name if room else None,
                entity_type="quiz_attempt",
                entity_id=attempt.id,
                priority=(
                    60
                    if total > 0 and percentage < 60
                    else 0
                ),
                dedupe_key=(
                    f"quiz-attempt:{attempt.id}"
                ),
                metadata={
                    "quiz_id": quiz.id,
                    "score": score,
                    "total": total,
                    "percentage": percentage,
                },
            )
        )

    return items, quizzes, attempts


def build_ai_items(
    db: Session,
    *,
    user_id: int,
    rooms_by_id: dict[int, StudyRoom],
) -> tuple[list[dict[str, Any]], list[AIConversation]]:
    conversations = (
        db.query(AIConversation)
        .filter(
            AIConversation.owner_id == user_id
        )
        .order_by(
            AIConversation.updated_at.desc(),
            AIConversation.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    items: list[dict[str, Any]] = []

    for conversation in conversations:
        room = (
            rooms_by_id.get(
                conversation.study_room_id
            )
            if conversation.study_room_id
            else None
        )

        href = (
            room_href(
                conversation.study_room_id,
                "ai",
            )
            if conversation.study_room_id
            else (
                "/general-ai?"
                f"conversationId={conversation.id}"
            )
        )

        items.append(
            make_feed_item(
                item_id=(
                    f"ai-conversation-{conversation.id}"
                ),
                activity_type="ai",
                event="ai_conversation_updated",
                timestamp=(
                    conversation.updated_at
                    or conversation.created_at
                ),
                title=conversation.title,
                description=(
                    "Continue your StudySnap AI conversation."
                ),
                action_label="Continue chat",
                action_href=href,
                room_id=conversation.study_room_id,
                room_name=room.name if room else None,
                entity_type="ai_conversation",
                entity_id=conversation.id,
                dedupe_key=(
                    f"ai-conversation:{conversation.id}"
                ),
                metadata={
                    "surface": conversation.surface,
                    "mode": conversation.mode,
                    "is_pinned": conversation.is_pinned,
                },
            )
        )

    return items, conversations


def build_learning_event_items(
    db: Session,
    *,
    user_id: int,
    rooms_by_id: dict[int, StudyRoom],
) -> list[dict[str, Any]]:
    events = (
        db.query(LearningEvent)
        .filter(LearningEvent.user_id == user_id)
        .order_by(
            LearningEvent.created_at.desc(),
            LearningEvent.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    items: list[dict[str, Any]] = []

    for event in events:
        room = (
            rooms_by_id.get(
                event.study_room_id
            )
            if event.study_room_id
            else None
        )

        is_quiz = (
            event.activity_type == "quiz_question"
        )

        activity_type = (
            "quiz"
            if is_quiz
            else "concept"
            if event.activity_type == "flashcard"
            else "progress"
        )

        title = (
            "You answered a quiz question"
            if is_quiz
            else "You reviewed a Concept Card"
            if event.activity_type == "flashcard"
            else "You completed a learning activity"
        )

        result_text = (
            event.result.capitalize()
            if event.result
            else "Reviewed"
        )

        items.append(
            make_feed_item(
                item_id=f"learning-event-{event.id}",
                activity_type=activity_type,
                event=event.activity_type,
                timestamp=event.created_at,
                title=title,
                description=(
                    f"{result_text}"
                    + (
                        f" · Confidence {event.confidence}%"
                        if event.confidence is not None
                        else ""
                    )
                ),
                action_label=(
                    "Practice again"
                    if room
                    else "View progress"
                ),
                action_href=(
                    f"/quizzes?roomId={event.study_room_id}"
                    if is_quiz and event.study_room_id
                    else (
                        f"/flashcards?roomId={event.study_room_id}"
                        if (
                            event.activity_type == "flashcard"
                            and event.study_room_id
                        )
                        else "/progress"
                    )
                ),
                room_id=event.study_room_id,
                room_name=room.name if room else None,
                entity_type=event.activity_type,
                entity_id=event.reference_id,
                priority=(
                    70
                    if event.result == "wrong"
                    else 0
                ),
                session_id=derived_session_key(
                    activity_type=activity_type,
                    room_id=event.study_room_id,
                    timestamp=(
                        as_utc(event.created_at)
                        or utc_now()
                    ),
                ),
                dedupe_key=None,
                metadata={
                    "result": event.result,
                    "confidence": event.confidence,
                },
            )
        )

    return items


def build_group_message_feed_items(
    db: Session,
    *,
    user_id: int,
    room_ids: list[int],
    rooms_by_id: dict[int, StudyRoom],
) -> list[dict[str, Any]]:
    if not room_ids:
        return []

    messages = (
        db.query(RoomMessage)
        .filter(
            RoomMessage.room_id.in_(room_ids),
            RoomMessage.deleted_at.is_(None),
            RoomMessage.sender_id.isnot(None),
            RoomMessage.sender_id != user_id,
            RoomMessage.message_type.in_(
                ["message", "attachment"]
            ),
        )
        .order_by(
            RoomMessage.created_at.desc(),
            RoomMessage.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    actor_names = get_user_names(
        db,
        {
            message.sender_id
            for message in messages
            if message.sender_id is not None
        },
    )

    items: list[dict[str, Any]] = []

    for message in messages:
        room = rooms_by_id.get(
            message.room_id
        )

        actor_name = actor_names.get(
            message.sender_id,
            "A classmate",
        )

        items.append(
            make_feed_item(
                item_id=f"group-message-{message.id}",
                activity_type="group",
                event="group_message_received",
                timestamp=message.created_at,
                title=(
                    f"{actor_name} posted in "
                    f"{room.name if room else 'a study group'}"
                ),
                description=clean_text(
                    message.content,
                    170,
                ),
                action_label="Open group",
                action_href=room_href(
                    message.room_id,
                    "together",
                ),
                room_id=message.room_id,
                room_name=room.name if room else None,
                entity_type="room_message",
                entity_id=message.id,
                actor_name=actor_name,
                session_id=derived_session_key(
                    activity_type="group",
                    room_id=message.room_id,
                    timestamp=(
                        as_utc(message.created_at)
                        or utc_now()
                    ),
                ),
                dedupe_key=(
                    f"group-message:{message.id}"
                ),
            )
        )

    return items


def build_room_event_items(
    db: Session,
    *,
    room_ids: list[int],
    rooms_by_id: dict[int, StudyRoom],
) -> list[dict[str, Any]]:
    if not room_ids:
        return []

    events = (
        db.query(RoomEvent)
        .filter(RoomEvent.room_id.in_(room_ids))
        .order_by(
            RoomEvent.created_at.desc(),
            RoomEvent.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    actor_names = get_user_names(
        db,
        {
            event.user_id
            for event in events
            if event.user_id is not None
        },
    )

    items: list[dict[str, Any]] = []

    for event in events:
        room = rooms_by_id.get(
            event.room_id
        )

        details = parse_json_object(
            event.details_json
        )

        event_type = (
            "file"
            if "material" in event.event_type
            or "upload" in event.event_type
            else "quiz"
            if "quiz" in event.event_type
            else "note"
            if "note" in event.event_type
            else "ai"
            if "ai" in event.event_type
            else "room"
        )

        items.append(
            make_feed_item(
                item_id=f"room-event-{event.id}",
                activity_type=event_type,
                event=event.event_type,
                timestamp=event.created_at,
                title=event.title,
                description=event.description or "",
                action_label=details.get(
                    "action_label",
                    "Open room",
                ),
                action_href=details.get(
                    "action_href",
                    room_href(event.room_id),
                ),
                room_id=event.room_id,
                room_name=room.name if room else None,
                entity_type=details.get(
                    "entity_type"
                ),
                entity_id=details.get(
                    "entity_id"
                )
                if isinstance(
                    details.get("entity_id"),
                    int,
                )
                else None,
                actor_name=actor_names.get(
                    event.user_id
                ),
                session_id=derived_session_key(
                    activity_type=event_type,
                    room_id=event.room_id,
                    timestamp=(
                        as_utc(event.created_at)
                        or utc_now()
                    ),
                ),
                dedupe_key=details.get(
                    "dedupe_key"
                ),
                metadata=details,
            )
        )

    return items


def build_plan_items(
    db: Session,
    *,
    user_id: int,
) -> tuple[list[dict[str, Any]], list[StudyPlan]]:
    plans = (
        db.query(StudyPlan)
        .filter(StudyPlan.user_id == user_id)
        .order_by(
            StudyPlan.created_at.desc(),
            StudyPlan.id.desc(),
        )
        .limit(FEED_SOURCE_LIMIT)
        .all()
    )

    items: list[dict[str, Any]] = []

    for plan in plans:
        items.append(
            make_feed_item(
                item_id=f"study-plan-{plan.id}",
                activity_type="plan",
                event="study_plan_created",
                timestamp=plan.created_at,
                title=plan.title or "Study plan",
                description=(
                    plan.description
                    or "A study plan is ready."
                ),
                action_label="Open planner",
                action_href="/planner",
                entity_type="study_plan",
                entity_id=plan.id,
                dedupe_key=f"study-plan:{plan.id}",
                metadata={
                    "scheduled_for": (
                        iso_timestamp(
                            plan.scheduled_for
                        )
                        if plan.scheduled_for
                        else None
                    ),
                },
            )
        )

    return items, plans


def grouped_title(
    item: dict[str, Any],
    count: int,
) -> str:
    event = item.get("event")

    if event == "flashcard":
        return (
            f"You reviewed {count} Concept Cards"
        )

    if event == "quiz_question":
        return (
            f"You answered {count} quiz questions"
        )

    if event == "material_opened":
        entity_name = (
            item.get("title", "")
            .removeprefix("You studied ")
        )

        return (
            f"You studied {entity_name}"
            if entity_name
            else f"You opened a file {count} times"
        )

    return item["title"]


def group_and_dedupe_items(
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    ordered = sorted(
        items,
        key=lambda item: (
            item["timestamp"],
            item["id"],
        ),
        reverse=True,
    )

    result: list[dict[str, Any]] = []
    exact_keys: set[str] = set()
    recent_by_signature: dict[
        str,
        dict[str, Any],
    ] = {}

    for item in ordered:
        exact_key = item.get("dedupe_key")

        if exact_key:
            if exact_key in exact_keys:
                continue

            exact_keys.add(exact_key)

        entity_part = (
            str(item.get("entity_id"))
            if item.get("entity_id") is not None
            else "session"
        )

        signature = ":".join([
            str(item.get("event") or item["type"]),
            str(item.get("room_id") or "global"),
            str(item.get("entity_type") or "none"),
            entity_part,
        ])

        existing = recent_by_signature.get(
            signature
        )

        if existing is not None:
            newest_time = as_utc(
                existing["timestamp"]
            ) or utc_now()

            item_time = as_utc(
                item["timestamp"]
            ) or utc_now()

            difference = abs(
                newest_time - item_time
            )

            if difference <= timedelta(
                minutes=DEDUPE_WINDOW_MINUTES
            ):
                count = int(
                    existing["metadata"].get(
                        "grouped_count",
                        1,
                    )
                ) + 1

                existing["metadata"][
                    "grouped_count"
                ] = count

                existing["title"] = grouped_title(
                    existing,
                    count,
                )

                base_description = str(
                    existing["metadata"].get(
                        "base_description",
                        existing["description"],
                    )
                )

                existing["metadata"].setdefault(
                    "base_description",
                    base_description,
                )

                existing["description"] = (
                    f"{base_description} "
                    f"· {count} related actions"
                ).strip()

                continue

        copied = {
            **item,
            "metadata": dict(
                item.get("metadata") or {}
            ),
        }

        copied["metadata"].setdefault(
            "grouped_count",
            1,
        )

        result.append(copied)
        recent_by_signature[signature] = copied

    return result


def build_continue_learning(
    db: Session,
    *,
    user_id: int,
    rooms_by_id: dict[int, StudyRoom],
    materials: list[StudyMaterial],
    notes: list[Note],
    conversations: list[AIConversation],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    resume = (
        db.query(UserResumeState)
        .filter(UserResumeState.user_id == user_id)
        .first()
    )

    seen_keys: set[str] = set()

    if resume is not None:
        metadata = parse_json_object(
            resume.metadata_json
        )

        room = (
            rooms_by_id.get(resume.last_room_id)
            if resume.last_room_id
            else None
        )

        href = (
            resume.last_action_href
            or (
                room_href(
                    resume.last_room_id,
                    resume.last_room_tab,
                )
                if resume.last_room_id
                else "/dashboard"
            )
        )

        title = (
            metadata.get("title")
            or (
                f"Continue {room.name}"
                if room
                else "Continue where you stopped"
            )
        )

        key = (
            f"{resume.last_entity_type}:"
            f"{resume.last_entity_id}"
        )

        seen_keys.add(key)

        items.append({
            "id": "resume-state",
            "type": (
                resume.last_entity_type
                or resume.last_action_type
                or "room"
            ),
            "title": clean_text(title, 140),
            "description": clean_text(
                metadata.get("description")
                or (
                    f"Return to "
                    f"{room.name if room else 'your recent work'}."
                ),
                220,
            ),
            "icon": ACTIVITY_ICONS.get(
                resume.last_entity_type
                or resume.last_action_type
                or "room",
                "📖",
            ),
            "room_id": resume.last_room_id,
            "room_name": room.name if room else None,
            "entity_type": resume.last_entity_type,
            "entity_id": resume.last_entity_id,
            "action_label": (
                metadata.get("action_label")
                or "Continue"
            ),
            "action_href": href,
            "progress_percent": (
                metadata.get("progress_percent")
                if isinstance(
                    metadata.get("progress_percent"),
                    int,
                )
                else None
            ),
            "last_active_at": iso_timestamp(
                resume.last_action_at
                or resume.updated_at
            ),
            "metadata": metadata,
        })

    opened_materials = sorted(
        [
            material
            for material in materials
            if material.last_opened_at is not None
        ],
        key=lambda material: (
            as_utc(material.last_opened_at)
            or datetime.min.replace(
                tzinfo=timezone.utc
            )
        ),
        reverse=True,
    )

    for material in opened_materials:
        key = f"study_material:{material.id}"

        if key in seen_keys:
            continue

        room = rooms_by_id.get(
            material.study_room_id
        )

        seen_keys.add(key)

        items.append({
            "id": f"continue-material-{material.id}",
            "type": "file",
            "title": material.original_filename,
            "description": (
                f"Continue in "
                f"{room.name if room else 'your Study Room'}."
            ),
            "icon": ACTIVITY_ICONS["file"],
            "room_id": material.study_room_id,
            "room_name": room.name if room else None,
            "entity_type": "study_material",
            "entity_id": material.id,
            "action_label": "Open again",
            "action_href": material_href(
                material.study_room_id,
                material.id,
                material.original_filename,
            ),
            "progress_percent": None,
            "last_active_at": iso_timestamp(
                material.last_opened_at
            ),
            "metadata": {
                "material_type": material.material_type,
            },
        })

        if len(items) >= 4:
            break

    for conversation in conversations:
        key = f"ai_conversation:{conversation.id}"

        if key in seen_keys:
            continue

        room = (
            rooms_by_id.get(
                conversation.study_room_id
            )
            if conversation.study_room_id
            else None
        )

        href = (
            room_href(
                conversation.study_room_id,
                "ai",
            )
            if conversation.study_room_id
            else (
                "/general-ai?"
                f"conversationId={conversation.id}"
            )
        )

        seen_keys.add(key)

        items.append({
            "id": (
                f"continue-ai-{conversation.id}"
            ),
            "type": "ai",
            "title": conversation.title,
            "description": (
                "Continue your recent StudySnap conversation."
            ),
            "icon": ACTIVITY_ICONS["ai"],
            "room_id": conversation.study_room_id,
            "room_name": room.name if room else None,
            "entity_type": "ai_conversation",
            "entity_id": conversation.id,
            "action_label": "Continue chat",
            "action_href": href,
            "progress_percent": None,
            "last_active_at": iso_timestamp(
                conversation.updated_at
                or conversation.created_at
            ),
            "metadata": {
                "surface": conversation.surface,
            },
        })

        if len(items) >= 4:
            break

    for note in notes:
        key = f"note:{note.id}"

        if key in seen_keys:
            continue

        room = rooms_by_id.get(
            note.study_room_id
        )

        seen_keys.add(key)

        items.append({
            "id": f"continue-note-{note.id}",
            "type": "note",
            "title": note.title,
            "description": (
                f"Continue editing in "
                f"{room.name if room else 'your Study Room'}."
            ),
            "icon": ACTIVITY_ICONS["note"],
            "room_id": note.study_room_id,
            "room_name": room.name if room else None,
            "entity_type": "note",
            "entity_id": note.id,
            "action_label": "Open note",
            "action_href": (
                f"/notes?roomId={note.study_room_id}"
                f"&noteId={note.id}"
            ),
            "progress_percent": None,
            "last_active_at": iso_timestamp(
                note.created_at
            ),
            "metadata": {},
        })

        if len(items) >= 4:
            break

    items.sort(
        key=lambda item: item["last_active_at"],
        reverse=True,
    )

    return items[:4]


def build_needs_attention(
    db: Session,
    *,
    user_id: int,
    unread_groups: list[dict[str, Any]],
    weak_topics: list[dict[str, Any]],
    materials: list[StudyMaterial],
    notes: list[Note],
    rooms_by_id: dict[int, StudyRoom],
) -> list[dict[str, Any]]:
    now = utc_now()
    needs: list[dict[str, Any]] = []

    for group in unread_groups[:2]:
        needs.append({
            "id": f"attention-{group['id']}",
            "type": "group",
            "priority": 95,
            "title": group["title"],
            "description": group["description"],
            "icon": ACTIVITY_ICONS["group"],
            "reason": "Unread group activity",
            "room_id": group["room_id"],
            "action_label": "Catch up",
            "action_href": group["action_href"],
            "created_at": iso_timestamp(
                group["timestamp"]
            ),
            "metadata": group["metadata"],
        })

    # StudyPlan currently has no completion/status field.
    # Past plans must not be presented as overdue until StudySnap can
    # distinguish completed, skipped and unfinished plans.

    resume = (
        db.query(UserResumeState)
        .filter(UserResumeState.user_id == user_id)
        .first()
    )

    if resume is not None:
        resume_metadata = parse_json_object(
            resume.metadata_json
        )

        progress = resume_metadata.get(
            "progress_percent"
        )

        is_complete = resume_metadata.get(
            "is_complete"
        )

        if (
            resume.last_quiz_id is not None
            and isinstance(progress, int)
            and 0 < progress < 100
            and is_complete is not True
        ):
            needs.append({
                "id": "attention-unfinished-quiz",
                "type": "quiz",
                "priority": 90,
                "title": (
                    resume_metadata.get("title")
                    or "Finish your quiz"
                ),
                "description": (
                    f"You stopped at {progress}%."
                ),
                "icon": ACTIVITY_ICONS["quiz"],
                "reason": "Unfinished quiz",
                "room_id": resume.last_room_id,
                "action_label": "Continue quiz",
                "action_href": (
                    resume.last_action_href
                    or (
                        f"/quizzes?"
                        f"roomId={resume.last_room_id}"
                        f"&quizId={resume.last_quiz_id}"
                    )
                ),
                "created_at": iso_timestamp(
                    resume.last_action_at
                    or resume.updated_at
                ),
                "metadata": {
                    "progress_percent": progress,
                    "quiz_id": resume.last_quiz_id,
                },
            })

    for topic in weak_topics[:2]:
        room_id = topic["room_id"]

        needs.append({
            "id": (
                f"attention-weak-"
                f"{room_id or 'general'}"
            ),
            "type": "concept",
            "priority": 75,
            "title": (
                f"Strengthen {topic['subject']}"
            ),
            "description": (
                f"{topic['accuracy']}% accuracy across "
                f"{topic['reviewed']} reviews."
            ),
            "icon": ACTIVITY_ICONS["concept"],
            "reason": "Weak concept evidence",
            "room_id": room_id,
            "action_label": "Practice",
            "action_href": (
                f"/quizzes?roomId={room_id}"
                if room_id
                else "/quizzes"
            ),
            "created_at": iso_timestamp(
                topic["last_at"]
            ),
            "metadata": {
                "accuracy": topic["accuracy"],
                "reviewed": topic["reviewed"],
                "wrong": topic["wrong"],
            },
        })

    recent_cutoff = now - timedelta(days=30)

    unreviewed_materials = [
        material
        for material in materials
        if (
            material.owner_id == user_id
            and material.last_opened_at is None
            and (
                as_utc(material.created_at)
                or now
            ) >= recent_cutoff
        )
    ]

    for material in unreviewed_materials[:2]:
        room = rooms_by_id.get(
            material.study_room_id
        )

        needs.append({
            "id": (
                f"attention-material-{material.id}"
            ),
            "type": "file",
            "priority": 60,
            "title": material.original_filename,
            "description": (
                "Uploaded but not reviewed yet."
            ),
            "icon": ACTIVITY_ICONS["file"],
            "reason": "New material not reviewed",
            "room_id": material.study_room_id,
            "action_label": "Review now",
            "action_href": material_href(
                material.study_room_id,
                material.id,
                material.original_filename,
            ),
            "created_at": iso_timestamp(
                material.created_at
            ),
            "metadata": {
                "room_name": room.name if room else None,
                "material_id": material.id,
            },
        })

    incomplete_notes = [
        note
        for note in notes
        if len((note.content or "").strip()) < 80
    ]

    for note in incomplete_notes[:1]:
        needs.append({
            "id": f"attention-note-{note.id}",
            "type": "note",
            "priority": 50,
            "title": note.title,
            "description": (
                "This note is still very short."
            ),
            "icon": ACTIVITY_ICONS["note"],
            "reason": "Incomplete note",
            "room_id": note.study_room_id,
            "action_label": "Continue note",
            "action_href": (
                f"/notes?roomId={note.study_room_id}"
                f"&noteId={note.id}"
            ),
            "created_at": iso_timestamp(
                note.created_at
            ),
            "metadata": {
                "note_id": note.id,
            },
        })

    needs.sort(
        key=lambda item: (
            item["priority"],
            item["created_at"],
        ),
        reverse=True,
    )

    unique: list[dict[str, Any]] = []
    signatures: set[str] = set()

    for item in needs:
        signature = (
            f"{item['type']}:"
            f"{item.get('room_id')}:"
            f"{item['reason']}"
        )

        if signature in signatures:
            continue

        signatures.add(signature)
        unique.append(item)

    return unique[:5]


def build_next_step(
    *,
    needs_attention: list[dict[str, Any]],
    continue_learning: list[dict[str, Any]],
    unread_group_count: int,
    has_rooms: bool,
) -> dict[str, Any]:
    rule_order = [
        "Unread group activity",
        "Unfinished quiz",
        "Weak concept evidence",
        "New material not reviewed",
        "Incomplete note",
    ]

    by_reason = {
        item["reason"]: item
        for item in needs_attention
    }

    for reason in rule_order:
        item = by_reason.get(reason)

        if item is None:
            continue

        explanation_by_reason = {
            "Unread group activity": (
                f"You have {unread_group_count} unread "
                "group message"
                f"{'' if unread_group_count == 1 else 's'}."
            ),
            "Unfinished quiz": (
                "You already started this quiz."
            ),
            "Weak concept evidence": (
                "Your recent answers show this area "
                "needs more practice."
            ),
            "New material not reviewed": (
                "You uploaded this material but have "
                "not reviewed it yet."
            ),
            "Incomplete note": (
                "This note was started but still needs "
                "more detail."
            ),
        }

        return {
            "id": f"next-{item['id']}",
            "type": item["type"],
            "title": item["title"],
            "description": explanation_by_reason[
                reason
            ],
            "icon": item["icon"],
            "reason": reason,
            "action_label": item["action_label"],
            "action_href": item["action_href"],
            "room_id": item.get("room_id"),
            "metadata": item.get("metadata", {}),
        }

    if continue_learning:
        item = continue_learning[0]

        return {
            "id": f"next-{item['id']}",
            "type": item["type"],
            "title": item["title"],
            "description": (
                "This is your most recent meaningful "
                "learning activity."
            ),
            "icon": item["icon"],
            "reason": "Continue recent work",
            "action_label": item["action_label"],
            "action_href": item["action_href"],
            "room_id": item.get("room_id"),
            "metadata": item.get("metadata", {}),
        }

    if not has_rooms:
        return {
            "id": "next-create-room",
            "type": "room",
            "title": "Create your first Study Room",
            "description": (
                "Keep your files, notes, AI help and "
                "practice together."
            ),
            "icon": ACTIVITY_ICONS["room"],
            "reason": "No Study Rooms yet",
            "action_label": "Create room",
            "action_href": "/study-rooms",
            "room_id": None,
            "metadata": {},
        }

    return {
        "id": "next-upload-material",
        "type": "file",
        "title": "Add something to study",
        "description": (
            "Upload material and StudySnap will suggest "
            "the most useful next action."
        ),
        "icon": ACTIVITY_ICONS["file"],
        "reason": "No recent learning activity",
        "action_label": "Upload material",
        "action_href": "/smart-organizer",
        "room_id": None,
        "metadata": {},
    }


def empty_states(
    *,
    needs_attention: list[dict[str, Any]],
    continue_learning: list[dict[str, Any]],
    group_activity: list[dict[str, Any]],
    feed: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    return {
        "needs_attention": {
            "is_empty": not needs_attention,
            "title": "You’re all caught up",
            "description": (
                "StudySnap will place important "
                "unfinished work here."
            ),
        },
        "continue_learning": {
            "is_empty": not continue_learning,
            "title": "Nothing to continue yet",
            "description": (
                "Open a room, upload material, start a "
                "quiz or ask StudySnap a question."
            ),
        },
        "group_activity": {
            "is_empty": not group_activity,
            "title": "No new group messages",
            "description": (
                "You’re caught up with your study groups."
            ),
        },
        "feed": {
            "is_empty": not feed,
            "title": "Your learning story starts here",
            "description": (
                "Uploads, notes, quizzes, AI conversations "
                "and group work will appear as you study."
            ),
        },
    }


def build_dashboard_intelligence(
    db: Session,
    *,
    user_id: int,
    limit: int = 20,
    cursor: str | None = None,
) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 50))

    room_ids, rooms_by_id = get_accessible_rooms(
        db,
        user_id,
    )

    ensure_room_read_state_baseline(
        db,
        user_id=user_id,
        room_ids=room_ids,
    )

    group_activity, unread_group_count = (
        build_unread_group_activity(
            db,
            user_id=user_id,
            room_ids=room_ids,
            rooms_by_id=rooms_by_id,
        )
    )

    weak_topics = build_weak_topics(
        db,
        user_id=user_id,
        rooms_by_id=rooms_by_id,
    )

    persisted_items = (
        build_persisted_activity_items(
            db,
            user_id=user_id,
            rooms_by_id=rooms_by_id,
        )
    )

    material_items, materials = build_material_items(
        db,
        user_id=user_id,
        room_ids=room_ids,
        rooms_by_id=rooms_by_id,
    )

    material_keys = {
        (
            material.study_room_id,
            material.original_filename.lower(),
        )
        for material in materials
    }

    legacy_pdf_items = build_legacy_pdf_items(
        db,
        user_id=user_id,
        rooms_by_id=rooms_by_id,
        material_keys=material_keys,
    )

    note_items, notes = build_note_items(
        db,
        user_id=user_id,
        rooms_by_id=rooms_by_id,
    )

    quiz_items, quizzes, attempts = (
        build_quiz_items(
            db,
            user_id=user_id,
            rooms_by_id=rooms_by_id,
        )
    )

    ai_items, conversations = build_ai_items(
        db,
        user_id=user_id,
        rooms_by_id=rooms_by_id,
    )

    learning_items = build_learning_event_items(
        db,
        user_id=user_id,
        rooms_by_id=rooms_by_id,
    )

    message_items = build_group_message_feed_items(
        db,
        user_id=user_id,
        room_ids=room_ids,
        rooms_by_id=rooms_by_id,
    )

    room_event_items = build_room_event_items(
        db,
        room_ids=room_ids,
        rooms_by_id=rooms_by_id,
    )

    plan_items, plans = build_plan_items(
        db,
        user_id=user_id,
    )

    continue_learning = build_continue_learning(
        db,
        user_id=user_id,
        rooms_by_id=rooms_by_id,
        materials=materials,
        notes=notes,
        conversations=conversations,
    )

    needs_attention = build_needs_attention(
        db,
        user_id=user_id,
        unread_groups=group_activity,
        weak_topics=weak_topics,
        materials=materials,
        notes=notes,
        rooms_by_id=rooms_by_id,
    )

    next_step = build_next_step(
        needs_attention=needs_attention,
        continue_learning=continue_learning,
        unread_group_count=unread_group_count,
        has_rooms=bool(room_ids),
    )

    combined_items = [
        *persisted_items,
        *material_items,
        *legacy_pdf_items,
        *note_items,
        *quiz_items,
        *ai_items,
        *learning_items,
        *message_items,
        *room_event_items,
        *plan_items,
    ]

    grouped_items = group_and_dedupe_items(
        combined_items
    )

    grouped_items.sort(
        key=lambda item: (
            item["timestamp"],
            item["id"],
        ),
        reverse=True,
    )

    decoded_cursor = decode_cursor(cursor)

    if decoded_cursor is not None:
        cursor_time, cursor_id = decoded_cursor

        grouped_items = [
            item
            for item in grouped_items
            if (
                (
                    as_utc(item["timestamp"])
                    or utc_now()
                )
                < cursor_time
                or (
                    (
                        as_utc(item["timestamp"])
                        or utc_now()
                    )
                    == cursor_time
                    and str(item["id"]) < cursor_id
                )
            )
        ]

    has_more = len(grouped_items) > safe_limit
    page_items = grouped_items[:safe_limit]

    next_cursor = (
        encode_cursor(page_items[-1])
        if has_more and page_items
        else None
    )

    serialized_feed = [
        serialize_feed_item(item)
        for item in page_items
    ]

    return {
        "generated_at": iso_timestamp(utc_now()),
        "next_step": next_step,
        "needs_attention": needs_attention,
        "continue_learning": continue_learning,
        "group_activity": [
            serialize_feed_item(item)
            for item in group_activity[:5]
        ],
        "feed": serialized_feed,
        "unread_group_count": unread_group_count,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "empty_states": empty_states(
            needs_attention=needs_attention,
            continue_learning=continue_learning,
            group_activity=group_activity,
            feed=serialized_feed,
        ),
        "summary": {
            "accessible_rooms": len(room_ids),
            "materials": len(materials),
            "notes": len(notes),
            "quizzes": len(quizzes),
            "quiz_attempts": len(attempts),
            "ai_conversations": len(conversations),
            "weak_topics": len(weak_topics),
            "unread_group_messages": unread_group_count,
        },
    }
