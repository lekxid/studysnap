from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func

from app.database import Base


class RoomMessage(Base):
    __tablename__ = "room_messages"

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

    # Null is allowed for future AI and system messages.
    sender_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    message_type = Column(
        String,
        nullable=False,
        default="message",
        index=True,
    )

    content = Column(
        Text,
        nullable=False,
    )

    reply_to_message_id = Column(
        Integer,
        ForeignKey("room_messages.id"),
        nullable=True,
        index=True,
    )

    metadata_json = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    edited_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    deleted_at = Column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
