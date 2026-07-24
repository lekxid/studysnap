from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.file_brain import (
    FileBrainItem,
)
from app.models.study_material import (
    StudyMaterial,
)


MAX_FILE_BRAIN_AI_ITEMS = 10
MAX_FILE_BRAIN_SOURCE_HOPS = 20


class FileBrainAIError(ValueError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 409,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass
class ResolvedFileBrainSource:
    requested_item: FileBrainItem
    source_path: Path
    filename: str
    content_type: str
    source_type: str
    source_id: int


def get_owned_file_brain_items(
    *,
    db: Session,
    owner_id: int,
    item_ids: list[int],
) -> list[FileBrainItem]:
    clean_ids: list[int] = []
    seen: set[int] = set()

    for raw_item_id in item_ids:
        try:
            item_id = int(raw_item_id)
        except (TypeError, ValueError) as exc:
            raise FileBrainAIError(
                "A File Brain item ID is invalid.",
                status_code=400,
            ) from exc

        if item_id <= 0:
            raise FileBrainAIError(
                "A File Brain item ID is invalid.",
                status_code=400,
            )

        if item_id in seen:
            raise FileBrainAIError(
                "The same File Brain item was selected more than once.",
                status_code=400,
            )

        seen.add(item_id)
        clean_ids.append(item_id)

    if not clean_ids:
        raise FileBrainAIError(
            "Choose at least one completed File Brain item.",
            status_code=400,
        )

    if len(clean_ids) > MAX_FILE_BRAIN_AI_ITEMS:
        raise FileBrainAIError(
            (
                "General AI can compare up to "
                f"{MAX_FILE_BRAIN_AI_ITEMS} File Brain items "
                "in one question."
            ),
            status_code=400,
        )

    items = (
        db.query(FileBrainItem)
        .filter(
            FileBrainItem.owner_id == owner_id,
            FileBrainItem.id.in_(clean_ids),
        )
        .all()
    )

    item_map = {
        item.id: item
        for item in items
    }

    if len(item_map) != len(clean_ids):
        raise FileBrainAIError(
            "One or more File Brain items were not found.",
            status_code=404,
        )

    return [
        item_map[item_id]
        for item_id in clean_ids
    ]


def get_owned_material(
    *,
    db: Session,
    owner_id: int,
    material_id: int,
) -> StudyMaterial:
    material = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.id == material_id,
            StudyMaterial.owner_id == owner_id,
        )
        .first()
    )

    if material is None:
        raise FileBrainAIError(
            "The existing duplicate file could not be found.",
            status_code=409,
        )

    return material


def checked_source_path(
    *,
    value: str | None,
    filename: str,
) -> Path:
    if not value:
        raise FileBrainAIError(
            f"{filename} has no readable stored file.",
            status_code=409,
        )

    path = Path(value).expanduser()

    try:
        resolved = path.resolve(strict=True)
    except FileNotFoundError as exc:
        raise FileBrainAIError(
            f"The stored file for {filename} is missing.",
            status_code=409,
        ) from exc

    if not resolved.is_file():
        raise FileBrainAIError(
            f"The stored path for {filename} is not a file.",
            status_code=409,
        )

    if resolved.is_symlink():
        raise FileBrainAIError(
            f"The stored file for {filename} is not trusted.",
            status_code=409,
        )

    return resolved


def source_from_material(
    *,
    requested_item: FileBrainItem,
    material: StudyMaterial,
) -> ResolvedFileBrainSource:
    filename = (
        material.original_filename
        or requested_item.original_filename
        or "uploaded-file"
    )

    return ResolvedFileBrainSource(
        requested_item=requested_item,
        source_path=checked_source_path(
            value=material.file_path,
            filename=filename,
        ),
        filename=filename,
        content_type=(
            material.content_type
            or requested_item.content_type
            or "application/octet-stream"
        ),
        source_type="study_material",
        source_id=material.id,
    )


