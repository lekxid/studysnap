import re
import asyncio
import base64
import io
import json
import os
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from threading import Event, Lock
from typing import Literal
from urllib.request import urlopen
from xml.etree import ElementTree

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.services.openai_instrumentation import OpenAI
from PIL import Image
from pillow_heif import register_heif_opener
from app.config import settings
from app.services.intent_understanding import get_intent_understanding_instructions
from app.routes.pdf_documents import extract_pdf_text

from app.database import get_db
from app.models.file_brain import FileBrainItem
from app.services.file_brain_ai import (
    FileBrainAIError,
    resolve_file_brain_source,
)
from app.storage import storage_path
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
from app.services.artifact_service import (
    artifact_content_is_final,
    build_artifact_generation_instructions,
    create_text_artifact,
    detect_artifact_export_request,
    is_artifact_followup_request,
    resolve_artifact_export_request,
    suggest_artifact_title,
)
from app.services.context.builder import build_study_room_context
from app.services.context.providers.conversation import build_conversation_context
from app.services.rooms.access import require_room_ai
from app.utils.deps import get_current_user
from app.services.lesson_service import generate_lesson
from app.schemas.lesson import LessonResponse

register_heif_opener()

router = APIRouter(tags=["AI"])

_AI_STREAM_CANCEL_LOCK = Lock()
_AI_STREAM_CANCEL_EVENTS: dict[
    tuple[int, str],
    Event,
] = {}


def clean_ai_request_id(
    value: str | None,
) -> str:
    clean = (value or "").strip()

    if not clean:
        return uuid.uuid4().hex

    return clean[:120]


def register_ai_stream(
    user_id: int,
    request_id: str,
) -> Event:
    event = Event()

    with _AI_STREAM_CANCEL_LOCK:
        _AI_STREAM_CANCEL_EVENTS[
            (user_id, request_id)
        ] = event

    return event


def cancel_ai_stream(
    user_id: int,
    request_id: str,
) -> bool:
    with _AI_STREAM_CANCEL_LOCK:
        event = _AI_STREAM_CANCEL_EVENTS.get(
            (user_id, request_id)
        )

    if event is None:
        return False

    event.set()
    return True


def remove_ai_stream(
    user_id: int,
    request_id: str,
) -> None:
    with _AI_STREAM_CANCEL_LOCK:
        _AI_STREAM_CANCEL_EVENTS.pop(
            (user_id, request_id),
            None,
        )


AI_ATTACHMENT_ROOT = storage_path(
    "ai-attachments"
)


def resolve_ai_attachment_path(
    value: str,
) -> Path:
    root = AI_ATTACHMENT_ROOT.resolve()
    file_path = Path(value).resolve()

    try:
        file_path.relative_to(root)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "The attachment path is "
                "outside StudySnap storage."
            ),
        ) from exc

    return file_path



def resolve_message_attachment_path(
    *,
    db: Session,
    message: AIMessage,
    owner_id: int,
) -> Path:
    source_type = (
        message.attachment_source_type
    )

    if source_type is None:
        if not message.attachment_file_path:
            raise HTTPException(
                status_code=404,
                detail=(
                    "This message has no "
                    "stored attachment."
                ),
            )

        return resolve_ai_attachment_path(
            message.attachment_file_path
        )

    if (
        source_type != "file_brain_item"
        or not message.attachment_source_id
    ):
        raise HTTPException(
            status_code=404,
            detail=(
                "The referenced attachment "
                "is unavailable."
            ),
        )

    item = (
        db.query(FileBrainItem)
        .filter(
            FileBrainItem.id
            == message.attachment_source_id,
            FileBrainItem.owner_id
            == owner_id,
        )
        .first()
    )

    if item is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "The referenced File Brain "
                "item was not found."
            ),
        )

    try:
        source = resolve_file_brain_source(
            db=db,
            item=item,
        )
    except FileBrainAIError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    return source.source_path


def store_ai_attachment(
    *,
    data: bytes,
    filename: str,
    owner_id: int,
    conversation_id: int,
    content_type: str,
) -> tuple[str, str]:
    suffix = Path(filename).suffix.lower()

    if (
        not suffix
        or len(suffix) > 20
        or not suffix[1:].isalnum()
    ):
        suffix = ""

    directory = (
        AI_ATTACHMENT_ROOT
        / str(owner_id)
        / str(conversation_id)
    )

    directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    stored_filename = f"{uuid.uuid4()}{suffix}"
    file_path = directory / stored_filename

    with file_path.open("xb") as output:
        output.write(data)

    try:
        file_path.chmod(0o600)
    except OSError:
        pass

    return stored_filename, str(file_path)


def serialize_ai_message(message: AIMessage) -> dict:
    has_attachment = bool(
        message.attachment_file_path
        and message.attachment_filename
    )

    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at,
        "attachment": (
            {
                "filename": message.attachment_filename,
                "file_size": message.attachment_file_size,
                "content_type": message.attachment_content_type,
                "kind": message.attachment_kind,
                "hidden_from_feed": bool(
                    message.attachment_hidden_from_feed
                ),
                "is_pinned": bool(
                    message.attachment_is_pinned
                ),
                "url": (
                    f"/api/ai/attachments/{message.id}"
                ),
            }
            if has_attachment
            else None
        ),
    }


DIRECT_FILE_MAX_MB = 25
DIRECT_FILE_MAX_BYTES = DIRECT_FILE_MAX_MB * 1024 * 1024
DIRECT_FILE_TEXT_LIMIT = 500_000

DIRECT_TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".tsv",
    ".json",
    ".jsonl",
    ".log",
    ".rtf",
    ".py",
    ".pyw",
    ".ipynb",
    ".java",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".c",
    ".h",
    ".cc",
    ".cpp",
    ".cxx",
    ".hpp",
    ".cs",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".swift",
    ".kt",
    ".kts",
    ".scala",
    ".dart",
    ".lua",
    ".r",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".html",
    ".htm",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".vue",
    ".svelte",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".properties",
}

DIRECT_EXECUTABLE_EXTENSIONS = {
    ".exe",
    ".dll",
    ".msi",
    ".com",
    ".scr",
    ".sys",
    ".dmg",
    ".app",
    ".apk",
    ".deb",
    ".rpm",
    ".bin",
    ".iso",
}

DIRECT_ARCHIVE_EXTENSIONS = {
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
    ".bz2",
    ".xz",
    ".tgz",
    ".jar",
    ".war",
}


def _clean_direct_filename(value: str | None) -> str:
    filename = Path(value or "uploaded-file").name
    filename = filename.replace("\x00", "").strip()

    return filename[:180] or "uploaded-file"


def _looks_like_executable(data: bytes) -> bool:
    if data.startswith(b"MZ"):
        return True

    if data.startswith(b"\x7fELF"):
        return True

    mach_o_headers = {
        b"\xfe\xed\xfa\xce",
        b"\xfe\xed\xfa\xcf",
        b"\xce\xfa\xed\xfe",
        b"\xcf\xed\xfe\xfa",
        b"\xca\xfe\xba\xbe",
    }

    return data[:4] in mach_o_headers


