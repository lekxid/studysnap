import hashlib
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.database import Base, get_db
from app.models.file_brain import (
    FileBrainItem,
)
from app.models.study_material import (
    StudyMaterial,
)
from app.models.study_room import StudyRoom
from app.models.user import User
from app.routes.file_brain import (
    router as file_brain_router,
)
from app.routes.file_brain_uploads import (
    router as upload_router,
)
from app.services.file_brain_uploads import (
    FILE_BRAIN_MAX_FILE_SIZE,
)
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


api_app = FastAPI()

api_app.include_router(
    file_brain_router,
    prefix="/api/file-brain",
)

api_app.include_router(
    upload_router,
    prefix="/api/file-brain",
)

api_app.dependency_overrides[
    get_db
] = override_get_db

api_app.dependency_overrides[
    get_current_user
] = override_get_current_user

client = TestClient(api_app)


@pytest.fixture(autouse=True)
def reset_database(
    tmp_path,
    monkeypatch,
):
    monkeypatch.setenv(
        (
            "STUDYSNAP_"
            "FILE_BRAIN_UPLOAD_ROOT"
        ),
        str(
            tmp_path
            / "file-brain-uploads"
        ),
    )

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
                        "upload-owner-101"
                        "@example.com"
                    ),
                    full_name="Owner 101",
                    password_hash="test",
                ),
                User(
                    id=202,
                    email=(
                        "upload-owner-202"
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


def create_batch_item(
    *,
    filename: str,
    content: bytes | None = None,
    file_size: int | None = None,
) -> dict:
    size = (
        len(content)
        if content is not None
        else int(file_size or 0)
    )

    response = client.post(
        "/api/file-brain/batches",
        json={
            "title": (
                "Upload orchestration test"
            ),
            "source_surface": (
                "general_ai"
            ),
            "items": [
                {
                    "filename": filename,
                    "content_type": (
                        "text/plain"
                    ),
                    "file_size": size,
                }
            ],
        },
    )

    assert response.status_code == 200

    return response.json()["items"][0]


def upload_small_file(
    *,
    item_id: int,
    content: bytes,
) -> dict:
    started = client.post(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/start"
        )
    )

    assert started.status_code == 200

    session = started.json()

    assert session["total_chunks"] == 1

    chunk = client.put(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/chunks/0"
        ),
        content=content,
        headers={
            "Content-Type": (
                "application/octet-stream"
            )
        },
    )

    assert chunk.status_code == 200

    completed = client.post(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/complete"
        )
    )

    assert completed.status_code == 200

    return completed.json()


def test_upload_can_pause_resume_and_survive_status_reload():
    content = (
        b"StudySnap durable upload data."
    )

    item = create_batch_item(
        filename="durable.txt",
        content=content,
    )

    item_id = item["id"]

    started = client.post(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/start"
        )
    )

    assert started.status_code == 200
    assert (
        started.json()["state"]
        == "uploading"
    )

    paused = client.post(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/pause"
        )
    )

    assert paused.status_code == 200
    assert (
        paused.json()["state"]
        == "paused"
    )

    rejected_chunk = client.put(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/chunks/0"
        ),
        content=content,
    )

    assert rejected_chunk.status_code == 409

    resumed = client.post(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/resume"
        )
    )

    assert resumed.status_code == 200
    assert (
        resumed.json()["state"]
        == "uploading"
    )

    uploaded = client.put(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/chunks/0"
        ),
        content=content,
    )

    assert uploaded.status_code == 200
    assert (
        uploaded.json()["uploaded_bytes"]
        == len(content)
    )

    reloaded = client.get(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload"
        )
    )

    assert reloaded.status_code == 200
    assert (
        reloaded.json()["uploaded_bytes"]
        == len(content)
    )

    assert (
        reloaded.json()["uploaded_chunks"]
        == [0]
    )

    completed = client.post(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/complete"
        )
    )

    assert completed.status_code == 200

    result = completed.json()

    assert (
        result["duplicate_found"]
        is False
    )

    assert result["status"] == "stored"
    assert (
        result["upload_state"]
        == "completed"
    )

    assert (
        result["progress_percent"]
        == 100
    )

    assert (
        result["staging_available"]
        is True
    )

    with TestingSessionLocal() as db:
        stored_item = (
            db.query(FileBrainItem)
            .filter(
                FileBrainItem.id
                == item_id
            )
            .one()
        )

        assert (
            stored_item.staging_path
            is not None
        )

        assert Path(
            stored_item.staging_path
        ).is_file()

        assert (
            Path(
                stored_item.staging_path
            ).read_bytes()
            == content
        )


