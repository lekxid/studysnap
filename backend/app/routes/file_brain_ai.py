from __future__ import annotations

import base64
import io
import os
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from openai import OpenAI
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.ai_message import AIMessage
from app.models.user import User
from app.routes.ai import (
    AI_ATTACHMENT_ROOT,
    DIRECT_FILE_MAX_BYTES,
    DIRECT_FILE_MAX_MB,
    _clean_direct_filename,
    _extract_direct_file_text,
    build_conversation_history_context,
    get_intent_understanding_instructions,
    serialize_ai_message,
    store_ai_attachment,
    utc_now,
    verify_conversation,
    verify_study_room,
)
from app.services.context.builder import (
    build_study_room_context,
)
from app.services.file_brain_ai import (
    FileBrainAIError,
    cleanup_created_paths,
    hardlink_ai_attachment,
    resolve_file_brain_sources,
)
from app.utils.deps import get_current_user


router = APIRouter(
    tags=["File Brain AI"],
)

MAX_COMBINED_AI_BYTES = (
    60 * 1024 * 1024
)


class AskFileBrainRequest(
    BaseModel
):
    question: str = Field(
        default="Explain these files clearly.",
        max_length=20_000,
    )

    item_ids: list[int] = Field(
        default_factory=list,
    )

    study_room_id: int | None = None
    conversation_id: int | None = None


def handle_file_brain_ai_error(
    exc: FileBrainAIError,
) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail=str(exc),
    )