def _decode_text_file(data: bytes) -> str:
    if b"\x00" in data[:8192]:
        raise HTTPException(
            status_code=400,
            detail="StudySnap could not read this binary file as text.",
        )

    try:
        return data.decode("utf-8")[:DIRECT_FILE_TEXT_LIMIT]
    except UnicodeDecodeError:
        return data.decode(
            "utf-8",
            errors="replace",
        )[:DIRECT_FILE_TEXT_LIMIT]


def _extract_openxml_text(
    data: bytes,
    extension: str,
) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = archive.namelist()

            if extension == ".docx":
                targets = [
                    name
                    for name in names
                    if name == "word/document.xml"
                    or name.startswith("word/header")
                    or name.startswith("word/footer")
                ]
            elif extension == ".pptx":
                targets = sorted(
                    name
                    for name in names
                    if name.startswith("ppt/slides/slide")
                    and name.endswith(".xml")
                )
            elif extension == ".xlsx":
                targets = [
                    name
                    for name in names
                    if (
                        name == "xl/sharedStrings.xml"
                        or (
                            name.startswith("xl/worksheets/sheet")
                            and name.endswith(".xml")
                        )
                    )
                ]
            else:
                targets = []

            if not targets:
                raise HTTPException(
                    status_code=400,
                    detail="StudySnap could not find readable text in this file.",
                )

            chunks: list[str] = []

            for target in targets:
                try:
                    root = ElementTree.fromstring(
                        archive.read(target)
                    )
                except Exception:
                    continue

                for element in root.iter():
                    if element.text and element.text.strip():
                        chunks.append(element.text.strip())

                    if sum(len(chunk) for chunk in chunks) >= DIRECT_FILE_TEXT_LIMIT:
                        break

                if sum(len(chunk) for chunk in chunks) >= DIRECT_FILE_TEXT_LIMIT:
                    break

            extracted = "\n".join(chunks).strip()

            if not extracted:
                raise HTTPException(
                    status_code=400,
                    detail="No readable text was found in this document.",
                )

            return extracted[:DIRECT_FILE_TEXT_LIMIT]

    except zipfile.BadZipFile as exc:
        raise HTTPException(
            status_code=400,
            detail="This Office document appears damaged or unsupported.",
        ) from exc


def _extract_direct_file_text(
    filename: str,
    content_type: str,
    data: bytes,
) -> tuple[str, str]:
    extension = Path(filename).suffix.lower()
    mime = (content_type or "").lower()

    if (
        extension in DIRECT_EXECUTABLE_EXTENSIONS
        or _looks_like_executable(data)
    ):
        raise HTTPException(
            status_code=400,
            detail="Executable files cannot be opened by StudySnap AI.",
        )

    if extension in DIRECT_ARCHIVE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Archive files must be extracted before StudySnap AI can read them.",
        )

    if (
        extension in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif", ".avif"}
        or mime.startswith("image/")
    ):
        raise HTTPException(
            status_code=400,
            detail="Images should be sent through the image-reading option.",
        )

    if extension == ".pdf" or mime == "application/pdf":
        temp_path: Path | None = None

        try:
            with tempfile.NamedTemporaryFile(
                suffix=".pdf",
                delete=False,
            ) as temporary:
                temporary.write(data)
                temp_path = Path(temporary.name)

            extracted = extract_pdf_text(temp_path)

            if not extracted or not extracted.strip():
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "No readable text was found in this PDF. "
                        "It may contain scanned images only."
                    ),
                )

            return (
                extracted[:DIRECT_FILE_TEXT_LIMIT],
                "PDF",
            )
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

    if (
        extension in DIRECT_TEXT_EXTENSIONS
        or mime.startswith("text/")
    ):
        return _decode_text_file(data), "text file"

    if extension in {".docx", ".pptx", ".xlsx"}:
        labels = {
            ".docx": "Word document",
            ".pptx": "PowerPoint presentation",
            ".xlsx": "Excel workbook",
        }

        return (
            _extract_openxml_text(data, extension),
            labels[extension],
        )

    if extension in {".doc", ".ppt", ".xls"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "This older Office format is not supported yet. "
                "Save it as DOCX, PPTX, XLSX, PDF, or text and upload it again."
            ),
        )

    raise HTTPException(
        status_code=400,
        detail=(
            "StudySnap cannot read this file type yet. "
            "Use PDF, DOCX, PPTX, XLSX, text, code, CSV, JSON, or an image."
        ),
    )


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
    context_messages: list[str] | None = None
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
    request_id: str | None = None


class CancelMessageRequest(BaseModel):
    request_id: str



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


def build_recent_attachment_context(
    *,
    db: Session,
    conversation: AIConversation,
    requesting_user_id: int,
    max_characters: int = 90_000,
) -> str:
    messages = (
        db.query(AIMessage)
        .filter(
            AIMessage.conversation_id
            == conversation.id,
            AIMessage.attachment_filename
            .isnot(None),
        )
        .order_by(
            AIMessage.id.desc()
        )
        .limit(8)
        .all()
    )

    sections: list[str] = []
    remaining = max_characters
    seen: set[tuple] = set()

    for message in messages:
        if remaining <= 0:
            break

        content_type = (
            message.attachment_content_type
            or "application/octet-stream"
        ).lower()

        if (
            message.attachment_kind == "image"
            or content_type.startswith(
                "image/"
            )
        ):
            continue

        source_key = (
            message.attachment_source_type,
            message.attachment_source_id,
            message.attachment_file_path,
        )

        if source_key in seen:
            continue

        seen.add(source_key)

        try:
            source_path = (
                resolve_message_attachment_path(
                    db=db,
                    message=message,
                    owner_id=requesting_user_id,
                )
            )

            if (
                not source_path.is_file()
                or source_path.stat().st_size
                > DIRECT_FILE_MAX_BYTES
            ):
                continue

            file_bytes = source_path.read_bytes()

            extracted_text, file_kind = (
                _extract_direct_file_text(
                    filename=(
                        message.attachment_filename
                        or source_path.name
                    ),
                    content_type=content_type,
                    data=file_bytes,
                )
            )
        except (
            HTTPException,
            OSError,
            ValueError,
        ):
            continue

        clean_text = (
            extracted_text or ""
        ).strip()

        if not clean_text:
            continue

        excerpt = clean_text[:remaining]

        sections.append(
            "Stored source file:\n"
            f"Name: "
            f"{message.attachment_filename or source_path.name}\n"
            f"Type: {file_kind}\n"
            "--- BEGIN STORED SOURCE ---\n"
            f"{excerpt}\n"
            "--- END STORED SOURCE ---"
        )

        remaining -= len(excerpt)

    return "\n\n".join(
        sections
    )


