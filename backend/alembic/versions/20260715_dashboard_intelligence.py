"""add dashboard intelligence foundation

Revision ID: 20260715_dashboard_intelligence
Revises: 20260713_room_messages
Create Date: 2026-07-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260715_dashboard_intelligence"

down_revision: Union[str, None] = (
    "20260713_room_messages"
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
        "dashboard_activities",
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
            "actor_user_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "activity_type",
            sa.String(),
            nullable=False,
        ),
        sa.Column(
            "entity_type",
            sa.String(),
            nullable=True,
        ),
        sa.Column(
            "entity_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "title",
            sa.String(),
            nullable=False,
        ),
        sa.Column(
            "description",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "action_label",
            sa.String(),
            nullable=True,
        ),
        sa.Column(
            "action_href",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "priority",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "is_resolved",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "session_key",
            sa.String(),
            nullable=True,
        ),
        sa.Column(
            "dedupe_key",
            sa.String(),
            nullable=True,
        ),
        sa.Column(
            "metadata_json",
            sa.Text(),
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
            ["user_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["study_rooms.id"],
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "dedupe_key",
            name="uq_dashboard_activities_user_dedupe",
        ),
    )

    op.create_index(
        "ix_dashboard_activities_id",
        "dashboard_activities",
        ["id"],
    )

    op.create_index(
        "ix_dashboard_activities_user_id",
        "dashboard_activities",
        ["user_id"],
    )

    op.create_index(
        "ix_dashboard_activities_room_id",
        "dashboard_activities",
        ["room_id"],
    )

    op.create_index(
        "ix_dashboard_activities_actor_user_id",
        "dashboard_activities",
        ["actor_user_id"],
    )

    op.create_index(
        "ix_dashboard_activities_activity_type",
        "dashboard_activities",
        ["activity_type"],
    )

    op.create_index(
        "ix_dashboard_activities_entity_type",
        "dashboard_activities",
        ["entity_type"],
    )

    op.create_index(
        "ix_dashboard_activities_session_key",
        "dashboard_activities",
        ["session_key"],
    )

    op.create_index(
        "ix_dashboard_activities_occurred_at",
        "dashboard_activities",
        ["occurred_at"],
    )

    op.create_index(
        "ix_dashboard_activities_user_time",
        "dashboard_activities",
        ["user_id", "occurred_at"],
    )

    op.create_index(
        "ix_dashboard_activities_user_attention",
        "dashboard_activities",
        [
            "user_id",
            "is_resolved",
            "priority",
            "occurred_at",
        ],
    )

    op.create_table(
        "user_resume_states",
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
            "last_room_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_room_tab",
            sa.String(),
            nullable=True,
        ),
        sa.Column(
            "last_entity_type",
            sa.String(),
            nullable=True,
        ),
        sa.Column(
            "last_entity_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_material_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_material_type",
            sa.String(),
            nullable=True,
        ),
        sa.Column(
            "last_note_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_quiz_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_quiz_attempt_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_ai_conversation_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_group_room_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_group_message_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_action_type",
            sa.String(),
            nullable=True,
        ),
        sa.Column(
            "last_action_href",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "metadata_json",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "last_action_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["last_room_id"],
            ["study_rooms.id"],
        ),
        sa.ForeignKeyConstraint(
            ["last_group_room_id"],
            ["study_rooms.id"],
        ),
        sa.ForeignKeyConstraint(
            ["last_group_message_id"],
            ["room_messages.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            name="uq_user_resume_states_user_id",
        ),
    )

    op.create_index(
        "ix_user_resume_states_id",
        "user_resume_states",
        ["id"],
    )

    op.create_index(
        "ix_user_resume_states_user_id",
        "user_resume_states",
        ["user_id"],
        unique=True,
    )

    op.create_index(
        "ix_user_resume_states_last_room_id",
        "user_resume_states",
        ["last_room_id"],
    )

    op.create_index(
        "ix_user_resume_states_last_action_at",
        "user_resume_states",
        ["last_action_at"],
    )

    op.create_table(
        "room_read_states",
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
            "user_id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "last_read_message_id",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "last_read_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
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
        sa.ForeignKeyConstraint(
            ["last_read_message_id"],
            ["room_messages.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "room_id",
            "user_id",
            name="uq_room_read_states_room_user",
        ),
    )

    op.create_index(
        "ix_room_read_states_id",
        "room_read_states",
        ["id"],
    )

    op.create_index(
        "ix_room_read_states_room_id",
        "room_read_states",
        ["room_id"],
    )

    op.create_index(
        "ix_room_read_states_user_id",
        "room_read_states",
        ["user_id"],
    )

    op.create_index(
        "ix_room_read_states_last_read_message_id",
        "room_read_states",
        ["last_read_message_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_room_read_states_last_read_message_id",
        table_name="room_read_states",
    )

    op.drop_index(
        "ix_room_read_states_user_id",
        table_name="room_read_states",
    )

    op.drop_index(
        "ix_room_read_states_room_id",
        table_name="room_read_states",
    )

    op.drop_index(
        "ix_room_read_states_id",
        table_name="room_read_states",
    )

    op.drop_table("room_read_states")

    op.drop_index(
        "ix_user_resume_states_last_action_at",
        table_name="user_resume_states",
    )

    op.drop_index(
        "ix_user_resume_states_last_room_id",
        table_name="user_resume_states",
    )

    op.drop_index(
        "ix_user_resume_states_user_id",
        table_name="user_resume_states",
    )

    op.drop_index(
        "ix_user_resume_states_id",
        table_name="user_resume_states",
    )

    op.drop_table("user_resume_states")

    op.drop_index(
        "ix_dashboard_activities_user_attention",
        table_name="dashboard_activities",
    )

    op.drop_index(
        "ix_dashboard_activities_user_time",
        table_name="dashboard_activities",
    )

    op.drop_index(
        "ix_dashboard_activities_occurred_at",
        table_name="dashboard_activities",
    )

    op.drop_index(
        "ix_dashboard_activities_session_key",
        table_name="dashboard_activities",
    )

    op.drop_index(
        "ix_dashboard_activities_entity_type",
        table_name="dashboard_activities",
    )

    op.drop_index(
        "ix_dashboard_activities_activity_type",
        table_name="dashboard_activities",
    )

    op.drop_index(
        "ix_dashboard_activities_actor_user_id",
        table_name="dashboard_activities",
    )

    op.drop_index(
        "ix_dashboard_activities_room_id",
        table_name="dashboard_activities",
    )

    op.drop_index(
        "ix_dashboard_activities_user_id",
        table_name="dashboard_activities",
    )

    op.drop_index(
        "ix_dashboard_activities_id",
        table_name="dashboard_activities",
    )

    op.drop_table("dashboard_activities")
