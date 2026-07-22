from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.file_brain import (
    FileBrainBatch,
    FileBrainItem,
)
from app.models.study_material import (
    StudyMaterial,
)
from app.models.study_room import StudyRoom
from app.models.user import User
from app.services.file_brain import (
    MAX_FILE_BRAIN_ITEMS,
    FileBrainLimitError,
    add_batch_item,
    cancel_batch,
    confirm_destination,
    create_batch,
    find_exact_duplicate,
    mark_exact_duplicate,
    mark_item_cancelled,
    normalize_sha256,
    refresh_batch_counts,
    set_room_suggestion,
    utc_now,
)
from app.utils.deps import get_current_user


router = APIRouter(
    tags=["File Brain"],
)


class FileBrainItemInput(BaseModel):
    filename: str = Field(
        min_length=1,
        max_length=255,
    )

    content_type: str = Field(
        default="application/octet-stream",
        max_length=255,
    )

    file_size: int = Field(
        ge=0,
    )

    sha256: str | None = Field(
        default=None,
        min_length=64,
        max_length=64,
    )


class CreateFileBrainBatchRequest(
    BaseModel
):
    title: str = Field(
        default="File upload",
        max_length=160,
    )

    source_surface: str = Field(
        default="general_ai",
        max_length=64,
    )

    items: list[
        FileBrainItemInput
    ] = Field(
        default_factory=list,
    )


class RegisterFileBrainItemsRequest(
    BaseModel
):
    items: list[
        FileBrainItemInput
    ] = Field(
        default_factory=list,
    )


class FileBrainHashRequest(BaseModel):
    sha256: str = Field(
        min_length=64,
        max_length=64,
    )


class FileBrainSuggestionRequest(
    BaseModel
):
    topic: str = Field(
        min_length=1,
        max_length=160,
    )

    confidence: int = Field(
        ge=0,
        le=100,
    )

    reason: str = Field(
        default="",
        max_length=2000,
    )

    suggested_room_id: int | None = (
        Field(
            default=None,
            gt=0,
        )
    )


class ConfirmFileBrainDestinationRequest(
    BaseModel
):
    room_id: int = Field(
        gt=0,
    )


def get_batch_or_404(
    *,
    db: Session,
    batch_id: int,
    owner_id: int,
) -> FileBrainBatch:
    batch = (
        db.query(FileBrainBatch)
        .filter(
            FileBrainBatch.id
            == batch_id,
            FileBrainBatch.owner_id
            == owner_id,
        )
        .first()
    )

    if batch is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "File Brain batch not found."
            ),
        )

    return batch


def get_item_or_404(
    *,
    db: Session,
    item_id: int,
    owner_id: int,
) -> FileBrainItem:
    item = (
        db.query(FileBrainItem)
        .filter(
            FileBrainItem.id
            == item_id,
            FileBrainItem.owner_id
            == owner_id,
        )
        .first()
    )

    if item is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "File Brain item not found."
            ),
        )

    return item


def get_owned_room_or_404(
    *,
    db: Session,
    room_id: int,
    owner_id: int,
) -> StudyRoom:
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == room_id,
            StudyRoom.owner_id
            == owner_id,
        )
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Destination room not found."
            ),
        )

    return room


def room_brief(
    room: StudyRoom | None,
) -> dict | None:
    if room is None:
        return None

    return {
        "id": room.id,
        "name": room.name,
        "subject": room.subject,
    }


def material_brief(
    material: StudyMaterial | None,
) -> dict | None:
    if material is None:
        return None

    return {
        "id": material.id,
        "filename": (
            material.original_filename
        ),
        "study_room_id": (
            material.study_room_id
        ),
        "sha256": material.sha256,
        "material_type": (
            material.material_type
        ),
    }


