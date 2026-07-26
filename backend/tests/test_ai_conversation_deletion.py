from __future__ import annotations

from datetime import (
    datetime,
    timezone,
)
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Integer,
    JSON,
    String,
    Text,
    create_engine,
    event,
    select,
    text,
)
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.database import Base
from app.services.ai_conversation_deletion import (
    delete_ai_conversation_graph,
)


def value_for_column(
    table_name: str,
    column,
):
    token = uuid4().hex

    if isinstance(
        column.type,
        Boolean,
    ):
        return False

    if isinstance(
        column.type,
        Integer,
    ):
        return 1

    if isinstance(
        column.type,
        Float,
    ):
        return 0.0

    if isinstance(
        column.type,
        DateTime,
    ):
        return datetime.now(
            timezone.utc
        )

    if isinstance(
        column.type,
        JSON,
    ):
        return {}

    if isinstance(
        column.type,
        (String, Text),
    ):
        return (
            f"{table_name}-"
            f"{column.name}-{token}"
        )

    raise AssertionError(
        "No test value for "
        f"{table_name}.{column.name}: "
        f"{column.type!r}"
    )


def insert_minimal(
    db: Session,
    table_name: str,
    overrides: (
        dict[str, object] | None
    ) = None,
):
    table = Base.metadata.tables[
        table_name
    ]

    values = dict(overrides or {})

    for column in table.columns:
        if column.name in values:
            continue

        if (
            column.primary_key
            and column.autoincrement
        ):
            continue

        if (
            column.nullable
            or column.default is not None
            or column.server_default
            is not None
        ):
            continue

        values[column.name] = (
            value_for_column(
                table_name,
                column,
            )
        )

    result = db.execute(
        table.insert().values(**values)
    )

    primary_key = list(
        table.primary_key.columns
    )[0]

    return (
        values.get(primary_key.name)
        or result.inserted_primary_key[0]
    )


def test_conversation_deletion_preserves_linked_records(
    tmp_path,
):
    database_path = (
        tmp_path
        / "conversation-deletion.db"
    )

    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={
            "check_same_thread": False,
        },
    )

    @event.listens_for(
        engine,
        "connect",
    )
    def enable_foreign_keys(
        dbapi_connection,
        _connection_record,
    ):
        cursor = (
            dbapi_connection.cursor()
        )
        cursor.execute(
            "PRAGMA foreign_keys=ON"
        )
        cursor.close()

    try:
        Base.metadata.create_all(engine)

        with Session(engine) as db:
            user_id = insert_minimal(
                db,
                "users",
                {
                    "id": 1,
                    "email": (
                        "safe-delete@example.com"
                    ),
                },
            )

            conversation_id = (
                insert_minimal(
                    db,
                    "ai_conversations",
                    {
                        "owner_id": user_id,
                        "title":
                            "Delete safely",
                        "mode": "general",
                        "surface":
                            "general_ai",
                    },
                )
            )

            first_message_id = (
                insert_minimal(
                    db,
                    "ai_messages",
                    {
                        "conversation_id":
                            conversation_id,
                        "role": "user",
                        "content":
                            "Question",
                    },
                )
            )

            second_message_id = (
                insert_minimal(
                    db,
                    "ai_messages",
                    {
                        "conversation_id":
                            conversation_id,
                        "role": "assistant",
                        "content":
                            "Answer",
                    },
                )
            )

            artifact_id = insert_minimal(
                db,
                "artifacts",
                {
                    "owner_id": user_id,
                    "conversation_id":
                        conversation_id,
                    "message_id":
                        second_message_id,
                    "kind": "document",
                    "filename":
                        "answer.txt",
                    "stored_filename":
                        f"{uuid4().hex}.txt",
                    "file_path":
                        "/tmp/answer.txt",
                    "file_size": 6,
                    "content_type":
                        "text/plain",
                    "sha256": "a" * 64,
                    "status": "ready",
                },
            )

            action_id = insert_minimal(
                db,
                "central_actions",
                {
                    "owner_id": user_id,
                    "conversation_id":
                        conversation_id,
                    "source_message_id":
                        first_message_id,
                    "action_type":
                        "create_note",
                    "status": "executed",
                    "idempotency_key":
                        uuid4().hex,
                    "payload_json": "{}",
                    "preview_json": "{}",
                },
            )

            insert_minimal(
                db,
                "user_resume_states",
                {
                    "user_id": user_id,
                    "last_ai_conversation_id":
                        conversation_id,
                },
            )

            insert_minimal(
                db,
                "user_settings",
                {
                    "user_id": user_id,
                    "last_ai_conversation_id":
                        conversation_id,
                },
            )

            db.commit()

            result = (
                delete_ai_conversation_graph(
                    db=db,
                    conversation_id=
                        conversation_id,
                )
            )

            db.commit()

            conversations = (
                Base.metadata.tables[
                    "ai_conversations"
                ]
            )

            messages = (
                Base.metadata.tables[
                    "ai_messages"
                ]
            )

            artifacts = (
                Base.metadata.tables[
                    "artifacts"
                ]
            )

            actions = (
                Base.metadata.tables[
                    "central_actions"
                ]
            )

            resume_states = (
                Base.metadata.tables[
                    "user_resume_states"
                ]
            )

            settings = (
                Base.metadata.tables[
                    "user_settings"
                ]
            )

            assert db.execute(
                select(
                    conversations.c.id
                )
            ).all() == []

            assert db.execute(
                select(messages.c.id)
            ).all() == []

            artifact = db.execute(
                select(
                    artifacts
                    .c.conversation_id,
                    artifacts.c.message_id,
                ).where(
                    artifacts.c.id
                    == artifact_id
                )
            ).one()

            assert artifact == (
                None,
                None,
            )

            action = db.execute(
                select(
                    actions
                    .c.conversation_id,
                    actions
                    .c.source_message_id,
                ).where(
                    actions.c.id
                    == action_id
                )
            ).one()

            assert action == (
                None,
                None,
            )

            assert db.execute(
                select(
                    resume_states
                    .c.last_ai_conversation_id
                )
            ).scalar_one() is None

            assert db.execute(
                select(
                    settings
                    .c.last_ai_conversation_id
                )
            ).scalar_one() is None

            assert db.execute(
                text(
                    "PRAGMA foreign_key_check"
                )
            ).all() == []

            assert (
                result.deleted_counts[
                    "ai_conversations"
                ]
                == 1
            )

            assert (
                result.deleted_counts[
                    "ai_messages"
                ]
                == 2
            )
    finally:
        engine.dispose()
