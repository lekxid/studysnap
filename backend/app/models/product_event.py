from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func

from app.database import Base


class ProductEvent(Base):
    __tablename__ = "product_events"

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

    event_name = Column(
        String(80),
        nullable=False,
        index=True,
    )

    category = Column(
        String(40),
        nullable=False,
        index=True,
    )

    source = Column(
        String(40),
        nullable=False,
        default="web",
        server_default="web",
        index=True,
    )

    surface = Column(
        String(120),
        nullable=True,
        index=True,
    )

    entity_type = Column(
        String(40),
        nullable=True,
        index=True,
    )

    entity_id = Column(
        Integer,
        nullable=True,
    )

    quantity = Column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    bytes_count = Column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
    )

    metadata_json = Column(
        Text,
        nullable=False,
        default="{}",
        server_default="{}",
    )

    occurred_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        Index(
            "ix_product_events_user_time",
            "user_id",
            "occurred_at",
        ),
        Index(
            "ix_product_events_event_time",
            "event_name",
            "occurred_at",
        ),
        Index(
            "ix_product_events_category_time",
            "category",
            "occurred_at",
        ),
    )
