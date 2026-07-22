"""add real planner foundation

Revision ID: 20260722_real_planner
Revises: 20260720_user_greeting_emoji
Create Date: 2026-07-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260722_real_planner"
down_revision = "20260720_user_greeting_emoji"
branch_labels = None
depends_on = None


TABLE_NAME = "study_plans"


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
        for column in inspector.get_columns(table_name)
    }


def index_names(
    inspector: sa.Inspector,
    table_name: str,
) -> set[str]:
    return {
        index["name"]
        for index in inspector.get_indexes(table_name)
        if index.get("name")
    }


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not table_exists(
        inspector,
        TABLE_NAME,
    ):
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
                "subject",
                sa.String(),
                nullable=False,
                server_default="Study",
            ),
            sa.Column(
                "description",
                sa.String(),
                nullable=True,
            ),
            sa.Column(
                "scheduled_for",
                sa.DateTime(),
                nullable=False,
            ),
            sa.Column(
                "duration_minutes",
                sa.Integer(),
                nullable=False,
                server_default="25",
            ),
            sa.Column(
                "priority",
                sa.String(),
                nullable=False,
                server_default="Medium",
            ),
            sa.Column(
                "status",
                sa.String(),
                nullable=False,
                server_default="Planned",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["study_room_id"],
                ["study_rooms.id"],
            ),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["users.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    else:
        inspector = sa.inspect(bind)
        existing_columns = column_names(
            inspector,
            TABLE_NAME,
        )

        additions = [
            (
                "study_room_id",
                sa.Column(
                    "study_room_id",
                    sa.Integer(),
                    nullable=True,
                ),
            ),
            (
                "subject",
                sa.Column(
                    "subject",
                    sa.String(),
                    nullable=False,
                    server_default="Study",
                ),
            ),
            (
                "duration_minutes",
                sa.Column(
                    "duration_minutes",
                    sa.Integer(),
                    nullable=False,
                    server_default="25",
                ),
            ),
            (
                "priority",
                sa.Column(
                    "priority",
                    sa.String(),
                    nullable=False,
                    server_default="Medium",
                ),
            ),
            (
                "status",
                sa.Column(
                    "status",
                    sa.String(),
                    nullable=False,
                    server_default="Planned",
                ),
            ),
        ]

        for name, column in additions:
            if name not in existing_columns:
                op.add_column(
                    TABLE_NAME,
                    column,
                )

        if "updated_at" not in existing_columns:
            if bind.dialect.name == "sqlite":
                op.add_column(
                    TABLE_NAME,
                    sa.Column(
                        "updated_at",
                        sa.DateTime(),
                        nullable=True,
                    ),
                )

                op.execute(
                    sa.text(
                        """
                        UPDATE study_plans
                        SET updated_at = COALESCE(
                            created_at,
                            CURRENT_TIMESTAMP
                        )
                        WHERE updated_at IS NULL
                        """
                    )
                )

                with op.batch_alter_table(
                    TABLE_NAME
                ) as batch_op:
                    batch_op.alter_column(
                        "updated_at",
                        existing_type=sa.DateTime(),
                        nullable=False,
                    )

            else:
                op.add_column(
                    TABLE_NAME,
                    sa.Column(
                        "updated_at",
                        sa.DateTime(),
                        nullable=False,
                        server_default=sa.func.now(),
                    ),
                )

        inspector = sa.inspect(bind)
        foreign_keys = inspector.get_foreign_keys(
            TABLE_NAME
        )

        has_room_foreign_key = any(
            foreign_key.get(
                "constrained_columns"
            ) == ["study_room_id"]
            for foreign_key in foreign_keys
        )

        if (
            "study_room_id"
            in column_names(
                inspector,
                TABLE_NAME,
            )
            and not has_room_foreign_key
            and bind.dialect.name != "sqlite"
        ):
            op.create_foreign_key(
                "fk_study_plans_study_room_id",
                TABLE_NAME,
                "study_rooms",
                ["study_room_id"],
                ["id"],
            )

    inspector = sa.inspect(bind)
    existing_indexes = index_names(
        inspector,
        TABLE_NAME,
    )

    indexes = [
        (
            "ix_study_plans_id",
            ["id"],
        ),
        (
            "ix_study_plans_user_id",
            ["user_id"],
        ),
        (
            "ix_study_plans_study_room_id",
            ["study_room_id"],
        ),
        (
            "ix_study_plans_scheduled_for",
            ["scheduled_for"],
        ),
        (
            "ix_study_plans_status",
            ["status"],
        ),
    ]

    current_columns = column_names(
        inspector,
        TABLE_NAME,
    )

    for index_name, columns in indexes:
        if (
            index_name not in existing_indexes
            and all(
                column in current_columns
                for column in columns
            )
        ):
            op.create_index(
                index_name,
                TABLE_NAME,
                columns,
                unique=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not table_exists(
        inspector,
        TABLE_NAME,
    ):
        return

    existing_indexes = index_names(
        inspector,
        TABLE_NAME,
    )

    for index_name in [
        "ix_study_plans_status",
        "ix_study_plans_scheduled_for",
        "ix_study_plans_study_room_id",
        "ix_study_plans_user_id",
        "ix_study_plans_id",
    ]:
        if index_name in existing_indexes:
            op.drop_index(
                index_name,
                table_name=TABLE_NAME,
            )

    op.drop_table(TABLE_NAME)
