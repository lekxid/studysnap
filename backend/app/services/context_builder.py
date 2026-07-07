from sqlalchemy.orm import Session

from app.models.ai_message import AIMessage


def build_conversation_context(
    db: Session,
    conversation_id: int,
    limit: int = 8,
) -> str:
    """
    Build conversation memory for StudySnap AI.

    Version 1:
    - Conversation messages only.
    - Future versions will add Notes, PDFs, Flashcards, Quizzes, and Learning Events.
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
