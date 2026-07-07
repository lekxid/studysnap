from sqlalchemy.orm import Session

from app.services.context.providers.conversation import build_conversation_context
from app.services.context.providers.notes import build_notes_context


def build_study_room_context(
    db: Session,
    conversation_id: int,
    study_room_id: int,
    owner_id: int,
) -> str:
    """
    Build the StudySnap Brain context for a study room.

    Current providers:
    - Conversation
    - Notes

    Future providers:
    - PDFs
    - Flashcards
    - Quizzes
    - Learning Events
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
