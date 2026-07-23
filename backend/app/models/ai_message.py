from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class AIMessage(Base):
    __tablename__ = "ai_messages"

    id = Column(Integer, primary_key=True, index=True)

    conversation_id = Column(
        Integer,
        ForeignKey("ai_conversations.id"),
        nullable=False,
    )

    role = Column(
        Text,
        nullable=False,
    )

    content = Column(
        Text,
        nullable=False,
    )

    attachment_filename = Column(
        String,
        nullable=True,
    )

    attachment_stored_filename = Column(
        String,
        nullable=True,
    )

    attachment_file_path = Column(
        Text,
        nullable=True,
    )

    attachment_file_size = Column(
        Integer,
        nullable=True,
    )

    attachment_content_type = Column(
        String,
        nullable=True,
    )

    attachment_kind = Column(
        String,
        nullable=True,
        index=True,
    )

    attachment_source_type = Column(
        String(40),
        nullable=True,
        index=True,
    )

    attachment_source_id = Column(
        Integer,
        nullable=True,
        index=True,
    )

    attachment_hidden_from_feed = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
    )

    attachment_is_pinned = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )