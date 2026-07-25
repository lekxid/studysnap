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
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.pdfgen import canvas
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
    r"\b(create|make|turn|convert|change|transform|save|export|download|prepare|generate|send|give)\b",
    flags=re.IGNORECASE,
)

_ARTIFACT_INFORMATION_QUESTION_PATTERN = re.compile(
    r"^\s*(what is|what are|how do|how does|how can|why does|explain)\b",
    flags=re.IGNORECASE,
)

_ARTIFACT_FORMAT_PATTERNS = (
    ("docx", re.compile(r"\b(docx|word document|word file)\b", re.IGNORECASE)),
    ("pdf", re.compile(r"\b(pdf|dpf)\b", re.IGNORECASE)),
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


def build_artifact_generation_instructions(
    artifact_format: str,
    request_text: str,
) -> str:
    format_label = artifact_format_label(
        artifact_format
    )

    return f"""
The student requested a finished {format_label} document.

Complete the student's real task before creating the file.

Mandatory rules:
- Resolve follow-ups such as "yes please", "send it", "make it PDF", "use the previous one", and "humanize it" from the full conversation.
- Use every relevant stored source file attached to this conversation.
- Apply all requested corrections, adjustments, rewriting, and humanization before generating the document.
- Humanized writing must sound natural, specific, and appropriate for the student's intended audience.
- Preserve names, dates, employment, education, qualifications, facts, figures, and source details.
- Never invent missing personal details, employment, education, dates, skills, achievements, credentials, or contact information.
- Do not export an earlier suggestion, explanation, loading message, placeholder, or clarification question.
- Produce the complete final document content for the student to review.
- Use clear headings, spacing, bullets, and structure when appropriate.
- Do not wrap the document in a code block.
- Do not add an introduction such as "Here is your document".
- Do not add commentary after the finished document.
- When essential information is genuinely unavailable, begin exactly with NEEDS_CLARIFICATION: and ask one concise question. No artifact will be created in that case.

Latest student request:
{request_text.strip()}
""".strip()


def artifact_content_is_final(
    content: str | None,
) -> bool:
    clean = " ".join(
        (content or "").split()
    ).strip()

    if len(clean) < 40:
        return False

    lowered = clean.lower()

    rejected_starts = (
        "needs_clarification:",
        "could you please provide",
        "could you provide",
        "please provide",
        "please confirm",
        "can you please provide",
        "can you provide",
        "before i create",
        "before creating",
        "i need more information",
        "i would need",
        "to create this",
        "to make this",
        "i can help you",
        "sure, please send",
        "please resend",
        "upload the file again",
    )

    if lowered.startswith(
        rejected_starts
    ):
        return False

    rejected_phrases = (
        "please share the updated details",
        "please send the information",
        "confirm or provide the updated",
        "once you provide",
        "after you provide",
        "then i can create",
        "then i will create",
        "send your resume again",
        "resend the resume",
    )

    opening = lowered[:900]

    if any(
        phrase in opening
        for phrase in rejected_phrases
    ):
        return False

    if (
        clean.endswith("?")
        and len(clean) < 500
        and "\n#" not in (content or "")
    ):
        return False

    return True


def suggest_artifact_title(
    request_text: str | None,
    content: str | None,
    fallback: str = "StudySnap Document",
) -> str:
    request = " ".join(
        (request_text or "").split()
    ).strip().lower()

    body = (
        content or ""
    ).strip()

    body_lower = body.lower()

    resume_signals = sum(
        signal in body_lower
        for signal in (
            "professional summary",
            "work experience",
            "employment history",
            "education",
            "skills",
            "certifications",
        )
    )

    if (
        re.search(
            r"\b(?:resume|résumé|cv)\b",
            request,
            flags=re.IGNORECASE,
        )
        or resume_signals >= 3
    ):
        return "Updated Resume"

    named_targets = (
        (
            r"\bcover\s+letter\b",
            "Cover Letter",
        ),
        (
            r"\bcare\s+plan\b",
            "Care Plan",
        ),
        (
            r"\bstudy\s+guide\b",
            "Study Guide",
        ),
        (
            r"\breflection\b",
            "Reflection",
        ),
        (
            r"\breport\b",
            "Report",
        ),
        (
            r"\bassignment\b",
            "Assignment",
        ),
        (
            r"\bofficial\s+letter\b",
            "Official Letter",
        ),
        (
            r"\bletter\b",
            "Letter",
        ),
        (
            r"\bmeeting\s+notes\b",
            "Meeting Notes",
        ),
        (
            r"\bsummary\b",
            "Summary",
        ),
    )

    for pattern, title in named_targets:
        if re.search(
            pattern,
            request,
            flags=re.IGNORECASE,
        ):
            return title

    heading = re.search(
        r"(?m)^\s*#{1,3}\s+(.+?)\s*$",
        body,
    )

    if heading:
        candidate = re.sub(
            r"[*_`#]+",
            "",
            heading.group(1),
        ).strip()

        if (
            candidate
            and len(candidate) <= 100
        ):
            return candidate

    first_line = next(
        (
            line.strip()
            for line in body.splitlines()
            if line.strip()
        ),
        "",
    )

    first_line = re.sub(
        r"^[#>*\-\s]+",
        "",
        first_line,
    )

    first_line = re.sub(
        r"[*_`]+",
        "",
        first_line,
    ).strip()

    if (
        4 <= len(first_line) <= 80
        and not first_line.endswith("?")
    ):
        return first_line

    return (
        fallback.strip()
        or "StudySnap Document"
    )


def _artifact_inline_pdf_markup(
    value: str,
) -> str:
    cleaned = escape(
        value.strip()
    )

    cleaned = re.sub(
        r"\*\*(.+?)\*\*",
        r"<b>\1</b>",
        cleaned,
    )

    cleaned = re.sub(
        r"__(.+?)__",
        r"<b>\1</b>",
        cleaned,
    )

    cleaned = re.sub(
        r"`(.+?)`",
        r"<font name='Courier'>\1</font>",
        cleaned,
    )

    return cleaned


def build_pdf_bytes(
    title: str,
    content: str,
) -> bytes:
    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title=title,
        author="StudySnap AI",
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "StudySnapArtifactTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        fontSize=18,
        leading=22,
        spaceAfter=16,
    )

    heading_one = ParagraphStyle(
        "StudySnapHeadingOne",
        parent=styles["Heading1"],
        fontSize=15,
        leading=19,
        spaceBefore=7,
        spaceAfter=7,
    )

    heading_two = ParagraphStyle(
        "StudySnapHeadingTwo",
        parent=styles["Heading2"],
        fontSize=12,
        leading=16,
        spaceBefore=7,
        spaceAfter=5,
    )

    body_style = ParagraphStyle(
        "StudySnapArtifactBody",
        parent=styles["BodyText"],
        fontSize=10.5,
        leading=14.5,
        spaceAfter=5,
    )

    bullet_style = ParagraphStyle(
        "StudySnapArtifactBullet",
        parent=body_style,
        leftIndent=16,
        firstLineIndent=-8,
        spaceAfter=3,
    )

    first_line = next(
        (
            line.strip()
            for line in content.splitlines()
            if line.strip()
        ),
        "",
    )

    content_has_title = bool(
        re.match(
            r"^#{1,3}\s+",
            first_line,
        )
    )

    suppress_generic_resume_title = (
        title.strip().lower()
        == "updated resume"
    )

    story = []

    if (
        not content_has_title
        and not suppress_generic_resume_title
    ):
        story.append(
            Paragraph(
                escape(
                    title.strip()
                    or "StudySnap Document"
                ),
                title_style,
            )
        )

    for raw_line in content.splitlines():
        line = raw_line.strip()

        if not line:
            story.append(
                Spacer(1, 5)
            )
            continue

        if re.fullmatch(
            r"[-_*]{3,}",
            line,
        ):
            story.append(
                Spacer(1, 6)
            )
            continue

        heading_match = re.match(
            r"^(#{1,3})\s+(.+)$",
            line,
        )

        if heading_match:
            level = len(
                heading_match.group(1)
            )

            story.append(
                Paragraph(
                    _artifact_inline_pdf_markup(
                        heading_match.group(2)
                    ),
                    heading_one
                    if level == 1
                    else heading_two,
                )
            )
            continue

        bullet_match = re.match(
            r"^(?:[-*•])\s+(.+)$",
            line,
        )

        if bullet_match:
            story.append(
                Paragraph(
                    "• "
                    + _artifact_inline_pdf_markup(
                        bullet_match.group(1)
                    ),
                    bullet_style,
                )
            )
            continue

        numbered_match = re.match(
            r"^(\d+[.)])\s+(.+)$",
            line,
        )

        if numbered_match:
            story.append(
                Paragraph(
                    "<b>"
                    + escape(
                        numbered_match.group(1)
                    )
                    + "</b> "
                    + _artifact_inline_pdf_markup(
                        numbered_match.group(2)
                    ),
                    bullet_style,
                )
            )
            continue

        story.append(
            Paragraph(
                _artifact_inline_pdf_markup(
                    line
                ),
                body_style,
            )
        )

    document.build(story)

    payload = buffer.getvalue()

    if (
        not payload.startswith(b"%PDF")
        or len(payload) < 500
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "StudySnap could not verify "
                "the generated PDF."
            ),
        )

    return payload


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




