from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.ai_conversation import AIConversation
from app.models.ai_message import AIMessage
from app.models.learning_event import LearningEvent
from app.models.note import Note
from app.models.study_room import StudyRoom
from app.models.user import User


MAX_ROOMS_PER_ACTION = 10


SAVE_LAST_ANSWER_COMMANDS = {
    "save it",
    "save this",
    "save it to note",
    "save this to note",
    "save to note",
    "save as note",
    "make this a note",
    "turn this into a note",
    "add this to notes",
}


@dataclass
class ParsedAction:
    action: str
    title: str = ""
    content: str = ""


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _short_title(value: str, fallback: str = "AI Note", max_length: int = 80) -> str:
    cleaned = _clean_text(
        value.replace("[Image uploaded]", "")
        .replace("*", " ")
        .replace("_", " ")
        .replace("`", " ")
        .replace("#", " ")
        .replace(">", " ")
    )

    if not cleaned:
        return fallback

    if cleaned.lower() == "describe this image clearly.":
        return "Image analysis note"

    return cleaned[:max_length].strip() + ("..." if len(cleaned) > max_length else "")


def _clean_room_field(value: str, fallback: str = "", max_length: int = 120) -> str:
    cleaned = _clean_text(
        (value or "")
        .replace("*", " ")
        .replace("_", " ")
        .replace("`", " ")
        .replace("#", " ")
        .replace(">", " ")
    )

    if not cleaned:
        return fallback

    return cleaned[:max_length].strip()


def _parse_room_specs(raw_body: str) -> list[dict]:
    body = (raw_body or "").strip()

    if not body:
        return []

    if "\n" in body:
        raw_items = [line.strip() for line in body.splitlines() if line.strip()]
    elif "," in body:
        raw_items = [item.strip() for item in body.split(",") if item.strip()]
    else:
        raw_items = [body]

    if len(raw_items) > MAX_ROOMS_PER_ACTION:
        raise ValueError(f"You can create up to {MAX_ROOMS_PER_ACTION} rooms at a time.")

    rooms: list[dict] = []

    for raw_item in raw_items:
        parts = [part.strip() for part in raw_item.split("|")]

        name = _clean_room_field(parts[0] if len(parts) >= 1 else "", max_length=100)

        if not name:
            continue

        subject = _clean_room_field(
            parts[1] if len(parts) >= 2 else "",
            fallback="General",
            max_length=80,
        )

        description = None

        if len(parts) >= 3:
            description_text = _clean_room_field(
                " | ".join(parts[2:]),
                fallback="",
                max_length=250,
            )
            description = description_text or None

        rooms.append(
            {
                "name": name,
                "subject": subject or "General",
                "description": description,
            }
        )

    return rooms


def detect_action_intent(command: str) -> ParsedAction | None:
    """
    Detect simple StudySnap action commands.

    V1 is intentionally conservative:
    - exact save-last-answer commands
    - explicit create-note commands

    This prevents normal learning questions from accidentally modifying user data.
    """

    clean_command = (command or "").strip()
    lower_command = clean_command.lower()

    if lower_command in SAVE_LAST_ANSWER_COMMANDS:
        return ParsedAction(action="save_last_ai_answer_to_note")

    room_match = re.match(
        r"^(create|new|add)\s+((a\s+)?(room|project)|rooms|projects)\s*[:\-]?\s*(.*)$",
        clean_command,
        flags=re.IGNORECASE | re.DOTALL,
    )

    if room_match:
        return ParsedAction(
            action="create_rooms",
            content=(room_match.group(5) or "").strip(),
        )

    match = re.match(
        r"^(create\s+(a\s+)?note|new\s+note|note|save\s+note|add\s+note)\s*[:\-]?\s*(.*)$",
        clean_command,
        flags=re.IGNORECASE | re.DOTALL,
    )

    if not match:
        return None

    raw_body = (match.group(3) or "").strip()

    if not raw_body:
        return ParsedAction(action="create_note", title="", content="")

    if "|" in raw_body:
        raw_title, raw_content = raw_body.split("|", 1)
        title = _short_title(raw_title, fallback="Quick note")
        content = raw_content.strip() or raw_body
        return ParsedAction(action="create_note", title=title, content=content)

    first_line = raw_body.splitlines()[0].strip()
    title = _short_title(first_line, fallback="Quick note")

    return ParsedAction(action="create_note", title=title, content=raw_body)


def _verify_study_room(db: Session, study_room_id: int, owner_id: int) -> StudyRoom:
    room = (
        db.query(StudyRoom)
        .filter(StudyRoom.id == study_room_id, StudyRoom.owner_id == owner_id)
        .first()
    )

    if not room:
        raise LookupError("Study room not found.")

    return room


