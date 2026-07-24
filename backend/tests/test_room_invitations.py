import unittest
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.database import Base, get_db
from app.routes.auth import router as auth_router
from app.models.room_invitation import RoomInvitation
from app.models.room_invite_link import RoomInviteLink
from app.routes.room_invitations import (
    refresh_email_status,
    refresh_link_status,
    router as room_invitations_router,
)
from app.routes.study_rooms import (
    router as study_rooms_router,
)


TEST_DATABASE_URL = "sqlite://"
TEST_PASSWORD = "StudySnapTest!2026"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
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


api_app = FastAPI()

api_app.include_router(
    auth_router,
    prefix="/api/auth",
)

api_app.include_router(
    study_rooms_router,
    prefix="/api/study-rooms",
)

api_app.include_router(
    room_invitations_router,
    prefix="/api/room-invitations",
)

api_app.dependency_overrides[get_db] = (
    override_get_db
)


class RoomInvitationAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(api_app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        api_app.dependency_overrides.clear()
        test_engine.dispose()

    def setUp(self):
        Base.metadata.drop_all(bind=test_engine)
        Base.metadata.create_all(bind=test_engine)

        self.suffix = uuid.uuid4().hex

    def test_expiry_checks_accept_timezone_aware_datetimes(
        self,
    ):
        expired_at = (
            datetime.now(timezone.utc)
            - timedelta(minutes=5)
        )

        email_invitation = RoomInvitation(
            status="pending",
            expires_at=expired_at,
        )

        invite_link = RoomInviteLink(
            status="active",
            expires_at=expired_at,
            max_uses=None,
            use_count=0,
        )

        self.assertTrue(
            refresh_email_status(email_invitation)
        )
        self.assertEqual(
            email_invitation.status,
            "expired",
        )

        self.assertTrue(
            refresh_link_status(invite_link)
        )
        self.assertEqual(
            invite_link.status,
            "expired",
        )

    def email(self, label):
        return (
            f"{label}-{self.suffix}"
            "@example.com"
        )

    def signup(self, email, full_name):
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

        self.assertEqual(
            response.json()["email"],
            email,
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

    def auth_headers(self, token):
        return {
            "Authorization": f"Bearer {token}"
        }

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
                "name": (
                    "Permanent Invitation Test Room"
                ),
                "subject": "Integration Testing",
                "description": (
                    "Created inside an isolated "
                    "automated test database."
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

    def create_email_invitation(
        self,
        room_id,
        owner_token,
        invitee_email,
        role="member",
    ):
        response = self.client.post(
            (
                "/api/room-invitations/"
                f"rooms/{room_id}/email"
            ),
            headers=self.auth_headers(
                owner_token
            ),
            json={
                "email": invitee_email,
                "role": role,
                "expires_in_days": 7,
            },
        )

        self.assertEqual(
            response.status_code,
            200,
            response.text,
        )

        payload = response.json()

        self.assertTrue(
            payload.get("accept_token")
        )

        return payload

    def create_invite_link(
        self,
        room_id,
        owner_token,
        *,
        role="member",
        max_uses=None,
    ):
        response = self.client.post(
            (
                "/api/room-invitations/"
                f"rooms/{room_id}/links"
            ),
            headers=self.auth_headers(
                owner_token
            ),
            json={
                "role": role,
                "expires_in_days": 7,
                "max_uses": max_uses,
            },
        )

        self.assertEqual(
            response.status_code,
            200,
            response.text,
        )

        payload = response.json()

        self.assertTrue(
            payload.get("share_token")
        )

        return payload

    def join_link(
        self,
        share_token,
        user_token,
    ):
        return self.client.post(
            (
                "/api/room-invitations/"
                f"links/{share_token}/join"
            ),
            headers=self.auth_headers(
                user_token
            ),
        )

    def test_email_invitation_acceptance_and_guards(
        self,
    ):
        owner_email, owner_token = (
            self.create_user_and_login(
                "email-owner",
                "Email Invitation Owner",
            )
        )

        invitee_email, invitee_token = (
            self.create_user_and_login(
                "email-invitee",
                "Email Invitation Invitee",
            )
        )

        _, wrong_user_token = (
            self.create_user_and_login(
                "email-wrong-user",
                "Wrong Invitation User",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        created = self.create_email_invitation(
            room_id,
            owner_token,
            invitee_email,
        )

        invitation = created["invitation"]
        invitation_id = invitation["id"]
        accept_token = created["accept_token"]

        self.assertEqual(
            invitation["status"],
            "pending",
        )

        self.assertEqual(
            invitation["role"],
            "member",
        )

        duplicate = self.client.post(
            (
                "/api/room-invitations/"
                f"rooms/{room_id}/email"
            ),
            headers=self.auth_headers(
                owner_token
            ),
            json={
                "email": invitee_email,
                "role": "member",
                "expires_in_days": 7,
            },
        )

        self.assertEqual(
            duplicate.status_code,
            409,
            duplicate.text,
        )

        wrong_accept = self.client.post(
            (
                "/api/room-invitations/"
                f"email/{accept_token}/accept"
            ),
            headers=self.auth_headers(
                wrong_user_token
            ),
        )

        self.assertEqual(
            wrong_accept.status_code,
            403,
            wrong_accept.text,
        )

        accepted = self.client.post(
            (
                "/api/room-invitations/"
                f"email/{accept_token}/accept"
            ),
            headers=self.auth_headers(
                invitee_token
            ),
        )

        self.assertEqual(
            accepted.status_code,
            200,
            accepted.text,
        )

        accepted_payload = accepted.json()

        self.assertEqual(
            accepted_payload["room"]["id"],
            room_id,
        )

        self.assertEqual(
            accepted_payload[
                "membership"
            ]["role"],
            "member",
        )

        self.assertEqual(
            accepted_payload[
                "membership"
            ]["status"],
            "active",
        )

        replay = self.client.post(
            (
                "/api/room-invitations/"
                f"email/{accept_token}/accept"
            ),
            headers=self.auth_headers(
                invitee_token
            ),
        )

        self.assertEqual(
            replay.status_code,
            409,
            replay.text,
        )

        rooms = self.client.get(
            "/api/study-rooms",
            headers=self.auth_headers(
                invitee_token
            ),
        )

        self.assertEqual(
            rooms.status_code,
            200,
            rooms.text,
        )

        joined_room = next(
            (
                room
                for room in rooms.json()
                if room["id"] == room_id
            ),
            None,
        )

        self.assertIsNotNone(
            joined_room
        )

        self.assertEqual(
            joined_room["role"],
            "member",
        )

        listing = self.client.get(
            (
                "/api/room-invitations/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(
                owner_token
            ),
        )

        self.assertEqual(
            listing.status_code,
            200,
            listing.text,
        )

        stored = next(
            item
            for item in listing.json()[
                "email_invitations"
            ]
            if item["id"] == invitation_id
        )

        self.assertEqual(
            stored["status"],
            "accepted",
        )

        forbidden_token_fields = {
            "token",
            "token_hash",
            "accept_token",
            "raw_token",
        }

        self.assertFalse(
            forbidden_token_fields
            & set(stored.keys())
        )

        existing_member_invite = (
            self.client.post(
                (
                    "/api/room-invitations/"
                    f"rooms/{room_id}/email"
                ),
                headers=self.auth_headers(
                    owner_token
                ),
                json={
                    "email": invitee_email,
                    "role": "member",
                    "expires_in_days": 7,
                },
            )
        )

        self.assertEqual(
            existing_member_invite.status_code,
            409,
            existing_member_invite.text,
        )

        self.assertNotEqual(
            owner_email,
            invitee_email,
        )

    def test_decline_and_revoke_lifecycle(
        self,
    ):
        _, owner_token = (
            self.create_user_and_login(
                "lifecycle-owner",
                "Lifecycle Owner",
            )
        )

        declinee_email, declinee_token = (
            self.create_user_and_login(
                "lifecycle-declinee",
                "Lifecycle Declinee",
            )
        )

        revokee_email, revokee_token = (
            self.create_user_and_login(
                "lifecycle-revokee",
                "Lifecycle Revokee",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        decline_created = (
            self.create_email_invitation(
                room_id,
                owner_token,
                declinee_email,
            )
        )

        decline_token = (
            decline_created["accept_token"]
        )

        declined = self.client.post(
            (
                "/api/room-invitations/"
                f"email/{decline_token}/decline"
            ),
            headers=self.auth_headers(
                declinee_token
            ),
        )

        self.assertEqual(
            declined.status_code,
            200,
            declined.text,
        )

        self.assertEqual(
            declined.json()[
                "invitation"
            ]["status"],
            "declined",
        )

        accept_declined = self.client.post(
            (
                "/api/room-invitations/"
                f"email/{decline_token}/accept"
            ),
            headers=self.auth_headers(
                declinee_token
            ),
        )

        self.assertEqual(
            accept_declined.status_code,
            409,
            accept_declined.text,
        )

        revoke_created = (
            self.create_email_invitation(
                room_id,
                owner_token,
                revokee_email,
            )
        )

        revoke_invitation = (
            revoke_created["invitation"]
        )
        revoke_token = (
            revoke_created["accept_token"]
        )

        revoked = self.client.delete(
            (
                "/api/room-invitations/"
                f"rooms/{room_id}/email/"
                f"{revoke_invitation['id']}"
            ),
            headers=self.auth_headers(
                owner_token
            ),
        )

        self.assertEqual(
            revoked.status_code,
            200,
            revoked.text,
        )

        self.assertEqual(
            revoked.json()[
                "invitation"
            ]["status"],
            "revoked",
        )

        accept_revoked = self.client.post(
            (
                "/api/room-invitations/"
                f"email/{revoke_token}/accept"
            ),
            headers=self.auth_headers(
                revokee_token
            ),
        )

        self.assertEqual(
            accept_revoked.status_code,
            410,
            accept_revoked.text,
        )

        revoke_twice = self.client.delete(
            (
                "/api/room-invitations/"
                f"rooms/{room_id}/email/"
                f"{revoke_invitation['id']}"
            ),
            headers=self.auth_headers(
                owner_token
            ),
        )

        self.assertEqual(
            revoke_twice.status_code,
            409,
            revoke_twice.text,
        )

    def test_share_link_limits_and_revocation(
        self,
    ):
        _, owner_token = (
            self.create_user_and_login(
                "link-owner",
                "Link Owner",
            )
        )

        _, first_token = (
            self.create_user_and_login(
                "link-first",
                "First Link Member",
            )
        )

        _, second_token = (
            self.create_user_and_login(
                "link-second",
                "Second Link Member",
            )
        )

        _, third_token = (
            self.create_user_and_login(
                "link-third",
                "Third Link Member",
            )
        )

        room_id = self.create_room(
            owner_token
        )

        single_use = self.create_invite_link(
            room_id,
            owner_token,
            max_uses=1,
        )

        single_token = (
            single_use["share_token"]
        )

        first_join = self.join_link(
            single_token,
            first_token,
        )

        self.assertEqual(
            first_join.status_code,
            200,
            first_join.text,
        )

        self.assertFalse(
            first_join.json()[
                "already_member"
            ]
        )

        self.assertEqual(
            first_join.json()[
                "link_status"
            ],
            "exhausted",
        )

        blocked_second = self.join_link(
            single_token,
            second_token,
        )

        self.assertEqual(
            blocked_second.status_code,
            410,
            blocked_second.text,
        )

        reusable = self.create_invite_link(
            room_id,
            owner_token,
            max_uses=3,
        )

        reusable_token = (
            reusable["share_token"]
        )
        reusable_id = (
            reusable["link"]["id"]
        )

        second_join = self.join_link(
            reusable_token,
            second_token,
        )

        self.assertEqual(
            second_join.status_code,
            200,
            second_join.text,
        )

        self.assertFalse(
            second_join.json()[
                "already_member"
            ]
        )

        second_retry = self.join_link(
            reusable_token,
            second_token,
        )

        self.assertEqual(
            second_retry.status_code,
            200,
            second_retry.text,
        )

        self.assertTrue(
            second_retry.json()[
                "already_member"
            ]
        )

        listing = self.client.get(
            (
                "/api/room-invitations/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(
                owner_token
            ),
        )

        self.assertEqual(
            listing.status_code,
            200,
            listing.text,
        )

        stored_reusable = next(
            link
            for link in listing.json()[
                "share_links"
            ]
            if link["id"] == reusable_id
        )

        self.assertEqual(
            stored_reusable["use_count"],
            1,
        )

        self.assertEqual(
            stored_reusable["status"],
            "active",
        )

        revoked = self.client.delete(
            (
                "/api/room-invitations/"
                f"rooms/{room_id}/links/"
                f"{reusable_id}"
            ),
            headers=self.auth_headers(
                owner_token
            ),
        )

        self.assertEqual(
            revoked.status_code,
            200,
            revoked.text,
        )

        self.assertEqual(
            revoked.json()["link"]["status"],
            "revoked",
        )

        blocked_third = self.join_link(
            reusable_token,
            third_token,
        )

        self.assertEqual(
            blocked_third.status_code,
            410,
            blocked_third.text,
        )

    def test_management_permissions_and_roles(
        self,
    ):
        _, owner_token = (
            self.create_user_and_login(
                "permission-owner",
                "Permission Owner",
            )
        )

        member_email, member_token = (
            self.create_user_and_login(
                "permission-member",
                "Permission Member",
            )
        )

        target_email = self.email(
            "permission-target"
        )

        self.signup(
            target_email,
            "Permission Target",
        )

        room_id = self.create_room(
            owner_token
        )

        member_link = self.create_invite_link(
            room_id,
            owner_token,
            max_uses=1,
        )

        joined = self.join_link(
            member_link["share_token"],
            member_token,
        )

        self.assertEqual(
            joined.status_code,
            200,
            joined.text,
        )

        self.assertEqual(
            joined.json()[
                "membership"
            ]["role"],
            "member",
        )

        managed_invitation = (
            self.create_email_invitation(
                room_id,
                owner_token,
                target_email,
                role="viewer",
            )
        )

        managed_link = self.create_invite_link(
            room_id,
            owner_token,
            role="ai_tutor",
            max_uses=5,
        )

        blocked_requests = [
            self.client.get(
                (
                    "/api/room-invitations/"
                    f"rooms/{room_id}"
                ),
                headers=self.auth_headers(
                    member_token
                ),
            ),
            self.client.post(
                (
                    "/api/room-invitations/"
                    f"rooms/{room_id}/email"
                ),
                headers=self.auth_headers(
                    member_token
                ),
                json={
                    "email": self.email(
                        "blocked-email"
                    ),
                    "role": "member",
                    "expires_in_days": 7,
                },
            ),
            self.client.post(
                (
                    "/api/room-invitations/"
                    f"rooms/{room_id}/links"
                ),
                headers=self.auth_headers(
                    member_token
                ),
                json={
                    "role": "member",
                    "expires_in_days": 7,
                    "max_uses": 2,
                },
            ),
            self.client.delete(
                (
                    "/api/room-invitations/"
                    f"rooms/{room_id}/email/"
                    f"{managed_invitation['invitation']['id']}"
                ),
                headers=self.auth_headers(
                    member_token
                ),
            ),
            self.client.delete(
                (
                    "/api/room-invitations/"
                    f"rooms/{room_id}/links/"
                    f"{managed_link['link']['id']}"
                ),
                headers=self.auth_headers(
                    member_token
                ),
            ),
        ]

        for response in blocked_requests:
            self.assertEqual(
                response.status_code,
                403,
                response.text,
            )

        invalid_email_role = (
            self.client.post(
                (
                    "/api/room-invitations/"
                    f"rooms/{room_id}/email"
                ),
                headers=self.auth_headers(
                    owner_token
                ),
                json={
                    "email": self.email(
                        "invalid-owner"
                    ),
                    "role": "owner",
                    "expires_in_days": 7,
                },
            )
        )

        self.assertEqual(
            invalid_email_role.status_code,
            400,
            invalid_email_role.text,
        )

        invalid_link_role = (
            self.client.post(
                (
                    "/api/room-invitations/"
                    f"rooms/{room_id}/links"
                ),
                headers=self.auth_headers(
                    owner_token
                ),
                json={
                    "role": "admin",
                    "expires_in_days": 7,
                    "max_uses": 2,
                },
            )
        )

        self.assertEqual(
            invalid_link_role.status_code,
            400,
            invalid_link_role.text,
        )

        viewer_link = self.create_invite_link(
            room_id,
            owner_token,
            role="  VIEWER  ",
            max_uses=2,
        )

        self.assertEqual(
            viewer_link["link"]["role"],
            "viewer",
        )

        tutor_link = self.create_invite_link(
            room_id,
            owner_token,
            role="AI_TUTOR",
            max_uses=2,
        )

        self.assertEqual(
            tutor_link["link"]["role"],
            "ai_tutor",
        )

        owner_listing = self.client.get(
            (
                "/api/room-invitations/"
                f"rooms/{room_id}"
            ),
            headers=self.auth_headers(
                owner_token
            ),
        )

        self.assertEqual(
            owner_listing.status_code,
            200,
            owner_listing.text,
        )

        self.assertTrue(member_email)


if __name__ == "__main__":
    unittest.main(verbosity=2)
