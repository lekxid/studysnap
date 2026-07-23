from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.database import Base, get_db
from app.models.ai_conversation import (
    AIConversation,
)
from app.models.ai_message import AIMessage
from app.models.central_action import (
    CentralAction,
)
from app.models.flashcard import Flashcard
from app.models.note import Note
from app.models.quiz import Quiz
from app.models.quiz_question import (
    QuizQuestion,
)
from app.models.study_plan import StudyPlan
from app.models.study_room import StudyRoom
from app.models.user import User
from app.routes import central_actions as actions_module
from app.routes.central_actions import router
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

test_app = FastAPI()
test_app.include_router(
    router,
    prefix="/api/actions",
)


def override_get_db():
    db = TestingSessionLocal()

    try:
        yield db
    finally:
        db.close()


def override_current_user():
    return SimpleNamespace(id=1)


test_app.dependency_overrides[
    get_db
] = override_get_db

test_app.dependency_overrides[
    get_current_user
] = override_current_user

client = TestClient(test_app)


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()

    user = User(
        id=1,
        email="actions@example.com",
        full_name="Action User",
        password_hash="test",
        learning_mode="clear",
    )

    room = StudyRoom(
        id=10,
        name="Nursing Fundamentals",
        subject="Nursing",
        description="Action tests",
        owner_id=1,
    )

    db.add(user)
    db.add(room)
    db.commit()
    db.close()

    yield


def test_note_preview_execute_duplicate_and_undo():
    preview_response = client.post(
        "/api/actions/preview",
        json={
            "action_type": "save_note",
            "study_room_id": 10,
            "payload": {
                "title": "Vital signs",
                "content": (
                    "Vital signs include temperature, "
                    "pulse, respirations, and blood pressure."
                ),
            },
        },
    )

    assert preview_response.status_code == 200

    preview = preview_response.json()

    assert preview["status"] == "preview"
    assert preview["can_execute"] is True
    assert preview["duplicate"] is False

    action_id = preview["id"]

    execute_response = client.post(
        f"/api/actions/{action_id}/execute"
    )

    assert execute_response.status_code == 200

    executed = execute_response.json()

    assert executed["status"] == "executed"
    assert executed["result"]["entity_type"] == "note"
    assert executed["can_undo"] is True

    duplicate_response = client.post(
        "/api/actions/preview",
        json={
            "action_type": "save_note",
            "study_room_id": 10,
            "payload": {
                "title": "Vital signs",
                "content": (
                    "Vital signs include temperature, "
                    "pulse, respirations, and blood pressure."
                ),
            },
        },
    )

    duplicate = duplicate_response.json()

    assert duplicate["id"] == action_id
    assert duplicate["duplicate"] is True
    assert duplicate["status"] == "executed"

    repeat_execute = client.post(
        f"/api/actions/{action_id}/execute"
    ).json()

    assert repeat_execute["already_executed"] is True

    db = TestingSessionLocal()

    assert db.query(Note).count() == 1
    assert db.query(CentralAction).count() == 1

    db.close()

    undo_response = client.post(
        f"/api/actions/{action_id}/undo"
    )

    assert undo_response.status_code == 200

    undone = undo_response.json()

    assert undone["status"] == "undone"
    assert (
        undone["undo_result"]["deleted_count"]
        == 1
    )

    db = TestingSessionLocal()

    assert db.query(Note).count() == 0

    db.close()


def test_source_message_supplies_room_and_content():
    db = TestingSessionLocal()

    conversation = AIConversation(
        title="Head-to-Toe Assessment",
        mode="general",
        surface="general_ai",
        study_room_id=10,
        owner_id=1,
    )

    db.add(conversation)
    db.flush()

    message = AIMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=(
            "Start by introducing yourself, "
            "confirming the client, and explaining "
            "the assessment."
        ),
    )

    db.add(message)
    db.commit()
    db.refresh(message)

    message_id = message.id
    db.close()

    response = client.post(
        "/api/actions/preview",
        json={
            "action_type": "save_note",
            "source_message_id": message_id,
            "payload": {},
        },
    )

    assert response.status_code == 200

    preview = response.json()

    assert preview["study_room_id"] == 10
    assert preview["conversation_id"] is not None

    execute = client.post(
        f'/api/actions/{preview["id"]}/execute'
    )

    assert execute.status_code == 200

    db = TestingSessionLocal()

    note = db.query(Note).one()

    assert note.study_room_id == 10
    assert "introducing yourself" in note.content

    db.close()


def test_flashcards_execute_and_undo(
    monkeypatch,
):
    monkeypatch.setattr(
        actions_module,
        "generate_basic_flashcards",
        lambda content: [
            {
                "question": (
                    "What is a normal adult pulse?"
                ),
                "answer": (
                    "Usually 60 to 100 beats "
                    "per minute."
                ),
            },
            {
                "question": (
                    "What does respiration mean?"
                ),
                "answer": (
                    "Breathing in and out."
                ),
            },
        ],
    )

    preview = client.post(
        "/api/actions/preview",
        json={
            "action_type": "create_flashcards",
            "study_room_id": 10,
            "payload": {
                "content": "Vital signs notes",
                "count": 2,
            },
        },
    ).json()

    executed = client.post(
        f'/api/actions/{preview["id"]}/execute'
    )

    assert executed.status_code == 200
    assert executed.json()["result"]["count"] == 2

    db = TestingSessionLocal()

    assert db.query(Flashcard).count() == 2

    db.close()

    undo = client.post(
        f'/api/actions/{preview["id"]}/undo'
    )

    assert undo.status_code == 200

    db = TestingSessionLocal()

    assert db.query(Flashcard).count() == 0

    db.close()


def test_quiz_and_planner_actions(
    monkeypatch,
):
    monkeypatch.setattr(
        actions_module,
        "generate_basic_quiz",
        lambda content: [
            {
                "question": (
                    "Which is a vital sign?"
                ),
                "option_a": "Blood pressure",
                "option_b": "Hair colour",
                "option_c": "Shoe size",
                "option_d": "Room number",
                "correct_answer": "A",
                "explanation": (
                    "Blood pressure is a vital sign."
                ),
            }
        ],
    )

    quiz_preview = client.post(
        "/api/actions/preview",
        json={
            "action_type": "create_quiz",
            "study_room_id": 10,
            "payload": {
                "title": "Vital Signs Quiz",
                "content": "Vital signs notes",
            },
        },
    ).json()

    quiz_execute = client.post(
        f'/api/actions/{quiz_preview["id"]}/execute'
    )

    assert quiz_execute.status_code == 200
    assert (
        quiz_execute.json()["result"][
            "question_count"
        ]
        == 1
    )

    planner_preview = client.post(
        "/api/actions/preview",
        json={
            "action_type": "add_to_planner",
            "study_room_id": 10,
            "payload": {
                "title": "Review vital signs",
                "scheduled_for": (
                    "2026-07-24T18:00:00-04:00"
                ),
                "duration_minutes": 30,
                "priority": "High",
            },
        },
    ).json()

    planner_execute = client.post(
        f'/api/actions/{planner_preview["id"]}/execute'
    )

    assert planner_execute.status_code == 200

    db = TestingSessionLocal()

    assert db.query(Quiz).count() == 1
    assert db.query(QuizQuestion).count() == 1
    assert db.query(StudyPlan).count() == 1

    db.close()
