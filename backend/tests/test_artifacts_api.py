from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.config import settings
from app.database import Base, get_db
from app.models.ai_conversation import AIConversation
from app.models.ai_message import AIMessage
from app.models.artifact import Artifact
from app.models.user import User
from app.routes.artifacts import router
from app.utils.deps import get_current_user


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)
current_user_state = {"id": 101}


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def override_get_current_user():
    return SimpleNamespace(id=current_user_state["id"])


api_app = FastAPI()
api_app.include_router(router, prefix="/api/artifacts")
api_app.dependency_overrides[get_db] = override_get_db
api_app.dependency_overrides[get_current_user] = override_get_current_user
client = TestClient(api_app)


@pytest.fixture(autouse=True)
def reset_database(tmp_path, monkeypatch):
    monkeypatch.setattr(
        settings,
        "storage_root",
        str(tmp_path / "storage"),
    )

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    current_user_state["id"] = 101

    with TestingSessionLocal() as db:
        db.add_all(
            [
                User(
                    id=101,
                    email="artifact-owner@example.com",
                    full_name="Artifact Owner",
                    password_hash="test",
                ),
                User(
                    id=202,
                    email="artifact-other@example.com",
                    full_name="Other Owner",
                    password_hash="test",
                ),
            ]
        )
        db.flush()

        owner_conversation = AIConversation(
            id=1001,
            owner_id=101,
            title="Owner Study Answer",
            mode="general",
        )
        other_conversation = AIConversation(
            id=2002,
            owner_id=202,
            title="Other Study Answer",
            mode="general",
        )
        db.add_all([owner_conversation, other_conversation])
        db.flush()

        db.add_all(
            [
                AIMessage(
                    id=1101,
                    conversation_id=1001,
                    role="assistant",
                    content="A secure StudySnap answer for the owner.",
                ),
                AIMessage(
                    id=2202,
                    conversation_id=2002,
                    role="assistant",
                    content="Another user's private answer.",
                ),
            ]
        )
        db.commit()

    yield

    Base.metadata.drop_all(bind=engine)


def test_owner_can_create_pdf_and_use_short_lived_ticket():
    created = client.post(
        "/api/artifacts/from-message/1101",
        json={"format": "pdf"},
    )

    assert created.status_code == 200, created.text
    artifact = created.json()
    assert artifact["owner_id"] == 101
    assert artifact["message_id"] == 1101
    assert artifact["content_type"] == "application/pdf"
    assert artifact["filename"].endswith(".pdf")

    protected = client.get(artifact["download_url"])
    assert protected.status_code == 200
    assert protected.headers["content-type"].startswith("application/pdf")
    assert "attachment" in protected.headers["content-disposition"]
    assert protected.headers["x-content-type-options"] == "nosniff"

    ticket_response = client.post(artifact["ticket_url"])
    assert ticket_response.status_code == 200

    public_download = client.get(ticket_response.json()["url"])
    assert public_download.status_code == 200
    assert public_download.headers["content-type"].startswith("application/pdf")


def test_other_user_cannot_discover_create_or_download_owner_artifact():
    created = client.post(
        "/api/artifacts/from-message/1101",
        json={"format": "txt"},
    )
    artifact_id = created.json()["id"]

    current_user_state["id"] = 202

    assert client.get(f"/api/artifacts/{artifact_id}").status_code == 404
    assert client.post(f"/api/artifacts/{artifact_id}/ticket").status_code == 404
    assert client.get(f"/api/artifacts/{artifact_id}/download").status_code == 404

    private_message_export = client.post(
        "/api/artifacts/from-message/1101",
        json={"format": "pdf"},
    )
    assert private_message_export.status_code == 404


def test_expired_artifact_is_not_downloadable():
    created = client.post(
        "/api/artifacts/text",
        json={
            "title": "Temporary Notes",
            "content": "Temporary content",
            "format": "md",
        },
    )
    artifact_id = created.json()["id"]

    with TestingSessionLocal() as db:
        artifact = db.query(Artifact).filter(Artifact.id == artifact_id).one()
        artifact.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()

    response = client.get(f"/api/artifacts/{artifact_id}/download")
    assert response.status_code == 410


def test_invalid_ticket_does_not_reveal_artifact():
    response = client.get(
        "/api/artifacts/public/999?token=this-is-not-a-valid-ticket-token"
    )
    assert response.status_code == 404
