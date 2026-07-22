"""add file brain foundation

Revision ID: 20260722_file_brain_foundation
Revises: 20260722_smart_scan_foundation
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = (
    "20260722_file_brain_foundation"
)
down_revision = (
    "20260722_smart_scan_foundation"
)
branch_labels = None
depends_on = None


def table_exists(
    inspector: sa.Inspector,
    table_name: str,
) -> bool:
    return (
        table_name
        in inspector.get_table_names()
    )


def column_names(
    inspector: sa.Inspector,
    table_name: str,
) -> set[str]:
    return {
        column["name"]
        for column
        in inspector.get_columns(
            table_name
        )
    }


def index_names(
    inspector: sa.Inspector,
    table_name: str,
) -> set[str]:
    return {
        index["name"]
        for index
        in inspector.get_indexes(
            table_name
        )
        if index.get("name")
    }


def create_missing_indexes(
    table_name: str,
    indexes: list[
        tuple[str, list[str]]
    ],
) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing = index_names(
        inspector,
        table_name,
    )

    for index_name, columns in indexes:
        if index_name not in existing:
            op.create_index(
                index_name,
                table_name,
                columns,
                unique=False,
            )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if table_exists(
        inspector,
        "study_materials",
    ):
        columns = column_names(
            inspector,
            "study_materials",
        )

        if "sha256" not in columns:
            with op.batch_alter_table(
                "study_materials"
            ) as batch_op:
                batch_op.add_column(
                    sa.Column(
                        "sha256",
                        sa.String(length=64),
                        nullable=True,
                    )
                )

        inspector = sa.inspect(bind)

        if (
            "ix_study_materials_sha256"
            not in index_names(
                inspector,
                "study_materials",
            )
        ):
            op.create_index(
                "ix_study_materials_sha256",
                "study_materials",
                ["sha256"],
                unique=False,
            )

    inspector = sa.inspect(bind)

    if not table_exists(
        inspector,
        "file_brain_batches",
    ):
        op.create_table(
            "file_brain_batches",
            sa.Column(
                "id",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "owner_id",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "title",
                sa.String(length=160),
                nullable=False,
            ),
            sa.Column(
                "source_surface",
                sa.String(length=64),
                nullable=False,
                server_default="general_ai",
            ),
            sa.Column(
                "status",
                sa.String(length=40),
                nullable=False,
                server_default="draft",
            ),
            sa.Column(
                "total_items",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "duplicate_items",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "completed_items",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "failed_items",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["owner_id"],
                ["users.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    create_missing_indexes(
        "file_brain_batches",
        [
            (
                "ix_file_brain_batches_id",
                ["id"],
            ),
            (
                "ix_file_brain_batches_owner_id",
                ["owner_id"],
            ),
            (
                "ix_file_brain_batches_source_surface",
                ["source_surface"],
            ),
            (
                "ix_file_brain_batches_status",
                ["status"],
            ),
            (
                "ix_file_brain_batches_updated_at",
                ["updated_at"],
            ),
        ],
    )

    inspector = sa.inspect(bind)

    if not table_exists(
        inspector,
        "file_brain_items",
    ):
        op.create_table(
            "file_brain_items",
            sa.Column(
                "id",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "batch_id",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "owner_id",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "item_order",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "original_filename",
                sa.String(length=255),
                nullable=False,
            ),
            sa.Column(
                "content_type",
                sa.String(length=255),
                nullable=False,
                server_default=(
                    "application/octet-stream"
                ),
            ),
            sa.Column(
                "file_size",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "sha256",
                sa.String(length=64),
                nullable=True,
            ),
            sa.Column(
                "status",
                sa.String(length=40),
                nullable=False,
                server_default="queued",
            ),
            sa.Column(
                "duplicate_kind",
                sa.String(length=32),
                nullable=True,
            ),
            sa.Column(
                "duplicate_material_id",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "suggested_topic",
                sa.String(length=160),
                nullable=True,
            ),
            sa.Column(
                "suggestion_confidence",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "suggestion_reason",
                sa.Text(),
                nullable=True,
            ),
            sa.Column(
                "suggested_room_id",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "confirmed_room_id",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "material_id",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "current_location_type",
                sa.String(length=40),
                nullable=True,
            ),
            sa.Column(
                "current_location_id",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "result_message",
                sa.Text(),
                nullable=True,
            ),
            sa.Column(
                "error_message",
                sa.Text(),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["batch_id"],
                ["file_brain_batches.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["owner_id"],
                ["users.id"],
            ),
            sa.ForeignKeyConstraint(
                ["duplicate_material_id"],
                ["study_materials.id"],
            ),
            sa.ForeignKeyConstraint(
                ["suggested_room_id"],
                ["study_rooms.id"],
            ),
            sa.ForeignKeyConstraint(
                ["confirmed_room_id"],
                ["study_rooms.id"],
            ),
            sa.ForeignKeyConstraint(
                ["material_id"],
                ["study_materials.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "batch_id",
                "item_order",
                name=(
                    "uq_file_brain_items_"
                    "batch_order"
                ),
            ),
        )

    create_missing_indexes(
        "file_brain_items",
        [
            (
                "ix_file_brain_items_id",
                ["id"],
            ),
            (
                "ix_file_brain_items_batch_id",
                ["batch_id"],
            ),
            (
                "ix_file_brain_items_owner_id",
                ["owner_id"],
            ),
            (
                "ix_file_brain_items_sha256",
                ["sha256"],
            ),
            (
                "ix_file_brain_items_status",
                ["status"],
            ),
            (
                "ix_file_brain_items_duplicate_material_id",
                ["duplicate_material_id"],
            ),
            (
                "ix_file_brain_items_suggested_room_id",
                ["suggested_room_id"],
            ),
            (
                "ix_file_brain_items_confirmed_room_id",
                ["confirmed_room_id"],
            ),
            (
                "ix_file_brain_items_material_id",
                ["material_id"],
            ),
            (
                "ix_file_brain_items_updated_at",
                ["updated_at"],
            ),
        ],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if table_exists(
        inspector,
        "file_brain_items",
    ):
        op.drop_table(
            "file_brain_items"
        )

    inspector = sa.inspect(bind)

    if table_exists(
        inspector,
        "file_brain_batches",
    ):
        op.drop_table(
            "file_brain_batches"
        )

    inspector = sa.inspect(bind)

    if table_exists(
        inspector,
        "study_materials",
    ):
        columns = column_names(
            inspector,
            "study_materials",
        )

        indexes = index_names(
            inspector,
            "study_materials",
        )

        if (
            "ix_study_materials_sha256"
            in indexes
        ):
            op.drop_index(
                "ix_study_materials_sha256",
                table_name="study_materials",
            )

        if "sha256" in columns:
            with op.batch_alter_table(
                "study_materials"
            ) as batch_op:
                batch_op.drop_column(
                    "sha256"
                )
