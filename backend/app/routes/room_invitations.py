from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.room_invitation import RoomInvitation
from app.models.room_invite_link import RoomInviteLink
from app.models.room_member import RoomMember
from app.models.study_room import StudyRoom
from app.models.user import User
from app.services.rooms.access import (
    ROOM_MANAGER_ROLES,
    ensure_room_owner_membership,
    require_room_roles,
)
from app.utils.deps import get_current_user
from app.utils.utc import utc_now_naive


router = APIRouter(tags=["Room Invitations"])

INVITABLE_ROLES = frozenset(
    {
        "member",
        "viewer",
        "ai_tutor",
    }
)


class EmailInvitationCreate(BaseModel):
    email: str
    role: str = "member"
    expires_in_days: int = Field(
        default=7,
        ge=1,
        le=30,
    )


class InviteLinkCreate(BaseModel):
    role: str = "member"
    expires_in_days: int = Field(
        default=7,
        ge=1,
        le=30,
    )
    max_uses: int | None = Field(
        default=None,
        ge=1,
        le=100,
    )


def utc_now() -> datetime:
    return utc_now_naive()


def utc_naive(value: datetime) -> datetime:
    """
    Convert aware and naive timestamps into comparable
    naive UTC values.

    SQLite commonly returns naive datetimes, while
    PostgreSQL may return timezone-aware datetimes.
    """
    if (
        value.tzinfo is None
        or value.utcoffset() is None
    ):
        return value

    return (
        value.astimezone(timezone.utc)
        .replace(tzinfo=None)
    )


def normalize_email(value: str) -> str:
    email = value.strip().lower()

    if (
        len(email) > 320
        or not re.fullmatch(
            r"[^@\s]+@[^@\s]+\.[^@\s]+",
            email,
        )
    ):
        raise HTTPException(
            status_code=400,
            detail="Enter a valid email address.",
        )

    return email


def validate_invitable_role(value: str) -> str:
    role = value.strip().lower()

    if role not in INVITABLE_ROLES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invitation role must be member, "
                "viewer, or ai_tutor."
            ),
        )

    return role


def create_raw_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    cleaned = token.strip()

    if not cleaned or len(cleaned) > 512:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found.",
        )

    return hashlib.sha256(
        cleaned.encode("utf-8")
    ).hexdigest()


def isoformat_or_none(
    value: datetime | None,
) -> str | None:
    return (
        value.isoformat()
        if value is not None
        else None
    )


def refresh_email_status(
    invitation: RoomInvitation,
) -> bool:
    if (
        invitation.status == "pending"
        and utc_naive(invitation.expires_at) <= utc_now()
    ):
        invitation.status = "expired"
        return True

    return False


def refresh_link_status(
    link: RoomInviteLink,
) -> bool:
    if link.status != "active":
        return False

    if utc_naive(link.expires_at) <= utc_now():
        link.status = "expired"
        return True

    if (
        link.max_uses is not None
        and link.use_count >= link.max_uses
    ):
        link.status = "exhausted"
        return True

    return False


def serialize_email_invitation(
    invitation: RoomInvitation,
) -> dict:
    return {
        "id": invitation.id,
        "room_id": invitation.room_id,
        "invited_by_user_id": (
            invitation.invited_by_user_id
        ),
        "invited_email": (
            invitation.invited_email
        ),
        "role": invitation.role,
        "status": invitation.status,
        "expires_at": isoformat_or_none(
            invitation.expires_at
        ),
        "accepted_by_user_id": (
            invitation.accepted_by_user_id
        ),
        "accepted_at": isoformat_or_none(
            invitation.accepted_at
        ),
        "declined_at": isoformat_or_none(
            invitation.declined_at
        ),
        "revoked_at": isoformat_or_none(
            invitation.revoked_at
        ),
        "created_at": isoformat_or_none(
            invitation.created_at
        ),
    }


