"""add flashcard metadata

Revision ID: 20260707_flashcard_metadata
Revises: 20260703_ai_mode
Create Date: 2026-07-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260707_flashcard_metadata"
down_revision: Union[str, None] = "20260703_ai_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "flashcards",
        sa.Column("tags", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "flashcards",
        sa.Column("difficulty", sa.String(), nullable=False, server_default="medium"),
    )
    op.add_column(
        "flashcards",
        sa.Column("source_type", sa.String(), nullable=False, server_default="manual"),
    )
    op.add_column(
        "flashcards",
        sa.Column("source_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("flashcards", "source_id")
    op.drop_column("flashcards", "source_type")
    op.drop_column("flashcards", "difficulty")
    op.drop_column("flashcards", "tags")