@router.post("/ask")
def ask_file_brain_items(
    data: AskFileBrainRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    clean_question = (
        data.question.strip()
        or "Explain these files clearly."
    )

    try:
        sources = resolve_file_brain_sources(
            db=db,
            owner_id=current_user.id,
            item_ids=data.item_ids,
        )
    except FileBrainAIError as exc:
        raise handle_file_brain_ai_error(
            exc
        ) from exc

    conversation = None
    conversation_context = ""

    if data.conversation_id is not None:
        conversation = verify_conversation(
            db,
            data.conversation_id,
            current_user.id,
        )

        conversation_context = (
            build_conversation_history_context(
                db=db,
                conversation=conversation,
                requesting_user_id=(
                    current_user.id
                ),
                question=clean_question,
            )
        )

    elif data.study_room_id is not None:
        room = verify_study_room(
            db,
            data.study_room_id,
            current_user.id,
        )

        conversation_context = (
            build_study_room_context(
                db=db,
                conversation_id=0,
                study_room_id=room.id,
                owner_id=room.owner_id,
                question=clean_question,
            )
        )

    prepared_attachments: list[
        dict
    ] = []

    image_inputs: list[dict] = []
    document_sections: list[str] = []

    total_bytes = 0

    created_attachment_paths: list[
        Path
    ] = []

    committed = False

    try:
        for position, source in enumerate(
            sources,
            start=1,
        ):
            filename = (
                _clean_direct_filename(
                    source.filename
                )
            )

            content_type = (
                source.content_type
                or "application/octet-stream"
            ).lower()

            file_size = (
                source.source_path
                .stat()
                .st_size
            )

            if file_size <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{filename} is empty."
                    ),
                )

            total_bytes += file_size

            if (
                total_bytes
                > MAX_COMBINED_AI_BYTES
            ):
                raise HTTPException(
                    status_code=413,
                    detail=(
                        "The selected File Brain items "
                        "are too large for one AI question. "
                        "Choose files totalling 60MB or less."
                    ),
                )

            extension = (
                Path(filename)
                .suffix
                .lower()
            )

            is_heic = (
                extension
                in {
                    ".heic",
                    ".heif",
                }
                or content_type
                in {
                    "image/heic",
                    "image/heif",
                    "image/heic-sequence",
                    "image/heif-sequence",
                }
            )

            is_image = (
                content_type.startswith(
                    "image/"
                )
                or is_heic
            )

            if is_image:
                source_limit = (
                    25 * 1024 * 1024
                    if is_heic
                    else 8 * 1024 * 1024
                )

                if file_size > source_limit:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"{filename} is too large "
                            "for direct AI image reading."
                        ),
                    )

                file_bytes = (
                    source.source_path
                    .read_bytes()
                )

                derived_attachment = False

                if is_heic:
                    try:
                        with Image.open(
                            io.BytesIO(
                                file_bytes
                            )
                        ) as source_image:
                            converted = (
                                source_image
                                .convert("RGB")
                            )

                            output = (
                                io.BytesIO()
                            )

                            converted.save(
                                output,
                                format="JPEG",
                                quality=88,
                                optimize=True,
                            )

                            file_bytes = (
                                output.getvalue()
                            )

                            content_type = (
                                "image/jpeg"
                            )

                            filename = (
                                Path(filename)
                                .stem
                                + ".jpg"
                            )

                            derived_attachment = (
                                True
                            )

                    except Exception as exc:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                "StudySnap could not "
                                f"convert {filename}. "
                                "Try JPG or PNG."
                            ),
                        ) from exc

                if (
                    len(file_bytes)
                    > 8 * 1024 * 1024
                ):
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"{filename} is larger "
                            "than 8MB after preparation."
                        ),
                    )

                encoded = (
                    base64.b64encode(
                        file_bytes
                    ).decode("utf-8")
                )

                image_inputs.append(
                    {
                        "type": (
                            "input_image"
                        ),
                        "image_url": (
                            f"data:{content_type};"
                            f"base64,{encoded}"
                        ),
                        "detail": "auto",
                    }
                )

                prepared_attachments.append(
                    {
                        "item_id": (
                            source
                            .requested_item
                            .id
                        ),
                        "filename": filename,
                        "content_type": (
                            content_type
                        ),
                        "data": file_bytes,
                        "kind": "image",
                        "source_path": (
                            source.source_path
                        ),
                        "derived": (
                            derived_attachment
                        ),
                        "source_type": (
                            source.source_type
                        ),
                        "source_id": (
                            source.source_id
                        ),
                    }
                )

                continue

            if (
                file_size
                > DIRECT_FILE_MAX_BYTES
            ):
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"{filename} is too large "
                        "for direct AI reading. "
                        f"Choose a file up to "
                        f"{DIRECT_FILE_MAX_MB}MB."
                    ),
                )

            file_bytes = (
                source.source_path
                .read_bytes()
            )

            (
                extracted_text,
                file_kind,
            ) = _extract_direct_file_text(
                filename=filename,
                content_type=content_type,
                data=file_bytes,
            )

            document_sections.append(
                "\n".join(
                    [
                        (
                            f"FILE {position}: "
                            f"{filename} "
                            f"({file_kind})"
                        ),
                        "--- BEGIN FILE ---",
                        extracted_text,
                        "--- END FILE ---",
                    ]
                )
            )

            prepared_attachments.append(
                {
                    "item_id": (
                        source
                        .requested_item
                        .id
                    ),
                    "filename": filename,
                    "content_type": (
                        content_type
                    ),
                    "data": file_bytes,
                    "kind": "file",
                    "source_path": (
                        source.source_path
                    ),
                    "derived": False,
                    "source_type": (
                        source.source_type
                    ),
                    "source_id": (
                        source.source_id
                    ),
                    "requested_item_id": (
                        source.requested_item.id
                    ),
                }
            )

        if conversation is not None:
            for item in prepared_attachments:
                item["attachment_source_type"] = None
                item["attachment_source_id"] = None

                if item["derived"]:
                    (
                        stored_filename,
                        stored_path,
                    ) = store_ai_attachment(
                        data=item["data"],
                        filename=(
                            item["filename"]
                        ),
                        owner_id=(
                            current_user.id
                        ),
                        conversation_id=(
                            conversation.id
                        ),
                        content_type=(
                            item[
                                "content_type"
                            ]
                        ),
                    )
                else:
                    try:
                        (
                            stored_filename,
                            stored_path,
                        ) = hardlink_ai_attachment(
                            source_path=(
                                item[
                                    "source_path"
                                ]
                            ),
                            filename=(
                                item[
                                    "filename"
                                ]
                            ),
                            owner_id=(
                                current_user.id
                            ),
                            conversation_id=(
                                conversation.id
                            ),
                            attachment_root=(
                                AI_ATTACHMENT_ROOT
                            ),
                        )
                    except FileBrainAIError as exc:
                        raise (
                            handle_file_brain_ai_error(
                                exc
                            )
                        ) from exc

                    if (
                        Path(stored_path).resolve()
                        == Path(
                            item["source_path"]
                        ).resolve()
                    ):
                        item[
                            "attachment_source_type"
                        ] = "file_brain_item"
                        item[
                            "attachment_source_id"
                        ] = int(
                            item[
                                "item_id"
                            ]
                        )

                item[
                    "stored_filename"
                ] = stored_filename

                item[
                    "stored_path"
                ] = stored_path

                if (
                    item[
                        "attachment_source_type"
                    ]
                    is None
                ):
                    created_attachment_paths.append(
                        Path(stored_path)
                    )

        attachment_names = ", ".join(
            item["filename"]
            for item
            in prepared_attachments
        )

        prompt = f"""
You are StudySnap AI.

{get_intent_understanding_instructions()}

The student selected {len(prepared_attachments)}
completed File Brain items:
{attachment_names}

Student question:
{clean_question}

Read and compare all selected material together.

Give one useful, natural answer.
Connect information across files when relevant.
Clearly identify differences or contradictions.
Use short headings only when they improve readability.
Do not invent information that is not visible in the files.
If any file is unclear or incomplete, say so briefly.
The files are privately staged in File Brain.
Do not claim they were moved into a Study Room.

Relevant room or conversation context:
{conversation_context or "No additional context provided."}

Extracted document content:
{chr(10).join(document_sections) or "The selected attachments are images."}
""".strip()

        client = OpenAI(
            api_key=(
                settings.openai_api_key
            ),
            timeout=75.0,
        )

        if image_inputs:
            model = (
                getattr(
                    settings,
                    "openai_vision_model",
                    None,
                )
                or os.getenv(
                    "OPENAI_VISION_MODEL",
                    "gpt-4o-mini",
                )
            )

            response = (
                client.responses.create(
                    model=model,
                    input=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": (
                                        "input_text"
                                    ),
                                    "text": prompt,
                                },
                                *image_inputs,
                            ],
                        }
                    ],
                )
            )

        else:
            model = (
                getattr(
                    settings,
                    "openai_model",
                    None,
                )
                or os.getenv(
                    "OPENAI_MODEL",
                    "gpt-4.1-mini",
                )
            )

            response = (
                client.responses.create(
                    model=model,
                    input=prompt,
                )
            )

        answer = (
            getattr(
                response,
                "output_text",
                "",
            )
            or (
                "StudySnap could not produce "
                "an answer from these files."
            )
        )

        saved_attachments: list[
            AIMessage
        ] = []

        saved_ai_message = None

        if conversation is not None:
            for index, item in enumerate(
                prepared_attachments
            ):
                content = (
                    clean_question
                    if index == 0
                    else (
                        "Attached from "
                        "File Brain: "
                        f"{item['filename']}"
                    )
                )

                message = AIMessage(
                    conversation_id=(
                        conversation.id
                    ),
                    role="user",
                    content=content,
                    attachment_filename=(
                        item["filename"]
                    ),
                    attachment_stored_filename=(
                        item[
                            "stored_filename"
                        ]
                    ),
                    attachment_file_path=(
                        item[
                            "stored_path"
                        ]
                    ),
                    attachment_file_size=len(
                        item["data"]
                    ),
                    attachment_content_type=(
                        item["content_type"]
                    ),
                    attachment_kind=(
                        item["kind"]
                    ),
                    attachment_source_type=(
                        item.get(
                            "attachment_source_type"
                        )
                    ),
                    attachment_source_id=(
                        item.get(
                            "attachment_source_id"
                        )
                    ),
                )

                db.add(message)

                saved_attachments.append(
                    message
                )

            saved_ai_message = AIMessage(
                conversation_id=(
                    conversation.id
                ),
                role="assistant",
                content=answer,
            )

            db.add(saved_ai_message)

            if (
                conversation.title
                == "New Conversation"
            ):
                conversation.title = (
                    clean_question[:50]
                    or "File Brain question"
                )

            conversation.updated_at = (
                utc_now()
            )

            db.add(conversation)

        now = utc_now()

        for source in sources:
            item = (
                source.requested_item
            )

            item.result_message = (
                "Read successfully by "
                "General AI"
                + (
                    " in conversation "
                    f"#{conversation.id}."
                    if conversation
                    is not None
                    else "."
                )
            )

            item.error_message = None
            item.updated_at = now

            db.add(item)

        db.commit()
        committed = True

        for message in saved_attachments:
            db.refresh(message)

        if saved_ai_message is not None:
            db.refresh(
                saved_ai_message
            )

        if conversation is not None:
            db.refresh(conversation)

        return {
            "answer": answer,
            "count": len(
                prepared_attachments
            ),
            "attachments": [
                serialize_ai_message(
                    message
                )
                for message
                in saved_attachments
            ],
            "assistant_message": (
                serialize_ai_message(
                    saved_ai_message
                )
                if saved_ai_message
                is not None
                else None
            ),
            "file_brain_items": [
                {
                    "id": item[
                        "item_id"
                    ],
                    "filename": item[
                        "filename"
                    ],
                    "kind": item["kind"],
                    "source_type": item[
                        "source_type"
                    ],
                    "source_id": item[
                        "source_id"
                    ],
                    "read": True,
                }
                for item
                in prepared_attachments
            ],
            "storage": {
                "reuploaded": False,
                "second_file_copy": (
                    any(
                        item["derived"]
                        for item
                        in prepared_attachments
                    )
                ),
                "method": (
                    "hard_link"
                    if conversation
                    is not None
                    else "source_reference"
                ),
                "note": (
                    "HEIC files are converted "
                    "to a JPEG derivative when needed."
                ),
            },
        }

    except HTTPException:
        db.rollback()

        if not committed:
            cleanup_created_paths(
                created_attachment_paths
            )

        raise

    except Exception as exc:
        db.rollback()

        if not committed:
            cleanup_created_paths(
                created_attachment_paths
            )

        raise HTTPException(
            status_code=500,
            detail=(
                "File Brain AI failed: "
                + str(exc)
            ),
        ) from exc
