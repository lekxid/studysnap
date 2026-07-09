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

        return {
            "handled": True,
            "action": "create_note",
            "status": "completed",
            "message": (
                "✅ Created Note\n\n"
                f"**Title:** {note['title']}\n\n"
                "You can open it from the Notes page for this project."
            ),
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

        return {
            "handled": True,
            "action": "save_last_ai_answer_to_note",
            "status": "completed",
            "message": (
                "✅ Saved to Notes\n\n"
                f"**Title:** {note['title']}\n\n"
                "You can open it from the Notes page for this project."
            ),
            "note": note,
        }

    return {
        "handled": False,
        "action": parsed.action,
        "message": "",
    }
