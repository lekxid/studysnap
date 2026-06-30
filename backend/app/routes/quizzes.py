from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.quiz import Quiz
from app.models.study_room import StudyRoom
from app.models.user import User
from app.utils.deps import get_current_user

router = APIRouter(prefix="/quizzes", tags=["Quizzes"])


class QuizCreate(BaseModel):
    study_room_id: int
    title: str


@router.get("/{study_room_id}")
def get_quizzes(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    quizzes = db.query(Quiz).filter(
        Quiz.study_room_id == study_room_id,
        Quiz.owner_id == current_user.id
    ).order_by(Quiz.id.desc()).all()

    return quizzes


@router.post("")
def create_quiz(
    data: QuizCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = db.query(StudyRoom).filter(
        StudyRoom.id == data.study_room_id,
        StudyRoom.owner_id == current_user.id
    ).first()

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    quiz = Quiz(
        title=data.title,
        study_room_id=data.study_room_id,
        owner_id=current_user.id,
    )

    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    return quiz


@router.delete("/{quiz_id}")
def delete_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    quiz = db.query(Quiz).filter(
        Quiz.id == quiz_id,
        Quiz.owner_id == current_user.id
    ).first()

    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    db.delete(quiz)
    db.commit()

    return {"message": "Quiz deleted"}
