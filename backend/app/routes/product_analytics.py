from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.product_analytics import (
    record_product_event,
)
from app.utils.deps import get_current_user


router = APIRouter(
    tags=["Product Analytics"],
)


class ProductEventRequest(BaseModel):
    event_name: str
    category: str
    source: str = "web"
    surface: str | None = None
    room_id: int | None = None
    entity_type: str | None = None
    entity_id: int | None = None
    quantity: int = Field(
        default=1,
        ge=1,
        le=1000,
    )
    bytes_count: int = Field(
        default=0,
        ge=0,
        le=10 * 1024 * 1024 * 1024,
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict
    )


@router.post(
    "/events",
    status_code=201,
)
def create_product_event(
    payload: ProductEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        get_current_user
    ),
):
    try:
        event = record_product_event(
            db=db,
            user_id=current_user.id,
            event_name=payload.event_name,
            category=payload.category,
            source=payload.source,
            surface=payload.surface,
            room_id=payload.room_id,
            entity_type=(
                payload.entity_type
            ),
            entity_id=payload.entity_id,
            quantity=payload.quantity,
            bytes_count=(
                payload.bytes_count
            ),
            metadata=payload.metadata,
        )
        db.commit()
        db.refresh(event)
    except ValueError as error:
        db.rollback()

        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error
    except Exception:
        db.rollback()
        raise

    return {
        "recorded": True,
        "id": event.id,
        "event_name": event.event_name,
    }
