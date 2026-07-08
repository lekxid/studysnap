from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.brain.context import BrainContext
from app.services.brain.intelligence import BrainInsights


@dataclass
class BrainPriorityAction:
    type: str
    label: str
    href: str
    feature: str
    score: float
    priority: str
    reason: str
    concept: dict[str, Any] | None = None
    estimated_minutes: int = 10
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class BrainPriorityResult:
    user_id: int
    study_room_id: int | None
    best_action: BrainPriorityAction
    ranked_actions: list[BrainPriorityAction]
    context_summary: dict[str, Any] = field(default_factory=dict)


def _concept_name(concept: dict[str, Any] | None, fallback: str) -> str:
    if not concept:
        return fallback

    value = concept.get("concept_name") or concept.get("name") or fallback
    return str(value)


def _priority_from_score(score: float) -> str:
    if score >= 80:
        return "high"
    if score >= 55:
        return "medium"
    return "low"


def _clamp_score(score: float) -> float:
    return max(0.0, min(100.0, round(score, 2)))


def _context_bonus(context: BrainContext, action_type: str) -> float:
    bonus = 0.0

    if context.available_minutes <= 10:
        if action_type in {"review", "maintain"}:
            bonus += 8
        if action_type in {"deep_explain", "learn_new"}:
            bonus -= 8

    if context.available_minutes >= 25:
        if action_type in {"deep_explain", "practice"}:
            bonus += 6

    if context.motivation_level == "low":
        if action_type in {"review", "maintain"}:
            bonus += 6
        if action_type in {"deep_explain", "learn_new"}:
            bonus -= 5

    if context.motivation_level == "high":
        if action_type in {"deep_explain", "practice", "learn_new"}:
            bonus += 5

    if context.study_streak >= 3:
        bonus += 3

    if context.exam_days_remaining is not None:
        if context.exam_days_remaining <= 3:
            if action_type in {"review", "practice", "deep_explain"}:
                bonus += 12
            if action_type == "learn_new":
                bonus -= 6
        elif context.exam_days_remaining <= 7:
            if action_type in {"review", "practice"}:
                bonus += 6

    return bonus


def _make_action(
    *,
    action_type: str,
    label: str,
    href: str,
    feature: str,
    base_score: float,
    reason: str,
    context: BrainContext,
    concept: dict[str, Any] | None = None,
    estimated_minutes: int = 10,
    metadata: dict[str, Any] | None = None,
) -> BrainPriorityAction:
    score = _clamp_score(base_score + _context_bonus(context, action_type))

    return BrainPriorityAction(
        type=action_type,
        label=label,
        href=href,
        feature=feature,
        score=score,
        priority=_priority_from_score(score),
        reason=reason,
        concept=concept,
        estimated_minutes=estimated_minutes,
        metadata=metadata or {},
    )


def build_brain_priority_result(
    insights: BrainInsights,
    context: BrainContext,
) -> BrainPriorityResult:
    actions: list[BrainPriorityAction] = []

    if insights.concept_count == 0:
        action = _make_action(
            action_type="add_material",
            label="Add Learning Material",
            href="/study-rooms",
            feature="study_rooms",
            base_score=70,
            reason="StudySnap Brain needs learning material before it can personalize coaching.",
            context=context,
            estimated_minutes=min(context.available_minutes, 10),
        )
        return BrainPriorityResult(
            user_id=insights.user_id,
            study_room_id=insights.study_room_id,
            best_action=action,
            ranked_actions=[action],
            context_summary={
                "available_minutes": context.available_minutes,
                "daypart": context.daypart,
                "motivation_level": context.motivation_level,
                "study_streak": context.study_streak,
                "exam_days_remaining": context.exam_days_remaining,
            },
        )

    for concept in insights.review_queue[:5]:
        name = _concept_name(concept, "this concept")
        actions.append(
            _make_action(
                action_type="review",
                label=f"Review {name}",
                href="/flashcards",
                feature="flashcards",
                base_score=88,
                reason="This concept is ready for review and has strong learning value right now.",
                context=context,
                concept=concept,
                estimated_minutes=min(context.available_minutes, 8),
            )
        )

    for concept in insights.weak_concepts[:5]:
        name = _concept_name(concept, "your weakest concept")
        actions.append(
            _make_action(
                action_type="deep_explain",
                label=f"Ask AI Tutor about {name}",
                href="/ai-tutor",
                feature="ai_tutor",
                base_score=82,
                reason="This is a weak concept, so explanation should come before harder practice.",
                context=context,
                concept=concept,
                estimated_minutes=min(context.available_minutes, 12),
            )
        )

    for concept in insights.developing_concepts[:5]:
        name = _concept_name(concept, "your developing concept")
        actions.append(
            _make_action(
                action_type="practice",
                label=f"Practice {name}",
                href="/flashcards",
                feature="flashcards",
                base_score=68,
                reason="This concept is developing and practice can move it closer to mastery.",
                context=context,
                concept=concept,
                estimated_minutes=min(context.available_minutes, 10),
            )
        )

    for concept in insights.mastered_concepts[:3]:
        name = _concept_name(concept, "a mastered concept")
        actions.append(
            _make_action(
                action_type="maintain",
                label=f"Quick review: {name}",
                href="/flashcards",
                feature="flashcards",
                base_score=48,
                reason="This concept is strong, but a light review helps keep recall fresh.",
                context=context,
                concept=concept,
                estimated_minutes=min(context.available_minutes, 5),
            )
        )

    if not actions:
        actions.append(
            _make_action(
                action_type="continue",
                label="Continue Learning",
                href="/study-rooms",
                feature="study_rooms",
                base_score=55,
                reason="Brain Memory exists, but no clear concept priority was detected.",
                context=context,
                estimated_minutes=min(context.available_minutes, 10),
            )
        )

    ranked_actions = sorted(actions, key=lambda action: action.score, reverse=True)

    return BrainPriorityResult(
        user_id=insights.user_id,
        study_room_id=insights.study_room_id,
        best_action=ranked_actions[0],
        ranked_actions=ranked_actions,
        context_summary={
            "available_minutes": context.available_minutes,
            "daypart": context.daypart,
            "motivation_level": context.motivation_level,
            "study_streak": context.study_streak,
            "exam_days_remaining": context.exam_days_remaining,
        },
    )


def brain_priority_action_to_dict(action: BrainPriorityAction) -> dict[str, Any]:
    return {
        "type": action.type,
        "label": action.label,
        "href": action.href,
        "feature": action.feature,
        "score": action.score,
        "priority": action.priority,
        "reason": action.reason,
        "concept": action.concept,
        "estimated_minutes": action.estimated_minutes,
        "metadata": action.metadata,
    }


def brain_priority_result_to_dict(result: BrainPriorityResult) -> dict[str, Any]:
    return {
        "user_id": result.user_id,
        "study_room_id": result.study_room_id,
        "best_action": brain_priority_action_to_dict(result.best_action),
        "ranked_actions": [
            brain_priority_action_to_dict(action)
            for action in result.ranked_actions
        ],
        "context_summary": result.context_summary,
    }