def build_conversation_history_context(
    *,
    db: Session,
    conversation: AIConversation,
    requesting_user_id: int,
    question: str,
    context_override: str = "",
) -> str:
    sections: list[str] = []

    history = build_conversation_context(
        db=db,
        conversation_id=conversation.id,
    ).strip()

    if history:
        sections.append(
            "Exact conversation history:\n"
            + history
        )
    else:
        sections.append(
            "No previous messages in this "
            "Study Trail."
        )

    attachment_context = (
        build_recent_attachment_context(
            db=db,
            conversation=conversation,
            requesting_user_id=(
                requesting_user_id
            ),
        )
    ).strip()

    if attachment_context:
        sections.append(
            "Reusable stored source files:\n"
            + attachment_context
        )

    if (
        conversation.study_room_id
        is not None
    ):
        try:
            room = verify_study_room(
                db,
                conversation.study_room_id,
                requesting_user_id,
            )
        except HTTPException:
            sections.append(
                "The previously connected "
                "Study Room is unavailable. "
                "Continue using this conversation's "
                "messages and stored files without "
                "claiming access to unavailable "
                "room material."
            )
        else:
            focused_material_id = (
                conversation.context_id
                if (
                    conversation.context_type
                    in {
                        "study_material",
                        "material",
                    }
                    and isinstance(
                        conversation.context_id,
                        int,
                    )
                )
                else None
            )

            room_context = (
                build_study_room_context(
                    db=db,
                    conversation_id=(
                        conversation.id
                    ),
                    study_room_id=(
                        conversation.study_room_id
                    ),
                    owner_id=room.owner_id,
                    learner_user_id=(
                        requesting_user_id
                    ),
                    question=question,
                    focused_material_id=(
                        focused_material_id
                    ),
                )
                or ""
            ).strip()

            if room_context:
                sections.append(
                    "Relevant Study Room context:\n"
                    + room_context
                )

    override_text = (
        context_override or ""
    ).strip()

    if override_text:
        sections.append(
            "Current surface context:\n"
            + override_text
        )

    return (
        "\n\n".join(sections)
        or (
            "No additional conversation "
            "context available."
        )
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

        if conversation.study_room_id is not None:
            boundary = (
                "This General AI conversation is connected to a "
                "Study Room. Use the supplied selected material, "
                "supporting uploads, notes, PDFs, concept cards, "
                "saved quizzes, Brain memory, recent practice, "
                "mistakes, confidence, and quiz results when they "
                "are relevant. Treat a focused selected material "
                "as the primary source. Keep personal progress "
                "separate from shared room source ownership. "
                "Do not invent evidence that is not supplied."
            )
        else:
            boundary = (
                "This is a global General AI conversation. Do not "
                "claim to use Study Room materials, progress, or "
                "learning evidence unless that context is actually "
                "present."
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



IMAGE_CONTEXT_REFERENCE_PATTERN = re.compile(
    r"\b(?:this|that|it|both|them|these|those|"
    r"same|another|the two|those two)\b",
    flags=re.IGNORECASE,
)


def build_contextual_image_prompt(
    prompt: str,
    context_messages: list[str],
) -> str:
    """
    Resolve short references only from recent conversation messages.

    A detailed standalone prompt remains unchanged.
    """

    clean_prompt = " ".join(
        (prompt or "").split()
    ).strip()

    if (
        not clean_prompt
        or not IMAGE_CONTEXT_REFERENCE_PATTERN.search(
            clean_prompt
        )
    ):
        return clean_prompt

    safe_context: list[str] = []

    for raw_message in context_messages[-8:]:
        message = " ".join(
            str(raw_message or "").split()
        ).strip()

        if (
            not message
            or "[Generated image]" in message
            or "StudySnap is creating the image"
            in message
        ):
            continue

        safe_context.append(
            message[:600]
        )

    if not safe_context:
        return clean_prompt

    context_text = "\n".join(
        safe_context
    )

    return (
        "Use the recent conversation below only "
        "to resolve references in the current "
        "image request. The current request is "
        "authoritative. Ignore unrelated older "
        "subjects and never invent a different "
        "topic.\n\n"
        f"Recent conversation:\n{context_text}\n\n"
        f"Current image request:\n{clean_prompt}"
    )


@router.post("/generate-image")
def generate_image(
    data: GenerateImageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate one image for General AI or Room AI.

    The generated image is returned immediately and is also saved
    through StudySnap's secure attachment storage so it remains available
    when the conversation is reopened.
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

    resolved_image_prompt = (
        build_contextual_image_prompt(
            clean_prompt,
            data.context_messages or [],
        )
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

Resolved student request:
{resolved_image_prompt}
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

        if image_b64:
            try:
                image_bytes = base64.b64decode(
                    image_b64,
                    validate=True,
                )
            except Exception as error:
                raise RuntimeError(
                    "The generated image data was invalid."
                ) from error
        else:
            try:
                with urlopen(
                    str(image_url),
                    timeout=60.0,
                ) as image_response:
                    image_bytes = image_response.read(
                        25 * 1024 * 1024 + 1
                    )
            except Exception as error:
                raise RuntimeError(
                    "StudySnap could not retrieve the generated image."
                ) from error

        if not image_bytes:
            raise RuntimeError(
                "The generated image was empty."
            )

        if len(image_bytes) > 25 * 1024 * 1024:
            raise RuntimeError(
                "The generated image was too large to save."
            )

        saved_user_message = None
        saved_ai_message = None

        if conversation is not None:
            generated_filename = (
                "studysnap-generated-image.png"
            )

            stored_filename, stored_path = (
                store_ai_attachment(
                    data=image_bytes,
                    filename=generated_filename,
                    owner_id=current_user.id,
                    conversation_id=conversation.id,
                    content_type="image/png",
                )
            )

            saved_user_message = AIMessage(
                conversation_id=conversation.id,
                role="user",
                content=(
                    "Create an image: "
                    + clean_prompt
                ),
            )

            saved_ai_message = AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content="Image created",
                attachment_filename=(
                    generated_filename
                ),
                attachment_stored_filename=(
                    stored_filename
                ),
                attachment_file_path=stored_path,
                attachment_file_size=len(
                    image_bytes
                ),
                attachment_content_type=(
                    "image/png"
                ),
                attachment_kind="image",
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
                serialize_ai_message(
                    saved_user_message
                )
                if saved_user_message
                else None
            ),
            "assistant_message": (
                serialize_ai_message(
                    saved_ai_message
                )
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





_ACTIVE_IMAGE_EDIT_REQUESTS: set[
    tuple[int, int]
] = set()


def begin_image_edit_request(
    owner_id: int,
    conversation_id: int,
) -> bool:
    # Reserve one image edit per user conversation.
    key = (
        owner_id,
        conversation_id,
    )

    if key in _ACTIVE_IMAGE_EDIT_REQUESTS:
        return False

    _ACTIVE_IMAGE_EDIT_REQUESTS.add(
        key
    )

    return True


def finish_image_edit_request(
    owner_id: int,
    conversation_id: int,
) -> None:
    _ACTIVE_IMAGE_EDIT_REQUESTS.discard(
        (
            owner_id,
            conversation_id,
        )
    )


async def run_image_edit_in_worker(
    *,
    client,
    edit_arguments: dict,
    timeout_seconds: float = 180.0,
):
    # Keep blocking OpenAI image work outside FastAPI's event loop.
    return await asyncio.wait_for(
        asyncio.to_thread(
            client.images.edit,
            **edit_arguments,
        ),
        timeout=timeout_seconds,
    )


@router.post("/edit-image")
async def edit_ai_image(
    prompt: str = Form(...),
    image: UploadFile = File(...),
    identity_image: UploadFile | None = File(
        default=None
    ),
    conversation_id: int = Form(...),
    study_room_id: int | None = Form(
        default=None
    ),
    size: str = Form(
        default="1024x1024"
    ),
    quality: str = Form(
        default="high"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    """
    Edit an image while preserving the
    original person's recognizable identity.
    """

    import base64 as base64_module
    import io as io_module
    import tempfile
    import uuid as uuid_module
    from contextlib import ExitStack
    from pathlib import Path as LocalPath

    from PIL import Image as PILImage
    from app.services.openai_instrumentation import OpenAI

    from app.config import settings as app_settings

    clean_prompt = prompt.strip()

    if not clean_prompt:
        raise HTTPException(
            status_code=400,
            detail=(
                "Describe how you want "
                "the image changed."
            ),
        )

    allowed_sizes = {
        "1024x1024",
        "1536x1024",
        "1024x1536",
    }

    clean_size = (
        size
        if size in allowed_sizes
        else "1024x1024"
    )

    maximum_size = 25 * 1024 * 1024

    async def prepare_upload(
        upload: UploadFile,
        fallback_name: str,
    ) -> tuple[bytes, str]:
        original_bytes = await upload.read()
        await upload.close()

        if not original_bytes:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The uploaded image "
                    "is empty."
                ),
            )

        if len(original_bytes) > maximum_size:
            raise HTTPException(
                status_code=413,
                detail=(
                    "Images must be "
                    "25 MB or smaller."
                ),
            )

        source_name = LocalPath(
            upload.filename or
            fallback_name
        ).name[:180]

        try:
            with PILImage.open(
                io_module.BytesIO(
                    original_bytes
                )
            ) as opened:
                prepared = opened.convert(
                    "RGBA"
                )

                # Very large phone images create
                # unnecessary conversion and upload
                # delay. Preserve image detail while
                # limiting excessive dimensions.
                maximum_input_dimension = 2048

                if (
                    max(prepared.size)
                    > maximum_input_dimension
                ):
                    resampling = getattr(
                        PILImage,
                        "Resampling",
                        PILImage,
                    )

                    prepared.thumbnail(
                        (
                            maximum_input_dimension,
                            maximum_input_dimension,
                        ),
                        resampling.LANCZOS,
                    )

                output = io_module.BytesIO()

                # Fast encoding reduces local CPU work
                # before the AI image request begins.
                prepared.save(
                    output,
                    format="PNG",
                    compress_level=1,
                )

                return (
                    output.getvalue(),
                    (
                        LocalPath(
                            source_name
                        ).stem
                        + ".png"
                    ),
                )

        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    "StudySnap could not "
                    "prepare this image. "
                    "Try PNG or JPG."
                ),
            ) from exc

    working_bytes, working_name = (
        await prepare_upload(
            image,
            "working-image.png",
        )
    )

    identity_bytes: bytes | None = None
    identity_name: str | None = None

    if identity_image is not None:
        (
            identity_bytes,
            identity_name,
        ) = await prepare_upload(
            identity_image,
            "identity-reference.png",
        )

    conversation = verify_conversation(
        db,
        conversation_id,
        current_user.id,
    )

    if (
        study_room_id is not None
        and conversation.study_room_id
        not in {
            None,
            study_room_id,
        }
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "The selected conversation "
                "belongs to another room."
            ),
        )

    if not app_settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Image generation is "
                "not configured."
            ),
        )

    configured_model = getattr(
        app_settings,
        "openai_image_model",
        None,
    )

    model_candidates: list[str] = [
        "gpt-image-2",
    ]

    if (
        isinstance(
            configured_model,
            str,
        )
        and configured_model.startswith(
            "gpt-image"
        )
        and configured_model
        not in model_candidates
    ):
        model_candidates.append(
            configured_model
        )

    if "gpt-image-1" not in model_candidates:
        model_candidates.append(
            "gpt-image-1"
        )

    identity_instruction = (
        "IDENTITY PRESERVATION IS THE "
        "HIGHEST PRIORITY. Preserve the "
        "exact recognizable identity of "
        "the person in Image 1, including "
        "facial proportions, eye shape and "
        "spacing, eyebrows, nose, mouth, "
        "jawline, skin tone, hairline, "
        "facial hair, age, and natural "
        "expression. Do not beautify, "
        "replace, reinterpret, or create "
        "a different face. Apply only the "
        "changes requested by the user. "
    )

    if identity_bytes is not None:
        edit_prompt = (
            identity_instruction
            + "Image 1 is the original "
            + "identity reference. Image 2 "
            + "is the current edited image. "
            + "Keep the identity from Image 1 "
            + "while modifying Image 2. "
            + "User request: "
            + clean_prompt
        )
    else:
        edit_prompt = (
            identity_instruction
            + "The uploaded image is both "
            + "the identity reference and "
            + "the image to edit. "
            + "User request: "
            + clean_prompt
        )

    client = OpenAI(
        api_key=app_settings.openai_api_key,
        timeout=180.0,
    )

    response = None
    used_model = None
    last_model_error: Exception | None = None

    retryable_model_markers = (
        "model_not_found",
        "does not exist",
        "not found",
        "do not have access",
        "unsupported model",
        "not supported",
    )

    for candidate_model in model_candidates:
        try:
            with ExitStack() as stack:
                input_files = []

                if identity_bytes is not None:
                    identity_temp = (
                        stack.enter_context(
                            tempfile.NamedTemporaryFile(
                                suffix=".png"
                            )
                        )
                    )

                    identity_temp.write(
                        identity_bytes
                    )

                    identity_temp.flush()

                    input_files.append(
                        stack.enter_context(
                            open(
                                identity_temp.name,
                                "rb",
                            )
                        )
                    )

                working_temp = stack.enter_context(
                    tempfile.NamedTemporaryFile(
                        suffix=".png"
                    )
                )

                working_temp.write(
                    working_bytes
                )

                working_temp.flush()

                input_files.append(
                    stack.enter_context(
                        open(
                            working_temp.name,
                            "rb",
                        )
                    )
                )

                image_input = (
                    input_files
                    if len(input_files) > 1
                    else input_files[0]
                )

                edit_arguments = {
                    "model": candidate_model,
                    "image": image_input,
                    "prompt": edit_prompt,
                    "size": clean_size,
                    "quality": "high",
                }

                # GPT Image 2 always processes
                # image inputs at high fidelity.
                # GPT Image 1 requires the flag.
                if (
                    candidate_model
                    == "gpt-image-1"
                ):
                    edit_arguments[
                        "input_fidelity"
                    ] = "high"

                if not begin_image_edit_request(
                    current_user.id,
                    conversation.id,
                ):
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "An image is already being "
                            "processed in this conversation. "
                            "StudySnap will keep the current "
                            "request instead of creating "
                            "a duplicate."
                        ),
                    )

                try:
                    response = (
                        await run_image_edit_in_worker(
                            client=client,
                            edit_arguments=(
                                edit_arguments
                            ),
                        )
                    )
                except asyncio.TimeoutError as exc:
                    raise HTTPException(
                        status_code=504,
                        detail=(
                            "The image edit took too long. "
                            "StudySnap stopped waiting so "
                            "the rest of the app can remain "
                            "responsive. Please retry once."
                        ),
                    ) from exc
                finally:
                    finish_image_edit_request(
                        current_user.id,
                        conversation.id,
                    )

                used_model = candidate_model

                break

        except Exception as exc:
            last_model_error = exc

            error_text = str(
                exc
            ).lower()

            may_try_next_model = any(
                marker in error_text
                for marker
                in retryable_model_markers
            )

            if (
                may_try_next_model
                and candidate_model
                != model_candidates[-1]
            ):
                continue

            raise

    if response is None or used_model is None:
        raise RuntimeError(
            "No supported image model "
            "completed the edit."
        ) from last_model_error

    if not response.data:
        raise RuntimeError(
            "The image model returned "
            "no image."
        )

    result_item = response.data[0]

    generated_base64 = getattr(
        result_item,
        "b64_json",
        None,
    )

    if not generated_base64:
        raise RuntimeError(
            "The image model returned "
            "no image data."
        )

    generated_bytes = (
        base64_module.b64decode(
            generated_base64
        )
    )

    if not generated_bytes:
        raise RuntimeError(
            "The generated image was empty."
        )

    persisted_reference_bytes = (
        identity_bytes
        if identity_bytes is not None
        else working_bytes
    )

    persisted_reference_name = (
        identity_name
        if identity_name is not None
        else working_name
    )

    (
        reference_stored_filename,
        reference_path,
    ) = store_ai_attachment(
        data=persisted_reference_bytes,
        filename=persisted_reference_name,
        owner_id=current_user.id,
        conversation_id=conversation.id,
        content_type="image/png",
    )

    generated_filename = (
        "studysnap-recreated-"
        + uuid_module.uuid4().hex[:12]
        + ".png"
    )

    (
        generated_stored_filename,
        generated_path,
    ) = store_ai_attachment(
        data=generated_bytes,
        filename=generated_filename,
        owner_id=current_user.id,
        conversation_id=conversation.id,
        content_type="image/png",
    )

    user_message = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=(
            "[Edit image] "
            + clean_prompt
        ),
        attachment_filename=(
            persisted_reference_name
        ),
        attachment_stored_filename=(
            reference_stored_filename
        ),
        attachment_file_path=(
            reference_path
        ),
        attachment_file_size=len(
            persisted_reference_bytes
        ),
        attachment_content_type=(
            "image/png"
        ),
        attachment_kind="image",
    )

    assistant_message = AIMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=(
            "[Generated image] "
            + clean_prompt
        ),
        attachment_filename=(
            generated_filename
        ),
        attachment_stored_filename=(
            generated_stored_filename
        ),
        attachment_file_path=(
            generated_path
        ),
        attachment_file_size=len(
            generated_bytes
        ),
        attachment_content_type=(
            "image/png"
        ),
        attachment_kind="image",
    )

    try:
        db.add(user_message)
        db.add(assistant_message)

        if (
            conversation.title
            == "New Conversation"
        ):
            conversation.title = (
                clean_prompt[:50]
                or "Edited image"
            )

        conversation.updated_at = utc_now()

        db.commit()

        db.refresh(user_message)
        db.refresh(assistant_message)
        db.refresh(conversation)

    except Exception:
        db.rollback()
        raise

    return {
        "image_data_url": (
            "data:image/png;base64,"
            + generated_base64
        ),
        "image_url": None,
        "mime_type": "image/png",
        "model": used_model,
        "prompt": clean_prompt,
        "revised_prompt": getattr(
            result_item,
            "revised_prompt",
            None,
        ),
        "identity_reference_used": (
            identity_bytes is not None
        ),
        "conversation": (
            serialize_conversation(
                conversation
            )
        ),
        "user_message": (
            serialize_ai_message(
                user_message
            )
        ),
        "assistant_message": (
            serialize_ai_message(
                assistant_message
            )
        ),
    }


