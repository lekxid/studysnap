from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(
        String,
        nullable=False,
        default="New Conversation",
    )

    mode = Column(
        String,
        nullable=False,
        default="general",
        server_default="general",
        index=True,
    )

    surface = Column(
        String,
        nullable=False,
        default="room_ai",
        server_default="room_ai",
        index=True,
    )

    study_room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=True,
    )

    context_type = Column(
        String,
        nullable=True,
        index=True,
    )

    context_id = Column(
        Integer,
        nullable=True,
        index=True,
    )

    is_pinned = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
        index=True,
    )

    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        index=True,
    )
