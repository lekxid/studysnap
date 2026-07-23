from pathlib import Path
import re


def test_attachment_is_pinned_uses_portable_boolean_default():
    migration = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260722_dashboard_attachment_actions.py"
    )

    source = migration.read_text(
        encoding="utf-8",
    )

    position = source.index(
        "attachment_is_pinned"
    )

    nearby_source = source[
        position:
        position + 500
    ]

    compact = re.sub(
        r"\s+",
        "",
        nearby_source,
    )

    assert (
        "server_default=sa.false()"
        in compact
    )

    assert not re.search(
        r'''server_default=(?:
            ["']0["']|
            sa\.text\(["']0["']\)|
            text\(["']0["']\)|
            0\b
        )''',
        compact,
        flags=re.VERBOSE,
    )
