from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.flashcard import Flashcard
from app.models.user import User
from app.services.rooms.access import (
    require_room_contributor,
    require_room_item_change,
    require_room_view,
)
from app.utils.deps import get_current_user


router = APIRouter(tags=["Flashcards"])


class FlashcardCreate(BaseModel):
    study_room_id: int
    question: str
    answer: str
    tags: str = ""
    difficulty: str = "medium"
    source_type: str = "manual"
    source_id: str | None = None


def get_flashcard_or_404(
    db: Session,
    flashcard_id: int,
) -> Flashcard:
    card = (
        db.query(Flashcard)
        .filter(
            Flashcard.id == flashcard_id
        )
        .first()
    )

    if card is None:
        raise HTTPException(
            status_code=404,
            detail="Concept Card not found",
        )

    return card


@router.get("/{study_room_id}")
def get_flashcards(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_view(
        db=db,
        room_id=study_room_id,
        user_id=current_user.id,
    )

    return (
        db.query(Flashcard)
        .filter(
            Flashcard.study_room_id
            == study_room_id
        )
        .order_by(Flashcard.id.desc())
        .all()
    )


@router.post("")
def create_flashcard(
    data: FlashcardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_contributor(
        db=db,
        room_id=data.study_room_id,
        user_id=current_user.id,
    )

    card = Flashcard(
        question=data.question,
        answer=data.answer,
        tags=data.tags,
        difficulty=data.difficulty,
        source_type=data.source_type,
        source_id=data.source_id,
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
    current_user: User = Depends(get_current_user),
):
    card = get_flashcard_or_404(
        db=db,
        flashcard_id=flashcard_id,
    )

    require_room_item_change(
        db=db,
        room_id=card.study_room_id,
        user_id=current_user.id,
        item_owner_id=card.owner_id,
    )

    db.delete(card)
    db.commit()

    return {
        "message": "Concept Card deleted"
    }
