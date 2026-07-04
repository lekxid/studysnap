"""add ai conversation mode

Revision ID: 20260703_ai_mode
Revises: bb01b02b6270
Create Date: 2026-07-03
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260703_ai_mode"
down_revision: Union[str, None] = "bb01b02b6270"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_conversations",
        sa.Column(
            "mode",
            sa.String(),
            nullable=False,
            server_default="general",
        ),
    )
    op.create_index(
        "ix_ai_conversations_mode",
        "ai_conversations",
        ["mode"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ai_conversations_mode",
        table_name="ai_conversations",
    )
    op.drop_column("ai_conversations", "mode")
