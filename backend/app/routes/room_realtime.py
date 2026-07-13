from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.rooms.access import (
    require_room_view,
)
from app.services.rooms.realtime import (
    ROOM_REALTIME_TICKET_SECONDS,
    broadcast_room_realtime_event,
    build_room_realtime_event,
    consume_room_realtime_ticket,
    create_room_realtime_ticket,
    room_realtime_manager,
    utc_now,
)
from app.utils.deps import get_current_user


router = APIRouter(
    tags=["Room Realtime"]
)


@router.post(
    "/rooms/{room_id}/ticket"
)
def create_realtime_ticket(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    _room, role = require_room_view(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )

    ticket, expires_at = (
        create_room_realtime_ticket(
            room_id=room_id,
            user_id=current_user.id,
        )
    )

    return {
        "ticket": ticket,
        "expires_in_seconds": (
            ROOM_REALTIME_TICKET_SECONDS
        ),
        "expires_at": (
            expires_at.isoformat()
        ),
        "websocket_path": (
            "/api/room-realtime/"
            f"rooms/{room_id}"
        ),
        "room_id": room_id,
        "user_id": current_user.id,
        "role": role,
    }


async def reject_websocket(
    websocket: WebSocket,
    *,
    code: int,
    reason: str,
) -> None:
    await websocket.accept()

    await websocket.close(
        code=code,
        reason=reason,
    )


@router.websocket(
    "/rooms/{room_id}"
)
async def room_realtime_socket(
    websocket: WebSocket,
    room_id: int,
    ticket: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        ticket_claims = (
            consume_room_realtime_ticket(
                ticket=ticket,
                expected_room_id=room_id,
            )
        )
    except ValueError:
        await reject_websocket(
            websocket,
            code=4401,
            reason=(
                "Invalid or expired "
                "real-time ticket."
            ),
        )
        return

    user_id = ticket_claims["user_id"]

    try:
        room, role = require_room_view(
            db=db,
            room_id=room_id,
            user_id=user_id,
        )
    except HTTPException as error:
        await reject_websocket(
            websocket,
            code=(
                4404
                if error.status_code == 404
                else 4403
            ),
            reason=str(error.detail),
        )
        return

    current_user = (
        db.query(User)
        .filter(
            User.id == user_id
        )
        .first()
    )

    if current_user is None:
        await reject_websocket(
            websocket,
            code=4401,
            reason="User account not found.",
        )
        return

    display_name = (
        current_user.full_name
        or "Study Room member"
    )

    first_connection = (
        await room_realtime_manager.connect(
            room_id=room.id,
            user_id=user_id,
            websocket=websocket,
        )
    )

    await websocket.send_json(
        build_room_realtime_event(
            event="connection.ready",
            room_id=room.id,
            actor_user_id=user_id,
            data={
                "user_id": user_id,
                "role": role,
                "connection_count": (
                    room_realtime_manager
                    .connection_count(
                        room.id
                    )
                ),
            },
        )
    )

    await websocket.send_json(
        build_room_realtime_event(
            event="presence.snapshot",
            room_id=room.id,
            actor_user_id=None,
            data={
                "online_user_ids": (
                    room_realtime_manager
                    .online_user_ids(
                        room.id
                    )
                ),
                "online_count": (
                    room_realtime_manager
                    .online_user_count(
                        room.id
                    )
                ),
            },
        )
    )

    if first_connection:
        await broadcast_room_realtime_event(
            event="presence.joined",
            room_id=room.id,
            actor_user_id=user_id,
            data={
                "user_id": user_id,
                "full_name": display_name,
                "online_count": (
                    room_realtime_manager
                    .online_user_count(
                        room.id
                    )
                ),
            },
        )

    unexpected_error = False

    try:
        while True:
            incoming = (
                await websocket.receive_json()
            )

            if not isinstance(
                incoming,
                dict,
            ):
                continue

            event_name = incoming.get(
                "event"
            )

            if (
                event_name
                == "connection.ping"
            ):
                await websocket.send_json(
                    build_room_realtime_event(
                        event=(
                            "connection.pong"
                        ),
                        room_id=room.id,
                        actor_user_id=(
                            user_id
                        ),
                        data={},
                    )
                )
                continue

            if event_name not in {
                "typing.started",
                "typing.stopped",
            }:
                continue

            is_typing = (
                event_name
                == "typing.started"
            )

            changed = (
                room_realtime_manager
                .set_typing(
                    room_id=room.id,
                    user_id=user_id,
                    websocket=websocket,
                    is_typing=is_typing,
                )
            )

            if not changed:
                continue

            await broadcast_room_realtime_event(
                event=event_name,
                room_id=room.id,
                actor_user_id=user_id,
                data={
                    "user_id": user_id,
                    "full_name": (
                        display_name
                    ),
                },
                exclude_websocket=(
                    websocket
                ),
            )

    except WebSocketDisconnect:
        pass

    except Exception:
        unexpected_error = True

    finally:
        (
            became_offline,
            typing_stopped,
        ) = room_realtime_manager.disconnect(
            room_id=room.id,
            user_id=user_id,
            websocket=websocket,
        )

        if typing_stopped:
            await broadcast_room_realtime_event(
                event="typing.stopped",
                room_id=room.id,
                actor_user_id=user_id,
                data={
                    "user_id": user_id,
                    "full_name": (
                        display_name
                    ),
                },
            )

        if became_offline:
            last_active_at = (
                utc_now().isoformat()
            )

            await broadcast_room_realtime_event(
                event="presence.left",
                room_id=room.id,
                actor_user_id=user_id,
                data={
                    "user_id": user_id,
                    "full_name": (
                        display_name
                    ),
                    "last_active_at": (
                        last_active_at
                    ),
                    "online_count": (
                        room_realtime_manager
                        .online_user_count(
                            room.id
                        )
                    ),
                },
            )

        if unexpected_error:
            try:
                await websocket.close(
                    code=1011,
                    reason=(
                        "Room real-time "
                        "connection failed."
                    ),
                )
            except Exception:
                pass
