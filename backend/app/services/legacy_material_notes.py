from __future__ import annotations

import re
from typing import Any


LEGACY_TITLE_PATTERN = re.compile(
    r"^Uploaded "
    r"(image|word|slides|spreadsheet|file|office|audio|video|archive)"
    r":",
    flags=re.IGNORECASE,
)


def is_legacy_material_note(
    note_or_title: Any,
    content: str | None = None,
) -> bool:
    if content is None and hasattr(
        note_or_title,
        "title",
    ):
        title = str(
            getattr(note_or_title, "title", "")
            or ""
        )
        body = str(
            getattr(note_or_title, "content", "")
            or ""
        )
    else:
        title = str(note_or_title or "")
        body = str(content or "")

    normalized_title = title.strip()
    normalized_body = body.strip()

    return bool(
        LEGACY_TITLE_PATTERN.match(
            normalized_title
        )
        and normalized_body.startswith(
            "StudySnap saved this "
        )
        and " inside this room." in normalized_body
        and "File name:" in normalized_body
        and "File type:" in normalized_body
        and "Next upgrade:" in normalized_body
    )
