from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.quiz import Quiz
from app.models.quiz_question import QuizQuestion
from app.models.user import User
from app.services.rooms.access import (
    require_room_contributor,
    require_room_item_change,
    require_room_view,
)
from app.utils.deps import get_current_user


router = APIRouter(
    prefix="/quizzes",
    tags=["Quizzes"],
)


class QuizQuestionCreate(BaseModel):
    question: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_answer: str = "A"
    explanation: str | None = None


class QuizCreate(BaseModel):
    study_room_id: int
    title: str
    questions: list[QuizQuestionCreate] = Field(
        default_factory=list
    )


def serialize_quiz(
    quiz: Quiz,
    questions: list[QuizQuestion],
) -> dict:
    return {
        "id": quiz.id,
        "title": quiz.title,
        "study_room_id": quiz.study_room_id,
        "owner_id": quiz.owner_id,
        "created_at": quiz.created_at,
        "questions": [
            {
                "id": question.id,
                "quiz_id": question.quiz_id,
                "question": question.question,
                "option_a": question.option_a,
                "option_b": question.option_b,
                "option_c": question.option_c,
                "option_d": question.option_d,
                "correct_answer": (
                    question.correct_answer
                ),
                "explanation": (
                    question.explanation
                ),
                "created_at": (
                    question.created_at
                ),
            }
            for question in questions
        ],
    }


def get_quiz_or_404(
    db: Session,
    quiz_id: int,
) -> Quiz:
    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id
        )
        .first()
    )

    if quiz is None:
        raise HTTPException(
            status_code=404,
            detail="Quiz not found",
        )

    return quiz


@router.get("/{study_room_id}")
def get_quizzes(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_view(
        db=db,
        room_id=study_room_id,
        user_id=current_user.id,
    )

    quizzes = (
        db.query(Quiz)
        .filter(
            Quiz.study_room_id
            == study_room_id
        )
        .order_by(Quiz.id.desc())
        .all()
    )

    quiz_ids = [
        quiz.id
        for quiz in quizzes
    ]

    questions_by_quiz_id: dict[
        int,
        list[QuizQuestion],
    ] = {
        quiz.id: []
        for quiz in quizzes
    }

    if quiz_ids:
        questions = (
            db.query(QuizQuestion)
            .filter(
                QuizQuestion.quiz_id.in_(
                    quiz_ids
                )
            )
            .order_by(
                QuizQuestion.id.asc()
            )
            .all()
        )

        for question in questions:
            questions_by_quiz_id.setdefault(
                question.quiz_id,
                [],
            ).append(question)

    return [
        serialize_quiz(
            quiz,
            questions_by_quiz_id.get(
                quiz.id,
                [],
            ),
        )
        for quiz in quizzes
    ]


@router.post("")
def create_quiz(
    data: QuizCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_contributor(
        db=db,
        room_id=data.study_room_id,
        user_id=current_user.id,
    )

    quiz = Quiz(
        title=(
            data.title.strip()
            or "Untitled Quiz"
        ),
        study_room_id=data.study_room_id,
        owner_id=current_user.id,
    )

    db.add(quiz)
    db.flush()

    saved_questions: list[
        QuizQuestion
    ] = []

    for item in data.questions:
        correct_answer = (
            item.correct_answer
            or "A"
        ).strip().upper()[:1]

        if correct_answer not in {
            "A",
            "B",
            "C",
            "D",
        }:
            correct_answer = "A"

        question = QuizQuestion(
            quiz_id=quiz.id,
            question=item.question.strip(),
            option_a=item.option_a.strip(),
            option_b=item.option_b.strip(),
            option_c=item.option_c.strip(),
            option_d=item.option_d.strip(),
            correct_answer=correct_answer,
            explanation=(
                item.explanation.strip()
                if item.explanation
                else None
            ),
        )

        db.add(question)
        saved_questions.append(
            question
        )

    db.commit()
    db.refresh(quiz)

    for question in saved_questions:
        db.refresh(question)

    return serialize_quiz(
        quiz,
        saved_questions,
    )


@router.delete("/{quiz_id}")
def delete_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    quiz = get_quiz_or_404(
        db=db,
        quiz_id=quiz_id,
    )

    require_room_item_change(
        db=db,
        room_id=quiz.study_room_id,
        user_id=current_user.id,
        item_owner_id=quiz.owner_id,
    )

    (
        db.query(QuizQuestion)
        .filter(
            QuizQuestion.quiz_id
            == quiz.id
        )
        .delete(
            synchronize_session=False
        )
    )

    db.delete(quiz)
    db.commit()

    return {
        "message": "Quiz deleted"
    }