def serialize_invite_link(
    link: RoomInviteLink,
) -> dict:
    return {
        "id": link.id,
        "room_id": link.room_id,
        "created_by_user_id": (
            link.created_by_user_id
        ),
        "role": link.role,
        "status": link.status,
        "expires_at": isoformat_or_none(
            link.expires_at
        ),
        "max_uses": link.max_uses,
        "use_count": link.use_count,
        "revoked_at": isoformat_or_none(
            link.revoked_at
        ),
        "created_at": isoformat_or_none(
            link.created_at
        ),
    }


def get_room_or_404(
    db: Session,
    room_id: int,
) -> StudyRoom:
    room = (
        db.query(StudyRoom)
        .filter(StudyRoom.id == room_id)
        .first()
    )

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found.",
        )

    return room


def get_manager_room(
    db: Session,
    room_id: int,
    user_id: int,
) -> StudyRoom:
    room, _role = require_room_roles(
        db=db,
        room_id=room_id,
        user_id=user_id,
        allowed_roles=ROOM_MANAGER_ROLES,
    )

    return room


def get_existing_membership(
    db: Session,
    room_id: int,
    user_id: int,
) -> RoomMember | None:
    return (
        db.query(RoomMember)
        .filter(
            RoomMember.room_id == room_id,
            RoomMember.user_id == user_id,
        )
        .first()
    )


def ensure_invited_membership(
    db: Session,
    room: StudyRoom,
    user_id: int,
    role: str,
) -> tuple[RoomMember, bool]:
    if room.owner_id == user_id:
        ensure_room_owner_membership(
            db=db,
            room=room,
            commit=False,
        )

        owner_membership = get_existing_membership(
            db=db,
            room_id=room.id,
            user_id=user_id,
        )

        if owner_membership is None:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Room owner membership could "
                    "not be created."
                ),
            )

        return owner_membership, True

    membership = get_existing_membership(
        db=db,
        room_id=room.id,
        user_id=user_id,
    )

    if membership is None:
        membership = RoomMember(
            room_id=room.id,
            user_id=user_id,
            role=role,
            status="active",
            last_active_at=utc_now(),
        )
        db.add(membership)
        return membership, False

    already_active = (
        membership.status == "active"
    )

    if not already_active:
        membership.role = role
        membership.status = "active"

    membership.last_active_at = utc_now()

    return membership, already_active


