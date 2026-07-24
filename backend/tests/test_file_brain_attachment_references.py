import errno
from pathlib import Path

from app.services.file_brain_ai import (
    hardlink_ai_attachment,
)


def test_hardlink_falls_back_to_zero_copy_reference(
    tmp_path: Path,
    monkeypatch,
) -> None:
    source = tmp_path / "source.pdf"
    source.write_bytes(b"StudySnap")

    attachment_root = (
        tmp_path / "ai-attachments"
    )

    def unsupported_link(*args, **kwargs):
        raise OSError(
            errno.EOPNOTSUPP,
            "Hard links are unavailable.",
        )

    monkeypatch.setattr(
        "app.services.file_brain_ai.os.link",
        unsupported_link,
    )

    stored_filename, stored_path = (
        hardlink_ai_attachment(
            source_path=source,
            filename="class-notes.pdf",
            owner_id=10,
            conversation_id=20,
            attachment_root=attachment_root,
        )
    )

    assert stored_filename == source.name
    assert Path(stored_path).resolve() == (
        source.resolve()
    )

    destination_directory = (
        attachment_root / "10" / "20"
    )

    assert destination_directory.is_dir()
    assert list(
        destination_directory.iterdir()
    ) == []


def test_hardlink_still_uses_owned_attachment_when_supported(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.txt"
    source.write_text(
        "StudySnap",
        encoding="utf-8",
    )

    attachment_root = (
        tmp_path / "ai-attachments"
    )

    stored_filename, stored_path = (
        hardlink_ai_attachment(
            source_path=source,
            filename="notes.txt",
            owner_id=7,
            conversation_id=8,
            attachment_root=attachment_root,
        )
    )

    destination = Path(stored_path)

    assert stored_filename == destination.name
    assert destination.is_file()
    assert destination.resolve() != (
        source.resolve()
    )

    assert destination.read_text(
        encoding="utf-8"
    ) == "StudySnap"

    assert destination.stat().st_ino == (
        source.stat().st_ino
    )
