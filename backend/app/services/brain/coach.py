from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.services.brain.intelligence import BrainInsights
from app.services.brain.priority import BrainPriorityAction, BrainPriorityResult


@dataclass
class BrainCoachAction:
    type: str
    label: str
    href: str
    feature: str


@dataclass
class BrainCoachDecision:
    user_id: int
    study_room_id: int | None
    coach_message: str
    next_action: BrainCoachAction
    priority: str
    reason: str
    confidence: float
    focus_concepts: list[dict[str, Any]] = field(default_factory=list)
    estimated_minutes: int = 10
    generated_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


def _select_focus_concepts_from_priority(
    priority_result: BrainPriorityResult,
    limit: int = 5,
) -> list[dict[str, Any]]:
    concepts: list[dict[str, Any]] = []

    for action in priority_result.ranked_actions:
        if action.concept and action.concept not in concepts:
            concepts.append(action.concept)

        if len(concepts) >= limit:
            break

    return concepts


def _concept_name(action: BrainPriorityAction, fallback: str = "this concept") -> str:
    if not action.concept:
        return fallback

    value = action.concept.get("concept_name") or action.concept.get("name") or fallback
    return str(value)


def _confidence_from_score(score: float) -> float:
    if score >= 90:
        return 0.9
    if score >= 80:
        return 0.86
    if score >= 70:
        return 0.8
    if score >= 55:
        return 0.72
    return 0.65


def _coach_message_for_action(action: BrainPriorityAction) -> str:
    concept_name = _concept_name(action)

    if action.type == "add_material":
        return (
            "StudySnap Brain is ready. Add notes, PDFs, flashcards, or AI Tutor "
            "activity so it can start building your learning memory."
        )

    if action.type == "review":
        return (
            f"Your next best action is to review {concept_name}. "
            "This is the strongest review opportunity right now, and a short session can help lock it in."
        )

    if action.type == "deep_explain":
        return (
            f"Let’s strengthen {concept_name} next. "
            "It looks like one of the concepts that needs more support, so an AI Tutor explanation is the best move."
        )

    if action.type == "practice":
        return (
            f"You’re building momentum. Practice {concept_name} next to move it closer to mastery."
        )

    if action.type == "maintain":
        return (
            f"You’re doing well with {concept_name}. "
            "A quick review will help keep it fresh without taking too much time."
        )

    return "Keep going. StudySnap Brain found a useful next step to keep your learning moving."


def build_brain_coach_decision(
    insights: BrainInsights,
    priority_result: BrainPriorityResult,
) -> BrainCoachDecision:
    best_action = priority_result.best_action
    focus_concepts = _select_focus_concepts_from_priority(priority_result)

    return BrainCoachDecision(
        user_id=insights.user_id,
        study_room_id=insights.study_room_id,
        coach_message=_coach_message_for_action(best_action),
        next_action=BrainCoachAction(
            type=best_action.type,
            label=best_action.label,
            href=best_action.href,
            feature=best_action.feature,
        ),
        priority=best_action.priority,
        reason=best_action.reason,
        confidence=_confidence_from_score(best_action.score),
        focus_concepts=focus_concepts,
        estimated_minutes=best_action.estimated_minutes,
    )


def brain_coach_action_to_dict(action: BrainCoachAction) -> dict[str, Any]:
    return {
        "type": action.type,
        "label": action.label,
        "href": action.href,
        "feature": action.feature,
    }


def brain_coach_decision_to_dict(decision: BrainCoachDecision) -> dict[str, Any]:
    return {
        "user_id": decision.user_id,
        "study_room_id": decision.study_room_id,
        "coach_message": decision.coach_message,
        "next_action": brain_coach_action_to_dict(decision.next_action),
        "priority": decision.priority,
        "reason": decision.reason,
        "confidence": decision.confidence,
        "focus_concepts": decision.focus_concepts,
        "estimated_minutes": decision.estimated_minutes,
        "generated_at": decision.generated_at,
    }
