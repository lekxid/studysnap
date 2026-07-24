import hashlib
import os
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
import app.routes.file_brain_ai as bridge_route
from app.database import Base, get_db
from app.models.ai_conversation import (
    AIConversation,
)
from app.models.ai_message import AIMessage
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
from app.routes.file_brain_ai import (
    router as bridge_router,
)
from app.routes.file_brain_uploads import (
    router as upload_router,
)
from app.services.file_brain import (
    add_batch_item,
    create_batch,
    mark_exact_duplicate,
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

api_app.include_router(
    bridge_router,
    prefix="/api/file-brain",
)

api_app.dependency_overrides[
    get_db
] = override_get_db

api_app.dependency_overrides[
    get_current_user
] = override_get_current_user

client = TestClient(api_app)


class FakeResponses:
    calls: list[dict] = []

    def create(
        self,
        **kwargs,
    ):
        self.calls.append(kwargs)

        return SimpleNamespace(
            output_text=(
                "StudySnap read the selected "
                "File Brain material."
            )
        )


class FakeOpenAI:
    def __init__(
        self,
        **kwargs,
    ):
        self.responses = (
            FakeResponses()
        )


@pytest.fixture(autouse=True)
def reset_database(
    tmp_path,
    monkeypatch,
):
    file_brain_root = (
        tmp_path
        / "file-brain"
    )

    ai_attachment_root = (
        tmp_path
        / "ai-attachments"
    )

    monkeypatch.setenv(
        (
            "STUDYSNAP_"
            "FILE_BRAIN_UPLOAD_ROOT"
        ),
        str(file_brain_root),
    )

    monkeypatch.setattr(
        bridge_route,
        "AI_ATTACHMENT_ROOT",
        ai_attachment_root,
    )

    monkeypatch.setattr(
        bridge_route,
        "OpenAI",
        FakeOpenAI,
    )

    FakeResponses.calls.clear()

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
                        "bridge-owner-101"
                        "@example.com"
                    ),
                    full_name="Owner 101",
                    password_hash="test",
                ),
                User(
                    id=202,
                    email=(
                        "bridge-owner-202"
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


def create_conversation() -> int:
    with TestingSessionLocal() as db:
        conversation = AIConversation(
            title="New Conversation",
            mode="general",
            surface="general_ai",
            study_room_id=None,
            context_type=None,
            context_id=None,
            owner_id=101,
        )

        db.add(conversation)
        db.commit()
        db.refresh(conversation)

        return conversation.id


def create_uploaded_item(
    *,
    filename: str,
    content: bytes,
) -> int:
    response = client.post(
        "/api/file-brain/batches",
        json={
            "title": "AI bridge test",
            "source_surface": (
                "general_ai"
            ),
            "items": [
                {
                    "filename": filename,
                    "content_type": (
                        "text/plain"
                    ),
                    "file_size": len(
                        content
                    ),
                }
            ],
        },
    )

    assert response.status_code == 200

    item_id = (
        response.json()[
            "items"
        ][0]["id"]
    )

    started = client.post(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/start"
        )
    )

    assert started.status_code == 200
    assert (
        started.json()[
            "total_chunks"
        ]
        == 1
    )

    uploaded = client.put(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/"
            "chunks/0"
        ),
        content=content,
        headers={
            "Content-Type": (
                "application/octet-stream"
            )
        },
    )

    assert uploaded.status_code == 200

    completed = client.post(
        (
            "/api/file-brain/items/"
            f"{item_id}/upload/"
            "complete"
        )
    )

    assert completed.status_code == 200
    assert (
        completed.json()[
            "duplicate_found"
        ]
        is False
    )

    return item_id


