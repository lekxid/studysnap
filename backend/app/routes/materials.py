import hashlib
import json
import logging
import math
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.storage import storage_path
from app.models.study_material import StudyMaterial
from app.models.user import User
from app.services.material_intelligence import analyze_material
from app.services.rooms.access import (
    require_room_contributor,
    require_room_item_change,
    require_room_view,
)
from app.routes.pdf_documents import extract_pdf_text
from app.utils.deps import get_current_user


router = APIRouter(tags=["Universal Materials"])

logger = logging.getLogger(__name__)

UPLOAD_ROOT = storage_path("materials")
QUARANTINE_ROOT = storage_path("quarantine")
TEMP_ROOT = storage_path("tmp")

CHUNK_SIZE = 1024 * 1024
TEXT_CAPTURE_LIMIT = 2 * 1024 * 1024

MAX_UPLOAD_MB = max(
    1,
    min(
        int(os.getenv("STUDYSNAP_MAX_UPLOAD_MB", "100")),
        500,
    ),
)
MAX_FILE_SIZE = MAX_UPLOAD_MB * 1024 * 1024

RESUMABLE_UPLOAD_ROOT = TEMP_ROOT / "resumable"
RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024
RESUMABLE_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
RESUMABLE_MAX_CHUNKS = math.ceil(
    RESUMABLE_MAX_FILE_BYTES / RESUMABLE_CHUNK_SIZE
)


class StartResumableUploadRequest(BaseModel):
    study_room_id: int
    filename: str
    file_size: int = Field(gt=0)
    content_type: str = "application/octet-stream"


def resumable_session_directory(
    user_id: int,
    upload_id: str,
) -> Path:
    if not re.fullmatch(
        r"[0-9a-f]{32}",
        upload_id,
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid upload session.",
        )

    return (
        RESUMABLE_UPLOAD_ROOT
        / str(user_id)
        / upload_id
    )


def resumable_metadata_path(
    user_id: int,
    upload_id: str,
) -> Path:
    return (
        resumable_session_directory(
            user_id,
            upload_id,
        )
        / "metadata.json"
    )


def read_resumable_metadata(
    user_id: int,
    upload_id: str,
) -> dict:
    metadata_path = resumable_metadata_path(
        user_id,
        upload_id,
    )

    if not metadata_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Upload session not found.",
        )

    try:
        value = json.loads(
            metadata_path.read_text(
                encoding="utf-8"
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Upload session is damaged.",
        ) from exc

    if not isinstance(value, dict):
        raise HTTPException(
            status_code=500,
            detail="Upload session is damaged.",
        )

    return value


def write_resumable_metadata(
    directory: Path,
    metadata: dict,
) -> None:
    temporary_path = (
        directory / "metadata.json.tmp"
    )
    final_path = directory / "metadata.json"

    temporary_path.write_text(
        json.dumps(
            metadata,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    os.replace(
        temporary_path,
        final_path,
    )


CODE_EXTENSIONS = {
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
    ".R",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".bat",
    ".cmd",
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
    ".env",
    ".properties",
    ".gradle",
    ".dockerfile",
}

TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".tsv",
    ".json",
    ".jsonl",
    ".log",
    ".rtf",
}

IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".svg",
    ".heic",
    ".avif",
}

AUDIO_EXTENSIONS = {
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".ogg",
    ".oga",
    ".flac",
    ".wma",
    ".opus",
}

VIDEO_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".mkv",
    ".avi",
    ".webm",
    ".wmv",
    ".m4v",
    ".mpeg",
    ".mpg",
    ".3gp",
}

OFFICE_EXTENSIONS = {
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".xlsm",
    ".ods",
    ".odp",
    ".odt",
}

