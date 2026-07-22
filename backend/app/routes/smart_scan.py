from __future__ import annotations

import base64
import io
import json
import re
import shutil
import textwrap
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.smart_scan import (
    SmartScan,
    SmartScanPage,
)
from app.models.user import User
from app.services.ai_service import (
    generate_studysnap_answer,
    get_openai_client,
)
from app.services.rooms.access import (
    require_room_contributor,
)
from app.storage import storage_path
from app.utils.deps import get_current_user


try:
    from pillow_heif import (
        register_heif_opener,
    )

    register_heif_opener()
except Exception:
    pass


router = APIRouter(
    tags=["Smart Scan"],
)

SMART_SCAN_ROOT = storage_path(
    "smart-scans"
)

MAX_SCAN_PAGES = 50
MAX_PAGE_SOURCE_BYTES = 25 * 1024 * 1024
MAX_SCAN_TOTAL_BYTES = 100 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_NORMALIZED_EDGE = 2400
MAX_OCR_BATCH_PAGES = 3


class CreateSmartScanRequest(BaseModel):
    title: str = Field(
        default="New Scan",
        max_length=120,
    )

    study_room_id: int | None = None


class UpdateSmartScanRequest(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=120,
    )


class RotatePageRequest(BaseModel):
    rotation: int


class ReorderPagesRequest(BaseModel):
    page_ids: list[int]


class RecognizePagesRequest(BaseModel):
    page_ids: list[int] | None = None


class AskSmartScanRequest(BaseModel):
    question: str = Field(
        min_length=1,
        max_length=4000,
    )


def ensure_smart_scan_enabled() -> None:
    if not settings.smart_scan_enabled:
        raise HTTPException(
            status_code=404,
            detail="Smart Scan is not enabled.",
        )


def utc_now() -> datetime:
    return datetime.now(
        timezone.utc
    )


def clean_title(
    value: str | None,
) -> str:
    return (
        (value or "").strip()[:120]
        or "New Scan"
    )


def clean_filename(
    value: str | None,
) -> str:
    name = Path(
        value or "scan-page.jpg"
    ).name

    name = re.sub(
        r"[^a-zA-Z0-9._ -]+",
        "-",
        name,
    ).strip(" .-")

    return name[:180] or "scan-page.jpg"


def resolve_scan_path(
    value: str | Path,
) -> Path:
    root = SMART_SCAN_ROOT.resolve()
    path = Path(value).resolve()

    try:
        path.relative_to(root)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "The scan file is outside "
                "StudySnap storage."
            ),
        ) from exc

    return path


def get_owned_scan(
    db: Session,
    scan_id: int,
    owner_id: int,
) -> SmartScan:
    scan = (
        db.query(SmartScan)
        .filter(
            SmartScan.id == scan_id,
            SmartScan.owner_id == owner_id,
        )
        .first()
    )

    if scan is None:
        raise HTTPException(
            status_code=404,
            detail="Scan not found.",
        )

    return scan


def get_owned_page(
    db: Session,
    page_id: int,
    owner_id: int,
) -> tuple[SmartScan, SmartScanPage]:
    page = (
        db.query(SmartScanPage)
        .join(
            SmartScan,
            SmartScan.id
            == SmartScanPage.scan_id,
        )
        .filter(
            SmartScanPage.id == page_id,
            SmartScan.owner_id == owner_id,
        )
        .first()
    )

    if page is None:
        raise HTTPException(
            status_code=404,
            detail="Scan page not found.",
        )

    scan = get_owned_scan(
        db,
        page.scan_id,
        owner_id,
    )

    return scan, page


def list_scan_pages(
    db: Session,
    scan_id: int,
) -> list[SmartScanPage]:
    return (
        db.query(SmartScanPage)
        .filter(
            SmartScanPage.scan_id
            == scan_id
        )
        .order_by(
            SmartScanPage.page_number.asc(),
            SmartScanPage.id.asc(),
        )
        .all()
    )


