from sqlalchemy.orm import Session

from app.models.flashcard import Flashcard
from app.services.context.ranking import relevance_score


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

    Uses relevance ranking first.
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

    ranked_cards = []

    for card in flashcards:
        searchable_text = " ".join(
            [
                card.question or "",
                card.answer or "",
                card.tags or "",
                card.difficulty or "",
                card.source_type or "",
            ]
        )

        score = relevance_score(question, searchable_text)
        ranked_cards.append((score, card))

    matching_cards = [
        (score, card)
        for score, card in ranked_cards
        if score > 0
    ]

    if matching_cards:
        matching_cards.sort(key=lambda item: item[0], reverse=True)
        selected_cards = [card for score, card in matching_cards[:limit]]
    else:
        selected_cards = flashcards[:limit]

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
