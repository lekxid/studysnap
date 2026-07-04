from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
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

    study_room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=False,
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