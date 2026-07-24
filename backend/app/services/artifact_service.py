from __future__ import annotations

import hashlib
import os
import re
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape

from fastapi import HTTPException
from jose import JWTError, jwt
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from sqlalchemy.orm import Session

from app.config import settings
from app.models.artifact import Artifact


FORMAT_DETAILS = {
    "pdf": (".pdf", "application/pdf"),
    "docx": (
        ".docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    "txt": (".txt", "text/plain; charset=utf-8"),
    "md": (".md", "text/markdown; charset=utf-8"),
}

ARTIFACT_FORMAT_LABELS = {
    "pdf": "PDF",
    "docx": "Word document",
    "txt": "text file",
    "md": "Markdown file",
}

_ARTIFACT_ACTION_PATTERN = re.compile(
    r"\b(create|make|turn|convert|save|export|download|prepare|generate|send|give)\b",
    flags=re.IGNORECASE,
)

_ARTIFACT_INFORMATION_QUESTION_PATTERN = re.compile(
    r"^\s*(what is|what are|how do|how does|how can|why does|explain)\b",
    flags=re.IGNORECASE,
)

_ARTIFACT_FORMAT_PATTERNS = (
    ("docx", re.compile(r"\b(docx|word document|word file)\b", re.IGNORECASE)),
    ("pdf", re.compile(r"\bpdf\b", re.IGNORECASE)),
    ("md", re.compile(r"\b(markdown|md file)\b", re.IGNORECASE)),
    ("txt", re.compile(r"\b(txt|text file)\b", re.IGNORECASE)),
)


def detect_artifact_export_request(value: str | None) -> str | None:
    normalized = " ".join((value or "").split())

    if not normalized:
        return None

    if _ARTIFACT_INFORMATION_QUESTION_PATTERN.search(normalized):
        return None

    if not _ARTIFACT_ACTION_PATTERN.search(normalized):
        return None

    for artifact_format, pattern in _ARTIFACT_FORMAT_PATTERNS:
        if pattern.search(normalized):
            return artifact_format

    return None


def artifact_format_label(artifact_format: str) -> str:
    return ARTIFACT_FORMAT_LABELS.get(
        artifact_format,
        "file",
    )


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def artifact_root() -> Path:
    return Path(settings.storage_root).expanduser().resolve() / "artifacts"


def safe_stem(value: str, fallback: str = "studysnap-export") -> str:
    stem = Path(value or "").stem.strip().lower()
    stem = re.sub(r"[^a-z0-9._-]+", "-", stem)
    stem = re.sub(r"-+", "-", stem).strip("-._")
    return (stem or fallback)[:120]


def build_pdf_bytes(title: str, content: str) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.7 * inch,
        leftMargin=0.7 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title=title,
        author="StudySnap AI",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "StudySnapArtifactTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        spaceAfter=16,
    )
    body_style = ParagraphStyle(
        "StudySnapArtifactBody",
        parent=styles["BodyText"],
        fontSize=10.5,
        leading=15,
        spaceAfter=8,
    )

    story = [Paragraph(escape(title), title_style), Spacer(1, 6)]

    paragraphs = re.split(r"\n\s*\n", content.strip())
    for paragraph in paragraphs:
        cleaned = escape(paragraph.strip()).replace("\n", "<br/>")
        if cleaned:
            story.append(Paragraph(cleaned, body_style))

    document.build(story)
    return buffer.getvalue()


def build_docx_bytes(title: str, content: str) -> bytes:
    buffer = BytesIO()

    def paragraph_xml(
        value: str,
        *,
        bold: bool = False,
        size_half_points: int | None = None,
    ) -> str:
        run_properties: list[str] = []

        if bold:
            run_properties.append("<w:b/>")

        if size_half_points is not None:
            run_properties.append(
                f'<w:sz w:val="{size_half_points}"/>'
            )

        properties = (
            "<w:rPr>"
            + "".join(run_properties)
            + "</w:rPr>"
            if run_properties
            else ""
        )

        return (
            "<w:p><w:r>"
            + properties
            + '<w:t xml:space="preserve">'
            + escape(value)
            + "</w:t></w:r></w:p>"
        )

    document_parts = [
        paragraph_xml(
            title.strip() or "StudySnap AI Export",
            bold=True,
            size_half_points=32,
        )
    ]

    for paragraph in re.split(r"\n\s*\n", content.strip()):
        lines = paragraph.splitlines() or [paragraph]

        for line in lines:
            document_parts.append(
                paragraph_xml(line)
            )

        document_parts.append("<w:p/>")

    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        + "".join(document_parts)
        + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1008" w:right="1008" w:bottom="1008" w:left="1008"/>'
        "</w:sectPr></w:body></w:document>"
    )

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )

    relationships = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )

    with zipfile.ZipFile(
        buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        archive.writestr(
            "[Content_Types].xml",
            content_types,
        )
        archive.writestr(
            "_rels/.rels",
            relationships,
        )
        archive.writestr(
            "word/document.xml",
            document_xml,
        )

    return buffer.getvalue()


def build_artifact_bytes(
    *,
    title: str,
    content: str,
    artifact_format: str,
) -> tuple[bytes, str, str]:
    if artifact_format not in FORMAT_DETAILS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported artifact format.",
        )

    suffix, content_type = FORMAT_DETAILS[artifact_format]

    if artifact_format == "pdf":
        payload = build_pdf_bytes(title, content)
    elif artifact_format == "docx":
        payload = build_docx_bytes(title, content)
    else:
        payload = content.encode("utf-8")

    filename = f"{safe_stem(title)}{suffix}"
    return payload, filename, content_type


def create_text_artifact(
    *,
    db: Session,
    owner_id: int,
    title: str,
    content: str,
    artifact_format: str,
    conversation_id: int | None = None,
    message_id: int | None = None,
    expires_in_days: int | None = None,
) -> Artifact:
    clean_content = content.strip()
    if not clean_content:
        raise HTTPException(
            status_code=400,
            detail="Artifact content cannot be empty.",
        )

    payload, filename, content_type = build_artifact_bytes(
        title=title.strip() or "StudySnap AI Export",
        content=clean_content,
        artifact_format=artifact_format,
    )

    owner_directory = artifact_root() / str(owner_id)
    owner_directory.mkdir(parents=True, exist_ok=True)

    suffix = FORMAT_DETAILS[artifact_format][0]
    stored_filename = f"{uuid.uuid4().hex}{suffix}"
    file_path = owner_directory / stored_filename
    temporary_path = owner_directory / f".{stored_filename}.tmp"

    temporary_path.write_bytes(payload)
    os.replace(temporary_path, file_path)

    expires_at = None
    if expires_in_days is not None:
        expires_at = utc_now() + timedelta(days=expires_in_days)

    artifact = Artifact(
        owner_id=owner_id,
        conversation_id=conversation_id,
        message_id=message_id,
        kind="document",
        filename=filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        file_size=len(payload),
        content_type=content_type,
        sha256=hashlib.sha256(payload).hexdigest(),
        status="ready",
        expires_at=expires_at,
    )

    try:
        db.add(artifact)
        db.commit()
        db.refresh(artifact)
    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise

    return artifact


def get_owned_artifact_or_404(
    db: Session,
    artifact_id: int,
    owner_id: int,
    *,
    allow_expired: bool = False,
) -> Artifact:
    artifact = (
        db.query(Artifact)
        .filter(
            Artifact.id == artifact_id,
            Artifact.owner_id == owner_id,
            Artifact.status == "ready",
        )
        .first()
    )

    if artifact is None:
        raise HTTPException(
            status_code=404,
            detail="Artifact not found.",
        )

    expires_at = normalize_datetime(artifact.expires_at)
    if not allow_expired and expires_at is not None and expires_at <= utc_now():
        raise HTTPException(
            status_code=410,
            detail="This artifact has expired.",
        )

    return artifact


def resolve_artifact_file(artifact: Artifact) -> Path:
    root = artifact_root()

    try:
        file_path = Path(artifact.file_path).expanduser().resolve()
    except OSError as error:
        raise HTTPException(
            status_code=404,
            detail="Stored artifact was not found.",
        ) from error

    if root != file_path and root not in file_path.parents:
        raise HTTPException(
            status_code=404,
            detail="Stored artifact was not found.",
        )

    expected = None
    for suffix, content_type in FORMAT_DETAILS.values():
        if file_path.suffix.lower() == suffix:
            expected = content_type
            break

    if expected is None or artifact.content_type != expected or not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Stored artifact was not found.",
        )

    return file_path


def serialize_artifact(artifact: Artifact) -> dict:
    return {
        "id": artifact.id,
        "owner_id": artifact.owner_id,
        "conversation_id": artifact.conversation_id,
        "message_id": artifact.message_id,
        "kind": artifact.kind,
        "filename": artifact.filename,
        "file_size": artifact.file_size,
        "content_type": artifact.content_type,
        "status": artifact.status,
        "expires_at": artifact.expires_at,
        "created_at": artifact.created_at,
        "download_url": f"/api/artifacts/{artifact.id}/download",
        "ticket_url": f"/api/artifacts/{artifact.id}/ticket",
    }


def create_download_ticket(artifact: Artifact) -> tuple[str, datetime]:
    minutes = max(
        1,
        min(
            int(getattr(settings, "artifact_ticket_expire_minutes", 5)),
            30,
        ),
    )
    expires_at = utc_now() + timedelta(minutes=minutes)

    token = jwt.encode(
        {
            "purpose": "artifact-download",
            "artifact_id": artifact.id,
            "owner_id": artifact.owner_id,
            "iat": int(utc_now().timestamp()),
            "exp": int(expires_at.timestamp()),
        },
        settings.secret_key,
        algorithm=settings.algorithm,
    )

    url = (
        f"/api/artifacts/public/{artifact.id}"
        f"?token={quote(token, safe='')}"
    )
    return url, expires_at


def decode_download_ticket(token: str) -> tuple[int, int]:
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        if payload.get("purpose") != "artifact-download":
            raise ValueError("Invalid ticket purpose")

        return int(payload["artifact_id"]), int(payload["owner_id"])
    except (JWTError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(
            status_code=404,
            detail="Download link is invalid or expired.",
        ) from error
