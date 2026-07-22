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


class SmartScan(Base):
    __tablename__ = "smart_scans"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    owner_id = Column(
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
        default="New Scan",
    )

    status = Column(
        String,
        nullable=False,
        default="draft",
        server_default="draft",
        index=True,
    )

    page_count = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    extracted_text = Column(
        Text,
        nullable=True,
    )

    pdf_filename = Column(
        String,
        nullable=True,
    )

    pdf_file_path = Column(
        Text,
        nullable=True,
    )

    pdf_file_size = Column(
        Integer,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        index=True,
    )


class SmartScanPage(Base):
    __tablename__ = "smart_scan_pages"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    scan_id = Column(
        Integer,
        ForeignKey(
            "smart_scans.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    page_number = Column(
        Integer,
        nullable=False,
        index=True,
    )

    original_filename = Column(
        String,
        nullable=False,
    )

    stored_filename = Column(
        String,
        nullable=False,
        unique=True,
    )

    file_path = Column(
        Text,
        nullable=False,
    )

    file_size = Column(
        Integer,
        nullable=False,
    )

    content_type = Column(
        String,
        nullable=False,
        default="image/jpeg",
    )

    width = Column(
        Integer,
        nullable=False,
    )

    height = Column(
        Integer,
        nullable=False,
    )

    rotation = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    extracted_text = Column(
        Text,
        nullable=True,
    )

    ocr_confidence = Column(
        Integer,
        nullable=True,
    )

    ocr_status = Column(
        String,
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )

    ocr_error = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
