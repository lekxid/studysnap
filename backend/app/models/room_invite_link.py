from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.sql import func

from app.database import Base


class RoomInviteLink(Base):
    __tablename__ = "room_invite_links"

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

    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id"),
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
        default="active",
        index=True,
    )

    expires_at = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    max_uses = Column(
        Integer,
        nullable=True,
    )

    use_count = Column(
        Integer,
        nullable=False,
        default=0,
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
