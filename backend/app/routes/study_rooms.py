import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.study_room import StudyRoom
from app.models.user import User
from app.utils.deps import get_current_user

router = APIRouter(tags=["Study Rooms"])


def clean_room_text(value: str, max_length: int = 100) -> str:
    cleaned = value or ""
    cleaned = re.sub(r"[*_`>#]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:max_length].strip()


def validate_room_name(name: str) -> str:
    cleaned = clean_room_text(name)

    if not cleaned:
        raise HTTPException(status_code=400, detail="Study room name is required")

    return cleaned


def validate_room_subject(subject: str) -> str:
    cleaned = clean_room_text(subject, max_length=80)

    if not cleaned:
        raise HTTPException(status_code=400, detail="Subject is required")

    return cleaned


class StudyRoomCreate(BaseModel):
    name: str
    subject: str
    description: str | None = None


class StudyRoomUpdate(BaseModel):
    name: str
    subject: str
    description: str | None = None


@router.get("")
def list_study_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rooms = (
        db.query(StudyRoom)
        .filter(StudyRoom.owner_id == current_user.id)
        .order_by(StudyRoom.id.desc())
        .all()
    )

    return [
        {
            "id": room.id,
            "name": room.name,
            "subject": getattr(room, "subject", ""),
            "description": getattr(room, "description", None),
            "owner_id": room.owner_id,
        }
        for room in rooms
    ]


@router.post("")
def create_study_room(
    data: StudyRoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room_name = validate_room_name(data.name)
    room_subject = validate_room_subject(data.subject)

    room = StudyRoom(
        name=room_name,
        subject=room_subject,
        description=data.description,
        owner_id=current_user.id,
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    return {
        "id": room.id,
        "name": room.name,
        "subject": getattr(room, "subject", ""),
        "description": getattr(room, "description", None),
        "owner_id": room.owner_id,
    }


@router.put("/{room_id}")
def update_study_room(
    room_id: int,
    data: StudyRoomUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == room_id,
            StudyRoom.owner_id == current_user.id,
        )
        .first()
    )

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    room.name = validate_room_name(data.name)
    room.subject = validate_room_subject(data.subject)
    room.description = data.description

    db.commit()
    db.refresh(room)

    return {
        "id": room.id,
        "name": room.name,
        "subject": getattr(room, "subject", ""),
        "description": getattr(room, "description", None),
        "owner_id": room.owner_id,
    }


@router.delete("/{room_id}")
def delete_study_room(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = (
        db.query(StudyRoom)
        .filter(
            StudyRoom.id == room_id,
            StudyRoom.owner_id == current_user.id,
        )
        .first()
    )

    if not room:
        raise HTTPException(status_code=404, detail="Study room not found")

    db.delete(room)
    db.commit()

    return {"message": "Study room deleted"}