def serialize_page(
    page: SmartScanPage,
) -> dict:
    return {
        "id": page.id,
        "scan_id": page.scan_id,
        "page_number": page.page_number,
        "original_filename": (
            page.original_filename
        ),
        "file_size": page.file_size,
        "content_type": page.content_type,
        "width": page.width,
        "height": page.height,
        "rotation": page.rotation,
        "extracted_text": (
            page.extracted_text or ""
        ),
        "ocr_confidence": (
            page.ocr_confidence
        ),
        "ocr_status": page.ocr_status,
        "ocr_error": page.ocr_error,
        "preview_url": (
            "/api/smart-scan/pages/"
            f"{page.id}/file"
        ),
        "created_at": (
            page.created_at.isoformat()
            if page.created_at
            else None
        ),
        "updated_at": (
            page.updated_at.isoformat()
            if page.updated_at
            else None
        ),
    }


def serialize_scan(
    db: Session,
    scan: SmartScan,
    include_pages: bool = True,
) -> dict:
    pages = (
        list_scan_pages(
            db,
            scan.id,
        )
        if include_pages
        else []
    )

    return {
        "id": scan.id,
        "owner_id": scan.owner_id,
        "study_room_id": (
            scan.study_room_id
        ),
        "title": scan.title,
        "status": scan.status,
        "page_count": scan.page_count,
        "extracted_text": (
            scan.extracted_text or ""
        ),
        "pdf_filename": scan.pdf_filename,
        "pdf_file_size": scan.pdf_file_size,
        "pdf_url": (
            f"/api/smart-scan/{scan.id}/pdf"
        ),
        "pages": [
            serialize_page(page)
            for page in pages
        ],
        "created_at": (
            scan.created_at.isoformat()
            if scan.created_at
            else None
        ),
        "updated_at": (
            scan.updated_at.isoformat()
            if scan.updated_at
            else None
        ),
    }


def invalidate_scan_pdf(
    scan: SmartScan,
) -> None:
    if scan.pdf_file_path:
        try:
            resolve_scan_path(
                scan.pdf_file_path
            ).unlink(
                missing_ok=True
            )
        except OSError:
            pass

    scan.pdf_filename = None
    scan.pdf_file_path = None
    scan.pdf_file_size = None


def refresh_scan_summary(
    db: Session,
    scan: SmartScan,
) -> None:
    pages = list_scan_pages(
        db,
        scan.id,
    )

    scan.page_count = len(pages)

    text_sections = []

    for page in pages:
        text = (
            page.extracted_text or ""
        ).strip()

        if text:
            text_sections.append(
                f"[Page {page.page_number}]\n"
                f"{text}"
            )

    scan.extracted_text = (
        "\n\n".join(text_sections)
        or None
    )

    if not pages:
        scan.status = "draft"
    elif any(
        page.ocr_status
        in {
            "pending",
            "processing",
        }
        for page in pages
    ):
        scan.status = "processing"
    elif any(
        page.ocr_status
        in {
            "failed",
            "unavailable",
            "unreadable",
            "needs_review",
        }
        for page in pages
    ):
        scan.status = "needs_review"
    elif all(
        page.ocr_status == "ready"
        for page in pages
    ):
        scan.status = "ready"
    else:
        scan.status = "processing"

    scan.updated_at = utc_now()


