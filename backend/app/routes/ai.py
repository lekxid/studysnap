import base64
import json
import os
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel
from openai import OpenAI
from app.config import settings
from app.services.intent_understanding import get_intent_understanding_instructions

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
from app.services.context.builder import build_study_room_context
from app.services.context.providers.conversation import build_conversation_context
from app.services.rooms.access import require_room_ai
from app.utils.deps import get_current_user
from app.services.lesson_service import generate_lesson
from app.schemas.lesson import LessonResponse

router = APIRouter(tags=["AI"])

VALID_CONVERSATION_MODES = {"general", "pdf"}

VALID_CONVERSATION_SURFACES = {
    "general_ai",
    "room_ai",
    "pdf_ai",
    "notes_ai",
    "quiz_ai",
    "concept_cards_ai",
    "brain",
    "planner_ai",
    "smart_organizer",
    "voice_ai",
}

ROOM_BOUND_SURFACES = {
    "room_ai",
    "pdf_ai",
}


class AskAIRequest(BaseModel):
    question: str
    context: str = ""
    study_room_id: int | None = None


class GenerateImageRequest(BaseModel):
    prompt: str
    conversation_id: int | None = None
    study_room_id: int | None = None
    size: Literal[
        "1024x1024",
        "1536x1024",
        "1024x1536",
    ] = "1024x1024"
    quality: Literal[
        "low",
        "medium",
        "high",
        "auto",
    ] = "medium"


class GenerateFlashcardsRequest(BaseModel):
    study_room_id: int
    content: str | None = None


class GenerateQuizRequest(BaseModel):
    study_room_id: int
    title: str = "AI Generated Quiz"
    content: str | None = None


class CreateConversationRequest(BaseModel):
    study_room_id: int | None = None
    title: str = "New Conversation"
    mode: str = "general"
    surface: str = "room_ai"
    context_type: str | None = None
    context_id: int | None = None
    force_new: bool = False


class UpdateConversationRequest(BaseModel):
    title: str | None = None
    is_pinned: bool | None = None


class CreateMessageRequest(BaseModel):
    conversation_id: int
    content: str
    mode: str = "explain"
    context: str = ""


class RecordConversationExchangeRequest(BaseModel):
    conversation_id: int
    user_content: str
    assistant_content: str


def normalize_conversation_mode(mode: str | None) -> str:
    clean_mode = (mode or "general").strip().lower()

    if clean_mode not in VALID_CONVERSATION_MODES:
        raise HTTPException(
            status_code=400,
            detail="Invalid conversation mode. Use 'general' or 'pdf'.",
        )

    return clean_mode


def normalize_conversation_surface(
    surface: str | None,
) -> str:
    clean_surface = (
        surface or "room_ai"
    ).strip().lower()

    if clean_surface not in VALID_CONVERSATION_SURFACES:
        raise HTTPException(
            status_code=400,
            detail="Invalid AI conversation surface.",
        )

    return clean_surface


def verify_study_room(
    db: Session,
    study_room_id: int,
    user_id: int,
):
    room, _role = require_room_ai(
        db=db,
        room_id=study_room_id,
        user_id=user_id,
    )

    return room


def verify_conversation(db: Session, conversation_id: int, owner_id: int):
    conversation = db.query(AIConversation).filter(
        AIConversation.id == conversation_id,
        AIConversation.owner_id == owner_id,
    ).first()

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


def utc_now():
    return datetime.now(timezone.utc)


def serialize_conversation(
    conversation: AIConversation,
) -> dict:
    return {
        "id": conversation.id,
        "title": conversation.title,
        "mode": conversation.mode,
        "surface": conversation.surface,
        "study_room_id": conversation.study_room_id,
        "context_type": conversation.context_type,
        "context_id": conversation.context_id,
        "is_pinned": bool(conversation.is_pinned),
        "owner_id": conversation.owner_id,
        "created_at": conversation.created_at,
        "updated_at": (
            conversation.updated_at
            or conversation.created_at
        ),
    }


