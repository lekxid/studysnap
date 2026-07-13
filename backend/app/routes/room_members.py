from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import case
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.room_member import RoomMember
from app.models.user import User
from app.services.rooms.access import (
    ROOM_MANAGER_ROLES,
    require_room_view,
)
from app.utils.deps import get_current_user


router = APIRouter(tags=["Room Members"])


def serialize_room_member(
    membership: RoomMember,
    user: User,
    *,
    current_user_id: int,
    can_view_all_emails: bool,
) -> dict[str, Any]:
    is_current_user = (
        membership.user_id == current_user_id
    )

    return {
        "id": membership.id,
        "room_id": membership.room_id,
        "user_id": membership.user_id,
        "full_name": user.full_name,
        "email": (
            user.email
            if can_view_all_emails
            or is_current_user
            else None
        ),
        "role": membership.role,
        "status": membership.status,
        "joined_at": (
            membership.joined_at.isoformat()
            if membership.joined_at
            else None
        ),
        "last_active_at": (
            membership.last_active_at.isoformat()
            if membership.last_active_at
            else None
        ),
        "is_current_user": is_current_user,
        "is_owner": membership.role == "owner",
    }


@router.get("/rooms/{room_id}")
def list_room_members(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    room, current_role = require_room_view(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    can_manage_members = (
        current_role in ROOM_MANAGER_ROLES
    )

    role_order = case(
        (
            RoomMember.role == "owner",
            0,
        ),
        (
            RoomMember.role == "admin",
            1,
        ),
        (
            RoomMember.role == "member",
            2,
        ),
        (
            RoomMember.role == "viewer",
            3,
        ),
        (
            RoomMember.role == "ai_tutor",
            4,
        ),
        else_=5,
    )

    rows = (
        db.query(
            RoomMember,
            User,
        )
        .join(
            User,
            User.id == RoomMember.user_id,
        )
        .filter(
            RoomMember.room_id == room.id,
            RoomMember.status == "active",
        )
        .order_by(
            role_order.asc(),
            RoomMember.joined_at.asc(),
            RoomMember.id.asc(),
        )
        .limit(250)
        .all()
    )

    members = [
        serialize_room_member(
            membership,
            user,
            current_user_id=current_user.id,
            can_view_all_emails=(
                can_manage_members
            ),
        )
        for membership, user in rows
    ]

    return {
        "room_id": room.id,
        "current_user_role": current_role,
        "permissions": {
            "can_manage_members": (
                can_manage_members
            ),
        },
        "total": len(members),
        "members": members,
    }
