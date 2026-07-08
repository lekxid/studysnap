"""add brain memory

Revision ID: 20260708_brain_memory
Revises: 20260707_flashcard_metadata
Create Date: 2026-07-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260708_brain_memory"
down_revision: Union[str, None] = "20260707_flashcard_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "brain_memories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("study_room_id", sa.Integer(), nullable=True),
        sa.Column("concept_id", sa.String(), nullable=False),
        sa.Column("concept_name", sa.String(), nullable=False),
        sa.Column("concept_type", sa.String(), nullable=False, server_default="concept"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("mastery_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("strength", sa.String(), nullable=False, server_default="new"),
        sa.Column("seen_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("review_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_seen", sa.DateTime(), nullable=True),
        sa.Column("last_reviewed", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["study_room_id"], ["study_rooms.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "study_room_id", "concept_id", name="uq_brain_memory_user_room_concept"),
    )

    op.create_index(op.f("ix_brain_memories_id"), "brain_memories", ["id"], unique=False)
    op.create_index(op.f("ix_brain_memories_user_id"), "brain_memories", ["user_id"], unique=False)
    op.create_index(op.f("ix_brain_memories_study_room_id"), "brain_memories", ["study_room_id"], unique=False)
    op.create_index(op.f("ix_brain_memories_concept_id"), "brain_memories", ["concept_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_brain_memories_concept_id"), table_name="brain_memories")
    op.drop_index(op.f("ix_brain_memories_study_room_id"), table_name="brain_memories")
    op.drop_index(op.f("ix_brain_memories_user_id"), table_name="brain_memories")
    op.drop_index(op.f("ix_brain_memories_id"), table_name="brain_memories")
    op.drop_table("brain_memories")