def build_conversation_history_context(
    *,
    db: Session,
    conversation: AIConversation,
    requesting_user_id: int,
    question: str,
    context_override: str = "",
) -> str:
    sections: list[str] = []
    override_text = (context_override or "").strip()

    if conversation.study_room_id is not None:
        room = verify_study_room(
            db,
            conversation.study_room_id,
            requesting_user_id,
        )

        room_context = (
            build_study_room_context(
                db=db,
                conversation_id=conversation.id,
                study_room_id=conversation.study_room_id,
                owner_id=room.owner_id,
                question=question,
            )
            or ""
        ).strip()

        if room_context:
            sections.append(room_context)
    else:
        history = build_conversation_context(
            db=db,
            conversation_id=conversation.id,
        ).strip()

        if history:
            sections.append(
                "Conversation history:\n" + history
            )
        else:
            sections.append(
                "No previous messages in this Study Trail."
            )

    if override_text:
        sections.append(
            "Current surface context:\n" + override_text
        )

    return (
        "\n\n".join(sections)
        or "No additional conversation context available."
    )


def build_conversation_message_prompt(
    *,
    conversation: AIConversation,
    history_text: str,
    message: str,
) -> str:
    if (
        conversation.mode == "pdf"
        or conversation.surface == "pdf_ai"
    ):
        identity = "StudySnap PDF Assistant"
        boundary = (
            "Stay focused on the connected PDF or room materials. "
            "If the required PDF content is unavailable, say that "
            "clearly."
        )

    elif conversation.surface == "general_ai":
        identity = "StudySnap General AI"
        boundary = (
            "This is a general conversation. Do not claim to use "
            "room materials unless room context is actually present."
        )

    elif conversation.surface == "notes_ai":
        identity = "StudySnap Notes AI"
        boundary = (
            "Focus on the connected note and the student's current "
            "request."
        )

    elif conversation.surface == "quiz_ai":
        identity = "StudySnap Quiz Coach"
        boundary = (
            "Focus on practice, reasoning, mistakes, and useful "
            "next steps."
        )

    elif conversation.surface == "brain":
        identity = "StudySnap Brain"
        boundary = (
            "Use learning context carefully and keep sources "
            "separated."
        )

    elif conversation.surface == "planner_ai":
        identity = "StudySnap Study Planner"
        boundary = (
            "Focus on realistic study planning and the student's "
            "available learning context."
        )

    elif conversation.surface == "room_ai":
        identity = "StudySnap Room AI Tutor"
        boundary = (
            "Use only this room's connected conversation, notes, PDFs, "
            "concept cards, saved quizzes, and learning evidence. "
            "When asked about weak concepts, progress, mastery, or what "
            "to study next, base the answer on the supplied learning "
            "evidence. If no evidence exists, say that clearly and "
            "suggest a useful way to create it. Do not invent weaknesses "
            "or quiz results."
        )

    else:
        identity = "StudySnap AI Tutor"
        boundary = (
            "Use the connected learning context when it is relevant. "
            "Do not claim that unavailable evidence exists."
        )

    return f"""
You are {identity}.

Use the conversation history to understand follow-up questions,
short references, typos, and combined requests.

Keep unrelated subjects separated.

Context boundary:
{boundary}

Conversation and learning context:
{history_text}

New student message:
{message}
""".strip()


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


