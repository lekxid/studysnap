from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.study_room import StudyRoom
from app.models.note import Note
from app.models.flashcard import Flashcard
from app.models.quiz import Quiz
from app.models.user import User
from app.schemas.dashboard import DashboardStatsResponse
from app.utils.deps import get_current_user

router = APIRouter(tags=["Dashboard"])


@router.get("", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total_study_rooms = db.query(StudyRoom).filter(StudyRoom.owner_id == current_user.id).count()
    total_notes = db.query(Note).filter(Note.owner_id == current_user.id).count()
    total_flashcards = db.query(Flashcard).filter(Flashcard.owner_id == current_user.id).count()
    total_quizzes = db.query(Quiz).filter(Quiz.owner_id == current_user.id).count()

    return {
        "total_study_rooms": total_study_rooms,
        "total_notes": total_notes,
        "total_flashcards": total_flashcards,
        "total_quizzes": total_quizzes
    }
