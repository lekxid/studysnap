"""add dashboard attachment actions

Revision ID: 20260722_dashboard_attachment_actions
Revises: 20260722_real_planner
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260722_dashboard_attachment_actions"
down_revision = "20260722_real_planner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table(
        "ai_messages"
    ) as batch_op:
        batch_op.add_column(
            sa.Column(
                "attachment_is_pinned",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )

        batch_op.create_index(
            "ix_ai_messages_attachment_is_pinned",
            ["attachment_is_pinned"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table(
        "ai_messages"
    ) as batch_op:
        batch_op.drop_index(
            "ix_ai_messages_attachment_is_pinned"
        )

        batch_op.drop_column(
            "attachment_is_pinned"
        )
