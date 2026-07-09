from __future__ import annotations

import re
from datetime import datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


FONT_NAME = "Helvetica"
BOLD_FONT_NAME = "Helvetica-Bold"


def _register_font() -> None:
    global FONT_NAME, BOLD_FONT_NAME

    regular_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    bold_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")

    try:
        if regular_path.exists():
            pdfmetrics.registerFont(TTFont("StudySnapSans", str(regular_path)))
            FONT_NAME = "StudySnapSans"

        if bold_path.exists():
            pdfmetrics.registerFont(TTFont("StudySnapSans-Bold", str(bold_path)))
            BOLD_FONT_NAME = "StudySnapSans-Bold"
    except Exception:
        FONT_NAME = "Helvetica"
        BOLD_FONT_NAME = "Helvetica-Bold"


def safe_pdf_filename(value: str, fallback: str = "studysnap-export") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", value or "").strip("-").lower()
    cleaned = cleaned[:80].strip("-")
    return f"{cleaned or fallback}.pdf"


def _clean_pdf_text(value: str) -> str:
    text = value or ""

    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2022": "-",
        "\u00a0": " ",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    return text.strip()


def _add_text_blocks(
    story: list,
    text: str,
    body_style: ParagraphStyle,
    heading_style: ParagraphStyle,
) -> None:
    cleaned = _clean_pdf_text(text)

    if not cleaned:
        story.append(Paragraph("No content.", body_style))
        return

    for raw_line in cleaned.splitlines():
        line = raw_line.strip()

        if not line:
            story.append(Spacer(1, 0.08 * inch))
            continue

        is_heading = False

        if line.startswith("#"):
            line = line.lstrip("#").strip()
            is_heading = True
        elif len(line) < 80 and line.endswith(":"):
            is_heading = True

        line = escape(line)
        line = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", line)
        line = re.sub(r"`([^`]+)`", r"<font color='#0891b2'>\1</font>", line)

        if is_heading:
            story.append(Paragraph(line, heading_style))
        else:
            story.append(Paragraph(line, body_style))

        story.append(Spacer(1, 0.07 * inch))


def build_studysnap_pdf_bytes(
    title: str,
    content: str,
    subtitle: str | None = None,
) -> bytes:
    _register_font()

    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.72 * inch,
        leftMargin=0.72 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.72 * inch,
        title=title or "StudySnap Export",
        author="StudySnap",
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "StudySnapTitle",
        parent=styles["Title"],
        fontName=BOLD_FONT_NAME,
        fontSize=22,
        leading=28,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=10,
    )

    subtitle_style = ParagraphStyle(
        "StudySnapSubtitle",
        parent=styles["Normal"],
        fontName=FONT_NAME,
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=16,
    )

    heading_style = ParagraphStyle(
        "StudySnapHeading",
        parent=styles["Heading2"],
        fontName=BOLD_FONT_NAME,
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=8,
        spaceAfter=6,
    )

    body_style = ParagraphStyle(
        "StudySnapBody",
        parent=styles["BodyText"],
        fontName=FONT_NAME,
        fontSize=11,
        leading=17,
        textColor=colors.HexColor("#111827"),
    )

    footer_style = ParagraphStyle(
        "StudySnapFooter",
        parent=styles["Normal"],
        fontName=FONT_NAME,
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#94a3b8"),
        spaceBefore=18,
    )

    exported_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    story = [
        Paragraph(escape(title or "StudySnap Export"), title_style),
        Paragraph(
            escape(subtitle or f"Exported from StudySnap on {exported_at}"),
            subtitle_style,
        ),
    ]

    _add_text_blocks(story, content, body_style, heading_style)

    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("Generated by StudySnap AI Learning Companion", footer_style))

    doc.build(story)

    return buffer.getvalue()


def build_note_pdf_bytes(
    title: str,
    content: str,
    room_name: str | None = None,
    subject: str | None = None,
) -> bytes:
    details = []

    if room_name:
        details.append(f"Room: {room_name}")

    if subject:
        details.append(f"Subject: {subject}")

    exported_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    details.append(f"Exported from StudySnap on {exported_at}")

    return build_studysnap_pdf_bytes(
        title=title or "StudySnap Note",
        content=content or "",
        subtitle=" • ".join(details),
    )
