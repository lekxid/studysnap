from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.note import Note
from app.models.user import User
from app.services.export.pdf import (
    build_note_pdf_bytes,
    build_studysnap_pdf_bytes,
    safe_pdf_filename,
)
from app.services.rooms.access import (
    get_room_for_user,
    require_room_contributor,
    require_room_item_change,
    require_room_view,
)
from app.utils.deps import get_current_user


router = APIRouter(tags=["Notes"])


class NoteCreate(BaseModel):
    study_room_id: int
    title: str
    content: str


class NoteUpdate(BaseModel):
    title: str
    content: str


class PdfExportRequest(BaseModel):
    title: str
    content: str
    subtitle: str | None = None


def get_note_or_404(
    db: Session,
    note_id: int,
) -> Note:
    note = (
        db.query(Note)
        .filter(Note.id == note_id)
        .first()
    )

    if note is None:
        raise HTTPException(
            status_code=404,
            detail="Note not found",
        )

    return note


@router.post("/export-pdf")
def export_text_pdf(
    data: PdfExportRequest,
    current_user: User = Depends(get_current_user),
):
    title = (
        data.title.strip()
        or "StudySnap AI Export"
    )

    content = data.content.strip()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="PDF content cannot be empty",
        )

    pdf_bytes = build_studysnap_pdf_bytes(
        title=title,
        content=content,
        subtitle=(
            data.subtitle
            or "Exported from StudySnap AI Workspace"
        ),
    )

    filename = safe_pdf_filename(
        title,
        fallback="studysnap-ai-export",
    )

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename}"'
            )
        },
    )


@router.get("/{note_id}/download-pdf")
def download_note_pdf(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = get_note_or_404(
        db=db,
        note_id=note_id,
    )

    room = get_room_for_user(
        db=db,
        room_id=note.study_room_id,
        user_id=current_user.id,
    )

    pdf_bytes = build_note_pdf_bytes(
        title=note.title,
        content=note.content,
        room_name=room.name,
        subject=room.subject,
    )

    filename = safe_pdf_filename(
        note.title
    )

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{filename}"'
            )
        },
    )


@router.get("/{study_room_id}")
def get_notes(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_view(
        db=db,
        room_id=study_room_id,
        user_id=current_user.id,
    )

    return (
        db.query(Note)
        .filter(
            Note.study_room_id == study_room_id
        )
        .order_by(Note.id.desc())
        .all()
    )


@router.post("")
def create_note(
    data: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_room_contributor(
        db=db,
        room_id=data.study_room_id,
        user_id=current_user.id,
    )

    note = Note(
        title=data.title,
        content=data.content,
        study_room_id=data.study_room_id,
        owner_id=current_user.id,
    )

    db.add(note)
    db.commit()
    db.refresh(note)

    return note


@router.patch("/{note_id}")
def update_note(
    note_id: int,
    data: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = get_note_or_404(
        db=db,
        note_id=note_id,
    )

    require_room_item_change(
        db=db,
        room_id=note.study_room_id,
        user_id=current_user.id,
        item_owner_id=note.owner_id,
    )

    note.title = data.title
    note.content = data.content

    db.commit()
    db.refresh(note)

    return note


@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = get_note_or_404(
        db=db,
        note_id=note_id,
    )

    require_room_item_change(
        db=db,
        room_id=note.study_room_id,
        user_id=current_user.id,
        item_owner_id=note.owner_id,
    )

    db.delete(note)
    db.commit()

    return {
        "message": "Note deleted"
    }
