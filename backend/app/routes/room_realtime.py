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
    build_room_realtime_event,
    consume_room_realtime_ticket,
    create_room_realtime_ticket,
    room_realtime_manager,
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

    await room_realtime_manager.connect(
        room_id=room.id,
        websocket=websocket,
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

    try:
        while True:
            incoming = (
                await websocket.receive_json()
            )

            if (
                incoming.get("event")
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

    except WebSocketDisconnect:
        room_realtime_manager.disconnect(
            room_id=room.id,
            websocket=websocket,
        )

    except Exception:
        room_realtime_manager.disconnect(
            room_id=room.id,
            websocket=websocket,
        )

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
