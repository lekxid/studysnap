"""add file brain upload state

Revision ID: 20260722_file_brain_uploads
Revises: 20260722_file_brain_foundation
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260722_file_brain_uploads"
down_revision = (
    "20260722_file_brain_foundation"
)
branch_labels = None
depends_on = None


def get_columns(
    inspector: sa.Inspector,
) -> set[str]:
    return {
        column["name"]
        for column
        in inspector.get_columns(
            "file_brain_items"
        )
    }


def get_indexes(
    inspector: sa.Inspector,
) -> set[str]:
    return {
        index["name"]
        for index
        in inspector.get_indexes(
            "file_brain_items"
        )
        if index.get("name")
    }


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    columns = get_columns(inspector)
    added_duplicate_item_id = (
        "duplicate_item_id"
        not in columns
    )

    with op.batch_alter_table(
        "file_brain_items"
    ) as batch_op:
        if "duplicate_item_id" not in columns:
            batch_op.add_column(
                sa.Column(
                    "duplicate_item_id",
                    sa.Integer(),
                    nullable=True,
                )
            )

        if "upload_id" not in columns:
            batch_op.add_column(
                sa.Column(
                    "upload_id",
                    sa.String(length=32),
                    nullable=True,
                )
            )

        if "upload_state" not in columns:
            batch_op.add_column(
                sa.Column(
                    "upload_state",
                    sa.String(length=32),
                    nullable=False,
                    server_default="not_started",
                )
            )

        if "uploaded_bytes" not in columns:
            batch_op.add_column(
                sa.Column(
                    "uploaded_bytes",
                    sa.BigInteger(),
                    nullable=False,
                    server_default="0",
                )
            )

        if "total_chunks" not in columns:
            batch_op.add_column(
                sa.Column(
                    "total_chunks",
                    sa.Integer(),
                    nullable=True,
                )
            )

        if "uploaded_chunks" not in columns:
            batch_op.add_column(
                sa.Column(
                    "uploaded_chunks",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                )
            )

        if "progress_percent" not in columns:
            batch_op.add_column(
                sa.Column(
                    "progress_percent",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                )
            )

        if "upload_attempts" not in columns:
            batch_op.add_column(
                sa.Column(
                    "upload_attempts",
                    sa.Integer(),
                    nullable=False,
                    server_default="0",
                )
            )

        if "staging_path" not in columns:
            batch_op.add_column(
                sa.Column(
                    "staging_path",
                    sa.Text(),
                    nullable=True,
                )
            )

        if "upload_started_at" not in columns:
            batch_op.add_column(
                sa.Column(
                    "upload_started_at",
                    sa.DateTime(timezone=True),
                    nullable=True,
                )
            )

        if "upload_completed_at" not in columns:
            batch_op.add_column(
                sa.Column(
                    "upload_completed_at",
                    sa.DateTime(timezone=True),
                    nullable=True,
                )
            )

        if added_duplicate_item_id:
            batch_op.create_foreign_key(
                (
                    "fk_file_brain_items_"
                    "duplicate_item_id"
                ),
                "file_brain_items",
                ["duplicate_item_id"],
                ["id"],
            )

    inspector = sa.inspect(bind)
    indexes = get_indexes(inspector)

    wanted_indexes = [
        (
            "ix_file_brain_items_duplicate_item_id",
            ["duplicate_item_id"],
        ),
        (
            "ix_file_brain_items_upload_id",
            ["upload_id"],
        ),
        (
            "ix_file_brain_items_upload_state",
            ["upload_state"],
        ),
    ]

    for name, column_names in wanted_indexes:
        if name not in indexes:
            op.create_index(
                name,
                "file_brain_items",
                column_names,
                unique=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    indexes = get_indexes(inspector)

    for name in [
        "ix_file_brain_items_upload_state",
        "ix_file_brain_items_upload_id",
        (
            "ix_file_brain_items_"
            "duplicate_item_id"
        ),
    ]:
        if name in indexes:
            op.drop_index(
                name,
                table_name="file_brain_items",
            )

    inspector = sa.inspect(bind)

    foreign_keys = {
        foreign_key.get("name")
        for foreign_key
        in inspector.get_foreign_keys(
            "file_brain_items"
        )
    }

    columns = get_columns(inspector)

    with op.batch_alter_table(
        "file_brain_items"
    ) as batch_op:
        if (
            "fk_file_brain_items_duplicate_item_id"
            in foreign_keys
        ):
            batch_op.drop_constraint(
                (
                    "fk_file_brain_items_"
                    "duplicate_item_id"
                ),
                type_="foreignkey",
            )

        for column_name in [
            "upload_completed_at",
            "upload_started_at",
            "staging_path",
            "upload_attempts",
            "progress_percent",
            "uploaded_chunks",
            "total_chunks",
            "uploaded_bytes",
            "upload_state",
            "upload_id",
            "duplicate_item_id",
        ]:
            if column_name in columns:
                batch_op.drop_column(
                    column_name
                )
