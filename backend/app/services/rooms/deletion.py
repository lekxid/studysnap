from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session
from sqlalchemy.sql.schema import Column, Table

from app.database import Base


@dataclass(frozen=True)
class RoomDeletionResult:
    deleted_counts: dict[str, int]
    detached_counts: dict[str, int]
    file_paths: tuple[str, ...]


class RoomDeletionGraphError(RuntimeError):
    pass


def _single_primary_key(table: Table) -> Column:
    columns = list(table.primary_key.columns)

    if len(columns) != 1:
        raise RoomDeletionGraphError(
            f"Room deletion requires a single-column primary key for "
            f"{table.name}; found {len(columns)}."
        )

    return columns[0]


def _foreign_keys_to(target: Table):
    for table in Base.metadata.tables.values():
        for foreign_key in table.foreign_keys:
            if foreign_key.column.table is target:
                yield table, foreign_key


def _normalize_ids(values: Iterable[object]) -> set[object]:
    return {
        value
        for value in values
        if value is not None
    }


def delete_room_graph(
    db: Session,
    room_id: int,
) -> RoomDeletionResult:
    """
    Remove records that cannot exist without a study room and detach
    nullable history/context references.

    The graph is read from SQLAlchemy metadata so future room-linked
    tables are handled according to their foreign-key nullability.
    The caller owns commit/rollback.
    """

    room_table = Base.metadata.tables.get(
        "study_rooms"
    )

    if room_table is None:
        raise RoomDeletionGraphError(
            "The study_rooms table is not loaded."
        )

    room_primary_key = _single_primary_key(
        room_table
    )

    existing_room_id = db.execute(
        select(room_primary_key).where(
            room_primary_key == room_id
        )
    ).scalar_one_or_none()

    if existing_room_id is None:
        raise RoomDeletionGraphError(
            f"Study room {room_id} was not found."
        )

    processed_ids: dict[str, set[object]] = (
        defaultdict(set)
    )

    deleted_counts: dict[str, int] = (
        defaultdict(int)
    )

    detached_counts: dict[str, int] = (
        defaultdict(int)
    )

    file_paths: set[str] = set()

    def collect_file_paths(
        table: Table,
        primary_key: Column,
        record_ids: set[object],
    ) -> None:
        file_path_column = table.c.get(
            "file_path"
        )

        if file_path_column is None:
            return

        rows = db.execute(
            select(file_path_column).where(
                primary_key.in_(record_ids)
            )
        ).scalars()

        for value in rows:
            clean_value = str(value or "").strip()

            if clean_value:
                file_paths.add(clean_value)

    def delete_records(
        table: Table,
        record_ids: set[object],
    ) -> None:
        primary_key = _single_primary_key(
            table
        )

        pending_ids = (
            _normalize_ids(record_ids)
            - processed_ids[table.name]
        )

        if not pending_ids:
            return

        processed_ids[table.name].update(
            pending_ids
        )

        for child_table, foreign_key in (
            _foreign_keys_to(table)
        ):
            parent_column = foreign_key.column

            if parent_column is not primary_key:
                raise RoomDeletionGraphError(
                    f"Unsupported foreign key "
                    f"{child_table.name}."
                    f"{foreign_key.parent.name} -> "
                    f"{table.name}."
                    f"{parent_column.name}; the "
                    "reference does not target the "
                    "primary key."
                )

            child_reference = (
                foreign_key.parent
            )

            child_primary_key = (
                _single_primary_key(
                    child_table
                )
            )

            child_ids = _normalize_ids(
                db.execute(
                    select(
                        child_primary_key
                    ).where(
                        child_reference.in_(
                            pending_ids
                        )
                    )
                ).scalars()
            )

            if not child_ids:
                continue

            if child_reference.nullable:
                result = db.execute(
                    update(child_table)
                    .where(
                        child_reference.in_(
                            pending_ids
                        )
                    )
                    .values(
                        {
                            child_reference.key:
                                None
                        }
                    )
                )

                detached_counts[
                    f"{child_table.name}."
                    f"{child_reference.name}"
                ] += max(
                    int(result.rowcount or 0),
                    0,
                )

                continue

            delete_records(
                child_table,
                child_ids,
            )

        collect_file_paths(
            table,
            primary_key,
            pending_ids,
        )

        result = db.execute(
            delete(table).where(
                primary_key.in_(pending_ids)
            )
        )

        deleted_counts[
            table.name
        ] += max(
            int(result.rowcount or 0),
            0,
        )

    for child_table, foreign_key in (
        _foreign_keys_to(room_table)
    ):
        child_reference = foreign_key.parent
        child_primary_key = _single_primary_key(
            child_table
        )

        child_ids = _normalize_ids(
            db.execute(
                select(child_primary_key).where(
                    child_reference == room_id
                )
            ).scalars()
        )

        if not child_ids:
            continue

        if child_reference.nullable:
            result = db.execute(
                update(child_table)
                .where(
                    child_reference == room_id
                )
                .values(
                    {
                        child_reference.key:
                            None
                    }
                )
            )

            detached_counts[
                f"{child_table.name}."
                f"{child_reference.name}"
            ] += max(
                int(result.rowcount or 0),
                0,
            )

            continue

        delete_records(
            child_table,
            child_ids,
        )

    room_result = db.execute(
        delete(room_table).where(
            room_primary_key == room_id
        )
    )

    deleted_counts[
        room_table.name
    ] += max(
        int(room_result.rowcount or 0),
        0,
    )

    return RoomDeletionResult(
        deleted_counts=dict(
            sorted(
                deleted_counts.items()
            )
        ),
        detached_counts=dict(
            sorted(
                detached_counts.items()
            )
        ),
        file_paths=tuple(
            sorted(file_paths)
        ),
    )


def cleanup_deleted_room_files(
    file_paths: Iterable[str],
) -> tuple[str, ...]:
    failures: list[str] = []

    for raw_path in file_paths:
        path = Path(raw_path)

        try:
            path.unlink(missing_ok=True)
        except OSError:
            failures.append(str(path))

    return tuple(failures)
