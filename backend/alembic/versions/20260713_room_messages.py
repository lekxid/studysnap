"""add durable shared room messages

Revision ID: 20260713_room_messages
Revises: 20260712_room_invites
Create Date: 2026-07-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260713_room_messages"

down_revision: Union[str, None] = (
    "20260712_room_invites"
)

branch_labels: Union[
    str,
    Sequence[str],
    None,
] = None

depends_on: Union[
    str,
    Sequence[str],
    None,
] = None


def upgrade() -> None:
    op.create_table(
        "room_messages",
        sa.Column(
            "id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "room_id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "message_type",
            sa.String(length=30),
            nullable=False,
            server_default="message",
        ),
        sa.Column(
            "content",
            sa.Text(),
            nullable=False,
        ),
        sa.Column(
            "reply_to_message_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "metadata_json",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "edited_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["study_rooms.id"],
        ),
        sa.ForeignKeyConstraint(
            ["sender_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["reply_to_message_id"],
            ["room_messages.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_room_messages_id",
        "room_messages",
        ["id"],
    )

    op.create_index(
        "ix_room_messages_room_id",
        "room_messages",
        ["room_id"],
    )

    op.create_index(
        "ix_room_messages_sender_id",
        "room_messages",
        ["sender_id"],
    )

    op.create_index(
        "ix_room_messages_message_type",
        "room_messages",
        ["message_type"],
    )

    op.create_index(
        "ix_room_messages_reply_to",
        "room_messages",
        ["reply_to_message_id"],
    )

    op.create_index(
        "ix_room_messages_created_at",
        "room_messages",
        ["created_at"],
    )

    op.create_index(
        "ix_room_messages_deleted_at",
        "room_messages",
        ["deleted_at"],
    )

    op.create_index(
        "ix_room_messages_room_message",
        "room_messages",
        ["room_id", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_room_messages_room_message",
        table_name="room_messages",
    )

    op.drop_index(
        "ix_room_messages_deleted_at",
        table_name="room_messages",
    )

    op.drop_index(
        "ix_room_messages_created_at",
        table_name="room_messages",
    )

    op.drop_index(
        "ix_room_messages_reply_to",
        table_name="room_messages",
    )

    op.drop_index(
        "ix_room_messages_message_type",
        table_name="room_messages",
    )

    op.drop_index(
        "ix_room_messages_sender_id",
        table_name="room_messages",
    )

    op.drop_index(
        "ix_room_messages_room_id",
        table_name="room_messages",
    )

    op.drop_index(
        "ix_room_messages_id",
        table_name="room_messages",
    )

    op.drop_table("room_messages")
