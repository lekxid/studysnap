from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class StudyMaterial(Base):
    __tablename__ = "study_materials"

    id = Column(Integer, primary_key=True, index=True)

    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False, unique=True)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    sha256 = Column(
        String(64),
        nullable=True,
        index=True,
    )

    content_type = Column(String, nullable=True)
    material_type = Column(String, nullable=False, default="file")
    extracted_text = Column(Text, nullable=True)

    purpose_category = Column(String, nullable=True)
    content_category = Column(String, nullable=True)
    detected_topic = Column(String, nullable=True)
    intelligence_summary = Column(Text, nullable=True)
    classification_confidence = Column(Integer, nullable=True)
    intelligence_status = Column(
        String,
        nullable=False,
        default="pending",
    )
    intelligence_error = Column(Text, nullable=True)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)

    study_room_id = Column(Integer, ForeignKey("study_rooms.id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_opened_at = Column(DateTime(timezone=True), nullable=True)