def normalize_scan_image(
    data: bytes,
) -> tuple[bytes, int, int]:
    if not data:
        raise HTTPException(
            status_code=400,
            detail="The scan page is empty.",
        )

    if len(data) > MAX_PAGE_SOURCE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                "Each scan page must be "
                "25 MB or smaller."
            ),
        )

    try:
        with Image.open(
            io.BytesIO(data)
        ) as opened:
            opened.seek(0)

            width, height = opened.size

            if (
                width <= 0
                or height <= 0
                or width * height
                > MAX_IMAGE_PIXELS
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "This image is too large "
                        "or has invalid dimensions."
                    ),
                )

            image = ImageOps.exif_transpose(
                opened
            ).convert("RGB")

            image.thumbnail(
                (
                    MAX_NORMALIZED_EDGE,
                    MAX_NORMALIZED_EDGE,
                ),
                Image.Resampling.LANCZOS,
            )

            output = io.BytesIO()

            image.save(
                output,
                format="JPEG",
                quality=90,
                optimize=True,
            )

            normalized = output.getvalue()

            if len(normalized) > 8 * 1024 * 1024:
                image.thumbnail(
                    (1800, 1800),
                    Image.Resampling.LANCZOS,
                )

                output = io.BytesIO()

                image.save(
                    output,
                    format="JPEG",
                    quality=82,
                    optimize=True,
                )

                normalized = output.getvalue()

            final_width, final_height = (
                image.size
            )

            return (
                normalized,
                final_width,
                final_height,
            )

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "StudySnap could not read "
                "this scan page. Use a clear "
                "JPG, PNG, WEBP, HEIC, or HEIF."
            ),
        ) from exc


def parse_vision_json(
    value: str,
) -> dict:
    text = (value or "").strip()

    if text.startswith("```"):
        text = re.sub(
            r"^```(?:json)?\s*",
            "",
            text,
            flags=re.IGNORECASE,
        )

        text = re.sub(
            r"\s*```$",
            "",
            text,
        )

    try:
        parsed = json.loads(text)
    except Exception:
        return {
            "extracted_text": text,
            "confidence": 50 if text else 0,
            "readable": bool(text),
            "notes": (
                "The AI response was not "
                "structured as expected."
            ),
        }

    return (
        parsed
        if isinstance(parsed, dict)
        else {}
    )


def extract_scan_page_text(
    image_bytes: bytes,
    content_type: str = "image/jpeg",
) -> tuple[str, int, str, str | None]:
    if not settings.openai_api_key.strip():
        return (
            "",
            0,
            "unavailable",
            (
                "AI text recognition is "
                "not configured."
            ),
        )

    encoded = base64.b64encode(
        image_bytes
    ).decode("utf-8")

    prompt = """
Read this scanned page carefully.

The page may contain printed text, handwriting,
a worksheet, a form, a textbook page, class notes,
a timetable, or a mixed document.

Return only valid JSON with:
{
  "extracted_text": "all readable text in natural reading order",
  "confidence": 0,
  "readable": true,
  "notes": "brief uncertainty note or empty string"
}

Rules:
- Copy only text that is genuinely visible.
- Preserve headings, lists, and line breaks where useful.
- Do not guess missing words.
- Do not answer questions written on the page.
- Confidence must be an integer from 0 to 100.
- If the page is unclear, say so in notes.
""".strip()

    try:
        response = (
            get_openai_client()
            .responses.create(
                model=(
                    settings.openai_vision_model
                    or "gpt-4o-mini"
                ),
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
                                "image_url": (
                                    f"data:{content_type};"
                                    f"base64,{encoded}"
                                ),
                                "detail": "high",
                            },
                        ],
                    }
                ],
                max_output_tokens=4000,
                store=False,
            )
        )

        output = (
            getattr(
                response,
                "output_text",
                "",
            )
            or ""
        )

        result = parse_vision_json(
            output
        )

        text = str(
            result.get(
                "extracted_text",
                "",
            )
            or ""
        ).strip()

        try:
            confidence = int(
                result.get(
                    "confidence",
                    0,
                )
            )
        except Exception:
            confidence = 0

        confidence = max(
            0,
            min(100, confidence),
        )

        readable = bool(
            result.get(
                "readable",
                bool(text),
            )
        )

        notes = str(
            result.get(
                "notes",
                "",
            )
            or ""
        ).strip()[:500]

        if not readable or not text:
            return (
                text,
                confidence,
                "unreadable",
                notes
                or (
                    "No reliable text could "
                    "be read from this page."
                ),
            )

        if confidence < 60:
            return (
                text,
                confidence,
                "needs_review",
                notes
                or (
                    "Some recognized text may "
                    "need correction."
                ),
            )

        return (
            text,
            confidence,
            "ready",
            notes or None,
        )

    except Exception:
        return (
            "",
            0,
            "failed",
            (
                "StudySnap could not complete "
                "text recognition for this page."
            ),
        )


