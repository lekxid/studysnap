from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base


class RoomMemoryBucket(Base):
    __tablename__ = "room_memory_buckets"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("study_rooms.id"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    bucket_type = Column(String, nullable=False, index=True)
    summary = Column(Text, nullable=True)
    data_json = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "room_id",
            "owner_id",
            "bucket_type",
            name="uq_room_memory_bucket_room_owner_type",
        ),
    )
