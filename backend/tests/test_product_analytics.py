from __future__ import annotations

import json
from datetime import datetime, timezone

import app.models  # noqa: F401
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.models.product_event import (
    ProductEvent,
)
from app.models.user import User
from app.models.user_session import (
    UserSession,
)
from app.routes.admin_analytics import (
    router as admin_router,
)
from app.routes.product_analytics import (
    router as event_router,
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
    "id": 1,
}


def override_get_db():
    db = TestingSessionLocal()

    try:
        yield db
    finally:
        db.close()


def override_get_current_user():
    with TestingSessionLocal() as session:
        user = (
            session.query(User)
            .filter(
                User.id
                == current_user_state["id"]
            )
            .first()
        )

        if user is None:
            raise RuntimeError(
                "Test user is missing."
            )

        session.expunge(user)

        return user


api_app = FastAPI()
api_app.include_router(
    event_router,
    prefix="/api/analytics",
)
api_app.include_router(
    admin_router,
    prefix="/api/admin/analytics",
)

api_app.dependency_overrides[
    get_db
] = override_get_db

api_app.dependency_overrides[
    get_current_user
] = override_get_current_user

client = TestClient(api_app)


@pytest.fixture(autouse=True)
def reset_database():
    original_admins = (
        settings.STUDYSNAP_ADMIN_EMAILS
    )

    settings.STUDYSNAP_ADMIN_EMAILS = (
        "founder@example.com"
    )

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    with TestingSessionLocal() as db:
        db.add_all(
            [
                User(
                    id=1,
                    email=(
                        "founder@example.com"
                    ),
                    full_name="Founder",
                    password_hash="unused",
                    learning_mode="clear",
                ),
                User(
                    id=2,
                    email="student@example.com",
                    full_name="Student",
                    password_hash="unused",
                    learning_mode="clear",
                ),
            ]
        )
        db.commit()

        db.add(
            UserSession(
                user_id=2,
                session_token=(
                    "student-session"
                ),
                device_name="Phone",
                browser="Chrome",
                operating_system="Android",
                created_at=datetime.now(timezone.utc),
                last_active_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

    yield

    settings.STUDYSNAP_ADMIN_EMAILS = (
        original_admins
    )

    Base.metadata.drop_all(engine)


def test_event_tracking_removes_private_metadata():
    current_user_state["id"] = 2

    response = client.post(
        "/api/analytics/events",
        json={
            "event_name":
                "ai_used",
            "category": "ai",
            "surface":
                "/study-rooms/123",
            "metadata": {
                "model":
                    "gpt-4.1-mini",
                "prompt":
                    "private question",
                "filename":
                    "private.pdf",
                "duration_ms": 240,
            },
        },
    )

    assert response.status_code == 201

    with TestingSessionLocal() as db:
        event = (
            db.query(ProductEvent)
            .one()
        )

        metadata = json.loads(
            event.metadata_json
        )

        assert event.user_id == 2
        assert (
            event.surface
            == "study-rooms/:id"
        )
        assert metadata == {
            "duration_ms": 240,
            "model": "gpt-4.1-mini",
        }


def test_normal_user_cannot_read_founder_dashboard():
    current_user_state["id"] = 2

    response = client.get(
        "/api/admin/analytics/summary"
    )

    assert response.status_code == 403


def test_founder_can_read_privacy_safe_summary():
    current_user_state["id"] = 2

    event_response = client.post(
        "/api/analytics/events",
        json={
            "event_name":
                "file_uploaded",
            "category": "files",
            "surface": "/general-ai",
            "quantity": 2,
            "bytes_count": 4096,
            "metadata": {
                "content":
                    "must not appear",
            },
        },
    )

    assert (
        event_response.status_code
        == 201
    )

    current_user_state["id"] = 1

    access_response = client.get(
        "/api/admin/analytics/access"
    )

    assert access_response.status_code == 200
    assert access_response.json() == {
        "is_platform_admin": True,
    }

    response = client.get(
        "/api/admin/analytics/summary?days=30"
    )

    assert response.status_code == 200

    payload = response.json()

    assert payload["totals"]["users"] == 2
    assert (
        payload["totals"][
            "uploads_in_window"
        ]
        == 2
    )
    assert (
        payload["totals"][
            "uploaded_bytes_in_window"
        ]
        == 4096
    )
    assert (
        payload["privacy"][
            "content_collected"
        ]
        is False
    )

    serialized = json.dumps(
        payload
    )

    assert "must not appear" not in serialized
    assert "private question" not in serialized



def test_generated_test_accounts_are_excluded_from_analytics():
    from app.routes.admin_analytics import (
        is_generated_test_account_email,
    )

    assert is_generated_test_account_email(
        "auth-target-123456-example@example.com"
    )
    assert is_generated_test_account_email(
        "lifecycle-owner-123@example.com"
    )
    assert is_generated_test_account_email(
        "link-member-123@example.org"
    )
    assert is_generated_test_account_email(
        "room-owner-123@example.net"
    )

    assert not is_generated_test_account_email(
        "founder@example.com"
    )
    assert not is_generated_test_account_email(
        "student@example.com"
    )
    assert not is_generated_test_account_email(
        "auth-user@gmail.com"
    )
    assert not is_generated_test_account_email(
        None
    )
