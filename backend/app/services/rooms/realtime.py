from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import WebSocket
from jose import JWTError, jwt

from app.config import settings


ROOM_REALTIME_TICKET_SECONDS = 60


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def build_room_realtime_event(
    *,
    event: str,
    room_id: int,
    actor_user_id: int | None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "event": event,
        "room_id": room_id,
        "event_id": uuid4().hex,
        "occurred_at": utc_now().isoformat(),
        "actor_user_id": actor_user_id,
        "data": data or {},
    }


# Single-use ticket tracking for the current backend process.
# Redis can replace this when StudySnap runs multiple workers.
_used_ticket_ids: dict[str, datetime] = {}


def _remove_expired_ticket_ids() -> None:
    now = utc_now()

    expired_ids = [
        ticket_id
        for ticket_id, expires_at
        in _used_ticket_ids.items()
        if expires_at <= now
    ]

    for ticket_id in expired_ids:
        _used_ticket_ids.pop(
            ticket_id,
            None,
        )


def create_room_realtime_ticket(
    *,
    room_id: int,
    user_id: int,
) -> tuple[str, datetime]:
    expires_at = utc_now() + timedelta(
        seconds=ROOM_REALTIME_TICKET_SECONDS
    )

    payload = {
        "ticket_type": "room_realtime",
        "room_id": room_id,
        "user_id": user_id,
        "jti": uuid4().hex,
        "iat": int(utc_now().timestamp()),
        "exp": int(expires_at.timestamp()),
    }

    ticket = jwt.encode(
        payload,
        settings.secret_key,
        algorithm=settings.algorithm,
    )

    return ticket, expires_at


def consume_room_realtime_ticket(
    *,
    ticket: str,
    expected_room_id: int,
) -> dict[str, int]:
    _remove_expired_ticket_ids()

    try:
        payload = jwt.decode(
            ticket,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )

        if (
            payload.get("ticket_type")
            != "room_realtime"
        ):
            raise ValueError(
                "Invalid real-time ticket type."
            )

        room_id = int(
            payload.get("room_id")
        )

        user_id = int(
            payload.get("user_id")
        )

        ticket_id = str(
            payload.get("jti") or ""
        )

        expires_timestamp = int(
            payload.get("exp")
        )

        if room_id != expected_room_id:
            raise ValueError(
                "Real-time ticket room mismatch."
            )

        if not ticket_id:
            raise ValueError(
                "Real-time ticket ID is missing."
            )

        if ticket_id in _used_ticket_ids:
            raise ValueError(
                "Real-time ticket was already used."
            )

        expires_at = datetime.fromtimestamp(
            expires_timestamp,
            tz=timezone.utc,
        )

        if expires_at <= utc_now():
            raise ValueError(
                "Real-time ticket expired."
            )

        _used_ticket_ids[
            ticket_id
        ] = expires_at

        return {
            "room_id": room_id,
            "user_id": user_id,
        }

    except (
        JWTError,
        TypeError,
        ValueError,
    ) as error:
        raise ValueError(
            "Invalid or expired real-time ticket."
        ) from error