@router.post("/generate-image")
def generate_image(
    data: GenerateImageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate one image for General AI or Room AI.

    The generated image is returned as a data URL so the frontend can
    display it immediately. Conversation messages store a lightweight
    record of the request without putting the full base64 image in the
    database.
    """

    clean_prompt = data.prompt.strip()

    if not clean_prompt:
        raise HTTPException(
            status_code=400,
            detail="Image prompt cannot be empty.",
        )

    if len(clean_prompt) > 4000:
        raise HTTPException(
            status_code=400,
            detail="Image prompt must be 4000 characters or fewer.",
        )

    conversation = None
    effective_room_id = data.study_room_id

    if data.conversation_id is not None:
        conversation = verify_conversation(
            db,
            data.conversation_id,
            current_user.id,
        )

        if (
            data.study_room_id is not None
            and conversation.study_room_id
            != data.study_room_id
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Conversation and study room do not match."
                ),
            )

        effective_room_id = conversation.study_room_id

    if effective_room_id is not None:
        verify_study_room(
            db,
            effective_room_id,
            current_user.id,
        )

    image_model = (
        os.getenv("OPENAI_IMAGE_MODEL")
        or "gpt-image-1"
    )

    generation_prompt = f"""
Create a polished, useful image for StudySnap.

Follow the student's request closely.
For educational diagrams, prioritize clarity, accurate structure,
clean spacing, and readable labels.
Do not add unrelated logos, watermarks, or decorative text.
When the request is ambiguous, create the most useful
student-friendly interpretation.

Student request:
{clean_prompt}
""".strip()

    try:
        client = OpenAI(
            api_key=settings.openai_api_key,
            timeout=180.0,
        )

        response = client.images.generate(
            model=image_model,
            prompt=generation_prompt,
            size=data.size,
            quality=data.quality,
            n=1,
        )

        if not response.data:
            raise RuntimeError(
                "The image model returned no image."
            )

        generated = response.data[0]
        image_b64 = getattr(
            generated,
            "b64_json",
            None,
        )
        image_url = getattr(
            generated,
            "url",
            None,
        )
        revised_prompt = getattr(
            generated,
            "revised_prompt",
            None,
        )

        if not image_b64 and not image_url:
            raise RuntimeError(
                "The image response did not contain image data."
            )

        saved_user_message = None
        saved_ai_message = None

        if conversation is not None:
            saved_user_message = AIMessage(
                conversation_id=conversation.id,
                role="user",
                content=(
                    "[Create image] "
                    + clean_prompt
                ),
            )

            saved_ai_message = AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=(
                    "[Generated image]\n\n"
                    f"Prompt: {clean_prompt}"
                ),
            )

            db.add(saved_user_message)
            db.add(saved_ai_message)

            if conversation.title == "New Conversation":
                conversation.title = (
                    clean_prompt[:50]
                    or "Generated image"
                )

            conversation.updated_at = utc_now()

            db.commit()
            db.refresh(saved_user_message)
            db.refresh(saved_ai_message)
            db.refresh(conversation)

        return {
            "image_data_url": (
                f"data:image/png;base64,{image_b64}"
                if image_b64
                else None
            ),
            "image_url": image_url,
            "mime_type": (
                "image/png"
                if image_b64
                else None
            ),
            "model": image_model,
            "prompt": clean_prompt,
            "revised_prompt": revised_prompt,
            "conversation": (
                serialize_conversation(conversation)
                if conversation
                else None
            ),
            "user_message": (
                {
                    "id": saved_user_message.id,
                    "conversation_id": (
                        saved_user_message.conversation_id
                    ),
                    "role": saved_user_message.role,
                    "content": saved_user_message.content,
                    "created_at": (
                        saved_user_message.created_at
                    ),
                }
                if saved_user_message
                else None
            ),
            "assistant_message": (
                {
                    "id": saved_ai_message.id,
                    "conversation_id": (
                        saved_ai_message.conversation_id
                    ),
                    "role": saved_ai_message.role,
                    "content": saved_ai_message.content,
                    "created_at": (
                        saved_ai_message.created_at
                    ),
                }
                if saved_ai_message
                else None
            ),
        }

    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=502,
            detail=(
                "Image generation failed: "
                + str(exc)
            ),
        ) from exc


@router.post("/ask-image")
async def ask_ai_with_image(
    question: str = Form(default="Describe this image clearly."),
    study_room_id: int | None = Form(default=None),
    conversation_id: int | None = Form(default=None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    General AI image understanding endpoint.

    Used by /general-ai for ChatGPT-style image upload:
    - user uploads an image
    - user asks a question
    - AI answers about the image
    """

    _ = current_user

    content_type = image.content_type or ""

    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")

    image_bytes = await image.read()

    max_size = 8 * 1024 * 1024

    if len(image_bytes) > max_size:
        raise HTTPException(status_code=400, detail="Image must be 8MB or smaller.")

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    encoded_image = base64.b64encode(image_bytes).decode("utf-8")
    image_url = f"data:{content_type};base64,{encoded_image}"

    clean_question = question.strip() or "Describe this image clearly."

    study_room_context = ""
    conversation = None
    context_study_room_id = study_room_id

    if conversation_id is not None:
        conversation = verify_conversation(
            db,
            conversation_id,
            current_user.id,
        )

        context_study_room_id = (
            conversation.study_room_id
        )

        study_room_context = (
            build_conversation_history_context(
                db=db,
                conversation=conversation,
                requesting_user_id=current_user.id,
                question=clean_question,
            )
        )

    elif study_room_id is not None:
        room = verify_study_room(
            db,
            study_room_id,
            current_user.id,
        )

        study_room_context = build_study_room_context(
            db=db,
            conversation_id=0,
            study_room_id=study_room_id,
            owner_id=room.owner_id,
            question=clean_question,
        )

    prompt = f"""
You are StudySnap AI.

{get_intent_understanding_instructions()}

The user uploaded an image and asked a question.

Answer clearly and helpfully.
If the image contains study material, explain it in simple student-friendly words.
If the image is unclear, say what you can see and ask the user to upload a clearer image.
Do not claim certainty when the image is hard to read.
Do not provide medical diagnosis or emergency advice from images.

When project context is provided, use it to connect the image to the student's study room.
Do not invent project facts that are not in the context.

Relevant conversation or project context:
{study_room_context or "No previous context provided."}

User question:
{clean_question}
"""

    try:
        client = OpenAI(api_key=settings.openai_api_key, timeout=30.0)
        model = getattr(settings, "openai_vision_model", None) or os.getenv("OPENAI_VISION_MODEL", "gpt-4o-mini")

        response = client.responses.create(
            model=model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": prompt,
                        },
                        {
                            "type": "input_image",
                            "image_url": image_url,
                            "detail": "auto",
                        },
                    ],
                }
            ],
        )

        answer = getattr(response, "output_text", "") or "I could not read the image response."

        saved_user_message = None
        saved_ai_message = None

        if conversation is not None:
            saved_user_message = AIMessage(
                conversation_id=conversation.id,
                role="user",
                content=f"[Image uploaded] {clean_question}",
            )

            db.add(saved_user_message)
            db.commit()
            db.refresh(saved_user_message)

            saved_ai_message = AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=answer,
            )

            db.add(saved_ai_message)

            if conversation.title == "New Conversation":
                short_title = clean_question[:50]
                conversation.title = (
                    short_title
                    if short_title
                    else "Image question"
                )

            conversation.updated_at = utc_now()

            db.commit()
            db.refresh(saved_ai_message)
            db.refresh(conversation)

        return {
            "answer": answer,
            "user_message": {
                "id": saved_user_message.id,
                "conversation_id": saved_user_message.conversation_id,
                "role": saved_user_message.role,
                "content": saved_user_message.content,
                "created_at": saved_user_message.created_at,
            }
            if saved_user_message
            else None,
            "assistant_message": {
                "id": saved_ai_message.id,
                "conversation_id": saved_ai_message.conversation_id,
                "role": saved_ai_message.role,
                "content": saved_ai_message.content,
                "created_at": saved_ai_message.created_at,
            }
            if saved_ai_message
            else None,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Image AI failed: {str(exc)}",
        )


