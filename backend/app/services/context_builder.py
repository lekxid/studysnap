from sqlalchemy.orm import Session

from app.models.ai_message import AIMessage
from app.models.note import Note


def build_conversation_context(
    db: Session,
    conversation_id: int,
    limit: int = 8,
) -> str:
    """
    Build conversation memory for StudySnap AI.

    Version 1:
    - Conversation messages only.
    """

    messages = (
        db.query(AIMessage)
        .filter(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.id.asc())
        .all()
    )

    recent_messages = messages[-limit:]

    return "\n\n".join(
        f"{message.role.upper()}: {message.content}"
        for message in recent_messages
    )


def build_notes_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    limit: int = 5,
    content_limit: int = 1200,
) -> str:
    """
    Build study note context for StudySnap AI.

    Version 2:
    - Recent notes from the current study room only.
    - Keeps content limited so prompts do not become too large.
    """

    notes = (
        db.query(Note)
        .filter(
            Note.study_room_id == study_room_id,
            Note.owner_id == owner_id,
        )
        .order_by(Note.id.desc())
        .limit(limit)
        .all()
    )

    if not notes:
        return ""

    formatted_notes = []

    for note in notes:
        clean_title = (note.title or "Untitled Note").strip()
        clean_content = (note.content or "").strip()

        if not clean_content:
            continue

        if len(clean_content) > content_limit:
            clean_content = clean_content[:content_limit].rstrip() + "..."

        formatted_notes.append(
            f"NOTE TITLE: {clean_title}\nNOTE CONTENT:\n{clean_content}"
        )

    return "\n\n---\n\n".join(formatted_notes)


def build_study_room_context(
    db: Session,
    conversation_id: int,
    study_room_id: int,
    owner_id: int,
) -> str:
    """
    Build the StudySnap Brain context for a study room.

    Version 2:
    - Conversation history
    - Study notes

    Future versions:
    - PDFs
    - Flashcards
    - Quizzes
    - Learning events
    - Recommendations
    """

    conversation_context = build_conversation_context(
        db=db,
        conversation_id=conversation_id,
    )

    notes_context = build_notes_context(
        db=db,
        study_room_id=study_room_id,
        owner_id=owner_id,
    )

    context_parts = []

    if conversation_context.strip():
        context_parts.append(
            "Conversation history:\n" + conversation_context.strip()
        )

    if notes_context.strip():
        context_parts.append(
            "Study room notes:\n" + notes_context.strip()
        )

    return "\n\n====================\n\n".join(context_parts)
