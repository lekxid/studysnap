from __future__ import annotations

from collections import defaultdict
from typing import Any


def memory_strength_label(confidence: float) -> str:
    """
    Convert confidence score into a simple learning strength label.
    """

    if confidence >= 0.8:
        return "strong"

    if confidence >= 0.55:
        return "developing"

    return "weak"


def calculate_concept_confidence(
    concept_count: int,
    relationship_count: int,
    analysis_confidence: float,
) -> float:
    """
    Estimate concept confidence using lightweight rule-based signals.
    """

    base = analysis_confidence or 0.0

    if concept_count >= 8:
        base += 0.08
    elif concept_count >= 4:
        base += 0.04

    if relationship_count >= 5:
        base += 0.05

    return round(min(base, 0.95), 2)


def build_concept_memory(
    brain_objects: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Build temporary concept memory objects from BrainAnalysis.

    This does not write to the database yet.
    It creates the shape that future persistent memory will use.
    """

    concepts = brain_objects.get("concepts", [])
    relationships = brain_objects.get("relationships", [])
    analysis_confidence = brain_objects.get("confidence", 0.0)

    relationship_count_by_concept = defaultdict(int)

    for relationship in relationships:
        relationship_count_by_concept[relationship.get("source")] += 1
        relationship_count_by_concept[relationship.get("target")] += 1

    memory_items = []

    for concept in concepts:
        concept_id = concept.get("id")
        relationship_count = relationship_count_by_concept[concept_id]

        confidence = calculate_concept_confidence(
            concept_count=len(concepts),
            relationship_count=relationship_count,
            analysis_confidence=analysis_confidence,
        )

        memory_items.append(
            {
                "concept_id": concept_id,
                "name": concept.get("name"),
                "type": concept.get("type", "concept"),
                "source": concept.get("source", "rule_based"),
                "confidence": confidence,
                "strength": memory_strength_label(confidence),
                "seen_count": 1,
                "relationship_count": relationship_count,
                "needs_review": confidence < 0.65,
            }
        )

    return memory_items


def build_learning_memory_snapshot(
    event: dict[str, Any],
    brain_objects: dict[str, Any],
) -> dict[str, Any]:
    """
    Build a memory snapshot for one Brain pipeline run.

    Later this will merge into persistent user memory.
    """

    concept_memory = build_concept_memory(brain_objects)

    weak_topics = [
        item["name"]
        for item in concept_memory
        if item["strength"] == "weak"
    ]

    strong_topics = [
        item["name"]
        for item in concept_memory
        if item["strength"] == "strong"
    ]

    return {
        "event_type": event.get("type"),
        "user_id": event.get("user_id"),
        "study_room_id": event.get("study_room_id"),
        "concepts": concept_memory,
        "weak_topics": weak_topics,
        "strong_topics": strong_topics,
        "concept_count": len(concept_memory),
        "has_memory": bool(concept_memory),
    }
