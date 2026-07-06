from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.learning_event import LearningEvent
from app.models.user import User
from app.utils.deps import get_current_user


router = APIRouter(tags=["Learning Events"])


class LearningEventCreate(BaseModel):
    study_room_id: int | None = None
    activity_type: str
    reference_id: int | None = None
    result: str | None = None
    confidence: int | None = None


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

    return event
