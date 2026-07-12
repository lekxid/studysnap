import hashlib
import logging
import os
import re
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.study_material import StudyMaterial
from app.models.study_room import StudyRoom
from app.models.user import User
from app.routes.pdf_documents import extract_pdf_text
from app.utils.deps import get_current_user


router = APIRouter(tags=["Universal Materials"])

logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path("uploads/materials")
QUARANTINE_ROOT = Path("uploads/quarantine")
TEMP_ROOT = Path("uploads/tmp")

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
        "original_filename": material.original_filename,
        "file_size": material.file_size,
        "content_type": material.content_type,
        "material_type": material.material_type,
        "processing_status": status,
        "preview_available": bool(material.extracted_text),
        "study_room_id": material.study_room_id,
        "created_at": material.created_at,
        "last_opened_at": material.last_opened_at,
    }


def get_owned_room(
    db: Session,
    room_id: int,
    owner_id: int,
) -> StudyRoom:
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == room_id,
            StudyRoom.owner_id == owner_id,
        )
        .first()
    )

    if not room:
        raise HTTPException(
            status_code=404,
            detail="Study room not found.",
        )

    return room


def get_owned_material(
    db: Session,
    material_id: int,
    owner_id: int,
) -> StudyMaterial:
    material = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.id == material_id,
            StudyMaterial.owner_id == owner_id,
        )
        .first()
    )

    if not material:
        raise HTTPException(
            status_code=404,
            detail="Material not found.",
        )

    return material


@router.post("/upload")
async def upload_material(
    study_room_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_room(
        db=db,
        room_id=study_room_id,
        owner_id=current_user.id,
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
        )

        db.add(material)
        db.commit()
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
                    "private_to_owner": True,
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
    get_owned_room(
        db=db,
        room_id=study_room_id,
        owner_id=current_user.id,
    )

    materials = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.study_room_id == study_room_id,
            StudyMaterial.owner_id == current_user.id,
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


@router.get("/{material_id}/preview")
def preview_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    material = get_owned_material(
        db=db,
        material_id=material_id,
        owner_id=current_user.id,
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
    material = get_owned_material(
        db=db,
        material_id=material_id,
        owner_id=current_user.id,
    )

    file_path = Path(material.file_path)

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Stored file was not found.",
        )

    return FileResponse(
        path=file_path,
        filename=material.original_filename,
        media_type="application/octet-stream",
        content_disposition_type="attachment",
    )


@router.delete("/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    material = get_owned_material(
        db=db,
        material_id=material_id,
        owner_id=current_user.id,
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
