from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class DashboardActivity(Base):
    """
    A meaningful event displayed in the student's unified learning feed.

    user_id identifies the student whose dashboard owns the activity.
    actor_user_id identifies who performed the action when relevant,
    such as a classmate sending a group message.
    """

    __tablename__ = "dashboard_activities"

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

    room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=True,
        index=True,
    )

    actor_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    activity_type = Column(
        String,
        nullable=False,
        index=True,
    )

    entity_type = Column(
        String,
        nullable=True,
        index=True,
    )

    entity_id = Column(
        Integer,
        nullable=True,
    )

    title = Column(
        String,
        nullable=False,
    )

    description = Column(
        Text,
        nullable=True,
    )

    action_label = Column(
        String,
        nullable=True,
    )

    action_href = Column(
        Text,
        nullable=True,
    )

    priority = Column(
        Integer,
        nullable=False,
        default=0,
    )

    is_resolved = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    session_key = Column(
        String,
        nullable=True,
        index=True,
    )

    dedupe_key = Column(
        String,
        nullable=True,
    )

    metadata_json = Column(
        Text,
        nullable=True,
    )

    occurred_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "dedupe_key",
            name="uq_dashboard_activities_user_dedupe",
        ),
        Index(
            "ix_dashboard_activities_user_time",
            "user_id",
            "occurred_at",
        ),
        Index(
            "ix_dashboard_activities_user_attention",
            "user_id",
            "is_resolved",
            "priority",
            "occurred_at",
        ),
    )
