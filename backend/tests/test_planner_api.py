from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.models.study_plan import StudyPlan
from app.routes.planner import router
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

StudyPlan.__table__.create(
    bind=engine,
    checkfirst=True,
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
    prefix="/api/planner",
)

api_app.dependency_overrides[
    get_db
] = override_get_db

api_app.dependency_overrides[
    get_current_user
] = override_get_current_user

client = TestClient(api_app)


@pytest.fixture(autouse=True)
def reset_planner_database():
    current_user_state["id"] = 101

    with TestingSessionLocal() as db:
        db.query(StudyPlan).delete()
        db.commit()

    yield

    with TestingSessionLocal() as db:
        db.query(StudyPlan).delete()
        db.commit()


def create_plan(
    *,
    title: str = "Review flashcards",
    subject: str = "Networking",
    scheduled_for: str = "2026-07-23T14:30:00",
    priority: str = "Medium",
):
    return client.post(
        "/api/planner",
        json={
            "title": title,
            "subject": subject,
            "description": "Review key concepts.",
            "scheduled_for": scheduled_for,
            "duration_minutes": 25,
            "priority": priority,
        },
    )


def test_create_and_list_owned_plan():
    response = create_plan()

    assert response.status_code == 201

    created = response.json()

    assert created["id"] > 0
    assert created["user_id"] == 101
    assert created["title"] == "Review flashcards"
    assert created["subject"] == "Networking"
    assert created["duration_minutes"] == 25
    assert created["priority"] == "Medium"
    assert created["status"] == "Planned"
    assert created["study_room_id"] is None

    response = client.get(
        "/api/planner",
    )

    assert response.status_code == 200

    plans = response.json()

    assert len(plans) == 1
    assert plans[0]["id"] == created["id"]


def test_users_only_receive_their_own_plans():
    first_response = create_plan(
        title="Owner one task",
    )

    assert first_response.status_code == 201

    current_user_state["id"] = 202

    second_response = create_plan(
        title="Owner two task",
    )

    assert second_response.status_code == 201

    current_user_state["id"] = 101

    response = client.get(
        "/api/planner",
    )

    assert response.status_code == 200

    plans = response.json()

    assert len(plans) == 1
    assert plans[0]["title"] == "Owner one task"
    assert plans[0]["user_id"] == 101


def test_update_plan_and_mark_done():
    created = create_plan().json()

    response = client.patch(
        f"/api/planner/{created['id']}",
        json={
            "title": "Review routing flashcards",
            "priority": "High",
            "status": "Done",
            "duration_minutes": 45,
        },
    )

    assert response.status_code == 200

    updated = response.json()

    assert updated["title"] == "Review routing flashcards"
    assert updated["priority"] == "High"
    assert updated["status"] == "Done"
    assert updated["duration_minutes"] == 45


def test_planned_items_are_returned_before_done_items():
    done_plan = create_plan(
        title="Completed task",
        scheduled_for="2026-07-22T09:00:00",
    ).json()

    response = client.patch(
        f"/api/planner/{done_plan['id']}",
        json={
            "status": "Done",
        },
    )

    assert response.status_code == 200

    planned_plan = create_plan(
        title="Upcoming task",
        scheduled_for="2026-07-24T09:00:00",
    ).json()

    response = client.get(
        "/api/planner",
    )

    assert response.status_code == 200

    plans = response.json()

    assert [
        plan["id"]
        for plan in plans
    ] == [
        planned_plan["id"],
        done_plan["id"],
    ]


def test_other_user_cannot_update_or_delete_plan():
    created = create_plan().json()

    current_user_state["id"] = 202

    update_response = client.patch(
        f"/api/planner/{created['id']}",
        json={
            "status": "Done",
        },
    )

    delete_response = client.delete(
        f"/api/planner/{created['id']}",
    )

    assert update_response.status_code == 404
    assert delete_response.status_code == 404


def test_owner_can_delete_plan():
    created = create_plan().json()

    response = client.delete(
        f"/api/planner/{created['id']}",
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Study plan deleted",
        "id": created["id"],
    }

    response = client.get(
        "/api/planner",
    )

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize(
    ("payload", "expected_status"),
    [
        (
            {
                "title": "   ",
                "subject": "Networking",
                "scheduled_for": "2026-07-23T14:30:00",
            },
            422,
        ),
        (
            {
                "title": "Review",
                "subject": "   ",
                "scheduled_for": "2026-07-23T14:30:00",
            },
            422,
        ),
        (
            {
                "title": "Review",
                "subject": "Networking",
                "scheduled_for": "2026-07-23T14:30:00",
                "duration_minutes": 0,
            },
            422,
        ),
        (
            {
                "title": "Review",
                "subject": "Networking",
                "scheduled_for": "2026-07-23T14:30:00",
                "priority": "Urgent",
            },
            422,
        ),
    ],
)
def test_invalid_planner_data_is_rejected(
    payload,
    expected_status,
):
    response = client.post(
        "/api/planner",
        json=payload,
    )

    assert response.status_code == expected_status
