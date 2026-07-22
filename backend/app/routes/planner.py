from datetime import datetime
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import case
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.study_plan import StudyPlan
from app.models.user import User
from app.services.rooms.access import get_room_for_user
from app.utils.deps import get_current_user


router = APIRouter(tags=["Planner"])


PlannerPriority = Literal[
    "Low",
    "Medium",
    "High",
]

PlannerStatus = Literal[
    "Planned",
    "Done",
]


class PlannerCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=250,
    )
    subject: str = Field(
        min_length=1,
        max_length=160,
    )
    description: str | None = Field(
        default=None,
        max_length=2000,
    )
    scheduled_for: datetime
    duration_minutes: int = Field(
        default=25,
        ge=1,
        le=1440,
    )
    priority: PlannerPriority = "Medium"
    study_room_id: int | None = None


class PlannerUpdate(BaseModel):
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=250,
    )
    subject: str | None = Field(
        default=None,
        min_length=1,
        max_length=160,
    )
    description: str | None = Field(
        default=None,
        max_length=2000,
    )
    scheduled_for: datetime | None = None
    duration_minutes: int | None = Field(
        default=None,
        ge=1,
        le=1440,
    )
    priority: PlannerPriority | None = None
    status: PlannerStatus | None = None
    study_room_id: int | None = None


def clean_required_text(
    value: str,
    field_name: str,
) -> str:
    cleaned = value.strip()

    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} cannot be empty",
        )

    return cleaned


def serialize_plan(plan: StudyPlan) -> dict:
    return {
        "id": plan.id,
        "user_id": plan.user_id,
        "study_room_id": plan.study_room_id,
        "title": plan.title,
        "subject": plan.subject,
        "description": plan.description,
        "scheduled_for": plan.scheduled_for,
        "duration_minutes": plan.duration_minutes,
        "priority": plan.priority,
        "status": plan.status,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }


def get_owned_plan_or_404(
    db: Session,
    plan_id: int,
    user_id: int,
) -> StudyPlan:
    plan = (
        db.query(StudyPlan)
        .filter(
            StudyPlan.id == plan_id,
            StudyPlan.user_id == user_id,
        )
        .first()
    )

    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study plan not found",
        )

    return plan


def validate_room_access(
    db: Session,
    room_id: int | None,
    user_id: int,
) -> None:
    if room_id is None:
        return

    get_room_for_user(
        db=db,
        room_id=room_id,
        user_id=user_id,
    )


@router.get("")
def get_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plans = (
        db.query(StudyPlan)
        .filter(
            StudyPlan.user_id == current_user.id,
        )
        .order_by(
            case(
                (
                    StudyPlan.status == "Done",
                    1,
                ),
                else_=0,
            ).asc(),
            StudyPlan.scheduled_for.asc(),
            StudyPlan.id.desc(),
        )
        .all()
    )

    return [
        serialize_plan(plan)
        for plan in plans
    ]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
)
def create_plan(
    data: PlannerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    validate_room_access(
        db=db,
        room_id=data.study_room_id,
        user_id=current_user.id,
    )

    plan = StudyPlan(
        user_id=current_user.id,
        study_room_id=data.study_room_id,
        title=clean_required_text(
            data.title,
            "Title",
        ),
        subject=clean_required_text(
            data.subject,
            "Subject",
        ),
        description=(
            data.description.strip()
            if data.description
            else None
        ),
        scheduled_for=data.scheduled_for,
        duration_minutes=data.duration_minutes,
        priority=data.priority,
        status="Planned",
    )

    db.add(plan)
    db.commit()
    db.refresh(plan)

    return serialize_plan(plan)


@router.patch("/{plan_id}")
def update_plan(
    plan_id: int,
    data: PlannerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = get_owned_plan_or_404(
        db=db,
        plan_id=plan_id,
        user_id=current_user.id,
    )

    changes = data.model_dump(
        exclude_unset=True,
    )

    if "study_room_id" in changes:
        validate_room_access(
            db=db,
            room_id=changes["study_room_id"],
            user_id=current_user.id,
        )

    if "title" in changes:
        changes["title"] = clean_required_text(
            changes["title"],
            "Title",
        )

    if "subject" in changes:
        changes["subject"] = clean_required_text(
            changes["subject"],
            "Subject",
        )

    if (
        "description" in changes
        and changes["description"] is not None
    ):
        changes["description"] = (
            changes["description"].strip()
            or None
        )

    for field_name, value in changes.items():
        setattr(
            plan,
            field_name,
            value,
        )

    plan.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(plan)

    return serialize_plan(plan)


@router.delete("/{plan_id}")
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = get_owned_plan_or_404(
        db=db,
        plan_id=plan_id,
        user_id=current_user.id,
    )

    db.delete(plan)
    db.commit()

    return {
        "message": "Study plan deleted",
        "id": plan_id,
    }