def serialize_item(
    *,
    db: Session,
    item: FileBrainItem,
) -> dict:
    suggested_room = None
    confirmed_room = None
    duplicate_material = None
    material = None

    if item.suggested_room_id:
        suggested_room = (
            db.query(StudyRoom)
            .filter(
                StudyRoom.id
                == item.suggested_room_id
            )
            .first()
        )

    if item.confirmed_room_id:
        confirmed_room = (
            db.query(StudyRoom)
            .filter(
                StudyRoom.id
                == item.confirmed_room_id
            )
            .first()
        )

    if item.duplicate_material_id:
        duplicate_material = (
            db.query(StudyMaterial)
            .filter(
                StudyMaterial.id
                == item.duplicate_material_id
            )
            .first()
        )

    if item.material_id:
        material = (
            db.query(StudyMaterial)
            .filter(
                StudyMaterial.id
                == item.material_id
            )
            .first()
        )

    return {
        "id": item.id,
        "batch_id": item.batch_id,
        "item_order": item.item_order,
        "filename": (
            item.original_filename
        ),
        "content_type": item.content_type,
        "file_size": item.file_size,
        "sha256": item.sha256,
        "duplicate_item_id": (
            item.duplicate_item_id
        ),
        "upload": {
            "id": item.upload_id,
            "state": (
                item.upload_state
            ),
            "uploaded_bytes": (
                item.uploaded_bytes
            ),
            "total_chunks": (
                item.total_chunks
            ),
            "uploaded_chunks": (
                item.uploaded_chunks
            ),
            "progress_percent": (
                item.progress_percent
            ),
            "attempts": (
                item.upload_attempts
            ),
            "started_at": (
                item.upload_started_at
            ),
            "completed_at": (
                item.upload_completed_at
            ),
            "staging_available": (
                bool(item.staging_path)
            ),
        },
        "status": item.status,
        "duplicate_kind": (
            item.duplicate_kind
        ),
        "duplicate_material_id": (
            item.duplicate_material_id
        ),
        "duplicate_material": (
            material_brief(
                duplicate_material
            )
        ),
        "suggested_topic": (
            item.suggested_topic
        ),
        "suggestion_confidence": (
            item.suggestion_confidence
        ),
        "suggestion_reason": (
            item.suggestion_reason
        ),
        "suggested_room_id": (
            item.suggested_room_id
        ),
        "suggested_room": (
            room_brief(
                suggested_room
            )
        ),
        "confirmed_room_id": (
            item.confirmed_room_id
        ),
        "confirmed_room": (
            room_brief(
                confirmed_room
            )
        ),
        "material_id": item.material_id,
        "material": material_brief(
            material
        ),
        "current_location": {
            "type": (
                item.current_location_type
            ),
            "id": (
                item.current_location_id
            ),
        },
        "result_message": (
            item.result_message
        ),
        "error_message": (
            item.error_message
        ),
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def serialize_batch(
    *,
    db: Session,
    batch: FileBrainBatch,
    include_items: bool,
) -> dict:
    payload = {
        "id": batch.id,
        "title": batch.title,
        "source_surface": (
            batch.source_surface
        ),
        "status": batch.status,
        "total_items": batch.total_items,
        "duplicate_items": (
            batch.duplicate_items
        ),
        "completed_items": (
            batch.completed_items
        ),
        "failed_items": (
            batch.failed_items
        ),
        "created_at": batch.created_at,
        "updated_at": batch.updated_at,
    }

    if include_items:
        items = (
            db.query(FileBrainItem)
            .filter(
                FileBrainItem.batch_id
                == batch.id
            )
            .order_by(
                FileBrainItem
                .item_order
                .asc()
            )
            .all()
        )

        payload["items"] = [
            serialize_item(
                db=db,
                item=item,
            )
            for item in items
        ]

    return payload


def apply_exact_duplicate_check(
    *,
    db: Session,
    item: FileBrainItem,
) -> StudyMaterial | None:
    if not item.sha256:
        raise HTTPException(
            status_code=409,
            detail=(
                "This item does not have "
                "a SHA-256 hash yet."
            ),
        )

    duplicate = find_exact_duplicate(
        db=db,
        owner_id=item.owner_id,
        sha256=item.sha256,
        exclude_material_id=(
            item.material_id
        ),
    )

    item.duplicate_kind = None
    item.duplicate_material_id = None

    if (
        item.status == "duplicate"
    ):
        item.status = "queued"

    if (
        item.current_location_type
        == "study_material"
        and item.material_id is None
    ):
        item.current_location_type = None
        item.current_location_id = None

    if duplicate is not None:
        mark_exact_duplicate(
            db=db,
            item=item,
            duplicate_material=duplicate,
        )
    else:
        item.result_message = (
            "No exact duplicate was found."
        )
        item.error_message = None
        item.updated_at = utc_now()

        db.add(item)
        db.flush()

    return duplicate


def register_items(
    *,
    db: Session,
    batch: FileBrainBatch,
    items: list[FileBrainItemInput],
) -> list[FileBrainItem]:
    existing_count = (
        db.query(FileBrainItem)
        .filter(
            FileBrainItem.batch_id
            == batch.id
        )
        .count()
    )

    batch.total_items = existing_count

    if (
        existing_count + len(items)
        > MAX_FILE_BRAIN_ITEMS
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "A File Brain batch can "
                "contain up to 100 files."
            ),
        )

    created: list[FileBrainItem] = []

    try:
        for value in items:
            item = add_batch_item(
                db=db,
                batch=batch,
                filename=value.filename,
                content_type=(
                    value.content_type
                ),
                file_size=value.file_size,
                sha256=value.sha256,
            )

            if item.sha256:
                apply_exact_duplicate_check(
                    db=db,
                    item=item,
                )

            created.append(item)

        refresh_batch_counts(
            db=db,
            batch=batch,
        )

    except FileBrainLimitError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    return created


