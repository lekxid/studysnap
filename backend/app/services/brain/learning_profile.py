from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.brain.intelligence import BrainInsights


@dataclass
class LearningProfile:
    user_id: int
    study_room_id: int | None
    study_streak: int = 0
    recent_activity_count: int = 0
    motivation_level: str = "medium"
    strongest_concepts: list[dict[str, Any]] = field(default_factory=list)
    weakest_concepts: list[dict[str, Any]] = field(default_factory=list)
    developing_concepts: list[dict[str, Any]] = field(default_factory=list)
    preferred_learning_mode: str = "mixed"
    metadata: dict[str, Any] = field(default_factory=dict)


def build_learning_profile(insights: BrainInsights) -> LearningProfile:
    recent_activity = (
        insights.concept_count
        + insights.needs_review_count
        + insights.mastered_count
        + insights.developing_count
        + insights.weak_count
    )

    study_streak = 0
    if recent_activity >= 25:
        study_streak = 5
    elif recent_activity >= 10:
        study_streak = 3
    elif recent_activity > 0:
        study_streak = 1

    motivation = "medium"

    if study_streak >= 5 and insights.needs_review_count <= 3:
        motivation = "high"
    elif recent_activity == 0 or insights.weak_count > insights.mastered_count:
        motivation = "low"

    return LearningProfile(
        user_id=insights.user_id,
        study_room_id=insights.study_room_id,
        study_streak=study_streak,
        recent_activity_count=recent_activity,
        motivation_level=motivation,
        strongest_concepts=insights.mastered_concepts[:5],
        weakest_concepts=insights.weak_concepts[:5],
        developing_concepts=insights.developing_concepts[:5],
        metadata={
            "average_mastery": insights.average_mastery,
            "concept_count": insights.concept_count,
            "needs_review_count": insights.needs_review_count,
        },
    )


def learning_profile_to_dict(profile: LearningProfile) -> dict[str, Any]:
    return {
        "user_id": profile.user_id,
        "study_room_id": profile.study_room_id,
        "study_streak": profile.study_streak,
        "recent_activity_count": profile.recent_activity_count,
        "motivation_level": profile.motivation_level,
        "preferred_learning_mode": profile.preferred_learning_mode,
        "strongest_concepts": profile.strongest_concepts,
        "weakest_concepts": profile.weakest_concepts,
        "developing_concepts": profile.developing_concepts,
        "metadata": profile.metadata,
    }
