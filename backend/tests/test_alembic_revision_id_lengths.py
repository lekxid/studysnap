from __future__ import annotations

import ast
from pathlib import Path
from typing import Any


MAX_ALEMBIC_VERSION_LENGTH = 32
EXPECTED_RENAMED_REVISION = (
    "20260722_dash_attach_actions"
)
REMOVED_LONG_REVISION = (
    "20260722_dashboard_attachment_actions"
)


def _migration_directory() -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
    )


def _assignment_value(
    path: Path,
    assignment_name: str,
) -> Any:
    tree = ast.parse(
        path.read_text(encoding="utf-8"),
        filename=str(path),
    )

    for node in tree.body:
        value_node: ast.expr | None = None

        if isinstance(node, ast.Assign):
            matches = any(
                isinstance(target, ast.Name)
                and target.id == assignment_name
                for target in node.targets
            )

            if matches:
                value_node = node.value

        elif isinstance(node, ast.AnnAssign):
            if (
                isinstance(node.target, ast.Name)
                and node.target.id == assignment_name
            ):
                value_node = node.value

        if value_node is not None:
            return ast.literal_eval(value_node)

    return None


def _referenced_revision_ids(value: Any) -> list[str]:
    if value is None:
        return []

    if isinstance(value, str):
        return [value]

    if isinstance(value, (tuple, list)):
        references: list[str] = []

        for item in value:
            if not isinstance(item, str):
                raise AssertionError(
                    "Alembic down_revision collections "
                    "must contain only strings."
                )

            references.append(item)

        return references

    raise AssertionError(
        "Unsupported Alembic down_revision value: "
        f"{value!r}"
    )


def test_alembic_revision_ids_fit_version_table():
    revisions: dict[str, Path] = {}

    for path in sorted(
        _migration_directory().glob("*.py")
    ):
        revision = _assignment_value(
            path,
            "revision",
        )

        if revision is None:
            continue

        assert isinstance(revision, str), (
            f"{path.name} has a non-string revision."
        )

        assert len(revision) <= MAX_ALEMBIC_VERSION_LENGTH, (
            f"{path.name} uses revision {revision!r}, "
            f"which is {len(revision)} characters. "
            "PostgreSQL's Alembic version column "
            "supports 32 characters."
        )

        assert revision not in revisions, (
            f"Duplicate Alembic revision {revision!r} "
            f"in {revisions[revision].name} "
            f"and {path.name}."
        )

        revisions[revision] = path

    assert EXPECTED_RENAMED_REVISION in revisions
    assert REMOVED_LONG_REVISION not in revisions


def test_alembic_down_revisions_resolve():
    migration_files = sorted(
        _migration_directory().glob("*.py")
    )

    revisions = {
        revision
        for path in migration_files
        if (
            revision := _assignment_value(
                path,
                "revision",
            )
        )
    }

    for path in migration_files:
        revision = _assignment_value(
            path,
            "revision",
        )

        if revision is None:
            continue

        down_revision = _assignment_value(
            path,
            "down_revision",
        )

        for reference in _referenced_revision_ids(
            down_revision
        ):
            assert reference in revisions, (
                f"{path.name} references missing "
                f"down_revision {reference!r}."
            )
