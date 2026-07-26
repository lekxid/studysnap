"""add privacy-safe AI usage analytics

Revision ID: 20260726_ai_usage_analytics
Revises: 20260726_product_analytics
Create Date: 2026-07-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260726_ai_usage_analytics"
down_revision = "20260726_product_analytics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_events",
        sa.Column(
            "id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "room_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "provider",
            sa.String(length=32),
            server_default="openai",
            nullable=False,
        ),
        sa.Column(
            "feature",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column(
            "operation",
            sa.String(length=40),
            nullable=False,
        ),
        sa.Column(
            "model",
            sa.String(length=120),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default="success",
            nullable=False,
        ),
        sa.Column(
            "input_tokens",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "cached_input_tokens",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "output_tokens",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "total_tokens",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "image_count",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "latency_ms",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "estimated_cost_microusd",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "priced",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column(
            "pricing_version",
            sa.String(length=32),
            nullable=False,
        ),
        sa.Column(
            "error_type",
            sa.String(length=80),
            nullable=True,
        ),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["study_rooms.id"],
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    for column in (
        "id",
        "user_id",
        "room_id",
        "provider",
        "feature",
        "operation",
        "model",
        "status",
        "priced",
        "pricing_version",
        "error_type",
        "occurred_at",
    ):
        op.create_index(
            f"ix_ai_usage_events_{column}",
            "ai_usage_events",
            [column],
            unique=False,
        )

    op.create_index(
        "ix_ai_usage_events_user_time",
        "ai_usage_events",
        [
            "user_id",
            "occurred_at",
        ],
        unique=False,
    )

    op.create_index(
        "ix_ai_usage_events_model_time",
        "ai_usage_events",
        [
            "model",
            "occurred_at",
        ],
        unique=False,
    )

    op.create_index(
        "ix_ai_usage_events_feature_time",
        "ai_usage_events",
        [
            "feature",
            "occurred_at",
        ],
        unique=False,
    )

    op.create_index(
        "ix_ai_usage_events_status_time",
        "ai_usage_events",
        [
            "status",
            "occurred_at",
        ],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table(
        "ai_usage_events"
    )