ARCHIVE_EXTENSIONS = {
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

EXECUTABLE_EXTENSIONS = {
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


def clean_original_filename(value: str | None) -> str:
    raw = Path(value or "uploaded-file").name
    raw = raw.replace("\x00", "")
    raw = re.sub(r"[\r\n\t]+", " ", raw).strip()
    raw = re.sub(
        r"[^\w.\- ()\[\]{}@+#,]+",
        "_",
        raw,
        flags=re.UNICODE,
    )

    raw = raw[:180].strip(" .")

    return raw or "uploaded-file"


def safe_suffix(filename: str) -> str:
    suffix = Path(filename).suffix.lower()

    if (
        not suffix
        or len(suffix) > 20
        or not re.fullmatch(r"\.[a-z0-9]+", suffix)
    ):
        return ""

    return suffix


def looks_executable(header: bytes) -> bool:
    if header.startswith(b"MZ"):
        return True

    if header.startswith(b"\x7fELF"):
        return True

    mach_o_headers = {
        b"\xfe\xed\xfa\xce",
        b"\xfe\xed\xfa\xcf",
        b"\xce\xfa\xed\xfe",
        b"\xcf\xfa\xed\xfe",
        b"\xca\xfe\xba\xbe",
    }

    return header[:4] in mach_o_headers


def classify_material(
    filename: str,
    content_type: str,
    header: bytes,
) -> str:
    suffix = Path(filename).suffix.lower()
    mime = (content_type or "").lower()

    if suffix in EXECUTABLE_EXTENSIONS or looks_executable(header):
        return "quarantined"

    if suffix == ".pdf" or mime == "application/pdf":
        return "pdf"

    if suffix in CODE_EXTENSIONS:
        return "code"

    if suffix in TEXT_EXTENSIONS or mime.startswith("text/"):
        return "text"

    if suffix in IMAGE_EXTENSIONS or mime.startswith("image/"):
        return "image"

    if suffix in AUDIO_EXTENSIONS or mime.startswith("audio/"):
        return "audio"

    if suffix in VIDEO_EXTENSIONS or mime.startswith("video/"):
        return "video"

    if suffix in OFFICE_EXTENSIONS:
        return "office"

    if suffix in ARCHIVE_EXTENSIONS:
        return "archive"

    return "file"


def processing_status(material_type: str) -> str:
    if material_type in {"code", "text", "pdf"}:
        return "ready"

    if material_type == "quarantined":
        return "quarantined"

    return "stored_only"


def extract_safe_text(
    material_type: str,
    file_path: Path,
    captured: bytes,
) -> str | None:
    if material_type == "pdf":
        try:
            return extract_pdf_text(file_path)[:500_000]
        except Exception:
            return None

    if material_type not in {"code", "text"}:
        return None

    if b"\x00" in captured[:8192]:
        return None

    try:
        return captured.decode("utf-8")[:500_000]
    except UnicodeDecodeError:
        return captured.decode(
            "utf-8",
            errors="replace",
        )[:500_000]


def serialize_material(material: StudyMaterial) -> dict:
    status = processing_status(material.material_type)

    return {
        "id": material.id,
        "sha256": material.sha256,
        "original_filename": material.original_filename,
        "file_size": material.file_size,
        "content_type": material.content_type,
        "material_type": material.material_type,
        "processing_status": status,
        "preview_available": bool(material.extracted_text),
        "purpose_category": material.purpose_category,
        "content_category": material.content_category,
        "detected_topic": material.detected_topic,
        "intelligence_summary": material.intelligence_summary,
        "classification_confidence": (
            material.classification_confidence
        ),
        "intelligence_status": material.intelligence_status,
        "intelligence_error": material.intelligence_error,
        "analyzed_at": material.analyzed_at,
        "study_room_id": material.study_room_id,
        "created_by_user_id": material.owner_id,
        "created_at": material.created_at,
        "last_opened_at": material.last_opened_at,
    }


def get_material_or_404(
    db: Session,
    material_id: int,
) -> StudyMaterial:
    material = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.id == material_id
        )
        .first()
    )

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Material not found.",
        )

    return material



@router.post("/resumable/start")
def start_resumable_upload(
    data: StartResumableUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_contributor(
        db=db,
        room_id=data.study_room_id,
        user_id=current_user.id,
    )

    if data.file_size > RESUMABLE_MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Files can be up to 2GB.",
        )

    filename = clean_original_filename(
        data.filename
    )

    upload_id = uuid.uuid4().hex

    directory = resumable_session_directory(
        current_user.id,
        upload_id,
    )

    directory.mkdir(
        parents=True,
        exist_ok=False,
    )

    total_chunks = math.ceil(
        data.file_size / RESUMABLE_CHUNK_SIZE
    )

    metadata = {
        "upload_id": upload_id,
        "owner_id": current_user.id,
        "study_room_id": data.study_room_id,
        "filename": filename,
        "file_size": data.file_size,
        "content_type": (
            data.content_type
            or "application/octet-stream"
        )[:255],
        "chunk_size": RESUMABLE_CHUNK_SIZE,
        "total_chunks": total_chunks,
        "created_at": datetime.now(
            timezone.utc
        ).isoformat(),
    }

    write_resumable_metadata(
        directory,
        metadata,
    )

    return {
        **metadata,
        "uploaded_chunks": [],
    }


