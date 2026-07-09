from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.brain.brain import get_brain
from app.utils.deps import get_current_user

router = APIRouter(tags=["Brain"])


class BrainAnswerRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    study_room_id: int | None = None
    limit: int = Field(default=6, ge=1, le=12)


@router.get("/summary")
def get_brain_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)
    return brain.summarize()


@router.get("/insights")
def get_brain_insights(
    study_room_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)
    return brain.get_insights(study_room_id=study_room_id)


@router.get("/coach")
def get_brain_coach(
    study_room_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)
    return brain.get_coach(study_room_id=study_room_id)


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


@router.get("/retrieve")
def brain_retrieve(
    q: str = Query(default="", max_length=160),
    study_room_id: int | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)
    return brain.retrieve(
        query=q,
        study_room_id=study_room_id,
        limit=limit,
    )


@router.get("/prompt")
def brain_prompt(
    q: str = Query(default="", max_length=220),
    study_room_id: int | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)
    return brain.build_prompt(
        question=q,
        study_room_id=study_room_id,
        limit=limit,
    )


@router.post("/answer")
def brain_answer(
    data: BrainAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)

    try:
        return brain.answer(
            question=data.question.strip(),
            study_room_id=data.study_room_id,
            limit=data.limit,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