def test_bridge_reads_staged_file_without_reupload_or_second_copy():
    content = (
        b"Photosynthesis uses light "
        b"energy to produce glucose."
    )

    item_id = create_uploaded_item(
        filename="biology.txt",
        content=content,
    )

    conversation_id = (
        create_conversation()
    )

    response = client.post(
        "/api/file-brain/ask",
        json={
            "question": (
                "Explain the main idea."
            ),
            "item_ids": [item_id],
            "conversation_id": (
                conversation_id
            ),
        },
    )

    assert response.status_code == 200

    payload = response.json()

    assert (
        payload["answer"]
        == (
            "StudySnap read the selected "
            "File Brain material."
        )
    )

    assert payload["count"] == 1
    assert len(
        payload["attachments"]
    ) == 1

    assert (
        payload["storage"][
            "reuploaded"
        ]
        is False
    )

    assert (
        payload["storage"][
            "second_file_copy"
        ]
        is False
    )

    assert (
        payload["storage"][
            "method"
        ]
        == "hard_link"
    )

    with TestingSessionLocal() as db:
        item = (
            db.query(FileBrainItem)
            .filter(
                FileBrainItem.id
                == item_id
            )
            .one()
        )

        source_path = Path(
            item.staging_path
        )

        messages = (
            db.query(AIMessage)
            .filter(
                AIMessage.conversation_id
                == conversation_id
            )
            .order_by(
                AIMessage.id.asc()
            )
            .all()
        )

        assert len(messages) == 2

        user_message = messages[0]
        assistant_message = (
            messages[1]
        )

        assert (
            user_message.role
            == "user"
        )

        assert (
            assistant_message.role
            == "assistant"
        )

        linked_path = Path(
            user_message
            .attachment_file_path
        )

        assert source_path.is_file()
        assert linked_path.is_file()

        assert os.path.samefile(
            source_path,
            linked_path,
        )

        assert (
            source_path.read_bytes()
            == content
        )

        assert (
            item.result_message
            is not None
        )

        assert (
            "General AI"
            in item.result_message
        )

    assert len(
        FakeResponses.calls
    ) == 1

    prompt = (
        FakeResponses.calls[0][
            "input"
        ]
    )

    assert (
        "Photosynthesis"
        in prompt
    )


def test_bridge_reads_exact_duplicate_from_existing_material(
    tmp_path,
):
    content = (
        b"Duplicate material content."
    )

    material_path = (
        tmp_path
        / "existing-material.txt"
    )

    material_path.write_bytes(
        content
    )

    digest = hashlib.sha256(
        content
    ).hexdigest()

    with TestingSessionLocal() as db:
        room = StudyRoom(
            name="Biology",
            subject="Biology",
            owner_id=101,
        )

        db.add(room)
        db.flush()

        token = uuid.uuid4().hex

        material = StudyMaterial(
            original_filename=(
                "existing-material.txt"
            ),
            stored_filename=(
                f"{token}.txt"
            ),
            file_path=str(
                material_path
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
        db.flush()

        batch = create_batch(
            db=db,
            owner_id=101,
            title="Duplicate test",
            source_surface=(
                "general_ai"
            ),
        )

        item = add_batch_item(
            db=db,
            batch=batch,
            filename=(
                "duplicate.txt"
            ),
            content_type="text/plain",
            file_size=len(content),
            sha256=digest,
        )

        mark_exact_duplicate(
            db=db,
            item=item,
            duplicate_material=material,
        )

        db.commit()
        db.refresh(item)

        item_id = item.id
        material_id = material.id

    response = client.post(
        "/api/file-brain/ask",
        json={
            "question": (
                "What is in this duplicate?"
            ),
            "item_ids": [item_id],
        },
    )

    assert response.status_code == 200

    payload = response.json()

    assert payload["count"] == 1

    assert (
        payload[
            "file_brain_items"
        ][0]["source_type"]
        == "study_material"
    )

    assert (
        payload[
            "file_brain_items"
        ][0]["source_id"]
        == material_id
    )

    assert (
        payload["storage"][
            "method"
        ]
        == "source_reference"
    )

    assert (
        "Duplicate material content"
        in FakeResponses.calls[
            0
        ]["input"]
    )


def test_bridge_is_owner_scoped():
    item_id = create_uploaded_item(
        filename="private.txt",
        content=b"Private owner data.",
    )

    current_user_state["id"] = 202

    response = client.post(
        "/api/file-brain/ask",
        json={
            "question": (
                "Read this file."
            ),
            "item_ids": [item_id],
        },
    )

    assert response.status_code == 404


def test_bridge_rejects_more_than_ten_items():
    response = client.post(
        "/api/file-brain/ask",
        json={
            "question": (
                "Read all files."
            ),
            "item_ids": list(
                range(1, 12)
            ),
        },
    )

    assert response.status_code == 400

    assert (
        "up to 10"
        in response.json()[
            "detail"
        ]
    )


def test_bridge_rejects_incomplete_upload():
    response = client.post(
        "/api/file-brain/batches",
        json={
            "title": "Incomplete",
            "source_surface": (
                "general_ai"
            ),
            "items": [
                {
                    "filename": (
                        "waiting.txt"
                    ),
                    "content_type": (
                        "text/plain"
                    ),
                    "file_size": 10,
                }
            ],
        },
    )

    assert response.status_code == 200

    item_id = (
        response.json()[
            "items"
        ][0]["id"]
    )

    asked = client.post(
        "/api/file-brain/ask",
        json={
            "question": (
                "Read this."
            ),
            "item_ids": [item_id],
        },
    )

    assert asked.status_code == 409

    assert (
        "not finished uploading"
        in asked.json()["detail"]
    )
