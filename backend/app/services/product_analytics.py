from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models.product_event import ProductEvent


ALLOWED_CLIENT_EVENTS = {
    "page_view",
    "room_created",
    "room_updated",
    "room_deleted",
    "note_created",
    "note_updated",
    "note_deleted",
    "flashcard_created",
    "flashcard_deleted",
    "quiz_created",
    "quiz_deleted",
    "planner_created",
    "planner_updated",
    "planner_deleted",
    "ai_used",
    "ai_image_generated",
    "ai_image_edited",
    "ai_file_question",
    "file_uploaded",
    "file_deleted",
    "artifact_created",
    "artifact_deleted",
    "smart_scan_created",
    "smart_scan_used",
    "smart_scan_deleted",
    "study_together_message",
    "learning_event_recorded",
    "profile_updated",
    "settings_updated",
    "central_action_executed",
}

SENSITIVE_KEY_PARTS = {
    "answer",
    "content",
    "email",
    "filename",
    "full_name",
    "image",
    "ip",
    "message",
    "name",
    "password",
    "path",
    "prompt",
    "question",
    "text",
    "token",
    "url",
}

SAFE_NAME_PATTERN = re.compile(
    r"^[a-z][a-z0-9_]{1,79}$"
)

SAFE_LABEL_PATTERN = re.compile(
    r"[^a-zA-Z0-9_:/.\-]+"
)


def platform_admin_emails() -> set[str]:
    return {
        value.strip().lower()
        for value in (
            settings.STUDYSNAP_ADMIN_EMAILS
            or ""
        ).split(",")
        if value.strip()
    }


def is_platform_admin_email(
    email: str | None,
) -> bool:
    normalized = (
        email or ""
    ).strip().lower()

    return bool(
        normalized
        and normalized
        in platform_admin_emails()
    )


def clean_event_name(
    value: str,
) -> str:
    cleaned = value.strip().lower()

    if (
        cleaned not in ALLOWED_CLIENT_EVENTS
        or not SAFE_NAME_PATTERN.fullmatch(
            cleaned
        )
    ):
        raise ValueError(
            "Unsupported analytics event."
        )

    return cleaned


def clean_label(
    value: str | None,
    *,
    fallback: str | None = None,
    limit: int = 120,
) -> str | None:
    cleaned = SAFE_LABEL_PATTERN.sub(
        "_",
        (value or "").strip(),
    ).strip("._:/-")

    if not cleaned:
        return fallback

    return cleaned[:limit]


def clean_surface(
    value: str | None,
) -> str | None:
    cleaned = (value or "").split(
        "?",
        1,
    )[0].strip()

    if not cleaned:
        return None

    cleaned = re.sub(
        r"/\d+(?=/|$)",
        "/:id",
        cleaned,
    )

    return clean_label(
        cleaned,
        limit=120,
    )


def sanitize_metadata(
    value: dict[str, Any] | None,
) -> dict[str, Any]:
    safe: dict[str, Any] = {}

    for raw_key, raw_value in (
        value or {}
    ).items():
        if len(safe) >= 20:
            break

        key = clean_label(
            str(raw_key),
            limit=48,
        )

        if not key:
            continue

        lowered = key.lower()

        if any(
            part in lowered
            for part in SENSITIVE_KEY_PARTS
        ):
            continue

        if isinstance(
            raw_value,
            bool,
        ):
            safe[key] = raw_value
            continue

        if isinstance(
            raw_value,
            int,
        ):
            safe[key] = max(
                -1_000_000_000,
                min(
                    raw_value,
                    1_000_000_000,
                ),
            )
            continue

        if isinstance(
            raw_value,
            float,
        ):
            safe[key] = round(
                max(
                    -1_000_000_000.0,
                    min(
                        raw_value,
                        1_000_000_000.0,
                    ),
                ),
                4,
            )
            continue

        if isinstance(
            raw_value,
            str,
        ):
            safe_value = clean_label(
                raw_value,
                limit=120,
            )

            if safe_value:
                safe[key] = safe_value

    return safe


def record_product_event(
    *,
    db: Session,
    user_id: int,
    event_name: str,
    category: str,
    source: str = "web",
    surface: str | None = None,
    room_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    quantity: int = 1,
    bytes_count: int = 0,
    metadata: dict[str, Any] | None = None,
) -> ProductEvent:
    event = ProductEvent(
        user_id=user_id,
        room_id=room_id,
        event_name=clean_event_name(
            event_name
        ),
        category=(
            clean_label(
                category,
                fallback="other",
                limit=40,
            )
            or "other"
        ),
        source=(
            clean_label(
                source,
                fallback="web",
                limit=40,
            )
            or "web"
        ),
        surface=clean_surface(
            surface
        ),
        entity_type=clean_label(
            entity_type,
            limit=40,
        ),
        entity_id=(
            entity_id
            if isinstance(
                entity_id,
                int,
            )
            and entity_id > 0
            else None
        ),
        quantity=max(
            1,
            min(
                int(quantity or 1),
                1000,
            ),
        ),
        bytes_count=max(
            0,
            min(
                int(bytes_count or 0),
                10 * 1024 * 1024 * 1024,
            ),
        ),
        metadata_json=json.dumps(
            sanitize_metadata(
                metadata
            ),
            separators=(",", ":"),
            sort_keys=True,
        ),
    )

    db.add(event)
    db.flush()

    return event
