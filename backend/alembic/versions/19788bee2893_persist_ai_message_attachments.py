"""persist ai message attachments

Revision ID: 19788bee2893
Revises: 20260715_user_profile_avatar
Create Date: 2026-07-18 21:17:46.429074

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '19788bee2893'
down_revision: Union[str, Sequence[str], None] = '20260715_user_profile_avatar'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_messages",
        sa.Column("attachment_filename", sa.String(), nullable=True),
    )
    op.add_column(
        "ai_messages",
        sa.Column("attachment_stored_filename", sa.String(), nullable=True),
    )
    op.add_column(
        "ai_messages",
        sa.Column("attachment_file_path", sa.Text(), nullable=True),
    )
    op.add_column(
        "ai_messages",
        sa.Column("attachment_file_size", sa.Integer(), nullable=True),
    )
    op.add_column(
        "ai_messages",
        sa.Column("attachment_content_type", sa.String(), nullable=True),
    )
    op.add_column(
        "ai_messages",
        sa.Column("attachment_kind", sa.String(), nullable=True),
    )
    op.add_column(
        "ai_messages",
        sa.Column(
            "attachment_hidden_from_feed",
            sa.Boolean(),
            server_default="0",
            nullable=False,
        ),
    )
    op.create_index(
        op.f("ix_ai_messages_attachment_kind"),
        "ai_messages",
        ["attachment_kind"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_ai_messages_attachment_kind"),
        table_name="ai_messages",
    )
    op.drop_column("ai_messages", "attachment_hidden_from_feed")
    op.drop_column("ai_messages", "attachment_kind")
    op.drop_column("ai_messages", "attachment_content_type")
    op.drop_column("ai_messages", "attachment_file_size")
    op.drop_column("ai_messages", "attachment_file_path")
    op.drop_column("ai_messages", "attachment_stored_filename")
    op.drop_column("ai_messages", "attachment_filename")
