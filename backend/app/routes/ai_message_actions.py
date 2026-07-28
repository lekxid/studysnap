from __future__ import annotations

import re

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ai_conversation import (
    AIConversation,
)
from app.models.ai_message import AIMessage
from app.models.user import User
from app.routes.ai import (
    build_conversation_history_context,
    build_conversation_message_prompt,
    serialize_ai_message,
    serialize_conversation,
    utc_now,
)
from app.services.ai_service import (
    generate_studysnap_answer,
)
from app.utils.deps import get_current_user


router = APIRouter(
    tags=["AI Message Actions"],
)


class BranchMessageRequest(BaseModel):
    include_message: bool = True
    title: str | None = Field(
        default=None,
        max_length=100,
    )


class EditAndResendRequest(BaseModel):
    content: str = Field(
        min_length=1,
        max_length=20_000,
    )


def get_owned_message(
    db: Session,
    *,
    message_id: int,
    owner_id: int,
) -> tuple[
    AIMessage,
    AIConversation,
]:
    result = (
        db.query(
            AIMessage,
            AIConversation,
        )
        .join(
            AIConversation,
            AIConversation.id
            == AIMessage.conversation_id,
        )
        .filter(
            AIMessage.id == message_id,
            AIConversation.owner_id
            == owner_id,
        )
        .first()
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Message not found.",
        )

    return result


def get_source_messages(
    db: Session,
    *,
    conversation_id: int,
    maximum_id: int,
    inclusive: bool,
) -> list[AIMessage]:
    query = (
        db.query(AIMessage)
        .filter(
            AIMessage.conversation_id
            == conversation_id,
        )
    )

    if inclusive:
        query = query.filter(
            AIMessage.id <= maximum_id,
        )
    else:
        query = query.filter(
            AIMessage.id < maximum_id,
        )

    return (
        query.order_by(
            AIMessage.id.asc(),
        )
        .all()
    )


ATTACHMENT_FIELDS = (
    "attachment_file_path",
    "attachment_filename",
    "attachment_content_type",
    "attachment_mime_type",
    "attachment_file_size",
    "attachment_size",
    "attachment_sha256",
    "attachment_extracted_text",
)


def clone_attachment_fields(
    source: AIMessage,
    target: AIMessage,
) -> None:
    # Keep the branch connected to the same
    # durable uploaded file without duplicating
    # its bytes. Copy only mapped fields that
    # exist in this StudySnap version.
    for field_name in ATTACHMENT_FIELDS:
        if (
            not hasattr(source, field_name)
            or not hasattr(target, field_name)
        ):
            continue

        setattr(
            target,
            field_name,
            getattr(source, field_name),
        )


BRANCH_TITLE_PREFIX = re.compile(
    r"^(?:branch\s*(?:[·:—-])\s*)+",
    re.IGNORECASE,
)


def normalized_branch_source_title(
    value: str | None,
) -> str:
    title = (
        value
        or "Study Trail"
    ).strip() or "Study Trail"

    previous = None

    while title != previous:
        previous = title
        title = BRANCH_TITLE_PREFIX.sub(
            "",
            title,
        ).strip()

    return title or "Study Trail"


def create_branch(
    db: Session,
    *,
    source: AIConversation,
    owner_id: int,
    requested_title: str | None = None,
) -> AIConversation:
    requested_source_title = (
        normalized_branch_source_title(
            requested_title
        )
        if requested_title
        else ""
    )

    source_title = (
        normalized_branch_source_title(
            source.title
        )
    )

    branch_title_source = (
        requested_source_title
        or source_title
    )

    branch = AIConversation(
        title=(
            f"Branch · {branch_title_source}"
        )[:100],
        mode=source.mode,
        surface=source.surface,
        study_room_id=source.study_room_id,
        context_type=source.context_type,
        context_id=source.context_id,
        is_pinned=False,
        owner_id=owner_id,
        updated_at=utc_now(),
    )

    db.add(branch)
    db.flush()

    return branch


