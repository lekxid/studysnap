from __future__ import annotations

import base64
import io
import json
import os
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from openai import OpenAI
from PIL import Image
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.config import settings
from app.models.study_material import StudyMaterial


TEXT_LIMIT = 24_000
EXTRACTED_TEXT_LIMIT = 500_000

PURPOSE_VALUES = {
    "school",
    "work",
    "personal",
    "unknown",
}

SCHOOL_WORDS = {
    "assignment",
    "chapter",
    "class",
    "course",
    "exam",
    "homework",
    "lecture",
    "lesson",
    "quiz",
    "school",
    "student",
    "study",
    "textbook",
    "university",
    "college",
}

WORK_WORDS = {
    "agenda",
    "business",
    "client",
    "company",
    "contract",
    "employee",
    "invoice",
    "job",
    "meeting",
    "office",
    "project",
    "proposal",
    "report",
    "resume",
    "résumé",
    "work",
}

PERSONAL_WORDS = {
    "birthday",
    "budget",
    "family",
    "grocery",
    "holiday",
    "personal",
    "photo",
    "receipt",
    "shopping",
    "travel",
    "vacation",
}


def clean_text(value: Any, limit: int = 600) -> str:
    cleaned = re.sub(
        r"\s+",
        " ",
        str(value or ""),
    ).strip()

    return cleaned[:limit]


def parse_json_object(value: str) -> dict[str, Any]:
    raw = (value or "").strip()

    if raw.startswith("```"):
        raw = re.sub(
            r"^```(?:json)?\s*",
            "",
            raw,
            flags=re.IGNORECASE,
        )
        raw = re.sub(r"\s*```$", "", raw)

    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")

        if start == -1 or end <= start:
            return {}

        try:
            parsed = json.loads(raw[start : end + 1])
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}


def filename_topic(filename: str) -> str:
    stem = Path(filename or "General").stem
    cleaned = re.sub(r"[_\-]+", " ", stem)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    generic = {
        "copy",
        "document",
        "file",
        "final",
        "image",
        "img",
        "material",
        "photo",
        "scan",
        "screenshot",
        "upload",
    }

    words = [
        word
        for word in cleaned.split()
        if word.lower() not in generic
    ]

    topic = " ".join(words[:6]).strip()

    return topic[:100] or "General"


def heuristic_result(
    material: StudyMaterial,
    extracted_text: str,
) -> dict[str, Any]:
    combined = (
        f"{material.original_filename} "
        f"{extracted_text[:8000]}"
    ).lower()

    school_score = sum(
        word in combined
        for word in SCHOOL_WORDS
    )
    work_score = sum(
        word in combined
        for word in WORK_WORDS
    )
    personal_score = sum(
        word in combined
        for word in PERSONAL_WORDS
    )

    scores = {
        "school": school_score,
        "work": work_score,
        "personal": personal_score,
    }

    purpose = max(scores, key=scores.get)

    if scores[purpose] == 0:
        purpose = "unknown"

    category = "document"

    category_rules = [
        ("assignment", {"assignment", "homework"}),
        ("study notes", {"lecture", "notes", "chapter"}),
        ("presentation", {"slides", "presentation", "powerpoint"}),
        ("spreadsheet", {"spreadsheet", "worksheet", "excel"}),
        ("résumé", {"resume", "résumé", "curriculum vitae"}),
        ("receipt", {"receipt", "subtotal", "tax", "total"}),
        ("invoice", {"invoice", "amount due"}),
        ("timetable", {"schedule", "timetable"}),
        ("natural photo", {"photo", "camera", "portrait"}),
    ]

    for label, keywords in category_rules:
        if any(keyword in combined for keyword in keywords):
            category = label
            break

    if material.material_type == "image" and category == "document":
        category = "image"

    readable = clean_text(extracted_text, 450)

    if readable:
        summary = readable
    else:
        summary = (
            f"StudySnap identified this as a "
            f"{material.material_type or 'file'} file. "
            "More content details were not available."
        )

    confidence = 65 if scores.get(purpose, 0) >= 2 else 40

    return {
        "purpose_category": purpose,
        "content_category": category,
        "detected_topic": filename_topic(
            material.original_filename
        ),
        "intelligence_summary": summary,
        "classification_confidence": confidence,
        "extracted_text": extracted_text,
    }


