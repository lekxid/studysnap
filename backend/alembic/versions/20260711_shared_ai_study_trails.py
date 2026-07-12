"""add shared AI Study Trail foundation

Revision ID: 20260711_ai_trails
Revises: 20260708_brain_memory
Create Date: 2026-07-11
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260711_ai_trails"
down_revision: Union[str, None] = "20260708_brain_memory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ai_conversations") as batch_op:
        batch_op.alter_column(
            "study_room_id",
            existing_type=sa.Integer(),
            nullable=True,
        )

        batch_op.add_column(
            sa.Column(
                "surface",
                sa.String(),
                nullable=True,
                server_default="room_ai",
            )
        )

        batch_op.add_column(
            sa.Column(
                "context_type",
                sa.String(),
                nullable=True,
            )
        )

        batch_op.add_column(
            sa.Column(
                "context_id",
                sa.Integer(),
                nullable=True,
            )
        )

        batch_op.add_column(
            sa.Column(
                "is_pinned",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )

        batch_op.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )

    op.execute(
        """
        UPDATE ai_conversations
        SET
            surface = COALESCE(surface, 'room_ai'),
            updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
        """
    )

    with op.batch_alter_table("ai_conversations") as batch_op:
        batch_op.alter_column(
            "surface",
            existing_type=sa.String(),
            nullable=False,
            server_default="room_ai",
        )

        batch_op.alter_column(
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
        )

        batch_op.create_index(
            "ix_ai_conversations_surface",
            ["surface"],
        )

        batch_op.create_index(
            "ix_ai_conversations_context_type",
            ["context_type"],
        )

        batch_op.create_index(
            "ix_ai_conversations_context_id",
            ["context_id"],
        )

        batch_op.create_index(
            "ix_ai_conversations_is_pinned",
            ["is_pinned"],
        )

        batch_op.create_index(
            "ix_ai_conversations_updated_at",
            ["updated_at"],
        )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM ai_messages
        WHERE conversation_id IN (
            SELECT id
            FROM ai_conversations
            WHERE study_room_id IS NULL
        )
        """
    )

    op.execute(
        """
        DELETE FROM ai_conversations
        WHERE study_room_id IS NULL
        """
    )

    with op.batch_alter_table("ai_conversations") as batch_op:
        batch_op.drop_index(
            "ix_ai_conversations_updated_at"
        )
        batch_op.drop_index(
            "ix_ai_conversations_is_pinned"
        )
        batch_op.drop_index(
            "ix_ai_conversations_context_id"
        )
        batch_op.drop_index(
            "ix_ai_conversations_context_type"
        )
        batch_op.drop_index(
            "ix_ai_conversations_surface"
        )

        batch_op.drop_column("updated_at")
        batch_op.drop_column("is_pinned")
        batch_op.drop_column("context_id")
        batch_op.drop_column("context_type")
        batch_op.drop_column("surface")

        batch_op.alter_column(
            "study_room_id",
            existing_type=sa.Integer(),
            nullable=False,
        )
