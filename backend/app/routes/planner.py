from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.study_plan import StudyPlan
from backend.app.models.user import User
from backend.app.utils.deps import get_current_user

router = APIRouter(prefix="/planner", tags=["Planner"])


@router.post("/")
def create_plan(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    plan = StudyPlan(
        user_id=current_user.id,
        title=data["title"],
        description=data.get("description"),
        scheduled_for=data["scheduled_for"]
    )

    db.add(plan)
    db.commit()

    return {"message": "Plan created"}


@router.get("/")
def get_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    plans = db.query(StudyPlan).filter(
        StudyPlan.user_id == current_user.id
    ).all()

    return plans