def test_existing_material_duplicate_does_not_create_staging_copy():
    content = (
        b"Existing exact duplicate."
    )

    digest = hashlib.sha256(
        content
    ).hexdigest()

    with TestingSessionLocal() as db:
        room = StudyRoom(
            name="Duplicate Room",
            subject="Duplicates",
            owner_id=101,
        )

        db.add(room)
        db.flush()

        token = uuid.uuid4().hex

        material = StudyMaterial(
            original_filename=(
                "existing.txt"
            ),
            stored_filename=(
                f"{token}.txt"
            ),
            file_path=(
                f"/tmp/{token}.txt"
            ),
            file_size=len(content),
            content_type="text/plain",
            material_type="text",
            extracted_text=(
                content.decode()
            ),
            study_room_id=room.id,
            owner_id=101,
            sha256=digest,
        )

        db.add(material)
        db.commit()
        db.refresh(material)

        material_id = material.id

    item = create_batch_item(
        filename="duplicate.txt",
        content=content,
    )

    result = upload_small_file(
        item_id=item["id"],
        content=content,
    )

    assert (
        result["duplicate_found"]
        is True
    )

    assert (
        result["duplicate_source"]
        == "study_material"
    )

    assert (
        result["duplicate_material_id"]
        == material_id
    )

    assert (
        result["staging_available"]
        is False
    )

    with TestingSessionLocal() as db:
        stored_item = (
            db.query(FileBrainItem)
            .filter(
                FileBrainItem.id
                == item["id"]
            )
            .one()
        )

        assert (
            stored_item.status
            == "duplicate"
        )

        assert (
            stored_item.staging_path
            is None
        )


def test_duplicate_inside_same_batch_stores_only_one_copy():
    content = (
        b"Same batch duplicate bytes."
    )

    response = client.post(
        "/api/file-brain/batches",
        json={
            "title": (
                "Same batch duplicates"
            ),
            "source_surface": (
                "general_ai"
            ),
            "items": [
                {
                    "filename": "one.txt",
                    "content_type": (
                        "text/plain"
                    ),
                    "file_size": len(
                        content
                    ),
                },
                {
                    "filename": "two.txt",
                    "content_type": (
                        "text/plain"
                    ),
                    "file_size": len(
                        content
                    ),
                },
            ],
        },
    )

    assert response.status_code == 200

    items = response.json()["items"]

    first_result = upload_small_file(
        item_id=items[0]["id"],
        content=content,
    )

    second_result = upload_small_file(
        item_id=items[1]["id"],
        content=content,
    )

    assert (
        first_result["duplicate_found"]
        is False
    )

    assert (
        second_result["duplicate_found"]
        is True
    )

    assert (
        second_result["duplicate_source"]
        == "file_brain_item"
    )

    assert (
        second_result["duplicate_item_id"]
        == items[0]["id"]
    )

    with TestingSessionLocal() as db:
        stored_items = (
            db.query(FileBrainItem)
            .filter(
                FileBrainItem.status
                == "stored"
            )
            .all()
        )

        duplicate_items = (
            db.query(FileBrainItem)
            .filter(
                FileBrainItem.status
                == "duplicate"
            )
            .all()
        )

        assert len(stored_items) == 1
        assert len(duplicate_items) == 1

        stored_paths = [
            Path(item.staging_path)
            for item in stored_items
            if item.staging_path
        ]

        assert len(stored_paths) == 1
        assert stored_paths[0].is_file()


def test_upload_endpoints_are_owner_scoped():
    content = b"Private owner data."

    item = create_batch_item(
        filename="private.txt",
        content=content,
    )

    current_user_state["id"] = 202

    status_response = client.get(
        (
            "/api/file-brain/items/"
            f"{item['id']}/upload"
        )
    )

    start_response = client.post(
        (
            "/api/file-brain/items/"
            f"{item['id']}/upload/start"
        )
    )

    assert (
        status_response.status_code
        == 404
    )

    assert (
        start_response.status_code
        == 404
    )


def test_cancel_removes_upload_session_and_persists_state():
    content = b"Cancel this upload."

    item = create_batch_item(
        filename="cancel.txt",
        content=content,
    )

    item_id = item["id"]

    started = client.post(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/start"
        )
    )

    assert started.status_code == 200

    upload_id = (
        started.json()["upload_id"]
    )

    cancelled = client.delete(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload"
        )
    )

    assert cancelled.status_code == 200

    assert (
        cancelled.json()["upload_state"]
        == "cancelled"
    )

    with TestingSessionLocal() as db:
        stored_item = (
            db.query(FileBrainItem)
            .filter(
                FileBrainItem.id
                == item_id
            )
            .one()
        )

        assert (
            stored_item.status
            == "cancelled"
        )

        assert (
            stored_item.upload_state
            == "cancelled"
        )

    root = Path(
        (
            __import__("os")
            .environ[
                (
                    "STUDYSNAP_"
                    "FILE_BRAIN_UPLOAD_ROOT"
                )
            ]
        )
    )

    session_path = (
        root
        / "sessions"
        / "101"
        / upload_id
    )

    assert not session_path.exists()


def test_file_over_two_gigabytes_is_rejected_before_session_creation():
    item = create_batch_item(
        filename="too-large.bin",
        file_size=(
            FILE_BRAIN_MAX_FILE_SIZE
            + 1
        ),
    )

    response = client.post(
        (
            "/api/file-brain/items/"
            f"{item['id']}/upload/start"
        )
    )

    assert response.status_code == 409

    assert (
        "2GB"
        in response.json()["detail"]
    )
