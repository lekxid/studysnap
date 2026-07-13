import unittest
import uuid
from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.database import Base, get_db
from app.models.room_member import RoomMember
from app.models.user import User
from app.routes.auth import router as auth_router
from app.routes.room_members import (
    router as room_members_router,
)
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
    room_members_router,
    prefix="/api/room-members",
)

test_app.dependency_overrides[get_db] = (
    override_get_db
)


class RoomMemberAPITests(unittest.TestCase):
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

    def create_room(
        self,
        owner_token,
    ):
        response = self.client.post(
            "/api/study-rooms",
            headers=self.auth_headers(
                owner_token
            ),
            json={
                "name": (
                    "Real Member Test Room"
                ),
                "subject": (
                    "Integration Testing"
                ),
                "description": (
                    "Testing durable room "
                    "member listing."
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
        *,
        role="member",
        status="active",
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

            membership = RoomMember(
                room_id=room_id,
                user_id=user.id,
                role=role,
                status=status,
                last_active_at=(
                    datetime.utcnow()
                ),
            )

            db.add(membership)
            db.commit()
            db.refresh(membership)

            return user.id
        finally:
            db.close()

    def list_members(
        self,
        room_id,
        token,
    ):
        return self.client.get(
            (
                "/api/room-members/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(
                token
            ),
        )

    def test_owner_lists_real_active_members(
        self,
    ):
        owner_email, owner_token = (
            self.create_user_and_login(
                "owner",
                "Owner Student",
            )
        )

        member_email, _member_token = (
            self.create_user_and_login(
                "member",
                "Member Student",
            )
        )

        viewer_email, _viewer_token = (
            self.create_user_and_login(
                "viewer",
                "Viewer Student",
            )
        )

        inactive_email, _inactive_token = (
            self.create_user_and_login(
                "inactive",
                "Inactive Student",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        self.add_membership(
            room_id,
            member_email,
            role="member",
        )

        self.add_membership(
            room_id,
            viewer_email,
            role="viewer",
        )

        self.add_membership(
            room_id,
            inactive_email,
            role="member",
            status="removed",
        )

        response = self.list_members(
            room_id,
            owner_token,
        )

        self.assertEqual(
            response.status_code,
            200,
            response.text,
        )

        payload = response.json()

        self.assertEqual(
            payload["room_id"],
            room_id,
        )

        self.assertEqual(
            payload["current_user_role"],
            "owner",
        )

        self.assertTrue(
            payload["permissions"][
                "can_manage_members"
            ]
        )

        self.assertEqual(
            payload["total"],
            3,
        )

        members = payload["members"]

        self.assertEqual(
            [
                item["role"]
                for item in members
            ],
            [
                "owner",
                "member",
                "viewer",
            ],
        )

        self.assertEqual(
            members[0]["email"],
            owner_email,
        )

        self.assertEqual(
            members[1]["email"],
            member_email,
        )

        self.assertEqual(
            members[2]["email"],
            viewer_email,
        )

        self.assertTrue(
            members[0][
                "is_current_user"
            ]
        )

        self.assertTrue(
            members[0]["is_owner"]
        )

        self.assertIsNotNone(
            members[0]["joined_at"]
        )

        returned_emails = {
            item["email"]
            for item in members
        }

        self.assertNotIn(
            inactive_email,
            returned_emails,
        )

    def test_regular_member_gets_private_view(
        self,
    ):
        owner_email, owner_token = (
            self.create_user_and_login(
                "owner-private",
                "Private Owner",
            )
        )

        member_email, member_token = (
            self.create_user_and_login(
                "member-private",
                "Private Member",
            )
        )

        peer_email, _peer_token = (
            self.create_user_and_login(
                "peer-private",
                "Private Peer",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        member_user_id = (
            self.add_membership(
                room_id,
                member_email,
                role="member",
            )
        )

        self.add_membership(
            room_id,
            peer_email,
            role="member",
        )

        response = self.list_members(
            room_id,
            member_token,
        )

        self.assertEqual(
            response.status_code,
            200,
            response.text,
        )

        payload = response.json()

        self.assertEqual(
            payload["current_user_role"],
            "member",
        )

        self.assertFalse(
            payload["permissions"][
                "can_manage_members"
            ]
        )

        members_by_id = {
            item["user_id"]: item
            for item in payload["members"]
        }

        current_member = (
            members_by_id[
                member_user_id
            ]
        )

        self.assertEqual(
            current_member["email"],
            member_email,
        )

        self.assertTrue(
            current_member[
                "is_current_user"
            ]
        )

        other_members = [
            item
            for item in payload["members"]
            if not item[
                "is_current_user"
            ]
        ]

        self.assertTrue(
            other_members
        )

        self.assertTrue(
            all(
                item["email"] is None
                for item in other_members
            )
        )

        returned_names = {
            item["full_name"]
            for item in payload[
                "members"
            ]
        }

        self.assertIn(
            "Private Owner",
            returned_names,
        )

        self.assertIn(
            "Private Peer",
            returned_names,
        )

        self.assertNotEqual(
            owner_email,
            member_email,
        )

    def test_outsider_cannot_list_members(
        self,
    ):
        _owner_email, owner_token = (
            self.create_user_and_login(
                "owner-outsider",
                "Outsider Test Owner",
            )
        )

        _outsider_email, outsider_token = (
            self.create_user_and_login(
                "outsider",
                "Outside Student",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        response = self.list_members(
            room_id,
            outsider_token,
        )

        self.assertEqual(
            response.status_code,
            404,
            response.text,
        )


if __name__ == "__main__":
    unittest.main()
