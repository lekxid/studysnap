from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CentralAction(Base):
    __tablename__ = "central_actions"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    study_room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=True,
        index=True,
    )

    conversation_id = Column(
        Integer,
        ForeignKey("ai_conversations.id"),
        nullable=True,
        index=True,
    )

    source_message_id = Column(
        Integer,
        ForeignKey("ai_messages.id"),
        nullable=True,
        index=True,
    )

    action_type = Column(
        String(length=40),
        nullable=False,
        index=True,
    )

    status = Column(
        String(length=24),
        nullable=False,
        default="preview",
        server_default="preview",
        index=True,
    )

    idempotency_key = Column(
        String(length=64),
        nullable=False,
    )

    payload_json = Column(
        Text,
        nullable=False,
        default="{}",
        server_default="{}",
    )

    preview_json = Column(
        Text,
        nullable=False,
        default="{}",
        server_default="{}",
    )

    result_json = Column(
        Text,
        nullable=True,
    )

    undo_json = Column(
        Text,
        nullable=True,
    )

    error_message = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        index=True,
    )

    executed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    undone_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "owner_id",
            "idempotency_key",
            name="uq_central_action_owner_key",
        ),
    )
