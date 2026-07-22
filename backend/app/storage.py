from pathlib import Path

from app.config import settings


def resolve_storage_root(
    configured_value: str,
) -> Path:
    value = (
        configured_value.strip()
        or "uploads"
    )

    root = Path(value).expanduser()

    if not root.is_absolute():
        root = Path.cwd() / root

    return root.resolve()


STORAGE_ROOT = resolve_storage_root(
    settings.storage_root
)

STORAGE_ROOT.mkdir(
    parents=True,
    exist_ok=True,
)


def storage_path(
    *parts: str,
) -> Path:
    return STORAGE_ROOT.joinpath(*parts)
