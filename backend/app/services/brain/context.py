from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.services.brain.learning_profile import LearningProfile


@dataclass
class BrainContext:
    daypart: str
    available_minutes: int
    device: str
    study_streak: int
    recent_activity_count: int
    motivation_level: str
    exam_days_remaining: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def get_daypart(now: datetime | None = None) -> str:
    current = now or datetime.now()
    hour = current.hour

    if hour < 12:
        return "morning"
    if hour < 18:
        return "afternoon"
    return "evening"


def build_brain_context(
    profile: LearningProfile | None = None,
    available_minutes: int = 20,
    device: str = "desktop",
    exam_days_remaining: int | None = None,
) -> BrainContext:
    if profile is not None:
        study_streak = profile.study_streak
        recent_activity_count = profile.recent_activity_count
        motivation_level = profile.motivation_level
    else:
        study_streak = 0
        recent_activity_count = 0
        motivation_level = "medium"

    return BrainContext(
        daypart=get_daypart(),
        available_minutes=available_minutes,
        device=device,
        study_streak=study_streak,
        recent_activity_count=recent_activity_count,
        motivation_level=motivation_level,
        exam_days_remaining=exam_days_remaining,
    )


def brain_context_to_dict(context: BrainContext) -> dict[str, Any]:
    return {
        "daypart": context.daypart,
        "available_minutes": context.available_minutes,
        "device": context.device,
        "study_streak": context.study_streak,
        "recent_activity_count": context.recent_activity_count,
        "motivation_level": context.motivation_level,
        "exam_days_remaining": context.exam_days_remaining,
        "metadata": context.metadata,
    }
