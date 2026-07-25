from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import app.main  # noqa: F401
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
    event,
    select,
)
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.services.rooms.deletion import (
    cleanup_deleted_room_files,
    delete_room_graph,
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
        (String, Text),
    ):
        return (
            f"{table_name}-"
            f"{column.name}-{token}"
        )

    raise AssertionError(
        "No test value for "
        f"{table_name}.{column.name} "
        f"({column.type!r})"
    )


def insert_minimal(
    db: Session,
    table_name: str,
    overrides: dict[str, object] | None = None,
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


def count_rows(
    db: Session,
    table_name: str,
) -> int:
    table = Base.metadata.tables[
        table_name
    ]

    return len(
        db.execute(
            select(table)
        ).all()
    )


def test_room_delete_removes_owned_content_and_detaches_history(
    tmp_path: Path,
):
    engine = create_engine(
        "sqlite://",
        connect_args={
            "check_same_thread": False
        },
        poolclass=StaticPool,
    )

    @event.listens_for(
        engine,
        "connect",
    )
    def enable_foreign_keys(
        dbapi_connection,
        _connection_record,
    ):
        cursor = dbapi_connection.cursor()
        cursor.execute(
            "PRAGMA foreign_keys=ON"
        )
        cursor.close()

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        user_id = insert_minimal(
            db,
            "users",
            {
                "id": 1,
                "email":
                    "room-delete-owner@example.com",
            },
        )

        room_id = insert_minimal(
            db,
            "study_rooms",
            {
                "id": 10,
                "owner_id": user_id,
                "name": "Delete test room",
                "subject": "Testing",
            },
        )

        insert_minimal(
            db,
            "room_members",
            {
                "room_id": room_id,
                "user_id": user_id,
                "role": "owner",
                "status": "active",
            },
        )

        insert_minimal(
            db,
            "flashcards",
            {
                "study_room_id": room_id,
                "owner_id": user_id,
                "question": "Question",
                "answer": "Answer",
                "tags": "",
                "difficulty": "medium",
                "source_type": "manual",
            },
        )

        quiz_id = insert_minimal(
            db,
            "quizzes",
            {
                "study_room_id": room_id,
                "owner_id": user_id,
                "title": "Room quiz",
            },
        )

        insert_minimal(
            db,
            "quiz_questions",
            {
                "quiz_id": quiz_id,
                "question": "Q",
                "correct_answer": "A",
            },
        )

        material_path = (
            tmp_path / "room-material.txt"
        )
        material_path.write_text(
            "Room material",
            encoding="utf-8",
        )

        insert_minimal(
            db,
            "study_materials",
            {
                "study_room_id": room_id,
                "owner_id": user_id,
                "original_filename":
                    "room-material.txt",
                "stored_filename":
                    f"{uuid4().hex}.txt",
                "file_path":
                    str(material_path),
                "file_size": 13,
                "material_type": "text",
                "content_type": "text/plain",
            },
        )

        message_id = insert_minimal(
            db,
            "room_messages",
            {
                "room_id": room_id,
                "sender_id": user_id,
                "message_type": "text",
                "content": "Hello",
            },
        )

        insert_minimal(
            db,
            "room_read_states",
            {
                "room_id": room_id,
                "user_id": user_id,
                "last_read_message_id":
                    message_id,
            },
        )

        conversation_id = insert_minimal(
            db,
            "ai_conversations",
            {
                "study_room_id": room_id,
                "owner_id": user_id,
                "title": "Preserved chat",
                "mode": "general",
                "surface": "general_ai",
            },
        )

        scan_id = insert_minimal(
            db,
            "smart_scans",
            {
                "study_room_id": room_id,
                "owner_id": user_id,
                "title": "Preserved scan",
                "status": "draft",
            },
        )

        insert_minimal(
            db,
            "user_resume_states",
            {
                "user_id": user_id,
                "last_room_id": room_id,
                "last_group_room_id":
                    room_id,
                "last_group_message_id":
                    message_id,
            },
        )

        db.commit()

        result = delete_room_graph(
            db=db,
            room_id=room_id,
        )

        db.commit()

        failures = (
            cleanup_deleted_room_files(
                result.file_paths
            )
        )

        assert failures == ()
        assert not material_path.exists()

        assert count_rows(
            db,
            "study_rooms",
        ) == 0

        assert count_rows(
            db,
            "flashcards",
        ) == 0

        assert count_rows(
            db,
            "quizzes",
        ) == 0

        assert count_rows(
            db,
            "quiz_questions",
        ) == 0

        assert count_rows(
            db,
            "study_materials",
        ) == 0

        assert count_rows(
            db,
            "room_messages",
        ) == 0

        assert count_rows(
            db,
            "room_read_states",
        ) == 0

        conversations = (
            Base.metadata.tables[
                "ai_conversations"
            ]
        )

        saved_conversation = db.execute(
            select(
                conversations.c.study_room_id
            ).where(
                conversations.c.id
                == conversation_id
            )
        ).scalar_one()

        assert saved_conversation is None

        scans = Base.metadata.tables[
            "smart_scans"
        ]

        saved_scan = db.execute(
            select(
                scans.c.study_room_id
            ).where(
                scans.c.id == scan_id
            )
        ).scalar_one()

        assert saved_scan is None

        resume_states = (
            Base.metadata.tables[
                "user_resume_states"
            ]
        )

        resume_state = db.execute(
            select(
                resume_states.c.last_room_id,
                resume_states.c.last_group_room_id,
                resume_states.c.last_group_message_id,
            )
        ).one()

        assert resume_state == (
            None,
            None,
            None,
        )

        assert (
            result.deleted_counts[
                "study_rooms"
            ]
            == 1
        )

        assert (
            result.deleted_counts[
                "flashcards"
            ]
            == 1
        )

        assert (
            result.detached_counts[
                "ai_conversations."
                "study_room_id"
            ]
            == 1
        )
