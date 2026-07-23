"""Add logical AI attachment source references.

Revision ID: 20260723_ai_attachment_refs
Revises: 20260722_secure_artifacts
"""

from alembic import op
import sqlalchemy as sa


revision = "20260723_ai_attachment_refs"
down_revision = "20260722_secure_artifacts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_messages",
        sa.Column(
            "attachment_source_type",
            sa.String(length=40),
            nullable=True,
        ),
    )

    op.add_column(
        "ai_messages",
        sa.Column(
            "attachment_source_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.create_index(
        op.f(
            "ix_ai_messages_attachment_source_type"
        ),
        "ai_messages",
        ["attachment_source_type"],
        unique=False,
    )

    op.create_index(
        op.f(
            "ix_ai_messages_attachment_source_id"
        ),
        "ai_messages",
        ["attachment_source_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f(
            "ix_ai_messages_attachment_source_id"
        ),
        table_name="ai_messages",
    )

    op.drop_index(
        op.f(
            "ix_ai_messages_attachment_source_type"
        ),
        table_name="ai_messages",
    )

    op.drop_column(
        "ai_messages",
        "attachment_source_id",
    )

    op.drop_column(
        "ai_messages",
        "attachment_source_type",
    )