@router.post("/batches")
def create_file_brain_batch(
    data: CreateFileBrainBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    if len(data.items) > MAX_FILE_BRAIN_ITEMS:
        raise HTTPException(
            status_code=400,
            detail=(
                "A File Brain batch can "
                "contain up to 100 files."
            ),
        )

    try:
        batch = create_batch(
            db=db,
            owner_id=current_user.id,
            title=data.title,
            source_surface=(
                data.source_surface
            ),
        )

        register_items(
            db=db,
            batch=batch,
            items=data.items,
        )

        db.commit()
        db.refresh(batch)

        return serialize_batch(
            db=db,
            batch=batch,
            include_items=True,
        )

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise


@router.post(
    "/batches/{batch_id}/items"
)
def add_file_brain_items(
    batch_id: int,
    data: RegisterFileBrainItemsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    batch = get_batch_or_404(
        db=db,
        batch_id=batch_id,
        owner_id=current_user.id,
    )

    if batch.status == "cancelled":
        raise HTTPException(
            status_code=409,
            detail=(
                "Cancelled batches cannot "
                "receive more files."
            ),
        )

    if not data.items:
        raise HTTPException(
            status_code=400,
            detail=(
                "Add at least one file."
            ),
        )

    try:
        created = register_items(
            db=db,
            batch=batch,
            items=data.items,
        )

        db.commit()
        db.refresh(batch)

        return {
            "batch": serialize_batch(
                db=db,
                batch=batch,
                include_items=False,
            ),
            "created_items": [
                serialize_item(
                    db=db,
                    item=item,
                )
                for item in created
            ],
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise


@router.get("/batches")
def list_file_brain_batches(
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    batches = (
        db.query(FileBrainBatch)
        .filter(
            FileBrainBatch.owner_id
            == current_user.id
        )
        .order_by(
            FileBrainBatch
            .updated_at
            .desc(),
            FileBrainBatch.id.desc(),
        )
        .limit(limit)
        .all()
    )

    return {
        "batches": [
            serialize_batch(
                db=db,
                batch=batch,
                include_items=False,
            )
            for batch in batches
        ]
    }


@router.get(
    "/batches/{batch_id}"
)
def get_file_brain_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    batch = get_batch_or_404(
        db=db,
        batch_id=batch_id,
        owner_id=current_user.id,
    )

    refresh_batch_counts(
        db=db,
        batch=batch,
    )

    db.commit()
    db.refresh(batch)

    return serialize_batch(
        db=db,
        batch=batch,
        include_items=True,
    )


@router.patch(
    "/items/{item_id}/hash"
)
def register_file_brain_hash(
    item_id: int,
    data: FileBrainHashRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    item = get_item_or_404(
        db=db,
        item_id=item_id,
        owner_id=current_user.id,
    )

    if item.status in {
        "organized",
        "cancelled",
    }:
        raise HTTPException(
            status_code=409,
            detail=(
                "The hash cannot be changed "
                "for this item."
            ),
        )

    try:
        item.sha256 = normalize_sha256(
            data.sha256
        )

        duplicate = (
            apply_exact_duplicate_check(
                db=db,
                item=item,
            )
        )

        batch = get_batch_or_404(
            db=db,
            batch_id=item.batch_id,
            owner_id=current_user.id,
        )

        refresh_batch_counts(
            db=db,
            batch=batch,
        )

        db.commit()
        db.refresh(item)

        return {
            "duplicate_found": (
                duplicate is not None
            ),
            "item": serialize_item(
                db=db,
                item=item,
            ),
        }

    except HTTPException:
        db.rollback()
        raise

    except ValueError as exc:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@router.post(
    "/items/{item_id}/detect-duplicate"
)
def detect_file_brain_duplicate(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    item = get_item_or_404(
        db=db,
        item_id=item_id,
        owner_id=current_user.id,
    )

    if item.status in {
        "organized",
        "cancelled",
    }:
        raise HTTPException(
            status_code=409,
            detail=(
                "Duplicate detection is "
                "not available for this item."
            ),
        )

    try:
        duplicate = (
            apply_exact_duplicate_check(
                db=db,
                item=item,
            )
        )

        batch = get_batch_or_404(
            db=db,
            batch_id=item.batch_id,
            owner_id=current_user.id,
        )

        refresh_batch_counts(
            db=db,
            batch=batch,
        )

        db.commit()
        db.refresh(item)

        return {
            "duplicate_found": (
                duplicate is not None
            ),
            "item": serialize_item(
                db=db,
                item=item,
            ),
        }

    except HTTPException:
        db.rollback()
        raise


@router.patch(
    "/items/{item_id}/suggestion"
)
def update_file_brain_suggestion(
    item_id: int,
    data: FileBrainSuggestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    item = get_item_or_404(
        db=db,
        item_id=item_id,
        owner_id=current_user.id,
    )

    if item.status == "cancelled":
        raise HTTPException(
            status_code=409,
            detail=(
                "Cancelled items cannot "
                "receive suggestions."
            ),
        )

    room = None

    if data.suggested_room_id:
        room = get_owned_room_or_404(
            db=db,
            room_id=(
                data.suggested_room_id
            ),
            owner_id=current_user.id,
        )

    set_room_suggestion(
        db=db,
        item=item,
        topic=data.topic,
        confidence=data.confidence,
        reason=data.reason,
        room=room,
    )

    batch = get_batch_or_404(
        db=db,
        batch_id=item.batch_id,
        owner_id=current_user.id,
    )

    refresh_batch_counts(
        db=db,
        batch=batch,
    )

    db.commit()
    db.refresh(item)

    return serialize_item(
        db=db,
        item=item,
    )


@router.patch(
    "/items/{item_id}/destination"
)
def confirm_file_brain_destination(
    item_id: int,
    data: ConfirmFileBrainDestinationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    item = get_item_or_404(
        db=db,
        item_id=item_id,
        owner_id=current_user.id,
    )

    if item.status == "cancelled":
        raise HTTPException(
            status_code=409,
            detail=(
                "Cancelled items cannot "
                "receive a destination."
            ),
        )

    room = get_owned_room_or_404(
        db=db,
        room_id=data.room_id,
        owner_id=current_user.id,
    )

    try:
        confirm_destination(
            db=db,
            item=item,
            room=room,
        )

        batch = get_batch_or_404(
            db=db,
            batch_id=item.batch_id,
            owner_id=current_user.id,
        )

        refresh_batch_counts(
            db=db,
            batch=batch,
        )

        db.commit()
        db.refresh(item)

        return serialize_item(
            db=db,
            item=item,
        )

    except ValueError as exc:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@router.delete(
    "/items/{item_id}"
)
def cancel_file_brain_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    item = get_item_or_404(
        db=db,
        item_id=item_id,
        owner_id=current_user.id,
    )

    try:
        mark_item_cancelled(
            db=db,
            item=item,
        )

        batch = get_batch_or_404(
            db=db,
            batch_id=item.batch_id,
            owner_id=current_user.id,
        )

        refresh_batch_counts(
            db=db,
            batch=batch,
        )

        db.commit()
        db.refresh(item)

        return {
            "cancelled": True,
            "item": serialize_item(
                db=db,
                item=item,
            ),
        }

    except ValueError as exc:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc


@router.delete(
    "/batches/{batch_id}"
)
def cancel_file_brain_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    batch = get_batch_or_404(
        db=db,
        batch_id=batch_id,
        owner_id=current_user.id,
    )

    cancel_batch(
        db=db,
        batch=batch,
    )

    db.commit()
    db.refresh(batch)

    return {
        "cancelled": True,
        "batch": serialize_batch(
            db=db,
            batch=batch,
            include_items=True,
        ),
    }
