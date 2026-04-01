from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.study_room import StudyRoom
from backend.app.models.note import Note
from backend.app.models.flashcard import Flashcard
from backend.app.models.quiz import Quiz
from backend.app.models.user import User
from backend.app.utils.deps import get_current_user

router = APIRouter(prefix="/room-overview", tags=["Room Overview"])


@router.get("/{study_room_id}")
def get_room_overview(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == study_room_id,
            StudyRoom.owner_id == current_user.id
        )
        .first()
    )

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    notes_count = db.query(Note).filter(
        Note.study_room_id == study_room_id,
        Note.owner_id == current_user.id
    ).count()

    flashcards_count = db.query(Flashcard).filter(
        Flashcard.study_room_id == study_room_id,
        Flashcard.owner_id == current_user.id
    ).count()

    quizzes_count = db.query(Quiz).filter(
        Quiz.study_room_id == study_room_id,
        Quiz.owner_id == current_user.id
    ).count()

    return {
        "room": {
            "id": room.id,
            "name": room.name,
            "subject": room.subject,
            "description": room.description
        },
        "counts": {
            "notes": notes_count,
            "flashcards": flashcards_count,
            "quizzes": quizzes_count
        }
    }
