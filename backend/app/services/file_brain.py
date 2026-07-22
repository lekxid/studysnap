from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.file_brain import (
    FileBrainBatch,
    FileBrainItem,
)
from app.models.study_material import StudyMaterial
from app.models.study_room import StudyRoom


MAX_FILE_BRAIN_ITEMS = 100

COMPLETED_ITEM_STATUSES = {
    "stored",
    "organized",
    "duplicate",
}

ACTIVE_ITEM_STATUSES = {
    "uploading",
    "stored",
    "analyzing",
    "awaiting_confirmation",
    "destination_confirmed",
}


class FileBrainLimitError(ValueError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_sha256(value: str) -> str:
    clean = (value or "").strip().lower()

    if not re.fullmatch(
        r"[0-9a-f]{64}",
        clean,
    ):
        raise ValueError(
            "SHA-256 must contain exactly "
            "64 hexadecimal characters."
        )

    return clean


def create_batch(
    *,
    db: Session,
    owner_id: int,
    title: str = "File upload",
    source_surface: str = "general_ai",
) -> FileBrainBatch:
    clean_title = (
        title.strip()[:160]
        or "File upload"
    )

    clean_surface = (
        source_surface.strip()[:64]
        or "general_ai"
    )

    batch = FileBrainBatch(
        owner_id=owner_id,
        title=clean_title,
        source_surface=clean_surface,
        status="draft",
        total_items=0,
        duplicate_items=0,
        completed_items=0,
        failed_items=0,
        updated_at=utc_now(),
    )

    db.add(batch)
    db.flush()

    return batch


def add_batch_item(
    *,
    db: Session,
    batch: FileBrainBatch,
    filename: str,
    content_type: str,
    file_size: int,
    sha256: str | None = None,
) -> FileBrainItem:
    if batch.total_items >= MAX_FILE_BRAIN_ITEMS:
        raise FileBrainLimitError(
            "A File Brain batch can contain "
            "up to 100 files."
        )

    clean_filename = (
        filename.strip()[:255]
        or "uploaded-file"
    )

    clean_content_type = (
        content_type.strip()[:255]
        or "application/octet-stream"
    )

    if file_size < 0:
        raise ValueError(
            "File size cannot be negative."
        )

    clean_hash = (
        normalize_sha256(sha256)
        if sha256
        else None
    )

    item = FileBrainItem(
        batch_id=batch.id,
        owner_id=batch.owner_id,
        item_order=batch.total_items,
        original_filename=clean_filename,
        content_type=clean_content_type,
        file_size=file_size,
        sha256=clean_hash,
        status="queued",
    )

    batch.total_items += 1
    batch.status = "queued"
    batch.updated_at = utc_now()

    db.add(item)
    db.add(batch)
    db.flush()

    return item


def find_exact_duplicate(
    *,
    db: Session,
    owner_id: int,
    sha256: str,
    exclude_material_id: int | None = None,
) -> StudyMaterial | None:
    clean_hash = normalize_sha256(
        sha256
    )

    query = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.owner_id
            == owner_id,
            StudyMaterial.sha256
            == clean_hash,
        )
    )

    if exclude_material_id is not None:
        query = query.filter(
            StudyMaterial.id
            != exclude_material_id
        )

    return (
        query
        .order_by(
            StudyMaterial.id.asc()
        )
        .first()
    )


def register_material_hash(
    *,
    db: Session,
    material: StudyMaterial,
    sha256: str,
) -> StudyMaterial | None:
    clean_hash = normalize_sha256(
        sha256
    )

    duplicate = find_exact_duplicate(
        db=db,
        owner_id=material.owner_id,
        sha256=clean_hash,
        exclude_material_id=material.id,
    )

    material.sha256 = clean_hash

    db.add(material)
    db.flush()

    return duplicate


def mark_exact_duplicate(
    *,
    db: Session,
    item: FileBrainItem,
    duplicate_material: StudyMaterial,
) -> None:
    if (
        item.owner_id
        != duplicate_material.owner_id
    ):
        raise ValueError(
            "A duplicate must belong to "
            "the same owner."
        )

    item.status = "duplicate"
    item.duplicate_kind = "exact"
    item.duplicate_material_id = (
        duplicate_material.id
    )
    item.current_location_type = (
        "study_material"
    )
    item.current_location_id = (
        duplicate_material.id
    )
    item.result_message = (
        "Exact duplicate found. "
        "The existing StudySnap file "
        "was preserved."
    )
    item.error_message = None
    item.updated_at = utc_now()

    db.add(item)
    db.flush()


