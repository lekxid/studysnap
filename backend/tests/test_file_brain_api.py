import uuid
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.database import Base, get_db
from app.models.study_material import (
    StudyMaterial,
)
from app.models.study_room import StudyRoom
from app.models.user import User
from app.routes.file_brain import router
from app.utils.deps import get_current_user


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

current_user_state = {
    "id": 101,
}


def override_get_db():
    db = TestingSessionLocal()

    try:
        yield db
    finally:
        db.close()


def override_get_current_user():
    return SimpleNamespace(
        id=current_user_state["id"],
    )


test_app = FastAPI()

test_app.include_router(
    router,
    prefix="/api/file-brain",
)

test_app.dependency_overrides[
    get_db
] = override_get_db

test_app.dependency_overrides[
    get_current_user
] = override_get_current_user

client = TestClient(test_app)


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(
        bind=engine
    )

    Base.metadata.create_all(
        bind=engine
    )

    current_user_state["id"] = 101

    with TestingSessionLocal() as db:
        db.add_all(
            [
                User(
                    id=101,
                    email=(
                        "file-brain-api-101"
                        "@example.com"
                    ),
                    full_name="Owner 101",
                    password_hash="test",
                ),
                User(
                    id=202,
                    email=(
                        "file-brain-api-202"
                        "@example.com"
                    ),
                    full_name="Owner 202",
                    password_hash="test",
                ),
            ]
        )

        db.commit()

    yield

    Base.metadata.drop_all(
        bind=engine
    )


def create_room(
    *,
    owner_id: int,
    name: str,
) -> int:
    with TestingSessionLocal() as db:
        room = StudyRoom(
            name=name,
            subject=name,
            owner_id=owner_id,
        )

        db.add(room)
        db.commit()
        db.refresh(room)

        return room.id


def create_material(
    *,
    owner_id: int,
    room_id: int,
    sha256: str,
) -> int:
    token = uuid.uuid4().hex

    with TestingSessionLocal() as db:
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
            file_size=100,
            content_type="text/plain",
            material_type="text",
            extracted_text=(
                "File Brain API test."
            ),
            study_room_id=room_id,
            owner_id=owner_id,
            sha256=sha256,
        )

        db.add(material)
        db.commit()
        db.refresh(material)

        return material.id


def create_batch(
    *,
    items: list[dict] | None = None,
) -> dict:
    response = client.post(
        "/api/file-brain/batches",
        json={
            "title": "API test batch",
            "source_surface": (
                "general_ai"
            ),
            "items": items or [],
        },
    )

    assert response.status_code == 200

    return response.json()


def test_create_batch_detects_existing_exact_duplicate():
    room_id = create_room(
        owner_id=101,
        name="Networking",
    )

    digest = "a" * 64

    material_id = create_material(
        owner_id=101,
        room_id=room_id,
        sha256=digest,
    )

    batch = create_batch(
        items=[
            {
                "filename": (
                    "networking-notes.txt"
                ),
                "content_type": (
                    "text/plain"
                ),
                "file_size": 100,
                "sha256": digest.upper(),
            },
            {
                "filename": (
                    "new-notes.txt"
                ),
                "content_type": (
                    "text/plain"
                ),
                "file_size": 80,
                "sha256": "b" * 64,
            },
        ]
    )

    assert batch["total_items"] == 2
    assert batch["duplicate_items"] == 1

    first = batch["items"][0]
    second = batch["items"][1]

    assert first["status"] == "duplicate"
    assert (
        first["duplicate_material_id"]
        == material_id
    )

    assert (
        first["duplicate_material"]["id"]
        == material_id
    )

    assert second["status"] == "queued"
    assert (
        second["duplicate_material"]
        is None
    )


def test_batch_and_item_access_are_owner_scoped():
    batch = create_batch(
        items=[
            {
                "filename": "owner-file.txt",
                "content_type": (
                    "text/plain"
                ),
                "file_size": 10,
            }
        ]
    )

    batch_id = batch["id"]
    item_id = batch["items"][0]["id"]

    current_user_state["id"] = 202

    batch_response = client.get(
        (
            "/api/file-brain/batches/"
            f"{batch_id}"
        )
    )

    item_response = client.patch(
        (
            "/api/file-brain/items/"
            f"{item_id}/hash"
        ),
        json={
            "sha256": "c" * 64,
        },
    )

    cancel_response = client.delete(
        (
            "/api/file-brain/batches/"
            f"{batch_id}"
        )
    )

    assert batch_response.status_code == 404
    assert item_response.status_code == 404
    assert cancel_response.status_code == 404

    list_response = client.get(
        "/api/file-brain/batches"
    )

    assert list_response.status_code == 200
    assert (
        list_response.json()["batches"]
        == []
    )


