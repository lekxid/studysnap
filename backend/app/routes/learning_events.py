import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.learning_event import LearningEvent
from app.models.user import User
from app.services.brain.repository import BrainMemoryRepository
from app.utils.deps import get_current_user


router = APIRouter(tags=["Learning Events"])


class LearningEventCreate(BaseModel):
    study_room_id: int | None = None
    activity_type: str
    reference_id: int | None = None
    result: str | None = None
    confidence: int | None = None

    concept_id: str | None = None
    concept_name: str | None = None
    concept_type: str | None = "concept"
    source: str | None = None


def slugify_concept(value: str) -> str:
    clean = (value or "").lower()
    clean = re.sub(r"[^a-z0-9]+", "-", clean)
    clean = re.sub(r"-+", "-", clean).strip("-")
    return clean[:80] or "study-concept"


def confidence_to_mastery(confidence: int | None, result: str | None) -> float:
    if confidence is not None:
        return max(0.0, min(float(confidence) / 100.0, 1.0))

    if result == "correct":
        return 0.9

    if result == "partial":
        return 0.6

    if result == "wrong":
        return 0.2

    return 0.5


@router.post("")
def create_learning_event(
    data: LearningEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = LearningEvent(
        user_id=current_user.id,
        study_room_id=data.study_room_id,
        activity_type=data.activity_type,
        reference_id=data.reference_id,
        result=data.result,
        confidence=data.confidence,
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    saved_memory = None

    if data.concept_name or data.concept_id:
        concept_name = (data.concept_name or data.concept_id or "Study Concept").strip()
        concept_id = data.concept_id or slugify_concept(concept_name)

        repository = BrainMemoryRepository(db)
        saved_memory = repository.upsert_memory(
            user_id=current_user.id,
            study_room_id=data.study_room_id,
            concept_memory={
                "concept_id": concept_id,
                "name": concept_name,
                "type": data.concept_type or "concept",
                "confidence": confidence_to_mastery(data.confidence, data.result),
                "source": data.source or data.activity_type,
            },
        )

        if data.result in {"correct", "partial"}:
            repository.mark_reviewed(
                user_id=current_user.id,
                study_room_id=data.study_room_id,
                concept_id=concept_id,
            )

    return {
        "id": event.id,
        "user_id": event.user_id,
        "study_room_id": event.study_room_id,
        "activity_type": event.activity_type,
        "reference_id": event.reference_id,
        "result": event.result,
        "confidence": event.confidence,
        "created_at": event.created_at,
        "memory": {
            "id": saved_memory.id,
            "concept_id": saved_memory.concept_id,
            "concept_name": saved_memory.concept_name,
            "mastery_score": saved_memory.mastery_score,
            "strength": saved_memory.strength,
            "needs_review": saved_memory.needs_review,
        }
        if saved_memory
        else None,
    }
