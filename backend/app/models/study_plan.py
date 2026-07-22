from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
)

from app.database import Base


class StudyPlan(Base):
    __tablename__ = "study_plans"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
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

    title = Column(
        String,
        nullable=False,
    )

    subject = Column(
        String,
        nullable=False,
        default="Study",
    )

    description = Column(
        String,
        nullable=True,
    )

    scheduled_for = Column(
        DateTime,
        nullable=False,
        index=True,
    )

    duration_minutes = Column(
        Integer,
        nullable=False,
        default=25,
    )

    priority = Column(
        String,
        nullable=False,
        default="Medium",
    )

    status = Column(
        String,
        nullable=False,
        default="Planned",
        index=True,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
