from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.study_room import StudyRoom
from app.models.user import User
from app.utils.deps import get_current_user

router = APIRouter(tags=["Study Rooms"])


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
    room = StudyRoom(
        name=data.name,
        subject=data.subject,
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

    room.name = data.name
    room.subject = data.subject
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
