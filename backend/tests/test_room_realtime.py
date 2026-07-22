import asyncio
import unittest
import uuid

from fastapi import FastAPI
from fastapi.testclient import (
    TestClient,
)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.websockets import (
    WebSocketDisconnect,
)

import app.models
from app.database import Base, get_db
from app.models.room_member import (
    RoomMember,
)
from app.models.user import User
from app.routes.auth import (
    router as auth_router,
)
from app.routes.room_realtime import (
    router as room_realtime_router,
)
from app.routes.study_rooms import (
    router as study_rooms_router,
)
from app.services.rooms.realtime import (
    reset_room_realtime_state_for_tests,
    room_realtime_manager,
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
    room_realtime_router,
    prefix="/api/room-realtime",
)

test_app.dependency_overrides[get_db] = (
    override_get_db
)


class RoomRealtimeTests(
    unittest.TestCase
):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(
            test_app
        )

    @classmethod
    def tearDownClass(cls):
        cls.client.close()

        test_app.dependency_overrides.clear()

        test_engine.dispose()

    def setUp(self):
        reset_room_realtime_state_for_tests()

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

    def create_user_and_login(
        self,
        label,
        full_name,
    ):
        email = self.email(label)

        signup_response = (
            self.client.post(
                "/api/auth/signup",
                json={
                    "email": email,
                    "full_name": full_name,
                    "password": (
                        TEST_PASSWORD
                    ),
                    "learning_mode": (
                        "clear"
                    ),
                },
            )
        )

        self.assertEqual(
            signup_response.status_code,
            200,
            signup_response.text,
        )

        login_response = (
            self.client.post(
                "/api/auth/login",
                json={
                    "email": email,
                    "password": (
                        TEST_PASSWORD
                    ),
                },
            )
        )

        self.assertEqual(
            login_response.status_code,
            200,
            login_response.text,
        )

        token = (
            login_response
            .json()
            .get("access_token")
        )

        self.assertTrue(
            token,
            login_response.text,
        )

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
                    "Realtime Test Room"
                ),
                "subject": (
                    "Integration Testing"
                ),
                "description": (
                    "Testing authenticated "
                    "room WebSockets."
                ),
            },
        )

        self.assertEqual(
            response.status_code,
            200,
            response.text,
        )

        return response.json()["id"]

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

    def create_ticket(
        self,
        room_id,
        token,
    ):
        return self.client.post(
            (
                "/api/room-realtime/"
                f"rooms/{room_id}/ticket"
            ),
            headers=self.auth_headers(
                token
            ),
        )

    def websocket_url(
        self,
        room_id,
        ticket,
    ):
        return (
            "/api/room-realtime/"
            f"rooms/{room_id}"
            f"?ticket={ticket}"
        )

    def receive_until(
        self,
        websocket,
        expected_event,
        limit=12,
    ):
        received = []

        for _ in range(limit):
            payload = (
                websocket.receive_json()
            )

            received.append(
                payload.get("event")
            )

            if (
                payload.get("event")
                == expected_event
            ):
                return payload

        self.fail(
            f"Did not receive {expected_event}. "
            f"Received: {received}"
        )

    def test_owner_connects_and_receives_ready(
        self,
    ):
        _email, owner_token = (
            self.create_user_and_login(
                "owner",
                "Realtime Owner",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        ticket_response = (
            self.create_ticket(
                room_id,
                owner_token,
            )
        )

        self.assertEqual(
            ticket_response.status_code,
            200,
            ticket_response.text,
        )

        payload = ticket_response.json()

        with self.client.websocket_connect(
            self.websocket_url(
                room_id,
                payload["ticket"],
            )
        ) as websocket:
            ready = self.receive_until(
                websocket,
                "connection.ready",
            )

            self.assertEqual(
                ready["event"],
                "connection.ready",
            )

            self.assertEqual(
                ready["room_id"],
                room_id,
            )

            self.assertEqual(
                ready["data"]["role"],
                "owner",
            )

            websocket.send_json(
                {
                    "event": (
                        "connection.ping"
                    )
                }
            )

            pong = self.receive_until(
                websocket,
                "connection.pong",
            )

            self.assertEqual(
                pong["event"],
                "connection.pong",
            )

    def test_member_can_connect(
        self,
    ):
        _owner_email, owner_token = (
            self.create_user_and_login(
                "owner-member",
                "Member Test Owner",
            )
        )

        member_email, member_token = (
            self.create_user_and_login(
                "member",
                "Realtime Member",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        member_user_id = (
            self.add_member(
                room_id,
                member_email,
            )
        )

        ticket_response = (
            self.create_ticket(
                room_id,
                member_token,
            )
        )

        self.assertEqual(
            ticket_response.status_code,
            200,
            ticket_response.text,
        )

        with self.client.websocket_connect(
            self.websocket_url(
                room_id,
                ticket_response.json()[
                    "ticket"
                ],
            )
        ) as websocket:
            ready = self.receive_until(
                websocket,
                "connection.ready",
            )

            self.assertEqual(
                ready["event"],
                "connection.ready",
            )

            self.assertEqual(
                ready["actor_user_id"],
                member_user_id,
            )

            self.assertEqual(
                ready["data"]["role"],
                "member",
            )

    def test_outsider_cannot_create_ticket(
        self,
    ):
        _owner_email, owner_token = (
            self.create_user_and_login(
                "owner-outsider",
                "Outsider Owner",
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

        response = self.create_ticket(
            room_id,
            outsider_token,
        )

        self.assertEqual(
            response.status_code,
            404,
            response.text,
        )

    def test_ticket_is_single_use(
        self,
    ):
        _email, owner_token = (
            self.create_user_and_login(
                "owner-ticket",
                "Ticket Owner",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        ticket_response = (
            self.create_ticket(
                room_id,
                owner_token,
            )
        )

        ticket = (
            ticket_response
            .json()["ticket"]
        )

        socket_url = self.websocket_url(
            room_id,
            ticket,
        )

        with self.client.websocket_connect(
            socket_url
        ) as websocket:
            ready = self.receive_until(
                websocket,
                "connection.ready",
            )

            self.assertEqual(
                ready["event"],
                "connection.ready",
            )

        with self.client.websocket_connect(
            socket_url
        ) as websocket:
            with self.assertRaises(
                WebSocketDisconnect
            ):
                websocket.receive_json()


    def test_presence_and_typing_events(
        self,
    ):
        _owner_email, owner_token = (
            self.create_user_and_login(
                "presence-owner",
                "Presence Owner",
            )
        )

        member_email, member_token = (
            self.create_user_and_login(
                "presence-member",
                "Typing Member",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        member_user_id = self.add_member(
            room_id,
            member_email,
        )

        owner_ticket = self.create_ticket(
            room_id,
            owner_token,
        ).json()

        member_ticket = self.create_ticket(
            room_id,
            member_token,
        ).json()

        with self.client.websocket_connect(
            self.websocket_url(
                room_id,
                owner_ticket["ticket"],
            )
        ) as owner_socket:
            self.receive_until(
                owner_socket,
                "connection.ready",
            )

            owner_snapshot = (
                self.receive_until(
                    owner_socket,
                    "presence.snapshot",
                )
            )

            self.assertIn(
                owner_ticket["user_id"],
                owner_snapshot["data"][
                    "online_user_ids"
                ],
            )

            self.receive_until(
                owner_socket,
                "presence.joined",
            )

            with self.client.websocket_connect(
                self.websocket_url(
                    room_id,
                    member_ticket["ticket"],
                )
            ) as member_socket:
                self.receive_until(
                    member_socket,
                    "connection.ready",
                )

                member_snapshot = (
                    self.receive_until(
                        member_socket,
                        "presence.snapshot",
                    )
                )

                self.assertIn(
                    member_user_id,
                    member_snapshot["data"][
                        "online_user_ids"
                    ],
                )

                joined = self.receive_until(
                    owner_socket,
                    "presence.joined",
                )

                self.assertEqual(
                    joined["actor_user_id"],
                    member_user_id,
                )

                member_socket.send_json(
                    {
                        "event":
                            "typing.started"
                    }
                )

                typing_started = (
                    self.receive_until(
                        owner_socket,
                        "typing.started",
                    )
                )

                self.assertEqual(
                    typing_started[
                        "actor_user_id"
                    ],
                    member_user_id,
                )

                self.assertEqual(
                    typing_started["data"][
                        "full_name"
                    ],
                    "Typing Member",
                )

                member_socket.send_json(
                    {
                        "event":
                            "typing.stopped"
                    }
                )

                typing_stopped = (
                    self.receive_until(
                        owner_socket,
                        "typing.stopped",
                    )
                )

                self.assertEqual(
                    typing_stopped[
                        "actor_user_id"
                    ],
                    member_user_id,
                )

            left = self.receive_until(
                owner_socket,
                "presence.left",
            )

            self.assertEqual(
                left["actor_user_id"],
                member_user_id,
            )

            self.assertIn(
                "last_active_at",
                left["data"],
            )

    def test_multiple_tabs_count_as_one_online_user(
        self,
    ):
        class FakeWebSocket:
            def __init__(self):
                self.accepted = False
                self.payloads = []

            async def accept(self):
                self.accepted = True

            async def send_json(
                self,
                payload,
            ):
                self.payloads.append(
                    payload
                )

        async def scenario():
            first_socket = (
                FakeWebSocket()
            )

            second_socket = (
                FakeWebSocket()
            )

            first_join = (
                await room_realtime_manager
                .connect(
                    room_id=901,
                    user_id=77,
                    websocket=first_socket,
                )
            )

            second_join = (
                await room_realtime_manager
                .connect(
                    room_id=901,
                    user_id=77,
                    websocket=second_socket,
                )
            )

            self.assertTrue(
                first_join
            )

            self.assertFalse(
                second_join
            )

            self.assertEqual(
                room_realtime_manager
                .online_user_ids(901),
                [77],
            )

            self.assertEqual(
                room_realtime_manager
                .user_connection_count(
                    901,
                    77,
                ),
                2,
            )

            first_left, _ = (
                room_realtime_manager
                .disconnect(
                    room_id=901,
                    user_id=77,
                    websocket=first_socket,
                )
            )

            self.assertFalse(
                first_left
            )

            self.assertEqual(
                room_realtime_manager
                .user_connection_count(
                    901,
                    77,
                ),
                1,
            )

            second_left, _ = (
                room_realtime_manager
                .disconnect(
                    room_id=901,
                    user_id=77,
                    websocket=second_socket,
                )
            )

            self.assertTrue(
                second_left
            )

            self.assertEqual(
                room_realtime_manager
                .online_user_ids(901),
                [],
            )

        asyncio.run(
            scenario()
        )


if __name__ == "__main__":
    unittest.main()
