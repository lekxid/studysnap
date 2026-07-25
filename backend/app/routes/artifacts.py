from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ai_conversation import AIConversation
from app.models.ai_message import AIMessage
from app.models.artifact import Artifact
from app.models.user import User
from app.schemas.artifact import (
    ArtifactCreateFromMessageRequest,
    ArtifactCreateTextRequest,
    ArtifactDeleteResponse,
    ArtifactResponse,
    ArtifactTicketResponse,
)
from app.services.artifact_service import (
    artifact_content_is_final,
    create_download_ticket,
    create_text_artifact,
    decode_download_ticket,
    get_owned_artifact_or_404,
    resolve_artifact_file,
    serialize_artifact,
    suggest_artifact_title,
)
from app.utils.deps import get_current_user


router = APIRouter()


def verify_conversation_owner(
    db: Session,
    conversation_id: int,
    owner_id: int,
) -> AIConversation:
    conversation = (
        db.query(AIConversation)
        .filter(
            AIConversation.id == conversation_id,
            AIConversation.owner_id == owner_id,
        )
        .first()
    )

    if conversation is None:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found.",
        )

    return conversation


def verify_message_owner(
    db: Session,
    message_id: int,
    owner_id: int,
) -> tuple[AIMessage, AIConversation]:
    result = (
        db.query(AIMessage, AIConversation)
        .join(
            AIConversation,
            AIConversation.id == AIMessage.conversation_id,
        )
        .filter(
            AIMessage.id == message_id,
            AIConversation.owner_id == owner_id,
        )
        .first()
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Message not found.",
        )

    return result


def artifact_file_response(
    *,
    db: Session,
    artifact: Artifact,
    inline: bool,
) -> FileResponse:
    file_path = resolve_artifact_file(artifact)

    artifact.download_count = int(artifact.download_count or 0) + 1
    artifact.last_downloaded_at = datetime.now(timezone.utc)
    db.add(artifact)
    db.commit()

    return FileResponse(
        path=file_path,
        filename=artifact.filename,
        media_type=artifact.content_type,
        content_disposition_type=("inline" if inline else "attachment"),
        headers={
            "Cache-Control": "private, no-store",
            "Pragma": "no-cache",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/public/{artifact_id}")
def download_artifact_with_ticket(
    artifact_id: int,
    token: str = Query(..., min_length=20),
    inline: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    ticket_artifact_id, owner_id = decode_download_ticket(token)

    if ticket_artifact_id != artifact_id:
        raise HTTPException(
            status_code=404,
            detail="Download link is invalid or expired.",
        )

    artifact = get_owned_artifact_or_404(
        db,
        artifact_id,
        owner_id,
    )
    return artifact_file_response(
        db=db,
        artifact=artifact,
        inline=inline,
    )




@router.post("/image-pdf")
async def create_image_pdf_from_upload(
    conversation_id: int = Form(...),
    command: str = Form(
        default="Convert this image to PDF."
    ),
    title: str = Form(
        default="StudySnap Image"
    ),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    from app.services.artifact_service import (
        create_image_pdf_artifact,
    )

    conversation = verify_conversation_owner(
        db,
        conversation_id,
        current_user.id,
    )

    clean_command = (
        command.strip()
        or "Convert this image to PDF."
    )

    content_type = (
        image.content_type
        or ""
    ).lower()

    suffix = Path(
        image.filename or ""
    ).suffix.lower()

    allowed_suffixes = {
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
    }

    allowed_content_types = {
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/gif",
    }

    if (
        suffix not in allowed_suffixes
        and content_type not in allowed_content_types
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Choose a PNG, JPG, JPEG, "
                "WEBP, or GIF image."
            ),
        )

    image_bytes = await image.read()
    await image.close()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail=(
                "The image is empty. "
                "Choose another image."
            ),
        )

    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=(
                "The image is larger "
                "than 20 MB."
            ),
        )

    user_message = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=clean_command,
    )

    assistant_message = AIMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=(
            "I created a PDF from the image. "
            "Open or download it below."
        ),
    )

    db.add(user_message)
    db.add(assistant_message)
    db.flush()

    artifact = create_image_pdf_artifact(
        db=db,
        owner_id=current_user.id,
        title=(
            title.strip()
            or "StudySnap Image"
        ),
        image_bytes=image_bytes,
        conversation_id=conversation.id,
        message_id=assistant_message.id,
    )

    db.refresh(user_message)
    db.refresh(assistant_message)

    return {
        "artifact": serialize_artifact(
            artifact
        ),
        "user_message": {
            "id": user_message.id,
            "conversation_id":
                user_message.conversation_id,
            "role": user_message.role,
            "content": user_message.content,
            "created_at":
                user_message.created_at,
        },
        "assistant_message": {
            "id": assistant_message.id,
            "conversation_id":
                assistant_message.conversation_id,
            "role":
                assistant_message.role,
            "content":
                assistant_message.content,
            "created_at":
                assistant_message.created_at,
        },
    }


