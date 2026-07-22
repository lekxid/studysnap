from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import uuid
from collections.abc import AsyncIterable
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.file_brain import (
    FileBrainBatch,
    FileBrainItem,
)
from app.models.study_material import (
    StudyMaterial,
)
from app.services.file_brain import (
    find_exact_duplicate,
    mark_item_cancelled,
    refresh_batch_counts,
    utc_now,
)


FILE_BRAIN_CHUNK_SIZE = (
    8 * 1024 * 1024
)

FILE_BRAIN_MAX_FILE_SIZE = (
    2 * 1024 * 1024 * 1024
)

FILE_BRAIN_MAX_CHUNKS = math.ceil(
    FILE_BRAIN_MAX_FILE_SIZE
    / FILE_BRAIN_CHUNK_SIZE
)


class FileBrainUploadError(
    ValueError
):
    pass


class FileBrainUploadIncomplete(
    FileBrainUploadError
):
    def __init__(
        self,
        missing_chunks: list[int],
    ) -> None:
        super().__init__(
            "Upload is not complete."
        )

        self.missing_chunks = (
            missing_chunks
        )


def upload_root() -> Path:
    value = os.getenv(
        "STUDYSNAP_FILE_BRAIN_UPLOAD_ROOT",
        "uploads/file_brain",
    )

    return (
        Path(value)
        .expanduser()
        .resolve()
    )


def validate_upload_id(
    upload_id: str,
) -> str:
    clean = (
        upload_id or ""
    ).strip().lower()

    if not re.fullmatch(
        r"[0-9a-f]{32}",
        clean,
    ):
        raise FileBrainUploadError(
            "Invalid File Brain upload session."
        )

    return clean


def clean_filename(
    value: str,
) -> str:
    clean = Path(
        value or "uploaded-file"
    ).name

    clean = clean.replace(
        "\x00",
        "",
    )

    clean = re.sub(
        r"[\r\n\t]+",
        " ",
        clean,
    ).strip()

    clean = re.sub(
        r"[^\w.\- ()\[\]{}@+#,]+",
        "_",
        clean,
        flags=re.UNICODE,
    )

    clean = clean[:180].strip(
        " ."
    )

    return clean or "uploaded-file"


def safe_suffix(
    filename: str,
) -> str:
    suffix = (
        Path(filename)
        .suffix
        .lower()
    )

    if not re.fullmatch(
        r"\.[a-z0-9]{1,16}",
        suffix,
    ):
        return ""

    return suffix


def session_directory(
    owner_id: int,
    upload_id: str,
) -> Path:
    clean_upload_id = (
        validate_upload_id(
            upload_id
        )
    )

    return (
        upload_root()
        / "sessions"
        / str(owner_id)
        / clean_upload_id
    )


def metadata_path(
    owner_id: int,
    upload_id: str,
) -> Path:
    return (
        session_directory(
            owner_id,
            upload_id,
        )
        / "metadata.json"
    )


def stored_directory(
    owner_id: int,
    item_id: int,
) -> Path:
    return (
        upload_root()
        / "stored"
        / str(owner_id)
        / str(item_id)
    )


