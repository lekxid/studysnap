"""add material intelligence fields

Revision ID: 20260715_material_intelligence
Revises: 20260715_dashboard_intelligence
Create Date: 2026-07-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260715_material_intelligence"
down_revision = "20260715_dashboard_intelligence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "study_materials",
        sa.Column(
            "purpose_category",
            sa.String(),
            nullable=True,
        ),
    )
    op.add_column(
        "study_materials",
        sa.Column(
            "content_category",
            sa.String(),
            nullable=True,
        ),
    )
    op.add_column(
        "study_materials",
        sa.Column(
            "detected_topic",
            sa.String(),
            nullable=True,
        ),
    )
    op.add_column(
        "study_materials",
        sa.Column(
            "intelligence_summary",
            sa.Text(),
            nullable=True,
        ),
    )
    op.add_column(
        "study_materials",
        sa.Column(
            "classification_confidence",
            sa.Integer(),
            nullable=True,
        ),
    )
    op.add_column(
        "study_materials",
        sa.Column(
            "intelligence_status",
            sa.String(),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "study_materials",
        sa.Column(
            "intelligence_error",
            sa.Text(),
            nullable=True,
        ),
    )
    op.add_column(
        "study_materials",
        sa.Column(
            "analyzed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "study_materials",
        "analyzed_at",
    )
    op.drop_column(
        "study_materials",
        "intelligence_error",
    )
    op.drop_column(
        "study_materials",
        "intelligence_status",
    )
    op.drop_column(
        "study_materials",
        "classification_confidence",
    )
    op.drop_column(
        "study_materials",
        "intelligence_summary",
    )
    op.drop_column(
        "study_materials",
        "detected_topic",
    )
    op.drop_column(
        "study_materials",
        "content_category",
    )
    op.drop_column(
        "study_materials",
        "purpose_category",
    )
