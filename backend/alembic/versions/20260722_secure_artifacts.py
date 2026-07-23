"""add secure user-owned artifacts

Revision ID: 20260722_secure_artifacts
Revises: 20260722_file_brain_uploads
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260722_secure_artifacts"
down_revision = "20260722_file_brain_uploads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "artifacts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column(
            "kind",
            sa.String(),
            nullable=False,
            server_default="document",
        ),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("stored_filename", sa.String(), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default="ready",
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "download_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "last_downloaded_at",
            sa.DateTime(timezone=True),
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
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["ai_conversations.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["ai_messages.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "stored_filename",
            name="uq_artifacts_stored_filename",
        ),
    )

    for name, columns in [
        ("ix_artifacts_id", ["id"]),
        ("ix_artifacts_owner_id", ["owner_id"]),
        ("ix_artifacts_conversation_id", ["conversation_id"]),
        ("ix_artifacts_message_id", ["message_id"]),
        ("ix_artifacts_kind", ["kind"]),
        ("ix_artifacts_sha256", ["sha256"]),
        ("ix_artifacts_status", ["status"]),
        ("ix_artifacts_expires_at", ["expires_at"]),
        ("ix_artifacts_created_at", ["created_at"]),
    ]:
        op.create_index(name, "artifacts", columns, unique=False)


def downgrade() -> None:
    op.drop_table("artifacts")
