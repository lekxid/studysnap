from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.brain.brain import get_brain
from app.utils.deps import get_current_user

router = APIRouter(tags=["Brain"])


class BrainAnswerRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=8000)
    study_room_id: int | None = None
    limit: int = Field(default=6, ge=1, le=12)


class SaveBrainHistoryAsNoteRequest(BaseModel):
    study_room_id: int | None = None
    title: str | None = Field(default=None, max_length=200)


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


@router.get("/history")
def brain_history(
    study_room_id: int | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)
    return brain.get_history(
        study_room_id=study_room_id,
        limit=limit,
    )


@router.post("/history/{history_id}/save-note")
def brain_history_save_note(
    history_id: int,
    data: SaveBrainHistoryAsNoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)

    try:
        return brain.save_history_as_note(
            history_id=history_id,
            study_room_id=data.study_room_id,
            title=data.title,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
@router.delete("/history/{history_id}")
def brain_history_delete(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brain = get_brain(db=db, current_user=current_user)

    try:
        return brain.delete_history(history_id=history_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
