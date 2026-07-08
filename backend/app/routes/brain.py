from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.brain.brain import get_brain
from app.utils.deps import get_current_user

router = APIRouter(tags=["Brain"])


@router.get("/summary")
def get_brain_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)
    return brain.summarize()


@router.get("/recommendations")
def get_brain_recommendations(
    study_room_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)
    return brain.recommend(study_room_id=study_room_id)


@router.get("/search")
def brain_search(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=12, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)
    return brain.search(query=q, limit=limit)
