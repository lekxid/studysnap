from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.note import Note
from app.models.study_room import StudyRoom
from app.models.user import User
from app.utils.deps import get_current_user

router = APIRouter(prefix="/notes", tags=["Notes"])


class NoteCreate(BaseModel):
    study_room_id: int
    title: str
    content: str


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
