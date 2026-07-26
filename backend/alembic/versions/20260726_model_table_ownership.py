"""Adopt nine model tables into Alembic ownership.

Revision ID: 20260726_model_table_ownership
Revises: 20260723_central_actions
Create Date: 2026-07-26
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260726_model_table_ownership"
down_revision = "20260723_central_actions"
branch_labels = None
depends_on = None


TABLES = [
    {
        "name": "brain_answer_history",
        "columns": [
            ("id", "int", False, None),
            ("question", "text", False, None),
            ("answer", "text", False, None),
            ("sources_json", "text", False, None),
            ("metadata_json", "text", False, None),
            ("study_room_id", "int", True, None),
            ("owner_id", "int", False, None),
            ("created_at", "dtz", True, "now"),
        ],
        "foreign_keys": [
            ("study_room_id", "study_rooms.id"),
            ("owner_id", "users.id"),
        ],
        "uniques": [],
        "indexes": [
            ("ix_brain_answer_history_id", ("id",), False),
            (
                "ix_brain_answer_history_owner_id",
                ("owner_id",),
                False,
            ),
            (
                "ix_brain_answer_history_study_room_id",
                ("study_room_id",),
                False,
            ),
        ],
    },
    {
        "name": "connected_accounts",
        "columns": [
            ("id", "int", False, None),
            ("user_id", "int", False, None),
            ("provider", "str", False, None),
            ("account_email", "str", True, None),
            ("access_token", "text", False, None),
            ("refresh_token", "text", True, None),
            ("token_type", "str", True, None),
            ("scopes", "text", True, None),
            ("expires_at", "dtz", True, None),
            ("connected_at", "dtz", True, "now"),
            ("last_synced_at", "dtz", True, None),
            ("revoked_at", "dtz", True, None),
        ],
        "foreign_keys": [
            ("user_id", "users.id"),
        ],
        "uniques": [
            (
                "uq_connected_accounts_user_provider",
                ("user_id", "provider"),
            ),
        ],
        "indexes": [
            ("ix_connected_accounts_id", ("id",), False),
            (
                "ix_connected_accounts_user_id",
                ("user_id",),
                False,
            ),
            (
                "ix_connected_accounts_provider",
                ("provider",),
                False,
            ),
        ],
    },
    {
        "name": "learning_events",
        "columns": [
            ("id", "int", False, None),
            ("user_id", "int", False, None),
            ("study_room_id", "int", True, None),
            ("activity_type", "str", False, None),
            ("reference_id", "int", True, None),
            ("result", "str", True, None),
            ("confidence", "int", True, None),
            ("created_at", "dt", True, None),
        ],
        "foreign_keys": [
            ("user_id", "users.id"),
            ("study_room_id", "study_rooms.id"),
        ],
        "uniques": [],
        "indexes": [
            ("ix_learning_events_id", ("id",), False),
        ],
    },
    {
        "name": "room_ai_outputs",
        "columns": [
            ("id", "int", False, None),
            ("room_id", "int", False, None),
            ("owner_id", "int", False, None),
            ("output_type", "str", False, None),
            ("action_type", "str", True, None),
            ("title", "str", False, None),
            ("content", "text", True, None),
            ("content_json", "text", True, None),
            ("source_type", "str", True, None),
            ("source_id", "str", True, None),
            ("linked_note_id", "int", True, None),
            ("linked_quiz_id", "int", True, None),
            (
                "linked_flashcard_ids_json",
                "text",
                True,
                None,
            ),
            ("created_at", "dtz", True, "now"),
        ],
        "foreign_keys": [
            ("room_id", "study_rooms.id"),
            ("owner_id", "users.id"),
        ],
        "uniques": [],
        "indexes": [
            ("ix_room_ai_outputs_id", ("id",), False),
            (
                "ix_room_ai_outputs_room_id",
                ("room_id",),
                False,
            ),
            (
                "ix_room_ai_outputs_owner_id",
                ("owner_id",),
                False,
            ),
            (
                "ix_room_ai_outputs_output_type",
                ("output_type",),
                False,
            ),
            (
                "ix_room_ai_outputs_action_type",
                ("action_type",),
                False,
            ),
            (
                "ix_room_ai_outputs_source_type",
                ("source_type",),
                False,
            ),
            (
                "ix_room_ai_outputs_source_id",
                ("source_id",),
                False,
            ),
            (
                "ix_room_ai_outputs_created_at",
                ("created_at",),
                False,
            ),
        ],
    },
    {
        "name": "room_events",
        "columns": [
            ("id", "int", False, None),
            ("room_id", "int", False, None),
            ("user_id", "int", True, None),
            ("event_type", "str", False, None),
            ("title", "str", False, None),
            ("description", "text", True, None),
            ("details_json", "text", True, None),
            ("created_at", "dtz", True, "now"),
        ],
        "foreign_keys": [
            ("room_id", "study_rooms.id"),
            ("user_id", "users.id"),
        ],
        "uniques": [],
        "indexes": [
            ("ix_room_events_id", ("id",), False),
            (
                "ix_room_events_room_id",
                ("room_id",),
                False,
            ),
            (
                "ix_room_events_user_id",
                ("user_id",),
                False,
            ),
            (
                "ix_room_events_event_type",
                ("event_type",),
                False,
            ),
            (
                "ix_room_events_created_at",
                ("created_at",),
                False,
            ),
        ],
    },
    {
        "name": "room_members",
        "columns": [
            ("id", "int", False, None),
            ("room_id", "int", False, None),
            ("user_id", "int", False, None),
            ("role", "str", False, None),
            ("status", "str", False, None),
            ("joined_at", "dtz", True, "now"),
            ("last_active_at", "dtz", True, None),
        ],
        "foreign_keys": [
            ("room_id", "study_rooms.id"),
            ("user_id", "users.id"),
        ],
        "uniques": [
            (
                "uq_room_members_room_user",
                ("room_id", "user_id"),
            ),
        ],
        "indexes": [
            ("ix_room_members_id", ("id",), False),
            (
                "ix_room_members_room_id",
                ("room_id",),
                False,
            ),
            (
                "ix_room_members_user_id",
                ("user_id",),
                False,
            ),
        ],
    },
    {
        "name": "room_memory_buckets",
        "columns": [
            ("id", "int", False, None),
            ("room_id", "int", False, None),
            ("owner_id", "int", False, None),
            ("bucket_type", "str", False, None),
            ("summary", "text", True, None),
            ("data_json", "text", True, None),
            ("created_at", "dtz", True, "now"),
            ("updated_at", "dtz", True, "now"),
        ],
        "foreign_keys": [
            ("room_id", "study_rooms.id"),
            ("owner_id", "users.id"),
        ],
        "uniques": [
            (
                "uq_room_memory_bucket_room_owner_type",
                ("room_id", "owner_id", "bucket_type"),
            ),
        ],
        "indexes": [
            (
                "ix_room_memory_buckets_id",
                ("id",),
                False,
            ),
            (
                "ix_room_memory_buckets_room_id",
                ("room_id",),
                False,
            ),
            (
                "ix_room_memory_buckets_owner_id",
                ("owner_id",),
                False,
            ),
            (
                "ix_room_memory_buckets_bucket_type",
                ("bucket_type",),
                False,
            ),
        ],
    },
    {
        "name": "user_sessions",
        "columns": [
            ("id", "int", False, None),
            ("user_id", "int", False, None),
            ("session_token", "str", False, None),
            ("device_name", "str", False, None),
            ("browser", "str", False, None),
            ("operating_system", "str", False, None),
            ("ip_address", "str", True, None),
            ("user_agent", "text", True, None),
            ("is_trusted", "bool", False, None),
            ("created_at", "dt", False, None),
            ("last_active_at", "dt", False, None),
            ("revoked_at", "dt", True, None),
        ],
        "foreign_keys": [
            ("user_id", "users.id"),
        ],
        "uniques": [],
        "indexes": [
            ("ix_user_sessions_id", ("id",), False),
            (
                "ix_user_sessions_user_id",
                ("user_id",),
                False,
            ),
            (
                "ix_user_sessions_session_token",
                ("session_token",),
                True,
            ),
        ],
    },
    {
        "name": "user_settings",
        "columns": [
            ("id", "int", False, None),
            ("user_id", "int", False, None),
            ("learning_mode", "str", False, None),
            ("knowledge_level", "str", False, None),
            ("progress_sharing", "str", False, None),
            ("favorite_subject", "str", False, None),
            ("selected_subjects", "json", False, None),
            ("daily_goal", "str", False, None),
            ("notifications", "str", False, None),
            ("theme", "str", False, None),
            ("ai_memory_enabled", "bool", False, None),
            (
                "save_notes_to_memory",
                "bool",
                False,
                None,
            ),
            (
                "save_flashcards_to_memory",
                "bool",
                False,
                None,
            ),
            (
                "save_quiz_results_to_memory",
                "bool",
                False,
                None,
            ),
            (
                "save_weak_strong_concepts",
                "bool",
                False,
                None,
            ),
            (
                "save_study_history",
                "bool",
                False,
                None,
            ),
            ("connected_apps", "json", False, None),
            ("auto_import_rules", "json", False, None),
            ("last_opened_subject", "str", True, None),
            ("last_opened_pdf_id", "int", True, None),
            (
                "last_ai_conversation_id",
                "int",
                True,
                None,
            ),
            ("created_at", "dt", False, None),
            ("updated_at", "dt", False, None),
        ],
        "foreign_keys": [
            ("user_id", "users.id"),
        ],
        "uniques": [],
        "indexes": [
            ("ix_user_settings_id", ("id",), False),
            (
                "ix_user_settings_user_id",
                ("user_id",),
                True,
            ),
        ],
    },
]


def make_type(type_name: str) -> sa.types.TypeEngine:
    factories = {
        "int": sa.Integer,
        "str": sa.String,
        "text": sa.Text,
        "bool": sa.Boolean,
        "json": sa.JSON,
        "dt": sa.DateTime,
        "dtz": lambda: sa.DateTime(
            timezone=True
        ),
    }

    return factories[type_name]()


def table_exists(
    inspector: sa.Inspector,
    table_name: str,
) -> bool:
    return table_name in inspector.get_table_names()


def column_names(
    inspector: sa.Inspector,
    table_name: str,
) -> set[str]:
    return {
        column["name"]
        for column in inspector.get_columns(
            table_name
        )
    }


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


def build_elements(
    specification: dict,
) -> list[object]:
    elements: list[object] = []

    for (
        column_name,
        type_name,
        nullable,
        default_name,
    ) in specification["columns"]:
        arguments = {
            "nullable": nullable,
        }

        if default_name == "now":
            arguments["server_default"] = (
                sa.func.now()
            )

        elements.append(
            sa.Column(
                column_name,
                make_type(type_name),
                **arguments,
            )
        )

    for (
        local_column,
        remote_column,
    ) in specification["foreign_keys"]:
        elements.append(
            sa.ForeignKeyConstraint(
                [local_column],
                [remote_column],
            )
        )

    elements.append(
        sa.PrimaryKeyConstraint("id")
    )

    for (
        constraint_name,
        columns,
    ) in specification["uniques"]:
        elements.append(
            sa.UniqueConstraint(
                *columns,
                name=constraint_name,
            )
        )

    return elements


def ensure_table(
    specification: dict,
) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_name = specification["name"]

    expected_columns = {
        column[0]
        for column in specification["columns"]
    }

    if not table_exists(
        inspector,
        table_name,
    ):
        op.create_table(
            table_name,
            *build_elements(specification),
        )
    else:
        existing_columns = column_names(
            inspector,
            table_name,
        )

        missing_columns = (
            expected_columns - existing_columns
        )

        if missing_columns:
            raise RuntimeError(
                f"Cannot adopt incomplete table "
                f"{table_name!r}. Missing columns: "
                f"{sorted(missing_columns)}"
            )

    inspector = sa.inspect(bind)

    existing_indexes = index_names(
        inspector,
        table_name,
    )

    for (
        index_name,
        columns,
        unique,
    ) in specification["indexes"]:
        if index_name not in existing_indexes:
            op.create_index(
                index_name,
                table_name,
                list(columns),
                unique=unique,
            )


def upgrade() -> None:
    for specification in TABLES:
        ensure_table(specification)


def downgrade() -> None:
    bind = op.get_bind()

    for specification in reversed(TABLES):
        inspector = sa.inspect(bind)
        table_name = specification["name"]

        if table_exists(
            inspector,
            table_name,
        ):
            op.drop_table(table_name)
