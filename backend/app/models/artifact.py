from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    conversation_id = Column(
        Integer,
        ForeignKey("ai_conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    message_id = Column(
        Integer,
        ForeignKey("ai_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    kind = Column(
        String,
        nullable=False,
        default="document",
        server_default="document",
        index=True,
    )
    filename = Column(String, nullable=False)
    stored_filename = Column(
        String,
        nullable=False,
        unique=True,
    )
    file_path = Column(Text, nullable=False)
    file_size = Column(Integer, nullable=False)
    content_type = Column(String, nullable=False)
    sha256 = Column(String(64), nullable=False, index=True)

    status = Column(
        String,
        nullable=False,
        default="ready",
        server_default="ready",
        index=True,
    )
    expires_at = Column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    download_count = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    last_downloaded_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default="CURRENT_TIMESTAMP",
        index=True,
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default="CURRENT_TIMESTAMP",
    )