def build_image_pdf_bytes(
    title: str,
    image_bytes: bytes,
) -> bytes:
    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="The image is empty.",
        )

    try:
        image_reader = ImageReader(
            BytesIO(image_bytes)
        )

        image_width, image_height = (
            image_reader.getSize()
        )
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail=(
                "StudySnap could not read "
                "the selected image."
            ),
        ) from error

    if (
        image_width <= 0
        or image_height <= 0
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "The image has no readable size."
            ),
        )

    buffer = BytesIO()

    page_width, page_height = letter

    margin = 0.55 * inch
    title_space = 0.55 * inch

    available_width = (
        page_width - (margin * 2)
    )

    available_height = (
        page_height
        - (margin * 2)
        - title_space
    )

    scale = min(
        available_width / image_width,
        available_height / image_height,
    )

    draw_width = image_width * scale
    draw_height = image_height * scale

    left = (
        page_width - draw_width
    ) / 2

    bottom = (
        margin
        + (
            available_height
            - draw_height
        ) / 2
    )

    clean_title = (
        title.strip()
        or "StudySnap Image"
    )

    display_title = (
        clean_title[:100]
        .encode(
            "latin-1",
            errors="replace",
        )
        .decode("latin-1")
    )

    document = canvas.Canvas(
        buffer,
        pagesize=letter,
    )

    document.setTitle(
        display_title
    )

    document.setAuthor(
        "StudySnap AI"
    )

    document.setFont(
        "Helvetica-Bold",
        15,
    )

    document.drawString(
        margin,
        page_height - margin,
        display_title,
    )

    document.drawImage(
        image_reader,
        left,
        bottom,
        width=draw_width,
        height=draw_height,
        preserveAspectRatio=True,
        mask="auto",
    )

    document.showPage()
    document.save()

    payload = buffer.getvalue()

    if (
        not payload.startswith(b"%PDF")
        or len(payload) < 1000
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "StudySnap could not verify "
                "the generated PDF."
            ),
        )

    return payload


def create_image_pdf_artifact(
    *,
    db: Session,
    owner_id: int,
    title: str,
    image_bytes: bytes,
    conversation_id: int | None = None,
    message_id: int | None = None,
) -> Artifact:
    clean_title = (
        title.strip()
        or "StudySnap Image"
    )

    payload = build_image_pdf_bytes(
        clean_title,
        image_bytes,
    )

    filename = (
        f"{safe_stem(clean_title)}.pdf"
    )

    owner_directory = (
        artifact_root()
        / str(owner_id)
    )

    owner_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    stored_filename = (
        f"{uuid.uuid4().hex}.pdf"
    )

    file_path = (
        owner_directory
        / stored_filename
    )

    temporary_path = (
        owner_directory
        / f".{stored_filename}.tmp"
    )

    temporary_path.write_bytes(
        payload
    )

    os.replace(
        temporary_path,
        file_path,
    )

    artifact = Artifact(
        owner_id=owner_id,
        conversation_id=conversation_id,
        message_id=message_id,
        kind="document",
        filename=filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        file_size=len(payload),
        content_type="application/pdf",
        sha256=hashlib.sha256(
            payload
        ).hexdigest(),
        status="ready",
        expires_at=None,
    )

    try:
        db.add(artifact)
        db.commit()
        db.refresh(artifact)
    except Exception:
        db.rollback()

        file_path.unlink(
            missing_ok=True
        )

        raise

    return artifact


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
