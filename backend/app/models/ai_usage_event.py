from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.sql import func

from app.database import Base


class AIUsageEvent(Base):
    __tablename__ = "ai_usage_events"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=True,
        index=True,
    )

    provider = Column(
        String(32),
        nullable=False,
        default="openai",
        server_default="openai",
        index=True,
    )

    feature = Column(
        String(64),
        nullable=False,
        index=True,
    )

    operation = Column(
        String(40),
        nullable=False,
        index=True,
    )

    model = Column(
        String(120),
        nullable=False,
        index=True,
    )

    status = Column(
        String(20),
        nullable=False,
        default="success",
        server_default="success",
        index=True,
    )

    input_tokens = Column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
    )

    cached_input_tokens = Column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
    )

    output_tokens = Column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
    )

    total_tokens = Column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
    )

    image_count = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    latency_ms = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    estimated_cost_microusd = Column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
    )

    priced = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
        index=True,
    )

    pricing_version = Column(
        String(32),
        nullable=False,
        index=True,
    )

    error_type = Column(
        String(80),
        nullable=True,
        index=True,
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
            "ix_ai_usage_events_user_time",
            "user_id",
            "occurred_at",
        ),
        Index(
            "ix_ai_usage_events_model_time",
            "model",
            "occurred_at",
        ),
        Index(
            "ix_ai_usage_events_feature_time",
            "feature",
            "occurred_at",
        ),
        Index(
            "ix_ai_usage_events_status_time",
            "status",
            "occurred_at",
        ),
    )
