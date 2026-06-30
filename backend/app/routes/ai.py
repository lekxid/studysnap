from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.study_room import StudyRoom
from app.models.note import Note
from app.models.flashcard import Flashcard
from app.models.quiz import Quiz
from app.models.quiz_question import QuizQuestion
from app.services.ai_service import (
    generate_studysnap_answer,
    generate_basic_flashcards,
    generate_basic_quiz,
)
from app.utils.deps import get_current_user
from app.services.lesson_service import generate_lesson
from app.schemas.lesson import LessonResponse

router = APIRouter(tags=["AI"])


class AskAIRequest(BaseModel):
    question: str
    context: str = ""
    study_room_id: int | None = None


class GenerateFlashcardsRequest(BaseModel):
    study_room_id: int
    content: str | None = None


class GenerateQuizRequest(BaseModel):
    study_room_id: int
    title: str = "AI Generated Quiz"
    content: str | None = None


@router.post("/ask")
def ask_ai(
    data: AskAIRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.study_room_id is not None:
        room = db.query(StudyRoom).filter(
            StudyRoom.id == data.study_room_id,
            StudyRoom.owner_id == current_user.id,
        ).first()

        if not room:
            raise HTTPException(status_code=404, detail="Study room not found")

    answer = generate_studysnap_answer(data.question, data.context)

    return {"answer": answer}


@router.post("/generate-flashcards")
def generate_flashcards(
    data: GenerateFlashcardsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = db.query(StudyRoom).filter(
        StudyRoom.id == data.study_room_id,
        StudyRoom.owner_id == current_user.id,
    ).first()

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    source_text = data.content or ""

    if not source_text.strip():
        notes = db.query(Note).filter(
            Note.study_room_id == data.study_room_id,
            Note.owner_id == current_user.id,
        ).order_by(Note.id.desc()).all()

        source_text = "\n\n".join(note.content for note in notes if note.content)

    if not source_text.strip():
        raise HTTPException(status_code=400, detail="No notes or content found")

    cards = generate_basic_flashcards(source_text)

    created = []

    for card in cards:
        flashcard = Flashcard(
            question=card["question"],
            answer=card["answer"],
            study_room_id=data.study_room_id,
            owner_id=current_user.id,
        )
        db.add(flashcard)
        created.append(flashcard)

    db.commit()

    for card in created:
        db.refresh(card)

    return {
        "message": "Flashcards generated successfully",
        "count": len(created),
        "flashcards": [
            {
                "id": card.id,
                "question": card.question,
                "answer": card.answer,
            }
            for card in created
        ],
    }


@router.post("/generate-quiz")
def generate_quiz(
    data: GenerateQuizRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = db.query(StudyRoom).filter(
        StudyRoom.id == data.study_room_id,
        StudyRoom.owner_id == current_user.id,
    ).first()

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    source_text = data.content or ""

    if not source_text.strip():
        notes = db.query(Note).filter(
            Note.study_room_id == data.study_room_id,
            Note.owner_id == current_user.id,
        ).order_by(Note.id.desc()).all()

        source_text = "\n\n".join(note.content for note in notes if note.content)

    if not source_text.strip():
        raise HTTPException(status_code=400, detail="No notes or content found")

    quiz = Quiz(
        title=data.title,
        study_room_id=data.study_room_id,
        owner_id=current_user.id,
    )

    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    questions = generate_basic_quiz(source_text)

    created_questions = []

    for item in questions:
        question = QuizQuestion(
            quiz_id=quiz.id,
            question=item["question"],
            option_a=item["option_a"],
            option_b=item["option_b"],
            option_c=item["option_c"],
            option_d=item["option_d"],
            correct_answer=item["correct_answer"],
            explanation=item["explanation"],
        )
        db.add(question)
        created_questions.append(question)

    db.commit()

    for question in created_questions:
        db.refresh(question)

    return {
        "message": "Quiz generated successfully",
        "quiz_id": quiz.id,
        "title": quiz.title,
        "count": len(created_questions),
        "questions": [
            {
                "id": q.id,
                "question": q.question,
                "option_a": q.option_a,
                "option_b": q.option_b,
                "option_c": q.option_c,
                "option_d": q.option_d,
                "correct_answer": q.correct_answer,
                "explanation": q.explanation,
            }
            for q in created_questions
        ],
    }


@router.post("/lesson", response_model=LessonResponse)
def lesson(
    data: AskAIRequest,
    current_user: User = Depends(get_current_user),
):
    return generate_lesson(
        question=data.question,
        context=data.context,
    )
