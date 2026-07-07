from sqlalchemy.orm import Session

from app.models.flashcard import Flashcard


def build_flashcards_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    limit: int = 10,
    content_limit: int = 500,
) -> str:
    """
    Build flashcard context for StudySnap AI.

    Uses recent flashcards from the current study room only.
    """

    flashcards = (
        db.query(Flashcard)
        .filter(
            Flashcard.study_room_id == study_room_id,
            Flashcard.owner_id == owner_id,
        )
        .order_by(Flashcard.id.desc())
        .limit(limit)
        .all()
    )

    if not flashcards:
        return ""

    formatted_cards = []

    for card in flashcards:
        question = (card.question or "").strip()
        answer = (card.answer or "").strip()

        if not question and not answer:
            continue

        if len(question) > content_limit:
            question = question[:content_limit].rstrip() + "..."

        if len(answer) > content_limit:
            answer = answer[:content_limit].rstrip() + "..."

        formatted_cards.append(
            f"FLASHCARD QUESTION: {question}\nFLASHCARD ANSWER: {answer}"
        )

    return "\n\n---\n\n".join(formatted_cards)