def rotated_image(
    image: Image.Image,
    rotation: int,
) -> Image.Image:
    if rotation == 90:
        return image.transpose(
            Image.Transpose.ROTATE_270
        )

    if rotation == 180:
        return image.transpose(
            Image.Transpose.ROTATE_180
        )

    if rotation == 270:
        return image.transpose(
            Image.Transpose.ROTATE_90
        )

    return image


def build_searchable_pdf(
    scan: SmartScan,
    pages: list[SmartScanPage],
) -> bytes:
    if not pages:
        raise HTTPException(
            status_code=400,
            detail=(
                "Add at least one page "
                "before creating a PDF."
            ),
        )

    buffer = io.BytesIO()
    page_width, page_height = letter

    pdf = canvas.Canvas(
        buffer,
        pagesize=letter,
        pageCompression=1,
    )

    pdf.setTitle(
        scan.title or "StudySnap Scan"
    )

    pdf.setAuthor("StudySnap")

    for page in pages:
        file_path = resolve_scan_path(
            page.file_path
        )

        if not file_path.is_file():
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Scan page "
                    f"{page.page_number} "
                    "is missing."
                ),
            )

        with Image.open(
            file_path
        ) as opened:
            image = rotated_image(
                opened.convert("RGB"),
                page.rotation,
            )

            image_width, image_height = (
                image.size
            )

            scale = min(
                page_width / image_width,
                page_height / image_height,
            )

            draw_width = (
                image_width * scale
            )

            draw_height = (
                image_height * scale
            )

            x = (
                page_width - draw_width
            ) / 2

            y = (
                page_height - draw_height
            ) / 2

            pdf.drawImage(
                ImageReader(image),
                x,
                y,
                width=draw_width,
                height=draw_height,
                preserveAspectRatio=True,
                mask="auto",
            )

        recognized = (
            page.extracted_text or ""
        ).strip()

        if recognized:
            text_object = pdf.beginText(
                18,
                18,
            )

            text_object.setFont(
                "Helvetica",
                1,
            )

            text_object.setLeading(2)

            try:
                text_object.setTextRenderMode(
                    3
                )
            except AttributeError:
                pass

            for raw_line in (
                recognized.splitlines()
            ):
                wrapped_lines = (
                    textwrap.wrap(
                        raw_line,
                        width=120,
                    )
                    or [""]
                )

                for line in wrapped_lines:
                    text_object.textLine(
                        line[:500]
                    )

            pdf.drawText(text_object)

        pdf.showPage()

    pdf.save()

    return buffer.getvalue()


def ensure_scan_pdf(
    db: Session,
    scan: SmartScan,
) -> Path:
    pages = list_scan_pages(
        db,
        scan.id,
    )

    pdf_bytes = build_searchable_pdf(
        scan,
        pages,
    )

    scan_dir = (
        SMART_SCAN_ROOT
        / str(scan.owner_id)
        / str(scan.id)
    )

    scan_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    filename = (
        f"studysnap-scan-{scan.id}.pdf"
    )

    final_path = (
        scan_dir / filename
    )

    temporary_path = (
        scan_dir
        / (
            filename
            + ".tmp-"
            + uuid.uuid4().hex
        )
    )

    temporary_path.write_bytes(
        pdf_bytes
    )

    temporary_path.replace(
        final_path
    )

    scan.pdf_filename = filename
    scan.pdf_file_path = str(
        final_path
    )
    scan.pdf_file_size = len(
        pdf_bytes
    )
    scan.updated_at = utc_now()

    db.add(scan)
    db.commit()
    db.refresh(scan)

    return final_path


