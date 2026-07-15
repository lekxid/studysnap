"""add user profile avatar

Revision ID: 20260715_user_profile_avatar
Revises: 20260715_material_intelligence
Create Date: 2026-07-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260715_user_profile_avatar"
down_revision = "20260715_material_intelligence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "avatar_path",
            sa.String(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "users",
        "avatar_path",
    )
