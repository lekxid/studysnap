from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class RoomReadState(Base):
    """
    Records the newest group message each student has read.

    Unread totals are calculated server-side from messages newer than
    last_read_message_id rather than storing a count that can become stale.
    """

    __tablename__ = "room_read_states"

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

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    last_read_message_id = Column(
        Integer,
        ForeignKey("room_messages.id"),
        nullable=True,
        index=True,
    )

    last_read_at = Column(
        DateTime(timezone=True),
        nullable=True,
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

    __table_args__ = (
        UniqueConstraint(
            "room_id",
            "user_id",
            name="uq_room_read_states_room_user",
        ),
    )
