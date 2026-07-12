from sqlalchemy.orm import Session

from app.models.brain_memory import BrainMemory
from app.services.context.ranking import rank_items


def build_brain_memory_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    question: str = "",
    limit: int = 12,
    candidate_limit: int = 100,
) -> str:
    """
    Build real concept mastery context for StudySnap AI.

    Includes weak concepts, review needs, confidence, and mastery evidence.
    """

    memories = (
        db.query(BrainMemory)
        .filter(
            BrainMemory.study_room_id == study_room_id,
            BrainMemory.user_id == owner_id,
        )
        .order_by(
            BrainMemory.needs_review.desc(),
            BrainMemory.mastery_score.asc(),
            BrainMemory.id.desc(),
        )
        .limit(candidate_limit)
        .all()
    )

    if not memories:
        return ""

    selected = rank_items(
        query=question,
        items=memories,
        text_getter=lambda memory: " ".join(
            [
                memory.concept_name or "",
                memory.concept_type or "",
                memory.strength or "",
                memory.source or "",
                "needs review"
                if memory.needs_review
                else "does not need review",
            ]
        ),
        limit=limit,
    )

    formatted_memories = []

    for memory in selected:
        mastery = round(
            float(memory.mastery_score or 0.0) * 100
        )

        confidence = round(
            float(memory.confidence or 0.0) * 100
        )

        formatted_memories.append(
            "\n".join(
                [
                    f"CONCEPT: {memory.concept_name}",
                    f"STRENGTH: {memory.strength or 'new'}",
                    f"MASTERY: {mastery}%",
                    f"CONFIDENCE: {confidence}%",
                    f"NEEDS REVIEW: {'yes' if memory.needs_review else 'no'}",
                    f"TIMES SEEN: {memory.seen_count or 0}",
                    f"REVIEW COUNT: {memory.review_count or 0}",
                    f"SOURCE: {memory.source or 'unknown'}",
                ]
            )
        )

    return "\n\n---\n\n".join(formatted_memories)