@router.post("/ask-files")
async def ask_ai_with_files(
    question: str = Form(
        default="Explain these files clearly."
    ),
    study_room_id: int | None = Form(default=None),
    conversation_id: int | None = Form(default=None),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not files:
        raise HTTPException(
            status_code=400,
            detail="Choose at least one file.",
        )

    if len(files) > 10:
        raise HTTPException(
            status_code=400,
            detail="You can upload up to 10 files together.",
        )

    clean_question = (
        question.strip()
        or "Explain these files clearly."
    )

    conversation = None
    study_room_context = ""

    if conversation_id is not None:
        conversation = verify_conversation(
            db,
            conversation_id,
            current_user.id,
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

    prepared_attachments: list[dict] = []
    image_inputs: list[dict] = []
    document_sections: list[str] = []

    total_bytes = 0
    maximum_total_bytes = 60 * 1024 * 1024

    try:
        for position, uploaded in enumerate(
            files,
            start=1,
        ):
            filename = _clean_direct_filename(
                uploaded.filename
            )

            content_type = (
                uploaded.content_type
                or "application/octet-stream"
            ).lower()

            data = await uploaded.read()
            await uploaded.close()

            if not data:
                raise HTTPException(
                    status_code=400,
                    detail=f"{filename} is empty.",
                )

            total_bytes += len(data)

            if total_bytes > maximum_total_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        "The combined upload is too large. "
                        "Choose files totalling 60MB or less."
                    ),
                )

            extension = Path(filename).suffix.lower()

            is_heic = (
                extension in {".heic", ".heif"}
                or content_type
                in {
                    "image/heic",
                    "image/heif",
                    "image/heic-sequence",
                    "image/heif-sequence",
                }
            )

            is_image = (
                content_type.startswith("image/")
                or is_heic
            )

            if is_image:
                source_limit = (
                    25 * 1024 * 1024
                    if is_heic
                    else 8 * 1024 * 1024
                )

                if len(data) > source_limit:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"{filename} is too large."
                        ),
                    )

                if is_heic:
                    try:
                        with Image.open(
                            io.BytesIO(data)
                        ) as source_image:
                            converted = (
                                source_image.convert("RGB")
                            )

                            output = io.BytesIO()

                            converted.save(
                                output,
                                format="JPEG",
                                quality=88,
                                optimize=True,
                            )

                            data = output.getvalue()
                            content_type = "image/jpeg"

                            filename = (
                                Path(filename).stem
                                + ".jpg"
                            )
                    except Exception as exc:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"StudySnap could not convert "
                                f"{filename}. Try JPG or PNG."
                            ),
                        ) from exc

                if len(data) > 8 * 1024 * 1024:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"{filename} is larger than "
                            "8MB after preparation."
                        ),
                    )

                encoded = base64.b64encode(
                    data
                ).decode("utf-8")

                image_inputs.append(
                    {
                        "type": "input_image",
                        "image_url": (
                            f"data:{content_type};base64,"
                            f"{encoded}"
                        ),
                        "detail": "auto",
                    }
                )

                prepared_attachments.append(
                    {
                        "filename": filename,
                        "content_type": content_type,
                        "data": data,
                        "kind": "image",
                    }
                )

                continue

            if len(data) > DIRECT_FILE_MAX_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"{filename} is too large. "
                        f"Files must be {DIRECT_FILE_MAX_MB}MB "
                        "or smaller."
                    ),
                )

            extracted_text, file_kind = (
                _extract_direct_file_text(
                    filename=filename,
                    content_type=content_type,
                    data=data,
                )
            )

            document_sections.append(
                "\n".join(
                    [
                        (
                            f"FILE {position}: "
                            f"{filename} ({file_kind})"
                        ),
                        "--- BEGIN FILE ---",
                        extracted_text,
                        "--- END FILE ---",
                    ]
                )
            )

            prepared_attachments.append(
                {
                    "filename": filename,
                    "content_type": content_type,
                    "data": data,
                    "kind": "file",
                }
            )

        attachment_names = ", ".join(
            item["filename"]
            for item in prepared_attachments
        )

        prompt = f"""
You are StudySnap AI.

{get_intent_understanding_instructions()}

The student uploaded {len(prepared_attachments)} files:
{attachment_names}

Student question:
{clean_question}

Read and compare all attached material together.

Give one useful, natural answer.
Connect information across files when relevant.
Clearly identify differences or contradictions between files.
Use short headings or sections only when they improve readability.
Do not invent information that is not visible in the attachments.
If any attachment is unclear or incomplete, say so briefly.

Relevant room or conversation context:
{study_room_context or "No additional context provided."}

Extracted document content:
{chr(10).join(document_sections) or "The attachments are images."}
"""

        client = OpenAI(
            api_key=settings.openai_api_key,
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
                            *image_inputs,
                        ],
                    }
                ],
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

            response = client.responses.create(
                model=model,
                input=prompt,
            )

        answer = (
            getattr(response, "output_text", "")
            or (
                "StudySnap could not produce an "
                "answer from these files."
            )
        )

        saved_attachments: list[AIMessage] = []
        saved_ai_message = None

        if conversation is not None:
            for index, item in enumerate(
                prepared_attachments
            ):
                stored_filename, stored_path = (
                    store_ai_attachment(
                        data=item["data"],
                        filename=item["filename"],
                        owner_id=current_user.id,
                        conversation_id=conversation.id,
                        content_type=item[
                            "content_type"
                        ],
                    )
                )

                content = (
                    clean_question
                    if index == 0
                    else (
                        f"Attached: "
                        f"{item['filename']}"
                    )
                )

                message = AIMessage(
                    conversation_id=conversation.id,
                    role="user",
                    content=content,
                    attachment_filename=(
                        item["filename"]
                    ),
                    attachment_stored_filename=(
                        stored_filename
                    ),
                    attachment_file_path=stored_path,
                    attachment_file_size=len(
                        item["data"]
                    ),
                    attachment_content_type=(
                        item["content_type"]
                    ),
                    attachment_kind=item["kind"],
                )

                db.add(message)
                saved_attachments.append(message)

            saved_ai_message = AIMessage(
                conversation_id=conversation.id,
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
                    or "File question"
                )

            conversation.updated_at = utc_now()

            db.commit()

            for message in saved_attachments:
                db.refresh(message)

            db.refresh(saved_ai_message)
            db.refresh(conversation)

        return {
            "answer": answer,
            "count": len(prepared_attachments),
            "attachments": [
                serialize_ai_message(message)
                for message in saved_attachments
            ],
            "assistant_message": (
                serialize_ai_message(
                    saved_ai_message
                )
                if saved_ai_message
                else None
            ),
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Multi-file AI failed: "
                + str(exc)
            ),
        ) from exc


