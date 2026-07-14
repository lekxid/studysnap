from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.ai_service import (
    generate_studysnap_answer,
)
from app.models.room_message import RoomMessage
from app.models.user import User
from app.services.rooms.access import (
    ROOM_MANAGER_ROLES,
    require_room_contributor,
    require_room_view,
)
from app.services.rooms.realtime import (
    broadcast_room_realtime_event,
)
from app.utils.deps import get_current_user


router = APIRouter(tags=["Room Messages"])

MAX_MESSAGE_LENGTH = 5000


class RoomMessageCreate(BaseModel):
    content: str = Field(
        min_length=1,
        max_length=MAX_MESSAGE_LENGTH,
    )
    reply_to_message_id: int | None = Field(
        default=None,
        ge=1,
    )


class RoomMessageUpdate(BaseModel):
    content: str = Field(
        min_length=1,
        max_length=MAX_MESSAGE_LENGTH,
    )


class RoomAIAskRequest(BaseModel):
    source_message_id: int = Field(
        ge=1,
    )


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_content(value: str) -> str:
    content = value.strip()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Write a message before sending.",
        )

    if len(content) > MAX_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=(
                "Messages cannot be longer than "
                f"{MAX_MESSAGE_LENGTH} characters."
            ),
        )

    return content


def parse_metadata(
    value: str | None,
) -> dict[str, Any]:
    if not value:
        return {}

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}

    return parsed if isinstance(parsed, dict) else {}


def isoformat_or_none(
    value: datetime | None,
) -> str | None:
    return (
        value.isoformat()
        if value is not None
        else None
    )


def serialize_message(
    message: RoomMessage,
    sender: User | None,
) -> dict[str, Any]:
    is_deleted = message.deleted_at is not None

    return {
        "id": message.id,
        "room_id": message.room_id,
        "sender_id": message.sender_id,
        "sender": (
            {
                "id": sender.id,
                "full_name": sender.full_name,
                "email": sender.email,
            }
            if sender is not None
            else None
        ),
        "message_type": message.message_type,
        "content": (
            ""
            if is_deleted
            else message.content
        ),
        "reply_to_message_id": (
            message.reply_to_message_id
        ),
        "metadata": parse_metadata(
            message.metadata_json
        ),
        "created_at": isoformat_or_none(
            message.created_at
        ),
        "edited_at": isoformat_or_none(
            message.edited_at
        ),
        "deleted_at": isoformat_or_none(
            message.deleted_at
        ),
        "is_deleted": is_deleted,
    }


def get_message_or_404(
    db: Session,
    room_id: int,
    message_id: int,
) -> RoomMessage:
    message = (
        db.query(RoomMessage)
        .filter(
            RoomMessage.id == message_id,
            RoomMessage.room_id == room_id,
        )
        .first()
    )

    if message is None:
        raise HTTPException(
            status_code=404,
            detail="Room message not found.",
        )

    return message


def validate_reply_target(
    db: Session,
    room_id: int,
    reply_to_message_id: int | None,
) -> RoomMessage | None:
    if reply_to_message_id is None:
        return None

    reply_target = get_message_or_404(
        db=db,
        room_id=room_id,
        message_id=reply_to_message_id,
    )

    if reply_target.deleted_at is not None:
        raise HTTPException(
            status_code=400,
            detail=(
                "You cannot reply to a deleted "
                "message."
            ),
        )

    return reply_target


def require_message_change(
    message: RoomMessage,
    user_id: int,
    role: str,
) -> None:
    if message.deleted_at is not None:
        raise HTTPException(
            status_code=400,
            detail="This message has been deleted.",
        )

    if message.message_type != "message":
        raise HTTPException(
            status_code=400,
            detail=(
                "This type of room message cannot "
                "be changed here."
            ),
        )

    if (
        role in ROOM_MANAGER_ROLES
        or message.sender_id == user_id
    ):
        return

    raise HTTPException(
        status_code=403,
        detail=(
            "You can only change messages you sent "
            "unless you manage this room."
        ),
    )


