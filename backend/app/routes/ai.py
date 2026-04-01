from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.flashcard import Flashcard
from backend.app.models.study_room import StudyRoom
from backend.app.models.user import User
from backend.app.schemas.ai import (
    AskAIRequest,
    AskAIResponse,
    GenerateFlashcardsRequest,
    GenerateFlashcardsResponse,
)
from backend.app.utils.deps import get_current_user
from backend.app.services.ai_service import generate_studysnap_answer, generate_basic_flashcards

router = APIRouter(tags=["AI"])


@router.post("/ask", response_model=AskAIResponse)
def ask_ai(
    data: AskAIRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if data.study_room_id is not None:
        room = (
            db.query(StudyRoom)
            .filter(
                StudyRoom.id == data.study_room_id,
                StudyRoom.owner_id == current_user.id
            )
            .first()
        )
        if not room:
            raise HTTPException(status_code=404, detail="Study room not found")

    answer = generate_studysnap_answer(data.question, data.context)
    return {"answer": answer}


@router.post("/generate-flashcards", response_model=GenerateFlashcardsResponse)
def generate_flashcards(
    data: GenerateFlashcardsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == data.study_room_id,
            StudyRoom.owner_id == current_user.id
        )
        .first()
    )

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    flashcards = generate_basic_flashcards(data.content)

    saved = []
    for card in flashcards:
        row = Flashcard(
            question=card["question"],
            answer=card["answer"],
            study_room_id=data.study_room_id,
            owner_id=current_user.id
        )
        db.add(row)
        saved.append(card)

    db.commit()

    return {"flashcards": saved}


from pydantic import BaseModel
from backend.app.models.note import Note
from backend.app.models.study_room import StudyRoom
from backend.app.models.flashcard import Flashcard


class GenerateFlashcardsRequest(BaseModel):
    study_room_id: int


@router.post("/generate-flashcards")
def generate_flashcards(
    data: GenerateFlashcardsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == data.study_room_id,
            StudyRoom.owner_id == current_user.id,
        )
        .first()
    )

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    notes = (
        db.query(Note)
        .filter(
            Note.study_room_id == data.study_room_id,
            Note.owner_id == current_user.id,
        )
        .order_by(Note.id.desc())
        .all()
    )

    if not notes:
        raise HTTPException(status_code=400, detail="No notes found in this study room")

    source_text = "\n\n".join(note.content for note in notes if note.content)

    lines = [line.strip() for line in source_text.splitlines() if line.strip()]
    created = []

    for line in lines[:10]:
        question = f"What does this mean: {line[:80]}?"
        answer = line[:300]

        card = Flashcard(
            question=question,
            answer=answer,
            study_room_id=data.study_room_id,
            owner_id=current_user.id,
        )
        db.add(card)
        created.append(card)

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


from backend.app.models.quiz import Quiz


class GenerateQuizzesRequest(BaseModel):
    study_room_id: int


@router.post("/generate-quizzes")
def generate_quizzes(
    data: GenerateQuizzesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == data.study_room_id,
            StudyRoom.owner_id == current_user.id,
        )
        .first()
    )

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    notes = (
        db.query(Note)
        .filter(
            Note.study_room_id == data.study_room_id,
            Note.owner_id == current_user.id,
        )
        .order_by(Note.id.desc())
        .all()
    )

    if not notes:
        raise HTTPException(status_code=400, detail="No notes found in this study room")

    source_text = "\n\n".join(note.content for note in notes if note.content)
    lines = [line.strip() for line in source_text.splitlines() if line.strip()]
    created = []

    for line in lines[:10]:
        question = f"What is the correct explanation for: {line[:80]}?"
        answer = line[:300]

        quiz = Quiz(
            question=question,
            answer=answer,
            study_room_id=data.study_room_id,
            owner_id=current_user.id,
        )
        db.add(quiz)
        created.append(quiz)

    db.commit()

    for quiz in created:
        db.refresh(quiz)

    return {
        "message": "Quizzes generated successfully",
        "count": len(created),
        "quizzes": [
            {
                "id": quiz.id,
                "question": quiz.question,
                "answer": quiz.answer,
            }
            for quiz in created
        ],
    }