@router.get("/resumable/{upload_id}")
def get_resumable_upload(
    upload_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    metadata = read_resumable_metadata(
        current_user.id,
        upload_id,
    )

    require_room_contributor(
        db=db,
        room_id=int(
            metadata["study_room_id"]
        ),
        user_id=current_user.id,
    )

    directory = resumable_session_directory(
        current_user.id,
        upload_id,
    )

    uploaded_chunks = sorted(
        int(path.stem)
        for path in directory.glob("*.chunk")
        if path.stem.isdigit()
    )

    uploaded_bytes = sum(
        path.stat().st_size
        for path in directory.glob("*.chunk")
    )

    return {
        **metadata,
        "uploaded_chunks": uploaded_chunks,
        "uploaded_bytes": uploaded_bytes,
    }


@router.put(
    "/resumable/{upload_id}/chunks/{chunk_index}"
)
async def upload_resumable_chunk(
    upload_id: str,
    chunk_index: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    metadata = read_resumable_metadata(
        current_user.id,
        upload_id,
    )

    require_room_contributor(
        db=db,
        room_id=int(
            metadata["study_room_id"]
        ),
        user_id=current_user.id,
    )

    total_chunks = int(
        metadata["total_chunks"]
    )

    if (
        chunk_index < 0
        or chunk_index >= total_chunks
        or chunk_index >= RESUMABLE_MAX_CHUNKS
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid chunk number.",
        )

    directory = resumable_session_directory(
        current_user.id,
        upload_id,
    )

    final_chunk_path = (
        directory
        / f"{chunk_index}.chunk"
    )

    if final_chunk_path.is_file():
        return {
            "upload_id": upload_id,
            "chunk_index": chunk_index,
            "stored": True,
            "already_present": True,
            "size": final_chunk_path.stat().st_size,
        }

    temporary_chunk_path = (
        directory
        / f"{chunk_index}.part"
    )

    received = 0

    try:
        with temporary_chunk_path.open(
            "wb"
        ) as output:
            async for part in request.stream():
                if not part:
                    continue

                received += len(part)

                if received > RESUMABLE_CHUNK_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "Upload chunk is larger "
                            "than 8MB."
                        ),
                    )

                output.write(part)

        if received <= 0:
            raise HTTPException(
                status_code=400,
                detail="Upload chunk is empty.",
            )

        expected_size = (
            RESUMABLE_CHUNK_SIZE
            if chunk_index
            < total_chunks - 1
            else (
                int(metadata["file_size"])
                - (
                    RESUMABLE_CHUNK_SIZE
                    * (total_chunks - 1)
                )
            )
        )

        if received != expected_size:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Chunk size does not match "
                    "the upload session."
                ),
            )

        os.replace(
            temporary_chunk_path,
            final_chunk_path,
        )

        return {
            "upload_id": upload_id,
            "chunk_index": chunk_index,
            "stored": True,
            "already_present": False,
            "size": received,
        }

    finally:
        temporary_chunk_path.unlink(
            missing_ok=True
        )