def set_room_suggestion(
    *,
    db: Session,
    item: FileBrainItem,
    topic: str,
    confidence: int,
    reason: str,
    room: StudyRoom | None,
) -> None:
    item.suggested_topic = (
        topic.strip()[:160]
        or None
    )

    item.suggestion_confidence = max(
        0,
        min(100, int(confidence)),
    )

    item.suggestion_reason = (
        reason.strip()
        or None
    )

    item.suggested_room_id = (
        room.id
        if room is not None
        else None
    )

    if item.status not in {
        "duplicate",
        "failed",
        "cancelled",
    }:
        item.status = (
            "awaiting_confirmation"
        )

    item.updated_at = utc_now()

    db.add(item)
    db.flush()


def confirm_destination(
    *,
    db: Session,
    item: FileBrainItem,
    room: StudyRoom,
) -> None:
    if room.owner_id != item.owner_id:
        raise ValueError(
            "The destination room must "
            "belong to the same owner."
        )

    item.confirmed_room_id = room.id

    if item.status not in {
        "duplicate",
        "failed",
        "cancelled",
    }:
        item.status = (
            "destination_confirmed"
        )

    item.updated_at = utc_now()

    db.add(item)
    db.flush()


def mark_item_organized(
    *,
    db: Session,
    item: FileBrainItem,
    material: StudyMaterial,
) -> None:
    if material.owner_id != item.owner_id:
        raise ValueError(
            "The material and File Brain item "
            "must belong to the same owner."
        )

    item.material_id = material.id
    item.confirmed_room_id = (
        material.study_room_id
    )
    item.current_location_type = (
        "study_room"
    )
    item.current_location_id = (
        material.study_room_id
    )
    item.status = "organized"
    item.result_message = (
        "File organized successfully."
    )
    item.error_message = None
    item.updated_at = utc_now()

    db.add(item)
    db.flush()


def mark_item_failed(
    *,
    db: Session,
    item: FileBrainItem,
    message: str,
) -> None:
    item.status = "failed"
    item.error_message = (
        message.strip()
        or "File processing failed."
    )
    item.updated_at = utc_now()

    db.add(item)
    db.flush()


def refresh_batch_counts(
    *,
    db: Session,
    batch: FileBrainBatch,
) -> FileBrainBatch:
    preserved_cancelled_state = (
        batch.status == "cancelled"
    )

    db.flush()

    items = (
        db.query(FileBrainItem)
        .filter(
            FileBrainItem.batch_id
            == batch.id
        )
        .order_by(
            FileBrainItem.item_order.asc()
        )
        .all()
    )

    batch.total_items = len(items)

    batch.duplicate_items = sum(
        item.status == "duplicate"
        for item in items
    )

    batch.completed_items = sum(
        item.status
        in COMPLETED_ITEM_STATUSES
        for item in items
    )

    batch.failed_items = sum(
        item.status == "failed"
        for item in items
    )

    terminal_count = (
        batch.completed_items
        + batch.failed_items
        + sum(
            item.status == "cancelled"
            for item in items
        )
    )

    if preserved_cancelled_state:
        batch.status = "cancelled"
    elif not items:
        batch.status = "draft"
    elif terminal_count == len(items):
        batch.status = (
            "completed_with_errors"
            if batch.failed_items
            else "completed"
        )
    elif any(
        item.status
        in ACTIVE_ITEM_STATUSES
        for item in items
    ):
        batch.status = "processing"
    else:
        batch.status = "queued"

    batch.updated_at = utc_now()

    db.add(batch)
    db.flush()

    return batch

def mark_item_cancelled(
    *,
    db: Session,
    item: FileBrainItem,
) -> None:
    if item.status in {
        "organized",
        "duplicate",
    }:
        raise ValueError(
            "Completed File Brain items "
            "cannot be cancelled."
        )

    if item.status == "cancelled":
        return

    item.status = "cancelled"
    item.result_message = (
        "Cancelled by the user."
    )
    item.error_message = None
    item.updated_at = utc_now()

    db.add(item)
    db.flush()


def cancel_batch(
    *,
    db: Session,
    batch: FileBrainBatch,
) -> FileBrainBatch:
    items = (
        db.query(FileBrainItem)
        .filter(
            FileBrainItem.batch_id
            == batch.id
        )
        .order_by(
            FileBrainItem.item_order.asc()
        )
        .all()
    )

    for item in items:
        if item.status in {
            "organized",
            "duplicate",
            "cancelled",
        }:
            continue

        item.status = "cancelled"
        item.result_message = (
            "Cancelled with the batch."
        )
        item.error_message = None
        item.updated_at = utc_now()

        db.add(item)

    refresh_batch_counts(
        db=db,
        batch=batch,
    )

    batch.status = "cancelled"
    batch.updated_at = utc_now()

    db.add(batch)
    db.flush()

    return batch
