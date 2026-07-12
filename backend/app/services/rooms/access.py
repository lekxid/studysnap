from __future__ import annotations

from collections.abc import Collection
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.room_member import RoomMember
from app.models.study_room import StudyRoom


ROOM_ROLES = [
    "owner",
    "admin",
    "member",
    "viewer",
    "ai_tutor",
]

ROOM_VIEW_ROLES = frozenset(
    {
        "owner",
        "admin",
        "member",
        "viewer",
        "ai_tutor",
    }
)

ROOM_CONTRIBUTOR_ROLES = frozenset(
    {
        "owner",
        "admin",
        "member",
    }
)

ROOM_AI_ROLES = frozenset(
    {
        "owner",
        "admin",
        "member",
        "ai_tutor",
    }
)

ROOM_MANAGER_ROLES = frozenset(
    {
        "owner",
        "admin",
    }
)


def ensure_room_owner_membership(
    db: Session,
    room: StudyRoom,
    commit: bool = False,
) -> bool:
    membership = (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == room.owner_id,
        )
        .first()
    )

    changed = False

    if membership is None:
        membership = RoomMember(
            room_id=room.id,
            user_id=room.owner_id,
            role="owner",
            status="active",
            last_active_at=datetime.utcnow(),
        )
        db.add(membership)
        changed = True
    else:
        if membership.role != "owner":
            membership.role = "owner"
            changed = True

        if membership.status != "active":
            membership.status = "active"
            changed = True

    if changed and commit:
        db.commit()

    return changed


def get_room_membership(
    db: Session,
    room_id: int,
    user_id: int,
) -> RoomMember | None:
    return (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == user_id,
            RoomMember.status == "active",
        )
        .first()
    )


def get_user_room_role(
    db: Session,
    room: StudyRoom,
    user_id: int,
) -> str:
    if room.owner_id == user_id:
        return "owner"

    membership = get_room_membership(
        db=db,
        room_id=room.id,
        user_id=user_id,
    )

    return membership.role if membership else "none"


def get_room_for_user(
    db: Session,
    room_id: int,
    user_id: int,
) -> StudyRoom:
    room = (
        db.query(StudyRoom)
        .filter(StudyRoom.id == room_id)
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Study room not found",
        )

    role = get_user_room_role(
        db=db,
        room=room,
        user_id=user_id,
    )

    if role == "none":
        # Do not reveal whether a private room exists.
        raise HTTPException(
            status_code=404,
            detail="Study room not found",
        )

    return room


def require_room_roles(
    db: Session,
    room_id: int,
    user_id: int,
    allowed_roles: Collection[str],
) -> tuple[StudyRoom, str]:
    room = get_room_for_user(
        db=db,
        room_id=room_id,
        user_id=user_id,
    )

    role = get_user_room_role(
        db=db,
        room=room,
        user_id=user_id,
    )

    if role not in allowed_roles:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission for this room action.",
        )

    return room, role


def require_room_view(
    db: Session,
    room_id: int,
    user_id: int,
) -> tuple[StudyRoom, str]:
    return require_room_roles(
        db=db,
        room_id=room_id,
        user_id=user_id,
        allowed_roles=ROOM_VIEW_ROLES,
    )


def require_room_contributor(
    db: Session,
    room_id: int,
    user_id: int,
) -> tuple[StudyRoom, str]:
    return require_room_roles(
        db=db,
        room_id=room_id,
        user_id=user_id,
        allowed_roles=ROOM_CONTRIBUTOR_ROLES,
    )


def require_room_ai(
    db: Session,
    room_id: int,
    user_id: int,
) -> tuple[StudyRoom, str]:
    return require_room_roles(
        db=db,
        room_id=room_id,
        user_id=user_id,
        allowed_roles=ROOM_AI_ROLES,
    )


def require_room_item_change(
    db: Session,
    room_id: int,
    user_id: int,
    item_owner_id: int,
) -> tuple[StudyRoom, str]:
    room, role = require_room_contributor(
        db=db,
        room_id=room_id,
        user_id=user_id,
    )

    if (
        role in ROOM_MANAGER_ROLES
        or item_owner_id == user_id
    ):
        return room, role

    raise HTTPException(
        status_code=403,
        detail=(
            "You can only change items you created "
            "unless you manage this room."
        ),
    )