@router.get("/rooms/{room_id}")
def list_room_invitations(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    get_manager_room(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    email_invitations = (
        db.query(RoomInvitation)
        .filter(
            RoomInvitation.room_id == room_id
        )
        .order_by(
            RoomInvitation.id.desc()
        )
        .all()
    )

    links = (
        db.query(RoomInviteLink)
        .filter(
            RoomInviteLink.room_id == room_id
        )
        .order_by(
            RoomInviteLink.id.desc()
        )
        .all()
    )

    changed = False

    for invitation in email_invitations:
        changed = (
            refresh_email_status(invitation)
            or changed
        )

    for link in links:
        changed = (
            refresh_link_status(link)
            or changed
        )

    if changed:
        db.commit()

    return {
        "room_id": room_id,
        "email_invitations": [
            serialize_email_invitation(
                invitation
            )
            for invitation in email_invitations
        ],
        "share_links": [
            serialize_invite_link(link)
            for link in links
        ],
    }


@router.post("/rooms/{room_id}/email")
def create_email_invitation(
    room_id: int,
    data: EmailInvitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    room = get_manager_room(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    invited_email = normalize_email(
        data.email
    )

    role = validate_invitable_role(
        data.role
    )

    existing_user = (
        db.query(User)
        .filter(
            func.lower(User.email)
            == invited_email
        )
        .first()
    )

    if (
        existing_user is not None
        and (
            room.owner_id == existing_user.id
            or (
                get_existing_membership(
                    db=db,
                    room_id=room.id,
                    user_id=existing_user.id,
                )
                is not None
                and get_existing_membership(
                    db=db,
                    room_id=room.id,
                    user_id=existing_user.id,
                ).status
                == "active"
            )
        )
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "This user already has access "
                "to the room."
            ),
        )

    pending_invitations = (
        db.query(RoomInvitation)
        .filter(
            RoomInvitation.room_id == room.id,
            RoomInvitation.invited_email
            == invited_email,
            RoomInvitation.status
            == "pending",
        )
        .all()
    )

    for pending in pending_invitations:
        refresh_email_status(pending)

    db.flush()

    still_pending = any(
        invitation.status == "pending"
        for invitation in pending_invitations
    )

    if still_pending:
        raise HTTPException(
            status_code=409,
            detail=(
                "A pending invitation already "
                "exists for this email."
            ),
        )

    raw_token = create_raw_token()

    invitation = RoomInvitation(
        room_id=room.id,
        invited_by_user_id=current_user.id,
        invited_email=invited_email,
        role=role,
        token_hash=token_digest(raw_token),
        status="pending",
        expires_at=(
            utc_now()
            + timedelta(
                days=data.expires_in_days
            )
        ),
    )

    db.add(invitation)
    db.commit()
    db.refresh(invitation)

    frontend_base = (
        settings.frontend_app_url.rstrip("/")
    )

    return {
        "invitation": (
            serialize_email_invitation(
                invitation
            )
        ),
        "delivery": {
            "status": "not_sent",
            "message": (
                "Invitation stored securely. "
                "Email delivery is not connected yet."
            ),
        },
        "accept_token": raw_token,
        "accept_api_path": (
            "/api/room-invitations/"
            f"email/{raw_token}/accept"
        ),
        "frontend_accept_url": (
            f"{frontend_base}/"
            f"study-rooms/invite/{raw_token}"
        ),
    }


@router.post("/rooms/{room_id}/links")
def create_invite_link(
    room_id: int,
    data: InviteLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    room = get_manager_room(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    role = validate_invitable_role(
        data.role
    )

    raw_token = create_raw_token()

    link = RoomInviteLink(
        room_id=room.id,
        created_by_user_id=current_user.id,
        role=role,
        token_hash=token_digest(raw_token),
        status="active",
        expires_at=(
            utc_now()
            + timedelta(
                days=data.expires_in_days
            )
        ),
        max_uses=data.max_uses,
        use_count=0,
    )

    db.add(link)
    db.commit()
    db.refresh(link)

    frontend_base = (
        settings.frontend_app_url.rstrip("/")
    )

    return {
        "link": serialize_invite_link(link),
        "share_token": raw_token,
        "join_api_path": (
            "/api/room-invitations/"
            f"links/{raw_token}/join"
        ),
        "share_url": (
            f"{frontend_base}/"
            f"study-rooms/join/{raw_token}"
        ),
    }


@router.delete(
    "/rooms/{room_id}/email/{invitation_id}"
)
def revoke_email_invitation(
    room_id: int,
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    get_manager_room(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    invitation = (
        db.query(RoomInvitation)
        .filter(
            RoomInvitation.id
            == invitation_id,
            RoomInvitation.room_id
            == room_id,
        )
        .first()
    )

    if invitation is None:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found.",
        )

    refresh_email_status(invitation)

    if invitation.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=(
                "Only pending invitations "
                "can be revoked."
            ),
        )

    invitation.status = "revoked"
    invitation.revoked_at = utc_now()

    db.commit()
    db.refresh(invitation)

    return {
        "message": "Invitation revoked.",
        "invitation": (
            serialize_email_invitation(
                invitation
            )
        ),
    }


@router.delete(
    "/rooms/{room_id}/links/{link_id}"
)
def revoke_invite_link(
    room_id: int,
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    get_manager_room(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    link = (
        db.query(RoomInviteLink)
        .filter(
            RoomInviteLink.id == link_id,
            RoomInviteLink.room_id
            == room_id,
        )
        .first()
    )

    if link is None:
        raise HTTPException(
            status_code=404,
            detail="Invite link not found.",
        )

    refresh_link_status(link)

    if link.status != "active":
        raise HTTPException(
            status_code=409,
            detail=(
                "Only active invite links "
                "can be revoked."
            ),
        )

    link.status = "revoked"
    link.revoked_at = utc_now()

    db.commit()
    db.refresh(link)

    return {
        "message": "Invite link revoked.",
        "link": serialize_invite_link(link),
    }


@router.post("/email/{token}/accept")
def accept_email_invitation(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    invitation = (
        db.query(RoomInvitation)
        .filter(
            RoomInvitation.token_hash
            == token_digest(token)
        )
        .first()
    )

    if invitation is None:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found.",
        )

    if refresh_email_status(invitation):
        db.commit()

    if invitation.status == "expired":
        raise HTTPException(
            status_code=410,
            detail="This invitation has expired.",
        )

    if invitation.status == "revoked":
        raise HTTPException(
            status_code=410,
            detail="This invitation was revoked.",
        )

    if invitation.status == "declined":
        raise HTTPException(
            status_code=409,
            detail="This invitation was declined.",
        )

    if invitation.status == "accepted":
        raise HTTPException(
            status_code=409,
            detail=(
                "This invitation was already "
                "accepted."
            ),
        )

    if (
        normalize_email(current_user.email)
        != invitation.invited_email
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "This invitation is not for "
                "your signed-in account."
            ),
        )

    room = get_room_or_404(
        db=db,
        room_id=invitation.room_id,
    )

    membership, already_active = (
        ensure_invited_membership(
            db=db,
            room=room,
            user_id=current_user.id,
            role=invitation.role,
        )
    )

    invitation.status = "accepted"
    invitation.accepted_by_user_id = (
        current_user.id
    )
    invitation.accepted_at = utc_now()

    db.commit()
    db.refresh(membership)
    db.refresh(invitation)

    return {
        "message": "Room invitation accepted.",
        "already_member": already_active,
        "room": {
            "id": room.id,
            "name": room.name,
            "subject": room.subject,
        },
        "membership": {
            "room_id": membership.room_id,
            "user_id": membership.user_id,
            "role": membership.role,
            "status": membership.status,
        },
    }


@router.post("/email/{token}/decline")
def decline_email_invitation(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    invitation = (
        db.query(RoomInvitation)
        .filter(
            RoomInvitation.token_hash
            == token_digest(token)
        )
        .first()
    )

    if invitation is None:
        raise HTTPException(
            status_code=404,
            detail="Invitation not found.",
        )

    if refresh_email_status(invitation):
        db.commit()

    if invitation.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=(
                "This invitation can no "
                "longer be declined."
            ),
        )

    if (
        normalize_email(current_user.email)
        != invitation.invited_email
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "This invitation is not for "
                "your signed-in account."
            ),
        )

    invitation.status = "declined"
    invitation.declined_at = utc_now()

    db.commit()
    db.refresh(invitation)

    return {
        "message": "Invitation declined.",
        "invitation": (
            serialize_email_invitation(
                invitation
            )
        ),
    }


@router.post("/links/{token}/join")
def join_with_invite_link(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    link = (
        db.query(RoomInviteLink)
        .filter(
            RoomInviteLink.token_hash
            == token_digest(token)
        )
        .first()
    )

    if link is None:
        raise HTTPException(
            status_code=404,
            detail="Invite link not found.",
        )

    if refresh_link_status(link):
        db.commit()

    if link.status in {
        "expired",
        "exhausted",
        "revoked",
    }:
        raise HTTPException(
            status_code=410,
            detail=(
                "This invite link is no "
                "longer available."
            ),
        )

    room = get_room_or_404(
        db=db,
        room_id=link.room_id,
    )

    membership, already_active = (
        ensure_invited_membership(
            db=db,
            room=room,
            user_id=current_user.id,
            role=link.role,
        )
    )

    if not already_active:
        link.use_count += 1

    refresh_link_status(link)

    db.commit()
    db.refresh(membership)
    db.refresh(link)

    return {
        "message": "You joined the Study Room.",
        "already_member": already_active,
        "room": {
            "id": room.id,
            "name": room.name,
            "subject": room.subject,
        },
        "membership": {
            "room_id": membership.room_id,
            "user_id": membership.user_id,
            "role": membership.role,
            "status": membership.status,
        },
        "link_status": link.status,
    }