@router.post("/ask-file")
async def ask_ai_with_file(
    question: str = Form(default="Summarize this file clearly."),
    study_room_id: int | None = Form(default=None),
    conversation_id: int | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filename = _clean_direct_filename(file.filename)
    content_type = file.content_type or "application/octet-stream"

    file_bytes = await file.read()
    await file.close()

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    if len(file_bytes) > DIRECT_FILE_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File is too large. Direct AI reading supports "
                f"files up to {DIRECT_FILE_MAX_MB}MB."
            ),
        )

    extracted_text, file_kind = _extract_direct_file_text(
        filename=filename,
        content_type=content_type,
        data=file_bytes,
    )

    clean_question = (
        question.strip()
        or "Summarize this file clearly."
    )

    conversation = None
    study_room_context = ""

    if conversation_id is not None:
        conversation = verify_conversation(
            db,
            conversation_id,
            current_user.id,
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

The user uploaded a {file_kind} named:
{filename}

User question:
{clean_question}

Read the extracted file content carefully.
Answer in clear, student-friendly language.
Use headings or short sections when they improve readability.
Do not claim the file contains information that is not present.
If the extracted content appears incomplete, explain that briefly.
When room or conversation context is available, connect it only when relevant.

Relevant room or conversation context:
{study_room_context or "No additional context provided."}

Extracted file content:
--- BEGIN FILE ---
{extracted_text}
--- END FILE ---
"""

    try:
        client = OpenAI(
            api_key=settings.openai_api_key,
            timeout=45.0,
        )

        model = (
            getattr(settings, "openai_model", None)
            or os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
        )

        response = client.responses.create(
            model=model,
            input=prompt,
        )

        answer = (
            getattr(response, "output_text", "")
            or "StudySnap could not produce an answer from this file."
        )

        saved_user_message = None
        saved_ai_message = None

        if conversation is not None:
            stored_filename, stored_path = (
                store_ai_attachment(
                    data=file_bytes,
                    filename=filename,
                    owner_id=current_user.id,
                    conversation_id=conversation.id,
                    content_type=content_type,
                )
            )

            saved_user_message = AIMessage(
                conversation_id=conversation.id,
                role="user",
                content=(
                    f"[File: {filename}]\n"
                    f"{clean_question}"
                ),
                attachment_filename=filename,
                attachment_stored_filename=stored_filename,
                attachment_file_path=stored_path,
                attachment_file_size=len(file_bytes),
                attachment_content_type=content_type,
                attachment_kind="file",
            )

            saved_ai_message = AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=answer,
            )

            db.add(saved_user_message)
            db.add(saved_ai_message)

            if conversation.title == "New Conversation":
                conversation.title = (
                    clean_question[:50]
                    or filename[:50]
                    or "File question"
                )

            conversation.updated_at = utc_now()

            db.commit()
            db.refresh(saved_user_message)
            db.refresh(saved_ai_message)
            db.refresh(conversation)

        return {
            "answer": answer,
            "filename": filename,
            "file_kind": file_kind,
            "user_message": (
                {
                    "id": saved_user_message.id,
                    "conversation_id": saved_user_message.conversation_id,
                    "role": saved_user_message.role,
                    "content": saved_user_message.content,
                    "created_at": saved_user_message.created_at,
                }
                if saved_user_message
                else None
            ),
            "assistant_message": (
                {
                    "id": saved_ai_message.id,
                    "conversation_id": saved_ai_message.conversation_id,
                    "role": saved_ai_message.role,
                    "content": saved_ai_message.content,
                    "created_at": saved_ai_message.created_at,
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
            status_code=500,
            detail=f"File AI failed: {str(exc)}",
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

    content_type = (
        image.content_type or ""
    ).lower()

    filename = (
        image.filename or ""
    ).lower()

    extension = os.path.splitext(
        filename
    )[1]

    is_heic = (
        extension in {".heic", ".heif"}
        or content_type
        in {
            "image/heic",
            "image/heif",
            "image/heic-sequence",
            "image/heif-sequence",
        }
    )

    is_supported_image = (
        content_type.startswith("image/")
        or is_heic
    )

    if not is_supported_image:
        raise HTTPException(
            status_code=400,
            detail="Please upload an image file.",
        )

    image_bytes = await image.read()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty.",
        )

    source_max_size = (
        25 * 1024 * 1024
        if is_heic
        else 8 * 1024 * 1024
    )

    if len(image_bytes) > source_max_size:
        raise HTTPException(
            status_code=400,
            detail=(
                "HEIC image must be 25MB or smaller."
                if is_heic
                else "Image must be 8MB or smaller."
            ),
        )

    if is_heic:
        try:
            with Image.open(
                io.BytesIO(image_bytes)
            ) as source_image:
                converted_image = (
                    source_image.convert("RGB")
                )

                output = io.BytesIO()

                converted_image.save(
                    output,
                    format="JPEG",
                    quality=88,
                    optimize=True,
                )

                image_bytes = output.getvalue()
                content_type = "image/jpeg"
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    "StudySnap could not convert "
                    "this HEIC image. Try another "
                    "image or export it as JPG."
                ),
            ) from exc

    if len(image_bytes) > 8 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=(
                "The prepared image is larger "
                "than 8MB. Please choose a "
                "smaller image."
            ),
        )

    encoded_image = base64.b64encode(
        image_bytes
    ).decode("utf-8")

    image_url = (
        f"data:{content_type};base64,"
        f"{encoded_image}"
    )

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
            image_filename = (
                _clean_direct_filename(image.filename)
                if image.filename
                else "uploaded-image"
            )

            image_suffix = (
                ".jpg"
                if content_type == "image/jpeg"
                and Path(image_filename).suffix.lower()
                in {".heic", ".heif"}
                else ""
            )

            if image_suffix:
                image_filename = (
                    Path(image_filename).stem
                    + image_suffix
                )

            stored_filename, stored_path = (
                store_ai_attachment(
                    data=image_bytes,
                    filename=image_filename,
                    owner_id=current_user.id,
                    conversation_id=conversation.id,
                    content_type=content_type,
                )
            )

            saved_user_message = AIMessage(
                conversation_id=conversation.id,
                role="user",
                content=f"[Image uploaded] {clean_question}",
                attachment_filename=image_filename,
                attachment_stored_filename=stored_filename,
                attachment_file_path=stored_path,
                attachment_file_size=len(image_bytes),
                attachment_content_type=content_type,
                attachment_kind="image",
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
    conversation = verify_conversation(
        db,
        conversation_id,
        current_user.id,
    )

    from app.services.ai_conversation_deletion import (
        delete_ai_conversation_graph,
    )

    try:
        result = delete_ai_conversation_graph(
            db=db,
            conversation_id=conversation.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": (
            "Conversation deleted successfully"
        ),
        "deleted_counts": (
            result.deleted_counts
        ),
        "detached_counts": (
            result.detached_counts
        ),
    }

@router.post("/messages")
def create_message(
    data: CreateMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(db, data.conversation_id, current_user.id)

    requested_export_format = (
        resolve_artifact_export_request(
            data.content
        )
    )

    if (
        requested_export_format is None
        and is_artifact_followup_request(
            data.content
        )
    ):
        recent_user_artifact_requests = [
            item.content
            for item in (
                db.query(AIMessage)
                .filter(
                    AIMessage.conversation_id
                    == conversation.id,
                    AIMessage.role == "user",
                )
                .order_by(
                    AIMessage.id.desc()
                )
                .limit(12)
                .all()
            )
        ]

        requested_export_format = (
            resolve_artifact_export_request(
                data.content,
                recent_user_artifact_requests,
            )
        )

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

    if requested_export_format is not None:
        prompt = (
            prompt
            + "\n\n"
            + build_artifact_generation_instructions(
                requested_export_format,
                data.content,
            )
        )

    user_message = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=data.content,
    )

    db.add(user_message)
    db.commit()
    db.refresh(user_message)

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
        if needs_clarification
        and ":" in raw_answer
        else raw_answer
    )

    ai_message = AIMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=answer,
    )

    db.add(ai_message)

    if (
        requested_export_format
        is not None
        and not needs_clarification
        and artifact_content_is_final(
            answer
        )
    ):
        db.flush()

        create_text_artifact(
            db=db,
            owner_id=current_user.id,
            title=suggest_artifact_title(
                data.content,
                answer,
            ),
            content=answer,
            artifact_format=(
                requested_export_format
            ),
            conversation_id=(
                conversation.id
            ),
            message_id=ai_message.id,
        )
    else:
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


@router.post("/messages/cancel")
def cancel_message_generation(
    data: CancelMessageRequest,
    current_user: User = Depends(
        get_current_user
    ),
):
    request_id = clean_ai_request_id(
        data.request_id
    )

    cancelled = cancel_ai_stream(
        current_user.id,
        request_id,
    )

    return {
        "request_id": request_id,
        "cancelled": cancelled,
    }


@router.post("/messages/stream")
def create_message_stream(
    data: CreateMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = verify_conversation(db, data.conversation_id, current_user.id)

    requested_export_format = (
        resolve_artifact_export_request(
            data.content
        )
    )

    if (
        requested_export_format is None
        and is_artifact_followup_request(
            data.content
        )
    ):
        recent_user_artifact_requests = [
            item.content
            for item in (
                db.query(AIMessage)
                .filter(
                    AIMessage.conversation_id
                    == conversation.id,
                    AIMessage.role == "user",
                )
                .order_by(
                    AIMessage.id.desc()
                )
                .limit(12)
                .all()
            )
        ]

        requested_export_format = (
            resolve_artifact_export_request(
                data.content,
                recent_user_artifact_requests,
            )
        )

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

    if requested_export_format is not None:
        prompt = (
            prompt
            + "\n\n"
            + build_artifact_generation_instructions(
                requested_export_format,
                data.content,
            )
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

    request_id = clean_ai_request_id(
        data.request_id
    )

    cancel_event = register_ai_stream(
        current_user.id,
        request_id,
    )

    def event_stream():
        full_answer = ""
        stream_iterator = None

        try:
            stream_iterator = (
                stream_studysnap_answer(
                    prompt
                )
            )

            for token in stream_iterator:
                if cancel_event.is_set():
                    break

                full_answer += token

                yield (
                    "data: "
                    + json.dumps(token)
                    + "\n\n"
                )

            cancelled = (
                cancel_event.is_set()
            )

            if (
                cancelled
                and full_answer.strip()
            ):
                partial_message = AIMessage(
                    conversation_id=conversation.id,
                    role="assistant",
                    content=full_answer,
                )

                db.add(partial_message)
                db.commit()

            if cancelled:
                return

            raw_final_content = (
                full_answer.strip()
                or "No answer was returned."
            )

            needs_clarification = (
                raw_final_content.lower().startswith(
                    "needs_clarification:"
                )
            )

            final_content = (
                raw_final_content.split(
                    ":",
                    1,
                )[1].strip()
                if needs_clarification
                and ":" in raw_final_content
                else raw_final_content
            )

            ai_message = AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=final_content,
            )

            db.add(ai_message)

            if (
                requested_export_format
                is not None
                and not needs_clarification
                and artifact_content_is_final(
                    final_content
                )
            ):
                db.flush()

                create_text_artifact(
                    db=db,
                    owner_id=current_user.id,
                    title=suggest_artifact_title(
                        data.content,
                        final_content,
                    ),
                    content=final_content,
                    artifact_format=(
                        requested_export_format
                    ),
                    conversation_id=(
                        conversation.id
                    ),
                    message_id=ai_message.id,
                )
            else:
                db.commit()

            db.refresh(ai_message)

            yield "data: [DONE]\n\n"

        except GeneratorExit:
            cancel_event.set()

        except Exception as exc:
            db.rollback()

            if not cancel_event.is_set():
                error_message = (
                    "Sorry, streaming failed: "
                    + str(exc)
                )

                yield (
                    "data: "
                    + json.dumps(
                        error_message
                    )
                    + "\n\n"
                )

        finally:
            if stream_iterator is not None:
                close_stream = getattr(
                    stream_iterator,
                    "close",
                    None,
                )

                if callable(close_stream):
                    try:
                        close_stream()
                    except Exception:
                        pass

            remove_ai_stream(
                current_user.id,
                request_id,
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
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
        serialize_ai_message(message)
        for message in messages
    ]



@router.get("/attachments/{message_id}")
def get_ai_attachment(
    message_id: int,
    download: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (
        db.query(AIMessage)
        .filter(AIMessage.id == message_id)
        .first()
    )

    if message is None:
        raise HTTPException(
            status_code=404,
            detail="Attachment not found.",
        )

    verify_conversation(
        db,
        message.conversation_id,
        current_user.id,
    )

    if not message.attachment_file_path:
        raise HTTPException(
            status_code=404,
            detail="This message has no attachment.",
        )

    file_path = resolve_message_attachment_path(
        db=db,
        message=message,
        owner_id=current_user.id,
    )

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Stored attachment was not found.",
        )

    return FileResponse(
        path=file_path,
        filename=(
            message.attachment_filename
            or file_path.name
        ),
        media_type=(
            message.attachment_content_type
            or "application/octet-stream"
        ),
        content_disposition_type=(
            "attachment"
            if download
            else "inline"
        ),
    )


@router.patch("/attachments/{message_id}/feed")
def update_ai_attachment_feed_visibility(
    message_id: int,
    hidden: bool = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (
        db.query(AIMessage)
        .filter(AIMessage.id == message_id)
        .first()
    )

    if message is None:
        raise HTTPException(
            status_code=404,
            detail="Attachment not found.",
        )

    verify_conversation(
        db,
        message.conversation_id,
        current_user.id,
    )

    if not message.attachment_file_path:
        raise HTTPException(
            status_code=404,
            detail="This message has no attachment.",
        )

    message.attachment_hidden_from_feed = hidden

    if hidden:
        message.attachment_is_pinned = False

    db.commit()
    db.refresh(message)

    return {
        "id": message.id,
        "hidden_from_feed": bool(
            message.attachment_hidden_from_feed
        ),
    }




@router.patch("/attachments/{message_id}/pin")
def update_ai_attachment_pin(
    message_id: int,
    pinned: bool = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    message = (
        db.query(AIMessage)
        .filter(
            AIMessage.id == message_id
        )
        .first()
    )

    if message is None:
        raise HTTPException(
            status_code=404,
            detail="Attachment not found.",
        )

    verify_conversation(
        db,
        message.conversation_id,
        current_user.id,
    )

    if not message.attachment_file_path:
        raise HTTPException(
            status_code=404,
            detail=(
                "This message has no attachment."
            ),
        )

    if (
        pinned
        and not message.attachment_is_pinned
    ):
        pinned_count = (
            db.query(AIMessage)
            .join(
                AIConversation,
                AIConversation.id
                == AIMessage.conversation_id,
            )
            .filter(
                AIConversation.owner_id
                == current_user.id,
                AIMessage.attachment_file_path.isnot(
                    None
                ),
                AIMessage.attachment_is_pinned.is_(
                    True
                ),
                AIMessage.id != message.id,
            )
            .count()
        )

        if pinned_count >= 10:
            raise HTTPException(
                status_code=400,
                detail=(
                    "You can pin up to "
                    "10 dashboard files."
                ),
            )

    message.attachment_is_pinned = pinned

    if pinned:
        message.attachment_hidden_from_feed = False

    db.commit()
    db.refresh(message)

    return {
        "id": message.id,
        "is_pinned": bool(
            message.attachment_is_pinned
        ),
    }


@router.delete("/attachments/{message_id}")
def delete_ai_attachment(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    message = (
        db.query(AIMessage)
        .filter(
            AIMessage.id == message_id
        )
        .first()
    )

    if message is None:
        raise HTTPException(
            status_code=404,
            detail="Attachment not found.",
        )

    verify_conversation(
        db,
        message.conversation_id,
        current_user.id,
    )

    if not message.attachment_file_path:
        raise HTTPException(
            status_code=404,
            detail=(
                "This message has no attachment."
            ),
        )

    file_path: Path | None = None
    quarantine_path: Path | None = None

    # Logical File Brain references do not own the underlying file.
    # Deleting the chat attachment must only clear its metadata.
    if message.attachment_source_type is None:
        file_path = resolve_ai_attachment_path(
            message.attachment_file_path
        )

    if (
        file_path is not None
        and file_path.exists()
    ):
        if not file_path.is_file():
            raise HTTPException(
                status_code=400,
                detail=(
                    "The attachment path does "
                    "not reference a file."
                ),
            )

        quarantine_path = file_path.with_name(
            file_path.name
            + ".deleting-"
            + uuid.uuid4().hex
        )

        try:
            file_path.replace(
                quarantine_path
            )
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "The stored file could "
                    "not be prepared for removal."
                ),
            ) from exc

    message.attachment_filename = None
    message.attachment_stored_filename = None
    message.attachment_file_path = None
    message.attachment_file_size = None
    message.attachment_content_type = None
    message.attachment_kind = None
    message.attachment_source_type = None
    message.attachment_source_id = None
    message.attachment_hidden_from_feed = False
    message.attachment_is_pinned = False

    try:
        db.commit()
        db.refresh(message)
    except Exception:
        db.rollback()

        if (
            quarantine_path is not None
            and file_path is not None
            and quarantine_path.exists()
        ):
            try:
                quarantine_path.replace(
                    file_path
                )
            except OSError:
                pass

        raise

    if quarantine_path is not None:
        try:
            quarantine_path.unlink(
                missing_ok=True
            )
        except OSError:
            pass

    return {
        "id": message.id,
        "conversation_id": (
            message.conversation_id
        ),
        "deleted": True,
        "message": (
            "Attachment deleted. "
            "The chat remains available."
        ),
    }


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