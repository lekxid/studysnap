"""add central action engine foundation

Revision ID: 20260723_central_actions
Revises: 20260723_ai_attachment_refs
Create Date: 2026-07-23
"""

from alembic import op
import sqlalchemy as sa


revision = "20260723_central_actions"
down_revision = "20260723_ai_attachment_refs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "central_actions",
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
            "conversation_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "source_message_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "action_type",
            sa.String(length=40),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=24),
            nullable=False,
            server_default="preview",
        ),
        sa.Column(
            "idempotency_key",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column(
            "payload_json",
            sa.Text(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "preview_json",
            sa.Text(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "result_json",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "undo_json",
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
        sa.Column(
            "executed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "undone_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["study_room_id"],
            ["study_rooms.id"],
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["ai_conversations.id"],
        ),
        sa.ForeignKeyConstraint(
            ["source_message_id"],
            ["ai_messages.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "owner_id",
            "idempotency_key",
            name="uq_central_action_owner_key",
        ),
    )

    op.create_index(
        "ix_central_actions_id",
        "central_actions",
        ["id"],
        unique=False,
    )

    op.create_index(
        "ix_central_actions_owner_id",
        "central_actions",
        ["owner_id"],
        unique=False,
    )

    op.create_index(
        "ix_central_actions_study_room_id",
        "central_actions",
        ["study_room_id"],
        unique=False,
    )

    op.create_index(
        "ix_central_actions_conversation_id",
        "central_actions",
        ["conversation_id"],
        unique=False,
    )

    op.create_index(
        "ix_central_actions_source_message_id",
        "central_actions",
        ["source_message_id"],
        unique=False,
    )

    op.create_index(
        "ix_central_actions_action_type",
        "central_actions",
        ["action_type"],
        unique=False,
    )

    op.create_index(
        "ix_central_actions_status",
        "central_actions",
        ["status"],
        unique=False,
    )

    op.create_index(
        "ix_central_actions_created_at",
        "central_actions",
        ["created_at"],
        unique=False,
    )

    op.create_index(
        "ix_central_actions_updated_at",
        "central_actions",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_central_actions_updated_at",
        table_name="central_actions",
    )

    op.drop_index(
        "ix_central_actions_created_at",
        table_name="central_actions",
    )

    op.drop_index(
        "ix_central_actions_status",
        table_name="central_actions",
    )

    op.drop_index(
        "ix_central_actions_action_type",
        table_name="central_actions",
    )

    op.drop_index(
        "ix_central_actions_source_message_id",
        table_name="central_actions",
    )

    op.drop_index(
        "ix_central_actions_conversation_id",
        table_name="central_actions",
    )

    op.drop_index(
        "ix_central_actions_study_room_id",
        table_name="central_actions",
    )

    op.drop_index(
        "ix_central_actions_owner_id",
        table_name="central_actions",
    )

    op.drop_index(
        "ix_central_actions_id",
        table_name="central_actions",
    )

    op.drop_table("central_actions")
