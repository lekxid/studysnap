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


class UserResumeState(Base):
    """
    Stores the student's latest meaningful stopping points.

    Specific entity IDs are intentionally generic because StudySnap currently
    has both legacy PDF records and universal study-material records.
    """

    __tablename__ = "user_resume_states"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
        index=True,
    )

    last_room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=True,
        index=True,
    )

    last_room_tab = Column(
        String,
        nullable=True,
    )

    last_entity_type = Column(
        String,
        nullable=True,
    )

    last_entity_id = Column(
        Integer,
        nullable=True,
    )

    last_material_id = Column(
        Integer,
        nullable=True,
    )

    last_material_type = Column(
        String,
        nullable=True,
    )

    last_note_id = Column(
        Integer,
        nullable=True,
    )

    last_quiz_id = Column(
        Integer,
        nullable=True,
    )

    last_quiz_attempt_id = Column(
        Integer,
        nullable=True,
    )

    last_ai_conversation_id = Column(
        Integer,
        nullable=True,
    )

    last_group_room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=True,
    )

    last_group_message_id = Column(
        Integer,
        ForeignKey("room_messages.id"),
        nullable=True,
    )

    last_action_type = Column(
        String,
        nullable=True,
    )

    last_action_href = Column(
        Text,
        nullable=True,
    )

    metadata_json = Column(
        Text,
        nullable=True,
    )

    last_action_at = Column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