class RoomRealtimeManager:
    def __init__(self) -> None:
        self._connections: dict[
            int,
            dict[
                int,
                set[WebSocket],
            ],
        ] = {}

        self._typing_connections: dict[
            int,
            dict[
                int,
                set[WebSocket],
            ],
        ] = {}

    async def connect(
        self,
        *,
        room_id: int,
        user_id: int,
        websocket: WebSocket,
    ) -> bool:
        await websocket.accept()

        room_users = (
            self._connections.setdefault(
                room_id,
                {},
            )
        )

        user_connections = (
            room_users.setdefault(
                user_id,
                set(),
            )
        )

        was_offline = (
            len(user_connections) == 0
        )

        user_connections.add(
            websocket
        )

        return was_offline

    def disconnect(
        self,
        *,
        room_id: int,
        user_id: int,
        websocket: WebSocket,
    ) -> tuple[bool, bool]:
        typing_stopped = (
            self.set_typing(
                room_id=room_id,
                user_id=user_id,
                websocket=websocket,
                is_typing=False,
            )
        )

        room_users = (
            self._connections.get(
                room_id
            )
        )

        if room_users is None:
            return False, typing_stopped

        user_connections = (
            room_users.get(user_id)
        )

        if user_connections is None:
            return False, typing_stopped

        user_connections.discard(
            websocket
        )

        became_offline = (
            len(user_connections) == 0
        )

        if became_offline:
            room_users.pop(
                user_id,
                None,
            )

        if not room_users:
            self._connections.pop(
                room_id,
                None,
            )

        return (
            became_offline,
            typing_stopped,
        )

    def set_typing(
        self,
        *,
        room_id: int,
        user_id: int,
        websocket: WebSocket,
        is_typing: bool,
    ) -> bool:
        room_typing = (
            self._typing_connections
            .setdefault(
                room_id,
                {},
            )
        )

        user_typing_connections = (
            room_typing.setdefault(
                user_id,
                set(),
            )
        )

        was_typing = bool(
            user_typing_connections
        )

        if is_typing:
            user_typing_connections.add(
                websocket
            )
        else:
            user_typing_connections.discard(
                websocket
            )

        is_now_typing = bool(
            user_typing_connections
        )

        if not is_now_typing:
            room_typing.pop(
                user_id,
                None,
            )

        if not room_typing:
            self._typing_connections.pop(
                room_id,
                None,
            )

        return (
            was_typing
            != is_now_typing
        )

    async def broadcast(
        self,
        *,
        room_id: int,
        payload: dict[str, Any],
        exclude_websocket: WebSocket | None = None,
    ) -> None:
        room_users = (
            self._connections.get(
                room_id,
                {},
            )
        )

        room_connections = [
            websocket
            for connections
            in room_users.values()
            for websocket
            in connections
            if websocket
            is not exclude_websocket
        ]

        disconnected: list[
            tuple[int, WebSocket]
        ] = []

        for websocket in room_connections:
            try:
                await websocket.send_json(
                    payload
                )
            except Exception:
                for (
                    connected_user_id,
                    connections,
                ) in room_users.items():
                    if websocket in connections:
                        disconnected.append(
                            (
                                connected_user_id,
                                websocket,
                            )
                        )
                        break

        for (
            connected_user_id,
            websocket,
        ) in disconnected:
            self.disconnect(
                room_id=room_id,
                user_id=connected_user_id,
                websocket=websocket,
            )

    def online_user_ids(
        self,
        room_id: int,
    ) -> list[int]:
        return sorted(
            self._connections.get(
                room_id,
                {},
            ).keys()
        )

    def online_user_count(
        self,
        room_id: int,
    ) -> int:
        return len(
            self.online_user_ids(
                room_id
            )
        )

    def connection_count(
        self,
        room_id: int,
    ) -> int:
        return sum(
            len(connections)
            for connections
            in self._connections.get(
                room_id,
                {},
            ).values()
        )

    def user_connection_count(
        self,
        room_id: int,
        user_id: int,
    ) -> int:
        return len(
            self._connections.get(
                room_id,
                {},
            ).get(
                user_id,
                set(),
            )
        )

    def reset_for_tests(self) -> None:
        self._connections.clear()
        self._typing_connections.clear()


room_realtime_manager = (
    RoomRealtimeManager()
)


async def broadcast_room_realtime_event(
    *,
    event: str,
    room_id: int,
    actor_user_id: int | None,
    data: dict[str, Any] | None = None,
    exclude_websocket: WebSocket | None = None,
) -> dict[str, Any]:
    payload = build_room_realtime_event(
        event=event,
        room_id=room_id,
        actor_user_id=actor_user_id,
        data=data,
    )

    await room_realtime_manager.broadcast(
        room_id=room_id,
        payload=payload,
        exclude_websocket=(
            exclude_websocket
        ),
    )

    return payload


def reset_room_realtime_state_for_tests() -> None:
    _used_ticket_ids.clear()
    room_realtime_manager.reset_for_tests()
