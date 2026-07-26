"""add privacy-safe product analytics

Revision ID: 20260726_product_analytics
Revises: 20260726_model_table_ownership
Create Date: 2026-07-26
"""

from alembic import op
import sqlalchemy as sa


revision = (
    "20260726_product_analytics"
)
down_revision = (
    "20260726_model_table_ownership"
)
branch_labels = None
depends_on = None

TABLE_NAME = "product_events"


def table_exists(
    inspector: sa.Inspector,
) -> bool:
    return (
        TABLE_NAME
        in inspector.get_table_names()
    )


def index_names(
    inspector: sa.Inspector,
) -> set[str]:
    if not table_exists(inspector):
        return set()

    return {
        index["name"]
        for index
        in inspector.get_indexes(
            TABLE_NAME
        )
        if index.get("name")
    }


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not table_exists(inspector):
        op.create_table(
            TABLE_NAME,
            sa.Column(
                "id",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "room_id",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "event_name",
                sa.String(length=80),
                nullable=False,
            ),
            sa.Column(
                "category",
                sa.String(length=40),
                nullable=False,
            ),
            sa.Column(
                "source",
                sa.String(length=40),
                nullable=False,
                server_default="web",
            ),
            sa.Column(
                "surface",
                sa.String(length=120),
                nullable=True,
            ),
            sa.Column(
                "entity_type",
                sa.String(length=40),
                nullable=True,
            ),
            sa.Column(
                "entity_id",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "quantity",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
            sa.Column(
                "bytes_count",
                sa.BigInteger(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "metadata_json",
                sa.Text(),
                nullable=False,
                server_default="{}",
            ),
            sa.Column(
                "occurred_at",
                sa.DateTime(
                    timezone=True
                ),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(
                    timezone=True
                ),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["users.id"],
            ),
            sa.ForeignKeyConstraint(
                ["room_id"],
                ["study_rooms.id"],
            ),
            sa.PrimaryKeyConstraint(
                "id"
            ),
        )

    inspector = sa.inspect(bind)
    existing = index_names(
        inspector
    )

    indexes = [
        (
            "ix_product_events_id",
            ["id"],
        ),
        (
            "ix_product_events_user_id",
            ["user_id"],
        ),
        (
            "ix_product_events_room_id",
            ["room_id"],
        ),
        (
            "ix_product_events_event_name",
            ["event_name"],
        ),
        (
            "ix_product_events_category",
            ["category"],
        ),
        (
            "ix_product_events_source",
            ["source"],
        ),
        (
            "ix_product_events_surface",
            ["surface"],
        ),
        (
            "ix_product_events_entity_type",
            ["entity_type"],
        ),
        (
            "ix_product_events_occurred_at",
            ["occurred_at"],
        ),
        (
            "ix_product_events_user_time",
            [
                "user_id",
                "occurred_at",
            ],
        ),
        (
            "ix_product_events_event_time",
            [
                "event_name",
                "occurred_at",
            ],
        ),
        (
            "ix_product_events_category_time",
            [
                "category",
                "occurred_at",
            ],
        ),
    ]

    for name, columns in indexes:
        if name in existing:
            continue

        op.create_index(
            name,
            TABLE_NAME,
            columns,
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if table_exists(inspector):
        op.drop_table(TABLE_NAME)
