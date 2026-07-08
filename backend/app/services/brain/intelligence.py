from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.models.brain_memory import BrainMemory
from app.services.brain.repository import BrainMemoryRepository


@dataclass
class BrainConceptInsight:
    concept_id: str
    concept_name: str
    mastery_score: float
    confidence: float
    strength: str
    seen_count: int
    review_count: int
    needs_review: bool
    last_seen: datetime | None


@dataclass
class BrainInsights:
    user_id: int
    study_room_id: int | None
    concept_count: int
    average_mastery: float
    mastered_count: int
    developing_count: int
    weak_count: int
    needs_review_count: int
    mastered_concepts: list[dict[str, Any]]
    developing_concepts: list[dict[str, Any]]
    weak_concepts: list[dict[str, Any]]
    review_queue: list[dict[str, Any]]


def brain_memory_to_insight(memory: BrainMemory) -> BrainConceptInsight:
    return BrainConceptInsight(
        concept_id=memory.concept_id,
        concept_name=memory.concept_name,
        mastery_score=round(float(memory.mastery_score or 0.0), 2),
        confidence=round(float(memory.confidence or 0.0), 2),
        strength=memory.strength or "weak",
        seen_count=memory.seen_count or 0,
        review_count=memory.review_count or 0,
        needs_review=bool(memory.needs_review),
        last_seen=memory.last_seen,
    )


def concept_insight_to_dict(insight: BrainConceptInsight) -> dict[str, Any]:
    return {
        "concept_id": insight.concept_id,
        "concept_name": insight.concept_name,
        "mastery_score": insight.mastery_score,
        "confidence": insight.confidence,
        "strength": insight.strength,
        "seen_count": insight.seen_count,
        "review_count": insight.review_count,
        "needs_review": insight.needs_review,
        "last_seen": insight.last_seen,
    }


def sort_by_low_mastery(insights: list[BrainConceptInsight]) -> list[BrainConceptInsight]:
    return sorted(
        insights,
        key=lambda item: (
            item.mastery_score,
            -int(item.needs_review),
            item.seen_count,
            item.concept_name.lower(),
        ),
    )


def sort_by_high_mastery(insights: list[BrainConceptInsight]) -> list[BrainConceptInsight]:
    return sorted(
        insights,
        key=lambda item: (
            -item.mastery_score,
            -item.seen_count,
            item.concept_name.lower(),
        ),
    )


def build_review_queue(
    insights: list[BrainConceptInsight],
    limit: int = 10,
) -> list[dict[str, Any]]:
    review_candidates = [
        insight
        for insight in insights
        if insight.needs_review or insight.mastery_score < 0.75
    ]

    return [
        concept_insight_to_dict(insight)
        for insight in sort_by_low_mastery(review_candidates)[:limit]
    ]


def build_brain_insights(
    repository: BrainMemoryRepository,
    user_id: int,
    study_room_id: int | None = None,
) -> BrainInsights:
    memories = repository.list_for_user(user_id=user_id)

    if study_room_id is not None:
        memories = [
            memory
            for memory in memories
            if memory.study_room_id == study_room_id
        ]

    concept_insights = [
        brain_memory_to_insight(memory)
        for memory in memories
    ]

    concept_count = len(concept_insights)

    average_mastery = 0.0
    if concept_count:
        average_mastery = round(
            sum(item.mastery_score for item in concept_insights) / concept_count,
            2,
        )

    mastered = [
        item
        for item in concept_insights
        if item.mastery_score >= 0.8
    ]

    developing = [
        item
        for item in concept_insights
        if 0.55 <= item.mastery_score < 0.8
    ]

    weak = [
        item
        for item in concept_insights
        if item.mastery_score < 0.55
    ]

    needs_review_count = len(
        [
            item
            for item in concept_insights
            if item.needs_review or item.mastery_score < 0.75
        ]
    )

    return BrainInsights(
        user_id=user_id,
        study_room_id=study_room_id,
        concept_count=concept_count,
        average_mastery=average_mastery,
        mastered_count=len(mastered),
        developing_count=len(developing),
        weak_count=len(weak),
        needs_review_count=needs_review_count,
        mastered_concepts=[
            concept_insight_to_dict(item)
            for item in sort_by_high_mastery(mastered)[:10]
        ],
        developing_concepts=[
            concept_insight_to_dict(item)
            for item in sort_by_high_mastery(developing)[:10]
        ],
        weak_concepts=[
            concept_insight_to_dict(item)
            for item in sort_by_low_mastery(weak)[:10]
        ],
        review_queue=build_review_queue(concept_insights),
    )


def brain_insights_to_dict(insights: BrainInsights) -> dict[str, Any]:
    return {
        "user_id": insights.user_id,
        "study_room_id": insights.study_room_id,
        "concept_count": insights.concept_count,
        "average_mastery": insights.average_mastery,
        "mastered_count": insights.mastered_count,
        "developing_count": insights.developing_count,
        "weak_count": insights.weak_count,
        "needs_review_count": insights.needs_review_count,
        "mastered_concepts": insights.mastered_concepts,
        "developing_concepts": insights.developing_concepts,
        "weak_concepts": insights.weak_concepts,
        "review_queue": insights.review_queue,
    }
