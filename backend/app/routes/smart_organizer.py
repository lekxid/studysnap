import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.smart_organizer import (
    UploadedFileCandidate,
    build_candidate,
    build_preview,
    get_existing_rooms,
    organize_candidates,
)
from app.utils.deps import get_current_user

router = APIRouter(tags=["Smart Organizer"])

MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_FILES = 30


async def build_candidates_from_upload(
    files: list[UploadFile] | None,
    note_text: str = "",
    note_title: str = "Pasted Study Note",
) -> list[UploadedFileCandidate]:
    candidates: list[UploadedFileCandidate] = []
    safe_files = files or []

    if len(safe_files) > MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"You can organize up to {MAX_FILES} files at a time.",
        )

    for index, file in enumerate(safe_files):
        contents = await file.read()

        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"{file.filename or 'A file'} is too large. Maximum size is 20MB.",
            )

        candidates.append(
            build_candidate(
                file_index=index,
                filename=file.filename or f"material-{index + 1}",
                content_type=file.content_type or "application/octet-stream",
                contents=contents,
            )
        )

    clean_note = note_text.strip()

    if clean_note:
        note_filename = f"{(note_title.strip() or 'Pasted Study Note')}.txt"

        candidates.append(
            build_candidate(
                file_index=len(candidates),
                filename=note_filename,
                content_type="text/plain",
                contents=clean_note.encode("utf-8"),
            )
        )

    if not candidates:
        raise HTTPException(
            status_code=400,
            detail="Add at least one file or paste a long note.",
        )

    return candidates


@router.post("/preview")
async def preview_smart_organization(
    files: list[UploadFile] | None = File(default=None),
    note_text: str = Form(default=""),
    note_title: str = Form(default="Pasted Study Note"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidates = await build_candidates_from_upload(
        files=files,
        note_text=note_text,
        note_title=note_title,
    )

    existing_rooms = get_existing_rooms(db, current_user.id)
    return build_preview(candidates, existing_rooms)


@router.post("/organize")
async def organize_smart_materials(
    files: list[UploadFile] | None = File(default=None),
    note_text: str = Form(default=""),
    note_title: str = Form(default="Pasted Study Note"),
    assignments_json: str = Form(default="{}"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidates = await build_candidates_from_upload(
        files=files,
        note_text=note_text,
        note_title=note_title,
    )

    try:
        parsed = json.loads(assignments_json or "{}")
        assignments = {
            str(key): str(value)
            for key, value in parsed.items()
            if str(value).strip()
        }
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid assignments data.")

    return organize_candidates(
        db=db,
        owner_id=current_user.id,
        candidates=candidates,
        assignments=assignments,
    )
