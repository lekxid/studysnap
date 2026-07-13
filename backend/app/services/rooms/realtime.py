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
# This is appropriate for the current single-process development setup.
# A shared store such as Redis will replace it before multi-worker deployment.
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
            set[WebSocket],
        ] = {}

    async def connect(
        self,
        *,
        room_id: int,
        websocket: WebSocket,
    ) -> None:
        await websocket.accept()

        self._connections.setdefault(
            room_id,
            set(),
        ).add(websocket)

    def disconnect(
        self,
        *,
        room_id: int,
        websocket: WebSocket,
    ) -> None:
        room_connections = (
            self._connections.get(room_id)
        )

        if room_connections is None:
            return

        room_connections.discard(
            websocket
        )

        if not room_connections:
            self._connections.pop(
                room_id,
                None,
            )

    async def broadcast(
        self,
        *,
        room_id: int,
        payload: dict[str, Any],
    ) -> None:
        room_connections = list(
            self._connections.get(
                room_id,
                set(),
            )
        )

        disconnected: list[WebSocket] = []

        for websocket in room_connections:
            try:
                await websocket.send_json(
                    payload
                )
            except Exception:
                disconnected.append(
                    websocket
                )

        for websocket in disconnected:
            self.disconnect(
                room_id=room_id,
                websocket=websocket,
            )

    def connection_count(
        self,
        room_id: int,
    ) -> int:
        return len(
            self._connections.get(
                room_id,
                set(),
            )
        )

    def reset_for_tests(self) -> None:
        self._connections.clear()


room_realtime_manager = (
    RoomRealtimeManager()
)


async def broadcast_room_realtime_event(
    *,
    event: str,
    room_id: int,
    actor_user_id: int | None,
    data: dict[str, Any] | None = None,
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
    )

    return payload


def reset_room_realtime_state_for_tests() -> None:
    _used_ticket_ids.clear()
    room_realtime_manager.reset_for_tests()
