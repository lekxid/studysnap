from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class BrainMemory(Base):
    __tablename__ = "brain_memories"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    study_room_id = Column(Integer, ForeignKey("study_rooms.id"), nullable=True, index=True)

    concept_id = Column(String, nullable=False, index=True)
    concept_name = Column(String, nullable=False)
    concept_type = Column(String, nullable=False, default="concept")

    confidence = Column(Float, nullable=False, default=0.0)
    mastery_score = Column(Float, nullable=False, default=0.0)
    strength = Column(String, nullable=False, default="new")

    seen_count = Column(Integer, nullable=False, default=0)
    review_count = Column(Integer, nullable=False, default=0)

    source = Column(String, nullable=True)
    needs_review = Column(Boolean, nullable=False, default=True)

    last_seen = Column(DateTime, nullable=True, default=datetime.utcnow)
    last_reviewed = Column(DateTime, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "study_room_id",
            "concept_id",
            name="uq_brain_memory_user_room_concept",
        ),
    )
