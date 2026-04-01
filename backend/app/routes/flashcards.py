from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.flashcard import Flashcard
from app.models.study_room import StudyRoom
from app.models.user import User
from app.utils.deps import get_current_user

router = APIRouter(prefix="/flashcards", tags=["Flashcards"])


class FlashcardCreate(BaseModel):
    study_room_id: int
    question: str
    answer: str


@router.get("/{study_room_id}")
def get_flashcards(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cards = db.query(Flashcard).filter(
        Flashcard.study_room_id == study_room_id,
        Flashcard.owner_id == current_user.id
    ).order_by(Flashcard.id.desc()).all()

    return cards


@router.post("")
def create_flashcard(
    data: FlashcardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = db.query(StudyRoom).filter(
        StudyRoom.id == data.study_room_id,
        StudyRoom.owner_id == current_user.id
    ).first()

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    card = Flashcard(
        question=data.question,
        answer=data.answer,
        study_room_id=data.study_room_id,
        owner_id=current_user.id,
    )

    db.add(card)
    db.commit()
    db.refresh(card)

    return card


@router.delete("/{flashcard_id}")
def delete_flashcard(
    flashcard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    card = db.query(Flashcard).filter(
        Flashcard.id == flashcard_id,
        Flashcard.owner_id == current_user.id
    ).first()

    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    db.delete(card)
    db.commit()

    return {"message": "Flashcard deleted"}
