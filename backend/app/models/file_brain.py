from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base


class FileBrainBatch(Base):
    """
    Durable owner-scoped record for a multi-file
    StudySnap processing operation.
    """

    __tablename__ = "file_brain_batches"

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

    title = Column(
        String(160),
        nullable=False,
        default="File upload",
    )

    source_surface = Column(
        String(64),
        nullable=False,
        default="general_ai",
        index=True,
    )

    status = Column(
        String(40),
        nullable=False,
        default="draft",
        index=True,
    )

    total_items = Column(
        Integer,
        nullable=False,
        default=0,
    )

    duplicate_items = Column(
        Integer,
        nullable=False,
        default=0,
    )

    completed_items = Column(
        Integer,
        nullable=False,
        default=0,
    )

    failed_items = Column(
        Integer,
        nullable=False,
        default=0,
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


class FileBrainItem(Base):
    """
    Persistent state for one file inside a File Brain
    batch.

    The file may remain unassigned until the user
    confirms its destination.
    """

    __tablename__ = "file_brain_items"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    batch_id = Column(
        Integer,
        ForeignKey(
            "file_brain_batches.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    item_order = Column(
        Integer,
        nullable=False,
    )

    original_filename = Column(
        String(255),
        nullable=False,
    )

    content_type = Column(
        String(255),
        nullable=False,
        default="application/octet-stream",
    )

    file_size = Column(
        Integer,
        nullable=False,
    )

    sha256 = Column(
        String(64),
        nullable=True,
        index=True,
    )

    upload_id = Column(
        String(32),
        nullable=True,
        index=True,
    )

    upload_state = Column(
        String(32),
        nullable=False,
        default="not_started",
        index=True,
    )

    uploaded_bytes = Column(
        BigInteger,
        nullable=False,
        default=0,
    )

    total_chunks = Column(
        Integer,
        nullable=True,
    )

    uploaded_chunks = Column(
        Integer,
        nullable=False,
        default=0,
    )

    progress_percent = Column(
        Integer,
        nullable=False,
        default=0,
    )

    upload_attempts = Column(
        Integer,
        nullable=False,
        default=0,
    )

    staging_path = Column(
        Text,
        nullable=True,
    )

    upload_started_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    upload_completed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    status = Column(
        String(40),
        nullable=False,
        default="queued",
        index=True,
    )

    duplicate_kind = Column(
        String(32),
        nullable=True,
    )

    duplicate_item_id = Column(
        Integer,
        ForeignKey("file_brain_items.id"),
        nullable=True,
        index=True,
    )

    duplicate_material_id = Column(
        Integer,
        ForeignKey("study_materials.id"),
        nullable=True,
        index=True,
    )

    suggested_topic = Column(
        String(160),
        nullable=True,
    )

    suggestion_confidence = Column(
        Integer,
        nullable=True,
    )

    suggestion_reason = Column(
        Text,
        nullable=True,
    )

    suggested_room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=True,
        index=True,
    )

    confirmed_room_id = Column(
        Integer,
        ForeignKey("study_rooms.id"),
        nullable=True,
        index=True,
    )

    material_id = Column(
        Integer,
        ForeignKey("study_materials.id"),
        nullable=True,
        index=True,
    )

    current_location_type = Column(
        String(40),
        nullable=True,
    )

    current_location_id = Column(
        Integer,
        nullable=True,
    )

    result_message = Column(
        Text,
        nullable=True,
    )

    error_message = Column(
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
        index=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "batch_id",
            "item_order",
            name=(
                "uq_file_brain_items_"
                "batch_order"
            ),
        ),
    )