@router.post("/conversations")
def create_conversation(
    data: CreateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation_mode = normalize_conversation_mode(
        data.mode
    )

    conversation_surface = normalize_conversation_surface(
        data.surface
    )

    if data.study_room_id is not None:
        verify_study_room(
            db,
            data.study_room_id,
            current_user.id,
        )

    elif conversation_surface in ROOM_BOUND_SURFACES:
        raise HTTPException(
            status_code=400,
            detail=(
                "This AI conversation requires a study room."
            ),
        )

    if not data.force_new:
        existing = (
            db.query(AIConversation)
            .filter(
                AIConversation.owner_id == current_user.id,
                AIConversation.mode == conversation_mode,
                AIConversation.surface
                == conversation_surface,
                AIConversation.study_room_id
                == data.study_room_id,
                AIConversation.context_type
                == data.context_type,
                AIConversation.context_id
                == data.context_id,
            )
            .order_by(
                AIConversation.updated_at.desc(),
                AIConversation.id.desc(),
            )
            .first()
        )

        if existing:
            return serialize_conversation(existing)

    conversation = AIConversation(
        title=(
            (data.title or "New Conversation")
            .strip()[:100]
            or "New Conversation"
        ),
        mode=conversation_mode,
        surface=conversation_surface,
        study_room_id=data.study_room_id,
        context_type=(
            (data.context_type or "").strip()
            or None
        ),
        context_id=data.context_id,
        owner_id=current_user.id,
        updated_at=utc_now(),
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return serialize_conversation(conversation)


@router.get("/trails")
def list_study_trails(
    surface: str | None = Query(default=None),
    search: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AIConversation).filter(
        AIConversation.owner_id == current_user.id,
    )

    if surface:
        query = query.filter(
            AIConversation.surface
            == normalize_conversation_surface(surface)
        )

    clean_search = search.strip()

    if clean_search:
        query = query.filter(
            or_(
                AIConversation.title.ilike(
                    f"%{clean_search}%"
                ),
                AIConversation.context_type.ilike(
                    f"%{clean_search}%"
                ),
            )
        )

    conversations = (
        query
        .order_by(
            AIConversation.is_pinned.desc(),
            AIConversation.updated_at.desc(),
            AIConversation.id.desc(),
        )
        .limit(limit)
        .all()
    )

    return [
        serialize_conversation(conversation)
        for conversation in conversations
    ]


@router.get("/conversations/{study_room_id}")
def get_conversations(
    study_room_id: int,
    mode: str = Query(default="general"),
    surface: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_study_room(db, study_room_id, current_user.id)

    conversation_mode = normalize_conversation_mode(mode)

    query = db.query(AIConversation).filter(
        AIConversation.study_room_id == study_room_id,
        AIConversation.owner_id == current_user.id,
        AIConversation.mode == conversation_mode,
    )

    if surface:
        query = query.filter(
            AIConversation.surface
            == normalize_conversation_surface(surface)
        )

    conversations = query.order_by(
        AIConversation.is_pinned.desc(),
        AIConversation.updated_at.desc(),
        AIConversation.id.desc(),
    ).all()

    return [
        serialize_conversation(conversation)
        for conversation in conversations
    ]

@router.patch("/conversations/{conversation_id}")
def update_conversation(
    conversation_id: int,
    data: UpdateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(
        db,
        conversation_id,
        current_user.id,
    )

    if data.title is not None:
        clean_title = data.title.strip()

        if not clean_title:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Conversation title cannot be empty"
                ),
            )

        conversation.title = clean_title[:100]

    if data.is_pinned is not None:
        conversation.is_pinned = data.is_pinned

    conversation.updated_at = utc_now()

    db.commit()
    db.refresh(conversation)

    return serialize_conversation(conversation)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(db, conversation_id, current_user.id)

    db.query(AIMessage).filter(
        AIMessage.conversation_id == conversation.id,
    ).delete(synchronize_session=False)

    db.delete(conversation)
    db.commit()

    return {"message": "Conversation deleted successfully"}

@router.post("/messages")
def create_message(
    data: CreateMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(db, data.conversation_id, current_user.id)

    history_text = build_conversation_history_context(
        db=db,
        conversation=conversation,
        requesting_user_id=current_user.id,
        question=data.content,
        context_override=data.context,
    )

    prompt = build_conversation_message_prompt(
        conversation=conversation,
        history_text=history_text,
        message=data.content,
    )

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
        conversation.title = (
            short_title
            if short_title
            else "New Conversation"
        )

    conversation.updated_at = utc_now()

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
        "conversation": serialize_conversation(
            conversation
        ),
    }



@router.post("/messages/record")
def record_conversation_exchange(
    data: RecordConversationExchangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(
        db,
        data.conversation_id,
        current_user.id,
    )

    clean_user_content = data.user_content.strip()
    clean_assistant_content = (
        data.assistant_content.strip()
    )

    if not clean_user_content:
        raise HTTPException(
            status_code=400,
            detail="User message cannot be empty.",
        )

    if not clean_assistant_content:
        raise HTTPException(
            status_code=400,
            detail="Assistant message cannot be empty.",
        )

    user_message = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=clean_user_content,
    )

    assistant_message = AIMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=clean_assistant_content,
    )

    db.add(user_message)
    db.add(assistant_message)

    refresh_trail_title(
        conversation,
        clean_user_content,
    )

    conversation.updated_at = utc_now()

    db.commit()
    db.refresh(user_message)
    db.refresh(assistant_message)
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
            "id": assistant_message.id,
            "conversation_id": assistant_message.conversation_id,
            "role": assistant_message.role,
            "content": assistant_message.content,
            "created_at": assistant_message.created_at,
        },
        "conversation": serialize_conversation(
            conversation
        ),
    }


@router.post("/messages/stream")
def create_message_stream(
    data: CreateMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(db, data.conversation_id, current_user.id)

    history_text = build_conversation_history_context(
        db=db,
        conversation=conversation,
        requesting_user_id=current_user.id,
        question=data.content,
        context_override=data.context,
    )

    prompt = build_conversation_message_prompt(
        conversation=conversation,
        history_text=history_text,
        message=data.content,
    )

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
        conversation.title = (
            short_title
            if short_title
            else "New Conversation"
        )

    conversation.updated_at = utc_now()

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
            tags="",
            difficulty="medium",
            source_type="ai",
            source_id=None,
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