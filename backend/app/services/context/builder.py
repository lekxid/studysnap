from sqlalchemy.orm import Session

from app.services.context.providers.conversation import build_conversation_context
from app.services.context.providers.flashcards import build_flashcards_context
from app.services.context.providers.notes import build_notes_context
from app.services.context.providers.pdf import build_pdf_context


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
    - PDFs
    - Flashcards

    Future providers:
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

    pdf_context = build_pdf_context(
        db=db,
        study_room_id=study_room_id,
        owner_id=owner_id,
    )

    flashcards_context = build_flashcards_context(
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

    if pdf_context.strip():
        context_parts.append(
            "Study room PDFs:\n" + pdf_context.strip()
        )

    if flashcards_context.strip():
        context_parts.append(
            "Study room flashcards:\n" + flashcards_context.strip()
        )

    return "\n\n====================\n\n".join(context_parts)