def xml_text_from_archive(
    file_path: Path,
    prefixes: tuple[str, ...],
) -> str:
    pieces: list[str] = []

    with zipfile.ZipFile(file_path) as archive:
        names = sorted(
            name
            for name in archive.namelist()
            if name.startswith(prefixes)
            and name.endswith(".xml")
        )

        for name in names[:100]:
            try:
                root = ElementTree.fromstring(
                    archive.read(name)
                )
            except Exception:
                continue

            for element in root.iter():
                local_name = element.tag.rsplit(
                    "}",
                    1,
                )[-1]

                if (
                    local_name in {"t", "v"}
                    and element.text
                ):
                    pieces.append(element.text.strip())

                    if sum(map(len, pieces)) >= TEXT_LIMIT:
                        break

            if sum(map(len, pieces)) >= TEXT_LIMIT:
                break

    return clean_text(
        " ".join(pieces),
        TEXT_LIMIT,
    )


def extract_material_text(
    material: StudyMaterial,
) -> str:
    existing = (
        material.extracted_text or ""
    ).strip()

    if existing:
        return existing[:EXTRACTED_TEXT_LIMIT]

    file_path = Path(material.file_path)

    if not file_path.is_file():
        return ""

    suffix = file_path.suffix.lower()

    if (
        material.material_type == "pdf"
        or suffix == ".pdf"
    ):
        try:
            reader = PdfReader(str(file_path))
            pages = [
                page.extract_text() or ""
                for page in reader.pages[:25]
            ]
            return "\n\n".join(
                pages
            ).strip()[:EXTRACTED_TEXT_LIMIT]
        except Exception:
            return ""

    if material.material_type in {"text", "code"}:
        try:
            return file_path.read_text(
                encoding="utf-8",
                errors="replace",
            )[:EXTRACTED_TEXT_LIMIT]
        except Exception:
            return ""

    if suffix == ".docx":
        return xml_text_from_archive(
            file_path,
            ("word/",),
        )

    if suffix == ".pptx":
        return xml_text_from_archive(
            file_path,
            ("ppt/slides/",),
        )

    if suffix == ".xlsx":
        return xml_text_from_archive(
            file_path,
            (
                "xl/sharedStrings",
                "xl/worksheets/",
            ),
        )

    return ""


def normalize_result(
    data: dict[str, Any],
    fallback: dict[str, Any],
) -> dict[str, Any]:
    purpose = clean_text(
        data.get("purpose_category"),
        30,
    ).lower()

    purpose_aliases = {
        "academic": "school",
        "education": "school",
        "educational": "school",
        "professional": "work",
        "private": "personal",
    }

    purpose = purpose_aliases.get(
        purpose,
        purpose,
    )

    if purpose not in PURPOSE_VALUES:
        purpose = fallback["purpose_category"]

    confidence_value = data.get(
        "classification_confidence",
        fallback["classification_confidence"],
    )

    try:
        confidence = int(float(confidence_value))
    except Exception:
        confidence = fallback[
            "classification_confidence"
        ]

    confidence = max(0, min(confidence, 100))

    return {
        "purpose_category": purpose,
        "content_category": (
            clean_text(
                data.get("content_category"),
                80,
            )
            or fallback["content_category"]
        ),
        "detected_topic": (
            clean_text(
                data.get("detected_topic"),
                120,
            )
            or fallback["detected_topic"]
        ),
        "intelligence_summary": (
            clean_text(
                data.get("intelligence_summary"),
                700,
            )
            or fallback["intelligence_summary"]
        ),
        "classification_confidence": confidence,
        "extracted_text": clean_text(
            data.get("extracted_text"),
            20_000,
        ),
    }


def openai_client() -> OpenAI | None:
    if not settings.openai_api_key:
        return None

    return OpenAI(
        api_key=settings.openai_api_key,
        timeout=60.0,
    )