def _verify_conversation(db: Session, conversation_id: int, owner_id: int) -> AIConversation:
    conversation = (
        db.query(AIConversation)
        .filter(AIConversation.id == conversation_id, AIConversation.owner_id == owner_id)
        .first()
    )

    if not conversation:
        raise LookupError("Conversation not found.")

    return conversation


def _serialize_room(room: StudyRoom) -> dict:
    return {
        "id": room.id,
        "name": room.name,
        "subject": room.subject,
        "description": room.description,
        "owner_id": room.owner_id,
        "created_at": room.created_at,
    }


def _find_existing_room(
    db: Session,
    owner_id: int,
    name: str,
) -> StudyRoom | None:
    return (
        db.query(StudyRoom)
        .filter(
            StudyRoom.owner_id == owner_id,
            StudyRoom.name == name,
        )
        .first()
    )


def _create_study_rooms(
    db: Session,
    current_user: User,
    room_specs: list[dict],
) -> tuple[list[dict], list[dict]]:
    created_rooms: list[dict] = []
    existing_rooms: list[dict] = []

    for spec in room_specs:
        existing = _find_existing_room(
            db=db,
            owner_id=current_user.id,
            name=spec["name"],
        )

        if existing:
            existing_rooms.append(_serialize_room(existing))
            continue

        room = StudyRoom(
            name=spec["name"],
            subject=spec.get("subject") or "General",
            description=spec.get("description"),
            owner_id=current_user.id,
        )

        db.add(room)
        db.flush()

        _log_ai_action_event(
            db=db,
            user_id=current_user.id,
            study_room_id=room.id,
            reference_id=room.id,
            result="created_room",
        )

        created_rooms.append(_serialize_room(room))

    db.commit()

    return created_rooms, existing_rooms


def _serialize_note(note: Note) -> dict:
    return {
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "study_room_id": note.study_room_id,
        "owner_id": note.owner_id,
        "created_at": note.created_at,
    }


def _log_ai_action_event(
    db: Session,
    user_id: int,
    study_room_id: int | None,
    reference_id: int | None,
    result: str,
) -> None:
    event = LearningEvent(
        user_id=user_id,
        study_room_id=study_room_id,
        activity_type="ai_action",
        reference_id=reference_id,
        result=result,
        confidence=100,
    )

    db.add(event)


def _create_note(
    db: Session,
    current_user: User,
    study_room_id: int,
    title: str,
    content: str,
    result: str,
) -> dict:
    _verify_study_room(db, study_room_id, current_user.id)

    note = Note(
        title=title or "AI Note",
        content=content,
        study_room_id=study_room_id,
        owner_id=current_user.id,
    )

    db.add(note)
    db.flush()

    _log_ai_action_event(
        db=db,
        user_id=current_user.id,
        study_room_id=study_room_id,
        reference_id=note.id,
        result=result,
    )

    db.commit()
    db.refresh(note)

    return _serialize_note(note)


def _get_last_assistant_message(
    db: Session,
    conversation_id: int,
) -> AIMessage | None:
    return (
        db.query(AIMessage)
        .filter(
            AIMessage.conversation_id == conversation_id,
            AIMessage.role == "assistant",
            ~AIMessage.content.startswith("✅ Saved to Notes"),
            ~AIMessage.content.startswith("✅ Created Note"),
        )
        .order_by(AIMessage.id.desc())
        .first()
    )


def _get_last_user_message(
    db: Session,
    conversation_id: int,
) -> AIMessage | None:
    return (
        db.query(AIMessage)
        .filter(
            AIMessage.conversation_id == conversation_id,
            AIMessage.role == "user",
        )
        .order_by(AIMessage.id.desc())
        .first()
    )


def _append_action_messages(
    db: Session,
    conversation_id: int | None,
    owner_id: int,
    command: str,
    response_message: str,
) -> None:
    if conversation_id is None:
        return

    conversation = _verify_conversation(db, conversation_id, owner_id)

    if conversation.title == "New Conversation":
        short_title = _short_title(command, fallback="AI action", max_length=50)
        conversation.title = short_title or "AI action"

    db.add(
        AIMessage(
            conversation_id=conversation.id,
            role="user",
            content=command,
        )
    )

    db.add(
        AIMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=response_message,
        )
    )

    db.commit()


