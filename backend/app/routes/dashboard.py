from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.study_room import StudyRoom
from app.models.note import Note
from app.models.flashcard import Flashcard
from app.models.quiz import Quiz
from app.models.user import User
from app.schemas.dashboard import DashboardStatsResponse
from app.services.dashboard.intelligence import build_dashboard_intelligence
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


@router.get("/smart")
def get_smart_dashboard(
    limit: int = Query(
        default=20,
        ge=1,
        le=50,
    ),
    cursor: str | None = Query(
        default=None,
        max_length=1000,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    """
    Return the student's unified intelligent dashboard.

    The response includes one recommended next step, needs-attention
    items, resumable work, unread group activity and a cursor-paginated
    newest-to-oldest learning feed.
    """

    return build_dashboard_intelligence(
        db,
        user_id=current_user.id,
        limit=limit,
        cursor=cursor,
    )
