"""add smart scan foundation

Revision ID: 20260722_smart_scan_foundation
Revises: 20260722_dashboard_attachment_actions
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260722_smart_scan_foundation"
down_revision = (
    "20260722_dashboard_attachment_actions"
)
branch_labels = None
depends_on = None


def table_exists(
    inspector: sa.Inspector,
    table_name: str,
) -> bool:
    return table_name in inspector.get_table_names()


def index_names(
    inspector: sa.Inspector,
    table_name: str,
) -> set[str]:
    return {
        index["name"]
        for index in inspector.get_indexes(
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

    if not table_exists(
        inspector,
        "smart_scans",
    ):
        op.create_table(
            "smart_scans",
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
                "study_room_id",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "title",
                sa.String(),
                nullable=False,
            ),
            sa.Column(
                "status",
                sa.String(),
                nullable=False,
                server_default="draft",
            ),
            sa.Column(
                "page_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "extracted_text",
                sa.Text(),
                nullable=True,
            ),
            sa.Column(
                "pdf_filename",
                sa.String(),
                nullable=True,
            ),
            sa.Column(
                "pdf_file_path",
                sa.Text(),
                nullable=True,
            ),
            sa.Column(
                "pdf_file_size",
                sa.Integer(),
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
                ["owner_id"],
                ["users.id"],
            ),
            sa.ForeignKeyConstraint(
                ["study_room_id"],
                ["study_rooms.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    create_missing_indexes(
        "smart_scans",
        [
            (
                "ix_smart_scans_id",
                ["id"],
            ),
            (
                "ix_smart_scans_owner_id",
                ["owner_id"],
            ),
            (
                "ix_smart_scans_study_room_id",
                ["study_room_id"],
            ),
            (
                "ix_smart_scans_status",
                ["status"],
            ),
            (
                "ix_smart_scans_updated_at",
                ["updated_at"],
            ),
        ],
    )

    inspector = sa.inspect(bind)

    if not table_exists(
        inspector,
        "smart_scan_pages",
    ):
        op.create_table(
            "smart_scan_pages",
            sa.Column(
                "id",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "scan_id",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "page_number",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "original_filename",
                sa.String(),
                nullable=False,
            ),
            sa.Column(
                "stored_filename",
                sa.String(),
                nullable=False,
            ),
            sa.Column(
                "file_path",
                sa.Text(),
                nullable=False,
            ),
            sa.Column(
                "file_size",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "content_type",
                sa.String(),
                nullable=False,
                server_default="image/jpeg",
            ),
            sa.Column(
                "width",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "height",
                sa.Integer(),
                nullable=False,
            ),
            sa.Column(
                "rotation",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "extracted_text",
                sa.Text(),
                nullable=True,
            ),
            sa.Column(
                "ocr_confidence",
                sa.Integer(),
                nullable=True,
            ),
            sa.Column(
                "ocr_status",
                sa.String(),
                nullable=False,
                server_default="pending",
            ),
            sa.Column(
                "ocr_error",
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
                ["scan_id"],
                ["smart_scans.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "stored_filename",
                name=(
                    "uq_smart_scan_pages_"
                    "stored_filename"
                ),
            ),
        )

    create_missing_indexes(
        "smart_scan_pages",
        [
            (
                "ix_smart_scan_pages_id",
                ["id"],
            ),
            (
                "ix_smart_scan_pages_scan_id",
                ["scan_id"],
            ),
            (
                "ix_smart_scan_pages_page_number",
                ["page_number"],
            ),
            (
                "ix_smart_scan_pages_ocr_status",
                ["ocr_status"],
            ),
        ],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if table_exists(
        inspector,
        "smart_scan_pages",
    ):
        op.drop_table(
            "smart_scan_pages"
        )

    inspector = sa.inspect(bind)

    if table_exists(
        inspector,
        "smart_scans",
    ):
        op.drop_table(
            "smart_scans"
        )