def write_metadata(
    directory: Path,
    metadata: dict,
) -> None:
    directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    temporary_path = (
        directory
        / "metadata.json.tmp"
    )

    final_path = (
        directory
        / "metadata.json"
    )

    temporary_path.write_text(
        json.dumps(
            metadata,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    os.replace(
        temporary_path,
        final_path,
    )


def read_metadata(
    *,
    item: FileBrainItem,
) -> dict:
    if not item.upload_id:
        raise FileBrainUploadError(
            "Upload has not been started."
        )

    path = metadata_path(
        item.owner_id,
        item.upload_id,
    )

    if not path.is_file():
        raise FileBrainUploadError(
            "Upload session files are missing."
        )

    try:
        value = json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )
    except Exception as exc:
        raise FileBrainUploadError(
            "Upload session metadata is damaged."
        ) from exc

    if not isinstance(
        value,
        dict,
    ):
        raise FileBrainUploadError(
            "Upload session metadata is damaged."
        )

    if (
        int(value.get("owner_id", -1))
        != item.owner_id
        or int(
            value.get(
                "item_id",
                -1,
            )
        )
        != item.id
    ):
        raise FileBrainUploadError(
            "Upload session ownership does not match."
        )

    return value


def chunk_paths(
    *,
    item: FileBrainItem,
) -> list[Path]:
    if not item.upload_id:
        return []

    directory = session_directory(
        item.owner_id,
        item.upload_id,
    )

    return sorted(
        (
            path
            for path
            in directory.glob(
                "*.chunk"
            )
            if path.stem.isdigit()
        ),
        key=lambda path: int(
            path.stem
        ),
    )


def uploaded_chunk_indexes(
    *,
    item: FileBrainItem,
) -> list[int]:
    return [
        int(path.stem)
        for path in chunk_paths(
            item=item
        )
    ]


def sync_progress(
    *,
    db: Session,
    item: FileBrainItem,
) -> dict:
    uploaded_paths = chunk_paths(
        item=item
    )

    uploaded_bytes = sum(
        path.stat().st_size
        for path in uploaded_paths
    )

    uploaded_count = len(
        uploaded_paths
    )

    item.uploaded_bytes = (
        uploaded_bytes
    )

    item.uploaded_chunks = (
        uploaded_count
    )

    if (
        item.upload_state
        == "completed"
    ):
        progress = 100
    elif item.file_size > 0:
        progress = min(
            99,
            int(
                uploaded_bytes
                * 100
                / item.file_size
            ),
        )
    else:
        progress = 0

    item.progress_percent = (
        progress
    )

    item.updated_at = utc_now()

    db.add(item)
    db.flush()

    return {
        "item_id": item.id,
        "upload_id": item.upload_id,
        "state": item.upload_state,
        "chunk_size": (
            FILE_BRAIN_CHUNK_SIZE
        ),
        "total_chunks": (
            item.total_chunks
        ),
        "uploaded_chunks": (
            uploaded_chunk_indexes(
                item=item
            )
        ),
        "uploaded_chunk_count": (
            item.uploaded_chunks
        ),
        "uploaded_bytes": (
            item.uploaded_bytes
        ),
        "file_size": item.file_size,
        "progress_percent": (
            item.progress_percent
        ),
        "attempts": (
            item.upload_attempts
        ),
        "can_pause": (
            item.upload_state
            == "uploading"
        ),
        "can_resume": (
            item.upload_state
            in {
                "paused",
                "failed",
            }
        ),
        "can_retry": (
            item.upload_state
            == "failed"
        ),
        "can_cancel": (
            item.upload_state
            not in {
                "cancelled",
                "completed",
            }
        ),
    }


def refresh_item_batch(
    *,
    db: Session,
    item: FileBrainItem,
) -> None:
    batch = (
        db.query(FileBrainBatch)
        .filter(
            FileBrainBatch.id
            == item.batch_id,
            FileBrainBatch.owner_id
            == item.owner_id,
        )
        .first()
    )

    if batch is not None:
        refresh_batch_counts(
            db=db,
            batch=batch,
        )


def start_upload(
    *,
    db: Session,
    item: FileBrainItem,
    retry: bool = False,
) -> dict:
    if item.status in {
        "organized",
        "duplicate",
        "cancelled",
    }:
        raise FileBrainUploadError(
            "This File Brain item cannot start an upload."
        )

    if item.file_size <= 0:
        raise FileBrainUploadError(
            "The file must not be empty."
        )

    if (
        item.file_size
        > FILE_BRAIN_MAX_FILE_SIZE
    ):
        raise FileBrainUploadError(
            "The File Brain upload limit is 2GB per file."
        )

    total_chunks = math.ceil(
        item.file_size
        / FILE_BRAIN_CHUNK_SIZE
    )

    if (
        total_chunks <= 0
        or total_chunks
        > FILE_BRAIN_MAX_CHUNKS
    ):
        raise FileBrainUploadError(
            "The file requires too many upload chunks."
        )

    existing_directory = None

    if item.upload_id:
        existing_directory = (
            session_directory(
                item.owner_id,
                item.upload_id,
            )
        )

    if (
        existing_directory is not None
        and (
            existing_directory
            / "metadata.json"
        ).is_file()
    ):
        read_metadata(
            item=item
        )

        if (
            retry
            or item.upload_state
            in {
                "paused",
                "failed",
            }
        ):
            item.upload_attempts += 1

        item.upload_state = (
            "uploading"
        )

        item.status = "uploading"
        item.error_message = None
        item.result_message = (
            "Upload resumed."
        )
        item.updated_at = utc_now()

        db.add(item)
        db.flush()

        refresh_item_batch(
            db=db,
            item=item,
        )

        return sync_progress(
            db=db,
            item=item,
        )

    upload_id = uuid.uuid4().hex

    directory = session_directory(
        item.owner_id,
        upload_id,
    )

    directory.mkdir(
        parents=True,
        exist_ok=False,
    )

    metadata = {
        "upload_id": upload_id,
        "owner_id": item.owner_id,
        "batch_id": item.batch_id,
        "item_id": item.id,
        "filename": clean_filename(
            item.original_filename
        ),
        "file_size": item.file_size,
        "content_type": (
            item.content_type
            or "application/octet-stream"
        ),
        "chunk_size": (
            FILE_BRAIN_CHUNK_SIZE
        ),
        "total_chunks": (
            total_chunks
        ),
        "created_at": (
            utc_now().isoformat()
        ),
    }

    write_metadata(
        directory,
        metadata,
    )

    item.upload_id = upload_id
    item.upload_state = "uploading"
    item.uploaded_bytes = 0
    item.total_chunks = total_chunks
    item.uploaded_chunks = 0
    item.progress_percent = 0
    item.upload_attempts += 1
    item.upload_started_at = utc_now()
    item.upload_completed_at = None
    item.staging_path = None
    item.status = "uploading"
    item.current_location_type = (
        "file_brain_upload"
    )
    item.current_location_id = (
        item.id
    )
    item.result_message = (
        "Upload session started."
    )
    item.error_message = None
    item.updated_at = utc_now()

    db.add(item)
    db.flush()

    refresh_item_batch(
        db=db,
        item=item,
    )

    return sync_progress(
        db=db,
        item=item,
    )


def pause_upload(
    *,
    db: Session,
    item: FileBrainItem,
) -> dict:
    if item.upload_state != "uploading":
        raise FileBrainUploadError(
            "Only an active upload can be paused."
        )

    item.upload_state = "paused"
    item.status = "queued"
    item.result_message = (
        "Upload paused."
    )
    item.updated_at = utc_now()

    db.add(item)
    db.flush()

    refresh_item_batch(
        db=db,
        item=item,
    )

    return sync_progress(
        db=db,
        item=item,
    )


async def store_chunk(
    *,
    db: Session,
    item: FileBrainItem,
    chunk_index: int,
    stream: AsyncIterable[bytes],
) -> dict:
    metadata = read_metadata(
        item=item
    )

    if item.upload_state == "paused":
        raise FileBrainUploadError(
            "Resume the upload before sending more chunks."
        )

    if item.upload_state != "uploading":
        raise FileBrainUploadError(
            "The upload is not active."
        )

    total_chunks = int(
        metadata["total_chunks"]
    )

    if (
        chunk_index < 0
        or chunk_index >= total_chunks
        or chunk_index
        >= FILE_BRAIN_MAX_CHUNKS
    ):
        raise FileBrainUploadError(
            "Invalid upload chunk number."
        )

    directory = session_directory(
        item.owner_id,
        item.upload_id or "",
    )

    final_path = (
        directory
        / f"{chunk_index}.chunk"
    )

    if final_path.is_file():
        payload = sync_progress(
            db=db,
            item=item,
        )

        payload.update(
            {
                "chunk_index": (
                    chunk_index
                ),
                "already_present": True,
                "stored": True,
            }
        )

        return payload

    temporary_path = (
        directory
        / f"{chunk_index}.part"
    )

    expected_size = (
        FILE_BRAIN_CHUNK_SIZE
        if chunk_index
        < total_chunks - 1
        else (
            item.file_size
            - (
                FILE_BRAIN_CHUNK_SIZE
                * (total_chunks - 1)
            )
        )
    )

    received = 0

    try:
        with temporary_path.open(
            "wb"
        ) as output:
            async for part in stream:
                if not part:
                    continue

                received += len(part)

                if received > expected_size:
                    raise FileBrainUploadError(
                        "Upload chunk is larger than expected."
                    )

                output.write(part)

        if received != expected_size:
            raise FileBrainUploadError(
                "Upload chunk size does not match the session."
            )

        os.replace(
            temporary_path,
            final_path,
        )

        try:
            os.chmod(
                final_path,
                0o600,
            )
        except OSError:
            pass

        item.status = "uploading"
        item.upload_state = (
            "uploading"
        )
        item.result_message = (
            "Upload chunk stored."
        )
        item.error_message = None
        item.updated_at = utc_now()

        db.add(item)
        db.flush()

        payload = sync_progress(
            db=db,
            item=item,
        )

        refresh_item_batch(
            db=db,
            item=item,
        )

        payload.update(
            {
                "chunk_index": (
                    chunk_index
                ),
                "already_present": False,
                "stored": True,
            }
        )

        return payload

    finally:
        temporary_path.unlink(
            missing_ok=True
        )


def find_staged_duplicate(
    *,
    db: Session,
    item: FileBrainItem,
    sha256: str,
) -> FileBrainItem | None:
    return (
        db.query(FileBrainItem)
        .filter(
            FileBrainItem.owner_id
            == item.owner_id,
            FileBrainItem.id
            != item.id,
            FileBrainItem.sha256
            == sha256,
            FileBrainItem.status.in_(
                [
                    "stored",
                    "organized",
                ]
            ),
        )
        .order_by(
            FileBrainItem.id.asc()
        )
        .first()
    )


def mark_duplicate_from_item(
    *,
    db: Session,
    item: FileBrainItem,
    duplicate_item: FileBrainItem,
    sha256: str,
) -> None:
    item.sha256 = sha256
    item.status = "duplicate"
    item.duplicate_kind = "exact"
    item.duplicate_item_id = (
        duplicate_item.id
    )
    item.duplicate_material_id = (
        duplicate_item.material_id
    )
    item.current_location_type = (
        duplicate_item
        .current_location_type
    )
    item.current_location_id = (
        duplicate_item
        .current_location_id
    )
    item.upload_state = "completed"
    item.uploaded_bytes = item.file_size
    item.uploaded_chunks = (
        item.total_chunks or 0
    )
    item.progress_percent = 100
    item.upload_completed_at = (
        utc_now()
    )
    item.result_message = (
        "Exact duplicate found in File Brain. "
        "A second stored copy was not created."
    )
    item.error_message = None
    item.updated_at = utc_now()

    db.add(item)
    db.flush()


def mark_duplicate_from_material(
    *,
    db: Session,
    item: FileBrainItem,
    duplicate: StudyMaterial,
    sha256: str,
) -> None:
    item.sha256 = sha256
    item.status = "duplicate"
    item.duplicate_kind = "exact"
    item.duplicate_item_id = None
    item.duplicate_material_id = (
        duplicate.id
    )
    item.current_location_type = (
        "study_material"
    )
    item.current_location_id = (
        duplicate.id
    )
    item.upload_state = "completed"
    item.uploaded_bytes = item.file_size
    item.uploaded_chunks = (
        item.total_chunks or 0
    )
    item.progress_percent = 100
    item.upload_completed_at = (
        utc_now()
    )
    item.result_message = (
        "Exact duplicate found. "
        "The existing StudySnap file was preserved."
    )
    item.error_message = None
    item.updated_at = utc_now()

    db.add(item)
    db.flush()


def complete_upload(
    *,
    db: Session,
    item: FileBrainItem,
) -> dict:
    metadata = read_metadata(
        item=item
    )

    if item.upload_state == "paused":
        raise FileBrainUploadError(
            "Resume the upload before completing it."
        )

    if item.upload_state != "uploading":
        raise FileBrainUploadError(
            "The upload is not active."
        )

    total_chunks = int(
        metadata["total_chunks"]
    )

    directory = session_directory(
        item.owner_id,
        item.upload_id or "",
    )

    missing = [
        index
        for index in range(
            total_chunks
        )
        if not (
            directory
            / f"{index}.chunk"
        ).is_file()
    ]

    if missing:
        raise FileBrainUploadIncomplete(
            missing
        )

    combine_path = (
        directory
        / "combined.upload"
    )

    digest = hashlib.sha256()
    actual_size = 0

    try:
        with combine_path.open(
            "wb"
        ) as output:
            for index in range(
                total_chunks
            ):
                path = (
                    directory
                    / f"{index}.chunk"
                )

                with path.open(
                    "rb"
                ) as source:
                    while True:
                        block = source.read(
                            1024 * 1024
                        )

                        if not block:
                            break

                        actual_size += len(
                            block
                        )

                        digest.update(
                            block
                        )

                        output.write(
                            block
                        )

        if actual_size != item.file_size:
            raise FileBrainUploadError(
                "Combined file size does not match the upload record."
            )

        sha256 = digest.hexdigest()

        existing_material = (
            find_exact_duplicate(
                db=db,
                owner_id=item.owner_id,
                sha256=sha256,
                exclude_material_id=(
                    item.material_id
                ),
            )
        )

        existing_item = (
            find_staged_duplicate(
                db=db,
                item=item,
                sha256=sha256,
            )
        )

        if existing_material is not None:
            combine_path.unlink(
                missing_ok=True
            )

            mark_duplicate_from_material(
                db=db,
                item=item,
                duplicate=(
                    existing_material
                ),
                sha256=sha256,
            )

            shutil.rmtree(
                directory,
                ignore_errors=True,
            )

            refresh_item_batch(
                db=db,
                item=item,
            )

            return {
                "duplicate_found": True,
                "duplicate_source": (
                    "study_material"
                ),
                "item_id": item.id,
                "sha256": sha256,
                "status": item.status,
                "upload_state": (
                    item.upload_state
                ),
                "progress_percent": 100,
                "duplicate_material_id": (
                    item.duplicate_material_id
                ),
                "duplicate_item_id": None,
                "staging_available": False,
                "message": (
                    item.result_message
                ),
            }

        if existing_item is not None:
            combine_path.unlink(
                missing_ok=True
            )

            mark_duplicate_from_item(
                db=db,
                item=item,
                duplicate_item=(
                    existing_item
                ),
                sha256=sha256,
            )

            shutil.rmtree(
                directory,
                ignore_errors=True,
            )

            refresh_item_batch(
                db=db,
                item=item,
            )

            return {
                "duplicate_found": True,
                "duplicate_source": (
                    "file_brain_item"
                ),
                "item_id": item.id,
                "sha256": sha256,
                "status": item.status,
                "upload_state": (
                    item.upload_state
                ),
                "progress_percent": 100,
                "duplicate_material_id": (
                    item.duplicate_material_id
                ),
                "duplicate_item_id": (
                    item.duplicate_item_id
                ),
                "staging_available": False,
                "message": (
                    item.result_message
                ),
            }

        destination = stored_directory(
            item.owner_id,
            item.id,
        )

        destination.mkdir(
            parents=True,
            exist_ok=True,
        )

        filename = (
            f"{uuid.uuid4().hex}"
            f"{safe_suffix(item.original_filename)}"
        )

        final_path = (
            destination
            / filename
        )

        os.replace(
            combine_path,
            final_path,
        )

        try:
            os.chmod(
                final_path,
                0o600,
            )
        except OSError:
            pass

        item.sha256 = sha256
        item.status = "stored"
        item.duplicate_kind = None
        item.duplicate_item_id = None
        item.duplicate_material_id = None
        item.staging_path = str(
            final_path
        )
        item.current_location_type = (
            "file_brain_staging"
        )
        item.current_location_id = (
            item.id
        )
        item.upload_state = (
            "completed"
        )
        item.uploaded_bytes = (
            item.file_size
        )
        item.uploaded_chunks = (
            total_chunks
        )
        item.progress_percent = 100
        item.upload_completed_at = (
            utc_now()
        )
        item.result_message = (
            "Upload stored privately in File Brain. "
            "A room has not been selected automatically."
        )
        item.error_message = None
        item.updated_at = utc_now()

        db.add(item)
        db.flush()

        shutil.rmtree(
            directory,
            ignore_errors=True,
        )

        refresh_item_batch(
            db=db,
            item=item,
        )

        return {
            "duplicate_found": False,
            "duplicate_source": None,
            "item_id": item.id,
            "sha256": sha256,
            "status": item.status,
            "upload_state": (
                item.upload_state
            ),
            "progress_percent": 100,
            "duplicate_material_id": None,
            "duplicate_item_id": None,
            "staging_available": True,
            "message": (
                item.result_message
            ),
        }

    except Exception:
        combine_path.unlink(
            missing_ok=True
        )

        raise


def cancel_upload(
    *,
    db: Session,
    item: FileBrainItem,
) -> dict:
    if item.status in {
        "organized",
        "duplicate",
    }:
        raise FileBrainUploadError(
            "Completed or duplicate items cannot be cancelled here."
        )

    if item.upload_id:
        directory = session_directory(
            item.owner_id,
            item.upload_id,
        )

        shutil.rmtree(
            directory,
            ignore_errors=True,
        )

    if item.staging_path:
        staging_path = Path(
            item.staging_path
        )

        staging_path.unlink(
            missing_ok=True
        )

        try:
            staging_path.parent.rmdir()
        except OSError:
            pass

    mark_item_cancelled(
        db=db,
        item=item,
    )

    item.upload_state = (
        "cancelled"
    )
    item.staging_path = None
    item.uploaded_bytes = 0
    item.uploaded_chunks = 0
    item.progress_percent = 0
    item.upload_completed_at = (
        utc_now()
    )
    item.current_location_type = None
    item.current_location_id = None
    item.updated_at = utc_now()

    db.add(item)
    db.flush()

    refresh_item_batch(
        db=db,
        item=item,
    )

    return {
        "cancelled": True,
        "item_id": item.id,
        "status": item.status,
        "upload_state": (
            item.upload_state
        ),
        "progress_percent": (
            item.progress_percent
        ),
    }
