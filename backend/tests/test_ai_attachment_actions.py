from pathlib import Path
from types import SimpleNamespace
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.database import Base, get_db
from app.models.ai_conversation import (
    AIConversation,
)
from app.models.ai_message import AIMessage
from app.routes import ai as ai_module
from app.routes.ai import router
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
    router,
    prefix="/api/ai",
)

api_app.dependency_overrides[
    get_db
] = override_get_db

api_app.dependency_overrides[
    get_current_user
] = override_get_current_user

client = TestClient(api_app)


@pytest.fixture(autouse=True)
def reset_attachment_database(
    tmp_path,
    monkeypatch,
):
    Base.metadata.drop_all(
        bind=engine
    )

    Base.metadata.create_all(
        bind=engine
    )

    current_user_state["id"] = 101

    attachment_root = (
        tmp_path
        / "ai-attachments"
    )

    attachment_root.mkdir(
        parents=True,
        exist_ok=True,
    )

    monkeypatch.setattr(
        ai_module,
        "AI_ATTACHMENT_ROOT",
        attachment_root,
    )

    yield

    Base.metadata.drop_all(
        bind=engine
    )


def create_attachment(
    *,
    owner_id: int = 101,
    pinned: bool = False,
    hidden: bool = False,
    file_path: Path | None = None,
):
    if file_path is None:
        file_path = (
            ai_module
            .AI_ATTACHMENT_ROOT
            / (
                uuid.uuid4().hex
                + ".txt"
            )
        )

    file_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    file_path.write_text(
        "StudySnap attachment test.",
    )

    with TestingSessionLocal() as db:
        conversation = AIConversation(
            owner_id=owner_id,
            title="Attachment test",
            mode="general",
            surface="general_ai",
        )

        db.add(conversation)
        db.flush()

        message = AIMessage(
            conversation_id=(
                conversation.id
            ),
            role="user",
            content=(
                "Test attachment message"
            ),
            attachment_filename=(
                file_path.name
            ),
            attachment_stored_filename=(
                file_path.name
            ),
            attachment_file_path=str(
                file_path
            ),
            attachment_file_size=(
                file_path.stat().st_size
            ),
            attachment_content_type=(
                "text/plain"
            ),
            attachment_kind="file",
            attachment_hidden_from_feed=(
                hidden
            ),
            attachment_is_pinned=(
                pinned
            ),
        )

        db.add(message)
        db.commit()
        db.refresh(message)

        return {
            "conversation_id": (
                conversation.id
            ),
            "message_id": message.id,
            "file_path": file_path,
        }


def read_message(
    message_id: int,
):
    with TestingSessionLocal() as db:
        return (
            db.query(AIMessage)
            .filter(
                AIMessage.id
                == message_id
            )
            .one()
        )


def test_pin_restores_visibility_and_unpin_works():
    attachment = create_attachment(
        hidden=True,
    )

    response = client.patch(
        (
            "/api/ai/attachments/"
            f"{attachment['message_id']}"
            "/pin?pinned=true"
        ),
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": (
            attachment["message_id"]
        ),
        "is_pinned": True,
    }

    message = read_message(
        attachment["message_id"],
    )

    assert (
        message.attachment_is_pinned
        is True
    )

    assert (
        message
        .attachment_hidden_from_feed
        is False
    )

    response = client.patch(
        (
            "/api/ai/attachments/"
            f"{attachment['message_id']}"
            "/pin?pinned=false"
        ),
    )

    assert response.status_code == 200
    assert (
        response.json()["is_pinned"]
        is False
    )


def test_hiding_attachment_automatically_unpins():
    attachment = create_attachment(
        pinned=True,
    )

    response = client.patch(
        (
            "/api/ai/attachments/"
            f"{attachment['message_id']}"
            "/feed?hidden=true"
        ),
    )

    assert response.status_code == 200
    assert (
        response.json()[
            "hidden_from_feed"
        ]
        is True
    )

    message = read_message(
        attachment["message_id"],
    )

    assert (
        message
        .attachment_hidden_from_feed
        is True
    )

    assert (
        message.attachment_is_pinned
        is False
    )


def test_user_can_pin_up_to_ten_files():
    attachments = [
        create_attachment()
        for _ in range(11)
    ]

    for attachment in attachments[:10]:
        response = client.patch(
            (
                "/api/ai/attachments/"
                f"{attachment['message_id']}"
                "/pin?pinned=true"
            ),
        )

        assert response.status_code == 200
        assert response.json()["is_pinned"] is True

    blocked = client.patch(
        (
            "/api/ai/attachments/"
            f"{attachments[10]['message_id']}"
            "/pin?pinned=true"
        ),
    )

    assert blocked.status_code == 400
    assert blocked.json()["detail"] == (
        "You can pin up to "
        "10 dashboard files."
    )

def test_other_user_cannot_change_or_delete_attachment():
    attachment = create_attachment(
        owner_id=101,
    )

    current_user_state["id"] = 202

    pin_response = client.patch(
        (
            "/api/ai/attachments/"
            f"{attachment['message_id']}"
            "/pin?pinned=true"
        ),
    )

    delete_response = client.delete(
        (
            "/api/ai/attachments/"
            f"{attachment['message_id']}"
        ),
    )

    assert pin_response.status_code in {
        403,
        404,
    }

    assert delete_response.status_code in {
        403,
        404,
    }

    assert attachment[
        "file_path"
    ].is_file()


def test_delete_removes_file_but_preserves_chat():
    attachment = create_attachment(
        pinned=True,
    )

    response = client.delete(
        (
            "/api/ai/attachments/"
            f"{attachment['message_id']}"
        ),
    )

    assert response.status_code == 200

    payload = response.json()

    assert payload["deleted"] is True
    assert payload[
        "conversation_id"
    ] == attachment[
        "conversation_id"
    ]

    assert not attachment[
        "file_path"
    ].exists()

    with TestingSessionLocal() as db:
        conversation = (
            db.query(
                AIConversation
            )
            .filter(
                AIConversation.id
                == attachment[
                    "conversation_id"
                ]
            )
            .one_or_none()
        )

        message = (
            db.query(AIMessage)
            .filter(
                AIMessage.id
                == attachment[
                    "message_id"
                ]
            )
            .one_or_none()
        )

        assert conversation is not None
        assert message is not None

        assert (
            message.content
            == "Test attachment message"
        )

        assert (
            message
            .attachment_file_path
            is None
        )

        assert (
            message
            .attachment_is_pinned
            is False
        )

        assert (
            message
            .attachment_hidden_from_feed
            is False
        )


def test_delete_rejects_file_outside_attachment_storage(
    tmp_path,
):
    outside_file = (
        tmp_path
        / "outside-storage.txt"
    )

    attachment = create_attachment(
        file_path=outside_file,
    )

    response = client.delete(
        (
            "/api/ai/attachments/"
            f"{attachment['message_id']}"
        ),
    )

    assert response.status_code == 400

    assert (
        response.json()["detail"]
        == (
            "The attachment path is "
            "outside StudySnap storage."
        )
    )

    assert outside_file.is_file()
