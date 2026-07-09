from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from io import BytesIO

from pydantic import BaseModel

from app.database import get_db
from app.models.note import Note
from app.models.study_room import StudyRoom
from app.models.user import User
from app.utils.deps import get_current_user
from app.services.export.pdf import build_note_pdf_bytes, safe_pdf_filename

router = APIRouter(tags=["Notes"])


class NoteCreate(BaseModel):
    study_room_id: int
    title: str
    content: str


class NoteUpdate(BaseModel):
    title: str
    content: str



@router.get("/{note_id}/download-pdf")
def download_note_pdf(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.owner_id == current_user.id
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    room = db.query(StudyRoom).filter(
        StudyRoom.id == note.study_room_id,
        StudyRoom.owner_id == current_user.id
    ).first()

    pdf_bytes = build_note_pdf_bytes(
        title=note.title,
        content=note.content,
        room_name=room.name if room else None,
        subject=room.subject if room else None,
    )

    filename = safe_pdf_filename(note.title)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


@router.get("/{study_room_id}")
def get_notes(
    study_room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notes = db.query(Note).filter(
        Note.study_room_id == study_room_id,
        Note.owner_id == current_user.id
    ).order_by(Note.id.desc()).all()

    return notes


@router.post("")
def create_note(
    data: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = db.query(StudyRoom).filter(
        StudyRoom.id == data.study_room_id,
        StudyRoom.owner_id == current_user.id
    ).first()

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    note = Note(
        title=data.title,
        content=data.content,
        study_room_id=data.study_room_id,
        owner_id=current_user.id
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
    current_user: User = Depends(get_current_user)
):
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.owner_id == current_user.id
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    note.title = data.title
    note.content = data.content

    db.commit()
    db.refresh(note)

    return note


@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    note = db.query(Note).filter(
        Note.id == note_id,
        Note.owner_id == current_user.id
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    db.delete(note)
    db.commit()

    return {"message": "Note deleted"}
