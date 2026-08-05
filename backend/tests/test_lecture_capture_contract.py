from pathlib import Path

from app.models.study_material import StudyMaterial
from app.routes.materials import (
    LectureBookmark,
    LectureMetadataUpdate,
    default_lecture_metadata,
    read_lecture_metadata,
    write_lecture_metadata,
)


def make_audio_material(tmp_path: Path) -> StudyMaterial:
    audio_path = tmp_path / "lecture.webm"
    audio_path.write_bytes(b"test-audio")

    return StudyMaterial(
        id=91,
        original_filename="lecture-week-4.webm",
        stored_filename="lecture.webm",
        file_path=str(audio_path),
        file_size=10,
        content_type="audio/webm",
        material_type="audio",
        study_room_id=7,
        owner_id=3,
    )


def test_default_lecture_metadata_is_honest(tmp_path: Path) -> None:
    material = make_audio_material(tmp_path)

    metadata = default_lecture_metadata(material)

    assert metadata["material_id"] == 91
    assert metadata["title"] == "lecture week 4"
    assert metadata["duration_seconds"] == 0
    assert metadata["consent_confirmed"] is False
    assert metadata["bookmarks"] == []


def test_lecture_metadata_round_trip(tmp_path: Path) -> None:
    material = make_audio_material(tmp_path)
    payload = LectureMetadataUpdate(
        title="Week 4 — Vital signs",
        duration_seconds=185,
        recorded_at="2026-08-05T17:00:00-04:00",
        consent_confirmed=True,
        bookmarks=[
            LectureBookmark(
                id="bookmark-1",
                offset_seconds=42,
                label="Exam hint",
            )
        ],
    )

    written = write_lecture_metadata(material, payload)
    restored = read_lecture_metadata(material)

    assert written == restored
    assert restored["title"] == "Week 4 — Vital signs"
    assert restored["duration_seconds"] == 185
    assert restored["consent_confirmed"] is True
    assert restored["bookmarks"][0]["offset_seconds"] == 42
