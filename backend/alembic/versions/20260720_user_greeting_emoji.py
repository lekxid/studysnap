"""add user greeting emoji

Revision ID: 20260720_user_greeting_emoji
Revises: 20260720_password_reset
Create Date: 2026-07-20
"""

from alembic import op
import sqlalchemy as sa


revision = "20260720_user_greeting_emoji"
down_revision = "20260720_password_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "greeting_emoji",
            sa.String(length=32),
            nullable=True,
            server_default="👋",
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "users",
        "greeting_emoji",
    )