def execute_brain_action(
    db: Session,
    current_user: User,
    command: str,
    study_room_id: int | None = None,
    conversation_id: int | None = None,
) -> dict:
    parsed = detect_action_intent(command)

    if parsed is None:
        return {
            "handled": False,
            "action": None,
            "message": "",
        }

    if parsed.action == "create_rooms":
        room_specs = _parse_room_specs(parsed.content)

        if not room_specs:
            return {
                "handled": True,
                "action": "create_rooms",
                "status": "needs_content",
                "message": (
                    "To create rooms, write it like this:\n\n"
                    "**create room: Anatomy**\n\n"
                    "Or create many:\n\n"
                    "**create rooms: Anatomy, Biology, Chemistry**\n\n"
                    "For more detail, use:\n\n"
                    "**new room: PSW Lab Skills | PSW | Skills test prep**"
                ),
            }

        created_rooms, existing_rooms = _create_study_rooms(
            db=db,
            current_user=current_user,
            room_specs=room_specs,
        )

        total_requested = len(room_specs)
        created_count = len(created_rooms)
        existing_count = len(existing_rooms)

        created_lines = [
            f"{index}. {room['name']} — {room['subject']}"
            for index, room in enumerate(created_rooms, start=1)
        ]

        existing_lines = [
            f"- {room['name']} already exists"
            for room in existing_rooms
        ]

        message_parts = [
            f"✅ Created {created_count} Project{'s' if created_count != 1 else ''}"
        ]

        if created_lines:
            message_parts.append("\n".join(created_lines))

        if existing_count:
            message_parts.append(
                f"Skipped {existing_count} existing project{'s' if existing_count != 1 else ''}:\n"
                + "\n".join(existing_lines)
            )

        message_parts.append(f"Requested: {total_requested}")

        message = "\n\n".join(message_parts)

        _append_action_messages(
            db=db,
            conversation_id=conversation_id,
            owner_id=current_user.id,
            command=command,
            response_message=message,
        )

        return {
            "handled": True,
            "action": "create_rooms",
            "status": "completed",
            "message": message,
            "rooms": created_rooms,
            "existing_rooms": existing_rooms,
        }

    if parsed.action == "create_note":
        if study_room_id is None:
            raise ValueError("A study_room_id is required to create a note.")

        if not parsed.content.strip():
            return {
                "handled": True,
                "action": "create_note",
                "status": "needs_content",
                "message": (
                    "To create a note, write it like this:\n\n"
                    "**create note: My note content**\n\n"
                    "Or with a title:\n\n"
                    "**save note: My Title | My note content**"
                ),
            }

        note = _create_note(
            db=db,
            current_user=current_user,
            study_room_id=study_room_id,
            title=parsed.title or "Quick note",
            content=parsed.content.strip(),
            result="created_note",
        )

        message = (
            "✅ Created Note\n\n"
            f"**Title:** {note['title']}\n\n"
            "You can open it from the Notes page for this project."
        )

        _append_action_messages(
            db=db,
            conversation_id=conversation_id,
            owner_id=current_user.id,
            command=command,
            response_message=message,
        )

        return {
            "handled": True,
            "action": "create_note",
            "status": "completed",
            "message": message,
            "note": note,
        }

    if parsed.action == "save_last_ai_answer_to_note":
        if conversation_id is None:
            raise ValueError("A conversation_id is required to save the last AI answer.")

        conversation = _verify_conversation(db, conversation_id, current_user.id)
        target_study_room_id = study_room_id or conversation.study_room_id

        _verify_study_room(db, target_study_room_id, current_user.id)

        last_answer = _get_last_assistant_message(db, conversation.id)

        if not last_answer or not last_answer.content.strip():
            return {
                "handled": True,
                "action": "save_last_ai_answer_to_note",
                "status": "not_found",
                "message": (
                    "I could not find an AI answer to save yet. "
                    "Ask me something first, then say **save it to note**."
                ),
            }

        last_user_message = _get_last_user_message(db, conversation.id)
        title = _short_title(
            last_user_message.content if last_user_message else "",
            fallback="AI saved note",
        )

        note = _create_note(
            db=db,
            current_user=current_user,
            study_room_id=target_study_room_id,
            title=title,
            content=last_answer.content.strip(),
            result="saved_ai_answer_to_note",
        )

        message = (
            "✅ Saved to Notes\n\n"
            f"**Title:** {note['title']}\n\n"
            "You can open it from the Notes page for this project."
        )

        _append_action_messages(
            db=db,
            conversation_id=conversation_id,
            owner_id=current_user.id,
            command=command,
            response_message=message,
        )

        return {
            "handled": True,
            "action": "save_last_ai_answer_to_note",
            "status": "completed",
            "message": message,
            "note": note,
        }

    return {
        "handled": False,
        "action": parsed.action,
        "message": "",
    }
