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
from app.models.room_member import RoomMember
from app.models.user import User
from app.routes.auth import router as auth_router
from app.routes.room_messages import (
    router as room_messages_router,
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
    room_messages_router,
    prefix="/api/room-messages",
)

test_app.dependency_overrides[get_db] = (
    override_get_db
)


class RoomMessageAPITests(unittest.TestCase):
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
        name="Shared Message Test Room",
    ):
        response = self.client.post(
            "/api/study-rooms",
            headers=self.auth_headers(
                owner_token
            ),
            json={
                "name": name,
                "subject": "Integration Testing",
                "description": (
                    "Created inside an isolated "
                    "message API test database."
                ),
            },
        )

        self.assertEqual(
            response.status_code,
            200,
            response.text,
        )

        room = response.json()

        self.assertEqual(
            room["role"],
            "owner",
        )

        return room["id"]

    def add_member(
        self,
        room_id,
        email,
        role="member",
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

            membership = (
                db.query(RoomMember)
                .filter(
                    RoomMember.room_id
                    == room_id,
                    RoomMember.user_id
                    == user.id,
                )
                .first()
            )

            if membership is None:
                membership = RoomMember(
                    room_id=room_id,
                    user_id=user.id,
                    role=role,
                    status="active",
                )

                db.add(membership)
            else:
                membership.role = role
                membership.status = "active"

            db.commit()

            return user.id
        finally:
            db.close()

    def send_message(
        self,
        room_id,
        token,
        content,
        reply_to_message_id=None,
    ):
        payload = {
            "content": content,
        }

        if reply_to_message_id is not None:
            payload[
                "reply_to_message_id"
            ] = reply_to_message_id

        return self.client.post(
            (
                "/api/room-messages/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(token),
            json=payload,
        )

    def test_create_update_delete_broadcast_realtime_events(
        self,
    ):
        _owner_email, owner_token = (
            self.create_user_and_login(
                "realtime-message-owner",
                "Realtime Message Owner",
            )
        )

        room_id = self.create_room(
            owner_token,
            name="Realtime Broadcast Room",
        )

        captured_events = []

        async def capture_event(**kwargs):
            captured_events.append(kwargs)
            return kwargs

        with patch(
            (
                "app.routes.room_messages."
                "broadcast_room_realtime_event"
            ),
            new=capture_event,
        ):
            created_response = self.send_message(
                room_id,
                owner_token,
                "First live message",
            )

            self.assertEqual(
                created_response.status_code,
                200,
                created_response.text,
            )

            created_message = (
                created_response.json()
            )

            updated_response = (
                self.client.patch(
                    (
                        "/api/room-messages/"
                        f"rooms/{room_id}/"
                        f"{created_message['id']}"
                    ),
                    headers=self.auth_headers(
                        owner_token
                    ),
                    json={
                        "content": (
                            "Updated live message"
                        ),
                    },
                )
            )

            self.assertEqual(
                updated_response.status_code,
                200,
                updated_response.text,
            )

            deleted_response = (
                self.client.delete(
                    (
                        "/api/room-messages/"
                        f"rooms/{room_id}/"
                        f"{created_message['id']}"
                    ),
                    headers=self.auth_headers(
                        owner_token
                    ),
                )
            )

            self.assertEqual(
                deleted_response.status_code,
                200,
                deleted_response.text,
            )

        self.assertEqual(
            [
                item["event"]
                for item in captured_events
            ],
            [
                "message.created",
                "message.updated",
                "message.deleted",
            ],
        )

        for captured in captured_events:
            self.assertEqual(
                captured["room_id"],
                room_id,
            )

            self.assertIsNotNone(
                captured["actor_user_id"]
            )

            self.assertIn(
                "message",
                captured["data"],
            )

            self.assertEqual(
                captured["data"][
                    "message"
                ]["id"],
                created_message["id"],
            )

        self.assertEqual(
            captured_events[0]["data"][
                "message"
            ]["content"],
            "First live message",
        )

        self.assertEqual(
            captured_events[1]["data"][
                "message"
            ]["content"],
            "Updated live message",
        )

        self.assertTrue(
            captured_events[2]["data"][
                "message"
            ]["is_deleted"]
        )

        self.assertEqual(
            captured_events[2]["data"][
                "message"
            ]["content"],
            "",
        )

    def test_member_can_send_read_and_reply(
        self,
    ):
        _, owner_token = (
            self.create_user_and_login(
                "message-owner",
                "Message Owner",
            )
        )

        member_email, member_token = (
            self.create_user_and_login(
                "message-member",
                "Message Member",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        self.add_member(
            room_id,
            member_email,
            role="member",
        )

        created = self.send_message(
            room_id,
            member_token,
            "  Can someone explain chapter four?  ",
        )

        self.assertEqual(
            created.status_code,
            200,
            created.text,
        )

        created_message = created.json()

        self.assertEqual(
            created_message["content"],
            (
                "Can someone explain "
                "chapter four?"
            ),
        )

        self.assertEqual(
            created_message[
                "message_type"
            ],
            "message",
        )

        self.assertFalse(
            created_message["is_deleted"]
        )

        self.assertEqual(
            created_message[
                "sender"
            ]["full_name"],
            "Message Member",
        )

        self.assertEqual(
            created_message[
                "sender"
            ]["email"],
            member_email,
        )

        reply = self.send_message(
            room_id,
            owner_token,
            (
                "Yes. Let us solve it "
                "together."
            ),
            reply_to_message_id=(
                created_message["id"]
            ),
        )

        self.assertEqual(
            reply.status_code,
            200,
            reply.text,
        )

        reply_message = reply.json()

        self.assertEqual(
            reply_message[
                "reply_to_message_id"
            ],
            created_message["id"],
        )

        self.assertEqual(
            reply_message[
                "sender"
            ]["full_name"],
            "Message Owner",
        )

        listing = self.client.get(
            (
                "/api/room-messages/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(
                member_token
            ),
        )

        self.assertEqual(
            listing.status_code,
            200,
            listing.text,
        )

        messages = listing.json()

        self.assertEqual(
            len(messages),
            2,
        )

        self.assertEqual(
            [
                message["id"]
                for message in messages
            ],
            [
                created_message["id"],
                reply_message["id"],
            ],
        )

        older_messages = self.client.get(
            (
                "/api/room-messages/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(
                member_token
            ),
            params={
                "before_id": (
                    reply_message["id"]
                ),
                "limit": 50,
            },
        )

        self.assertEqual(
            older_messages.status_code,
            200,
            older_messages.text,
        )

        self.assertEqual(
            [
                message["id"]
                for message
                in older_messages.json()
            ],
            [
                created_message["id"],
            ],
        )

    def test_viewer_can_read_but_not_send(
        self,
    ):
        _, owner_token = (
            self.create_user_and_login(
                "viewer-owner",
                "Viewer Room Owner",
            )
        )

        viewer_email, viewer_token = (
            self.create_user_and_login(
                "room-viewer",
                "Room Viewer",
            )
        )

        _, outsider_token = (
            self.create_user_and_login(
                "room-outsider",
                "Room Outsider",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        self.add_member(
            room_id,
            viewer_email,
            role="viewer",
        )

        created = self.send_message(
            room_id,
            owner_token,
            "Welcome to the study room.",
        )

        self.assertEqual(
            created.status_code,
            200,
            created.text,
        )

        viewer_listing = self.client.get(
            (
                "/api/room-messages/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(
                viewer_token
            ),
        )

        self.assertEqual(
            viewer_listing.status_code,
            200,
            viewer_listing.text,
        )

        self.assertEqual(
            len(viewer_listing.json()),
            1,
        )

        viewer_send = self.send_message(
            room_id,
            viewer_token,
            "A viewer should not send this.",
        )

        self.assertEqual(
            viewer_send.status_code,
            403,
            viewer_send.text,
        )

        outsider_listing = self.client.get(
            (
                "/api/room-messages/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(
                outsider_token
            ),
        )

        self.assertEqual(
            outsider_listing.status_code,
            404,
            outsider_listing.text,
        )

        outsider_send = self.send_message(
            room_id,
            outsider_token,
            "An outsider should not send this.",
        )

        self.assertEqual(
            outsider_send.status_code,
            404,
            outsider_send.text,
        )

    def test_edit_delete_and_moderation_rules(
        self,
    ):
        _, owner_token = (
            self.create_user_and_login(
                "moderation-owner",
                "Moderation Owner",
            )
        )

        author_email, author_token = (
            self.create_user_and_login(
                "message-author",
                "Message Author",
            )
        )

        other_email, other_token = (
            self.create_user_and_login(
                "other-member",
                "Other Member",
            )
        )

        admin_email, admin_token = (
            self.create_user_and_login(
                "room-admin",
                "Room Admin",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        self.add_member(
            room_id,
            author_email,
            role="member",
        )

        self.add_member(
            room_id,
            other_email,
            role="member",
        )

        self.add_member(
            room_id,
            admin_email,
            role="admin",
        )

        created = self.send_message(
            room_id,
            author_token,
            "My original message.",
        )

        self.assertEqual(
            created.status_code,
            200,
            created.text,
        )

        message_id = created.json()["id"]

        forbidden_edit = self.client.patch(
            (
                "/api/room-messages/"
                f"rooms/{room_id}/{message_id}"
            ),
            headers=self.auth_headers(
                other_token
            ),
            json={
                "content": (
                    "Another member changed it."
                ),
            },
        )

        self.assertEqual(
            forbidden_edit.status_code,
            403,
            forbidden_edit.text,
        )

        forbidden_delete = (
            self.client.delete(
                (
                    "/api/room-messages/"
                    f"rooms/{room_id}/"
                    f"{message_id}"
                ),
                headers=self.auth_headers(
                    other_token
                ),
            )
        )

        self.assertEqual(
            forbidden_delete.status_code,
            403,
            forbidden_delete.text,
        )

        author_edit = self.client.patch(
            (
                "/api/room-messages/"
                f"rooms/{room_id}/{message_id}"
            ),
            headers=self.auth_headers(
                author_token
            ),
            json={
                "content": (
                    "My corrected message."
                ),
            },
        )

        self.assertEqual(
            author_edit.status_code,
            200,
            author_edit.text,
        )

        self.assertEqual(
            author_edit.json()["content"],
            "My corrected message.",
        )

        self.assertIsNotNone(
            author_edit.json()["edited_at"]
        )

        admin_edit = self.client.patch(
            (
                "/api/room-messages/"
                f"rooms/{room_id}/{message_id}"
            ),
            headers=self.auth_headers(
                admin_token
            ),
            json={
                "content": (
                    "Message reviewed by admin."
                ),
            },
        )

        self.assertEqual(
            admin_edit.status_code,
            200,
            admin_edit.text,
        )

        self.assertEqual(
            admin_edit.json()["content"],
            "Message reviewed by admin.",
        )

        owner_delete = self.client.delete(
            (
                "/api/room-messages/"
                f"rooms/{room_id}/{message_id}"
            ),
            headers=self.auth_headers(
                owner_token
            ),
        )

        self.assertEqual(
            owner_delete.status_code,
            200,
            owner_delete.text,
        )

        deleted_message = (
            owner_delete.json()
        )

        self.assertTrue(
            deleted_message["is_deleted"]
        )

        self.assertEqual(
            deleted_message["content"],
            "",
        )

        self.assertIsNotNone(
            deleted_message["deleted_at"]
        )

        listing = self.client.get(
            (
                "/api/room-messages/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(
                author_token
            ),
        )

        self.assertEqual(
            listing.status_code,
            200,
            listing.text,
        )

        self.assertEqual(
            listing.json()[0]["content"],
            "",
        )

        self.assertTrue(
            listing.json()[0]["is_deleted"]
        )

        edit_deleted = self.client.patch(
            (
                "/api/room-messages/"
                f"rooms/{room_id}/{message_id}"
            ),
            headers=self.auth_headers(
                author_token
            ),
            json={
                "content": (
                    "Trying to restore it."
                ),
            },
        )

        self.assertEqual(
            edit_deleted.status_code,
            400,
            edit_deleted.text,
        )

    def test_reply_and_content_guards(
        self,
    ):
        _, owner_token = (
            self.create_user_and_login(
                "guard-owner",
                "Guard Owner",
            )
        )

        member_email, member_token = (
            self.create_user_and_login(
                "guard-member",
                "Guard Member",
            )
        )

        first_room_id = self.create_room(
            owner_token,
            name="First Guard Room",
        )

        second_room_id = self.create_room(
            owner_token,
            name="Second Guard Room",
        )

        self.add_member(
            first_room_id,
            member_email,
            role="member",
        )

        other_room_message = (
            self.send_message(
                second_room_id,
                owner_token,
                "Message from another room.",
            )
        )

        self.assertEqual(
            other_room_message.status_code,
            200,
            other_room_message.text,
        )

        cross_room_reply = self.send_message(
            first_room_id,
            member_token,
            "This reply must be rejected.",
            reply_to_message_id=(
                other_room_message.json()["id"]
            ),
        )

        self.assertEqual(
            cross_room_reply.status_code,
            404,
            cross_room_reply.text,
        )

        local_message = self.send_message(
            first_room_id,
            owner_token,
            "Local message to delete.",
        )

        self.assertEqual(
            local_message.status_code,
            200,
            local_message.text,
        )

        local_message_id = (
            local_message.json()["id"]
        )

        deleted = self.client.delete(
            (
                "/api/room-messages/"
                f"rooms/{first_room_id}/"
                f"{local_message_id}"
            ),
            headers=self.auth_headers(
                owner_token
            ),
        )

        self.assertEqual(
            deleted.status_code,
            200,
            deleted.text,
        )

        reply_to_deleted = (
            self.send_message(
                first_room_id,
                member_token,
                (
                    "A deleted message cannot "
                    "be replied to."
                ),
                reply_to_message_id=(
                    local_message_id
                ),
            )
        )

        self.assertEqual(
            reply_to_deleted.status_code,
            400,
            reply_to_deleted.text,
        )

        empty_message = self.send_message(
            first_room_id,
            member_token,
            "   ",
        )

        self.assertEqual(
            empty_message.status_code,
            400,
            empty_message.text,
        )

        oversized_message = self.send_message(
            first_room_id,
            member_token,
            "x" * 5001,
        )

        self.assertEqual(
            oversized_message.status_code,
            422,
            oversized_message.text,
        )


if __name__ == "__main__":
    unittest.main()