@router.post(
    "",
    status_code=201,
)
def create_scan(
    payload: CreateSmartScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    if payload.study_room_id is not None:
        require_room_contributor(
            db=db,
            room_id=payload.study_room_id,
            user_id=current_user.id,
        )

    scan = SmartScan(
        owner_id=current_user.id,
        study_room_id=(
            payload.study_room_id
        ),
        title=clean_title(
            payload.title
        ),
        status="draft",
        page_count=0,
    )

    db.add(scan)
    db.commit()
    db.refresh(scan)

    return serialize_scan(
        db,
        scan,
    )


@router.get("")
def list_scans(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scans = (
        db.query(SmartScan)
        .filter(
            SmartScan.owner_id
            == current_user.id
        )
        .order_by(
            SmartScan.updated_at.desc(),
            SmartScan.id.desc(),
        )
        .all()
    )

    return [
        serialize_scan(
            db,
            scan,
            include_pages=False,
        )
        for scan in scans
    ]


@router.get("/{scan_id}")
def get_scan(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scan = get_owned_scan(
        db,
        scan_id,
        current_user.id,
    )

    return serialize_scan(
        db,
        scan,
    )


@router.patch("/{scan_id}")
def update_scan(
    scan_id: int,
    payload: UpdateSmartScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scan = get_owned_scan(
        db,
        scan_id,
        current_user.id,
    )

    scan.title = clean_title(
        payload.title
    )
    scan.updated_at = utc_now()

    db.commit()
    db.refresh(scan)

    return serialize_scan(
        db,
        scan,
    )


@router.post(
    "/{scan_id}/pages",
    status_code=201,
)
async def add_scan_pages(
    scan_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scan = get_owned_scan(
        db,
        scan_id,
        current_user.id,
    )

    if not files:
        raise HTTPException(
            status_code=400,
            detail=(
                "Choose at least one "
                "scan page."
            ),
        )

    existing_pages = list_scan_pages(
        db,
        scan.id,
    )

    if (
        len(existing_pages)
        + len(files)
        > MAX_SCAN_PAGES
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "A Smart Scan can contain "
                f"up to {MAX_SCAN_PAGES} pages."
            ),
        )

    existing_bytes = sum(
        page.file_size
        for page in existing_pages
    )

    total_bytes = existing_bytes
    created_paths: list[Path] = []
    added_pages: list[
        SmartScanPage
    ] = []

    scan_dir = (
        SMART_SCAN_ROOT
        / str(current_user.id)
        / str(scan.id)
    )

    scan_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    try:
        for position, upload in enumerate(
            files,
            start=1,
        ):
            try:
                source_data = (
                    await upload.read()
                )
            finally:
                await upload.close()

            total_bytes += len(
                source_data
            )

            if (
                total_bytes
                > MAX_SCAN_TOTAL_BYTES
            ):
                raise HTTPException(
                    status_code=413,
                    detail=(
                        "This scan is too large. "
                        "Keep all pages together "
                        "under 100 MB."
                    ),
                )

            (
                normalized,
                width,
                height,
            ) = normalize_scan_image(
                source_data
            )

            stored_filename = (
                uuid.uuid4().hex
                + ".jpg"
            )

            file_path = (
                scan_dir
                / stored_filename
            )

            file_path.write_bytes(
                normalized
            )

            created_paths.append(
                file_path
            )

            page = SmartScanPage(
                scan_id=scan.id,
                page_number=(
                    len(existing_pages)
                    + position
                ),
                original_filename=(
                    clean_filename(
                        upload.filename
                    )
                ),
                stored_filename=(
                    stored_filename
                ),
                file_path=str(
                    file_path
                ),
                file_size=len(
                    normalized
                ),
                content_type="image/jpeg",
                width=width,
                height=height,
                rotation=0,
                extracted_text=None,
                ocr_confidence=None,
                ocr_status="pending",
                ocr_error=None,
            )

            db.add(page)
            added_pages.append(page)

        db.flush()

        invalidate_scan_pdf(
            scan
        )

        refresh_scan_summary(
            db,
            scan,
        )

        db.add(scan)
        db.commit()

        for page in added_pages:
            db.refresh(page)

        db.refresh(scan)

        return serialize_scan(
            db,
            scan,
        )

    except Exception:
        db.rollback()

        for path in created_paths:
            try:
                path.unlink(
                    missing_ok=True
                )
            except OSError:
                pass

        raise


@router.post(
    "/{scan_id}/recognize"
)
def recognize_scan_pages(
    scan_id: int,
    payload: RecognizePagesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scan = get_owned_scan(
        db,
        scan_id,
        current_user.id,
    )

    pages = list_scan_pages(
        db,
        scan.id,
    )

    pages_by_id = {
        page.id: page
        for page in pages
    }

    automatic_statuses = {
        "pending",
    }

    if payload.page_ids is not None:
        requested_ids = payload.page_ids

        if not requested_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Choose at least one "
                    "page to recognize."
                ),
            )

        if (
            len(requested_ids)
            > MAX_OCR_BATCH_PAGES
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "StudySnap recognizes up to "
                    f"{MAX_OCR_BATCH_PAGES} pages "
                    "per batch."
                ),
            )

        if (
            len(set(requested_ids))
            != len(requested_ids)
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Each page may only appear "
                    "once in a recognition batch."
                ),
            )

        if any(
            page_id not in pages_by_id
            for page_id in requested_ids
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Every selected page must "
                    "belong to this scan."
                ),
            )

        selected_pages = [
            pages_by_id[page_id]
            for page_id in requested_ids
        ]

    else:
        selected_pages = [
            page
            for page in pages
            if page.ocr_status
            in automatic_statuses
        ][:MAX_OCR_BATCH_PAGES]

    processed_pages = []

    for page in selected_pages:
        file_path = resolve_scan_path(
            page.file_path
        )

        if not file_path.is_file():
            page.ocr_status = "failed"
            page.ocr_confidence = 0
            page.ocr_error = (
                "The stored scan page "
                "could not be found."
            )

            processed_pages.append(page)
            continue

        page.ocr_status = "processing"
        page.ocr_error = None

        image_bytes = file_path.read_bytes()

        (
            extracted_text,
            confidence,
            ocr_status,
            ocr_error,
        ) = extract_scan_page_text(
            image_bytes,
            page.content_type,
        )

        page.extracted_text = (
            extracted_text or None
        )

        page.ocr_confidence = confidence
        page.ocr_status = ocr_status
        page.ocr_error = ocr_error
        page.updated_at = utc_now()

        processed_pages.append(page)

    refresh_scan_summary(
        db,
        scan,
    )

    db.add(scan)
    db.commit()
    db.refresh(scan)

    refreshed_pages = list_scan_pages(
        db,
        scan.id,
    )

    remaining_count = sum(
        page.ocr_status
        in {
            "pending",
            "processing",
        }
        for page in refreshed_pages
    )

    return {
        "processed_count": len(
            processed_pages
        ),
        "remaining_count": (
            remaining_count
        ),
        "scan": serialize_scan(
            db,
            scan,
        ),
    }