def resolve_file_brain_source(
    *,
    db: Session,
    item: FileBrainItem,
) -> ResolvedFileBrainSource:
    owner_id = item.owner_id
    requested_item = item
    current_item = item
    visited: set[int] = set()

    for _ in range(
        MAX_FILE_BRAIN_SOURCE_HOPS
    ):
        if current_item.id in visited:
            raise FileBrainAIError(
                "A duplicate-file reference loop was detected.",
                status_code=409,
            )

        visited.add(current_item.id)

        if current_item.owner_id != owner_id:
            raise FileBrainAIError(
                "The File Brain source owner does not match.",
                status_code=403,
            )

        if current_item.status == "cancelled":
            raise FileBrainAIError(
                (
                    f"{requested_item.original_filename} "
                    "was cancelled and cannot be read."
                ),
                status_code=409,
            )

        if current_item.material_id:
            material = get_owned_material(
                db=db,
                owner_id=owner_id,
                material_id=current_item.material_id,
            )

            return source_from_material(
                requested_item=requested_item,
                material=material,
            )

        if current_item.staging_path:
            filename = (
                current_item.original_filename
                or requested_item.original_filename
                or "uploaded-file"
            )

            return ResolvedFileBrainSource(
                requested_item=requested_item,
                source_path=checked_source_path(
                    value=current_item.staging_path,
                    filename=filename,
                ),
                filename=filename,
                content_type=(
                    current_item.content_type
                    or requested_item.content_type
                    or "application/octet-stream"
                ),
                source_type="file_brain_staging",
                source_id=current_item.id,
            )

        if current_item.duplicate_material_id:
            material = get_owned_material(
                db=db,
                owner_id=owner_id,
                material_id=(
                    current_item
                    .duplicate_material_id
                ),
            )

            return source_from_material(
                requested_item=requested_item,
                material=material,
            )

        if current_item.duplicate_item_id:
            duplicate_item = (
                db.query(FileBrainItem)
                .filter(
                    FileBrainItem.id
                    == current_item.duplicate_item_id,
                    FileBrainItem.owner_id
                    == owner_id,
                )
                .first()
            )

            if duplicate_item is None:
                raise FileBrainAIError(
                    (
                        "The original File Brain duplicate "
                        "could not be found."
                    ),
                    status_code=409,
                )

            current_item = duplicate_item
            continue

        if (
            current_item.current_location_type
            == "study_material"
            and current_item.current_location_id
        ):
            material = get_owned_material(
                db=db,
                owner_id=owner_id,
                material_id=(
                    current_item
                    .current_location_id
                ),
            )

            return source_from_material(
                requested_item=requested_item,
                material=material,
            )

        raise FileBrainAIError(
            (
                f"{requested_item.original_filename} "
                "has not finished uploading yet."
            ),
            status_code=409,
        )

    raise FileBrainAIError(
        "The File Brain source chain is too long.",
        status_code=409,
    )


def resolve_file_brain_sources(
    *,
    db: Session,
    owner_id: int,
    item_ids: list[int],
) -> list[ResolvedFileBrainSource]:
    items = get_owned_file_brain_items(
        db=db,
        owner_id=owner_id,
        item_ids=item_ids,
    )

    return [
        resolve_file_brain_source(
            db=db,
            item=item,
        )
        for item in items
    ]


def safe_attachment_suffix(
    filename: str,
) -> str:
    suffix = (
        Path(filename)
        .suffix
        .lower()
    )

    if (
        not suffix
        or len(suffix) > 20
        or not suffix[1:].isalnum()
    ):
        return ""

    return suffix


def hardlink_ai_attachment(
    *,
    source_path: Path,
    filename: str,
    owner_id: int,
    conversation_id: int,
    attachment_root: Path,
) -> tuple[str, str]:
    source = source_path.resolve(
        strict=True
    )

    if not source.is_file():
        raise FileBrainAIError(
            "The File Brain source is unavailable.",
            status_code=409,
        )

    directory = (
        attachment_root
        / str(owner_id)
        / str(conversation_id)
    )

    directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    stored_filename = (
        f"{uuid.uuid4().hex}"
        f"{safe_attachment_suffix(filename)}"
    )

    destination = (
        directory
        / stored_filename
    )

    try:
        os.link(
            source,
            destination,
            follow_symlinks=False,
        )
    except OSError:
        destination.unlink(
            missing_ok=True
        )

        # Azure Files SMB does not provide the hard-link behavior
        # used by local Linux storage. Preserve a zero-copy logical
        # reference instead. The API resolves this source again with
        # both conversation and File Brain ownership checks.
        return (
            source.name,
            str(source),
        )

    return (
        stored_filename,
        str(destination),
    )


def cleanup_created_paths(
    paths: list[Path],
) -> None:
    for path in paths:
        try:
            path.unlink(
                missing_ok=True
            )
        except OSError:
            pass

        try:
            path.parent.rmdir()
        except OSError:
            pass