def clone_messages(
    db: Session,
    *,
    messages: list[AIMessage],
    branch_id: int,
) -> list[AIMessage]:
    cloned: list[AIMessage] = []

    for source in messages:
        message = AIMessage(
            conversation_id=branch_id,
            role=source.role,
            content=source.content,
        )

        clone_attachment_fields(
            source,
            message,
        )

        db.add(message)
        db.flush()
        cloned.append(message)

    return cloned


def create_fresh_exchange(
    db: Session,
    *,
    branch: AIConversation,
    owner_id: int,
    user_content: str,
) -> tuple[
    AIMessage,
    AIMessage,
]:
    clean_content = user_content.strip()

    if not clean_content:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty.",
        )

    history_text = (
        build_conversation_history_context(
            db=db,
            conversation=branch,
            requesting_user_id=owner_id,
            question=clean_content,
        )
    )

    prompt = (
        build_conversation_message_prompt(
            conversation=branch,
            history_text=history_text,
            message=clean_content,
        )
    )

    user_message = AIMessage(
        conversation_id=branch.id,
        role="user",
        content=clean_content,
    )

    db.add(user_message)
    db.flush()

    raw_answer = (
        generate_studysnap_answer(
            prompt
        ).strip()
        or "No answer was returned."
    )

    needs_clarification = (
        raw_answer.lower().startswith(
            "needs_clarification:"
        )
    )

    answer = (
        raw_answer.split(
            ":",
            1,
        )[1].strip()
        if (
            needs_clarification
            and ":" in raw_answer
        )
        else raw_answer
    )

    assistant_message = AIMessage(
        conversation_id=branch.id,
        role="assistant",
        content=answer,
    )

    db.add(assistant_message)

    branch.updated_at = utc_now()
    db.add(branch)
    db.flush()

    return (
        user_message,
        assistant_message,
    )


def action_response(
    *,
    action: str,
    branch: AIConversation,
    messages: list[AIMessage],
    user_message: AIMessage | None = None,
    assistant_message: AIMessage | None = None,
) -> dict:
    return {
        "action": action,
        "conversation": (
            serialize_conversation(
                branch
            )
        ),
        "messages": [
            serialize_ai_message(
                message
            )
            for message in messages
        ],
        "user_message": (
            serialize_ai_message(
                user_message
            )
            if user_message
            is not None
            else None
        ),
        "assistant_message": (
            serialize_ai_message(
                assistant_message
            )
            if assistant_message
            is not None
            else None
        ),
    }