def test_batch_enforces_100_file_limit():
    items = [
        {
            "filename": (
                f"file-{index}.txt"
            ),
            "content_type": (
                "text/plain"
            ),
            "file_size": index + 1,
            "sha256": f"{index:064x}",
        }
        for index in range(100)
    ]

    batch = create_batch(
        items=items,
    )

    assert batch["total_items"] == 100

    response = client.post(
        (
            "/api/file-brain/batches/"
            f"{batch['id']}/items"
        ),
        json={
            "items": [
                {
                    "filename": (
                        "file-101.txt"
                    ),
                    "content_type": (
                        "text/plain"
                    ),
                    "file_size": 101,
                }
            ]
        },
    )

    assert response.status_code == 400

    assert (
        "up to 100 files"
        in response.json()["detail"]
    )


def test_hash_can_be_registered_after_batch_creation():
    room_id = create_room(
        owner_id=101,
        name="Biology",
    )

    digest = "d" * 64

    material_id = create_material(
        owner_id=101,
        room_id=room_id,
        sha256=digest,
    )

    batch = create_batch(
        items=[
            {
                "filename": (
                    "biology.txt"
                ),
                "content_type": (
                    "text/plain"
                ),
                "file_size": 55,
            }
        ]
    )

    item_id = batch["items"][0]["id"]

    response = client.patch(
        (
            "/api/file-brain/items/"
            f"{item_id}/hash"
        ),
        json={
            "sha256": digest.upper(),
        },
    )

    assert response.status_code == 200

    payload = response.json()

    assert (
        payload["duplicate_found"]
        is True
    )

    assert (
        payload["item"]["sha256"]
        == digest
    )

    assert (
        payload["item"]
        ["duplicate_material_id"]
        == material_id
    )


def test_suggestion_and_destination_require_owned_room():
    owned_room_id = create_room(
        owner_id=101,
        name="Computer Networking",
    )

    other_room_id = create_room(
        owner_id=202,
        name="Private Room",
    )

    batch = create_batch(
        items=[
            {
                "filename": (
                    "network-basics.txt"
                ),
                "content_type": (
                    "text/plain"
                ),
                "file_size": 40,
                "sha256": "e" * 64,
            }
        ]
    )

    item_id = batch["items"][0]["id"]

    rejected = client.patch(
        (
            "/api/file-brain/items/"
            f"{item_id}/suggestion"
        ),
        json={
            "topic": (
                "Computer Networking"
            ),
            "confidence": 95,
            "reason": (
                "Networking keywords matched."
            ),
            "suggested_room_id": (
                other_room_id
            ),
        },
    )

    assert rejected.status_code == 404

    suggested = client.patch(
        (
            "/api/file-brain/items/"
            f"{item_id}/suggestion"
        ),
        json={
            "topic": (
                "Computer Networking"
            ),
            "confidence": 95,
            "reason": (
                "Networking keywords matched."
            ),
            "suggested_room_id": (
                owned_room_id
            ),
        },
    )

    assert suggested.status_code == 200

    suggested_payload = (
        suggested.json()
    )

    assert (
        suggested_payload["status"]
        == "awaiting_confirmation"
    )

    assert (
        suggested_payload
        ["suggested_room_id"]
        == owned_room_id
    )

    confirmed = client.patch(
        (
            "/api/file-brain/items/"
            f"{item_id}/destination"
        ),
        json={
            "room_id": owned_room_id,
        },
    )

    assert confirmed.status_code == 200

    confirmed_payload = (
        confirmed.json()
    )

    assert (
        confirmed_payload["status"]
        == "destination_confirmed"
    )

    assert (
        confirmed_payload
        ["confirmed_room_id"]
        == owned_room_id
    )


def test_item_and_batch_cancellation_are_persistent():
    batch = create_batch(
        items=[
            {
                "filename": "one.txt",
                "content_type": (
                    "text/plain"
                ),
                "file_size": 1,
            },
            {
                "filename": "two.txt",
                "content_type": (
                    "text/plain"
                ),
                "file_size": 2,
            },
        ]
    )

    first_item_id = (
        batch["items"][0]["id"]
    )

    item_response = client.delete(
        (
            "/api/file-brain/items/"
            f"{first_item_id}"
        )
    )

    assert item_response.status_code == 200
    assert (
        item_response.json()["item"]
        ["status"]
        == "cancelled"
    )

    batch_response = client.delete(
        (
            "/api/file-brain/batches/"
            f"{batch['id']}"
        )
    )

    assert batch_response.status_code == 200

    cancelled_batch = (
        batch_response.json()["batch"]
    )

    assert (
        cancelled_batch["status"]
        == "cancelled"
    )

    assert {
        item["status"]
        for item in cancelled_batch["items"]
    } == {
        "cancelled",
    }

    reloaded = client.get(
        (
            "/api/file-brain/batches/"
            f"{batch['id']}"
        )
    )

    assert reloaded.status_code == 200
    assert (
        reloaded.json()["status"]
        == "cancelled"
    )
