import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.database import Base
from app.models.file_brain import (
    FileBrainBatch,
    FileBrainItem,
)
from app.models.study_material import (
    StudyMaterial,
)
from app.models.study_room import StudyRoom
from app.models.user import User
from app.services.file_brain import (
    FileBrainLimitError,
    add_batch_item,
    confirm_destination,
    create_batch,
    find_exact_duplicate,
    mark_exact_duplicate,
    mark_item_failed,
    mark_item_organized,
    refresh_batch_counts,
    register_material_hash,
    set_room_suggestion,
)


engine = create_engine(
    "sqlite://",
    connect_args={
        "check_same_thread": False,
    },
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(
        bind=engine
    )

    Base.metadata.create_all(
        bind=engine
    )

    yield

    Base.metadata.drop_all(
        bind=engine
    )


def create_user(
    db,
    *,
    user_id: int,
) -> User:
    user = User(
        id=user_id,
        email=(
            f"file-brain-{user_id}"
            "@example.com"
        ),
        full_name=(
            f"File Brain User {user_id}"
        ),
        password_hash="test",
    )

    db.add(user)
    db.flush()

    return user


def create_room(
    db,
    *,
    owner_id: int,
    name: str,
) -> StudyRoom:
    room = StudyRoom(
        name=name,
        subject=name,
        owner_id=owner_id,
    )

    db.add(room)
    db.flush()

    return room


def create_material(
    db,
    *,
    owner_id: int,
    room_id: int,
    sha256: str | None = None,
) -> StudyMaterial:
    token = uuid.uuid4().hex

    material = StudyMaterial(
        original_filename=(
            f"{token}.txt"
        ),
        stored_filename=(
            f"{token}.txt"
        ),
        file_path=(
            f"/tmp/{token}.txt"
        ),
        file_size=25,
        content_type="text/plain",
        material_type="text",
        extracted_text=(
            "StudySnap File Brain test."
        ),
        study_room_id=room_id,
        owner_id=owner_id,
        sha256=sha256,
    )

    db.add(material)
    db.flush()

    return material


def test_exact_duplicate_is_owner_scoped():
    digest = "a" * 64

    with TestingSessionLocal() as db:
        create_user(
            db,
            user_id=101,
        )

        create_user(
            db,
            user_id=202,
        )

        room_one = create_room(
            db,
            owner_id=101,
            name="Room One",
        )

        room_two = create_room(
            db,
            owner_id=202,
            name="Room Two",
        )

        original = create_material(
            db,
            owner_id=101,
            room_id=room_one.id,
            sha256=digest,
        )

        other_owner_material = (
            create_material(
                db,
                owner_id=202,
                room_id=room_two.id,
                sha256=digest,
            )
        )

        owner_one_match = (
            find_exact_duplicate(
                db=db,
                owner_id=101,
                sha256=digest.upper(),
            )
        )

        owner_two_match = (
            find_exact_duplicate(
                db=db,
                owner_id=202,
                sha256=digest,
            )
        )

        assert owner_one_match is not None
        assert owner_two_match is not None

        assert (
            owner_one_match.id
            == original.id
        )

        assert (
            owner_two_match.id
            == other_owner_material.id
        )

        new_material = create_material(
            db,
            owner_id=101,
            room_id=room_one.id,
        )

        duplicate = register_material_hash(
            db=db,
            material=new_material,
            sha256=digest.upper(),
        )

        assert duplicate is not None
        assert duplicate.id == original.id
        assert new_material.sha256 == digest


def test_batch_accepts_100_files_only():
    with TestingSessionLocal() as db:
        create_user(
            db,
            user_id=101,
        )

        batch = create_batch(
            db=db,
            owner_id=101,
            title="100 file test",
        )

        for index in range(100):
            item = add_batch_item(
                db=db,
                batch=batch,
                filename=(
                    f"file-{index}.txt"
                ),
                content_type=(
                    "text/plain"
                ),
                file_size=index + 1,
                sha256=(
                    f"{index:064x}"
                ),
            )

            assert (
                item.item_order
                == index
            )

        assert batch.total_items == 100

        with pytest.raises(
            FileBrainLimitError
        ):
            add_batch_item(
                db=db,
                batch=batch,
                filename="file-101.txt",
                content_type=(
                    "text/plain"
                ),
                file_size=101,
            )

        stored_count = (
            db.query(FileBrainItem)
            .filter(
                FileBrainItem.batch_id
                == batch.id
            )
            .count()
        )

        assert stored_count == 100


def test_batch_tracks_duplicate_destination_and_failure():
    digest = "b" * 64

    with TestingSessionLocal() as db:
        create_user(
            db,
            user_id=101,
        )

        room = create_room(
            db,
            owner_id=101,
            name="Networking",
        )

        existing_material = (
            create_material(
                db,
                owner_id=101,
                room_id=room.id,
                sha256=digest,
            )
        )

        organized_material = (
            create_material(
                db,
                owner_id=101,
                room_id=room.id,
                sha256="e" * 64,
            )
        )

        batch = create_batch(
            db=db,
            owner_id=101,
            title="Mixed results",
        )

        duplicate_item = add_batch_item(
            db=db,
            batch=batch,
            filename="duplicate.txt",
            content_type="text/plain",
            file_size=25,
            sha256=digest,
        )

        organized_item = add_batch_item(
            db=db,
            batch=batch,
            filename="networking.txt",
            content_type="text/plain",
            file_size=40,
            sha256="c" * 64,
        )

        failed_item = add_batch_item(
            db=db,
            batch=batch,
            filename="failed.txt",
            content_type="text/plain",
            file_size=50,
            sha256="d" * 64,
        )

        mark_exact_duplicate(
            db=db,
            item=duplicate_item,
            duplicate_material=(
                existing_material
            ),
        )

        set_room_suggestion(
            db=db,
            item=organized_item,
            topic="Networking",
            confidence=94,
            reason=(
                "Matched networking terms."
            ),
            room=room,
        )

        confirm_destination(
            db=db,
            item=organized_item,
            room=room,
        )

        mark_item_organized(
            db=db,
            item=organized_item,
            material=organized_material,
        )

        mark_item_failed(
            db=db,
            item=failed_item,
            message=(
                "Test processing error."
            ),
        )

        refresh_batch_counts(
            db=db,
            batch=batch,
        )

        assert (
            duplicate_item.status
            == "duplicate"
        )

        assert (
            duplicate_item
            .duplicate_material_id
            == existing_material.id
        )

        assert (
            organized_item
            .suggested_room_id
            == room.id
        )

        assert (
            organized_item
            .confirmed_room_id
            == room.id
        )

        assert (
            organized_item
            .material_id
            == organized_material.id
        )

        assert (
            organized_item
            .current_location_type
            == "study_room"
        )

        assert (
            organized_item
            .current_location_id
            == room.id
        )

        assert batch.total_items == 3
        assert batch.duplicate_items == 1
        assert batch.completed_items == 2
        assert batch.failed_items == 1

        assert (
            batch.status
            == "completed_with_errors"
        )


def test_file_brain_tables_are_registered():
    assert (
        FileBrainBatch.__tablename__
        == "file_brain_batches"
    )

    assert (
        FileBrainItem.__tablename__
        == "file_brain_items"
    )

    assert (
        "file_brain_batches"
        in Base.metadata.tables
    )

    assert (
        "file_brain_items"
        in Base.metadata.tables
    )