@router.post(
    "/text",
    response_model=ArtifactResponse,
)
def create_artifact_from_text(
    payload: ArtifactCreateTextRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.conversation_id is not None:
        verify_conversation_owner(
            db,
            payload.conversation_id,
            current_user.id,
        )

    if payload.message_id is not None:
        message, conversation = verify_message_owner(
            db,
            payload.message_id,
            current_user.id,
        )

        if (
            payload.conversation_id is not None
            and conversation.id != payload.conversation_id
        ):
            raise HTTPException(
                status_code=400,
                detail="Message does not belong to the selected conversation.",
            )

    artifact = create_text_artifact(
        db=db,
        owner_id=current_user.id,
        title=payload.title,
        content=payload.content,
        artifact_format=payload.format,
        conversation_id=payload.conversation_id,
        message_id=payload.message_id,
        expires_in_days=payload.expires_in_days,
    )
    return serialize_artifact(artifact)


@router.post(
    "/from-message/{message_id}",
    response_model=ArtifactResponse,
)
def create_artifact_from_message(
    message_id: int,
    payload: ArtifactCreateFromMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message, conversation = verify_message_owner(
        db,
        message_id,
        current_user.id,
    )

    if message.role != "assistant":
        raise HTTPException(
            status_code=400,
            detail="Only StudySnap AI answers can be exported from a message.",
        )

    if not artifact_content_is_final(
        message.content
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "This answer is not a completed "
                "document and cannot be exported."
            ),
        )

    conversation_title = (
        conversation.title or ""
    ).strip()

    generic_title = (
        not conversation_title
        or conversation_title.lower()
        in {
            "new conversation",
            "room study trail",
        }
        or conversation_title.lower().startswith(
            "summarize this"
        )
        or conversation_title.lower().startswith(
            "explain this"
        )
    )

    title = (
        payload.title
        or (
            suggest_artifact_title(
                "",
                message.content,
                fallback="StudySnap AI Answer",
            )
            if generic_title
            else conversation_title
        )
    )

    artifact = create_text_artifact(
        db=db,
        owner_id=current_user.id,
        title=title,
        content=message.content,
        artifact_format=payload.format,
        conversation_id=conversation.id,
        message_id=message.id,
        expires_in_days=payload.expires_in_days,
    )
    return serialize_artifact(artifact)


@router.get(
    "/message/{message_id}",
    response_model=list[ArtifactResponse],
)
def list_message_artifacts(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_message_owner(
        db,
        message_id,
        current_user.id,
    )

    artifacts = (
        db.query(Artifact)
        .filter(
            Artifact.owner_id == current_user.id,
            Artifact.message_id == message_id,
            Artifact.status == "ready",
            or_(
                Artifact.expires_at.is_(None),
                Artifact.expires_at
                > datetime.now(timezone.utc),
            ),
        )
        .order_by(
            Artifact.created_at.desc(),
            Artifact.id.desc(),
        )
        .all()
    )

    return [
        serialize_artifact(artifact)
        for artifact in artifacts
    ]


@router.get("", response_model=list[ArtifactResponse])
def list_artifacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    artifacts = (
        db.query(Artifact)
        .filter(
            Artifact.owner_id == current_user.id,
            Artifact.status == "ready",
        )
        .order_by(Artifact.created_at.desc(), Artifact.id.desc())
        .limit(100)
        .all()
    )
    return [serialize_artifact(artifact) for artifact in artifacts]


@router.get("/{artifact_id}", response_model=ArtifactResponse)
def get_artifact(
    artifact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    artifact = get_owned_artifact_or_404(
        db,
        artifact_id,
        current_user.id,
    )
    return serialize_artifact(artifact)


@router.post(
    "/{artifact_id}/ticket",
    response_model=ArtifactTicketResponse,
)
def create_artifact_ticket(
    artifact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    artifact = get_owned_artifact_or_404(
        db,
        artifact_id,
        current_user.id,
    )
    url, expires_at = create_download_ticket(artifact)
    return {
        "artifact_id": artifact.id,
        "url": url,
        "expires_at": expires_at,
    }


@router.get("/{artifact_id}/download")
def download_artifact(
    artifact_id: int,
    inline: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    artifact = get_owned_artifact_or_404(
        db,
        artifact_id,
        current_user.id,
    )
    return artifact_file_response(
        db=db,
        artifact=artifact,
        inline=inline,
    )


@router.delete(
    "/{artifact_id}",
    response_model=ArtifactDeleteResponse,
)
def delete_artifact(
    artifact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    artifact = get_owned_artifact_or_404(
        db,
        artifact_id,
        current_user.id,
        allow_expired=True,
    )
    file_path = resolve_artifact_file(artifact)

    artifact.status = "deleted"
    db.add(artifact)
    db.commit()

    try:
        file_path.unlink(missing_ok=True)
    except OSError:
        pass

    return {
        "id": artifact.id,
        "deleted": True,
    }
