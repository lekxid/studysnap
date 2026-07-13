import unittest
import uuid
from unittest.mock import patch

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
from app.models.room_member import RoomMember
from app.models.study_room import StudyRoom
from app.models.user import User
from app.routes import ai as ai_module
from app.routes.ai import router as ai_router
from app.routes.auth import router as auth_router
from app.routes.study_rooms import (
    router as study_rooms_router,
)


TEST_DATABASE_URL = "sqlite://"
TEST_PASSWORD = "StudySnapTest!2026"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={
        "check_same_thread": False,
    },
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
)


def override_get_db():
    db = TestingSessionLocal()

    try:
        yield db
    finally:
        db.close()


test_app = FastAPI()

test_app.include_router(
    auth_router,
    prefix="/api/auth",
)

test_app.include_router(
    study_rooms_router,
    prefix="/api/study-rooms",
)

test_app.include_router(
    ai_router,
    prefix="/api/ai",
)

test_app.dependency_overrides[get_db] = (
    override_get_db
)


class RoomAIAccessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(test_app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        test_app.dependency_overrides.clear()
        test_engine.dispose()

    def setUp(self):
        Base.metadata.drop_all(
            bind=test_engine
        )

        Base.metadata.create_all(
            bind=test_engine
        )

        self.suffix = uuid.uuid4().hex

    def email(self, label):
        return (
            f"{label}-{self.suffix}"
            "@example.com"
        )

    def auth_headers(self, token):
        return {
            "Authorization": (
                f"Bearer {token}"
            ),
        }

    def signup(
        self,
        email,
        full_name,
    ):
        response = self.client.post(
            "/api/auth/signup",
            json={
                "email": email,
                "full_name": full_name,
                "password": TEST_PASSWORD,
                "learning_mode": "clear",
            },
        )

        self.assertEqual(
            response.status_code,
            200,
            response.text,
        )

    def login(self, email):
        response = self.client.post(
            "/api/auth/login",
            json={
                "email": email,
                "password": TEST_PASSWORD,
            },
        )

        self.assertEqual(
            response.status_code,
            200,
            response.text,
        )

        token = response.json().get(
            "access_token"
        )

        self.assertTrue(
            token,
            response.text,
        )

        return token

    def create_user_and_login(
        self,
        label,
        full_name,
    ):
        email = self.email(label)

        self.signup(
            email,
            full_name,
        )

        token = self.login(email)

        return email, token

    def create_room(self, owner_token):
        response = self.client.post(
            "/api/study-rooms",
            headers=self.auth_headers(
                owner_token
            ),
            json={
                "name": "Shared AI Test Room",
                "subject": "Room AI",
                "description": (
                    "Testing joined-member "
                    "Room AI permissions."
                ),
            },
        )

        self.assertEqual(
            response.status_code,
            200,
            response.text,
        )

        return response.json()["id"]

    def add_membership(
        self,
        room_id,
        email,
        role,
    ):
        db = TestingSessionLocal()

        try:
            user = (
                db.query(User)
                .filter(
                    User.email == email
                )
                .one()
            )

            db.add(
                RoomMember(
                    room_id=room_id,
                    user_id=user.id,
                    role=role,
                    status="active",
                )
            )

            db.commit()

            return user.id
        finally:
            db.close()

    def create_room_conversation(
        self,
        room_id,
        token,
    ):
        return self.client.post(
            "/api/ai/conversations",
            headers=self.auth_headers(
                token
            ),
            json={
                "study_room_id": room_id,
                "title": "Member Room Trail",
                "mode": "general",
                "surface": "room_ai",
                "force_new": True,
            },
        )

    def test_member_can_create_and_list_room_ai_trail(
        self,
    ):
        _owner_email, owner_token = (
            self.create_user_and_login(
                "owner",
                "Room AI Owner",
            )
        )

        member_email, member_token = (
            self.create_user_and_login(
                "member",
                "Room AI Member",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        self.add_membership(
            room_id,
            member_email,
            "member",
        )

        create_response = (
            self.create_room_conversation(
                room_id,
                member_token,
            )
        )

        self.assertEqual(
            create_response.status_code,
            200,
            create_response.text,
        )

        conversation = (
            create_response.json()
        )

        self.assertEqual(
            conversation["study_room_id"],
            room_id,
        )

        list_response = self.client.get(
            (
                "/api/ai/conversations/"
                f"{room_id}"
                "?mode=general"
                "&surface=room_ai"
            ),
            headers=self.auth_headers(
                member_token
            ),
        )

        self.assertEqual(
            list_response.status_code,
            200,
            list_response.text,
        )

        returned_ids = {
            item["id"]
            for item in list_response.json()
        }

        self.assertIn(
            conversation["id"],
            returned_ids,
        )

    def test_room_ai_permission_guards(
        self,
    ):
        _owner_email, owner_token = (
            self.create_user_and_login(
                "owner-guards",
                "Guard Owner",
            )
        )

        viewer_email, viewer_token = (
            self.create_user_and_login(
                "viewer",
                "Guard Viewer",
            )
        )

        _outsider_email, outsider_token = (
            self.create_user_and_login(
                "outsider",
                "Guard Outsider",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        self.add_membership(
            room_id,
            viewer_email,
            "viewer",
        )

        viewer_response = (
            self.create_room_conversation(
                room_id,
                viewer_token,
            )
        )

        self.assertEqual(
            viewer_response.status_code,
            403,
            viewer_response.text,
        )

        outsider_response = (
            self.create_room_conversation(
                room_id,
                outsider_token,
            )
        )

        self.assertEqual(
            outsider_response.status_code,
            404,
            outsider_response.text,
        )

    def test_member_context_uses_room_owner_sources(
        self,
    ):
        _owner_email, owner_token = (
            self.create_user_and_login(
                "owner-context",
                "Context Owner",
            )
        )

        member_email, member_token = (
            self.create_user_and_login(
                "member-context",
                "Context Member",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        member_user_id = (
            self.add_membership(
                room_id,
                member_email,
                "member",
            )
        )

        create_response = (
            self.create_room_conversation(
                room_id,
                member_token,
            )
        )

        self.assertEqual(
            create_response.status_code,
            200,
            create_response.text,
        )

        conversation_id = (
            create_response.json()["id"]
        )

        db = TestingSessionLocal()

        try:
            room = (
                db.query(StudyRoom)
                .filter(
                    StudyRoom.id == room_id
                )
                .one()
            )

            conversation = (
                db.query(AIConversation)
                .filter(
                    AIConversation.id
                    == conversation_id
                )
                .one()
            )

            with patch(
                "app.routes.ai."
                "build_study_room_context",
                return_value=(
                    "Shared room learning context"
                ),
            ) as mocked_context:
                result = (
                    ai_module
                    .build_conversation_history_context(
                        db=db,
                        conversation=conversation,
                        requesting_user_id=(
                            member_user_id
                        ),
                        question=(
                            "What should we study?"
                        ),
                    )
                )

            self.assertIn(
                "Shared room learning context",
                result,
            )

            context_kwargs = (
                mocked_context
                .call_args
                .kwargs
            )

            self.assertEqual(
                context_kwargs["study_room_id"],
                room_id,
            )

            self.assertEqual(
                context_kwargs["owner_id"],
                room.owner_id,
            )

            self.assertNotEqual(
                room.owner_id,
                member_user_id,
            )
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