def analyze_text_with_ai(
    material: StudyMaterial,
    extracted_text: str,
    fallback: dict[str, Any],
) -> dict[str, Any]:
    client = openai_client()

    if client is None or not extracted_text.strip():
        return fallback

    prompt = f"""
Classify this uploaded file for StudySnap.

Return only valid JSON with these fields:
purpose_category: school, work, personal, or unknown
content_category: a short category such as assignment, study notes,
lecture, résumé, invoice, receipt, timetable, presentation,
spreadsheet, report, personal document, or general document
detected_topic: the main subject or topic
intelligence_summary: one clear sentence describing the file
classification_confidence: integer from 0 to 100

Do not assume every file is school material.
Use the contents, filename, and file type together.

Filename:
{material.original_filename}

Detected file type:
{material.material_type}

Readable contents:
{extracted_text[:TEXT_LIMIT]}
""".strip()

    model = (
        os.getenv("STUDYSNAP_MATERIAL_MODEL")
        or os.getenv("OPENAI_MODEL")
        or "gpt-4.1-mini"
    )

    response = client.chat.completions.create(
        model=model,
        response_format={
            "type": "json_object",
        },
        temperature=0.1,
        max_tokens=500,
        messages=[
            {
                "role": "system",
                "content": (
                    "You classify uploaded files accurately. "
                    "Never treat filenames as enough evidence "
                    "when readable contents are available."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    )

    output = (
        response.choices[0].message.content
        if response.choices
        else ""
    ) or ""

    return normalize_result(
        parse_json_object(output),
        fallback,
    )


def prepare_image_data_url(
    file_path: Path,
) -> str:
    try:
        from pillow_heif import register_heif_opener

        register_heif_opener()
    except Exception:
        pass

    with Image.open(file_path) as image:
        image.seek(0)
        image = image.convert("RGB")
        image.thumbnail((1800, 1800))

        buffer = io.BytesIO()
        image.save(
            buffer,
            format="JPEG",
            quality=88,
            optimize=True,
        )

    encoded = base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")

    return f"data:image/jpeg;base64,{encoded}"


def analyze_image_with_ai(
    material: StudyMaterial,
    fallback: dict[str, Any],
) -> dict[str, Any]:
    client = openai_client()

    if client is None:
        return fallback

    image_url = prepare_image_data_url(
        Path(material.file_path)
    )

    prompt = """
Analyze this uploaded image for StudySnap.

Determine whether it is:
- a natural or personal photograph
- school or study material
- work material
- a screenshot
- handwritten notes
- an assignment
- a textbook or document page
- a receipt, form, résumé, timetable, or other content

Return only valid JSON with:
purpose_category: school, work, personal, or unknown
content_category: short precise label
detected_topic: main topic, subject, or scene
intelligence_summary: one clear sentence describing the image
classification_confidence: integer from 0 to 100
extracted_text: important readable text visible in the image

Do not call a natural photograph study material unless the image
actually contains educational content.
""".strip()

    model = (
        os.getenv("OPENAI_VISION_MODEL")
        or "gpt-4o-mini"
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
                    {
                        "type": "input_image",
                        "image_url": image_url,
                        "detail": "auto",
                    },
                ],
            }
        ],
    )

    output = getattr(
        response,
        "output_text",
        "",
    ) or ""

    return normalize_result(
        parse_json_object(output),
        fallback,
    )


def analyze_material(
    db: Session,
    material: StudyMaterial,
) -> StudyMaterial:
    material.intelligence_status = "processing"
    material.intelligence_error = None

    db.commit()
    db.refresh(material)

    extracted_text = extract_material_text(
        material
    )

    fallback = heuristic_result(
        material,
        extracted_text,
    )

    try:
        if material.material_type == "quarantined":
            raise ValueError(
                "Quarantined files are not analyzed."
            )

        if material.material_type == "image":
            result = analyze_image_with_ai(
                material,
                fallback,
            )
        else:
            result = analyze_text_with_ai(
                material,
                extracted_text,
                fallback,
            )

        material.purpose_category = result[
            "purpose_category"
        ]
        material.content_category = result[
            "content_category"
        ]
        material.detected_topic = result[
            "detected_topic"
        ]
        material.intelligence_summary = result[
            "intelligence_summary"
        ]
        material.classification_confidence = result[
            "classification_confidence"
        ]

        readable_text = (
            result.get("extracted_text")
            or extracted_text
        ).strip()

        if readable_text:
            material.extracted_text = (
                readable_text[
                    :EXTRACTED_TEXT_LIMIT
                ]
            )

        material.intelligence_status = "ready"
        material.analyzed_at = datetime.now(
            timezone.utc
        )

        db.commit()
        db.refresh(material)

        return material

    except Exception as exc:
        material.purpose_category = fallback[
            "purpose_category"
        ]
        material.content_category = fallback[
            "content_category"
        ]
        material.detected_topic = fallback[
            "detected_topic"
        ]
        material.intelligence_summary = fallback[
            "intelligence_summary"
        ]
        material.classification_confidence = fallback[
            "classification_confidence"
        ]
        material.intelligence_status = "ready"
        material.intelligence_error = clean_text(
            exc,
            500,
        )
        material.analyzed_at = datetime.now(
            timezone.utc
        )

        db.commit()
        db.refresh(material)

        return material