@router.get("/rooms/{room_id}")
def list_room_messages(
    room_id: int,
    before_id: int | None = Query(
        default=None,
        ge=1,
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    require_room_view(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    query = (
        db.query(RoomMessage, User)
        .outerjoin(
            User,
            RoomMessage.sender_id == User.id,
        )
        .filter(
            RoomMessage.room_id == room_id
        )
    )

    if before_id is not None:
        query = query.filter(
            RoomMessage.id < before_id
        )

    rows = (
        query
        .order_by(RoomMessage.id.desc())
        .limit(limit)
        .all()
    )

    return [
        serialize_message(message, sender)
        for message, sender in reversed(rows)
    ]


@router.post("/rooms/{room_id}")
def create_room_message(
    room_id: int,
    data: RoomMessageCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    require_room_contributor(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    content = normalize_content(
        data.content
    )

    validate_reply_target(
        db=db,
        room_id=room_id,
        reply_to_message_id=(
            data.reply_to_message_id
        ),
    )

    message = RoomMessage(
        room_id=room_id,
        sender_id=current_user.id,
        message_type="message",
        content=content,
        reply_to_message_id=(
            data.reply_to_message_id
        ),
        metadata_json="{}",
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    serialized_message = serialize_message(
        message,
        current_user,
    )

    background_tasks.add_task(
        broadcast_room_realtime_event,
        event="message.created",
        room_id=room_id,
        actor_user_id=current_user.id,
        data={
            "message": serialized_message,
        },
    )

    return serialized_message


@router.post(
    "/rooms/{room_id}/ask-ai"
)
def ask_room_ai(
    room_id: int,
    data: RoomAIAskRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    """
    Bring StudySnap AI into a shared room only
    after a student explicitly chooses Ask AI.

    The student's normal room message is created
    through the existing message endpoint first.
    This endpoint creates only the AI reply.
    """

    require_room_contributor(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    source_message = get_message_or_404(
        db=db,
        room_id=room_id,
        message_id=data.source_message_id,
    )

    if source_message.deleted_at is not None:
        raise HTTPException(
            status_code=400,
            detail=(
                "StudySnap AI cannot answer a "
                "deleted message."
            ),
        )

    if source_message.message_type != "message":
        raise HTTPException(
            status_code=400,
            detail=(
                "StudySnap AI can only answer a "
                "student message."
            ),
        )

    if source_message.sender_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail=(
                "You can only bring StudySnap AI "
                "in for a message you sent."
            ),
        )

    question = normalize_content(
        source_message.content
    )

    recent_rows = (
        db.query(RoomMessage, User)
        .outerjoin(
            User,
            RoomMessage.sender_id == User.id,
        )
        .filter(
            RoomMessage.room_id == room_id,
            RoomMessage.deleted_at.is_(None),
            RoomMessage.id
            != source_message.id,
        )
        .order_by(
            RoomMessage.id.desc()
        )
        .limit(12)
        .all()
    )

    conversation_lines: list[str] = []

    for room_message, sender in reversed(
        recent_rows
    ):
        if room_message.message_type == "ai":
            speaker = "StudySnap AI"
        elif sender is not None:
            speaker = (
                sender.full_name
                or "Student"
            )
        else:
            speaker = "Student"

        clean_content = (
            room_message.content.strip()
        )

        if not clean_content:
            continue

        conversation_lines.append(
            f"{speaker}: "
            f"{clean_content[:1200]}"
        )

    conversation_context = (
        "\n".join(conversation_lines)
        if conversation_lines
        else "No earlier group messages."
    )

    ai_context = f"""
You are StudySnap AI participating in a shared
student study-room conversation.

You are replying only because a student explicitly
chose Ask AI. Do not interrupt ordinary human chat.

Help the whole group understand the topic.
Use clear, student-friendly language.
Be accurate, supportive, and practical.
Keep the answer focused enough for group chat.
Do not pretend to be a human classmate.
Do not claim that you saw materials that are not
included in the conversation.

Recent group conversation:
{conversation_context}
""".strip()

    try:
        answer = generate_studysnap_answer(
            question,
            ai_context,
        ).strip()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "StudySnap AI could not reply "
                "right now."
            ),
        ) from exc

    if not answer:
        raise HTTPException(
            status_code=502,
            detail=(
                "StudySnap AI returned an empty "
                "reply."
            ),
        )

    ai_message = RoomMessage(
        room_id=room_id,
        sender_id=None,
        message_type="ai",
        content=answer,
        reply_to_message_id=(
            source_message.id
        ),
        metadata_json=json.dumps(
            {
                "source": "study_together",
                "requested_by_user_id": (
                    current_user.id
                ),
                "source_message_id": (
                    source_message.id
                ),
            }
        ),
    )

    db.add(ai_message)
    db.commit()
    db.refresh(ai_message)

    serialized_ai_message = (
        serialize_message(
            ai_message,
            None,
        )
    )

    background_tasks.add_task(
        broadcast_room_realtime_event,
        event="message.created",
        room_id=room_id,
        actor_user_id=None,
        data={
            "message": (
                serialized_ai_message
            ),
        },
    )

    return {
        "ai_message": (
            serialized_ai_message
        ),
    }


@router.patch(
    "/rooms/{room_id}/{message_id}"
)
def update_room_message(
    room_id: int,
    message_id: int,
    data: RoomMessageUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    _, role = require_room_contributor(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    message = get_message_or_404(
        db=db,
        room_id=room_id,
        message_id=message_id,
    )

    require_message_change(
        message=message,
        user_id=current_user.id,
        role=role,
    )

    message.content = normalize_content(
        data.content
    )
    message.edited_at = utc_now()

    db.commit()
    db.refresh(message)

    sender = (
        db.query(User)
        .filter(
            User.id == message.sender_id
        )
        .first()
        if message.sender_id is not None
        else None
    )

    serialized_message = serialize_message(
        message,
        sender,
    )

    background_tasks.add_task(
        broadcast_room_realtime_event,
        event="message.updated",
        room_id=room_id,
        actor_user_id=current_user.id,
        data={
            "message": serialized_message,
        },
    )

    return serialized_message


@router.delete(
    "/rooms/{room_id}/{message_id}"
)
def delete_room_message(
    room_id: int,
    message_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    _, role = require_room_contributor(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    message = get_message_or_404(
        db=db,
        room_id=room_id,
        message_id=message_id,
    )

    require_message_change(
        message=message,
        user_id=current_user.id,
        role=role,
    )

    message.content = ""
    message.metadata_json = None
    message.deleted_at = utc_now()

    db.commit()
    db.refresh(message)

    sender = (
        db.query(User)
        .filter(
            User.id == message.sender_id
        )
        .first()
        if message.sender_id is not None
        else None
    )

    serialized_message = serialize_message(
        message,
        sender,
    )

    background_tasks.add_task(
        broadcast_room_realtime_event,
        event="message.deleted",
        room_id=room_id,
        actor_user_id=current_user.id,
        data={
            "message": serialized_message,
        },
    )

    return serialized_message
