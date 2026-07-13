from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.sql import func

from app.database import Base


class RoomInvitation(Base):
    __tablename__ = "room_invitations"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=False,
        index=True,
    )

    invited_by_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    invited_email = Column(
        String(320),
        nullable=False,
        index=True,
    )

    role = Column(
        String(30),
        nullable=False,
        default="member",
    )

    token_hash = Column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    status = Column(
        String(30),
        nullable=False,
        default="pending",
        index=True,
    )

    expires_at = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    accepted_by_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    accepted_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    declined_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    revoked_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
