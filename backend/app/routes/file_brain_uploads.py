from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.file_brain import (
    FileBrainBatch,
)
from app.models.user import User
from app.routes.file_brain import (
    get_item_or_404,
)
from app.services.file_brain import (
    refresh_batch_counts,
)
from app.services.file_brain_uploads import (
    FileBrainUploadError,
    FileBrainUploadIncomplete,
    cancel_upload,
    complete_upload,
    pause_upload,
    start_upload,
    store_chunk,
    sync_progress,
)
from app.utils.deps import get_current_user


router = APIRouter(
    tags=["File Brain Uploads"],
)


def refresh_batch(
    *,
    db: Session,
    batch_id: int,
    owner_id: int,
) -> None:
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

    if batch is not None:
        refresh_batch_counts(
            db=db,
            batch=batch,
        )


def handle_upload_error(
    exc: FileBrainUploadError,
) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail=str(exc),
    )


@router.post(
    "/items/{item_id}/upload/start"
)
def start_file_brain_upload(
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
        payload = start_upload(
            db=db,
            item=item,
        )

        db.commit()

        return payload

    except FileBrainUploadError as exc:
        db.rollback()
        raise handle_upload_error(
            exc
        ) from exc


@router.post(
    "/items/{item_id}/upload/resume"
)
def resume_file_brain_upload(
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
        payload = start_upload(
            db=db,
            item=item,
        )

        db.commit()

        return payload

    except FileBrainUploadError as exc:
        db.rollback()
        raise handle_upload_error(
            exc
        ) from exc


@router.post(
    "/items/{item_id}/upload/retry"
)
def retry_file_brain_upload(
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
        payload = start_upload(
            db=db,
            item=item,
            retry=True,
        )

        db.commit()

        return payload

    except FileBrainUploadError as exc:
        db.rollback()
        raise handle_upload_error(
            exc
        ) from exc


@router.post(
    "/items/{item_id}/upload/pause"
)
def pause_file_brain_upload(
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
        payload = pause_upload(
            db=db,
            item=item,
        )

        db.commit()

        return payload

    except FileBrainUploadError as exc:
        db.rollback()
        raise handle_upload_error(
            exc
        ) from exc


@router.get(
    "/items/{item_id}/upload"
)
def get_file_brain_upload(
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

    if not item.upload_id:
        return {
            "item_id": item.id,
            "upload_id": None,
            "state": (
                item.upload_state
                or "not_started"
            ),
            "chunk_size": None,
            "total_chunks": (
                item.total_chunks
            ),
            "uploaded_chunks": [],
            "uploaded_chunk_count": (
                item.uploaded_chunks
                or 0
            ),
            "uploaded_bytes": (
                item.uploaded_bytes
                or 0
            ),
            "file_size": (
                item.file_size
            ),
            "progress_percent": (
                item.progress_percent
                or 0
            ),
            "attempts": (
                item.upload_attempts
                or 0
            ),
            "can_pause": False,
            "can_resume": False,
            "can_retry": False,
            "can_cancel": (
                item.status
                not in {
                    "organized",
                    "duplicate",
                    "cancelled",
                }
            ),
        }

    try:
        payload = sync_progress(
            db=db,
            item=item,
        )

        refresh_batch(
            db=db,
            batch_id=item.batch_id,
            owner_id=current_user.id,
        )

        db.commit()

        return payload

    except FileBrainUploadError as exc:
        db.rollback()
        raise handle_upload_error(
            exc
        ) from exc


@router.put(
    (
        "/items/{item_id}/upload/"
        "chunks/{chunk_index}"
    )
)
async def upload_file_brain_chunk(
    item_id: int,
    chunk_index: int,
    request: Request,
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
        payload = await store_chunk(
            db=db,
            item=item,
            chunk_index=chunk_index,
            stream=request.stream(),
        )

        db.commit()

        return payload

    except FileBrainUploadError as exc:
        db.rollback()
        raise handle_upload_error(
            exc
        ) from exc


@router.post(
    "/items/{item_id}/upload/complete"
)
def complete_file_brain_upload(
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
        payload = complete_upload(
            db=db,
            item=item,
        )

        db.commit()

        return payload

    except FileBrainUploadIncomplete as exc:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail={
                "message": str(exc),
                "missing_chunks": (
                    exc.missing_chunks[:100]
                ),
                "missing_count": len(
                    exc.missing_chunks
                ),
            },
        ) from exc

    except FileBrainUploadError as exc:
        db.rollback()
        raise handle_upload_error(
            exc
        ) from exc

    except Exception:
        db.rollback()
        raise


@router.delete(
    "/items/{item_id}/upload"
)
def cancel_file_brain_upload(
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
        payload = cancel_upload(
            db=db,
            item=item,
        )

        db.commit()

        return payload

    except FileBrainUploadError as exc:
        db.rollback()
        raise handle_upload_error(
            exc
        ) from exc
