from sqlalchemy.orm import Session

from app.services.context.providers.brain_memory import (
    build_brain_memory_context,
)
from app.services.context.providers.conversation import (
    build_conversation_context,
)
from app.services.context.providers.flashcards import (
    build_flashcards_context,
)
from app.services.context.providers.materials import (
    build_materials_context,
)
from app.services.context.providers.notes import (
    build_notes_context,
)
from app.services.context.providers.pdf import (
    build_pdf_context,
)
from app.services.context.providers.quizzes import (
    build_quizzes_context,
)


def build_study_room_context(
    db: Session,
    conversation_id: int,
    study_room_id: int,
    owner_id: int,
    question: str = "",
    focused_material_id: int | None = None,
) -> str:
    """
    Build the connected StudySnap Brain context for a Study Room.

    focused_material_id makes one safe universal upload the primary
    source while the rest of the room remains available as supporting
    learning context.
    """

    conversation_context = (
        build_conversation_context(
            db=db,
            conversation_id=conversation_id,
        )
    )

    notes_context = build_notes_context(
        db=db,
        study_room_id=study_room_id,
        owner_id=owner_id,
        question=question,
    )

    pdf_context = build_pdf_context(
        db=db,
        study_room_id=study_room_id,
        owner_id=owner_id,
        question=question,
    )

    materials_context = (
        build_materials_context(
            db=db,
            study_room_id=study_room_id,
            owner_id=owner_id,
            question=question,
            focused_material_id=focused_material_id,
        )
    )

    flashcards_context = (
        build_flashcards_context(
            db=db,
            study_room_id=study_room_id,
            owner_id=owner_id,
            question=question,
        )
    )

    quizzes_context = (
        build_quizzes_context(
            db=db,
            study_room_id=study_room_id,
            owner_id=owner_id,
            question=question,
        )
    )

    brain_memory_context = (
        build_brain_memory_context(
            db=db,
            study_room_id=study_room_id,
            owner_id=owner_id,
            question=question,
        )
    )

    context_parts = []

    if conversation_context.strip():
        context_parts.append(
            "Conversation history:\n"
            + conversation_context.strip()
        )

    if notes_context.strip():
        context_parts.append(
            "Study Room notes:\n"
            + notes_context.strip()
        )

    if pdf_context.strip():
        context_parts.append(
            "Study Room PDFs:\n"
            + pdf_context.strip()
        )

    if materials_context.strip():
        context_parts.append(
            "Study Room uploaded materials:\n"
            + materials_context.strip()
        )

    if flashcards_context.strip():
        context_parts.append(
            "Study Room Concept Cards:\n"
            + flashcards_context.strip()
        )

    if quizzes_context.strip():
        context_parts.append(
            "Study Room saved quizzes:\n"
            + quizzes_context.strip()
        )

    if brain_memory_context.strip():
        context_parts.append(
            "Study Room learning evidence and concept mastery:\n"
            + brain_memory_context.strip()
        )

    return (
        "\n\n====================\n\n"
    ).join(context_parts)
