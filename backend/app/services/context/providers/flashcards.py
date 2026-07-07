from sqlalchemy.orm import Session

from app.models.flashcard import Flashcard
from app.services.context.ranking import rank_items


def build_flashcards_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    question: str = "",
    limit: int = 10,
    candidate_limit: int = 50,
    content_limit: int = 500,
) -> str:
    """
    Build flashcard context for StudySnap AI.

    Uses shared relevance ranking first.
    Falls back to recent flashcards if no relevant cards exist.
    """

    flashcards = (
        db.query(Flashcard)
        .filter(
            Flashcard.study_room_id == study_room_id,
            Flashcard.owner_id == owner_id,
        )
        .order_by(Flashcard.id.desc())
        .limit(candidate_limit)
        .all()
    )

    if not flashcards:
        return ""

    selected_cards = rank_items(
        query=question,
        items=flashcards,
        text_getter=lambda card: " ".join(
            [
                card.question or "",
                card.answer or "",
                card.tags or "",
                card.difficulty or "",
                card.source_type or "",
            ]
        ),
        limit=limit,
    )

    formatted_cards = []

    for card in selected_cards:
        question_text = (card.question or "").strip()
        answer_text = (card.answer or "").strip()

        if not question_text and not answer_text:
            continue

        if len(question_text) > content_limit:
            question_text = question_text[:content_limit].rstrip() + "..."

        if len(answer_text) > content_limit:
            answer_text = answer_text[:content_limit].rstrip() + "..."

        formatted_cards.append(
            f"FLASHCARD QUESTION: {question_text}\nFLASHCARD ANSWER: {answer_text}"
        )

    return "\n\n---\n\n".join(formatted_cards)
