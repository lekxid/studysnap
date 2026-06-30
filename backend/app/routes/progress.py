from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.study_session import StudySession
from app.models.quiz_attempt import QuizAttempt
from app.models.user import User
from app.utils.deps import get_current_user

router = APIRouter(prefix="/progress", tags=["Progress"])


@router.get("/overview")
def progress_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total_sessions = db.query(func.count(StudySession.id)).filter(
        StudySession.user_id == current_user.id
    ).scalar() or 0

    total_minutes = db.query(func.sum(StudySession.duration_minutes)).filter(
        StudySession.user_id == current_user.id
    ).scalar() or 0

    avg_score = db.query(func.avg(QuizAttempt.score)).filter(
        QuizAttempt.user_id == current_user.id
    ).scalar() or 0

    return {
        "sessions": total_sessions,
        "minutes": total_minutes,
        "avg_score": round(float(avg_score), 2)
    }
