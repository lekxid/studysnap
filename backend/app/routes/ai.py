import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.study_room import StudyRoom
from app.models.note import Note
from app.models.flashcard import Flashcard
from app.models.quiz import Quiz
from app.models.quiz_question import QuizQuestion
from app.models.ai_conversation import AIConversation
from app.models.ai_message import AIMessage
from app.services.ai_service import (
    generate_studysnap_answer,
    stream_studysnap_answer,
    generate_basic_flashcards,
    generate_basic_quiz,
)
from app.utils.deps import get_current_user
from app.services.lesson_service import generate_lesson
from app.schemas.lesson import LessonResponse

router = APIRouter(tags=["AI"])

VALID_CONVERSATION_MODES = {"general", "pdf"}


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


class CreateConversationRequest(BaseModel):
    study_room_id: int
    title: str = "New Conversation"
    mode: str = "general"


class CreateMessageRequest(BaseModel):
    conversation_id: int
    content: str
    mode: str = "explain"


def normalize_conversation_mode(mode: str | None) -> str:
    clean_mode = (mode or "general").strip().lower()

    if clean_mode not in VALID_CONVERSATION_MODES:
        raise HTTPException(
            status_code=400,
            detail="Invalid conversation mode. Use 'general' or 'pdf'.",
        )

    return clean_mode


def verify_study_room(db: Session, study_room_id: int, owner_id: int):
    room = db.query(StudyRoom).filter(
        StudyRoom.id == study_room_id,
        StudyRoom.owner_id == owner_id,
    ).first()

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    return room


def verify_conversation(db: Session, conversation_id: int, owner_id: int):
    conversation = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
        AIConversation.owner_id == owner_id,
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


@router.post("/ask")
def ask_ai(
    data: AskAIRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.study_room_id is not None:
        verify_study_room(db, data.study_room_id, current_user.id)

    answer = generate_studysnap_answer(data.question, data.context)

    return {"answer": answer}


@router.post("/conversations")
def create_conversation(
    data: CreateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_study_room(db, data.study_room_id, current_user.id)

    conversation_mode = normalize_conversation_mode(data.mode)

    conversation = AIConversation(
        title=data.title or "New Conversation",
        mode=conversation_mode,
        study_room_id=data.study_room_id,
        owner_id=current_user.id,
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return {
        "id": conversation.id,
        "title": conversation.title,
        "mode": conversation.mode,
        "study_room_id": conversation.study_room_id,
        "owner_id": conversation.owner_id,
        "created_at": conversation.created_at,
    }


@router.get("/conversations/{study_room_id}")
def get_conversations(
    study_room_id: int,
    mode: str = Query(default="general"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_study_room(db, study_room_id, current_user.id)

    conversation_mode = normalize_conversation_mode(mode)

    conversations = db.query(AIConversation).filter(
        AIConversation.study_room_id == study_room_id,
        AIConversation.owner_id == current_user.id,
        AIConversation.mode == conversation_mode,
    ).order_by(AIConversation.id.desc()).all()

    return [
        {
            "id": conversation.id,
            "title": conversation.title,
            "mode": conversation.mode,
            "study_room_id": conversation.study_room_id,
            "owner_id": conversation.owner_id,
            "created_at": conversation.created_at,
        }
        for conversation in conversations
    ]


@router.post("/messages")
def create_message(
    data: CreateMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(db, data.conversation_id, current_user.id)

    previous_messages = db.query(AIMessage).filter(
        AIMessage.conversation_id == conversation.id,
    ).order_by(AIMessage.id.asc()).all()

    history_text = "\n\n".join(
        f"{message.role.upper()}: {message.content}"
        for message in previous_messages[-8:]
    )

    if conversation.mode == "pdf":
        prompt = f"""
You are StudySnap PDF Assistant inside a study room.

This conversation is for PDF-based help only.
For now, use the conversation history to understand follow-up questions.
If the student asks about PDF content that is not provided yet, clearly say that PDF context is needed.

Conversation history:
{history_text}

New student message:
{data.content}
"""
    else:
        prompt = f"""
You are StudySnap AI Tutor inside a study room.

Use the conversation history to understand follow-up questions.

Conversation history:
{history_text}

New student message:
{data.content}
"""

    user_message = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=data.content,
    )

    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    answer = generate_studysnap_answer(prompt)

    ai_message = AIMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
    )

    db.add(ai_message)
    db.commit()
    db.refresh(ai_message)

    if conversation.title == "New Conversation":
        short_title = data.content.strip()[:50]
        conversation.title = short_title if short_title else "New Conversation"
        db.commit()
        db.refresh(conversation)

    return {
        "user_message": {
            "id": user_message.id,
            "conversation_id": user_message.conversation_id,
            "role": user_message.role,
            "content": user_message.content,
            "created_at": user_message.created_at,
        },
        "assistant_message": {
            "id": ai_message.id,
            "conversation_id": ai_message.conversation_id,
            "role": ai_message.role,
            "content": ai_message.content,
            "created_at": ai_message.created_at,
        },
        "conversation": {
            "id": conversation.id,
            "title": conversation.title,
            "mode": conversation.mode,
            "study_room_id": conversation.study_room_id,
            "created_at": conversation.created_at,
        },
    }


@router.post("/messages/stream")
def create_message_stream(
    data: CreateMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(db, data.conversation_id, current_user.id)

    previous_messages = db.query(AIMessage).filter(
        AIMessage.conversation_id == conversation.id,
    ).order_by(AIMessage.id.asc()).all()

    history_text = "\n\n".join(
        f"{message.role.upper()}: {message.content}"
        for message in previous_messages[-8:]
    )

    if conversation.mode == "pdf":
        prompt = f"""
You are StudySnap PDF Assistant inside a study room.

This conversation is for PDF-based help only.
For now, use the conversation history to understand follow-up questions.
If the student asks about PDF content that is not provided yet, clearly say that PDF context is needed.

Conversation history:
{history_text}

New student message:
{data.content}
"""
    else:
        prompt = f"""
You are StudySnap AI Tutor inside a study room.

Use the conversation history to understand follow-up questions.

Conversation history:
{history_text}

New student message:
{data.content}
"""

    user_message = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=data.content,
    )

    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    if conversation.title == "New Conversation":
        short_title = data.content.strip()[:50]
        conversation.title = short_title if short_title else "New Conversation"
        db.commit()
        db.refresh(conversation)

    def event_stream():
        full_answer = ""

        try:
            for token in stream_studysnap_answer(prompt):
                full_answer += token
                yield f"data: {json.dumps(token)}\n\n"

            ai_message = AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=full_answer,
            )

            db.add(ai_message)
            db.commit()
            db.refresh(ai_message)

            yield "data: [DONE]\n\n"

        except Exception as exc:
            db.rollback()
            error_message = "Sorry, streaming failed: " + str(exc)
            yield f"data: {json.dumps(error_message)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/messages/{conversation_id}")
def get_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(db, conversation_id, current_user.id)

    messages = db.query(AIMessage).filter(
        AIMessage.conversation_id == conversation.id,
    ).order_by(AIMessage.id.asc()).all()

    return [
        {
            "id": message.id,
            "conversation_id": message.conversation_id,
            "role": message.role,
            "content": message.content,
            "created_at": message.created_at,
        }
        for message in messages
    ]


@router.post("/generate-flashcards")
def generate_flashcards(
    data: GenerateFlashcardsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_study_room(db, data.study_room_id, current_user.id)

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
    verify_study_room(db, data.study_room_id, current_user.id)

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