@router.patch(
    "/pages/{page_id}/rotation"
)
def rotate_page(
    page_id: int,
    payload: RotatePageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    if payload.rotation not in {
        0,
        90,
        180,
        270,
    }:
        raise HTTPException(
            status_code=422,
            detail=(
                "Rotation must be "
                "0, 90, 180, or 270."
            ),
        )

    scan, page = get_owned_page(
        db,
        page_id,
        current_user.id,
    )

    page.rotation = payload.rotation
    page.updated_at = utc_now()

    invalidate_scan_pdf(
        scan
    )

    scan.updated_at = utc_now()

    db.commit()
    db.refresh(page)
    db.refresh(scan)

    return serialize_page(page)


@router.post(
    "/{scan_id}/reorder"
)
def reorder_pages(
    scan_id: int,
    payload: ReorderPagesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scan = get_owned_scan(
        db,
        scan_id,
        current_user.id,
    )

    pages = list_scan_pages(
        db,
        scan.id,
    )

    current_ids = {
        page.id
        for page in pages
    }

    requested_ids = (
        payload.page_ids
    )

    if (
        len(requested_ids)
        != len(current_ids)
        or len(set(requested_ids))
        != len(requested_ids)
        or set(requested_ids)
        != current_ids
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Page order must contain "
                "every current page exactly once."
            ),
        )

    pages_by_id = {
        page.id: page
        for page in pages
    }

    for number, page_id in enumerate(
        requested_ids,
        start=1,
    ):
        pages_by_id[
            page_id
        ].page_number = number

    invalidate_scan_pdf(
        scan
    )

    refresh_scan_summary(
        db,
        scan,
    )

    db.commit()
    db.refresh(scan)

    return serialize_scan(
        db,
        scan,
    )


@router.get(
    "/pages/{page_id}/file"
)
def get_scan_page_file(
    page_id: int,
    download: bool = Query(
        default=False
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    _, page = get_owned_page(
        db,
        page_id,
        current_user.id,
    )

    file_path = resolve_scan_path(
        page.file_path
    )

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=(
                "Stored scan page "
                "was not found."
            ),
        )

    return FileResponse(
        path=file_path,
        filename=(
            page.original_filename
            if download
            else page.stored_filename
        ),
        media_type=page.content_type,
        content_disposition_type=(
            "attachment"
            if download
            else "inline"
        ),
    )


@router.delete(
    "/pages/{page_id}"
)
def delete_scan_page(
    page_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scan, page = get_owned_page(
        db,
        page_id,
        current_user.id,
    )

    file_path = resolve_scan_path(
        page.file_path
    )

    db.delete(page)
    db.flush()

    remaining = list_scan_pages(
        db,
        scan.id,
    )

    for number, remaining_page in enumerate(
        remaining,
        start=1,
    ):
        remaining_page.page_number = (
            number
        )

    invalidate_scan_pdf(
        scan
    )

    refresh_scan_summary(
        db,
        scan,
    )

    db.commit()
    db.refresh(scan)

    try:
        file_path.unlink(
            missing_ok=True
        )
    except OSError:
        pass

    return {
        "deleted": True,
        "page_id": page_id,
        "scan": serialize_scan(
            db,
            scan,
        ),
    }


@router.post(
    "/{scan_id}/ask"
)
def ask_scan(
    scan_id: int,
    payload: AskSmartScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scan = get_owned_scan(
        db,
        scan_id,
        current_user.id,
    )

    text = (
        scan.extracted_text or ""
    ).strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail=(
                "No reliable text has been "
                "recognized from this scan yet."
            ),
        )

    question = (
        payload.question.strip()
    )

    answer = generate_studysnap_answer(
        question,
        context=(
            f"SMART SCAN TITLE:\n"
            f"{scan.title}\n\n"
            "RECOGNIZED SCAN TEXT:\n"
            f"{text[:24000]}"
        ),
    )

    return {
        "scan_id": scan.id,
        "question": question,
        "answer": answer,
    }


@router.get(
    "/{scan_id}/pdf"
)
def download_scan_pdf(
    scan_id: int,
    download: bool = Query(
        default=True
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scan = get_owned_scan(
        db,
        scan_id,
        current_user.id,
    )

    file_path = ensure_scan_pdf(
        db,
        scan,
    )

    return FileResponse(
        path=file_path,
        filename=(
            scan.pdf_filename
            or (
                f"studysnap-scan-"
                f"{scan.id}.pdf"
            )
        ),
        media_type="application/pdf",
        content_disposition_type=(
            "attachment"
            if download
            else "inline"
        ),
    )


@router.delete("/{scan_id}")
def delete_scan(
    scan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    ensure_smart_scan_enabled()

    scan = get_owned_scan(
        db,
        scan_id,
        current_user.id,
    )

    scan_dir = (
        SMART_SCAN_ROOT
        / str(current_user.id)
        / str(scan.id)
    )

    pages = list_scan_pages(
        db,
        scan.id,
    )

    for page in pages:
        db.delete(page)

    db.delete(scan)
    db.commit()

    try:
        resolved = resolve_scan_path(
            scan_dir
        )

        if resolved.exists():
            shutil.rmtree(
                resolved
            )
    except OSError:
        pass

    return {
        "deleted": True,
        "scan_id": scan_id,
        "message": "Smart Scan deleted.",
    }