@router.post(
    "/resumable/{upload_id}/complete"
)
def complete_resumable_upload(
    upload_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    metadata = read_resumable_metadata(
        current_user.id,
        upload_id,
    )

    study_room_id = int(
        metadata["study_room_id"]
    )

    require_room_contributor(
        db=db,
        room_id=study_room_id,
        user_id=current_user.id,
    )

    directory = resumable_session_directory(
        current_user.id,
        upload_id,
    )

    total_chunks = int(
        metadata["total_chunks"]
    )

    missing = [
        index
        for index in range(total_chunks)
        if not (
            directory
            / f"{index}.chunk"
        ).is_file()
    ]

    if missing:
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    "Upload is not complete."
                ),
                "missing_chunks": missing[:100],
                "missing_count": len(missing),
            },
        )

    original_filename = (
        clean_original_filename(
            str(metadata["filename"])
        )
    )

    suffix = safe_suffix(
        original_filename
    )

    combine_path = (
        directory / "combined.upload"
    )

    digest = hashlib.sha256()
    captured = bytearray()
    actual_size = 0

    try:
        with combine_path.open("wb") as output:
            for index in range(total_chunks):
                chunk_path = (
                    directory
                    / f"{index}.chunk"
                )

                with chunk_path.open("rb") as source:
                    while True:
                        block = source.read(
                            CHUNK_SIZE
                        )

                        if not block:
                            break

                        actual_size += len(block)
                        digest.update(block)

                        if (
                            len(captured)
                            < TEXT_CAPTURE_LIMIT
                        ):
                            remaining = (
                                TEXT_CAPTURE_LIMIT
                                - len(captured)
                            )

                            captured.extend(
                                block[:remaining]
                            )

                        output.write(block)

        expected_size = int(
            metadata["file_size"]
        )

        if actual_size != expected_size:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Combined file size does not "
                    "match the upload session."
                ),
            )

        content_type = str(
            metadata.get(
                "content_type",
                "application/octet-stream",
            )
        )

        material_type = classify_material(
            filename=original_filename,
            content_type=content_type,
            header=bytes(captured[:16]),
        )

        destination_root = (
            QUARANTINE_ROOT
            if material_type == "quarantined"
            else UPLOAD_ROOT
        )

        destination_directory = (
            destination_root
            / str(current_user.id)
            / str(study_room_id)
        )

        destination_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        stored_filename = (
            f"{uuid.uuid4()}{suffix}"
        )

        final_path = (
            destination_directory
            / stored_filename
        )

        os.replace(
            combine_path,
            final_path,
        )

        try:
            os.chmod(final_path, 0o600)
        except OSError:
            pass

        extracted_text = None

        # Large files are stored safely first.
        # Extraction remains synchronous only
        # for reasonably sized text/PDF files.
        if actual_size <= 100 * 1024 * 1024:
            extracted_text = extract_safe_text(
                material_type=material_type,
                file_path=final_path,
                captured=bytes(captured),
            )

        material = StudyMaterial(
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=str(final_path),
            file_size=actual_size,
            content_type=content_type[:255],
            material_type=material_type,
            extracted_text=extracted_text,
            study_room_id=study_room_id,
            owner_id=current_user.id,
            sha256=digest.hexdigest(),
            intelligence_status=(
                "pending"
                if actual_size
                > 100 * 1024 * 1024
                else "pending"
            ),
        )

        db.add(material)
        db.commit()
        db.refresh(material)

        if (
            material.material_type
            != "quarantined"
            and actual_size
            <= 100 * 1024 * 1024
        ):
            analyze_material(
                db,
                material,
            )
            db.refresh(material)

        response = serialize_material(
            material
        )

        response.update(
            {
                "sha256": digest.hexdigest(),
                "resumable": True,
                "processing_deferred": (
                    actual_size
                    > 100 * 1024 * 1024
                ),
                "message": (
                    "Upload complete. Large-file "
                    "processing will continue."
                    if actual_size
                    > 100 * 1024 * 1024
                    else "Upload complete."
                ),
            }
        )

        shutil.rmtree(
            directory,
            ignore_errors=True,
        )

        return response

    except Exception:
        combine_path.unlink(
            missing_ok=True
        )
        raise


@router.delete(
    "/resumable/{upload_id}"
)
def cancel_resumable_upload(
    upload_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    metadata = read_resumable_metadata(
        current_user.id,
        upload_id,
    )

    require_room_contributor(
        db=db,
        room_id=int(
            metadata["study_room_id"]
        ),
        user_id=current_user.id,
    )

    directory = resumable_session_directory(
        current_user.id,
        upload_id,
    )

    shutil.rmtree(
        directory,
        ignore_errors=True,
    )

    return {
        "upload_id": upload_id,
        "cancelled": True,
    }


@router.post("/upload")
async def upload_material(
    study_room_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_contributor(
        db=db,
        room_id=study_room_id,
        user_id=current_user.id,
    )

    original_filename = clean_original_filename(file.filename)
    suffix = safe_suffix(original_filename)

    temp_directory = (
        TEMP_ROOT
        / str(current_user.id)
        / str(study_room_id)
    )
    temp_directory.mkdir(parents=True, exist_ok=True)

    temp_path = temp_directory / f"{uuid.uuid4()}.upload"
    final_path: Path | None = None

    size = 0
    captured = bytearray()
    digest = hashlib.sha256()

    try:
        with temp_path.open("xb") as output:
            while True:
                chunk = await file.read(CHUNK_SIZE)

                if not chunk:
                    break

                size += len(chunk)

                if size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"File is too large. Maximum upload size "
                            f"is {MAX_UPLOAD_MB}MB."
                        ),
                    )

                digest.update(chunk)

                if len(captured) < TEXT_CAPTURE_LIMIT:
                    remaining = TEXT_CAPTURE_LIMIT - len(captured)
                    captured.extend(chunk[:remaining])

                output.write(chunk)

        if size <= 0:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        material_type = classify_material(
            filename=original_filename,
            content_type=file.content_type or "",
            header=bytes(captured[:16]),
        )

        destination_root = (
            QUARANTINE_ROOT
            if material_type == "quarantined"
            else UPLOAD_ROOT
        )

        destination_directory = (
            destination_root
            / str(current_user.id)
            / str(study_room_id)
        )
        destination_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        stored_filename = f"{uuid.uuid4()}{suffix}"
        final_path = destination_directory / stored_filename

        os.replace(temp_path, final_path)

        try:
            os.chmod(final_path, 0o600)
        except OSError:
            pass

        extracted_text = extract_safe_text(
            material_type=material_type,
            file_path=final_path,
            captured=bytes(captured),
        )

        material = StudyMaterial(
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=str(final_path),
            file_size=size,
            content_type=(
                file.content_type
                or "application/octet-stream"
            )[:255],
            material_type=material_type,
            extracted_text=extracted_text,
            study_room_id=study_room_id,
            owner_id=current_user.id,
            sha256=digest.hexdigest(),
        )

        db.add(material)
        db.commit()
        db.refresh(material)

        if material.material_type != "quarantined":
            analyze_material(db, material)
            db.refresh(material)

        response = serialize_material(material)
        response.update(
            {
                "sha256": digest.hexdigest(),
                "message": (
                    "File uploaded and quarantined. It will not be "
                    "previewed or executed."
                    if material_type == "quarantined"
                    else "File uploaded securely."
                ),
                "security": {
                    "private_to_room": True,
                    "private_to_owner": False,
                    "created_by_user_id": current_user.id,
                    "automatic_execution": False,
                    "basic_executable_check": True,
                },
            }
        )

        return response

    except HTTPException:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        raise

    except Exception:
        db.rollback()

        logger.exception(
            "Universal upload failed for user_id=%s room_id=%s filename=%s",
            current_user.id,
            study_room_id,
            original_filename,
        )

        if temp_path.exists():
            temp_path.unlink(missing_ok=True)

        if final_path is not None and final_path.exists():
            final_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=500,
            detail="The file could not be stored safely.",
        )

    finally:
        await file.close()