@router.post(
    "/messages/{message_id}/branch"
)
def branch_from_message(
    message_id: int,
    data: BranchMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    (
        source_message,
        source_conversation,
    ) = get_owned_message(
        db,
        message_id=message_id,
        owner_id=current_user.id,
    )

    try:
        source_messages = (
            get_source_messages(
                db,
                conversation_id=(
                    source_conversation.id
                ),
                maximum_id=(
                    source_message.id
                ),
                inclusive=(
                    data.include_message
                ),
            )
        )

        branch = create_branch(
            db,
            source=source_conversation,
            owner_id=current_user.id,
            requested_title=data.title,
        )

        cloned = clone_messages(
            db,
            messages=source_messages,
            branch_id=branch.id,
        )

        db.commit()
        db.refresh(branch)

        for message in cloned:
            db.refresh(message)

    except Exception:
        db.rollback()
        raise

    return action_response(
        action="branch",
        branch=branch,
        messages=cloned,
    )


@router.post(
    "/messages/{message_id}/edit-resend"
)
def edit_and_resend(
    message_id: int,
    data: EditAndResendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    (
        source_message,
        source_conversation,
    ) = get_owned_message(
        db,
        message_id=message_id,
        owner_id=current_user.id,
    )

    if source_message.role != "user":
        raise HTTPException(
            status_code=400,
            detail=(
                "Only student messages "
                "can be edited and resent."
            ),
        )

    try:
        prefix = get_source_messages(
            db,
            conversation_id=(
                source_conversation.id
            ),
            maximum_id=source_message.id,
            inclusive=False,
        )

        branch = create_branch(
            db,
            source=source_conversation,
            owner_id=current_user.id,
        )

        cloned = clone_messages(
            db,
            messages=prefix,
            branch_id=branch.id,
        )

        (
            user_message,
            assistant_message,
        ) = create_fresh_exchange(
            db,
            branch=branch,
            owner_id=current_user.id,
            user_content=data.content,
        )

        db.commit()
        db.refresh(branch)
        db.refresh(user_message)
        db.refresh(assistant_message)

        for message in cloned:
            db.refresh(message)

    except Exception:
        db.rollback()
        raise

    messages = [
        *cloned,
        user_message,
        assistant_message,
    ]

    return action_response(
        action="edit_resend",
        branch=branch,
        messages=messages,
        user_message=user_message,
        assistant_message=assistant_message,
    )


@router.post(
    "/messages/{message_id}/retry"
)
def retry_from_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    (
        source_message,
        source_conversation,
    ) = get_owned_message(
        db,
        message_id=message_id,
        owner_id=current_user.id,
    )

    if source_message.role != "user":
        raise HTTPException(
            status_code=400,
            detail=(
                "Retry starts from a "
                "student message."
            ),
        )

    try:
        prefix = get_source_messages(
            db,
            conversation_id=(
                source_conversation.id
            ),
            maximum_id=source_message.id,
            inclusive=False,
        )

        branch = create_branch(
            db,
            source=source_conversation,
            owner_id=current_user.id,
        )

        cloned = clone_messages(
            db,
            messages=prefix,
            branch_id=branch.id,
        )

        (
            user_message,
            assistant_message,
        ) = create_fresh_exchange(
            db,
            branch=branch,
            owner_id=current_user.id,
            user_content=(
                source_message.content
            ),
        )

        db.commit()
        db.refresh(branch)
        db.refresh(user_message)
        db.refresh(assistant_message)

        for message in cloned:
            db.refresh(message)

    except Exception:
        db.rollback()
        raise

    messages = [
        *cloned,
        user_message,
        assistant_message,
    ]

    return action_response(
        action="retry",
        branch=branch,
        messages=messages,
        user_message=user_message,
        assistant_message=assistant_message,
    )


@router.post(
    "/messages/{message_id}/regenerate"
)
def regenerate_answer(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    (
        source_message,
        source_conversation,
    ) = get_owned_message(
        db,
        message_id=message_id,
        owner_id=current_user.id,
    )

    if source_message.role != "assistant":
        raise HTTPException(
            status_code=400,
            detail=(
                "Regenerate starts from "
                "a StudySnap answer."
            ),
        )

    source_user_message = (
        db.query(AIMessage)
        .filter(
            AIMessage.conversation_id
            == source_conversation.id,
            AIMessage.role == "user",
            AIMessage.id
            < source_message.id,
        )
        .order_by(
            AIMessage.id.desc(),
        )
        .first()
    )

    if source_user_message is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "No student message was "
                "found before this answer."
            ),
        )

    try:
        prefix = get_source_messages(
            db,
            conversation_id=(
                source_conversation.id
            ),
            maximum_id=(
                source_user_message.id
            ),
            inclusive=False,
        )

        branch = create_branch(
            db,
            source=source_conversation,
            owner_id=current_user.id,
        )

        cloned = clone_messages(
            db,
            messages=prefix,
            branch_id=branch.id,
        )

        (
            user_message,
            assistant_message,
        ) = create_fresh_exchange(
            db,
            branch=branch,
            owner_id=current_user.id,
            user_content=(
                source_user_message.content
            ),
        )

        db.commit()
        db.refresh(branch)
        db.refresh(user_message)
        db.refresh(assistant_message)

        for message in cloned:
            db.refresh(message)

    except Exception:
        db.rollback()
        raise

    messages = [
        *cloned,
        user_message,
        assistant_message,
    ]

    return action_response(
        action="regenerate",
        branch=branch,
        messages=messages,
        user_message=user_message,
        assistant_message=assistant_message,
    )