@router.get("/room/{study_room_id}")
def list_room_materials(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_view(
        db=db,
        room_id=study_room_id,
        user_id=current_user.id,
    )

    materials = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.study_room_id == study_room_id
        )
        .order_by(StudyMaterial.created_at.desc())
        .all()
    )

    return {
        "study_room_id": study_room_id,
        "materials": [
            serialize_material(material)
            for material in materials
        ],
    }


@router.post("/{material_id}/analyze")
def analyze_existing_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    material = get_material_or_404(
        db=db,
        material_id=material_id,
    )

    require_room_contributor(
        db=db,
        room_id=material.study_room_id,
        user_id=current_user.id,
    )

    if material.material_type == "quarantined":
        raise HTTPException(
            status_code=403,
            detail="Quarantined files cannot be analyzed.",
        )

    analyze_material(db, material)

    return serialize_material(material)


@router.get("/{material_id}/preview")
def preview_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    material = get_material_or_404(
        db=db,
        material_id=material_id,
    )

    require_room_view(
        db=db,
        room_id=material.study_room_id,
        user_id=current_user.id,
    )

    if material.material_type == "quarantined":
        raise HTTPException(
            status_code=403,
            detail="Quarantined files cannot be previewed.",
        )

    if not material.extracted_text:
        raise HTTPException(
            status_code=409,
            detail="Preview is not available for this file type yet.",
        )

    return {
        "id": material.id,
        "filename": material.original_filename,
        "material_type": material.material_type,
        "text": material.extracted_text,
    }


@router.get("/{material_id}/download")
def download_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    material = get_material_or_404(
        db=db,
        material_id=material_id,
    )

    require_room_view(
        db=db,
        room_id=material.study_room_id,
        user_id=current_user.id,
    )

    if material.material_type == "quarantined":
        raise HTTPException(
            status_code=403,
            detail=(
                "Quarantined files cannot be downloaded "
                "from StudySnap."
            ),
        )

    file_path = Path(material.file_path)

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Stored file was not found.",
        )

    material.last_opened_at = datetime.now(timezone.utc)
    db.commit()

    return FileResponse(
        path=file_path,
        filename=material.original_filename,
        media_type=(
            material.content_type
            or "application/octet-stream"
        ),
        content_disposition_type="attachment",
    )


@router.delete("/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    material = get_material_or_404(
        db=db,
        material_id=material_id,
    )

    require_room_item_change(
        db=db,
        room_id=material.study_room_id,
        user_id=current_user.id,
        item_owner_id=material.owner_id,
    )

    file_path = Path(material.file_path)

    db.delete(material)
    db.commit()

    try:
        file_path.unlink(missing_ok=True)
    except OSError:
        pass

    return {
        "message": "Material deleted.",
        "id": material_id,
    }
